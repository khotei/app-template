import {
  Array as Arr,
  Data,
  Duration,
  Effect,
  Function as Fn,
  Layer,
  MutableRef,
  Option,
  pipe,
  Schedule,
  Schema,
  String as Str,
  UndefinedOr,
} from 'effect'
import { type AiError, Prompt, Response, Telemetry } from 'effect/ai'

import {
  Assistant,
  type AssistantError,
  AssistantFailedError,
  AssistantRefusedError,
  AssistantReply,
  type AttachmentBytes,
  buildChatTitle,
  type HistoryMessage,
  isBlank,
  maxTitleLength,
} from '@app-template/domain/chat'

import { AssistantModels } from '#infrastructure/chat/assistant.client'

const toFilePart = ({ attachment, bytes }: AttachmentBytes): Prompt.FilePartEncoded => ({
  type: 'file',
  mediaType: attachment.mediaType,
  fileName: attachment.fileName,
  data: bytes,
})

// Providers reject an empty text block, so a message sent with attachments only has no text part.
const toTextParts = (text: string): ReadonlyArray<Prompt.TextPartEncoded> =>
  Str.isNonEmpty(text) ? [{ type: 'text', text }] : []

// Fixed for every request: a date or user data here would break the cached prefix.
const systemPrompt = [
  'You are the assistant of a chat app. Answer the last user message, using the whole conversation and every attached file as context.',
  'Reply in the language of the last user message.',
  'Be accurate and direct. When you do not know something or cannot help, say so plainly instead of guessing.',
].join('\n')

// On the key: `annotate` would land on the field's check, which the JSON Schema leaves out.
const ReplyAnswer = Schema.Struct({
  text: AssistantReply.fields.text.annotateKey({
    description: 'The reply the user reads, as plain text.',
  }),
})

const toMessage = ({ message, attachments }: HistoryMessage): Prompt.MessageEncoded => ({
  role: message.author,
  content: pipe(toTextParts(message.text), Arr.appendAll(Arr.map(attachments, toFilePart))),
})

const buildChatPrompt = (history: ReadonlyArray<HistoryMessage>): Prompt.Prompt =>
  pipe(
    history,
    Arr.map(toMessage),
    Arr.prepend<Prompt.MessageEncoded>({ role: 'system', content: systemPrompt }),
    Prompt.make,
  )

const titleInstruction =
  `Write a title of at most ${maxTitleLength} characters for a chat that opens with the next message. Answer with the title alone.` as const

const buildTitlePrompt = (text: string): Prompt.Prompt =>
  Prompt.make([
    { role: 'system', content: titleInstruction },
    { role: 'user', content: [{ type: 'text', text }] },
  ])

const EarlyFinish = Response.FinishReason.pick(['content-filter', 'length'])

type EarlyFinish = typeof EarlyFinish.Type

const isEarlyFinish = Schema.is(EarlyFinish)

/**
 * The model stopped before a whole answer, whether its text decoded or not; it never leaves
 * this module.
 *
 * It answers `isRetryable` and `retryAfter` as `AiError` does, so one predicate and one delay
 * read every failure of a request.
 */
class EarlyFinishError extends Data.TaggedError('EarlyFinishError')<{
  readonly reason: EarlyFinish
}> {
  get isRetryable(): boolean {
    return this.reason === 'length'
  }

  get retryAfter(): Duration.Duration | undefined {
    return undefined
  }

  override get message(): string {
    return `The model stopped with finish reason ${this.reason}`
  }
}

type RequestError = AiError.AiError | EarlyFinishError

/** Fails a request whose model stopped early, read from its finish part, decoded or not. */
const failOnEarlyFinish = Effect.fnUntraced(function* <A>(
  request: Effect.Effect<A, AiError.AiError>,
) {
  const earlyFinish = MutableRef.make(Option.none<EarlyFinish>())
  // `generateObject` hands every response part to the span transformer before it decodes,
  // and `StructuredOutputError` carries no finish reason, so this hook is where a refusal shows.
  const keepEarlyFinish: Telemetry.SpanTransformer = ({ response }) => {
    const reason = Arr.findFirst(response, (part) =>
      part.type === 'finish' && isEarlyFinish(part.reason)
        ? Option.some(part.reason)
        : Option.none(),
    )
    MutableRef.set(earlyFinish, reason)
  }

  const answer = yield* request.pipe(
    Effect.provideService(Telemetry.CurrentSpanTransformer, keepEarlyFinish),
    Effect.result,
  )

  const stopped = MutableRef.get(earlyFinish)
  if (Option.isSome(stopped)) return yield* new EarlyFinishError({ reason: stopped.value })
  return yield* Effect.fromResult(answer)
})

const longestRetryAfter = Duration.seconds(30)

const retryAfterOf = ({ retryAfter }: RequestError): Duration.Duration =>
  UndefinedOr.match(retryAfter, { onUndefined: () => Duration.zero, onDefined: Fn.identity })

const isWorthRetrying = (error: RequestError): boolean =>
  error.isRetryable && Duration.isLessThanOrEqualTo(retryAfterOf(error), longestRetryAfter)

/** Three requests at most, 1 s then 2 s apart, each wait at least the provider's `retryAfter`. */
const replySchedule = Schedule.exponential('1 second').pipe(
  Schedule.upTo({ times: 2 }),
  Schedule.setInputType<RequestError>(),
  Schedule.modifyDelay(({ input, duration }) =>
    Effect.succeed(Duration.max(duration, retryAfterOf(input))),
  ),
)

const toAssistantError = (error: RequestError): AssistantError =>
  error._tag === 'EarlyFinishError' && error.reason === 'content-filter'
    ? new AssistantRefusedError({ cause: error.message })
    : new AssistantFailedError({ cause: error.message })

export const AssistantLlm: Layer.Layer<Assistant, never, AssistantModels> = Layer.effect(
  Assistant,
  AssistantModels.useSync((models) =>
    Assistant.of({
      reply: Effect.fn('Assistant.reply')(function* (history) {
        const response = yield* models.reply
          .generateObject({ prompt: buildChatPrompt(history), schema: ReplyAnswer })
          .pipe(
            failOnEarlyFinish,
            Effect.retry({ schedule: replySchedule, while: isWorthRetrying }),
            Effect.mapError(toAssistantError),
          )
        return new AssistantReply(response.value)
      }),
      suggestTitle: Effect.fn('Assistant.suggestTitle')(function* (text) {
        if (isBlank(text)) return Option.none()
        const response = yield* models.title.generateText({ prompt: buildTitlePrompt(text) })
        return buildChatTitle(response.text)
      }, Effect.orDie),
    }),
  ),
)

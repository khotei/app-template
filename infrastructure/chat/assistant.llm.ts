import {
  Array as Arr,
  type Config,
  Context,
  Crypto,
  Duration,
  Effect,
  Function as Fn,
  Layer,
  MutableRef,
  Option,
  pipe,
  Schedule,
  Schema,
  SchemaTransformation,
  String as Str,
  UndefinedOr,
} from 'effect'
import { AiError, Prompt, Response, Telemetry } from 'effect/ai'
import { Hex } from 'effect/encoding'

import { ReplyModelConfig } from '@app-template/config'
import {
  Assistant,
  type AssistantError,
  AssistantFailedError,
  AssistantRefusedError,
  AssistantReply,
  type AttachmentBytes,
  ChatTitle,
  type HistoryMessage,
  isBlank,
  maxTitleLength,
} from '@app-template/domain/chat'

import { AssistantModels } from '#infrastructure/chat/assistant.client'
import { ReplyProvenance } from '#infrastructure/chat/chat.queue'

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

const titleInstruction = 'Write a title for a chat that opens with the next message.' as const

// The JSON Schema is the encoded side's, so the description sits on the `String` that is trimmed
// into a `ChatTitle`: on `Schema.Trim`, its own `expected` text would replace it.
const TitleAnswer = Schema.Struct({
  title: Schema.String.annotate({
    description: `The title of the chat, in the language of its opening message, at most ${maxTitleLength} characters.`,
  }).pipe(Schema.decodeTo(ChatTitle, SchemaTransformation.trim())),
})

const buildTitlePrompt = (text: string): Prompt.Prompt =>
  Prompt.make([
    { role: 'system', content: titleInstruction },
    { role: 'user', content: [{ type: 'text', text }] },
  ])

const EarlyFinish = Response.FinishReason.pick(['content-filter', 'length'])

type EarlyFinish = typeof EarlyFinish.Type

const isEarlyFinish = Schema.is(EarlyFinish)

const earlyFinishReasons = {
  'content-filter': AiError.ContentPolicyError,
  length: AiError.InvalidOutputError,
} as const satisfies Record<
  EarlyFinish,
  new (props: {
    readonly description: string
  }) => AiError.AiErrorReason
>

/** Fails a request whose model refused or was cut, read from its finish part, decoded or not. */
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
  if (Option.isSome(stopped)) {
    return yield* AiError.make({
      module: 'AssistantLlm',
      method: 'generateObject',
      reason: new earlyFinishReasons[stopped.value]({
        description: `The model stopped with finish reason ${stopped.value}`,
      }),
    })
  }
  return yield* Effect.fromResult(answer)
})

const longestRetryAfter = Duration.seconds(30)

const retryAfterOf = ({ retryAfter }: AiError.AiError): Duration.Duration =>
  UndefinedOr.match(retryAfter, { onUndefined: () => Duration.zero, onDefined: Fn.identity })

const isWorthRetrying = (error: AiError.AiError): boolean =>
  error.isRetryable && Duration.isLessThanOrEqualTo(retryAfterOf(error), longestRetryAfter)

const toAssistantError = (error: AiError.AiError): AssistantError =>
  error.reason._tag === 'ContentPolicyError'
    ? new AssistantRefusedError({ cause: error.message })
    : new AssistantFailedError({ cause: error.message })

/** `retries` more requests, 1, 2, 4 … s apart, each wait at least the provider's `retryAfter`. */
const retrySchedule = (retries: number): Schedule.Schedule<Duration.Duration, AiError.AiError> =>
  Schedule.exponential('1 second').pipe(
    Schedule.upTo({ times: retries }),
    Schedule.setInputType<AiError.AiError>(),
    Schedule.modifyDelay(({ input, duration }) =>
      Effect.succeed(Duration.max(duration, retryAfterOf(input))),
    ),
  )

/** Asks again up to `retries` times while a retry can help, then fails as the port's error. */
const askWithin =
  (retries: number) =>
  <A>(request: Effect.Effect<A, AiError.AiError>): Effect.Effect<A, AssistantError> =>
    request.pipe(
      failOnEarlyFinish,
      Effect.retry({ schedule: retrySchedule(retries), while: isWorthRetrying }),
      Effect.mapError(toAssistantError),
    )

const encoder = new TextEncoder()

/**
 * Hashes the system prompt with the JSON Schema document the model reads, so it moves exactly when
 * what is sent does.
 */
export const generateInstructionsHash = (
  systemPrompt: string,
  schema: Schema.Top,
): Effect.Effect<string, never, Crypto.Crypto> => {
  const instructions = `${systemPrompt}\n${JSON.stringify(Schema.toJsonSchemaDocument(schema))}`
  return Crypto.Crypto.use((crypto) => crypto.digest('SHA-256', encoder.encode(instructions))).pipe(
    Effect.map(Hex.encode),
    Effect.orDie,
  )
}

/** The provenance of every reply this process queues, fixed when its layer is built. */
export class CurrentReplyProvenance extends Context.Service<
  CurrentReplyProvenance,
  ReplyProvenance
>()('@app-template/infrastructure/chat/CurrentReplyProvenance') {
  static readonly layerFromConfig: Layer.Layer<
    CurrentReplyProvenance,
    Config.ConfigError,
    Crypto.Crypto
  > = Layer.effect(
    this,
    Effect.gen(function* () {
      const { provider, replyModel } = yield* ReplyModelConfig
      const instructionsHash = yield* generateInstructionsHash(systemPrompt, ReplyAnswer)

      return new ReplyProvenance({ provider, model: replyModel, instructionsHash })
    }),
  ).pipe(Layer.provide(ReplyModelConfig.layer))
}

export const AssistantLlm: Layer.Layer<Assistant, never, AssistantModels> = Layer.effect(
  Assistant,
  AssistantModels.useSync((models) =>
    Assistant.of({
      reply: Effect.fn('Assistant.reply')(function* (history) {
        const response = yield* models.reply
          .generateObject({ prompt: buildChatPrompt(history), schema: ReplyAnswer })
          .pipe(askWithin(2))
        return new AssistantReply(response.value)
      }),
      suggestTitle: Effect.fn('Assistant.suggestTitle')(function* (text) {
        if (isBlank(text)) return Option.none()
        const response = yield* models.title
          .generateObject({ prompt: buildTitlePrompt(text), schema: TitleAnswer })
          .pipe(askWithin(4))
        return Option.some(response.value.title)
      }),
    }),
  ),
)

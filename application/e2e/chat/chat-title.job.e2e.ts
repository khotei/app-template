import { BunCrypto } from '@effect/platform-bun'
import { assert, describe, it } from '@effect/vitest'
import { assertEquals } from '@effect/vitest/utils'
import { Effect, Exit, Fiber, Layer, Option } from 'effect'
import { AiError, Prompt, type Response } from 'effect/ai'

import {
  buildUserMessage,
  Chat,
  ChatRepository,
  ChatService,
  ChatTitle,
  MessageRepository,
  maxTitleLength,
} from '@app-template/domain/chat'
import { chat, chatId, epoch, messageId } from '@app-template/domain/testing'
import { AttachmentRepositoryPg } from '@app-template/infrastructure/attachment'
import { AssistantLlm, ChatPg, GenerateChatTitle } from '@app-template/infrastructure/chat'
import { recordLogs } from '@app-template/testing'

import { ChatTitleJob } from '#application/chat/chat-title.job'
import { selectChat } from '#application/testing/chat.test-layer'
import { DbWithUsersTest } from '#application/testing/db.test-layer'
import {
  holdModelCall,
  type ModelCallHold,
  recordLanguageModel,
} from '#application/testing/language-model.test-fake'

type Answer = Effect.Effect<Array<Response.PartEncoded>, AiError.AiError>

/** The job's services on a fresh test database, recording its prompts and its logs. */
const makeChatTitleHarness = (answer: Answer) => {
  const { prompts, layer: model } = recordLanguageModel({ generateText: answer })
  const { logs, layer: logger } = recordLogs()
  const assistant = AssistantLlm.pipe(Layer.provide(model))
  const layer = Layer.mergeAll(ChatService.layer, assistant, logger).pipe(
    Layer.provideMerge(Layer.merge(ChatPg, AttachmentRepositoryPg)),
    Layer.provide([DbWithUsersTest, BunCrypto.layer]),
  )
  return { prompts, logs, layer }
}

const answering = (text: string): Answer => Effect.succeed([{ type: 'text', text }])

const arrangeChat = (text = 'Plan a weekend in Lisbon') =>
  Effect.gen(function* () {
    const first = buildUserMessage({
      id: messageId,
      chatId,
      text,
      createdAt: epoch,
    })
    yield* (yield* ChatRepository).insert(chat)
    yield* (yield* MessageRepository).insert(first)
    return first
  })

const queuedJob = new GenerateChatTitle({ chatId, messageId })

const runTitle = Effect.exit(ChatTitleJob.handle(queuedJob))

// A change made once the model is asked lands between the take and the write.
const heldAnswer = (held: ModelCallHold) => Effect.andThen(held.hold, answering('Lisbon weekend'))

const moments = [
  {
    name: 'before the take',
    modelCallsAfterDelete: 0,
    run: <R>(held: ModelCallHold, change: Effect.Effect<void, never, R>) =>
      change.pipe(Effect.andThen(held.release), Effect.andThen(runTitle)),
  },
  {
    name: 'while the model answers',
    modelCallsAfterDelete: 1,
    run: <R>(held: ModelCallHold, change: Effect.Effect<void, never, R>) =>
      Effect.gen(function* () {
        const running = yield* Effect.forkChild(runTitle)
        yield* held.asked
        yield* change
        yield* held.release
        yield* Fiber.join(running)
      }),
  },
] as const

const filler = (length: number) => 'A'.repeat(length)

const providerError = AiError.make({
  module: 'FakeProvider',
  method: 'generateText',
  reason: new AiError.UnknownError({ description: 'provider exploded' }),
})

const untitledOpenings = [
  {
    name: 'a first message without text',
    text: '',
    answer: answering('Lisbon weekend'),
    modelCalls: 0,
  },
  {
    name: 'a whitespace-only first message',
    text: ' \n ',
    answer: answering('Lisbon weekend'),
    modelCalls: 0,
  },
  {
    name: 'a blank answer',
    text: 'Plan a weekend in Lisbon',
    answer: answering(' \n '),
    modelCalls: 1,
  },
] as const

const renameChat = Effect.flatMap(ChatRepository, (chats) =>
  Effect.asVoid(chats.update({ title: Option.some(ChatTitle.make('Trip')) }, { id: chatId })),
)

const deleteChat = Effect.flatMap(ChatRepository, (chats) => chats.delete(chatId))

describe('ChatTitleJob.handle', () => {
  it.effect('titles the chat with the model text, trimmed and cut to the title limit', () => {
    const { prompts, layer } = makeChatTitleHarness(
      answering(`  ${filler(maxTitleLength - 1)} and more\n`),
    )
    return Effect.gen(function* () {
      yield* arrangeChat()

      yield* runTitle

      assertEquals(
        yield* selectChat(chatId),
        Option.some(
          new Chat({ ...chat, title: Option.some(ChatTitle.make(filler(maxTitleLength - 1))) }),
        ),
      )
      const [prompt] = prompts
      const expected = Prompt.make([
        { role: 'user', content: [{ type: 'text', text: 'Plan a weekend in Lisbon' }] },
      ])
      assert.deepStrictEqual(prompt?.content.at(-1), expected.content[0])
    }).pipe(Effect.provide(layer))
  })

  it.live('keeps the chat updatedAt when it writes the title', () => {
    const { layer } = makeChatTitleHarness(answering('Lisbon weekend'))
    return Effect.gen(function* () {
      yield* arrangeChat()

      yield* runTitle

      assertEquals(
        yield* selectChat(chatId),
        Option.some(new Chat({ ...chat, title: Option.some(ChatTitle.make('Lisbon weekend')) })),
      )
    }).pipe(Effect.provide(layer))
  })

  it.effect.each(moments)('keeps a title the user set $name', ({ run }) => {
    const held = holdModelCall()
    const { prompts, logs, layer } = makeChatTitleHarness(heldAnswer(held))
    return Effect.gen(function* () {
      yield* arrangeChat()

      yield* run(held, renameChat)

      assertEquals(
        yield* selectChat(chatId),
        Option.some(new Chat({ ...chat, title: Option.some(ChatTitle.make('Trip')) })),
      )
      assert.strictEqual(prompts.length, 1)
      assert.deepStrictEqual(logs, [['Info', 'chat title skipped: already titled']])
    }).pipe(Effect.provide(layer))
  })

  it.effect.each(moments)(
    'ends with a log line when the chat is deleted $name',
    ({ run, modelCallsAfterDelete }) => {
      const held = holdModelCall()
      const { prompts, logs, layer } = makeChatTitleHarness(heldAnswer(held))
      return Effect.gen(function* () {
        yield* arrangeChat()

        yield* run(held, deleteChat)

        assert.strictEqual(prompts.length, modelCallsAfterDelete)
        assert.deepStrictEqual(logs, [['Info', 'chat title skipped: chat deleted']])
      }).pipe(Effect.provide(layer))
    },
  )

  it.live('dies and leaves the chat untouched when the model fails', () => {
    const { logs, layer } = makeChatTitleHarness(Effect.fail(providerError))
    return Effect.gen(function* () {
      yield* arrangeChat()

      const exit = yield* runTitle

      assert.isTrue(Exit.hasDies(exit))
      assertEquals(yield* selectChat(chatId), Option.some(chat))
      assert.deepStrictEqual(logs, [])
    }).pipe(Effect.provide(layer))
  })

  it.live.each(untitledOpenings)(
    'leaves the chat untouched after $name',
    ({ text, answer, modelCalls }) => {
      const { prompts, logs, layer } = makeChatTitleHarness(answer)
      return Effect.gen(function* () {
        yield* arrangeChat(text)

        yield* runTitle

        assertEquals(yield* selectChat(chatId), Option.some(chat))
        assert.strictEqual(prompts.length, modelCalls)
        assert.deepStrictEqual(logs, [['Info', 'chat title skipped: nothing to title']])
      }).pipe(Effect.provide(layer))
    },
  )
})

describe('ChatTitleJob.handleDeadLettered', () => {
  it.effect('logs the job at Error', () => {
    const { logs, layer } = recordLogs()
    return Effect.gen(function* () {
      yield* ChatTitleJob.handleDeadLettered()

      assert.deepStrictEqual(logs, [['Error', 'chat title dead-lettered']])
    }).pipe(Effect.provide(layer))
  })
})

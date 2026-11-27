import { assert, describe, it } from '@effect/vitest'
import { assertEquals } from '@effect/vitest/utils'
import { Array as Arr, Effect, Exit, Fiber, Option } from 'effect'

import {
  Chat,
  ChatInitialized,
  ChatTitle,
  Message,
  Run,
  UserMessageCreated,
} from '@app-template/application/chat'
import {
  chat,
  chatId,
  firstMessage,
  holdCall,
  layerChatTest,
  owner,
  queuedRun,
  recordChatAssistant,
} from '@app-template/application/chat/testing'
import type { RunEntitySet } from '@app-template/kernel/data'
import { LlmError } from '@app-template/kernel/llm/model'
import { SchemaCodec } from '@app-template/packages/schema'
import { recordLogs } from '@app-template/packages/testing'

import { replyToMessage, titleChat } from '#worker/chat/chat.handler'

const reply = replyToMessage(
  new UserMessageCreated({
    messageId: queuedRun.userMessageId,
    chatId: queuedRun.chatId,
    userId: queuedRun.userId,
  }),
)

const readRun = (run: Run) => () => SchemaCodec.encode(Run)(run).pipe(Effect.map(Option.some))

const readChat = () => SchemaCodec.encode(Chat)(chat).pipe(Effect.map(Option.some))

const generating = new Run({ ...queuedRun, status: 'generating' })

/** Each log line as its level and message. */
const levels = (logs: ReadonlyArray<ReadonlyArray<unknown>>) =>
  Arr.map(logs, (line) => Arr.take(line, 2))

describe('replyToMessage', () => {
  it.effect(
    'reply ends on LlmError after one call with a warning, the Run failed with its text and no reply written',
    () => {
      const error = new LlmError({ cause: '401 invalid x-api-key' })
      const assistant = recordChatAssistant({ reply: Effect.fail(error) })
      const { logs, layer: logger } = recordLogs()
      const updates: Array<RunEntitySet> = []
      return Effect.gen(function* () {
        yield* reply

        assert.deepStrictEqual(
          Arr.map(updates, ({ status }) => status),
          ['generating', 'failed'],
        )
        assert.include(updates.at(-1)?.failure?.cause, error.cause)
        assert.strictEqual((yield* assistant.contexts).length, 1)
        assert.deepStrictEqual(levels(logs), [['Warn', 'reply failed']])
        assert.strictEqual(logs[0]?.[2], error)
      }).pipe(
        Effect.provide([
          layerChatTest(
            {
              runs: {
                selectOne: readRun(queuedRun),
                update: (set) =>
                  Effect.sync(() => {
                    updates.push(set)
                  }),
              },
              // No `insert`: a reply written would die on it.
              chats: { selectOne: readChat },
              messages: {
                selectMany: () => Effect.all([SchemaCodec.encode(Message)(firstMessage)]),
              },
            },
            { assistant: assistant.layer },
          ),
          logger,
        ]),
      )
    },
  )

  it.effect(
    "reply on the assistant's error dies, logging nothing, when its Run goes meanwhile",
    () => {
      const refused = new LlmError({ cause: 'stop_reason refusal' })
      const { logs, layer: logger } = recordLogs()
      return Effect.gen(function* () {
        const exit = yield* reply.pipe(Effect.exit)

        assert.isTrue(Exit.hasDies(exit))
        assert.deepStrictEqual(logs, [])
      }).pipe(
        Effect.provide([
          layerChatTest(
            {
              runs: {
                selectOne: readRun(queuedRun),
                // The Run is gone once started, so the guarded failed write touches no row.
                update: (set) =>
                  set.status === 'failed' ? Effect.die('no run was updated') : Effect.void,
              },
              chats: { selectOne: readChat },
              messages: {
                selectMany: () => Effect.all([SchemaCodec.encode(Message)(firstMessage)]),
              },
            },
            { assistant: recordChatAssistant({ reply: Effect.fail(refused) }).layer },
          ),
          logger,
        ]),
      )
    },
  )

  it.effect("reply skips a message with no active Run, logged under the event's ids", () => {
    const assistant = recordChatAssistant({ reply: Effect.never })
    const { logs, layer: logger } = recordLogs('messageId', 'chatId', 'userId')
    return Effect.gen(function* () {
      yield* reply

      assertEquals(yield* assistant.contexts, [])
      assert.deepStrictEqual(logs, [
        [
          'Info',
          "reply skipped: no active Run for the event's message, chat and user",
          queuedRun.userMessageId,
          chatId,
          owner,
        ],
      ])
    }).pipe(
      Effect.provide([
        layerChatTest(
          { runs: { selectOne: () => Effect.succeedNone } },
          { assistant: assistant.layer },
        ),
        logger,
      ]),
    )
  })

  it.effect('reply fails a Run a dead worker left started, with a warning, unasked', () => {
    const assistant = recordChatAssistant({ reply: Effect.never })
    const { logs, layer: logger } = recordLogs()
    const updates: Array<RunEntitySet> = []
    return Effect.gen(function* () {
      yield* reply

      assert.deepStrictEqual(
        Arr.map(updates, ({ status }) => status),
        ['failed'],
      )
      assert.include(
        updates.at(-1)?.failure?.cause,
        'the worker that started the Run stopped before it ended',
      )
      assertEquals(yield* assistant.contexts, [])
      assert.deepStrictEqual(levels(logs), [['Warn', 'reply failed']])
      assert.propertyVal(logs[0]?.[2], '_tag', 'RunStartedError')
    }).pipe(
      Effect.provide([
        layerChatTest(
          {
            runs: {
              selectOne: readRun(generating),
              update: (set) =>
                Effect.sync(() => {
                  updates.push(set)
                }),
            },
          },
          { assistant: assistant.layer },
        ),
        logger,
      ]),
    )
  })

  it.effect('reply dies, logging nothing, on a started Run settled before it fails it', () => {
    const { logs, layer: logger } = recordLogs()
    return Effect.gen(function* () {
      const exit = yield* reply.pipe(Effect.exit)

      assert.isTrue(Exit.hasDies(exit))
      assert.deepStrictEqual(logs, [])
    }).pipe(
      Effect.provide([
        layerChatTest(
          {
            runs: {
              selectOne: readRun(generating),
              update: () => Effect.die('no run was updated'),
            },
          },
          { assistant: recordChatAssistant({ reply: Effect.never }).layer },
        ),
        logger,
      ]),
    )
  })

  it.effect('reply interrupted while the assistant answers warns once, with the interrupt', () => {
    const held = holdCall()
    const assistant = recordChatAssistant({ reply: held.hold.pipe(Effect.andThen(Effect.never)) })
    const { logs, layer: logger } = recordLogs()
    return Effect.gen(function* () {
      const running = yield* Effect.forkChild(reply)
      yield* held.reached
      yield* Fiber.interrupt(running)

      assert.deepStrictEqual(logs, [['Warn', 'reply failed']])
    }).pipe(
      Effect.provide([
        layerChatTest(
          {
            runs: { selectOne: readRun(queuedRun), update: () => Effect.void },
            chats: { selectOne: readChat },
            messages: { selectMany: () => Effect.all([SchemaCodec.encode(Message)(firstMessage)]) },
          },
          { assistant: assistant.layer },
        ),
        logger,
      ]),
    )
  })
})

/** A message read that finds `firstMessage`. */
const selectsFirstMessage = () =>
  SchemaCodec.encode(Message)(firstMessage).pipe(Effect.map(Option.some))

const lisbonWeekend = ChatTitle.make('Lisbon weekend')

const chatInitialized = new ChatInitialized({ messageId: firstMessage.id, chatId, userId: owner })

const title = titleChat(chatInitialized)

describe('titleChat', () => {
  it.effect('skips a chat the store finds titled or gone by the rename, and logs it', () => {
    const assistant = recordChatAssistant({ title: Effect.succeed(lisbonWeekend) })
    const { logs, layer: logger } = recordLogs()
    return Effect.gen(function* () {
      yield* title

      assert.deepStrictEqual(logs, [['Info', 'title skipped: chat deleted or titled']])
    }).pipe(
      Effect.provide([
        layerChatTest(
          {
            messages: { selectOne: selectsFirstMessage },
            chats: { selectOne: () => Effect.succeedNone },
          },
          { assistant: assistant.layer },
        ),
        logger,
      ]),
    )
  })

  it.effect('skips a message the store finds none of, without asking, and logs it', () => {
    const assistant = recordChatAssistant({ title: Effect.succeed(lisbonWeekend) })
    const { logs, layer: logger } = recordLogs()
    return Effect.gen(function* () {
      yield* title

      assertEquals(yield* assistant.texts, [])
      assert.deepStrictEqual(logs, [['Info', 'title skipped: message not found']])
    }).pipe(
      Effect.provide([
        layerChatTest(
          { messages: { selectOne: () => Effect.succeedNone } },
          { assistant: assistant.layer },
        ),
        logger,
      ]),
    )
  })

  it.effect("leaves the chat untitled and logs the LlmError with the event's ids", () => {
    const error = new LlmError({ cause: '529 overloaded' })
    const assistant = recordChatAssistant({ title: Effect.fail(error) })
    const { logs, layer: logger } = recordLogs('messageId', 'chatId', 'userId')
    return Effect.gen(function* () {
      yield* title

      assert.deepStrictEqual(logs, [
        ['Warn', 'title skipped: the assistant failed', firstMessage.id, chatId, owner, error],
      ])
    }).pipe(
      Effect.provide([
        layerChatTest(
          { messages: { selectOne: selectsFirstMessage } },
          { assistant: assistant.layer },
        ),
        logger,
      ]),
    )
  })
})

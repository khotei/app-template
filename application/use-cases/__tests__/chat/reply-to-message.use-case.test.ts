import { assert, describe, it } from '@effect/vitest'
import { assertEquals } from '@effect/vitest/utils'
import { Array as Arr, Effect, Exit, Fiber, Option } from 'effect'

import { Message, ReplyToMessage, Run } from '@app-template/application/chat'
import {
  firstMessage,
  holdCall,
  layerChatTest,
  queuedRun,
  recordMessageAssistant,
} from '@app-template/application/chat/testing'
import type { RunEntitySet } from '@app-template/kernel/data'
import { LlmError } from '@app-template/kernel/llm/error'
import { encodeWith } from '@app-template/packages/schema'
import { recordLogs } from '@app-template/packages/testing'

import { replyToMessage } from '#use-cases/chat/reply-to-message.use-case'

const reply = replyToMessage(new ReplyToMessage({ messageId: queuedRun.userMessageId }))

const readRun = (run: Run) => () => encodeWith(Run)(run).pipe(Effect.map(Option.some))

const generating = new Run({ ...queuedRun, status: 'generating' })

/** Each log line as its level and message. */
const levels = (logs: ReadonlyArray<ReadonlyArray<unknown>>) =>
  Arr.map(logs, (line) => Arr.take(line, 2))

describe('replyToMessage', () => {
  it.effect(
    'reply ends on LlmError after one call with a warning, the Run failed with its text and no reply written',
    () => {
      const error = new LlmError({ cause: '401 invalid x-api-key' })
      const assistant = recordMessageAssistant(Effect.fail(error))
      const { logs, layer: logger } = recordLogs()
      const updates: Array<RunEntitySet> = []
      return Effect.gen(function* () {
        yield* reply

        assert.deepStrictEqual(
          Arr.map(updates, ({ status }) => status),
          ['generating', 'failed'],
        )
        assert.include(updates.at(-1)?.failure?.cause, error.cause)
        assert.strictEqual((yield* assistant.histories).length, 1)
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
              messages: { selectMany: () => Effect.all([encodeWith(Message)(firstMessage)]) },
            },
            { messageAssistant: assistant.layer },
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
              messages: { selectMany: () => Effect.all([encodeWith(Message)(firstMessage)]) },
            },
            { messageAssistant: recordMessageAssistant(Effect.fail(refused)).layer },
          ),
          logger,
        ]),
      )
    },
  )

  it.effect("reply skips a message with no active Run, logged under the message's id", () => {
    const assistant = recordMessageAssistant(Effect.never)
    const { logs, layer: logger } = recordLogs('messageId')
    return Effect.gen(function* () {
      yield* reply

      assertEquals(yield* assistant.histories, [])
      assert.deepStrictEqual(logs, [
        ['Info', 'reply skipped: its Run is done, failed or gone', queuedRun.userMessageId],
      ])
    }).pipe(
      Effect.provide([
        layerChatTest(
          { runs: { selectOne: () => Effect.succeedNone } },
          { messageAssistant: assistant.layer },
        ),
        logger,
      ]),
    )
  })

  it.effect('reply fails a Run a dead worker left started, with a warning, unasked', () => {
    const assistant = recordMessageAssistant(Effect.never)
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
      assertEquals(yield* assistant.histories, [])
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
          { messageAssistant: assistant.layer },
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
          { messageAssistant: recordMessageAssistant(Effect.never).layer },
        ),
        logger,
      ]),
    )
  })

  it.effect('reply interrupted while the assistant answers warns once, with the interrupt', () => {
    const held = holdCall()
    const assistant = recordMessageAssistant(held.hold.pipe(Effect.andThen(Effect.never)))
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
            messages: { selectMany: () => Effect.all([encodeWith(Message)(firstMessage)]) },
          },
          { messageAssistant: assistant.layer },
        ),
        logger,
      ]),
    )
  })
})

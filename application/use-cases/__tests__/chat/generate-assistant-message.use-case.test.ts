import { assert, describe, it } from '@effect/vitest'
import { assertEquals } from '@effect/vitest/utils'
import { Array as Arr, Effect, Layer, Option } from 'effect'

import { GenerateAssistantMessage, Message, Run } from '@app-template/application/chat'
import {
  firstMessage,
  layerChatTest,
  queuedRun,
  recordMessageAssistant,
} from '@app-template/application/chat/testing'
import type { RunEntitySet } from '@app-template/kernel/data'
import { LlmFailedError, LlmRefusedError } from '@app-template/kernel/llm/error'
import { encodeWith } from '@app-template/packages/schema'
import { recordLogs } from '@app-template/packages/testing'

import { generateAssistantMessage } from '#use-cases/chat/generate-assistant-message.use-case'

const generate = generateAssistantMessage(new GenerateAssistantMessage({ runId: queuedRun.id }))

describe('generateAssistantMessage', () => {
  it.effect.each([
    { name: 'LlmRefusedError', error: new LlmRefusedError({ cause: 'stop_reason refusal' }) },
    { name: 'LlmFailedError', error: new LlmFailedError({ cause: '401 invalid x-api-key' }) },
  ] as const)(
    'generate ends on $name after one call, the Run failed with its text and no reply written',
    ({ error }) => {
      const assistant = recordMessageAssistant(Effect.fail(error))
      const updates: Array<RunEntitySet> = []
      return Effect.gen(function* () {
        yield* generate

        assert.deepStrictEqual(
          Arr.map(updates, ({ status }) => status),
          ['preparing', 'generating', 'failed'],
        )
        assert.include(updates.at(-1)?.failure?.cause, error.cause)
        assert.strictEqual((yield* assistant.histories).length, 1)
      }).pipe(
        Effect.provide(
          layerChatTest({
            runs: {
              selectOne: () => encodeWith(Run)(queuedRun).pipe(Effect.map(Option.some)),
              update: (set) =>
                Effect.sync(() => {
                  updates.push(set)
                }),
            },
            // No `insert`: a reply written would die on it.
            messages: { selectMany: () => Effect.all([encodeWith(Message)(firstMessage)]) },
          }).pipe(Layer.provideMerge(assistant.layer)),
        ),
      )
    },
  )

  it.effect("generate logs under its Run's id, as when it skips a settled Run", () => {
    const assistant = recordMessageAssistant(Effect.never)
    const { logs, layer: logger } = recordLogs('runId')
    return Effect.gen(function* () {
      yield* generate

      assertEquals(yield* assistant.histories, [])
      assert.deepStrictEqual(logs, [
        ['Info', 'assistant reply skipped: its Run is settled or gone', queuedRun.id],
      ])
    }).pipe(
      Effect.provide([
        layerChatTest({ runs: { selectOne: () => Effect.succeedNone } }).pipe(
          Layer.provideMerge(assistant.layer),
        ),
        logger,
      ]),
    )
  })
})

import { assert, it } from '@effect/vitest'

import { RunState } from '#chat/domain/run-state'

it.each([
  { status: 'queued', active: true, started: false, failed: false },
  { status: 'generating', active: true, started: true, failed: false },
  { status: 'done', active: false, started: false, failed: false },
  { status: 'failed', active: false, started: false, failed: true },
] as const)(
  'a $status Run is active: $active, started: $started, failed: $failed',
  ({ status, active, started, failed }) => {
    assert.strictEqual(RunState.isActive({ status }), active)
    assert.strictEqual(RunState.isStarted({ status }), started)
    assert.strictEqual(RunState.isFailed({ status }), failed)
  },
)

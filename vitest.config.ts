import { configDefaults, defineConfig } from 'vitest/config'

const exclude = [...configDefaults.exclude, 'repos/**', '.claude/worktrees/**']
const sequence = { concurrent: true }

export default defineConfig({
  test: {
    projects: [
      { test: { name: 'unit', include: ['**/tests/**/*.test.ts'], exclude, sequence } },
      {
        test: {
          name: 'e2e',
          include: ['**/e2e/**/*.e2e.ts'],
          exclude,
          globalSetup: ['infrastructure/testing/e2e.test-setup.ts'],
          sequence,
        },
      },
    ],
  },
})

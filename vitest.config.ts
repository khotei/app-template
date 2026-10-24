import { configDefaults, defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    exclude: [...configDefaults.exclude, 'repos/**', '.claude/worktrees/**'],
    globalSetup: ['infrastructure/db/testing/postgres.setup.ts'],
    sequence: { concurrent: true },
  },
})

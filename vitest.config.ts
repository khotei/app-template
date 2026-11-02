import { configDefaults, defineConfig } from 'vitest/config'

const exclude = [...configDefaults.exclude, 'repos/**', '.claude/worktrees/**']
const sequence = { concurrent: true }

export default defineConfig({
  test: {
    projects: [
      { test: { name: 'unit', include: ['**/__tests__/**/*.test.ts'], exclude, sequence } },
      {
        test: {
          name: 'e2e',
          include: ['**/__e2e__/**/*.e2e.ts'],
          exclude,
          globalSetup: ['kernel/data/__tests__/testing/e2e/e2e.test-setup.ts'],
          // The apps' SDK clients read credentials from the environment; MiniStack accepts any.
          env: { AWS_ACCESS_KEY_ID: 'test', AWS_SECRET_ACCESS_KEY: 'test' },
          sequence,
        },
      },
    ],
  },
})

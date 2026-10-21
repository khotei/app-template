/** A stage no other test file shares, so resources provisioned under it collide with nothing. */
export const generateStage = (): string => `test-${crypto.randomUUID().slice(0, 8)}`

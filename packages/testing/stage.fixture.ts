/** A stage no other test shares, so resources provisioned under it collide with nothing. */
export const buildStage = (): string => `test-${crypto.randomUUID().slice(0, 8)}`

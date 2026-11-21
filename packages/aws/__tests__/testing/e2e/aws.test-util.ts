/** Set on the e2e run's MiniStack by the `globalSetup`; its clients and `AWS_ENDPOINT_URL` must name the same. */
export const ministackRegion = 'us-east-1'

/** A stage no other test holds, `e2e` and eight hex digits, so a test's resources are its own. */
export const generateStage = (): string => `e2e${crypto.randomUUID().slice(0, 8)}`

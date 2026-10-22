/**
 * The MiniStack image `make up` and the tests' container both run, pinned by digest.
 *
 * It lives here, not in `@app-template/aws`, because `@app-template/testing` imports it and the
 * tests of `aws` import `testing`: the two packages would reference each other.
 */
export const ministackImage =
  'ministackorg/ministack:1.5.29@sha256:88f507c57e16f5cac3c58dbdd4d47cfd14d6f870c38461aff7e077908253260b'

import { Redacted } from 'effect'

import type { UserSecret } from '#identity/domain/identity.model'

export class UserSecretBytes {
  private static readonly encoder = new TextEncoder()

  /** The UTF-8 bytes of the secret's base64url text, which its hash reads. */
  static readonly build = (secret: UserSecret): Uint8Array =>
    UserSecretBytes.encoder.encode(Redacted.value(secret))
}

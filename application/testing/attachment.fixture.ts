import { AttachmentId } from '@app-template/domain/attachment'

export const unknownAttachmentId = AttachmentId.make('0192d4e0-7b3a-7c00-8000-000000000029')

/** A PNG signature followed by a zero and a 0xff byte, so a text round trip would corrupt it. */
export const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0xff])

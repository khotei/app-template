import { maxTitleLength } from '@app-template/domain/chat'

export const attachment = {
  maxFileSize: '10 MiB',
  maxFiles: 5,
  mediaTypes: [
    'image/png',
    'image/jpeg',
    'image/gif',
    'image/webp',
    'application/pdf',
    'text/plain',
  ],
} as const

export const message = { maxTextLength: 20_000 } as const

export const chat = { maxTitleLength } as const

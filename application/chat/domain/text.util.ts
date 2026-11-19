import { pipe, String as Str } from 'effect'

export const isBlank = (text: string) => pipe(text, Str.trim, Str.isEmpty)

export const joinClassNames = (
  ...names: ReadonlyArray<string | false | null | undefined>
): string => names.filter(Boolean).join(' ')

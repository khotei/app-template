export class ClassName {
  static readonly join = (...names: ReadonlyArray<string | false | null | undefined>): string =>
    names.filter(Boolean).join(' ')
}

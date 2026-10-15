/** `_tag` mirrors Effect's `Data.TaggedError`, so errors can migrate without call-site changes. */
export abstract class DomainError extends Error {
  abstract readonly _tag: string

  constructor(message: string) {
    super(message)
    this.name = new.target.name
  }
}

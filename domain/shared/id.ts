export type Id<Brand extends string> = string & { readonly __brand: Brand }

export const buildId = <Brand extends string>(): Id<Brand> => crypto.randomUUID() as Id<Brand>

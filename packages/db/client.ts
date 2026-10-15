export interface DbClientOptions {
  readonly url: string
}

export interface DbClient {
  readonly url: string
}

export const createDbClient = (options: DbClientOptions): DbClient => ({ url: options.url })

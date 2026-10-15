import { createDbClient, type DbClient } from '@oblik/db'

export const createSharedDbClient = (url: string): DbClient => createDbClient({ url })

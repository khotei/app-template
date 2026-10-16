import type { CreateExampleInput } from '@oblik/application/example'
import type { ExampleError, ExampleId } from '@oblik/domain/example'
import { DomainError } from '@oblik/domain/shared'

import type { Layer } from '#api/layer'

export type StatusByTag = Readonly<Record<ExampleError['_tag'], number>>

const statusByTag: StatusByTag = {
  ExampleNameInvalidError: 422,
  ExampleNotFoundError: 404,
}

const isMappedTag = (tag: string): tag is keyof StatusByTag => Object.hasOwn(statusByTag, tag)

const respondWithDomainError = (error: unknown): Response => {
  if (error instanceof DomainError && isMappedTag(error._tag)) {
    const status = statusByTag[error._tag]
    return Response.json({ error: error._tag, message: error.message }, { status })
  }
  throw error
}

const isCreateExampleInput = (body: unknown): body is CreateExampleInput =>
  typeof body === 'object' && body !== null && typeof (body as { name?: unknown }).name === 'string'

export const createRoutes = (layer: Layer) => ({
  '/health': () => Response.json({ status: 'ok' }),
  '/examples': {
    POST: async (request: Request) => {
      const body: unknown = await request.json().catch(() => undefined)
      if (!isCreateExampleInput(body)) {
        return Response.json(
          { error: 'BadRequest', message: 'name must be a string' },
          { status: 400 },
        )
      }
      return layer
        .createExample(body)
        .then((example) => Response.json(example, { status: 201 }), respondWithDomainError)
    },
  },
  '/examples/:id': {
    GET: (request: Bun.BunRequest<'/examples/:id'>) =>
      layer.exampleService
        .get(request.params.id as ExampleId)
        .then((example) => Response.json(example), respondWithDomainError),
  },
})

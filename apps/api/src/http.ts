import type { CreateExampleInput } from '@oblik/application/example'
import type { ExampleId } from '@oblik/domain/example'
import { DomainError } from '@oblik/domain/shared'

import type { Layer } from '#api/layer'

const statusByTag: Readonly<Record<string, number>> = {
  ExampleNameInvalidError: 422,
  ExampleNotFoundError: 404,
}

const respondWithDomainError = (error: unknown): Response => {
  const status = error instanceof DomainError ? statusByTag[error._tag] : undefined
  if (error instanceof DomainError && status !== undefined) {
    return Response.json({ error: error._tag, message: error.message }, { status })
  }
  throw error
}

const isCreateExampleInput = (body: unknown): body is CreateExampleInput =>
  typeof body === 'object' && body !== null && typeof (body as { name?: unknown }).name === 'string'

export const buildRoutes = (layer: Layer) => ({
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

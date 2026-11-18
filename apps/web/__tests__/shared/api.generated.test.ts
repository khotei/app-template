import { readFileSync } from 'node:fs'

import {
  layerTransformerSchema,
  OpenApiGenerator,
} from '@effect/openapi-generator/OpenApiGenerator'
import { it } from '@effect/vitest'
import { Effect } from 'effect'

const spec = JSON.parse(readFileSync(new URL('../../../api/openapi.json', import.meta.url), 'utf8'))

// The file-snapshot matcher exists only on vitest's `expect`, taken from the test's context.
it.effect('the client matches the api OpenAPI snapshot', ({ expect }) =>
  OpenApiGenerator.use((generator) =>
    generator.generate(spec, { name: 'Api', format: 'httpapi' }),
  ).pipe(
    Effect.flatMap((source) =>
      Effect.promise(() =>
        expect(
          `${source}\n`,
          'The api changed its wire: run make api-snapshot',
        ).toMatchFileSnapshot('../../shared/api.generated.ts'),
      ),
    ),
    Effect.provide(layerTransformerSchema),
  ),
)

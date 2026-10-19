import { OpenApi } from 'effect/http-api'

import { Api } from '#api-contract/index'

console.log(JSON.stringify(OpenApi.fromApi(Api), null, 2))

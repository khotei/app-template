import { ApiClient } from '@app-template/http-api'

/** Calls the api through the web server's `/api` proxy, so the browser stays same-origin. */
export const ApiClientProxied = ApiClient.layerFetch(new URL('/api', window.location.origin).href)

import { Effect, Layer, Ref } from 'effect'
import { Cookies, HttpClient } from 'effect/http'

/** The `HttpClient` in context with a cookie jar of its own that starts from `cookies`, as a browser's. */
export const layerCookieJarTest = (cookies: Cookies.Cookies = Cookies.empty) =>
  Layer.effect(
    HttpClient.HttpClient,
    Ref.make(cookies).pipe(
      Effect.flatMap((jar) => HttpClient.HttpClient.useSync(HttpClient.withCookiesRef(jar))),
    ),
  )

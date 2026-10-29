import { Effect, Layer, Ref } from 'effect'
import { Cookies, HttpClient } from 'effect/http'

/** The `HttpClient` in context with a cookie jar of its own that starts from `cookies`, as a browser's. */
export const layerCookieJar = (cookies: Cookies.Cookies = Cookies.empty) =>
  Layer.effect(
    HttpClient.HttpClient,
    Effect.flatMap(Ref.make(cookies), (jar) =>
      HttpClient.HttpClient.useSync(HttpClient.withCookiesRef(jar)),
    ),
  )

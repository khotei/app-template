import * as Schema from "effect/Schema"
import { HttpApi, HttpApiEndpoint, HttpApiGroup, HttpApiMiddleware, HttpApiSchema, HttpApiSecurity, OpenApi } from "effect/http-api"

export type ApiChat = { readonly "id": string, readonly "userId": string, readonly "title": string | null, readonly "createdAt": string, readonly "updatedAt": string, readonly "status": "idle" | "queued" | "failed" }

export const ApiChat = Schema.Struct({ "id": Schema.String.annotate({ "format": "uuid" }).check(Schema.isPattern(new globalThis.RegExp("^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|[fF]{8}-[fF]{4}-[fF]{4}-[fF]{4}-[fF]{12})$", "u")).annotate({ "expected": "a string matching the RegExp ^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|[fF]{8}-[fF]{4}-[fF]{4}-[fF]{4}-[fF]{12})$" })), "userId": Schema.String.annotate({ "format": "uuid" }).check(Schema.isPattern(new globalThis.RegExp("^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|[fF]{8}-[fF]{4}-[fF]{4}-[fF]{4}-[fF]{12})$", "u")).annotate({ "expected": "a string matching the RegExp ^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|[fF]{8}-[fF]{4}-[fF]{4}-[fF]{4}-[fF]{12})$" })), "title": Schema.Union([Schema.String.check(Schema.isMinLength(1).annotate({ "expected": "a value with a length of at least 1" })).check(Schema.isMaxCodePoints(120).annotate({ "expected": "a string with at most 120 code points" })).check(Schema.isPattern(new globalThis.RegExp("^\\S[\\s\\S]*\\S$|^\\S$|^$", "u")).annotate({ "expected": "a string matching the RegExp ^\\S[\\s\\S]*\\S$|^\\S$|^$" })).check(Schema.isPattern(new globalThis.RegExp("^[^\\0]*$", "u")).annotate({ "expected": "a string matching the RegExp ^[^\\0]*$" })), Schema.Null]), "createdAt": Schema.String, "updatedAt": Schema.String, "status": Schema.Literals(["idle", "queued", "failed"]) }).annotate({ "identifier": "ApiChat" })

export type RequestInvalidErrorEncoded = { readonly "_tag": "RequestInvalidError", readonly "issues": globalThis.ReadonlyArray<{ readonly "path": globalThis.ReadonlyArray<string | number>, readonly "message": string }> }

export const RequestInvalidErrorEncoded = Schema.Struct({ "_tag": Schema.Literal("RequestInvalidError"), "issues": Schema.Array(Schema.Struct({ "path": Schema.Array(Schema.Union([Schema.String, Schema.Int.check(Schema.isGreaterThanOrEqualTo(-9007199254740991).annotate({ "expected": "a value greater than or equal to -9007199254740991" })).check(Schema.isLessThanOrEqualTo(9007199254740991).annotate({ "expected": "a value less than or equal to 9007199254740991" }))])), "message": Schema.String })) }).annotate({ "identifier": "RequestInvalidErrorEncoded" })

export type UserUnknownErrorEncoded = { readonly "_tag": "UserUnknownError" }

export const UserUnknownErrorEncoded = Schema.Struct({ "_tag": Schema.Literal("UserUnknownError") }).annotate({ "identifier": "UserUnknownErrorEncoded" })

export type ChatNotFoundErrorEncoded = { readonly "_tag": "ChatNotFoundError", readonly "id": string }

export const ChatNotFoundErrorEncoded = Schema.Struct({ "_tag": Schema.Literal("ChatNotFoundError"), "id": Schema.String.annotate({ "format": "uuid" }).check(Schema.isPattern(new globalThis.RegExp("^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|[fF]{8}-[fF]{4}-[fF]{4}-[fF]{4}-[fF]{12})$", "u")).annotate({ "expected": "a string matching the RegExp ^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|[fF]{8}-[fF]{4}-[fF]{4}-[fF]{4}-[fF]{12})$" })) }).annotate({ "identifier": "ChatNotFoundErrorEncoded" })

export type ApiRunFields = { readonly "id": string, readonly "chatId": string, readonly "userMessageId": string, readonly "status": "queued" | "generating" | "done" | "failed", readonly "assistantMessageId": string | null, readonly "createdAt": string, readonly "updatedAt": string }

export const ApiRunFields = Schema.Struct({ "id": Schema.String.annotate({ "format": "uuid" }).check(Schema.isPattern(new globalThis.RegExp("^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|[fF]{8}-[fF]{4}-[fF]{4}-[fF]{4}-[fF]{12})$", "u")).annotate({ "expected": "a string matching the RegExp ^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|[fF]{8}-[fF]{4}-[fF]{4}-[fF]{4}-[fF]{12})$" })), "chatId": Schema.String.annotate({ "format": "uuid" }).check(Schema.isPattern(new globalThis.RegExp("^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|[fF]{8}-[fF]{4}-[fF]{4}-[fF]{4}-[fF]{12})$", "u")).annotate({ "expected": "a string matching the RegExp ^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|[fF]{8}-[fF]{4}-[fF]{4}-[fF]{4}-[fF]{12})$" })), "userMessageId": Schema.String.annotate({ "format": "uuid" }).check(Schema.isPattern(new globalThis.RegExp("^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|[fF]{8}-[fF]{4}-[fF]{4}-[fF]{4}-[fF]{12})$", "u")).annotate({ "expected": "a string matching the RegExp ^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|[fF]{8}-[fF]{4}-[fF]{4}-[fF]{4}-[fF]{12})$" })), "status": Schema.Literals(["queued", "generating", "done", "failed"]), "assistantMessageId": Schema.Union([Schema.String.annotate({ "format": "uuid" }).check(Schema.isPattern(new globalThis.RegExp("^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|[fF]{8}-[fF]{4}-[fF]{4}-[fF]{4}-[fF]{12})$", "u")).annotate({ "expected": "a string matching the RegExp ^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|[fF]{8}-[fF]{4}-[fF]{4}-[fF]{4}-[fF]{12})$" })), Schema.Null]), "createdAt": Schema.String, "updatedAt": Schema.String }).annotate({ "identifier": "ApiRunFields" })

export type ApiMessage = { readonly "id": string, readonly "chatId": string, readonly "author": "user" | "assistant", readonly "text": string, readonly "createdAt": string, readonly "run": ApiRunFields | null }

export const ApiMessage = Schema.Struct({ "id": Schema.String.annotate({ "format": "uuid" }).check(Schema.isPattern(new globalThis.RegExp("^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|[fF]{8}-[fF]{4}-[fF]{4}-[fF]{4}-[fF]{12})$", "u")).annotate({ "expected": "a string matching the RegExp ^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|[fF]{8}-[fF]{4}-[fF]{4}-[fF]{4}-[fF]{12})$" })), "chatId": Schema.String.annotate({ "format": "uuid" }).check(Schema.isPattern(new globalThis.RegExp("^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|[fF]{8}-[fF]{4}-[fF]{4}-[fF]{4}-[fF]{12})$", "u")).annotate({ "expected": "a string matching the RegExp ^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|[fF]{8}-[fF]{4}-[fF]{4}-[fF]{4}-[fF]{12})$" })), "author": Schema.Literals(["user", "assistant"]), "text": Schema.String.check(Schema.isPattern(new globalThis.RegExp("^[^\\0]*$", "u")).annotate({ "expected": "a string matching the RegExp ^[^\\0]*$" })), "createdAt": Schema.String, "run": Schema.Union([ApiRunFields, Schema.Null]) }).annotate({ "identifier": "ApiMessage" })

export type ApiRun = { readonly "id": string, readonly "chatId": string, readonly "userMessageId": string, readonly "status": "queued" | "generating" | "done" | "failed", readonly "assistantMessageId": string | null, readonly "createdAt": string, readonly "updatedAt": string, readonly "userMessage": { readonly "id": string, readonly "chatId": string, readonly "author": "user" | "assistant", readonly "text": string, readonly "createdAt": string }, readonly "assistantMessage": { readonly "id": string, readonly "chatId": string, readonly "author": "user" | "assistant", readonly "text": string, readonly "createdAt": string } | null }

export const ApiRun = Schema.Struct({ "id": Schema.String.annotate({ "format": "uuid" }).check(Schema.isPattern(new globalThis.RegExp("^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|[fF]{8}-[fF]{4}-[fF]{4}-[fF]{4}-[fF]{12})$", "u")).annotate({ "expected": "a string matching the RegExp ^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|[fF]{8}-[fF]{4}-[fF]{4}-[fF]{4}-[fF]{12})$" })), "chatId": Schema.String.annotate({ "format": "uuid" }).check(Schema.isPattern(new globalThis.RegExp("^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|[fF]{8}-[fF]{4}-[fF]{4}-[fF]{4}-[fF]{12})$", "u")).annotate({ "expected": "a string matching the RegExp ^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|[fF]{8}-[fF]{4}-[fF]{4}-[fF]{4}-[fF]{12})$" })), "userMessageId": Schema.String.annotate({ "format": "uuid" }).check(Schema.isPattern(new globalThis.RegExp("^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|[fF]{8}-[fF]{4}-[fF]{4}-[fF]{4}-[fF]{12})$", "u")).annotate({ "expected": "a string matching the RegExp ^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|[fF]{8}-[fF]{4}-[fF]{4}-[fF]{4}-[fF]{12})$" })), "status": Schema.Literals(["queued", "generating", "done", "failed"]), "assistantMessageId": Schema.Union([Schema.String.annotate({ "format": "uuid" }).check(Schema.isPattern(new globalThis.RegExp("^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|[fF]{8}-[fF]{4}-[fF]{4}-[fF]{4}-[fF]{12})$", "u")).annotate({ "expected": "a string matching the RegExp ^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|[fF]{8}-[fF]{4}-[fF]{4}-[fF]{4}-[fF]{12})$" })), Schema.Null]), "createdAt": Schema.String, "updatedAt": Schema.String, "userMessage": Schema.Struct({ "id": Schema.String.annotate({ "format": "uuid" }).check(Schema.isPattern(new globalThis.RegExp("^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|[fF]{8}-[fF]{4}-[fF]{4}-[fF]{4}-[fF]{12})$", "u")).annotate({ "expected": "a string matching the RegExp ^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|[fF]{8}-[fF]{4}-[fF]{4}-[fF]{4}-[fF]{12})$" })), "chatId": Schema.String.annotate({ "format": "uuid" }).check(Schema.isPattern(new globalThis.RegExp("^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|[fF]{8}-[fF]{4}-[fF]{4}-[fF]{4}-[fF]{12})$", "u")).annotate({ "expected": "a string matching the RegExp ^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|[fF]{8}-[fF]{4}-[fF]{4}-[fF]{4}-[fF]{12})$" })), "author": Schema.Literals(["user", "assistant"]), "text": Schema.String.check(Schema.isPattern(new globalThis.RegExp("^[^\\0]*$", "u")).annotate({ "expected": "a string matching the RegExp ^[^\\0]*$" })), "createdAt": Schema.String }), "assistantMessage": Schema.Union([Schema.Struct({ "id": Schema.String.annotate({ "format": "uuid" }).check(Schema.isPattern(new globalThis.RegExp("^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|[fF]{8}-[fF]{4}-[fF]{4}-[fF]{4}-[fF]{12})$", "u")).annotate({ "expected": "a string matching the RegExp ^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|[fF]{8}-[fF]{4}-[fF]{4}-[fF]{4}-[fF]{12})$" })), "chatId": Schema.String.annotate({ "format": "uuid" }).check(Schema.isPattern(new globalThis.RegExp("^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|[fF]{8}-[fF]{4}-[fF]{4}-[fF]{4}-[fF]{12})$", "u")).annotate({ "expected": "a string matching the RegExp ^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|[fF]{8}-[fF]{4}-[fF]{4}-[fF]{4}-[fF]{12})$" })), "author": Schema.Literals(["user", "assistant"]), "text": Schema.String.check(Schema.isPattern(new globalThis.RegExp("^[^\\0]*$", "u")).annotate({ "expected": "a string matching the RegExp ^[^\\0]*$" })), "createdAt": Schema.String }), Schema.Null]) }).annotate({ "identifier": "ApiRun" })

export type ChatBusyErrorEncoded = { readonly "_tag": "ChatBusyError", readonly "id": string }

export const ChatBusyErrorEncoded = Schema.Struct({ "_tag": Schema.Literal("ChatBusyError"), "id": Schema.String.annotate({ "format": "uuid" }).check(Schema.isPattern(new globalThis.RegExp("^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|[fF]{8}-[fF]{4}-[fF]{4}-[fF]{4}-[fF]{12})$", "u")).annotate({ "expected": "a string matching the RegExp ^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|[fF]{8}-[fF]{4}-[fF]{4}-[fF]{4}-[fF]{12})$" })) }).annotate({ "identifier": "ChatBusyErrorEncoded" })

export type MessageNotFoundErrorEncoded = { readonly "_tag": "MessageNotFoundError", readonly "id": string }

export const MessageNotFoundErrorEncoded = Schema.Struct({ "_tag": Schema.Literal("MessageNotFoundError"), "id": Schema.String.annotate({ "format": "uuid" }).check(Schema.isPattern(new globalThis.RegExp("^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|[fF]{8}-[fF]{4}-[fF]{4}-[fF]{4}-[fF]{12})$", "u")).annotate({ "expected": "a string matching the RegExp ^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|[fF]{8}-[fF]{4}-[fF]{4}-[fF]{4}-[fF]{12})$" })) }).annotate({ "identifier": "MessageNotFoundErrorEncoded" })

export type RunNotRetryableErrorEncoded = { readonly "_tag": "RunNotRetryableError" }

export const RunNotRetryableErrorEncoded = Schema.Struct({ "_tag": Schema.Literal("RunNotRetryableError") }).annotate({ "identifier": "RunNotRetryableErrorEncoded" })

export type RunNotFoundErrorEncoded = { readonly "_tag": "RunNotFoundError", readonly "where": { readonly "id": string } | { readonly "userMessageId": string } }

export const RunNotFoundErrorEncoded = Schema.Struct({ "_tag": Schema.Literal("RunNotFoundError"), "where": Schema.Union([Schema.Struct({ "id": Schema.String.annotate({ "format": "uuid" }).check(Schema.isPattern(new globalThis.RegExp("^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|[fF]{8}-[fF]{4}-[fF]{4}-[fF]{4}-[fF]{12})$", "u")).annotate({ "expected": "a string matching the RegExp ^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|[fF]{8}-[fF]{4}-[fF]{4}-[fF]{4}-[fF]{12})$" })) }), Schema.Struct({ "userMessageId": Schema.String.annotate({ "format": "uuid" }).check(Schema.isPattern(new globalThis.RegExp("^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|[fF]{8}-[fF]{4}-[fF]{4}-[fF]{4}-[fF]{12})$", "u")).annotate({ "expected": "a string matching the RegExp ^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|[fF]{8}-[fF]{4}-[fF]{4}-[fF]{4}-[fF]{12})$" })) })]) }).annotate({ "identifier": "RunNotFoundErrorEncoded" })

export type UserEncoded = { readonly "id": string, readonly "createdAt": string }

export const UserEncoded = Schema.Struct({ "id": Schema.String.annotate({ "format": "uuid" }).check(Schema.isPattern(new globalThis.RegExp("^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|[fF]{8}-[fF]{4}-[fF]{4}-[fF]{4}-[fF]{12})$", "u")).annotate({ "expected": "a string matching the RegExp ^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|[fF]{8}-[fF]{4}-[fF]{4}-[fF]{4}-[fF]{12})$" })), "createdAt": Schema.String }).annotate({ "identifier": "UserEncoded" })

export type ChatsList200 = globalThis.ReadonlyArray<ApiChat>

export const ChatsList200 = Schema.Array(ApiChat)

export type ChatsList400 = RequestInvalidErrorEncoded

export const ChatsList400 = RequestInvalidErrorEncoded

export type ChatsList401 = UserUnknownErrorEncoded

export const ChatsList401 = UserUnknownErrorEncoded

export type ChatsCreate201 = ApiChat

export const ChatsCreate201 = ApiChat

export type ChatsCreate400 = RequestInvalidErrorEncoded

export const ChatsCreate400 = RequestInvalidErrorEncoded

export type ChatsCreate401 = UserUnknownErrorEncoded

export const ChatsCreate401 = UserUnknownErrorEncoded

export type ChatsGetPathParams = { readonly "chatId": string }

export const ChatsGetPathParams = Schema.Struct({ "chatId": Schema.String.annotate({ "format": "uuid" }).check(Schema.isPattern(new globalThis.RegExp("^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|[fF]{8}-[fF]{4}-[fF]{4}-[fF]{4}-[fF]{12})$", "u")).annotate({ "expected": "a string matching the RegExp ^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|[fF]{8}-[fF]{4}-[fF]{4}-[fF]{4}-[fF]{12})$" })) })

export type ChatsGet200 = ApiChat

export const ChatsGet200 = ApiChat

export type ChatsGet400 = RequestInvalidErrorEncoded

export const ChatsGet400 = RequestInvalidErrorEncoded

export type ChatsGet401 = UserUnknownErrorEncoded

export const ChatsGet401 = UserUnknownErrorEncoded

export type ChatsGet404 = ChatNotFoundErrorEncoded

export const ChatsGet404 = ChatNotFoundErrorEncoded

export type ChatsDeletePathParams = { readonly "chatId": string }

export const ChatsDeletePathParams = Schema.Struct({ "chatId": Schema.String.annotate({ "format": "uuid" }).check(Schema.isPattern(new globalThis.RegExp("^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|[fF]{8}-[fF]{4}-[fF]{4}-[fF]{4}-[fF]{12})$", "u")).annotate({ "expected": "a string matching the RegExp ^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|[fF]{8}-[fF]{4}-[fF]{4}-[fF]{4}-[fF]{12})$" })) })

export type ChatsDelete400 = RequestInvalidErrorEncoded

export const ChatsDelete400 = RequestInvalidErrorEncoded

export type ChatsDelete401 = UserUnknownErrorEncoded

export const ChatsDelete401 = UserUnknownErrorEncoded

export type ChatsDelete404 = ChatNotFoundErrorEncoded

export const ChatsDelete404 = ChatNotFoundErrorEncoded

export type ChatsRenamePathParams = { readonly "chatId": string }

export const ChatsRenamePathParams = Schema.Struct({ "chatId": Schema.String.annotate({ "format": "uuid" }).check(Schema.isPattern(new globalThis.RegExp("^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|[fF]{8}-[fF]{4}-[fF]{4}-[fF]{4}-[fF]{12})$", "u")).annotate({ "expected": "a string matching the RegExp ^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|[fF]{8}-[fF]{4}-[fF]{4}-[fF]{4}-[fF]{12})$" })) })

export type ChatsRenameRequestJson = { readonly "title": string }

export const ChatsRenameRequestJson = Schema.Struct({ "title": Schema.String })

export type ChatsRename200 = ApiChat

export const ChatsRename200 = ApiChat

export type ChatsRename400 = RequestInvalidErrorEncoded

export const ChatsRename400 = RequestInvalidErrorEncoded

export type ChatsRename401 = UserUnknownErrorEncoded

export const ChatsRename401 = UserUnknownErrorEncoded

export type ChatsRename404 = ChatNotFoundErrorEncoded

export const ChatsRename404 = ChatNotFoundErrorEncoded

export type ChatsListMessagesPathParams = { readonly "chatId": string }

export const ChatsListMessagesPathParams = Schema.Struct({ "chatId": Schema.String.annotate({ "format": "uuid" }).check(Schema.isPattern(new globalThis.RegExp("^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|[fF]{8}-[fF]{4}-[fF]{4}-[fF]{4}-[fF]{12})$", "u")).annotate({ "expected": "a string matching the RegExp ^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|[fF]{8}-[fF]{4}-[fF]{4}-[fF]{4}-[fF]{12})$" })) })

export type ChatsListMessages200 = globalThis.ReadonlyArray<ApiMessage>

export const ChatsListMessages200 = Schema.Array(ApiMessage)

export type ChatsListMessages400 = RequestInvalidErrorEncoded

export const ChatsListMessages400 = RequestInvalidErrorEncoded

export type ChatsListMessages401 = UserUnknownErrorEncoded

export const ChatsListMessages401 = UserUnknownErrorEncoded

export type ChatsListMessages404 = ChatNotFoundErrorEncoded

export const ChatsListMessages404 = ChatNotFoundErrorEncoded

export type ChatsAskPathParams = { readonly "chatId": string }

export const ChatsAskPathParams = Schema.Struct({ "chatId": Schema.String.annotate({ "format": "uuid" }).check(Schema.isPattern(new globalThis.RegExp("^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|[fF]{8}-[fF]{4}-[fF]{4}-[fF]{4}-[fF]{12})$", "u")).annotate({ "expected": "a string matching the RegExp ^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|[fF]{8}-[fF]{4}-[fF]{4}-[fF]{4}-[fF]{12})$" })) })

export type ChatsAskRequestJson = { readonly "text": string }

export const ChatsAskRequestJson = Schema.Struct({ "text": Schema.String.check(Schema.isMaxCodePoints(20000).annotate({ "expected": "a string with at most 20000 code points" })).check(Schema.isPattern(new globalThis.RegExp("^[^\\0]*$", "u")).annotate({ "expected": "a string matching the RegExp ^[^\\0]*$" })) })

export type ChatsAsk202 = ApiRun

export const ChatsAsk202 = ApiRun

export type ChatsAsk400 = RequestInvalidErrorEncoded

export const ChatsAsk400 = RequestInvalidErrorEncoded

export type ChatsAsk401 = UserUnknownErrorEncoded

export const ChatsAsk401 = UserUnknownErrorEncoded

export type ChatsAsk404 = ChatNotFoundErrorEncoded

export const ChatsAsk404 = ChatNotFoundErrorEncoded

export type ChatsAsk409 = ChatBusyErrorEncoded

export const ChatsAsk409 = ChatBusyErrorEncoded

export type ChatsRetryRunPathParams = { readonly "chatId": string }

export const ChatsRetryRunPathParams = Schema.Struct({ "chatId": Schema.String.annotate({ "format": "uuid" }).check(Schema.isPattern(new globalThis.RegExp("^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|[fF]{8}-[fF]{4}-[fF]{4}-[fF]{4}-[fF]{12})$", "u")).annotate({ "expected": "a string matching the RegExp ^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|[fF]{8}-[fF]{4}-[fF]{4}-[fF]{4}-[fF]{12})$" })) })

export type ChatsRetryRun202 = ApiRun

export const ChatsRetryRun202 = ApiRun

export type ChatsRetryRun400 = RequestInvalidErrorEncoded

export const ChatsRetryRun400 = RequestInvalidErrorEncoded

export type ChatsRetryRun401 = UserUnknownErrorEncoded

export const ChatsRetryRun401 = UserUnknownErrorEncoded

export type ChatsRetryRun404 = MessageNotFoundErrorEncoded | ChatNotFoundErrorEncoded

export const ChatsRetryRun404 = Schema.Union([MessageNotFoundErrorEncoded, ChatNotFoundErrorEncoded])

export type ChatsRetryRun409 = RunNotRetryableErrorEncoded

export const ChatsRetryRun409 = RunNotRetryableErrorEncoded

export type ChatsGetMessagePathParams = { readonly "chatId": string, readonly "messageId": string }

export const ChatsGetMessagePathParams = Schema.Struct({ "chatId": Schema.String.annotate({ "format": "uuid" }).check(Schema.isPattern(new globalThis.RegExp("^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|[fF]{8}-[fF]{4}-[fF]{4}-[fF]{4}-[fF]{12})$", "u")).annotate({ "expected": "a string matching the RegExp ^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|[fF]{8}-[fF]{4}-[fF]{4}-[fF]{4}-[fF]{12})$" })), "messageId": Schema.String.annotate({ "format": "uuid" }).check(Schema.isPattern(new globalThis.RegExp("^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|[fF]{8}-[fF]{4}-[fF]{4}-[fF]{4}-[fF]{12})$", "u")).annotate({ "expected": "a string matching the RegExp ^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|[fF]{8}-[fF]{4}-[fF]{4}-[fF]{4}-[fF]{12})$" })) })

export type ChatsGetMessage200 = ApiMessage

export const ChatsGetMessage200 = ApiMessage

export type ChatsGetMessage400 = RequestInvalidErrorEncoded

export const ChatsGetMessage400 = RequestInvalidErrorEncoded

export type ChatsGetMessage401 = UserUnknownErrorEncoded

export const ChatsGetMessage401 = UserUnknownErrorEncoded

export type ChatsGetMessage404 = MessageNotFoundErrorEncoded

export const ChatsGetMessage404 = MessageNotFoundErrorEncoded

export type ChatsGetRunPathParams = { readonly "chatId": string, readonly "runId": string }

export const ChatsGetRunPathParams = Schema.Struct({ "chatId": Schema.String.annotate({ "format": "uuid" }).check(Schema.isPattern(new globalThis.RegExp("^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|[fF]{8}-[fF]{4}-[fF]{4}-[fF]{4}-[fF]{12})$", "u")).annotate({ "expected": "a string matching the RegExp ^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|[fF]{8}-[fF]{4}-[fF]{4}-[fF]{4}-[fF]{12})$" })), "runId": Schema.String.annotate({ "format": "uuid" }).check(Schema.isPattern(new globalThis.RegExp("^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|[fF]{8}-[fF]{4}-[fF]{4}-[fF]{4}-[fF]{12})$", "u")).annotate({ "expected": "a string matching the RegExp ^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|[fF]{8}-[fF]{4}-[fF]{4}-[fF]{4}-[fF]{12})$" })) })

export type ChatsGetRun200 = ApiRun

export const ChatsGetRun200 = ApiRun

export type ChatsGetRun400 = RequestInvalidErrorEncoded

export const ChatsGetRun400 = RequestInvalidErrorEncoded

export type ChatsGetRun401 = UserUnknownErrorEncoded

export const ChatsGetRun401 = UserUnknownErrorEncoded

export type ChatsGetRun404 = RunNotFoundErrorEncoded

export const ChatsGetRun404 = RunNotFoundErrorEncoded

export type HealthGet200 = { readonly "status": "ok" }

export const HealthGet200 = Schema.Struct({ "status": Schema.Literal("ok") })

export type HealthGet400 = RequestInvalidErrorEncoded

export const HealthGet400 = RequestInvalidErrorEncoded

export type UsersRecognise201 = UserEncoded

export const UsersRecognise201 = UserEncoded

export type UsersRecognise400 = RequestInvalidErrorEncoded

export const UsersRecognise400 = RequestInvalidErrorEncoded

export const CookieSecurity = HttpApiSecurity.apiKey({ key: "user_secret", in: "cookie" })

export class CookieSecurityMiddleware extends HttpApiMiddleware.Service<CookieSecurityMiddleware>()("cookie security", { security: { "cookie": CookieSecurity } }) {}

class ChatsGroup extends HttpApiGroup.make("chats")
  .add(HttpApiEndpoint.get("chatsList", "/chats", { success: ChatsList200, error: [ChatsList400.pipe(HttpApiSchema.status(400)), ChatsList401.pipe(HttpApiSchema.status(401))] })
      .middleware(CookieSecurityMiddleware)
      .annotate(OpenApi.Identifier, "chats.list"), 
    HttpApiEndpoint.post("chatsCreate", "/chats", { success: ChatsCreate201.pipe(HttpApiSchema.status(201)), error: [ChatsCreate400.pipe(HttpApiSchema.status(400)), ChatsCreate401.pipe(HttpApiSchema.status(401))] })
      .middleware(CookieSecurityMiddleware)
      .annotate(OpenApi.Identifier, "chats.create"), 
    HttpApiEndpoint.get("chatsGet", "/chats/:chatId", { params: ChatsGetPathParams, success: ChatsGet200, error: [ChatsGet400.pipe(HttpApiSchema.status(400)), ChatsGet401.pipe(HttpApiSchema.status(401)), ChatsGet404.pipe(HttpApiSchema.status(404))] })
      .middleware(CookieSecurityMiddleware)
      .annotate(OpenApi.Identifier, "chats.get"), 
    HttpApiEndpoint.delete("chatsDelete", "/chats/:chatId", { params: ChatsDeletePathParams, success: HttpApiSchema.Empty(204), error: [ChatsDelete400.pipe(HttpApiSchema.status(400)), ChatsDelete401.pipe(HttpApiSchema.status(401)), ChatsDelete404.pipe(HttpApiSchema.status(404))] })
      .middleware(CookieSecurityMiddleware)
      .annotate(OpenApi.Identifier, "chats.delete"), 
    HttpApiEndpoint.patch("chatsRename", "/chats/:chatId", { params: ChatsRenamePathParams, payload: ChatsRenameRequestJson, success: ChatsRename200, error: [ChatsRename400.pipe(HttpApiSchema.status(400)), ChatsRename401.pipe(HttpApiSchema.status(401)), ChatsRename404.pipe(HttpApiSchema.status(404))] })
      .middleware(CookieSecurityMiddleware)
      .annotate(OpenApi.Identifier, "chats.rename"), 
    HttpApiEndpoint.get("chatsListMessages", "/chats/:chatId/messages", { params: ChatsListMessagesPathParams, success: ChatsListMessages200, error: [ChatsListMessages400.pipe(HttpApiSchema.status(400)), ChatsListMessages401.pipe(HttpApiSchema.status(401)), ChatsListMessages404.pipe(HttpApiSchema.status(404))] })
      .middleware(CookieSecurityMiddleware)
      .annotate(OpenApi.Identifier, "chats.listMessages"), 
    HttpApiEndpoint.post("chatsAsk", "/chats/:chatId/messages", { params: ChatsAskPathParams, payload: ChatsAskRequestJson, success: ChatsAsk202.pipe(HttpApiSchema.status(202)), error: [ChatsAsk400.pipe(HttpApiSchema.status(400)), ChatsAsk401.pipe(HttpApiSchema.status(401)), ChatsAsk404.pipe(HttpApiSchema.status(404)), ChatsAsk409.pipe(HttpApiSchema.status(409))] })
      .middleware(CookieSecurityMiddleware)
      .annotate(OpenApi.Identifier, "chats.ask"), 
    HttpApiEndpoint.post("chatsRetryRun", "/chats/:chatId/runs", { params: ChatsRetryRunPathParams, success: ChatsRetryRun202.pipe(HttpApiSchema.status(202)), error: [ChatsRetryRun400.pipe(HttpApiSchema.status(400)), ChatsRetryRun401.pipe(HttpApiSchema.status(401)), ChatsRetryRun404.pipe(HttpApiSchema.status(404)), ChatsRetryRun409.pipe(HttpApiSchema.status(409))] })
      .middleware(CookieSecurityMiddleware)
      .annotate(OpenApi.Identifier, "chats.retryRun"), 
    HttpApiEndpoint.get("chatsGetMessage", "/chats/:chatId/messages/:messageId", { params: ChatsGetMessagePathParams, success: ChatsGetMessage200, error: [ChatsGetMessage400.pipe(HttpApiSchema.status(400)), ChatsGetMessage401.pipe(HttpApiSchema.status(401)), ChatsGetMessage404.pipe(HttpApiSchema.status(404))] })
      .middleware(CookieSecurityMiddleware)
      .annotate(OpenApi.Identifier, "chats.getMessage"), 
    HttpApiEndpoint.get("chatsGetRun", "/chats/:chatId/runs/:runId", { params: ChatsGetRunPathParams, success: ChatsGetRun200, error: [ChatsGetRun400.pipe(HttpApiSchema.status(400)), ChatsGetRun401.pipe(HttpApiSchema.status(401)), ChatsGetRun404.pipe(HttpApiSchema.status(404))] })
      .middleware(CookieSecurityMiddleware)
      .annotate(OpenApi.Identifier, "chats.getRun")) {}

class HealthGroup extends HttpApiGroup.make("health")
  .add(HttpApiEndpoint.get("healthGet", "/health", { success: HealthGet200, error: HealthGet400.pipe(HttpApiSchema.status(400)) })
      .annotate(OpenApi.Identifier, "health.get")) {}

class UsersGroup extends HttpApiGroup.make("users")
  .add(HttpApiEndpoint.post("usersRecognise", "/users", { success: UsersRecognise201.pipe(HttpApiSchema.status(201)), error: UsersRecognise400.pipe(HttpApiSchema.status(400)) })
      .annotate(OpenApi.Identifier, "users.recognise")) {}

export class Api extends HttpApi.make("Api")
  .annotate(OpenApi.Title, "Api")
  .annotate(OpenApi.Version, "0.0.1")
  .add(ChatsGroup, HealthGroup, UsersGroup) {}


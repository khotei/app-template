import { Context, Effect, Layer } from 'effect'

import type { GenerateChatTitle } from '@app-template/application/chat'
import { GenerateChatTitleUseCase } from '@app-template/application/use-cases'

export class ChatTitleHandler extends Context.Service<
  ChatTitleHandler,
  { readonly handle: (job: GenerateChatTitle) => Effect.Effect<void> }
>()('@app-template/apps/worker/chat/ChatTitleHandler', {
  make: Effect.gen(function* () {
    const useCase = yield* GenerateChatTitleUseCase

    const handle = Effect.fn('ChatTitleHandler.handle')(useCase.generate)

    return { handle }
  }),
}) {
  static readonly layer = Layer.effect(this, this.make).pipe(
    Layer.provide(GenerateChatTitleUseCase.layer),
  )
}

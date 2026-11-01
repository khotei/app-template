import { Effect, Layer } from 'effect'

import {
  chatTitleDeadLetterQueue,
  chatTitleQueue,
  type GenerateChatTitle,
} from '@app-template/infrastructure/chat'
import { worker } from '@app-template/queue'
import { GenerateChatTitleUseCase } from '@app-template/use-cases/chat'

export const handle = Effect.fn('ChatTitleHandler.handle')(
  (job: GenerateChatTitle): Effect.Effect<void, never, GenerateChatTitleUseCase> =>
    GenerateChatTitleUseCase.use((useCase) => useCase.generate(job)),
)

export const handleDeadLettered = Effect.fn('ChatTitleHandler.handleDeadLettered')(
  (): Effect.Effect<void> => Effect.logError('chat title dead-lettered'),
)

export const ChatTitleHandler = Layer.mergeAll(
  worker(chatTitleQueue, handle),
  worker(chatTitleDeadLetterQueue, handleDeadLettered),
).pipe(Layer.provide(GenerateChatTitleUseCase.layer))

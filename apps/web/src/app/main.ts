import { Effect } from 'effect'

import { renderHealthPanel } from '#web/features/health/health-panel'
import { ApiClientProxied } from '#web/shared/api'

const root = document.getElementById('root')
if (root === null) throw new Error('#root element is missing from index.html')

Effect.runFork(renderHealthPanel(root).pipe(Effect.provide(ApiClientProxied)))

if (import.meta.hot) import.meta.hot.accept()

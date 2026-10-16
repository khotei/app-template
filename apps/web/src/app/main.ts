import { renderHealthPanel } from '#web/features/example/health-panel'
import { apiClient } from '#web/shared/api'

const root = document.getElementById('root')
if (root === null) throw new Error('#root element is missing from index.html')

void renderHealthPanel(root, apiClient)

if (import.meta.hot) import.meta.hot.accept()

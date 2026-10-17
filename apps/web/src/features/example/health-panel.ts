import type { ApiClient } from '@app-template/api-client'
import { joinClassNames } from '@app-template/ui'

export const renderHealthPanel = async (root: HTMLElement, apiClient: ApiClient): Promise<void> => {
  const panel = document.createElement('p')
  root.replaceChildren(panel)
  try {
    const health = await apiClient.getHealth()
    panel.className = joinClassNames('health', health.status === 'ok' && 'health--ok')
    panel.textContent = `API status: ${health.status}`
  } catch (error) {
    panel.className = joinClassNames('health', 'health--down')
    panel.textContent = `API unreachable: ${String(error)}`
  }
}

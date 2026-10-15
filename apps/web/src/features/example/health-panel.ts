import type { ApiClient } from '@oblik/api-client'
import { joinClassNames } from '@oblik/ui'

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

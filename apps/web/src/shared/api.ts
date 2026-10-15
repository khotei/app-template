import { createApiClient } from '@oblik/api-client'

export const apiClient = createApiClient(new URL('/api/', window.location.origin).href)

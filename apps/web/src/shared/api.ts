import { createApiClient } from '@app-template/api-client'

export const apiClient = createApiClient(new URL('/api/', window.location.origin).href)

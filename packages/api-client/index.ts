export interface Health {
  readonly status: 'ok'
}

export interface ApiClient {
  getHealth(): Promise<Health>
}

export const createApiClient = (baseUrl: string): ApiClient => {
  const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`
  return {
    async getHealth() {
      const response = await fetch(new URL('health', base))
      if (!response.ok) throw new Error(`GET health failed with ${response.status}`)
      return (await response.json()) as Health
    },
  }
}

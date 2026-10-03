import { HttpApi } from './http'
import { MockApi } from './mock'
import type { WalrusApi } from './types'

/** Live by default. `npm run dev:mock` (or VITE_API_MODE=mock) runs against the in-browser mock. */
export const MOCK = import.meta.env.VITE_API_MODE === 'mock'

export function createApi(tenantId: string): WalrusApi {
  return MOCK ? new MockApi(tenantId) : new HttpApi()
}

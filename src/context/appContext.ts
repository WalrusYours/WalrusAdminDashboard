import { createContext, useContext } from 'react'
import type { Tenant, WalrusApi } from '../api/types'

export interface AppState {
  api: WalrusApi
  tenantId: string
  setTenantId: (id: string) => void
  tenants: Tenant[]
  refreshTenants: () => Promise<void>
}

export const AppContext = createContext<AppState | null>(null)

export function useApp(): AppState {
  const v = useContext(AppContext)
  if (!v) throw new Error('useApp outside AppProvider')
  return v
}

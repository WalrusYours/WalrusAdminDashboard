import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { MOCK, createApi } from '../api'
import type { Tenant } from '../api/types'
import { AppContext } from './appContext'

const KEY = `walrus-dashboard-tenant-${MOCK ? 'mock' : 'live'}`
const DEFAULT_TENANT = MOCK ? 't_demo' : 'default'

function readTenant(): string {
  try {
    return localStorage.getItem(KEY) ?? DEFAULT_TENANT
  } catch {
    return DEFAULT_TENANT
  }
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [tenantId, setTenant] = useState(readTenant)
  const [tenants, setTenants] = useState<Tenant[]>([])
  const api = useMemo(() => createApi(tenantId), [tenantId])

  const refreshTenants = useCallback(async () => {
    setTenants(await api.listTenants())
  }, [api])

  useEffect(() => {
    void refreshTenants()
  }, [refreshTenants])

  const setTenantId = useCallback((id: string) => {
    setTenant(id)
    try {
      localStorage.setItem(KEY, id)
    } catch {
      /* ignore */
    }
  }, [])

  return (
    <AppContext.Provider value={{ api, tenantId, setTenantId, tenants, refreshTenants }}>
      {children}
    </AppContext.Provider>
  )
}

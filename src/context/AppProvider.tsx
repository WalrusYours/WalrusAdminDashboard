import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { MockApi } from '../api/mock'
import type { Tenant } from '../api/types'
import { AppContext } from './appContext'

const KEY = 'walrus-dashboard-tenant'

function readTenant(): string {
  try {
    return localStorage.getItem(KEY) ?? 't_demo'
  } catch {
    return 't_demo'
  }
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [tenantId, setTenant] = useState(readTenant)
  const [tenants, setTenants] = useState<Tenant[]>([])
  const api = useMemo(() => new MockApi(tenantId), [tenantId])

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

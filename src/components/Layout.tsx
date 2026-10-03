import { useEffect, useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import type { Health } from '../api/types'
import { useApp } from '../context/appContext'
import { useDraft } from '../context/draftContext'
import { useI18n } from '../i18n/i18nContext'
import { IconGear, IconHome, IconKey, IconSchema, IconSliders } from './icons'
import { Logo } from './Logo'
import { cx } from './ui'

const NAV = [
  { to: '/', label: 'Overview', icon: <IconHome />, end: true },
  { to: '/schema', label: 'Schema', icon: <IconSchema /> },
  { to: '/weights', label: 'Weights', icon: <IconSliders /> },
  { to: '/tenants', label: 'Tenants & keys', icon: <IconKey /> },
]

const navClass = ({ isActive }: { isActive: boolean }) =>
  cx(
    'relative flex items-center gap-3 whitespace-nowrap rounded-lg px-3 py-2 text-sm transition-colors',
    isActive
      ? 'bg-accent-soft text-accent before:absolute before:left-0 before:top-2 before:bottom-2 before:w-0.5 before:rounded-full before:bg-accent'
      : 'text-muted hover:bg-raised hover:text-ink',
  )

export function Layout() {
  const { api, tenantId, setTenantId, tenants } = useApp()
  const { t } = useI18n()
  const [health, setHealth] = useState<Health | null>(null)
  useEffect(() => {
    api.health().then(setHealth, () => setHealth(null))
  }, [api])
  const { dirty } = useDraft()

  return (
    <div className="min-h-screen md:grid md:grid-cols-[240px_1fr]">
      <aside className="flex flex-col gap-5 border-b border-line bg-panel p-4 md:sticky md:top-0 md:h-screen md:border-b-0 md:border-r">
        <div className="flex items-center gap-3 px-1">
          <Logo size={34} />
          <div className="leading-tight">
            <div className="text-base font-semibold tracking-tight">WALRUS</div>
            <div className="text-xs text-faint">{t('Admin dashboard')}</div>
          </div>
        </div>

        <label className="block">
          <span className="mb-1.5 block px-1 text-xs uppercase tracking-wider text-faint">{t('Tenant')}</span>
          <select
            value={tenantId}
            onChange={(e) => setTenantId(e.target.value)}
            className="w-full rounded-lg border border-line-strong bg-raised px-3 py-2 text-sm text-ink"
          >
            {tenants.map((tn) => (
              <option key={tn.id} value={tn.id}>
                {tn.name}
              </option>
            ))}
          </select>
        </label>

        <nav className="flex gap-1 overflow-x-auto md:flex-col">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} className={navClass}>
              {n.icon}
              {t(n.label)}
              {n.to === '/weights' && dirty && <span className="ml-auto size-2 rounded-full bg-accent" title={t('Unsaved changes')} />}
            </NavLink>
          ))}
        </nav>

        <div className="space-y-1 md:mt-auto">
          <div className="flex items-center gap-2 px-3 pb-1 text-xs text-faint">
            <span className={cx('size-2 rounded-full', api.mode === 'mock' ? 'bg-warn' : health?.status === 'ok' ? 'bg-ok' : 'bg-bad')} />
            <span className="truncate">{api.mode === 'mock' ? t('mock data') : (health?.instance_name ?? t('live'))}</span>
          </div>
          <NavLink to="/settings" className={navClass}>
            <IconGear />
            {t('Settings')}
          </NavLink>
        </div>
      </aside>

      <main className="mx-auto w-full max-w-6xl px-4 py-8 md:px-8">
        <Outlet />
      </main>
    </div>
  )
}

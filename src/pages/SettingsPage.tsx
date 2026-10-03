import { useEffect, useState, type ReactNode } from 'react'
import { resetMock } from '../api/mock'
import type { Health } from '../api/types'
import { Badge, Button, Card, PageHeader, cx } from '../components/ui'
import { useApp } from '../context/appContext'
import { LOCALES, useI18n, type Locale } from '../i18n/i18nContext'
import { useTheme, type ThemeSetting } from '../theme/themeContext'

function Choice<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T
  options: { id: T; title: string; hint?: string }[]
  onChange: (v: T) => void
  label: string
}) {
  return (
    <div role="radiogroup" aria-label={label} className="grid gap-2 sm:grid-cols-3">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={value === o.id}
          onClick={() => onChange(o.id)}
          className={cx(
            'rounded-xl border px-4 py-3 text-left transition-colors',
            value === o.id ? 'border-accent bg-accent-soft' : 'border-line bg-raised hover:border-line-strong',
          )}
        >
          <div className={cx('text-sm font-semibold', value === o.id && 'text-accent')}>{o.title}</div>
          {o.hint && <div className="mt-0.5 text-xs text-muted">{o.hint}</div>}
        </button>
      ))}
    </div>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-line py-2.5 text-sm last:border-b-0">
      <dt className="text-faint">{label}</dt>
      <dd className="text-right font-mono text-xs text-ink">{children}</dd>
    </div>
  )
}

export function SettingsPage() {
  const { api } = useApp()
  const { t, locale, setLocale } = useI18n()
  const { setting, setSetting } = useTheme()
  const [health, setHealth] = useState<Health | null>(null)

  useEffect(() => {
    api.health().then(setHealth, () => setHealth(null))
  }, [api])

  return (
    <>
      <PageHeader title={t('Settings')} subtitle={t('Interface, account and engine details.')} />

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <Card title={t('Appearance')}>
            <Choice<ThemeSetting>
              label={t('Theme')}
              value={setting}
              onChange={setSetting}
              options={[
                { id: 'dark', title: t('Dark'), hint: t('Near-black surfaces') },
                { id: 'light', title: t('Light'), hint: t('Warm paper surfaces') },
                { id: 'system', title: t('Auto'), hint: t('Follow the system') },
              ]}
            />
          </Card>

          <Card title={t('Language')}>
            <Choice<Locale>
              label={t('Language')}
              value={locale}
              onChange={setLocale}
              options={LOCALES.map((l) => ({ id: l.id, title: l.label }))}
            />
            <p className="mt-3 text-xs text-faint">{t('Your choice is remembered in this browser.')}</p>
          </Card>

          <Card title={t('Account')}>
            {api.mode === 'live' ? (
              <div className="space-y-4">
                <p className="text-sm text-muted">{t('Signed in as administrator.')}</p>
                <Button variant="danger" onClick={() => void api.logout().then(() => location.reload())}>
                  {t('Sign out')}
                </Button>
                <p className="text-xs text-faint">{t('The administrator key is set in the engine environment (WALRUS_ADMIN_KEY). There is no sign-up.')}</p>
              </div>
            ) : (
              <p className="text-sm text-muted">{t('Demo mode: there is no account to sign out of.')}</p>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card title={t('Engine')} action={api.mode === 'live' ? <Badge tone="ok">{t('live')}</Badge> : <Badge tone="warn">{t('mock data')}</Badge>}>
            <dl>
              <Row label={t('Name')}>{health?.instance_name ?? '—'}</Row>
              <Row label={t('Instance ID')}>{health?.instance_id ?? '—'}</Row>
              <Row label={t('Version')}>{health?.version ?? '—'}</Row>
              <Row label={t('Status')}>{health?.status ?? '—'}</Row>
            </dl>
          </Card>

          {api.mode === 'mock' && (
            <Card title={t('Demo data')}>
              <p className="mb-4 text-sm text-muted">{t('Running against an in-browser mock of the WALRUS API.')}</p>
              <Button
                onClick={() => {
                  resetMock()
                  location.reload()
                }}
              >
                {t('Reset demo data')}
              </Button>
            </Card>
          )}
        </div>
      </div>
    </>
  )
}

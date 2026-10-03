import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { ALL_SCOPES, type ApiKey, type IssuedKey, type Scope } from '../api/types'
import { Badge, Button, Card, CopyButton, Empty, Notice, PageHeader, timeAgo } from '../components/ui'
import { useApp } from '../context/appContext'

const SCOPE_HINT: Record<Scope, string> = {
  'schema:write': 'push schemas (platform CI)',
  ingest: 'send entities and events',
  recommend: 'ask for recommendations',
  admin: 'tenants and keys (operator only)',
}

const EXPIRY = [
  { label: 'No expiry', days: 0 },
  { label: '30 days', days: 30 },
  { label: '90 days', days: 90 },
  { label: '1 year', days: 365 },
]

export function TenantsPage() {
  const { api, tenants, tenantId, setTenantId, refreshTenants } = useApp()
  const [keys, setKeys] = useState<ApiKey[]>([])
  const [name, setName] = useState('')
  const [scopes, setScopes] = useState<Scope[]>(['ingest', 'recommend'])
  const [days, setDays] = useState(90)
  const [issued, setIssued] = useState<IssuedKey | null>(null)

  const tenant = tenants.find((t) => t.id === tenantId)
  const loadKeys = useCallback(async () => setKeys(await api.listKeys(tenantId)), [api, tenantId])
  useEffect(() => {
    setIssued(null)
    void loadKeys()
  }, [loadKeys])

  async function createTenant(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    const t = await api.createTenant(name.trim())
    setName('')
    await refreshTenants()
    setTenantId(t.id)
  }

  async function issue(e: FormEvent) {
    e.preventDefault()
    if (scopes.length === 0) return
    setIssued(await api.issueKey(tenantId, scopes, days || undefined))
    await loadKeys()
  }

  const toggle = (s: Scope) => setScopes((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]))

  return (
    <>
      <PageHeader
        title="Tenants & keys"
        subtitle="Each tenant has its own schema, data and API keys. A key identifies its tenant and carries scopes; the secret is shown once."
      />

      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <div className="space-y-6">
          <Card title="Tenants">
            <ul className="mb-4 space-y-1">
              {tenants.map((t) => (
                <li key={t.id}>
                  <button
                    onClick={() => setTenantId(t.id)}
                    className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                      t.id === tenantId ? 'bg-accent-soft text-accent' : 'text-muted hover:bg-raised hover:text-ink'
                    }`}
                  >
                    <span>{t.name}</span>
                    <span className="font-mono text-xs text-faint">{t.id}</span>
                  </button>
                </li>
              ))}
            </ul>
            <form onSubmit={createTenant} className="flex gap-2">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="new tenant name"
                className="min-w-0 flex-1 rounded-lg border border-line-strong bg-raised px-3 py-2 text-sm placeholder:text-faint"
              />
              <Button type="submit" variant="primary" disabled={!name.trim()}>
                Create
              </Button>
            </form>
          </Card>
        </div>

        <div className="space-y-6">
          <Card title={`Issue a key for ${tenant?.name ?? '…'}`}>
            <form onSubmit={issue} className="space-y-4">
              <fieldset>
                <legend className="mb-2 text-xs uppercase tracking-wider text-faint">Scopes</legend>
                <div className="grid gap-2 sm:grid-cols-2">
                  {ALL_SCOPES.map((s) => (
                    <label key={s} className="flex items-start gap-2 rounded-lg border border-line bg-raised px-3 py-2 text-sm">
                      <input type="checkbox" checked={scopes.includes(s)} onChange={() => toggle(s)} className="mt-1 accent-accent" />
                      <span>
                        <span className="font-mono text-xs">{s}</span>
                        <span className="block text-xs text-faint">{SCOPE_HINT[s]}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <div className="flex flex-wrap items-center gap-3">
                <select
                  value={days}
                  onChange={(e) => setDays(Number(e.target.value))}
                  className="rounded-lg border border-line-strong bg-raised px-3 py-2 text-sm"
                  aria-label="Expiry"
                >
                  {EXPIRY.map((x) => (
                    <option key={x.days} value={x.days}>
                      {x.label}
                    </option>
                  ))}
                </select>
                <Button type="submit" variant="primary" disabled={scopes.length === 0}>
                  Issue key
                </Button>
              </div>
            </form>

            {issued && (
              <div className="mt-5 space-y-2">
                <Notice tone="accent" title="Copy this key now">
                  It is shown once and stored only as a hash. If you lose it, revoke it and issue a new one.
                </Notice>
                <div className="flex items-center gap-2">
                  <code className="min-w-0 flex-1 overflow-x-auto rounded-lg border border-line-strong bg-canvas px-3 py-2 font-mono text-xs">
                    {issued.secret}
                  </code>
                  <CopyButton text={issued.secret} />
                </div>
              </div>
            )}
          </Card>

          <Card title="Keys">
            {keys.length === 0 ? (
              <Empty>No keys for this tenant yet.</Empty>
            ) : (
              <ul className="divide-y divide-line">
                {keys.map((k) => {
                  const expired = k.expiresAt && new Date(k.expiresAt) < new Date()
                  return (
                    <li key={k.id} className="flex flex-wrap items-center gap-3 py-3 text-sm">
                      <span className="font-mono text-xs text-muted">{k.id}</span>
                      <span className="flex flex-wrap gap-1.5">
                        {k.scopes.map((s) => (
                          <Badge key={s}>{s}</Badge>
                        ))}
                      </span>
                      {k.revokedAt ? (
                        <Badge tone="bad">revoked</Badge>
                      ) : expired ? (
                        <Badge tone="warn">expired</Badge>
                      ) : (
                        <Badge tone="ok">active</Badge>
                      )}
                      <span className="text-xs text-faint">
                        created {timeAgo(k.createdAt)} · last used {timeAgo(k.lastUsedAt)}
                        {k.expiresAt && !expired && ` · expires ${new Date(k.expiresAt).toLocaleDateString()}`}
                      </span>
                      {!k.revokedAt && (
                        <Button variant="danger" className="ml-auto" onClick={() => void api.revokeKey(k.id).then(loadKeys)}>
                          Revoke
                        </Button>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  )
}

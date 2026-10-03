import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import type { Health, JobStatus } from '../api/types'
import { Badge, Button, Card, Empty, PageHeader, Stat } from '../components/ui'
import { useApp } from '../context/appContext'
import { useDraft } from '../context/draftContext'
import { useI18n } from '../i18n/i18nContext'
import { summarize } from '../lib/schema'

export function OverviewPage() {
  const { api, tenants, tenantId } = useApp()
  const { active } = useDraft()
  const { t, tp, timeAgo } = useI18n()
  const [health, setHealth] = useState<Health | null>(null)
  const [job, setJob] = useState<JobStatus | null>(null)

  const loadJob = useCallback(async () => setJob(await api.precomputeStatus()), [api])

  useEffect(() => {
    api.health().then(setHealth, () => setHealth({ status: 'down' }))
    void loadJob()
  }, [api, loadJob])

  // poll only while a precompute job is running
  useEffect(() => {
    if (!job?.running) return
    const timer = setInterval(() => void loadJob(), 1000)
    return () => clearInterval(timer)
  }, [job?.running, loadJob])

  const summary = useMemo(() => (active ? summarize(active.yaml) : null), [active])
  const tenant = tenants.find((tn) => tn.id === tenantId)

  return (
    <>
      <PageHeader
        title={tenant?.name ?? t('Overview')}
        subtitle={t('Health, active schema and background jobs for the selected tenant.')}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label={t('Server')}
          value={
            <span className="flex items-center gap-2">
              <span className={`size-2.5 rounded-full ${health?.status === 'ok' ? 'bg-ok' : 'bg-bad'}`} />
              {health?.status ?? '…'}
            </span>
          }
          hint={health?.instance_name ? `${health.instance_name} · ${health.instance_id?.slice(0, 8)}` : health?.version}
        />
        <Stat label={t('Schema version')} value={active ? `v${active.version}` : '—'} hint={active ? active.hash.slice(0, 12) : t('none pushed')} />
        <Stat
          label={t('Signals')}
          value={summary?.signals.length ?? '—'}
          hint={`${tp('{count} knobs', summary?.knobs.length ?? 0)}, ${tp('{count} presets', Object.keys(summary?.presets ?? {}).length)}`}
        />
        <Stat
          label={t('Entities')}
          value={summary?.entities.length ?? '—'}
          hint={tp('{count} interaction types', summary?.interactions.length ?? 0)}
        />
      </div>

      <div className="mt-6 grid items-start gap-6 lg:grid-cols-2">
        <Card
          title={t('Active schema')}
          action={
            <Link to="/schema" className="text-sm text-accent hover:text-accent-hover">
              {t('Manage')}
            </Link>
          }
        >
          {summary ? (
            <div className="space-y-4 text-sm">
              <div>
                <div className="mb-1.5 text-xs uppercase tracking-wider text-faint">{t('Entities')}</div>
                <div className="flex flex-wrap gap-2">
                  {summary.entities.map((e) => (
                    <Badge key={e.id}>
                      {e.id} · {tp('{count} attributes', e.attributes)}
                    </Badge>
                  ))}
                </div>
              </div>
              <div>
                <div className="mb-1.5 text-xs uppercase tracking-wider text-faint">{t('Interactions')}</div>
                <div className="flex flex-wrap gap-2">
                  {summary.interactions.map((i) => (
                    <Badge key={i}>{i}</Badge>
                  ))}
                </div>
              </div>
              <div>
                <div className="mb-1.5 text-xs uppercase tracking-wider text-faint">{t('User knobs')}</div>
                <ul className="space-y-1 text-muted">
                  {summary.knobs.map((k) => (
                    <li key={k.id}>{k.label}</li>
                  ))}
                </ul>
              </div>
            </div>
          ) : (
            <Empty>
              {t('No schema pushed for this tenant yet.')}{' '}
              <Link to="/schema" className="text-accent">
                {t('Upload one')}
              </Link>
            </Empty>
          )}
        </Card>

        <Card
          title={t('Similarity precompute')}
          action={
            <Button
              variant="primary"
              disabled={job?.running || api.mode === 'live'}
              title={api.mode === 'live' ? t('Not available on this engine yet') : undefined}
              onClick={() => void api.triggerPrecompute().then(loadJob)}
            >
              {job?.running ? t('Running…') : t('Run now')}
            </Button>
          }
        >
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
            <dt className="text-faint">{t('Status')}</dt>
            <dd>{job?.running ? <Badge tone="accent">{t('running')}</Badge> : <Badge tone="ok">{t('idle')}</Badge>}</dd>
            <dt className="text-faint">{t('Last run')}</dt>
            <dd className="text-muted">{timeAgo(job?.lastRun)}</dd>
            <dt className="text-faint">{t('Duration')}</dt>
            <dd className="text-muted">{job?.lastDurationMs ? t('{n} s', { n: (job.lastDurationMs / 1000).toFixed(1) }) : '—'}</dd>
            {job?.lastError && (
              <>
                <dt className="text-faint">{t('Error')}</dt>
                <dd className="text-bad">{job.lastError}</dd>
              </>
            )}
          </dl>
          <p className="mt-4 text-xs text-faint">
            {t('Rebuilds the item-item and user-user neighbour graph. It runs on a timer; trigger it after a large import or a breaking schema change.')}
          </p>
        </Card>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        {[
          { to: '/schema', title: 'Publish a schema', text: 'Upload YAML, check the diff, apply.' },
          { to: '/weights', title: 'Tune weights', text: 'Adjust signal defaults and preview knobs.' },
          { to: '/tenants', title: 'Manage access', text: 'Create tenants and issue scoped keys.' },
        ].map((a) => (
          <Link
            key={a.to}
            to={a.to}
            className="group rounded-xl border border-line bg-panel p-4 transition-colors hover:border-accent/50 hover:bg-raised"
          >
            <div className="flex items-center justify-between text-sm font-semibold">
              {t(a.title)}
              <span className="text-faint transition-transform group-hover:translate-x-0.5 group-hover:text-accent">→</span>
            </div>
            <p className="mt-1 text-xs text-muted">{t(a.text)}</p>
          </Link>
        ))}
      </div>
    </>
  )
}

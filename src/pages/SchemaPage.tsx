import { useCallback, useEffect, useRef, useState, type DragEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { SchemaVersion, Verdict } from '../api/types'
import { DataGraphEditor, DeployBar, ScoringGraphEditor } from '../components/SchemaGraph'
import { Badge, Button, Card, Empty, Notice, PageHeader, cx } from '../components/ui'
import { VersionDiffDialog } from '../components/VersionDiff'
import { YamlEditor } from '../components/YamlEditor'
import { useApp } from '../context/appContext'
import { useDraft } from '../context/draftContext'
import { usePublish } from '../context/usePublish'
import { useI18n } from '../i18n/i18nContext'

const VERDICT_TONE: Record<Verdict, 'neutral' | 'ok' | 'warn'> = { none: 'neutral', additive: 'ok', breaking: 'warn' }

const TABS = [
  { id: 'yaml', label: 'YAML' },
  { id: 'data', label: 'Data graph' },
  { id: 'scoring', label: 'Scoring graph' },
] as const
type View = (typeof TABS)[number]['id']

export function SchemaPage() {
  const { api } = useApp()
  const { t, tp, msg, timeAgo } = useI18n()
  const { active, text, setText, dirty, discard } = useDraft()
  const [history, setHistory] = useState<SchemaVersion[]>([])
  const [dragging, setDragging] = useState(false)
  const [diffFor, setDiffFor] = useState<number | null>(null)
  const [params, setParams] = useSearchParams()
  const view: View = TABS.find((tab) => tab.id === params.get('view'))?.id ?? 'yaml'
  const setView = (v: View) => setParams(v === 'yaml' ? {} : { view: v }, { replace: true })
  const fileRef = useRef<HTMLInputElement>(null)

  const loadHistory = useCallback(async () => setHistory(await api.schemaHistory()), [api])
  useEffect(() => {
    void loadHistory()
  }, [loadHistory, active?.version])

  const { errors, diff, result, busy, confirm, setConfirm, needsConfirm, canApply, run } = usePublish(loadHistory)

  async function readFile(file: File | undefined) {
    if (!file) return
    setText((await file.text()).replace(/^﻿/, '').replace(/\r\n?/g, '\n'))
  }

  function onDrop(e: DragEvent) {
    e.preventDefault()
    setDragging(false)
    void readFile(e.dataTransfer.files[0])
  }

  return (
    <>
      <PageHeader
        title={t('Schema')}
        subtitle={t('Edit the schema as YAML or through the graphs. Every view edits the same draft; validation runs as you type and the engine re-checks on deploy.')}
        action={
          <div className="flex gap-2">
            <input
              ref={fileRef}
              type="file"
              accept=".yml,.yaml,text/yaml"
              className="hidden"
              onChange={(e) => void readFile(e.target.files?.[0])}
            />
            <Button onClick={() => fileRef.current?.click()}>{t('Upload YAML')}</Button>
            <Button variant="ghost" disabled={!dirty} onClick={discard}>
              {t('Discard changes')}
            </Button>
          </div>
        }
      />

      <div role="tablist" aria-label={t('Schema views')} className="mb-6 flex gap-1 border-b border-line">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={view === tab.id}
            onClick={() => setView(tab.id)}
            className={cx(
              '-mb-px border-b-2 px-4 py-2.5 text-sm transition-colors',
              view === tab.id ? 'border-accent text-accent' : 'border-transparent text-muted hover:text-ink',
            )}
          >
            {t(tab.label)}
          </button>
        ))}
        {dirty && <span className="ml-auto self-center pb-1 text-xs text-accent">{t('unsaved changes')}</span>}
      </div>

      {view === 'yaml' && (
        <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
          <Card
            title={
              <span className="flex items-center gap-2">
                schema.yml {dirty && <Badge tone="accent">{t('edited')}</Badge>}
                {active && <Badge>{t('active v{n}', { n: active.version })}</Badge>}
              </span>
            }
          >
            <div
              onDragOver={(e) => {
                e.preventDefault()
                setDragging(true)
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              className={cx('relative rounded-lg', dragging && 'ring-2 ring-accent')}
            >
              <YamlEditor value={text} onChange={setText} placeholder={t('Paste a schema here, or drop a .yml file.')} />
              {dragging && (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-lg border-2 border-dashed border-accent bg-canvas/85 text-sm text-accent">
                  {t('Drop a .yml file to load it')}
                </div>
              )}
            </div>
          </Card>

          <div className="space-y-6">
            <Card title={t('Checks')}>
              {!text.trim() ? (
                <Empty>{t('Nothing to check yet.')}</Empty>
              ) : errors.length === 0 ? (
                <Notice tone="ok" title={t('Valid')}>
                  {t('Structure, references, identifiers and knob expressions all check out.')}
                </Notice>
              ) : (
                <div className="space-y-2">
                  <Notice tone="bad" title={tp('{count} problems', errors.length)} />
                  <ul className="max-h-64 space-y-2 overflow-y-auto text-sm">
                    {errors.map((e, i) => (
                      <li key={i} className="rounded-lg border border-line bg-raised px-3 py-2">
                        {e.path && <div className="font-mono text-xs text-accent">{e.path}</div>}
                        <div className="text-muted">{e.message}</div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {result && result.errors.length > 0 && (
                <div className="mt-4 space-y-2">
                  <Notice tone="bad" title={tp('Engine: {count} problems', result.errors.length)} />
                  <ul className="max-h-64 space-y-2 overflow-y-auto text-sm">
                    {result.errors.map((e, i) => (
                      <li key={i} className="rounded-lg border border-line bg-raised px-3 py-2">
                        {e.path && <div className="font-mono text-xs text-accent">{e.path}</div>}
                        <div className="text-muted">{e.message}</div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </Card>

            <Card title={t('Changes vs active')} action={diff && <Badge tone={VERDICT_TONE[diff.verdict]}>{t(diff.verdict)}</Badge>}>
              {!diff || diff.changes.length === 0 ? (
                <p className="text-sm text-faint">{t('No differences from the active version.')}</p>
              ) : (
                <ul className="max-h-56 space-y-1 overflow-y-auto font-mono text-xs">
                  {diff.changes.slice(0, 60).map((c, i) => (
                    <li key={i} className={cx(c.startsWith('+') && 'text-ok', c.startsWith('-') && 'text-bad', c.startsWith('~') && 'text-warn')}>
                      {c}
                    </li>
                  ))}
                  {diff.changes.length > 60 && <li className="text-faint">… {tp('{count} more', diff.changes.length - 60)}</li>}
                </ul>
              )}
              {needsConfirm && (
                <label className="mt-4 flex items-start gap-2 text-sm text-muted">
                  <input type="checkbox" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} className="mt-1 accent-accent" />
                  {t('This removes or retypes something. I understand a re-import and re-precompute are required.')}
                </label>
              )}
            </Card>

            <Card title={t('Publish')}>
              <div className="flex gap-2">
                <Button disabled={busy || !text.trim() || errors.length > 0} onClick={() => void run(true)}>
                  {t('Dry run')}
                </Button>
                <Button variant="primary" disabled={busy || !canApply} onClick={() => void run(false)}>
                  {busy ? t('Working…') : t('Apply')}
                </Button>
              </div>
              {result && (
                <div className="mt-4">
                  <Notice tone={result.ok ? 'ok' : result.needsConfirm ? 'warn' : 'bad'} title={result.ok ? t('Server accepted') : t('Server refused')}>
                    {msg(result.message ?? '')}
                  </Notice>
                </div>
              )}
            </Card>
          </div>
        </div>
      )}

      {view !== 'yaml' && (
        <div className="space-y-4">
          <Card
            title={
              <span className="flex items-center gap-2">
                {view === 'data' ? t('Data graph') : t('Scoring graph')}
                {dirty && <Badge tone="accent">{t('edited')}</Badge>}
                {active && <Badge>{t('active v{n}', { n: active.version })}</Badge>}
              </span>
            }
          >
            {!text.trim() ? <Empty>{t('Add or upload a schema first.')}</Empty> : view === 'data' ? <DataGraphEditor /> : <ScoringGraphEditor />}
          </Card>
          <DeployBar />
        </div>
      )}

      {diffFor !== null && <VersionDiffDialog versions={history} startAt={diffFor} draft={text} onClose={() => setDiffFor(null)} />}

      <Card title={t('Version history')} className="mt-6">
        {history.length === 0 ? (
          <Empty>{t('No versions yet. Apply a schema to create version 1.')}</Empty>
        ) : (
          <ul className="divide-y divide-line">
            {history.map((v) => (
              <li key={v.version} className="flex flex-wrap items-center gap-3 py-3 text-sm">
                <Badge tone="accent">v{v.version}</Badge>
                <Badge tone={VERDICT_TONE[v.verdict]}>{t(v.verdict)}</Badge>
                <span className="font-mono text-xs text-faint">{v.hash.slice(0, 12)}</span>
                <span className="text-muted">
                  {v.author} · {timeAgo(v.at)}
                </span>
                <span className="ml-auto flex gap-1">
                  <Button variant="ghost" onClick={() => setDiffFor(v.version)}>
                    {t('View diff')}
                  </Button>
                  <Button variant="ghost" onClick={() => setText(v.yaml)}>
                    {t('Load into editor')}
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  )
}

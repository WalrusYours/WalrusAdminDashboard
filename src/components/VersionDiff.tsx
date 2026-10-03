import { useEffect, useMemo, useState } from 'react'
import type { SchemaVersion, Verdict } from '../api/types'
import { useI18n } from '../i18n/i18nContext'
import { collapse, lineDiff, stats } from '../lib/diff'
import { diffSchemas } from '../lib/schema'
import { Badge, Button, cx } from './ui'

type From = number | 'empty'
type To = number | 'draft'

const VERDICT_TONE: Record<Verdict, 'neutral' | 'ok' | 'warn'> = { none: 'neutral', additive: 'ok', breaking: 'warn' }

export function VersionDiffDialog({
  versions,
  startAt,
  draft,
  onClose,
}: {
  versions: SchemaVersion[]
  startAt: number
  draft: string
  onClose: () => void
}) {
  const { t, tp, timeAgo } = useI18n()
  const [to, setTo] = useState<To>(startAt)
  const [from, setFrom] = useState<From>(startAt > 1 ? startAt - 1 : 'empty')
  const [view, setView] = useState<'yaml' | 'changes'>('yaml')

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const yamlOf = (k: From | To): string | null =>
    k === 'empty' ? null : k === 'draft' ? draft : (versions.find((v) => v.version === k)?.yaml ?? '')

  const oldText = yamlOf(from)
  const newText = yamlOf(to) ?? ''
  const lines = useMemo(() => lineDiff(oldText ?? '', newText), [oldText, newText])
  const chunks = useMemo(() => collapse(lines), [lines])
  const { added, removed } = useMemo(() => stats(lines), [lines])
  const structural = useMemo(() => diffSchemas(oldText, newText), [oldText, newText])

  const label = (v: SchemaVersion) => `v${v.version} · ${t(v.verdict)} · ${timeAgo(v.at)}`

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('Version diff')}
        className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-line-strong bg-panel shadow-2xl shadow-black"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="space-y-3 border-b border-line px-5 py-4">
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-xs text-muted">
              {t('From')}
              <select
                value={String(from)}
                onChange={(e) => setFrom(e.target.value === 'empty' ? 'empty' : Number(e.target.value))}
                className="rounded-lg border border-line-strong bg-raised px-3 py-1.5 text-sm text-ink"
                aria-label={t('Compare from')}
              >
                <option value="empty">{t('Nothing (empty)')}</option>
                {versions.map((v) => (
                  <option key={v.version} value={v.version}>
                    {label(v)}
                  </option>
                ))}
              </select>
            </label>
            <span className="text-faint">→</span>
            <label className="flex items-center gap-2 text-xs text-muted">
              {t('To')}
              <select
                value={String(to)}
                onChange={(e) => setTo(e.target.value === 'draft' ? 'draft' : Number(e.target.value))}
                className="rounded-lg border border-line-strong bg-raised px-3 py-1.5 text-sm text-ink"
                aria-label={t('Compare to')}
              >
                {versions.map((v) => (
                  <option key={v.version} value={v.version}>
                    {label(v)}
                  </option>
                ))}
                <option value="draft">{t('Your draft (unsaved)')}</option>
              </select>
            </label>
            <Button variant="ghost" className="ml-auto" onClick={onClose}>
              {t('Close')}
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Badge tone={VERDICT_TONE[structural.verdict]}>{t(structural.verdict)}</Badge>
            <span className="font-mono text-xs text-ok">+{added}</span>
            <span className="font-mono text-xs text-bad">−{removed}</span>
            <span className="text-xs text-faint">{tp('{count} schema changes', structural.changes.length)}</span>
            <div className="ml-auto flex items-center gap-1 rounded-lg border border-line bg-canvas p-1">
              {(
                [
                  ['yaml', t('YAML diff')],
                  ['changes', t('Changes')],
                ] as const
              ).map(([id, text]) => (
                <button
                  key={id}
                  onClick={() => setView(id)}
                  className={cx('rounded-md px-3 py-1 text-xs transition-colors', view === id ? 'bg-accent-soft text-accent' : 'text-muted hover:text-ink')}
                >
                  {text}
                </button>
              ))}
            </div>
          </div>
        </header>

        <div className="overflow-auto p-5">
          {added === 0 && removed === 0 ? (
            <p className="py-10 text-center text-sm text-faint">{t('These two are identical.')}</p>
          ) : view === 'yaml' ? (
            <div className="overflow-hidden rounded-lg border border-line bg-canvas font-mono text-[12.5px] leading-5">
              {chunks.map((c, ci) =>
                c.type === 'gap' ? (
                  <div key={ci} className="border-y border-line bg-raised px-4 py-1 text-center text-xs text-faint">
                    ⋯ {tp('{count} unchanged lines', c.count)}
                  </div>
                ) : (
                  c.lines.map((l, li) => (
                    <div key={`${ci}-${li}`} className={cx('flex whitespace-pre', l.kind === 'add' && 'bg-ok/10', l.kind === 'del' && 'bg-bad/10')}>
                      <span className="w-12 shrink-0 select-none pr-2 text-right text-faint">{l.oldNo ?? ''}</span>
                      <span className="w-12 shrink-0 select-none pr-2 text-right text-faint">{l.newNo ?? ''}</span>
                      <span className={cx('w-5 shrink-0 select-none text-center', l.kind === 'add' && 'text-ok', l.kind === 'del' && 'text-bad')}>
                        {l.kind === 'add' ? '+' : l.kind === 'del' ? '−' : ''}
                      </span>
                      <span className={cx('pr-4', l.kind === 'add' && 'text-ok', l.kind === 'del' && 'text-bad', l.kind === 'same' && 'text-muted')}>
                        {l.text || ' '}
                      </span>
                    </div>
                  ))
                ),
              )}
            </div>
          ) : (
            <ul className="space-y-1 font-mono text-xs">
              {structural.changes.length === 0 ? (
                <li className="text-faint">{t('No schema-level changes (comments or formatting only).')}</li>
              ) : (
                structural.changes.map((c, i) => (
                  <li key={i} className={cx(c.startsWith('+') && 'text-ok', c.startsWith('-') && 'text-bad', c.startsWith('~') && 'text-warn')}>
                    {c}
                  </li>
                ))
              )}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}

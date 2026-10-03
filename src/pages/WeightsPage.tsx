import { useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Badge, Button, Card, Empty, Notice, PageHeader, Slider, cx } from '../components/ui'
import { useDraft } from '../context/draftContext'
import {
  IDENT,
  deletePreset,
  diffSchemas,
  resolveWeights,
  setLocked,
  setPreset,
  setSignalDefault,
  summarize,
  validateSchema,
} from '../lib/schema'

const f2 = (n: number) => (Math.round(n * 100) / 100).toFixed(2)

export function WeightsPage() {
  const { text, setText, active, dirty } = useDraft()
  const summary = useMemo(() => summarize(text), [text])
  const errorCount = useMemo(() => (text.trim() ? validateSchema(text).length : 0), [text])
  const changeCount = useMemo(() => (dirty ? diffSchemas(active?.yaml ?? null, text).changes.length : 0), [dirty, active, text])

  const [knobVals, setKnobVals] = useState<Record<string, number>>({})
  const [presetName, setPresetName] = useState('')

  if (!summary || summary.signals.length === 0) {
    return (
      <>
        <PageHeader title="Weights" />
        <Empty>
          This tenant has no schema with signals yet.{' '}
          <Link to="/schema" className="text-accent">
            Upload a schema
          </Link>{' '}
          first.
        </Empty>
      </>
    )
  }

  const mid = (r: [number, number]) => (r[0] + r[1]) / 2
  const current = Object.fromEntries(summary.knobs.map((k) => [k.id, knobVals[k.id] ?? mid(k.range)]))
  const { weights, meta, errors: exprErrors } = resolveWeights(summary, current)
  const baseline = Object.fromEntries(summary.signals.map((s) => [s.id, s.default]))
  const scale = Math.max(1, ...Object.values(weights), ...Object.values(baseline))

  function loadPreset(name: string) {
    const base = Object.fromEntries(summary!.knobs.map((k) => [k.id, mid(k.range)]))
    setKnobVals({ ...base, ...(summary!.presets.default ?? {}), ...(summary!.presets[name] ?? {}) })
  }

  const nameOk = IDENT.test(presetName)
  const activePreset = Object.keys(summary.presets).find((p) => {
    const vals = { ...(summary.presets.default ?? {}), ...summary.presets[p] }
    return summary.knobs.every((k) => Math.abs((vals[k.id] ?? mid(k.range)) - current[k.id]) < 1e-6)
  })

  return (
    <>
      <PageHeader
        title="Weights"
        subtitle="Set each signal's default weight, then try the user-facing knobs to see the weights they resolve to. Edits go into the schema draft; publish them from the Schema page."
      />

      {errorCount > 0 && (
        <div className="mb-6">
          <Notice tone="warn" title="The draft has validation problems">
            Weights still preview, but fix the draft on the{' '}
            <Link to="/schema" className="text-accent">
              Schema page
            </Link>{' '}
            before applying.
          </Notice>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Signal defaults">
          <p className="mb-4 text-xs text-faint">
            The weight a signal has when the user has not touched any knob. Knob mappings override these.
          </p>
          <ul className="space-y-5">
            {summary.signals.map((s) => (
              <li key={s.id}>
                <div className="mb-1.5 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{s.id}</span>
                    <Badge>{s.type}</Badge>
                    {s.locked && <Badge tone="warn">locked</Badge>}
                    <button
                      className="text-xs text-faint hover:text-warn"
                      onClick={() => setText(setLocked(text, { kind: 'signal', id: s.id }, !s.locked))}
                    >
                      {s.locked ? 'unlock' : 'lock'}
                    </button>
                  </div>
                  <input
                    type="number"
                    step="0.05"
                    value={s.default}
                    disabled={s.locked}
                    onChange={(e) => setText(setSignalDefault(text, s.id, Number(e.target.value) || 0))}
                    className="w-20 rounded-md border border-line-strong bg-raised px-2 py-1 text-right font-mono text-sm"
                    aria-label={`${s.id} default weight`}
                  />
                </div>
                <Slider
                  disabled={s.locked}
                  min={0}
                  max={Math.max(1, Math.ceil(s.default))}
                  step={0.05}
                  value={s.default}
                  onChange={(v) => setText(setSignalDefault(text, s.id, v))}
                  label={`${s.id} default weight slider`}
                />
              </li>
            ))}
          </ul>
        </Card>

        <div className="space-y-6">
          <Card
            title="Try the knobs"
            action={
              <Button variant="ghost" onClick={() => setKnobVals({})}>
                Reset
              </Button>
            }
          >
            {summary.knobs.length === 0 ? (
              <p className="text-sm text-faint">This schema declares no knobs.</p>
            ) : (
              <>
                {Object.keys(summary.presets).length > 0 && (
                  <div className="mb-5 flex flex-wrap gap-2">
                    {Object.keys(summary.presets).map((p) => (
                      <Button
                        key={p}
                        onClick={() => loadPreset(p)}
                        className={cx(p === activePreset && 'border-accent text-accent')}
                      >
                        {p}
                      </Button>
                    ))}
                  </div>
                )}
                <ul className="space-y-5">
                  {summary.knobs.map((k) => (
                    <li key={k.id}>
                      <KnobRow label={k.label} value={current[k.id]}>
                        <Slider
                          min={k.range[0]}
                          max={k.range[1]}
                          value={current[k.id]}
                          onChange={(v) => setKnobVals({ ...current, [k.id]: v })}
                          label={k.label}
                        />
                      </KnobRow>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </Card>

          <Card title="Resolved weights">
            <ul className="space-y-3">
              {summary.signals.map((s) => {
                const w = weights[s.id]
                const changed = Math.abs(w - baseline[s.id]) > 1e-9
                return (
                  <li key={s.id}>
                    <div className="mb-1 flex justify-between text-sm">
                      <span>{s.id}</span>
                      <span className="font-mono text-xs text-muted">
                        {changed && <span className="text-faint">{f2(baseline[s.id])} → </span>}
                        <span className={changed ? 'text-accent' : ''}>{f2(w)}</span>
                      </span>
                    </div>
                    <div className="relative h-2 rounded-full bg-raised">
                      <div
                        className="h-2 rounded-full bg-accent transition-[width] duration-150"
                        style={{ width: `${Math.min(100, Math.max(0, (w / scale) * 100))}%` }}
                      />
                      {changed && (
                        <span
                          className="absolute -top-0.5 h-3 w-px bg-ink/70"
                          style={{ left: `${Math.min(100, (baseline[s.id] / scale) * 100)}%` }}
                          title="schema default"
                        />
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
            {Object.keys(meta).length > 0 && (
              <div className="mt-5 border-t border-line pt-4">
                <div className="mb-2 text-xs uppercase tracking-wider text-faint">Meta-parameters</div>
                <dl className="grid grid-cols-[1fr_auto] gap-y-1 font-mono text-xs">
                  {Object.entries(meta).map(([k, v]) => (
                    <div key={k} className="contents">
                      <dt className="text-muted">{k}</dt>
                      <dd>{f2(v)}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}
            {exprErrors.length > 0 && (
              <ul className="mt-4 space-y-1 text-xs text-bad">
                {exprErrors.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Presets">
            {Object.keys(summary.presets).length === 0 ? (
              <p className="mb-4 text-sm text-faint">No presets in this schema.</p>
            ) : (
              <ul className="mb-4 divide-y divide-line">
                {Object.entries(summary.presets).map(([name, vals]) => (
                  <li key={name} className="flex flex-wrap items-center gap-3 py-2.5 text-sm">
                    <span className="font-medium">{name}</span>
                    <span className="font-mono text-xs text-faint">
                      {Object.entries(vals)
                        .map(([k, v]) => `${k}=${f2(v)}`)
                        .join('  ')}
                    </span>
                    <Button variant="danger" className="ml-auto" onClick={() => setText(deletePreset(text, name))}>
                      Remove
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex gap-2">
              <input
                value={presetName}
                onChange={(e) => setPresetName(e.target.value)}
                placeholder="preset_name"
                className="min-w-0 flex-1 rounded-lg border border-line-strong bg-raised px-3 py-2 font-mono text-sm placeholder:text-faint"
              />
              <Button disabled={!nameOk || summary.knobs.length === 0} onClick={() => setText(setPreset(text, presetName, current))}>
                Save current knobs
              </Button>
            </div>
            {presetName && !nameOk && (
              <p className="mt-2 text-xs text-bad">Use lowercase letters, digits and underscores, starting with a letter.</p>
            )}
          </Card>
        </div>
      </div>

      {dirty && (
        <div className="sticky bottom-4 mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-accent/40 bg-panel px-5 py-3 shadow-2xl shadow-black/60">
          <span className="text-sm">
            <span className="font-semibold text-accent">{changeCount}</span> unsaved change{changeCount === 1 ? '' : 's'} in the schema draft
          </span>
          <Link
            to="/schema"
            className="rounded-lg bg-accent px-3.5 py-2 text-sm font-semibold text-accent-ink hover:bg-accent-hover"
          >
            Review and apply
          </Link>
        </div>
      )}
    </>
  )
}

/** Knob labels are written as "left <-> right"; show each end on its side of the slider. */
function KnobRow({ label, value, children }: { label: string; value: number; children: ReactNode }) {
  const [left, right] = label.split(/s*<->s*/)
  return (
    <div>
      <div className="mb-2.5 grid grid-cols-[1fr_auto_1fr] items-baseline gap-3 text-sm">
        <span className={right ? 'text-muted' : ''}>{left}</span>
        <span className="rounded-md bg-accent-soft px-1.5 py-0.5 font-mono text-xs text-accent">{f2(value)}</span>
        {right && <span className="text-right text-muted">{right}</span>}
      </div>
      {children}
    </div>
  )
}

import { useMemo, useState, type ReactNode } from 'react'
import type { Verdict } from '../api/types'
import { useDraft } from '../context/draftContext'
import { usePublish } from '../context/usePublish'
import { useI18n } from '../i18n/i18nContext'
import { compile } from '../lib/expr'
import { dataGraph, scoringGraph, type DataEdge, type DataNode } from '../lib/graph'
import {
  IDENT,
  addInteraction,
  removeInteraction,
  removeSimilarityTerm,
  setInteractionField,
  setKnobMap,
  setSignalDefault,
  setLocked,
  setSimilarityWeight,
} from '../lib/schema'
import { Badge, Button, Slider, cx } from './ui'

const POS = 'var(--color-accent)'
const NEG = 'var(--color-warn)'
const REF = 'var(--color-faint)'

type Edit = (fn: (text: string) => string) => void

/** The data graph as an inline editor: every edit rewrites the schema draft. */
export function DataGraphEditor() {
  const { text, setText } = useDraft()
  return <DataView yaml={text} edit={(fn) => setText(fn(text))} />
}

/** The scoring graph as an inline editor. */
export function ScoringGraphEditor() {
  const { text, setText } = useDraft()
  return <ScoringView yaml={text} edit={(fn) => setText(fn(text))} />
}

// ------------------------------------------------------------ deploy bar

const VERDICT_TONE: Record<Verdict, 'neutral' | 'ok' | 'warn'> = { none: 'neutral', additive: 'ok', breaking: 'warn' }

export function DeployBar() {
  const { dirty, discard } = useDraft()
  const { t, tp, msg } = useI18n()
  const { errors, diff, result, busy, confirm, setConfirm, needsConfirm, canApply, run } = usePublish()
  const changes = diff?.changes ?? []

  return (
    <section className="space-y-2 rounded-xl border border-line bg-panel px-5 py-3" aria-label={t('Deploy')}>
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {dirty ? <Badge tone="accent">{tp('{count} unsaved changes', changes.length)}</Badge> : <Badge>{t('in sync with the engine')}</Badge>}
          {errors.length > 0 ? <Badge tone="bad">{tp('{count} problems', errors.length)}</Badge> : <Badge tone="ok">{t('valid')}</Badge>}
          {dirty && diff && <Badge tone={VERDICT_TONE[diff.verdict]}>{t(diff.verdict)}</Badge>}
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {needsConfirm && (
            <label className="flex items-center gap-2 text-xs text-muted">
              <input type="checkbox" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} />
              {t('I understand this needs a re-import')}
            </label>
          )}
          <Button variant="ghost" disabled={!dirty} onClick={discard}>
            {t('Discard')}
          </Button>
          <Button disabled={busy || !dirty || errors.length > 0} onClick={() => void run(true)}>
            {t('Dry run')}
          </Button>
          <Button variant="primary" disabled={busy || !canApply} onClick={() => void run(false)}>
            {busy ? t('Working…') : t('Deploy changes')}
          </Button>
        </div>
      </div>

      {errors.length > 0 && (
        <p className="text-xs text-bad">
          {errors[0].path ? <span className="font-mono">{errors[0].path}: </span> : null}
          {errors[0].message}
          {errors.length > 1 ? ` (${t('and {n} more, see the Schema page', { n: errors.length - 1 })})` : ''}
        </p>
      )}
      {result && (
        <p className={cx('text-xs', result.ok ? 'text-ok' : 'text-bad')}>
          {t('Engine')}: {msg(result.message ?? '')}
          {result.errors[0] && (
            <>
              {' '}
              <span className="font-mono">{result.errors[0].path}</span> {result.errors[0].message}
            </>
          )}
        </p>
      )}
      {dirty && changes.length > 0 && (
        <details className="text-xs text-muted">
          <summary className="cursor-pointer select-none hover:text-ink">{t('What will change in the YAML')}</summary>
          <ul className="mt-2 max-h-32 space-y-0.5 overflow-y-auto font-mono">
            {changes.slice(0, 40).map((c, i) => (
              <li key={i} className={cx(c.startsWith('+') && 'text-ok', c.startsWith('-') && 'text-bad', c.startsWith('~') && 'text-warn')}>
                {c}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  )
}

// ---------------------------------------------------------------- data graph

const W = 760
const H = 480

function layout(nodes: DataNode[]): Record<string, { x: number; y: number }> {
  const pos: Record<string, { x: number; y: number }> = {}
  const cx0 = W / 2
  const cy0 = H / 2
  const user = nodes.find((n) => n.isUser)
  const ranked = nodes.find((n) => n.isRanked && !n.isUser)
  const rest = nodes.filter((n) => n !== user && n !== ranked)
  if (user) pos[user.id] = { x: 110, y: cy0 }
  if (ranked) pos[ranked.id] = { x: W - 110, y: cy0 }
  rest.forEach((n, i) => {
    const top = i % 2 === 0
    const slot = Math.floor(i / 2)
    const count = Math.ceil((rest.length - (top ? 0 : 1)) / 2) || 1
    pos[n.id] = { x: cx0 + (slot - (count - 1) / 2) * 190, y: top ? 62 : H - 62 }
  })
  return pos
}

function curve(a: { x: number; y: number }, b: { x: number; y: number }, offset: number) {
  const mx = (a.x + b.x) / 2
  const my = (a.y + b.y) / 2
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len = Math.hypot(dx, dy) || 1
  const cxp = mx + (-dy / len) * offset
  const cyp = my + (dx / len) * offset
  return {
    d: `M ${a.x} ${a.y} Q ${cxp} ${cyp} ${b.x} ${b.y}`,
    lx: 0.25 * a.x + 0.5 * cxp + 0.25 * b.x,
    ly: 0.25 * a.y + 0.5 * cyp + 0.25 * b.y,
  }
}

const fmt = (n: number) => `${n > 0 ? '+' : ''}${n}`
const HALF_LIFE = /^\d+(\.\d+)?[smhdw]$/

type DataSel = { kind: 'edge' | 'node'; id: string } | null

function DataView({ yaml, edit }: { yaml: string; edit: Edit }) {
  const { t, tp } = useI18n()
  const g = useMemo(() => dataGraph(yaml), [yaml])
  const pos = useMemo(() => layout(g.nodes), [g.nodes])
  const [hover, setHover] = useState<string | null>(null)
  const [sel, setSel] = useState<DataSel>(null)

  if (g.nodes.length === 0) return <p className="py-10 text-center text-sm text-faint">{t('No entities to draw yet.')}</p>

  const interactions = g.edges.filter((e) => e.kind === 'interaction')
  const maxW = Math.max(1, ...interactions.map((e) => Math.abs(e.weight ?? 0)))
  const pairCount: Record<string, number> = {}
  const pairIndex: Record<string, number> = {}
  for (const e of g.edges) {
    const key = [e.from, e.to].sort().join('|')
    pairIndex[e.id] = pairCount[key] ?? 0
    pairCount[key] = (pairCount[key] ?? 0) + 1
  }
  const selEdge = sel?.kind === 'edge' ? interactions.find((e) => e.id === sel.id) : undefined
  const selNode = sel?.kind === 'node' ? g.nodes.find((n) => n.id === sel.id) : undefined
  const ranked = g.nodes.find((n) => n.isRanked)?.id

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div>
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full rounded-xl border border-line bg-canvas" role="img" aria-label={t('Entities and interactions')}>
          <defs>
            {[
              ['pos', POS],
              ['neg', NEG],
              ['ref', REF],
            ].map(([id, color]) => (
              <marker key={id} id={`arrow-${id}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M 0 0 L 10 5 L 0 10 z" fill={color} />
              </marker>
            ))}
          </defs>

          {g.edges.map((e) => {
            const a = pos[e.from]
            const b = pos[e.to]
            if (!a || !b) return null
            const key = [e.from, e.to].sort().join('|')
            const n = pairCount[key]
            const sign = e.from < e.to ? 1 : -1
            const c = curve(a, b, (pairIndex[e.id] - (n - 1) / 2) * 46 * sign)
            const isRef = e.kind === 'ref'
            const w = e.weight ?? 0
            const color = isRef ? REF : w >= 0 ? POS : NEG
            const isSel = sel?.kind === 'edge' && sel.id === e.id
            const dim = hover !== null && hover !== e.id && !isSel
            return (
              <g
                key={e.id}
                opacity={dim ? 0.18 : 1}
                onMouseEnter={() => setHover(e.id)}
                onMouseLeave={() => setHover(null)}
                onClick={() => !isRef && setSel(isSel ? null : { kind: 'edge', id: e.id })}
                style={{ cursor: isRef ? 'default' : 'pointer' }}
              >
                <path d={c.d} fill="none" stroke="transparent" strokeWidth={14} />
                <path
                  d={c.d}
                  fill="none"
                  stroke={color}
                  strokeWidth={isRef ? 1.4 : 1.4 + (Math.abs(w) / maxW) * 4.5}
                  strokeDasharray={isRef ? '5 4' : undefined}
                  strokeLinecap="round"
                  markerEnd={`url(#arrow-${isRef ? 'ref' : w >= 0 ? 'pos' : 'neg'})`}
                  opacity={hover === e.id || isSel ? 1 : 0.8}
                />
                <g transform={`translate(${c.lx} ${c.ly})`}>
                  <rect
                    x={-(e.name.length * 3.4 + (isRef ? 8 : 24))}
                    y={-9}
                    width={e.name.length * 6.8 + (isRef ? 16 : 48)}
                    height={18}
                    rx={9}
                    fill="var(--color-canvas)"
                    stroke={isSel ? 'var(--color-ink)' : color}
                    strokeOpacity={isSel ? 1 : 0.6}
                  />
                  <text textAnchor="middle" y={4} fontSize={11} fill="var(--color-ink)" className="font-mono">
                    {isRef ? e.name : `${e.name} ${fmt(w)}`}
                  </text>
                  {e.locked && <Padlock x={e.name.length * 3.4 + 28} y={-6} />}
                </g>
              </g>
            )
          })}

          {g.nodes.map((n) => {
            const p = pos[n.id]
            if (!p) return null
            const stroke = n.isRanked ? POS : n.isUser ? 'var(--color-muted)' : 'var(--color-line-strong)'
            const isSel = sel?.kind === 'node' && sel.id === n.id
            return (
              <g key={n.id} transform={`translate(${p.x} ${p.y})`} style={{ cursor: 'pointer' }} onClick={() => setSel(isSel ? null : { kind: 'node', id: n.id })}>
                <rect x={-62} y={-26} width={124} height={52} rx={14} fill={n.isRanked ? 'var(--color-accent-soft)' : 'var(--color-raised)'} stroke={stroke} strokeWidth={isSel ? 2.5 : 1.5} />
                <text textAnchor="middle" y={-3} fontSize={14} fontWeight={600} fill="var(--color-ink)">
                  {n.id}
                </text>
                <text textAnchor="middle" y={13} fontSize={10.5} fill="var(--color-muted)">
                  {tp('{count} attrs', n.attributes)}
                  {n.computed ? ` · ${tp('{count} computed', n.computed)}` : ''}
                </text>
              </g>
            )
          })}
        </svg>
        <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-muted">
          <span className="flex items-center gap-1.5">
            <i className="inline-block h-0.5 w-6 rounded" style={{ background: POS }} /> {t('positive')}
          </span>
          <span className="flex items-center gap-1.5">
            <i className="inline-block h-0.5 w-6 rounded" style={{ background: NEG }} /> {t('negative')}
          </span>
          <span className="flex items-center gap-1.5">
            <i className="inline-block h-0 w-6 border-t border-dashed" style={{ borderColor: REF }} /> {t('reference')}
          </span>
          <span>{t('Thickness is the weight. Click an interaction or an entity to edit it.')}</span>
        </div>
      </div>

      <aside className="space-y-5">
        {selEdge && <InteractionEditor key={selEdge.id} edge={selEdge} edit={edit} onDone={() => setSel(null)} />}
        {selNode && <NodeEditor key={selNode.id} node={selNode} edit={edit} onClose={() => setSel(null)} />}
        <div>
          <div className="mb-2 text-xs uppercase tracking-wider text-faint">{t('Interaction weights')}</div>
          <ul className="space-y-1.5">
            {[...interactions]
              .sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0))
              .map((e) => (
                <WeightRow
                  key={e.id}
                  edge={e}
                  max={maxW}
                  active={hover === e.id || sel?.id === e.id}
                  onHover={setHover}
                  onSelect={() => setSel({ kind: 'edge', id: e.id })}
                />
              ))}
          </ul>
        </div>
        <AddInteraction yaml={yaml} edit={edit} target={ranked} onAdded={(name) => setSel({ kind: 'edge', id: `i:${name}` })} />
      </aside>
    </div>
  )
}

function WeightRow({
  edge,
  max,
  active,
  onHover,
  onSelect,
}: {
  edge: DataEdge
  max: number
  active: boolean
  onHover: (id: string | null) => void
  onSelect: () => void
}) {
  const { t } = useI18n()
  const w = edge.weight ?? 0
  const half = Math.min(50, (Math.abs(w) / max) * 50)
  return (
    <li
      onMouseEnter={() => onHover(edge.id)}
      onMouseLeave={() => onHover(null)}
      onClick={onSelect}
      className={cx('cursor-pointer rounded-lg border px-3 py-2 text-xs transition-colors', active ? 'border-accent/60 bg-raised' : 'border-line hover:border-line-strong')}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="flex items-center gap-1.5 font-mono text-ink">
          {edge.name}
          {edge.locked && <LockIcon />}
        </span>
        <span className="font-mono" style={{ color: w >= 0 ? POS : NEG }}>
          {fmt(w)}
        </span>
      </div>
      <div className="relative mt-1.5 h-1.5 rounded-full bg-raised">
        <div className="absolute inset-y-0 left-1/2 w-px bg-line-strong" />
        <div className="absolute inset-y-0 rounded-full" style={{ background: w >= 0 ? POS : NEG, width: `${half}%`, left: w >= 0 ? '50%' : `${50 - half}%` }} />
      </div>
      <div className="mt-1 text-faint">
        {edge.halfLife ? t('half-life {v}', { v: edge.halfLife }) : t('no decay')}
        {edge.value ? ` · ${t('value: {v}', { v: edge.value })}` : ''} · {edge.from} → {edge.to}
      </div>
    </li>
  )
}

function Panel({ title, onClose, children }: { title: ReactNode; onClose: () => void; children: ReactNode }) {
  const { t } = useI18n()
  return (
    <div className="rounded-xl border border-accent/40 bg-raised p-4 text-sm">
      <div className="mb-3 flex items-center justify-between">
        <div className="font-semibold">{title}</div>
        <button onClick={onClose} className="text-xs text-faint hover:text-ink">
          {t('close')}
        </button>
      </div>
      {children}
    </div>
  )
}

function NumberField({
  value,
  onChange,
  step = 0.5,
  label,
  disabled,
}: {
  value: number
  onChange: (v: number) => void
  step?: number
  label: string
  disabled?: boolean
}) {
  return (
    <input
      type="number"
      step={step}
      value={value}
      disabled={disabled}
      aria-label={label}
      onChange={(e) => onChange(Number(e.target.value) || 0)}
      className="w-20 rounded-md border border-line-strong bg-canvas px-2 py-1 text-right font-mono text-sm disabled:cursor-not-allowed disabled:opacity-40"
    />
  )
}

function InteractionEditor({ edge, edit, onDone }: { edge: DataEdge; edit: Edit; onDone: () => void }) {
  const { t } = useI18n()
  const weight = edge.weight ?? 0
  const locked = edge.locked === true
  const [halfLife, setHalfLife] = useState(edge.halfLife ?? '')
  const validHalfLife = halfLife === '' || HALF_LIFE.test(halfLife)
  const range = Math.max(10, Math.ceil(Math.abs(weight)))
  const setWeight = (v: number) => edit((text) => setInteractionField(text, edge.name, 'weight', v))

  return (
    <Panel
      title={
        <span className="flex items-center gap-2 font-mono">
          {edge.name}
          {locked && <LockIcon />}
        </span>
      }
      onClose={onDone}
    >
      <div className="space-y-4">
        {locked && <LockedNote />}
        <div>
          <div className="mb-1.5 flex items-center justify-between text-xs text-muted">
            <span>{t('Weight')}</span>
            <NumberField disabled={locked} label={`${edge.name} ${t('weight')}`} value={weight} onChange={setWeight} />
          </div>
          <Slider disabled={locked} min={-range} max={range} step={0.5} value={weight} label={`${edge.name} ${t('weight slider')}`} onChange={setWeight} />
          <p className="mt-1.5 text-xs text-faint">{t('Negative weights push similar items down.')}</p>
        </div>
        <label className="block text-xs text-muted">
          {t('Half-life')}
          <input
            value={halfLife}
            disabled={locked}
            placeholder={t('e.g. 30d (blank = no decay)')}
            onChange={(e) => {
              setHalfLife(e.target.value)
              if (e.target.value === '' || HALF_LIFE.test(e.target.value)) edit((text) => setInteractionField(text, edge.name, 'half_life', e.target.value))
            }}
            className={cx('mt-1.5 w-full rounded-md border bg-canvas px-2.5 py-1.5 font-mono text-sm disabled:cursor-not-allowed disabled:opacity-40', validHalfLife ? 'border-line-strong' : 'border-bad')}
          />
          {!validHalfLife && <span className="mt-1 block text-bad">{t('Use a number and s, m, h, d or w, for example 3d.')}</span>}
        </label>
        <div className="flex gap-2">
          <LockToggle locked={locked} onToggle={() => edit((text) => setLocked(text, { kind: 'interaction', id: edge.name }, !locked))} />
          <Button
            variant="danger"
            className="flex-1"
            disabled={locked}
            onClick={() => {
              edit((text) => removeInteraction(text, edge.name))
              onDone()
            }}
          >
            {t('Remove')}
          </Button>
        </div>
      </div>
    </Panel>
  )
}

function NodeEditor({ node, edit, onClose }: { node: DataNode; edit: Edit; onClose: () => void }) {
  const { t, tp } = useI18n()
  return (
    <Panel title={node.id} onClose={onClose}>
      <div className="flex flex-wrap gap-1.5">
        {node.isRanked && <Badge tone="accent">{t('ranked')}</Badge>}
        {node.isUser && <Badge>{t('user')}</Badge>}
        <Badge>{tp('{count} attributes', node.attributes)}</Badge>
        {node.computed > 0 && <Badge>{tp('{count} computed', node.computed)}</Badge>}
      </div>
      <div className="mt-4 text-xs uppercase tracking-wider text-faint">{t('Similarity terms')}</div>
      {node.similarity.length === 0 ? (
        <p className="mt-1.5 text-xs text-muted">{t('No similarity terms for this entity.')}</p>
      ) : (
        <ul className="mt-2 space-y-3">
          {node.similarity.map((term, i) => (
            <li key={i} className="text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 font-mono text-ink">
                  {term.on}
                  {term.locked && <LockIcon />}
                </span>
                <span className="flex items-center gap-2">
                  <span className="font-mono text-muted">{term.metric}</span>
                  <button
                    className="text-faint hover:text-warn"
                    title={term.locked ? t('Unlock this term') : t('Lock this term')}
                    onClick={() => edit((x) => setLocked(x, { kind: 'similarity', entity: node.id, index: i }, !term.locked))}
                  >
                    {term.locked ? t('unlock') : t('lock')}
                  </button>
                  {!term.locked && (
                    <button className="text-faint hover:text-bad" title={t('Remove this term')} onClick={() => edit((x) => removeSimilarityTerm(x, node.id, i))}>
                      ✕
                    </button>
                  )}
                </span>
              </div>
              {!term.on.startsWith('via ') && (
                <div className="mt-1.5 flex items-center gap-3">
                  <div className="flex-1">
                    <Slider disabled={term.locked} min={0} max={1} step={0.05} value={term.weight} label={`${term.on} ${t('weight')}`} onChange={(v) => edit((x) => setSimilarityWeight(x, node.id, i, v))} />
                  </div>
                  <NumberField disabled={term.locked} label={`${term.on} ${t('weight')}`} step={0.05} value={term.weight} onChange={(v) => edit((x) => setSimilarityWeight(x, node.id, i, v))} />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}

function AddInteraction({ yaml, edit, target, onAdded }: { yaml: string; edit: Edit; target?: string; onAdded: (name: string) => void }) {
  const { t } = useI18n()
  const [name, setName] = useState('')
  const [weight, setWeight] = useState(1)
  const [halfLife, setHalfLife] = useState('14d')
  const exists = useMemo(() => dataGraph(yaml).edges.some((e) => e.id === `i:${name}`), [yaml, name])
  const valid = IDENT.test(name) && !exists && (halfLife === '' || HALF_LIFE.test(halfLife))

  return (
    <div className="rounded-xl border border-line p-4 text-xs">
      <div className="mb-2 uppercase tracking-wider text-faint">{t('Add an interaction')}</div>
      <div className="grid grid-cols-[1fr_auto] gap-2">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('name, e.g. share')} className="rounded-md border border-line-strong bg-canvas px-2.5 py-1.5 font-mono text-sm" />
        <NumberField label={t('new interaction weight')} value={weight} onChange={setWeight} />
        <input value={halfLife} onChange={(e) => setHalfLife(e.target.value)} placeholder={t('half-life')} className="rounded-md border border-line-strong bg-canvas px-2.5 py-1.5 font-mono text-sm" />
        <Button
          disabled={!valid || !target}
          onClick={() => {
            edit((text) => addInteraction(text, name, weight, halfLife))
            onAdded(name)
            setName('')
          }}
        >
          {t('Add')}
        </Button>
      </div>
      {name && !IDENT.test(name) && <p className="mt-2 text-bad">{t('Lowercase letters, digits and underscores, starting with a letter.')}</p>}
      {exists && <p className="mt-2 text-bad">{t('That interaction already exists.')}</p>}
      <p className="mt-2 text-faint">
        {t('Events of this type will be accepted from the platform and count towards the {target}.', { target: target ?? t('ranked entity') })}
      </p>
    </div>
  )
}

// ------------------------------------------------------------- scoring graph

const ROW = 54
const COL = { knob: 40, signal: 470, score: 690 }

type ScoreSel = { kind: 'signal'; id: string } | { kind: 'link'; knob: string; target: string } | null

function trunc(s: string, n: number) {
  return s.length > n ? s.slice(0, n - 1) + '…' : s
}

function ScoringView({ yaml, edit }: { yaml: string; edit: Edit }) {
  const { t } = useI18n()
  const g = useMemo(() => scoringGraph(yaml), [yaml])
  const [hover, setHover] = useState<string | null>(null)
  const [sel, setSel] = useState<ScoreSel>(null)

  if (g.signals.length === 0) return <p className="py-10 text-center text-sm text-faint">{t('No signals to draw yet.')}</p>

  const rows = Math.max(g.knobs.length, g.signals.length + (g.meta.length ? g.meta.length + 0.6 : 0))
  const height = Math.max(260, rows * ROW + 60)
  const knobY = (i: number) => 40 + i * ROW * (g.knobs.length > 1 ? Math.max(1, (rows - 1) / Math.max(1, g.knobs.length - 1)) : 1)
  const sigY = (i: number) => 40 + i * ROW
  const metaY = (i: number) => 40 + (g.signals.length + 0.6 + i) * ROW
  const sigIndex = Object.fromEntries(g.signals.map((s, i) => [s.id, i]))
  const metaIndex = Object.fromEntries(g.meta.map((m, i) => [m, i]))
  const knobIndex = Object.fromEntries(g.knobs.map((k, i) => [k.id, i]))
  const maxDefault = Math.max(1, ...g.signals.map((s) => s.default))
  const scoreY = 40 + ((g.signals.length - 1) * ROW) / 2

  const related = (id: string) => {
    if (!hover) return true
    if (hover === id) return true
    const [kind, name] = hover.split(':')
    if (kind === 'k') return g.links.some((l) => l.knob === name && (id === `s:${l.target}` || id === `m:${l.target}`))
    if (kind === 's' || kind === 'm') return g.links.some((l) => l.target === name && id === `k:${l.knob}`)
    return true
  }

  const selSignal = sel?.kind === 'signal' ? g.signals.find((s) => s.id === sel.id) : undefined
  const selLink = sel?.kind === 'link' ? g.links.find((l) => l.knob === sel.knob && l.target === sel.target) : undefined

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div>
        <svg viewBox={`0 0 760 ${height}`} className="w-full rounded-xl border border-line bg-canvas" role="img" aria-label={t('Knobs, signals and weights')}>
          {g.links.map((l) => {
            const from = { x: COL.knob + 230, y: knobY(knobIndex[l.knob]) }
            const to = { x: COL.signal, y: l.isMeta ? metaY(metaIndex[l.target]) : sigY(sigIndex[l.target]) }
            const mid = (from.x + to.x) / 2
            const isSel = sel?.kind === 'link' && sel.knob === l.knob && sel.target === l.target
            const dim = hover !== null && !(related(`k:${l.knob}`) && related(l.isMeta ? `m:${l.target}` : `s:${l.target}`) && (hover.startsWith('k:') ? hover === `k:${l.knob}` : hover === `${l.isMeta ? 'm' : 's'}:${l.target}`))
            const d = `M ${from.x} ${from.y} C ${mid} ${from.y}, ${mid} ${to.y}, ${to.x} ${to.y}`
            return (
              <g key={`${l.knob}->${l.target}`} opacity={dim && !isSel ? 0.12 : 1} style={{ cursor: 'pointer' }} onClick={() => setSel(isSel ? null : { kind: 'link', knob: l.knob, target: l.target })}>
                <path d={d} fill="none" stroke="transparent" strokeWidth={14} />
                <path d={d} fill="none" stroke={l.isMeta ? REF : POS} strokeOpacity={isSel ? 1 : 0.75} strokeWidth={isSel ? 2.6 : 1.6} strokeDasharray={l.isMeta ? '5 4' : undefined} />
                <text x={mid} y={(from.y + to.y) / 2 - 5} textAnchor="middle" fontSize={10} fill={isSel ? 'var(--color-ink)' : 'var(--color-muted)'} className="font-mono">
                  {l.expr}
                </text>
              </g>
            )
          })}

          {g.signals.map((s, i) => (
            <path key={s.id} d={`M ${COL.signal + 190} ${sigY(i)} L ${COL.score} ${scoreY}`} stroke="var(--color-line-strong)" strokeWidth={1 + (s.default / maxDefault) * 3} fill="none" opacity={hover && !related(`s:${s.id}`) ? 0.1 : 0.9} />
          ))}

          {g.knobs.map((k, i) => (
            <g key={k.id} transform={`translate(${COL.knob} ${knobY(i) - 20})`} onMouseEnter={() => setHover(`k:${k.id}`)} onMouseLeave={() => setHover(null)} opacity={related(`k:${k.id}`) ? 1 : 0.25}>
              <rect width={230} height={40} rx={10} fill="var(--color-raised)" stroke={hover === `k:${k.id}` ? POS : 'var(--color-line-strong)'} strokeWidth={1.5} />
              <text x={12} y={17} fontSize={12} fontWeight={600} fill="var(--color-ink)" className="font-mono">
                {k.id}
              </text>
              <text x={12} y={32} fontSize={10} fill="var(--color-muted)">
                {trunc(k.label.replace(/\s*<->\s*/, '  ↔  '), 40)}
              </text>
              {k.locked && <Padlock x={210} y={4} />}
            </g>
          ))}

          {g.signals.map((s, i) => {
            const isSel = sel?.kind === 'signal' && sel.id === s.id
            return (
              <g key={s.id} transform={`translate(${COL.signal} ${sigY(i) - 20})`} onMouseEnter={() => setHover(`s:${s.id}`)} onMouseLeave={() => setHover(null)} onClick={() => setSel(isSel ? null : { kind: 'signal', id: s.id })} opacity={related(`s:${s.id}`) ? 1 : 0.25} style={{ cursor: 'pointer' }}>
                <rect width={190} height={40} rx={10} fill="var(--color-raised)" stroke={isSel ? 'var(--color-ink)' : hover === `s:${s.id}` ? POS : 'var(--color-line-strong)'} strokeWidth={isSel ? 2.2 : 1.5} />
                <text x={12} y={16} fontSize={12} fontWeight={600} fill="var(--color-ink)" className="font-mono">
                  {s.id}
                </text>
                <text x={178} y={16} fontSize={11} textAnchor="end" fill={POS} className="font-mono">
                  {s.default}
                </text>
                {s.locked && <Padlock x={138} y={4} />}
                <rect x={12} y={26} width={166} height={5} rx={2.5} fill="var(--color-canvas)" />
                <rect x={12} y={26} width={Math.max(2, (s.default / maxDefault) * 166)} height={5} rx={2.5} fill={POS} />
              </g>
            )
          })}

          {g.meta.map((m, i) => (
            <g key={m} transform={`translate(${COL.signal} ${metaY(i) - 17})`} onMouseEnter={() => setHover(`m:${m}`)} onMouseLeave={() => setHover(null)} opacity={related(`m:${m}`) ? 1 : 0.25}>
              <rect width={190} height={34} rx={10} fill="none" stroke={REF} strokeDasharray="5 4" />
              <text x={12} y={21} fontSize={10.5} fill="var(--color-muted)" className="font-mono">
                {trunc(m, 26)}
              </text>
            </g>
          ))}

          <g transform={`translate(${COL.score} ${scoreY - 24})`}>
            <rect width={64} height={48} rx={14} fill="var(--color-accent-soft)" stroke={POS} strokeWidth={1.5} />
            <text x={32} y={21} textAnchor="middle" fontSize={11} fill="var(--color-muted)">
              {t('score')}
            </text>
            <text x={32} y={38} textAnchor="middle" fontSize={15} fontWeight={600} fill="var(--color-ink)">
              Σ w·s
            </text>
          </g>
        </svg>
        <p className="mt-3 text-xs text-muted">
          {t("Each knob (left) is turned into signal weights by an expression of its value x. A signal's number is its default weight when no knob is touched. Click a signal to change its default, or a line to change its expression. Dashed boxes are meta-parameters.")}
        </p>
      </div>

      <aside className="space-y-5">
        {selSignal && (
          <Panel title={<span className="font-mono">{selSignal.id}</span>} onClose={() => setSel(null)}>
            {selSignal.locked && <LockedNote />}
            <SignalSlider id={selSignal.id} value={selSignal.default} locked={selSignal.locked} edit={edit} />
            <p className="mt-2 text-xs text-faint">
              {t('type')} {selSignal.type}
            </p>
            <div className="mt-3">
              <LockToggle locked={selSignal.locked} onToggle={() => edit((text) => setLocked(text, { kind: 'signal', id: selSignal.id }, !selSignal.locked))} />
            </div>
          </Panel>
        )}
        {selLink && <ExprEditor key={`${selLink.knob}->${selLink.target}`} link={selLink} knob={g.knobs.find((k) => k.id === selLink.knob)} locked={selLink.locked} edit={edit} onClose={() => setSel(null)} />}
        <div>
          <div className="mb-2 text-xs uppercase tracking-wider text-faint">{t('Signal default weights')}</div>
          <ul className="space-y-3">
            {g.signals.map((s) => (
              <li key={s.id} className={cx('rounded-lg border px-3 py-2', sel?.kind === 'signal' && sel.id === s.id ? 'border-accent/60' : 'border-line')}>
                <SignalSlider id={s.id} value={s.default} locked={s.locked} edit={edit} compact />
              </li>
            ))}
          </ul>
        </div>
      </aside>
    </div>
  )
}

function SignalSlider({ id, value, edit, compact, locked }: { id: string; value: number; edit: Edit; compact?: boolean; locked?: boolean }) {
  const { t } = useI18n()
  const max = Math.max(1, Math.ceil(value))
  const set = (v: number) => edit((text) => setSignalDefault(text, id, v))
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-2 text-xs">
        <span className="flex items-center gap-1.5 font-mono text-ink">
          {compact ? id : t('Default weight')}
          {locked && <LockIcon />}
        </span>
        <NumberField disabled={locked} label={`${id} ${t('default')}`} step={0.05} value={value} onChange={set} />
      </div>
      <Slider disabled={locked} min={0} max={max} step={0.05} value={value} label={`${id} ${t('default slider')}`} onChange={set} />
    </div>
  )
}

function ExprEditor({
  link,
  knob,
  locked,
  edit,
  onClose,
}: {
  link: { knob: string; target: string; expr: string }
  knob?: { range: [number, number] }
  locked?: boolean
  edit: Edit
  onClose: () => void
}) {
  const { t } = useI18n()
  const [src, setSrc] = useState(link.expr)
  const compiled = useMemo(() => {
    try {
      return { fn: compile(src), error: '' }
    } catch (e) {
      return { fn: null, error: e instanceof Error ? e.message : String(e) }
    }
  }, [src])
  const [lo, hi] = knob?.range ?? [0, 1]
  const samples = [lo, (lo + hi) / 2, hi]

  return (
    <Panel
      title={
        <span className="flex items-center gap-2 font-mono text-xs">
          {link.knob} → {link.target}
          {locked && <LockIcon />}
        </span>
      }
      onClose={onClose}
    >
      {locked && <LockedNote what="knob" />}
      <label className="block text-xs text-muted">
        {t('Expression in x')}
        <input
          value={src}
          disabled={locked}
          spellCheck={false}
          onChange={(e) => {
            setSrc(e.target.value)
            try {
              compile(e.target.value)
              edit((text) => setKnobMap(text, link.knob, link.target, e.target.value))
            } catch {
              /* not applied until it compiles */
            }
          }}
          className={cx('mt-1.5 w-full rounded-md border bg-canvas px-2.5 py-1.5 font-mono text-sm disabled:cursor-not-allowed disabled:opacity-40', compiled.error ? 'border-bad' : 'border-line-strong')}
        />
      </label>
      {compiled.error ? (
        <p className="mt-2 text-xs text-bad">{compiled.error}</p>
      ) : (
        <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
          {samples.map((x) => (
            <div key={x} className="rounded-md border border-line bg-canvas px-2 py-1.5">
              <div className="text-faint">x = {Math.round(x * 100) / 100}</div>
              <div className="font-mono text-ink">{Math.round((compiled.fn?.(x) ?? 0) * 1000) / 1000}</div>
            </div>
          ))}
        </div>
      )}
      <p className="mt-3 text-xs text-faint">{t('Functions: lerp, min, max. Example: 1 - x, lerp(0.2, 4, x), 0.3 + 0.5 * x.')}</p>
      <div className="mt-3">
        <LockToggle what="knob" locked={!!locked} onToggle={() => edit((text) => setLocked(text, { kind: 'knob', id: link.knob }, !locked))} />
      </div>
    </Panel>
  )
}

// ----------------------------------------------------------------- locks

function Padlock({ x, y }: { x: number; y: number }) {
  const { t } = useI18n()
  return (
    <g transform={`translate(${x} ${y})`}>
      <title>{t('locked')}</title>
      <rect x={0} y={5} width={10} height={7} rx={1.5} fill={NEG} />
      <path d="M2 5V3.5a3 3 0 0 1 6 0V5" fill="none" stroke={NEG} strokeWidth={1.4} />
    </g>
  )
}

function LockIcon() {
  const { t } = useI18n()
  return (
    <svg width="10" height="13" viewBox="0 0 10 13" aria-label={t('locked')} role="img">
      <title>{t('locked')}</title>
      <rect x={0} y={5} width={10} height={7.5} rx={1.5} fill={NEG} />
      <path d="M2 5V3.5a3 3 0 0 1 6 0V5" fill="none" stroke={NEG} strokeWidth={1.4} />
    </svg>
  )
}

function LockedNote({ what = 'item' }: { what?: 'item' | 'knob' }) {
  const { t } = useI18n()
  return (
    <p className="mb-3 rounded-lg border border-warn/30 bg-canvas px-3 py-2 text-xs text-warn">
      {what === 'knob'
        ? t('This knob is locked, so editing is disabled here. Unlock it to change it.')
        : t('This item is locked, so editing is disabled here. Unlock it to change it.')}
    </p>
  )
}

function LockToggle({ locked, onToggle, what = '' }: { locked: boolean; onToggle: () => void; what?: string }) {
  const { t } = useI18n()
  const key = what === 'knob' ? (locked ? 'Unlock knob' : 'Lock knob') : locked ? 'Unlock' : 'Lock'
  return <Button onClick={onToggle}>{t(key)}</Button>
}

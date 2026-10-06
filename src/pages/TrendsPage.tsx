import { useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Badge, Button, Card, Empty, Notice, PageHeader, Slider, cx } from '../components/ui'
import { useDraft } from '../context/draftContext'
import { useI18n } from '../i18n/i18nContext'
import { setLocked, validateSchema } from '../lib/schema'
import {
  AGAINST,
  UNITS,
  addTrend,
  countedInteractions,
  durationMs,
  popularScore,
  readTrends,
  removeSignal,
  setTrendField,
  splitDuration,
  trendScore,
  type Against,
  type Counting,
  type TrendContext,
  type TrendDef,
  type TrendField,
  type Unit,
} from '../lib/trend'

const INPUT =
  'rounded-md border border-line-strong bg-raised px-2 py-1.5 font-mono text-sm disabled:cursor-not-allowed disabled:opacity-40'
const f1 = (n: number) => (Math.round(n * 10) / 10).toFixed(1)
const f2 = (n: number) => (Math.round(n * 100) / 100).toFixed(2)

function Field({ label, help, htmlFor, children, wide }: { label: string; help: string; htmlFor?: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className={cx(wide && 'md:col-span-2')}>
      <label htmlFor={htmlFor} className="block text-sm font-medium">
        {label}
      </label>
      <p className="mb-1.5 text-xs text-faint">{help}</p>
      {children}
    </div>
  )
}

function DurationInput({ id, value, onChange, disabled }: { id: string; value: string; onChange: (v: string) => void; disabled?: boolean }) {
  const { t } = useI18n()
  const { n, unit } = splitDuration(value)
  const valid = durationMs(value) !== null
  const unitLabel: Record<Unit, string> = { m: t('minutes'), h: t('hours'), d: t('days'), w: t('weeks') }
  return (
    <div className="flex gap-2">
      <input
        id={id}
        type="number"
        min={1}
        step="any"
        disabled={disabled}
        value={valid ? n : ''}
        onChange={(e) => {
          const next = Number(e.target.value)
          onChange(next > 0 ? `${next}${unit}` : '')
        }}
        className={cx(INPUT, 'w-24')}
      />
      <select
        aria-label={`${id} unit`}
        disabled={disabled}
        value={unit}
        onChange={(e) => onChange(`${valid ? n : 1}${e.target.value}`)}
        className={cx(INPUT, 'font-sans')}
      >
        {UNITS.map((u) => (
          <option key={u} value={u}>
            {unitLabel[u]}
          </option>
        ))}
      </select>
    </div>
  )
}

/** The definition read back as one sentence, so an operator can check it says what they mean. */
function Sentence({ def, ctx }: { def: TrendDef; ctx: TrendContext }) {
  const { t } = useI18n()
  const p = {
    min: def.min,
    of: countedInteractions(def, ctx).join(', ') || '?',
    window: def.window || '?',
    baseline: def.baseline || '?',
    ratio: def.ratio,
  }
  const head =
    def.count === 'people'
      ? t('An item is trending when at least {min} different people engage with it ({of}) within the last {window}', p)
      : t('An item is trending when it gets at least {min} engagements ({of}) within the last {window}', p)
  const tail =
    def.against === 'own'
      ? t(', at {ratio}× the pace it kept over the previous {baseline}.', p)
      : def.against === 'same_age'
        ? t(', at {ratio}× the pace that items of the same age usually keep.', p)
        : t(
            ', at {ratio}× the pace that items of the same age usually keep while it is new, and at {ratio}× its own pace over the previous {baseline} once it has history.',
            p,
          )
  return (
    <p className="rounded-lg border border-line bg-raised px-4 py-3 text-sm leading-relaxed" aria-live="polite">
      {head}
      {tail}
    </p>
  )
}

function TrendPreview({ def }: { def: TrendDef }) {
  const { t } = useI18n()
  const [recent, setRecent] = useState(30)
  const [usual, setUsual] = useState(4)

  const scenarios = [
    { key: 'steady', label: t('A steady popular post'), recent: 400, usual: 400 },
    { key: 'fast', label: t('A new post with a fast start'), recent: 30, usual: 4 },
    { key: 'uptick', label: t('A slight uptick'), recent: 5, usual: 4 },
    { key: 'burst', label: t('A tiny burst'), recent: Math.max(0, def.min - 1), usual: 0.1 },
    { key: 'comeback', label: t('A comeback'), recent: 120, usual: 10 },
  ]
  const tryIt = trendScore(recent, usual, def)

  const verdict = (r: ReturnType<typeof trendScore>) =>
    r.trending ? (
      <Badge tone="ok">{t('Trending')}</Badge>
    ) : (
      <span className="text-xs text-faint">
        {r.reason === 'min' ? t('below the minimum') : t('not far enough above ordinary')}
      </span>
    )

  return (
    <div className="mt-6 border-t border-line pt-5">
      <h3 className="text-sm font-semibold">{t('Examples with this definition')}</h3>
      <p className="mb-3 mt-1 text-xs text-faint">
        {t('Popular counts how much engagement an item has. Trending counts how far it is above what is ordinary, so a huge steady post is popular but not trending.')}
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-xs uppercase tracking-wider text-faint">
            <tr>
              <th className="py-1.5 pr-3 font-medium" />
              <th className="px-3 py-1.5 text-right font-medium">{t('Recent')}</th>
              <th className="px-3 py-1.5 text-right font-medium">{t('Usual')}</th>
              <th className="px-3 py-1.5 text-right font-medium">{t('Popular')}</th>
              <th className="px-3 py-1.5 text-right font-medium">{t('Trending')}</th>
              <th className="py-1.5 pl-3 font-medium" />
            </tr>
          </thead>
          <tbody>
            {scenarios.map((s) => {
              const r = trendScore(s.recent, s.usual, def)
              return (
                <tr key={s.key} className="border-t border-line">
                  <td className="py-2 pr-3">{s.label}</td>
                  <td className="px-3 py-2 text-right font-mono">{s.recent}</td>
                  <td className="px-3 py-2 text-right font-mono">{s.usual}</td>
                  <td className="px-3 py-2 text-right font-mono">{f1(popularScore(s.recent))}</td>
                  <td className={cx('px-3 py-2 text-right font-mono', r.trending && 'text-accent')}>{f2(r.score)}</td>
                  <td className="py-2 pl-3">{verdict(r)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-5 grid items-end gap-4 sm:grid-cols-[1fr_1fr_auto]">
        <label className="block text-sm">
          <span className="mb-1.5 block text-xs text-faint">{t('Engagement in the recent period')}</span>
          <input
            type="number"
            min={0}
            value={recent}
            onChange={(e) => setRecent(Math.max(0, Number(e.target.value) || 0))}
            className={cx(INPUT, 'w-full')}
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1.5 block text-xs text-faint">{t('Usual for it')}</span>
          <input
            type="number"
            min={0}
            step="any"
            value={usual}
            onChange={(e) => setUsual(Math.max(0, Number(e.target.value) || 0))}
            className={cx(INPUT, 'w-full')}
          />
        </label>
        <div className="pb-1.5 text-sm" aria-live="polite">
          <span className="font-mono text-muted">{t('{pace}× its usual pace', { pace: f1(tryIt.pace) })}</span>
          <span className="ml-3">{verdict(tryIt)}</span>
        </div>
      </div>
    </div>
  )
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 20 20"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={cx('shrink-0 text-faint transition-transform', open && 'rotate-90')}
    >
      <path d="M7 4l6 6-6 6" />
    </svg>
  )
}

interface TrendCardProps {
  def: TrendDef
  ctx: TrendContext
  text: string
  setText: (t: string) => void
  problems: string[]
  open: boolean
  onToggle: () => void
}

function TrendCard({ def, ctx, text, setText, problems, open, onToggle }: TrendCardProps) {
  const { t, tp } = useI18n()
  const bodyId = `${def.id}-body`
  const set = (field: TrendField, value: string | number | string[] | null) => setText(setTrendField(text, def.id, field, value))
  const lock = def.locked
  const positive = ctx.interactions.filter((i) => i.weight > 0).map((i) => i.name)
  const bound = ctx.boundSignals.has(def.id)
  const ages = ctx.timestampAttrs.includes(def.on) || !def.on ? ctx.timestampAttrs : [def.on, ...ctx.timestampAttrs]
  const id = (name: string) => `${def.id}-${name}`

  const againstLabel: Record<Against, string> = {
    own: t('Its own earlier pace'),
    same_age: t('Items of the same age'),
    auto: t('Automatic'),
  }
  const countLabel: Record<Counting, string> = { people: t('Different people'), events: t('Every event') }

  return (
    <Card
      title={
        <span className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={open}
            aria-controls={bodyId}
            className="flex items-center gap-2 rounded-md py-0.5 pr-1 hover:text-accent focus-visible:outline-2 focus-visible:outline-accent"
          >
            <Chevron open={open} />
            {def.id}
          </button>
          <Badge>trend</Badge>
          {lock && <Badge tone="warn">{t('locked')}</Badge>}
          {problems.length > 0 && <Badge tone="warn">{tp('{count} problems', problems.length)}</Badge>}
        </span>
      }
      action={
        <div className="flex items-center gap-3">
          <button
            className="text-xs text-faint hover:text-warn"
            onClick={() => setText(setLocked(text, { kind: 'signal', id: def.id }, !lock))}
          >
            {lock ? t('unlock') : t('lock')}
          </button>
          <Button
            variant="danger"
            disabled={lock || bound}
            title={bound ? t('A knob maps to this signal, so it cannot be removed.') : undefined}
            onClick={() => setText(removeSignal(text, def.id))}
          >
            {t('Remove trend')}
          </Button>
        </div>
      }
    >
      <Sentence def={def} ctx={ctx} />

      {/* Hidden, not unmounted, so the "try your own numbers" fields keep their values. */}
      <div id={bodyId} hidden={!open}>
      <div className="mt-5 grid gap-x-8 gap-y-5 md:grid-cols-2">
        <Field label={t('Recent period')} help={t('How recent "now" is: engagement inside this period counts as recent.')} htmlFor={id('window')}>
          <DurationInput id={id('window')} value={def.window} disabled={lock} onChange={(v) => set('window', v || null)} />
        </Field>

        <Field
          label={t('Compared with')}
          help={t('Its own earlier pace catches comebacks. Items of the same age judges new items fairly. Automatic uses the first once an item has enough history, the second before.')}
          htmlFor={id('against')}
        >
          <select
            id={id('against')}
            disabled={lock}
            value={def.against}
            onChange={(e) => set('against', e.target.value)}
            className={cx(INPUT, 'w-full font-sans')}
          >
            {AGAINST.map((a) => (
              <option key={a} value={a}>
                {againstLabel[a]}
              </option>
            ))}
          </select>
        </Field>

        {def.against !== 'same_age' && (
          <Field
            label={t('Ordinary period')}
            help={t("How far back an item's own ordinary pace is measured. It must be longer than the recent period.")}
            htmlFor={id('baseline')}
          >
            <DurationInput id={id('baseline')} value={def.baseline} disabled={lock} onChange={(v) => set('baseline', v || null)} />
          </Field>
        )}

        {def.against !== 'own' && (
          <Field label={t('Item age from')} help={t("The timestamp attribute that gives an item's age.")} htmlFor={id('on')}>
            <select
              id={id('on')}
              disabled={lock}
              value={def.on}
              onChange={(e) => set('on', e.target.value || null)}
              className={cx(INPUT, 'w-full')}
            >
              {!def.on && <option value="" />}
              {ages.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </Field>
        )}

        <Field label={t('Counted as')} help={t('Different people resists one person repeating an action.')}>
          <div role="group" className="inline-flex overflow-hidden rounded-md border border-line-strong">
            {(['people', 'events'] as Counting[]).map((c) => (
              <button
                key={c}
                type="button"
                disabled={lock}
                aria-pressed={def.count === c}
                onClick={() => set('count', c)}
                className={cx(
                  'px-3 py-1.5 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40',
                  def.count === c ? 'bg-accent-soft text-accent' : 'bg-raised text-muted hover:text-ink',
                )}
              >
                {countLabel[c]}
              </button>
            ))}
          </div>
        </Field>

        <Field
          label={t('Minimum engagement')}
          help={t('Fewer than this in the recent period is never a trend, however fast it grows.')}
          htmlFor={id('min')}
        >
          <input
            id={id('min')}
            type="number"
            min={0}
            step={1}
            disabled={lock}
            value={def.min}
            onChange={(e) => set('min', Math.max(0, Math.floor(Number(e.target.value) || 0)))}
            className={cx(INPUT, 'w-24')}
          />
        </Field>

        <Field
          label={t('Times its usual pace')}
          help={t('How far above ordinary counts as trending. 2 means twice the usual pace.')}
          htmlFor={id('ratio')}
        >
          <input
            id={id('ratio')}
            type="number"
            min={1.1}
            step={0.1}
            disabled={lock}
            value={def.ratio}
            onChange={(e) => set('ratio', Number(e.target.value) || 2)}
            className={cx(INPUT, 'w-24')}
          />
        </Field>

        <Field
          label={t('Weight when no knob is touched')}
          help={t('How much trending counts in the score by default. Users move it with their knob.')}
          htmlFor={id('default')}
        >
          <div className="flex items-center gap-3">
            <input
              id={id('default')}
              type="number"
              step={0.05}
              min={0}
              disabled={lock}
              value={def.default}
              onChange={(e) => set('default', Math.max(0, Number(e.target.value) || 0))}
              className={cx(INPUT, 'w-24')}
            />
            <div className="flex-1">
              <Slider
                disabled={lock}
                min={0}
                max={Math.max(1, Math.ceil(def.default))}
                step={0.05}
                value={def.default}
                onChange={(v) => set('default', v)}
                label={`${def.id} ${t('default weight slider')}`}
              />
            </div>
          </div>
        </Field>

        <Field
          wide
          label={t('What counts as engagement')}
          help={t('Interactions with a negative weight never count, so controversy is not a trend.')}
        >
          <label className="mb-2 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              disabled={lock}
              checked={def.of === null}
              onChange={(e) => set('of', e.target.checked ? null : positive)}
            />
            {t('Every positive interaction')}
          </label>
          {def.of !== null && (
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              {positive.map((name) => (
                <label key={name} className="flex items-center gap-2 font-mono text-sm">
                  <input
                    type="checkbox"
                    disabled={lock}
                    checked={def.of!.includes(name)}
                    onChange={(e) =>
                      set(
                        'of',
                        positive.filter((n) => (n === name ? e.target.checked : def.of!.includes(n))),
                      )
                    }
                  />
                  {name}
                </label>
              ))}
            </div>
          )}
        </Field>
      </div>

      {problems.length > 0 && (
        <div className="mt-5">
          <Notice tone="warn" title={t('This trend has validation problems')}>
            <ul className="list-disc space-y-0.5 pl-5">
              {problems.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          </Notice>
        </div>
      )}

      <TrendPreview def={def} />
      </div>
    </Card>
  )
}

export function TrendsPage() {
  const { text, setText } = useDraft()
  const { t } = useI18n()
  const model = useMemo(() => readTrends(text), [text])
  const errors = useMemo(() => (text.trim() ? validateSchema(text) : []), [text])
  // Trends the user opened or closed; untouched ones follow the default (the first is open).
  const [toggled, setToggled] = useState<Record<string, boolean>>({})

  const subtitle = t('Define what counts as trending on your platform. Popular means a lot of engagement; trending means engagement well above what is ordinary. Edits go into the schema draft; publish them from the Schema page.')

  if (!model || model.ctx.ranked === '') {
    return (
      <>
        <PageHeader title={t('Trends')} subtitle={subtitle} />
        <Empty>
          {t('This tenant has no schema with signals yet.')}{' '}
          <Link to="/schema" className="text-accent">
            {t('Upload a schema first')}
          </Link>
        </Empty>
      </>
    )
  }

  const { defs, ctx } = model
  return (
    <>
      <PageHeader
        title={t('Trends')}
        subtitle={subtitle}
        action={
          <Button
            variant="primary"
            onClick={() => {
              const added = addTrend(text, ctx)
              setText(added.text)
              setToggled((s) => ({ ...s, [added.id]: true })) // show what was just created
            }}
          >
            {t('Add a trend')}
          </Button>
        }
      />
      {defs.length === 0 ? (
        <Empty>
          {t('No trend is defined yet. A trend signal compares recent engagement with what is ordinary and rewards items that are speeding up.')}
        </Empty>
      ) : (
        <div className="space-y-6">
          {defs.map((def, index) => {
            const open = toggled[def.id] ?? index === 0
            return (
              <TrendCard
                key={def.id}
                def={def}
                ctx={ctx}
                text={text}
                setText={setText}
                problems={errors.filter((e) => e.path === `signals.${def.id}` || e.path.startsWith(`signals.${def.id}.`)).map((e) => e.message)}
                open={open}
                onToggle={() => setToggled((s) => ({ ...s, [def.id]: !open }))}
              />
            )
          })}
        </div>
      )}
    </>
  )
}

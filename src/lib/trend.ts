// Trend signals (`type: trend`, ALGORITHMS.md 6.1): reading them from the schema draft,
// editing them without losing comments, validating them like the engine does, and the formula
// the Trends page previews. Pure functions, no React. It must not import ./schema, which
// imports this file for validation.
import { parse, parseDocument, type YAMLMap, type YAMLSeq } from 'yaml'

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)

export type Against = 'own' | 'same_age' | 'auto'
export type Counting = 'people' | 'events'

export const AGAINST: Against[] = ['own', 'same_age', 'auto']
export const COUNTING: Counting[] = ['people', 'events']
/** Every key a trend signal may carry besides `type`, `default` and `locked`. */
export const TREND_KEYS = ['window', 'baseline', 'against', 'on', 'of', 'count', 'min', 'ratio']

/** What a key means when the schema leaves it out. */
export const TREND_DEFAULTS = { against: 'auto' as Against, count: 'people' as Counting, min: 1, ratio: 2 }

const DURATION = /^(\d+(?:\.\d+)?)([smhdw])$/
const UNIT_MS = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000, w: 604_800_000 }
export const UNITS = ['m', 'h', 'd', 'w'] as const
export type Unit = (typeof UNITS)[number]

/** "6h" to milliseconds, or null when it is not a duration. */
export function durationMs(s: string): number | null {
  const m = DURATION.exec(s)
  return m ? Number(m[1]) * UNIT_MS[m[2] as keyof typeof UNIT_MS] : null
}

export function splitDuration(s: string): { n: number; unit: Unit } {
  const m = DURATION.exec(s)
  if (m && (UNITS as readonly string[]).includes(m[2])) return { n: Number(m[1]), unit: m[2] as Unit }
  return { n: 1, unit: 'h' }
}

export interface TrendDef {
  id: string
  default: number
  locked: boolean
  window: string
  baseline: string
  against: Against
  on: string
  /** null means every positive-weight interaction */
  of: string[] | null
  count: Counting
  min: number
  ratio: number
}

export interface TrendContext {
  ranked: string
  /** timestamp attributes of the ranked entity: candidates for "item age from" */
  timestampAttrs: string[]
  interactions: { name: string; weight: number }[]
  /** signals some knob maps onto: they cannot simply be removed */
  boundSignals: Set<string>
}

/** The entity that is recommended: `recommendable`, or the only entity besides "user". */
function rankedEntity(value: Obj): string {
  const entities = isObj(value.entities) ? value.entities : {}
  if (typeof value.recommendable === 'string') return value.recommendable
  // schema v2: a list of recommendable types; trends are edited against the first
  if (Array.isArray(value.recommendable) && typeof value.recommendable[0] === 'string') return value.recommendable[0]
  const others = Object.keys(entities).filter((e) => e !== 'user')
  return others.length === 1 ? others[0] : ''
}

/** Whether the ranked entity declares lifecycle.created (schema v2), which gives an item's age. */
export function rankedHasCreated(value: Obj): boolean {
  const entities = isObj(value.entities) ? value.entities : {}
  const spec = entities[rankedEntity(value)]
  return isObj(spec) && isObj(spec.lifecycle) && typeof spec.lifecycle.created === 'string'
}

export function rankedAttributes(value: Obj): Record<string, string> | null {
  const ranked = rankedEntity(value)
  const entities = isObj(value.entities) ? value.entities : {}
  const spec = entities[ranked]
  if (!ranked || !isObj(spec) || !isObj(spec.attributes)) return null
  return Object.fromEntries(
    Object.entries(spec.attributes).map(([name, a]) => [name, isObj(a) ? String(a.type ?? '') : '']),
  )
}

export function readTrends(text: string): { defs: TrendDef[]; ctx: TrendContext } | null {
  let value: unknown
  try {
    value = parse(text)
  } catch {
    return null
  }
  if (!isObj(value)) return null

  const attrs = rankedAttributes(value) ?? {}
  const interactions = isObj(value.interactions) ? value.interactions : {}
  const signals = isObj(value.signals) ? value.signals : {}
  const knobs = Array.isArray(value.knobs) ? value.knobs : []

  const ctx: TrendContext = {
    ranked: rankedEntity(value),
    timestampAttrs: Object.entries(attrs).filter(([, type]) => type === 'timestamp').map(([name]) => name),
    interactions: Object.entries(interactions).map(([name, spec]) => ({
      name,
      weight: isObj(spec) && typeof spec.weight === 'number' ? spec.weight : 0,
    })),
    boundSignals: new Set(
      knobs.filter(isObj).flatMap((k) => (isObj(k.maps) ? Object.keys(k.maps) : [])),
    ),
  }

  const defs: TrendDef[] = Object.entries(signals)
    .filter(([, s]) => isObj(s) && s.type === 'trend')
    .map(([id, s]) => {
      const o = s as Obj
      return {
        id,
        default: typeof o.default === 'number' ? o.default : 0,
        locked: o.locked === true,
        window: o.window === undefined ? '' : String(o.window),
        baseline: o.baseline === undefined ? '' : String(o.baseline),
        against: AGAINST.includes(o.against as Against) ? (o.against as Against) : TREND_DEFAULTS.against,
        on: o.on === undefined ? '' : String(o.on),
        of: Array.isArray(o.of) ? o.of.map(String) : null,
        count: COUNTING.includes(o.count as Counting) ? (o.count as Counting) : TREND_DEFAULTS.count,
        min: typeof o.min === 'number' ? o.min : TREND_DEFAULTS.min,
        ratio: typeof o.ratio === 'number' ? o.ratio : TREND_DEFAULTS.ratio,
      }
    })
  return { defs, ctx }
}

/** Interaction names that count for this trend, resolved against the schema. */
export function countedInteractions(def: TrendDef, ctx: TrendContext): string[] {
  return def.of ?? ctx.interactions.filter((i) => i.weight > 0).map((i) => i.name)
}

// ---------- validation: the same rules and messages as the engine (validate.go, trend) ----------

export interface TrendValidationEnv {
  /** attribute name to type for the ranked entity; null when that entity is unknown */
  rankedAttrs: Record<string, string> | null
  /** the ranked entity names its age attribute in lifecycle.created, so `on` may be left out */
  hasCreated?: boolean
  /** interaction name to weight */
  interactions: Record<string, number>
}

export function validateTrendSignal(
  p: string,
  spec: Obj,
  env: TrendValidationEnv,
  add: (path: string, message: string) => void,
) {
  const allowed = ['type', 'default', 'locked', ...TREND_KEYS]
  for (const key of Object.keys(spec).sort()) {
    if (!allowed.includes(key)) add(`${p}.${key}`, `unknown key for a trend signal (use ${TREND_KEYS.join(', ')})`)
  }

  let against: Against = 'auto'
  if (spec.against !== undefined) {
    if (!AGAINST.includes(spec.against as Against)) add(`${p}.against`, 'against must be own, same_age or auto')
    else against = spec.against as Against
  }

  const windowMs = spec.window === undefined ? null : durationMs(String(spec.window))
  if (spec.window === undefined) add(`${p}.window`, 'a trend needs window: <duration>, the recent period it measures')
  else if (!windowMs || windowMs <= 0) add(`${p}.window`, 'use a positive duration such as 3d, 12h, 2w')

  if (against !== 'same_age') {
    const baselineMs = spec.baseline === undefined ? null : durationMs(String(spec.baseline))
    if (spec.baseline === undefined)
      add(
        `${p}.baseline`,
        `against: ${against} needs baseline: <duration>, the period that defines ordinary (or use against: same_age)`,
      )
    else if (!baselineMs || baselineMs <= 0) add(`${p}.baseline`, 'use a positive duration such as 3d, 12h, 2w')
    else if (windowMs && baselineMs <= windowMs) add(`${p}.baseline`, 'baseline must be longer than window')
  }

  if (against !== 'own') {
    if (spec.on === undefined) {
      if (!env.hasCreated)
        add(`${p}.on`, `against: ${against} needs on: <timestamp attribute>, which gives an item's age`)
    } else if (env.rankedAttrs) {
      const type = env.rankedAttrs[String(spec.on)]
      if (type === undefined) add(`${p}.on`, `"${String(spec.on)}" is not an attribute of the ranked entity`)
      else if (type !== 'timestamp') add(`${p}.on`, `a trend needs a timestamp attribute, "${String(spec.on)}" is ${type}`)
    }
  }

  if (spec.count !== undefined && !COUNTING.includes(spec.count as Counting))
    add(`${p}.count`, 'count must be people or events')
  if (spec.min !== undefined && !(typeof spec.min === 'number' && spec.min >= 0 && Number.isInteger(spec.min)))
    add(`${p}.min`, 'min must be a whole number, 0 or more')
  if (spec.ratio !== undefined && !(typeof spec.ratio === 'number' && spec.ratio > 1))
    add(`${p}.ratio`, 'ratio must be a number above 1 (how many times ordinary counts as trending)')

  if (spec.of !== undefined) {
    if (!Array.isArray(spec.of) || spec.of.length === 0) add(`${p}.of`, 'of must be a list of interaction names')
    else
      spec.of.forEach((item, i) => {
        const name = String(item)
        if (!(name in env.interactions)) add(`${p}.of[${i}]`, `"${name}" is not a declared interaction`)
        else if (env.interactions[name] <= 0)
          add(`${p}.of[${i}]`, `"${name}" has a negative or zero weight; only positive interactions can make a trend`)
      })
  }
}

// ---------- the formula (ALGORITHMS.md 6.1) ----------

export interface TrendResult {
  /** (recent + 1) / (expected + 1): how many times its ordinary pace */
  pace: number
  score: number
  trending: boolean
  /** why it does not count, when it does not */
  reason?: 'min' | 'ratio'
}

/** The trend score for an item whose recent and expected engagement are known. */
export function trendScore(recent: number, expected: number, def: Pick<TrendDef, 'min' | 'ratio'>): TrendResult {
  const pace = (recent + 1) / (expected + 1)
  if (recent < def.min) return { pace, score: 0, trending: false, reason: 'min' }
  const score = Math.max(0, Math.log(pace / def.ratio))
  return score > 0 ? { pace, score, trending: true } : { pace, score: 0, trending: false, reason: 'ratio' }
}

/** What `global_count` would say: size only, blind to pace. */
export const popularScore = (recent: number) => Math.log(1 + recent)

// ---------- edits that keep comments and formatting ----------

const r3 = (n: number) => Math.round(n * 1000) / 1000

export type TrendField = 'default' | (typeof TREND_KEYS)[number]

/** Set one key of a trend signal; null removes it so the engine default applies. */
export function setTrendField(
  text: string,
  id: string,
  field: TrendField,
  value: string | number | string[] | null,
): string {
  const doc = parseDocument(text)
  const path = ['signals', id, field]
  if (value === null || value === '') doc.deleteIn(path)
  else if (Array.isArray(value)) {
    const node = doc.createNode(value) as YAMLSeq
    node.flow = true
    doc.setIn(path, node)
  } else doc.setIn(path, typeof value === 'number' ? r3(value) : value)
  return doc.toString()
}

/** A new trend with sensible values for this schema. Returns the new id too. */
export function addTrend(text: string, ctx: TrendContext): { text: string; id: string } {
  const doc = parseDocument(text)
  let id = 'trending'
  for (let n = 2; doc.hasIn(['signals', id]); n++) id = `trending_${n}`

  const on = ctx.timestampAttrs[0]
  const spec: Obj = { type: 'trend', default: 0.2 }
  if (on) spec.on = on
  spec.window = '6h'
  spec.baseline = '7d'
  spec.against = on ? 'auto' : 'own'
  spec.count = 'people'
  spec.min = 3
  spec.ratio = 2

  const node = doc.createNode(spec) as YAMLMap
  node.flow = true
  doc.setIn(['signals', id], node)
  return { text: doc.toString(), id }
}

export function removeSignal(text: string, id: string): string {
  const doc = parseDocument(text)
  doc.deleteIn(['signals', id])
  return doc.toString()
}

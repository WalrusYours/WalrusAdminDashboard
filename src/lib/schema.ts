// Parse, validate, diff and edit WALRUS schema YAML in the browser. Mirrors the server's
// semantic checks (ARCHITECTURE.md 2.2) so feedback is instant.
import { isSeq, parse, parseDocument, type YAMLMap } from 'yaml'
import type { SchemaDiff, ValidationError, Verdict } from '../api/types'
import { compile } from './expr'

export const IDENT = /^[a-z][a-z0-9_]*$/
export const ATTR_TYPES = ['categorical', 'float', 'int', 'bool', 'string', 'set', 'timestamp', 'vector', 'ref']
export const SIGNAL_TYPES = [
  'item_neighbors',
  'user_neighbors',
  'own_history',
  'global_count',
  'age_decay',
  'low_exposure',
  'attribute_match',
  'diversity_rerank',
]
export const METRICS = ['jaccard', 'cosine', 'equals', 'log_ratio']
/** knob map targets that are not signals */
export const META_TARGETS = ['interactions.half_life_scale', 'constraint.energy_center']

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)

export interface SignalInfo {
  id: string
  type: string
  default: number
  params: Obj
}
export interface KnobInfo {
  id: string
  label: string
  range: [number, number]
  maps: Record<string, string>
}
export interface SchemaSummary {
  version: number
  entities: { id: string; attributes: number }[]
  interactions: string[]
  signals: SignalInfo[]
  knobs: KnobInfo[]
  presets: Record<string, Record<string, number>>
  constraints: number
}

export function parseYaml(text: string): { value?: unknown; error?: string } {
  try {
    return { value: parse(text) }
  } catch (e) {
    return { error: e instanceof Error ? e.message.split('\n')[0] : String(e) }
  }
}

export function validateSchema(text: string): ValidationError[] {
  const errs: ValidationError[] = []
  const add = (path: string, message: string) => errs.push({ path, message })
  const { value, error } = parseYaml(text)
  if (error) return [{ path: '', message: `YAML syntax: ${error}` }]
  if (!isObj(value)) return [{ path: '', message: 'schema must be a YAML mapping' }]

  if (!Number.isInteger(value.version)) add('version', 'version must be an integer')

  const entities = isObj(value.entities) ? value.entities : {}
  if (!isObj(value.entities) || Object.keys(entities).length === 0) add('entities', 'declare at least one entity')
  const attrsOf: Record<string, string[]> = {}
  for (const [name, spec] of Object.entries(entities)) {
    if (!IDENT.test(name)) add(`entities.${name}`, 'identifier must match ^[a-z][a-z0-9_]*$')
    const attrs = isObj(spec) && isObj(spec.attributes) ? spec.attributes : {}
    attrsOf[name] = Object.keys(attrs)
    for (const [an, as] of Object.entries(attrs)) {
      const p = `entities.${name}.attributes.${an}`
      if (!IDENT.test(an)) add(p, 'identifier must match ^[a-z][a-z0-9_]*$')
      if (!isObj(as) || typeof as.type !== 'string') add(p, 'attribute needs a type')
      else if (!ATTR_TYPES.includes(as.type)) add(`${p}.type`, `unknown type "${as.type}"`)
      else if (as.type === 'ref' && !(typeof as.entity === 'string' && as.entity in entities))
        add(`${p}.entity`, 'ref must name a declared entity')
    }
  }

  const interactions = isObj(value.interactions) ? value.interactions : {}
  if (!isObj(value.interactions) || Object.keys(interactions).length === 0)
    add('interactions', 'declare at least one interaction')
  for (const [name, spec] of Object.entries(interactions)) {
    const p = `interactions.${name}`
    if (!IDENT.test(name)) add(p, 'identifier must match ^[a-z][a-z0-9_]*$')
    if (!isObj(spec) || typeof spec.weight !== 'number') add(`${p}.weight`, 'weight must be a number')
    else if (spec.half_life !== undefined && !/^\d+(\.\d+)?[smhdw]$/.test(String(spec.half_life)))
      add(`${p}.half_life`, 'use a duration such as 3d, 12h, 2w')
  }

  if (value.similarity !== undefined) {
    const sim = isObj(value.similarity) ? value.similarity : {}
    for (const [ent, terms] of Object.entries(sim)) {
      if (!(ent in entities)) add(`similarity.${ent}`, 'not a declared entity')
      if (!Array.isArray(terms)) continue
      terms.forEach((t, i) => {
        const p = `similarity.${ent}[${i}]`
        if (!isObj(t)) return add(p, 'term must be a mapping')
        const ons = typeof t.on === 'string' ? [t.on] : Array.isArray(t.on) ? t.on : []
        for (const on of ons) {
          if (!(attrsOf[ent] ?? []).includes(String(on))) add(`${p}.on`, `"${on}" is not an attribute of ${ent}`)
        }
        if (typeof t.metric !== 'string' || !METRICS.includes(t.metric))
          add(`${p}.metric`, `metric must be one of ${METRICS.join(', ')}`)
        if (t.on !== undefined && typeof t.weight !== 'number') add(`${p}.weight`, 'weight must be a number')
      })
    }
  }

  const signals = isObj(value.signals) ? value.signals : {}
  if (!isObj(value.signals) || Object.keys(signals).length === 0) add('signals', 'declare at least one signal')
  for (const [name, spec] of Object.entries(signals)) {
    const p = `signals.${name}`
    if (!IDENT.test(name)) add(p, 'identifier must match ^[a-z][a-z0-9_]*$')
    if (!isObj(spec) || typeof spec.type !== 'string') add(`${p}.type`, 'signal needs a type')
    else if (!SIGNAL_TYPES.includes(spec.type)) add(`${p}.type`, `unknown signal type "${spec.type}"`)
    if (!isObj(spec) || typeof spec.default !== 'number') add(`${p}.default`, 'default must be a number')
  }

  const knobIds = new Set<string>()
  if (value.knobs !== undefined && !Array.isArray(value.knobs)) add('knobs', 'knobs must be a list')
  const knobs = Array.isArray(value.knobs) ? value.knobs : []
  knobs.forEach((k, i) => {
    const p = `knobs[${i}]`
    if (!isObj(k)) return add(p, 'knob must be a mapping')
    if (typeof k.id !== 'string' || !IDENT.test(k.id)) add(`${p}.id`, 'id must match ^[a-z][a-z0-9_]*$')
    else if (knobIds.has(k.id)) add(`${p}.id`, `duplicate knob id "${k.id}"`)
    else knobIds.add(k.id)
    if (typeof k.label !== 'string' || !k.label.trim())
      add(`${p}.label`, 'label is required (plain language, shown to users)')
    if (
      !Array.isArray(k.range) ||
      k.range.length !== 2 ||
      k.range.some((n) => typeof n !== 'number') ||
      k.range[0] >= k.range[1]
    )
      add(`${p}.range`, 'range must be [min, max] with min < max')
    if (!isObj(k.maps) || Object.keys(k.maps).length === 0)
      return add(`${p}.maps`, 'map the knob onto at least one signal')
    for (const [target, src] of Object.entries(k.maps)) {
      const tp = `${p}.maps.${target}`
      if (!(target in signals) && !META_TARGETS.includes(target))
        add(tp, `"${target}" is neither a declared signal nor a known meta-parameter`)
      try {
        compile(String(src))
      } catch (e) {
        add(tp, `expression "${String(src)}": ${e instanceof Error ? e.message : e}`)
      }
    }
  })

  if (value.presets !== undefined) {
    const presets = isObj(value.presets) ? value.presets : {}
    for (const [pn, vals] of Object.entries(presets)) {
      if (!isObj(vals)) {
        add(`presets.${pn}`, 'preset must be a mapping of knob values')
        continue
      }
      for (const [kid, v] of Object.entries(vals)) {
        if (!knobIds.has(kid)) add(`presets.${pn}.${kid}`, `"${kid}" is not a declared knob`)
        else if (typeof v !== 'number') add(`presets.${pn}.${kid}`, 'value must be a number')
      }
    }
  }

  if (value.recommendable !== undefined && !(typeof value.recommendable === 'string' && value.recommendable in entities))
    add('recommendable', 'must name a declared entity')
  if (value.constraints !== undefined && !Array.isArray(value.constraints))
    add('constraints', 'constraints must be a list')

  return errs
}

export function summarize(text: string): SchemaSummary | null {
  const { value } = parseYaml(text)
  if (!isObj(value)) return null
  const entities = isObj(value.entities) ? value.entities : {}
  const signals = isObj(value.signals) ? value.signals : {}
  const knobs = Array.isArray(value.knobs) ? value.knobs : []
  const presets = isObj(value.presets) ? value.presets : {}
  return {
    version: Number(value.version) || 0,
    entities: Object.entries(entities).map(([id, s]) => ({
      id,
      attributes: isObj(s) && isObj(s.attributes) ? Object.keys(s.attributes).length : 0,
    })),
    interactions: Object.keys(isObj(value.interactions) ? value.interactions : {}),
    signals: Object.entries(signals).map(([id, s]) => {
      const o = isObj(s) ? s : {}
      const { type, default: d, ...params } = o
      return { id, type: String(type ?? '?'), default: typeof d === 'number' ? d : 0, params }
    }),
    knobs: knobs.filter(isObj).map((k) => ({
      id: String(k.id),
      label: String(k.label ?? k.id),
      range: (Array.isArray(k.range) ? [Number(k.range[0]), Number(k.range[1])] : [0, 1]) as [number, number],
      maps: isObj(k.maps) ? Object.fromEntries(Object.entries(k.maps).map(([a, b]) => [a, String(b)])) : {},
    })),
    presets: Object.fromEntries(
      Object.entries(presets).map(([n, v]) => [
        n,
        isObj(v)
          ? (Object.fromEntries(Object.entries(v).filter(([, x]) => typeof x === 'number')) as Record<string, number>)
          : {},
      ]),
    ),
    constraints: Array.isArray(value.constraints) ? value.constraints.length : 0,
  }
}

// ---------- diff ----------

function flatten(v: unknown, prefix: string, out: Map<string, string>) {
  if (isObj(v)) {
    for (const [k, x] of Object.entries(v)) flatten(x, prefix ? `${prefix}.${k}` : k, out)
  } else if (Array.isArray(v)) {
    v.forEach((x, i) => flatten(x, `${prefix}[${i}]`, out))
  } else {
    out.set(prefix, JSON.stringify(v))
  }
}

/** knobs are a list keyed by id; index them by id so reordering is not a change */
function normalise(v: unknown): unknown {
  if (!isObj(v)) return v
  const copy: Obj = { ...v }
  if (Array.isArray(v.knobs)) {
    copy.knobs = Object.fromEntries(
      v.knobs.filter(isObj).map((k) => {
        const { id, ...rest } = k
        return [String(id), rest]
      }),
    )
  }
  return copy
}

const REMOVAL_GROUP = /^(entities\.[^.]+\.attributes\.[^.]+|entities\.[^.]+|interactions\.[^.]+|signals\.[^.]+)/

export function diffSchemas(oldText: string | null, newText: string): SchemaDiff {
  const a = new Map<string, string>()
  const b = new Map<string, string>()
  if (oldText) flatten(normalise(parseYaml(oldText).value), '', a)
  flatten(normalise(parseYaml(newText).value), '', b)
  const changes: string[] = []
  let breaking = false

  for (const [k, v] of b) {
    if (!a.has(k)) changes.push(`+ ${k} = ${v}`)
    else if (a.get(k) !== v) {
      changes.push(`~ ${k}: ${a.get(k)} → ${v}`)
      if (/\.type$/.test(k) && (k.startsWith('signals.') || k.includes('.attributes.'))) breaking = true
    }
  }
  const removed = new Set<string>()
  for (const k of a.keys()) {
    if (b.has(k)) continue
    const g = k.match(REMOVAL_GROUP)?.[1]
    // removing a whole entity, attribute, interaction or signal is breaking
    if (g && ![...b.keys()].some((nk) => nk === g || nk.startsWith(`${g}.`))) {
      if (!removed.has(g)) changes.push(`- ${g}`)
      removed.add(g)
      breaking = true
    } else {
      changes.push(`- ${k}`)
    }
  }
  const verdict: Verdict = changes.length === 0 ? 'none' : breaking ? 'breaking' : 'additive'
  return { verdict, changes }
}

// ---------- edits that keep comments and formatting ----------

const r3 = (n: number) => Math.round(n * 1000) / 1000

export function setSignalDefault(text: string, id: string, value: number): string {
  const doc = parseDocument(text)
  doc.setIn(['signals', id, 'default'], r3(value))
  return doc.toString()
}

export function setPreset(text: string, name: string, values: Record<string, number>): string {
  const doc = parseDocument(text)
  doc.setIn(['presets', name], doc.createNode(Object.fromEntries(Object.entries(values).map(([k, v]) => [k, r3(v)]))))
  return doc.toString()
}

export function deletePreset(text: string, name: string): string {
  const doc = parseDocument(text)
  doc.deleteIn(['presets', name])
  return doc.toString()
}

function sortKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortKeys)
  if (isObj(v)) return Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys(v[k])]))
  return v
}

export async function hashSchema(text: string): Promise<string> {
  const canonical = JSON.stringify(sortKeys(parseYaml(text).value))
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Resolve weights for knob values: signal defaults overridden by knob bindings. */
export function resolveWeights(
  s: SchemaSummary,
  knobValues: Record<string, number>,
): { weights: Record<string, number>; meta: Record<string, number>; errors: string[] } {
  const weights = Object.fromEntries(s.signals.map((x) => [x.id, x.default]))
  const meta: Record<string, number> = {}
  const errors: string[] = []
  for (const k of s.knobs) {
    const x = knobValues[k.id] ?? (k.range[0] + k.range[1]) / 2
    for (const [target, src] of Object.entries(k.maps)) {
      try {
        const v = compile(src)(x)
        if (target in weights) weights[target] = v
        else meta[target] = v
      } catch (e) {
        errors.push(`${k.id} → ${target}: ${e instanceof Error ? e.message : e}`)
      }
    }
  }
  return { weights, meta, errors }
}

// ---------- graph edits: each returns new YAML text and keeps comments ----------

export function setInteractionField(
  text: string,
  name: string,
  field: 'weight' | 'half_life' | 'target' | 'value' | 'transform',
  value: number | string | null,
): string {
  const doc = parseDocument(text)
  const path = ['interactions', name, field]
  if (value === null || value === '') doc.deleteIn(path)
  else doc.setIn(path, typeof value === 'number' ? r3(value) : value)
  return doc.toString()
}

export function addInteraction(text: string, name: string, weight: number, halfLife: string): string {
  const doc = parseDocument(text)
  const node = doc.createNode(halfLife ? { weight: r3(weight), half_life: halfLife } : { weight: r3(weight) }) as YAMLMap
  node.flow = true
  doc.setIn(['interactions', name], node)
  return doc.toString()
}

export function removeInteraction(text: string, name: string): string {
  const doc = parseDocument(text)
  doc.deleteIn(['interactions', name])
  return doc.toString()
}

export function setSimilarityWeight(text: string, entity: string, index: number, weight: number): string {
  const doc = parseDocument(text)
  doc.setIn(['similarity', entity, index, 'weight'], r3(weight))
  return doc.toString()
}

export function removeSimilarityTerm(text: string, entity: string, index: number): string {
  const doc = parseDocument(text)
  doc.deleteIn(['similarity', entity, index])
  return doc.toString()
}

export function setKnobMap(text: string, knobId: string, target: string, expr: string): string {
  const doc = parseDocument(text)
  const knobs = doc.get('knobs')
  if (!isSeq(knobs)) return text
  const index = knobs.items.findIndex((k) => (k as YAMLMap).get('id') === knobId)
  if (index < 0) return text
  doc.setIn(['knobs', index, 'maps', target], expr)
  return doc.toString()
}

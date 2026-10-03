import { parseYaml } from './schema'

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)

export interface SimTerm {
  on: string
  metric: string
  weight: number
}

export interface DataNode {
  id: string
  attributes: number
  computed: number
  isUser: boolean
  isRanked: boolean
  similarity: SimTerm[]
}

export interface DataEdge {
  id: string
  kind: 'interaction' | 'ref'
  from: string
  to: string
  name: string
  weight?: number
  halfLife?: string
  value?: string
}

export interface DataGraph {
  nodes: DataNode[]
  edges: DataEdge[]
}

export function dataGraph(text: string): DataGraph {
  const { value } = parseYaml(text)
  if (!isObj(value) || !isObj(value.entities)) return { nodes: [], edges: [] }
  const entities = value.entities
  const ids = Object.keys(entities)
  const others = ids.filter((i) => i !== 'user')
  const ranked =
    typeof value.recommendable === 'string' && value.recommendable in entities
      ? value.recommendable
      : others.length === 1
        ? others[0]
        : ''
  const sim = isObj(value.similarity) ? value.similarity : {}

  const nodes: DataNode[] = ids.map((id) => {
    const attrs = isObj(entities[id]) && isObj((entities[id] as Obj).attributes) ? ((entities[id] as Obj).attributes as Obj) : {}
    const terms = Array.isArray(sim[id]) ? (sim[id] as unknown[]) : []
    return {
      id,
      attributes: Object.keys(attrs).length,
      computed: Object.values(attrs).filter((a) => isObj(a) && typeof a.computed === 'string').length,
      isUser: id === 'user',
      isRanked: id === ranked,
      similarity: terms.filter(isObj).map((t) => ({
        on: Array.isArray(t.on) ? t.on.join(' + ') : String(t.on ?? `via ${t.via ?? '?'}`),
        metric: String(t.metric ?? '?'),
        weight: typeof t.weight === 'number' ? t.weight : 0,
      })),
    }
  })

  const edges: DataEdge[] = []
  if (isObj(value.interactions)) {
    for (const [name, spec] of Object.entries(value.interactions)) {
      if (!isObj(spec) || typeof spec.weight !== 'number') continue
      const to = typeof spec.target === 'string' ? spec.target : ranked
      if (!to || !(to in entities) || !('user' in entities)) continue
      edges.push({
        id: `i:${name}`,
        kind: 'interaction',
        from: 'user',
        to,
        name,
        weight: spec.weight,
        halfLife: spec.half_life === undefined ? undefined : String(spec.half_life),
        value: typeof spec.value === 'string' ? spec.value : undefined,
      })
    }
  }
  for (const id of ids) {
    const attrs = isObj(entities[id]) && isObj((entities[id] as Obj).attributes) ? ((entities[id] as Obj).attributes as Obj) : {}
    for (const [an, a] of Object.entries(attrs)) {
      if (isObj(a) && a.type === 'ref' && typeof a.entity === 'string' && a.entity in entities)
        edges.push({ id: `r:${id}.${an}`, kind: 'ref', from: id, to: a.entity, name: an })
    }
  }
  return { nodes, edges }
}

export interface ScoringGraph {
  knobs: { id: string; label: string; range: [number, number] }[]
  signals: { id: string; type: string; default: number }[]
  meta: string[]
  links: { knob: string; target: string; expr: string; isMeta: boolean }[]
}

export function scoringGraph(text: string): ScoringGraph {
  const { value } = parseYaml(text)
  const out: ScoringGraph = { knobs: [], signals: [], meta: [], links: [] }
  if (!isObj(value)) return out
  const signals = isObj(value.signals) ? value.signals : {}
  out.signals = Object.entries(signals).map(([id, s]) => ({
    id,
    type: isObj(s) ? String(s.type ?? '?') : '?',
    default: isObj(s) && typeof s.default === 'number' ? s.default : 0,
  }))
  const meta = new Set<string>()
  for (const k of Array.isArray(value.knobs) ? value.knobs : []) {
    if (!isObj(k) || typeof k.id !== 'string') continue
    out.knobs.push({
      id: k.id,
      label: String(k.label ?? k.id),
      range: Array.isArray(k.range) ? [Number(k.range[0]), Number(k.range[1])] : [0, 1],
    })
    for (const [target, expr] of Object.entries(isObj(k.maps) ? k.maps : {})) {
      const isMeta = !(target in signals)
      if (isMeta) meta.add(target)
      out.links.push({ knob: k.id, target, expr: String(expr), isMeta })
    }
  }
  out.meta = [...meta]
  return out
}

// In-browser stand-in for the WALRUS admin API. State lives in localStorage so the demo
// survives reloads. Validation and diffing use the same code the real server mirrors.
import { diffSchemas, hashSchema, validateSchema } from '../lib/schema'
import { SAMPLE_SCHEMA } from './sampleSchema'
import type {
  ActiveSchema,
  ApiKey,
  IssuedKey,
  JobStatus,
  PutSchemaOptions,
  SchemaResult,
  SchemaVersion,
  Scope,
  Tenant,
  WalrusApi,
} from './types'

interface State {
  tenants: Tenant[]
  keys: ApiKey[]
  schemas: Record<string, SchemaVersion[]>
  jobs: Record<string, JobStatus>
}

const STORE = 'walrus-dashboard-mock-v1'
const delay = <T>(v: T, ms = 120) => new Promise<T>((r) => setTimeout(() => r(v), ms))
const now = () => new Date().toISOString()
const rand = (n: number) =>
  [...crypto.getRandomValues(new Uint8Array(n))].map((b) => b.toString(36).padStart(2, '0')).join('').slice(0, n)

async function seed(): Promise<State> {
  const demo: Tenant = { id: 't_demo', name: 'demo-feed', createdAt: now() }
  const second: Tenant = { id: 't_market', name: 'loop-marketplace', createdAt: now() }
  const hash = await hashSchema(SAMPLE_SCHEMA)
  return {
    tenants: [demo, second],
    keys: [
      { id: 'k_seed1', tenantId: demo.id, scopes: ['schema:write'], createdAt: now(), lastUsedAt: now() },
      { id: 'k_seed2', tenantId: demo.id, scopes: ['ingest', 'recommend'], createdAt: now(), lastUsedAt: now() },
    ],
    schemas: {
      [demo.id]: [{ version: 1, hash, author: 'seed', at: now(), verdict: 'additive', yaml: SAMPLE_SCHEMA }],
      [second.id]: [],
    },
    jobs: {
      [demo.id]: { running: false, lastRun: now(), lastDurationMs: 4210 },
      [second.id]: { running: false },
    },
  }
}

let shared: Promise<State> | null = null
const getState = () => (shared ??= load())

async function load(): Promise<State> {
  try {
    const raw = localStorage.getItem(STORE)
    if (raw) return JSON.parse(raw) as State
  } catch {
    /* storage unavailable: fall through to a fresh seed */
  }
  return seed()
}

export function resetMock() {
  shared = null
  try {
    localStorage.removeItem(STORE)
  } catch {
    /* ignore */
  }
}

export class MockApi implements WalrusApi {
  readonly mode = 'mock' as const
  private tenantId: string
  private state: Promise<State>

  constructor(tenantId: string) {
    this.tenantId = tenantId
    this.state = getState()
  }

  private async save(s: State) {
    try {
      localStorage.setItem(STORE, JSON.stringify(s))
    } catch {
      /* ignore */
    }
  }

  async session() {
    return true
  }

  async login() {}

  async logout() {}

  async health() {
    return delay({ status: 'ok', version: 'mock-0.1.0', instance_id: '3f9a1c7e5b2d4a60', instance_name: 'walrus-demo' }, 60)
  }

  async getSchema(): Promise<ActiveSchema | null> {
    const s = await this.state
    const v = (s.schemas[this.tenantId] ?? []).at(-1)
    return delay(v ? { yaml: v.yaml, version: v.version, hash: v.hash } : null)
  }

  async schemaHistory() {
    const s = await this.state
    return delay([...(s.schemas[this.tenantId] ?? [])].reverse())
  }

  async putSchema(yaml: string, opts: PutSchemaOptions = {}): Promise<SchemaResult> {
    const s = await this.state
    const errors = validateSchema(yaml)
    const history = (s.schemas[this.tenantId] ??= [])
    const current = history.at(-1)
    const diff = diffSchemas(current?.yaml ?? null, yaml)
    if (errors.length) return delay({ ok: false, errors, diff, message: `${errors.length} validation error(s)` })
    if (opts.dryRun) return delay({ ok: true, errors: [], diff, message: 'dry run: nothing was changed' })
    if (current && diff.verdict === 'none') return delay({ ok: true, errors: [], diff, version: current.version, message: 'unchanged: no new version' })
    if (current && diff.verdict === 'breaking' && !opts.confirmBreaking)
      return delay({
        ok: false,
        errors: [],
        diff,
        needsConfirm: true,
        message: 'breaking change: re-import and re-precompute are required. Confirm to apply.',
      })
    const version = (current?.version ?? 0) + 1
    history.push({ version, hash: await hashSchema(yaml), author: 'dashboard', at: now(), verdict: diff.verdict, yaml })
    await this.save(s)
    return delay({ ok: true, errors: [], diff, version, message: `applied as version ${version}` })
  }

  async precomputeStatus(): Promise<JobStatus> {
    const s = await this.state
    return delay(s.jobs[this.tenantId] ?? { running: false }, 60)
  }

  async triggerPrecompute() {
    const s = await this.state
    const started = Date.now()
    s.jobs[this.tenantId] = { running: true }
    await this.save(s)
    setTimeout(async () => {
      s.jobs[this.tenantId] = { running: false, lastRun: now(), lastDurationMs: Date.now() - started + 3000 }
      await this.save(s)
    }, 2500)
    return delay(undefined)
  }

  async listTenants() {
    return delay((await this.state).tenants)
  }

  async createTenant(name: string): Promise<Tenant> {
    const s = await this.state
    const t: Tenant = { id: `t_${rand(8)}`, name, createdAt: now() }
    s.tenants.push(t)
    s.schemas[t.id] = []
    s.jobs[t.id] = { running: false }
    await this.save(s)
    return delay(t)
  }

  async listKeys(tenantId: string) {
    return delay((await this.state).keys.filter((k) => k.tenantId === tenantId))
  }

  async issueKey(tenantId: string, scopes: Scope[], expiresInDays?: number): Promise<IssuedKey> {
    const s = await this.state
    const id = `k_${rand(8)}`
    const key: ApiKey = {
      id,
      tenantId,
      scopes,
      createdAt: now(),
      expiresAt: expiresInDays ? new Date(Date.now() + expiresInDays * 864e5).toISOString() : undefined,
    }
    s.keys.push(key)
    await this.save(s)
    return delay({ key, secret: `wlr_${id.slice(2)}_${rand(32)}` })
  }

  async revokeKey(keyId: string) {
    const s = await this.state
    const k = s.keys.find((x) => x.id === keyId)
    if (k) k.revokedAt = now()
    await this.save(s)
    return delay(undefined)
  }
}

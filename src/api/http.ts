// Live client for a WALRUS engine. The browser talks to its own origin at /api, which nginx
// (Docker) or Vite (dev) forwards to the one engine this dashboard is deployed with. The
// operator signs in with the admin key once; after that only an HttpOnly cookie is used.
import {
  ApiError,
  type ActiveSchema,
  type ApiKey,
  type Health,
  type IssuedKey,
  type JobStatus,
  type PutSchemaOptions,
  type SchemaResult,
  type SchemaVersion,
  type Tenant,
  type WalrusApi,
} from './types'

const BASE = '/api/v1'

export const UNAUTHORIZED_EVENT = 'walrus:unauthorized'

async function request(path: string, init: RequestInit = {}): Promise<Response> {
  let res: Response
  try {
    res = await fetch(BASE + path, { credentials: 'same-origin', ...init })
  } catch {
    throw new ApiError(0, 'Cannot reach the engine. Is it running?')
  }
  if (res.status === 401 && !path.startsWith('/admin/session')) {
    window.dispatchEvent(new Event(UNAUTHORIZED_EVENT))
  }
  return res
}

async function errorMessage(res: Response): Promise<string> {
  try {
    const body = await res.json()
    return body?.error?.message ?? `HTTP ${res.status}`
  } catch {
    return `HTTP ${res.status}`
  }
}

const NOT_YET = 'Not available on this engine yet.'

export class HttpApi implements WalrusApi {
  readonly mode = 'live' as const
  private instanceName = 'default'

  async session(): Promise<boolean> {
    try {
      const res = await fetch(`${BASE}/admin/session`, { credentials: 'same-origin' })
      return res.status === 204
    } catch {
      return false
    }
  }

  async login(key: string): Promise<void> {
    const res = await request('/admin/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key }),
    })
    if (res.status !== 204) throw new ApiError(res.status, res.status === 401 ? 'Wrong admin key.' : await errorMessage(res))
  }

  async logout(): Promise<void> {
    await request('/admin/session', { method: 'DELETE' })
  }

  async health(): Promise<Health> {
    const res = await request('/health')
    if (!res.ok) throw new ApiError(res.status, await errorMessage(res))
    const h = (await res.json()) as Health
    if (h.instance_name) this.instanceName = h.instance_name
    return h
  }

  async getSchema(): Promise<ActiveSchema | null> {
    const res = await request('/schema')
    if (res.status === 404) return null
    if (!res.ok) throw new ApiError(res.status, await errorMessage(res))
    return (await res.json()) as ActiveSchema
  }

  async schemaHistory(): Promise<SchemaVersion[]> {
    const res = await request('/schema/history')
    if (!res.ok) throw new ApiError(res.status, await errorMessage(res))
    return (await res.json()) as SchemaVersion[]
  }

  async putSchema(yaml: string, opts: PutSchemaOptions = {}): Promise<SchemaResult> {
    const q = new URLSearchParams()
    if (opts.dryRun) q.set('dry_run', 'true')
    if (opts.confirmBreaking) q.set('confirm_breaking', 'true')
    const res = await request(`/schema${q.size ? `?${q}` : ''}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/yaml' },
      body: yaml,
    })
    // 200 applied or dry run, 400 validation errors, 409 breaking change: all carry a result
    if (res.status === 200 || res.status === 400 || res.status === 409) return (await res.json()) as SchemaResult
    throw new ApiError(res.status, await errorMessage(res))
  }

  async precomputeStatus(): Promise<JobStatus> {
    return { running: false }
  }

  async triggerPrecompute(): Promise<void> {
    throw new ApiError(501, NOT_YET)
  }

  async listTenants(): Promise<Tenant[]> {
    return [{ id: 'default', name: this.instanceName, createdAt: new Date().toISOString() }]
  }

  async createTenant(): Promise<Tenant> {
    throw new ApiError(501, NOT_YET)
  }

  async listKeys(): Promise<ApiKey[]> {
    return []
  }

  async issueKey(): Promise<IssuedKey> {
    throw new ApiError(501, NOT_YET)
  }

  async revokeKey(): Promise<void> {
    throw new ApiError(501, NOT_YET)
  }
}

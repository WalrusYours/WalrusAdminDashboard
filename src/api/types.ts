// Shapes of the WALRUS admin API (see .claude/SERVER.md section 2.11 and ADAPT.md), all
// under /v1. The dashboard currently runs against the in-browser mock (api/mock.ts); a
// real HTTP client can implement the same WalrusApi interface later.

export type Scope = 'schema:write' | 'ingest' | 'recommend' | 'admin'
export const ALL_SCOPES: Scope[] = ['schema:write', 'ingest', 'recommend', 'admin']

export type Verdict = 'none' | 'additive' | 'breaking'

/** GET /v1/health. instance_id identifies the engine this dashboard is wired to. */
export interface Health {
  status: string
  version?: string
  instance_id?: string
  instance_name?: string
}

export interface ValidationError {
  path: string
  message: string
}

export interface SchemaDiff {
  verdict: Verdict
  changes: string[]
}

export interface SchemaResult {
  ok: boolean
  /** validation errors (HTTP 400) */
  errors: ValidationError[]
  diff: SchemaDiff
  /** set when the schema was accepted and activated */
  version?: number
  /** true when the server refused a breaking change (HTTP 409) */
  needsConfirm?: boolean
  message?: string
}

export interface ActiveSchema {
  yaml: string
  version: number
  hash: string
}

export interface SchemaVersion {
  version: number
  hash: string
  author: string
  at: string
  verdict: Verdict
  yaml: string
}

export interface JobStatus {
  running: boolean
  lastRun?: string
  lastDurationMs?: number
  lastError?: string
}

export interface Tenant {
  id: string
  name: string
  createdAt: string
}

export interface ApiKey {
  id: string
  tenantId: string
  scopes: Scope[]
  createdAt: string
  expiresAt?: string
  lastUsedAt?: string
  revokedAt?: string
}

export interface IssuedKey {
  key: ApiKey
  /** plaintext secret, returned once */
  secret: string
}

export interface PutSchemaOptions {
  dryRun?: boolean
  confirmBreaking?: boolean
}

export interface WalrusApi {
  readonly mode: 'mock'
  health(): Promise<Health>
  getSchema(): Promise<ActiveSchema | null>
  schemaHistory(): Promise<SchemaVersion[]>
  putSchema(yaml: string, opts?: PutSchemaOptions): Promise<SchemaResult>
  precomputeStatus(): Promise<JobStatus>
  triggerPrecompute(): Promise<void>
  listTenants(): Promise<Tenant[]>
  createTenant(name: string): Promise<Tenant>
  listKeys(tenantId: string): Promise<ApiKey[]>
  issueKey(tenantId: string, scopes: Scope[], expiresInDays?: number): Promise<IssuedKey>
  revokeKey(keyId: string): Promise<void>
}

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

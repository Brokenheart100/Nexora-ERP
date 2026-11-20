import { createHash } from 'node:crypto'
import type { H3Event } from 'h3'
import { createError } from 'h3'
import { bffConfig } from '../runtime/bff-config'
import { withBffRedis } from './bff-redis'
import { bffSessionLastSeen, removeBffSession, type BffSession } from './bff-session'

export interface BffSessionPolicySource {
  workspaceId: string
  workspaceName: string
  idleTimeoutMinutes: number
}

export interface BffSessionPolicy {
  idleTimeoutMinutes: number
  sources: BffSessionPolicySource[]
  workspaceCount: number
  checkedAt: string
  cached: boolean
  stale: boolean
  unavailable: boolean
}

const policyCachePrefix = 'nexora:dashboard:session-policy:'
const policyLastPrefix = 'nexora:dashboard:session-policy-last:'
const policyCacheSeconds = 30
const policyLastSeconds = 24 * 60 * 60
const defaultIdleMinutes = 30

function policyKeys(session: BffSession) {
  const id = createHash('sha256').update('nexora:dashboard:session-policy:v1\0').update(session.subject).digest('base64url').slice(0, 22)
  return { cache: policyCachePrefix + id, last: policyLastPrefix + id }
}

function normalizePolicy(raw: unknown): BffSessionPolicy | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const value = raw as Record<string, unknown>
  const requested = Number(value.idleTimeoutMinutes)
  const idleTimeoutMinutes = Number.isFinite(requested) && requested >= 1 && requested <= 480
    ? Math.trunc(requested)
    : defaultIdleMinutes
  const sources = Array.isArray(value.sources)
    ? value.sources.flatMap((item) => {
        if (!item || typeof item !== 'object') return []
        const source = item as Record<string, unknown>
        const minutes = Number(source.idleTimeoutMinutes)
        if (typeof source.workspaceId !== 'string' || typeof source.workspaceName !== 'string'
          || !Number.isFinite(minutes) || minutes < 1 || minutes > 480) return []
        return [{ workspaceId: source.workspaceId, workspaceName: source.workspaceName, idleTimeoutMinutes: Math.trunc(minutes) }]
      })
    : []
  const workspaceCount = Number.isFinite(Number(value.workspaceCount))
    ? Math.max(0, Math.trunc(Number(value.workspaceCount)))
    : sources.length
  return {
    idleTimeoutMinutes,
    sources,
    workspaceCount,
    checkedAt: typeof value.checkedAt === 'string' ? value.checkedAt : new Date().toISOString(),
    cached: false,
    stale: false,
    unavailable: value.unavailable === true
  }
}

async function readPolicy(event: H3Event, key: string) {
  const raw = await withBffRedis(event, redis => redis.get(key))
  if (!raw) return undefined
  try {
    return normalizePolicy(JSON.parse(raw))
  } catch {
    return undefined
  }
}

async function writePolicy(
  event: H3Event,
  keys: { cache: string, last: string },
  policy: BffSessionPolicy,
  cacheSeconds = policyCacheSeconds,
  rememberLast = true
) {
  const stored = {
    idleTimeoutMinutes: policy.idleTimeoutMinutes,
    sources: policy.sources,
    workspaceCount: policy.workspaceCount,
    checkedAt: policy.checkedAt,
    unavailable: policy.unavailable
  }
  await withBffRedis(event, async (redis) => {
    await redis.set(keys.cache, JSON.stringify(stored), { EX: cacheSeconds })
    if (rememberLast) await redis.set(keys.last, JSON.stringify(stored), { EX: policyLastSeconds })
  }).catch(() => { /* 缓存失败不影响本次策略；下次请求重新读取权威值。 */ })
}

export async function fetchSessionPolicy(event: H3Event, session: BffSession, refresh = false): Promise<BffSessionPolicy> {
  const keys = policyKeys(session)
  if (!refresh) {
    const cached = await readPolicy(event, keys.cache)
    if (cached) return { ...cached, cached: true }
  }
  const last = await readPolicy(event, keys.last)
  try {
    const response = await fetch(new URL('/api/session-policy', bffConfig(event).gateway.origin), {
      headers: { Authorization: 'Bearer ' + session.accessToken, accept: 'application/json' },
      redirect: 'manual',
      signal: AbortSignal.timeout(3000)
    })
    if (!response.ok) throw new Error('Session policy request failed')
    const policy = normalizePolicy(await response.json())
    if (!policy) throw new Error('Invalid session policy')
    await writePolicy(event, keys, policy)
    return policy
  } catch {
    const fallback: BffSessionPolicy = last
      ? { ...last, stale: true }
      : {
          idleTimeoutMinutes: defaultIdleMinutes,
          sources: [],
          workspaceCount: 0,
          checkedAt: new Date().toISOString(),
          cached: false,
          stale: true,
          unavailable: true
        }
    await writePolicy(event, keys, fallback, 10, false)
    return fallback
  }
}

export async function enforceSessionIdle(
  event: H3Event,
  handle: string,
  policy: BffSessionPolicy
) {
  const lastSeenAt = await bffSessionLastSeen(event, handle) ?? Date.now()
  if (Date.now() - lastSeenAt >= policy.idleTimeoutMinutes * 60_000) {
    await removeBffSession(event)
    throw createError({
      statusCode: 401,
      statusMessage: 'Session idle timeout',
      data: { code: 'session.idle_timeout', idleTimeoutMinutes: policy.idleTimeoutMinutes }
    })
  }
  return lastSeenAt
}

export function sessionPolicySummary(policy: BffSessionPolicy) {
  const sources = policy.sources.map(source => source.workspaceName + '(' + source.idleTimeoutMinutes + 'm)').join(', ')
  return 'idle=' + policy.idleTimeoutMinutes + 'm workspaces=' + policy.workspaceCount + (sources ? ' sources=' + sources : '')
}

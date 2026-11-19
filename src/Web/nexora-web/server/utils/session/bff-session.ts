import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import type { H3Event } from 'h3'
import { createError, deleteCookie, getCookie, getHeader, setCookie } from 'h3'
import { bffConfig } from '../runtime/bff-config'
import { withBffRedis } from './bff-redis'

const sessionCookie = '__Host-Nexora.Session'
const ssoHintCookie = '__Host-Nexora.SsoHint'
export const secureCookie = { secure: true, path: '/', httpOnly: true, sameSite: 'lax' } as const
const sessionKeyPrefix = 'nexora:nitro:session:'
const sessionMetaPrefix = 'nexora:nitro:session-meta:'
const subjectSessionsPrefix = 'nexora:nitro:subject-sessions:'
const revokedSidPrefix = 'nexora:nitro:revoked-sid:'
const registryLifetimeSeconds = 7 * 24 * 60 * 60

export interface BffSession {
  subject: string
  name: string
  accessToken: string
  idToken: string
  expiresAt: number
  refreshToken?: string
  refreshExpiresAt?: number
  sid?: string
  mfaAt?: number
  mfaMethods?: string[]
}

export interface BffSessionSummary {
  id: string
  createdAt: number
  lastSeenAt: number
  userAgent: string
  expiresAt: number
  current: boolean
}

export function randomHandle() {
  return randomBytes(32).toString('base64url')
}

export function isHandle(value: string | undefined): value is string {
  return !!value && /^[\w-]{43}$/.test(value)
}

export function sessionHandle(event: H3Event) {
  const handle = getCookie(event, sessionCookie)
  return isHandle(handle) ? handle : undefined
}

function encryptionKey(secret: string) {
  return createHash('sha256').update('nexora:nitro:session:v1\0').update(secret).digest()
}

function sessionId(handle: string) {
  return createHash('sha256').update('nexora:nitro:session-id:v1\0').update(handle).digest('base64url').slice(0, 22)
}

function sessionExpiry(session: BffSession) {
  return Math.max(session.expiresAt, session.refreshExpiresAt ?? 0)
}

function seal(event: H3Event, handle: string, session: BffSession) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(bffConfig(event).sessionKey), iv)
  cipher.setAAD(Buffer.from(handle))
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(session)), cipher.final()])
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64url')
}

function open(event: H3Event, handle: string, value: string): BffSession | undefined {
  const data = Buffer.from(value, 'base64url')
  for (const secret of bffConfig(event).sessionKeys) {
    try {
      const decipher = createDecipheriv('aes-256-gcm', encryptionKey(secret), data.subarray(0, 12))
      decipher.setAAD(Buffer.from(handle))
      decipher.setAuthTag(data.subarray(12, 28))
      return JSON.parse(Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]).toString('utf8'))
    } catch {
      // During rotation a second key can authenticate existing Redis tickets.
    }
  }
  return undefined
}

function metaFields(session: BffSession, createdAt: number, lastSeenAt: number, userAgent: string) {
  return {
    createdAt: String(createdAt),
    lastSeenAt: String(lastSeenAt),
    userAgent,
    expiresAt: String(sessionExpiry(session)),
    ...(session.sid ? { sid: session.sid } : {}),
  }
}

export async function readBffSession(event: H3Event) {
  const handle = sessionHandle(event)
  if (!handle) return undefined
  const value = await withBffRedis(event, redis => redis.get(sessionKeyPrefix + handle))
  const session = value ? open(event, handle, value) : undefined
  return session && sessionExpiry(session) > Date.now() ? session : undefined
}

export function setSsoHint(event: H3Event) {
  setCookie(event, ssoHintCookie, 'true', { ...secureCookie, httpOnly: false })
}

export function clearSsoHint(event: H3Event) {
  deleteCookie(event, ssoHintCookie, { ...secureCookie, httpOnly: false })
}

export async function saveBffSession(event: H3Event, session: BffSession) {
  const previous = sessionHandle(event)
  const handle = randomHandle()
  const expiry = sessionExpiry(session)
  if (expiry <= Date.now()) throw createError({ statusCode: 401, statusMessage: 'Login expired' })
  const value = seal(event, handle, session)
  const id = sessionId(handle)
  const now = Date.now()
  const userAgent = (getHeader(event, 'user-agent') ?? '').slice(0, 300)
  const ttl = Math.max(1, Math.ceil((expiry - now) / 1000))
  await withBffRedis(event, async (redis) => {
    await redis.set(sessionKeyPrefix + handle, value, { EXAT: Math.floor(expiry / 1000) })
    await redis.hSet(sessionMetaPrefix + id, { ...metaFields(session, now, now, userAgent), handle })
    await redis.expire(sessionMetaPrefix + id, ttl)
    await redis.zAdd(subjectSessionsPrefix + session.subject, [{ score: expiry, value: id }])
    await redis.expire(subjectSessionsPrefix + session.subject, Math.max(ttl, registryLifetimeSeconds))
    if (previous) {
      const previousId = sessionId(previous)
      const previousValue = await redis.getDel(sessionKeyPrefix + previous)
      const previousSession = previousValue ? open(event, previous, previousValue) : undefined
      await redis.del(sessionMetaPrefix + previousId)
      await redis.zRem(subjectSessionsPrefix + (previousSession?.subject ?? session.subject), previousId)
    }
  })
  setCookie(event, sessionCookie, handle, secureCookie)
  setSsoHint(event)
}

const refreshLeaseKey = (handle: string) => 'nexora:nitro:refresh:' + sessionId(handle)

export async function claimBffSessionRefresh(event: H3Event, handle: string) {
  const owner = randomHandle()
  const acquired = await withBffRedis(event, redis => redis.set(refreshLeaseKey(handle), owner, { NX: true, PX: 30_000 }))
  return acquired ? owner : undefined
}

export async function releaseBffSessionRefresh(event: H3Event, handle: string, owner: string) {
  await withBffRedis(event, redis => redis.eval(
    "if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) end; return 0",
    { keys: [refreshLeaseKey(handle)], arguments: [owner] },
  ))
}

export async function invalidateBffSessionRefresh(event: H3Event, handle: string, session: BffSession, owner: string) {
  const id = sessionId(handle)
  const removed = await withBffRedis(event, redis => redis.eval(`
    if redis.call('GET', KEYS[1]) ~= ARGV[1] then return 0 end
    redis.call('DEL', KEYS[2], KEYS[3])
    redis.call('ZREM', KEYS[4], ARGV[2])
    return 1
  `, {
    keys: [refreshLeaseKey(handle), sessionKeyPrefix + handle, sessionMetaPrefix + id, subjectSessionsPrefix + session.subject],
    arguments: [owner, id],
  }))
  if (removed === 1) deleteCookie(event, sessionCookie, secureCookie)
}

export async function updateBffSession(event: H3Event, handle: string, session: BffSession, owner: string) {
  const expiry = sessionExpiry(session)
  if (expiry <= Date.now()) throw createError({ statusCode: 401, statusMessage: 'Sign in required' })
  const value = seal(event, handle, session)
  const id = sessionId(handle)
  const now = Date.now()
  const ttl = Math.max(1, Math.ceil((expiry - now) / 1000))
  const updated = await withBffRedis(event, redis => redis.eval(`
    if redis.call('GET', KEYS[1]) ~= ARGV[1] or redis.call('EXISTS', KEYS[2], KEYS[3]) ~= 2
      or redis.call('EXISTS', KEYS[5]) ~= 0 then return 0 end
    redis.call('SET', KEYS[2], ARGV[2], 'EXAT', ARGV[3])
    redis.call('HSET', KEYS[3], 'lastSeenAt', ARGV[4], 'expiresAt', ARGV[5])
    redis.call('EXPIRE', KEYS[3], ARGV[6])
    redis.call('ZADD', KEYS[4], ARGV[5], ARGV[7])
    redis.call('EXPIRE', KEYS[4], ARGV[8])
    return 1
  `, {
    keys: [refreshLeaseKey(handle), sessionKeyPrefix + handle, sessionMetaPrefix + id, subjectSessionsPrefix + session.subject,
      revokedSidPrefix + (session.sid ?? '')],
    arguments: [owner, value, String(Math.floor(expiry / 1000)), String(now), String(expiry), String(ttl), id,
      String(Math.max(ttl, registryLifetimeSeconds))],
  }))
  if (updated !== 1) throw createError({ statusCode: 401, statusMessage: 'Sign in required' })
}

export async function touchBffSession(event: H3Event, handle: string, session: BffSession, force = false) {
  const id = sessionId(handle)
  const now = Date.now()
  return withBffRedis(event, async (redis) => {
    const meta = await redis.hGetAll(sessionMetaPrefix + id)
    if (!meta.handle) {
      await redis.hSet(sessionMetaPrefix + id, { ...metaFields(session, now, now, (getHeader(event, 'user-agent') ?? '').slice(0, 300)), handle })
      await redis.expire(sessionMetaPrefix + id, Math.max(1, Math.ceil((sessionExpiry(session) - now) / 1000)))
      return now
    }
    const lastSeenAt = Number(meta.lastSeenAt) || now
    if (!force && now - lastSeenAt < 30_000) return lastSeenAt
    await redis.hSet(sessionMetaPrefix + id, { lastSeenAt: String(now) })
    return now
  })
}

export async function bffSessionLastSeen(event: H3Event, handle: string) {
  const id = sessionId(handle)
  return withBffRedis(event, async (redis) => {
    const lastSeenAt = Number((await redis.hGetAll(sessionMetaPrefix + id)).lastSeenAt)
    return Number.isFinite(lastSeenAt) && lastSeenAt > 0 ? lastSeenAt : undefined
  })
}

export async function removeBffSession(event: H3Event) {
  const handle = sessionHandle(event)
  deleteCookie(event, sessionCookie, secureCookie)
  if (!handle) return undefined
  const id = sessionId(handle)
  const value = await withBffRedis(event, redis => redis.getDel(sessionKeyPrefix + handle))
  const session = value ? open(event, handle, value) : undefined
  await withBffRedis(event, async (redis) => {
    await redis.del(sessionMetaPrefix + id)
    if (session) await redis.zRem(subjectSessionsPrefix + session.subject, id)
  })
  return session
}

export async function listBffSessions(event: H3Event, session: BffSession, currentHandle: string): Promise<BffSessionSummary[]> {
  const currentId = sessionId(currentHandle)
  const now = Date.now()
  return withBffRedis(event, async (redis) => {
    const ids = await redis.zRangeByScore(subjectSessionsPrefix + session.subject, now, '+inf')
    const summaries: BffSessionSummary[] = []
    for (const id of ids) {
      const meta = await redis.hGetAll(sessionMetaPrefix + id)
      if (!meta.handle || Number(meta.expiresAt) <= now) {
        await redis.zRem(subjectSessionsPrefix + session.subject, id)
        continue
      }
      summaries.push({
        id,
        createdAt: Number(meta.createdAt) || 0,
        lastSeenAt: Number(meta.lastSeenAt) || 0,
        userAgent: meta.userAgent ?? '',
        expiresAt: Number(meta.expiresAt) || 0,
        current: id === currentId,
      })
    }
    return summaries.sort((left, right) => right.lastSeenAt - left.lastSeenAt)
  })
}

export async function revokeBffSession(
  event: H3Event, subject: string, id: string, currentHandle: string | undefined,
): Promise<{ revoked: boolean, current: boolean }> {
  const current = currentHandle !== undefined && id === sessionId(currentHandle)
  const meta = await withBffRedis(event, async (redis) => {
    const score = await redis.zScore(subjectSessionsPrefix + subject, id)
    if (score === null || score === undefined) return undefined
    const raw = await redis.hGetAll(sessionMetaPrefix + id)
    if (!raw.handle) {
      await redis.zRem(subjectSessionsPrefix + subject, id)
      return undefined
    }
    await redis.del(sessionKeyPrefix + raw.handle)
    await redis.del(sessionMetaPrefix + id)
    await redis.zRem(subjectSessionsPrefix + subject, id)
    return raw
  })
  if (!meta) return { revoked: false, current }
  if (meta.sid) {
    const remaining = Math.ceil((Number(meta.expiresAt) - Date.now()) / 1000)
    await withBffRedis(event, redis => redis.set(revokedSidPrefix + meta.sid!, '1', { EX: Math.max(1, Math.min(remaining, 1800)) }))
  }
  if (current) {
    deleteCookie(event, sessionCookie, secureCookie)
    clearSsoHint(event)
  }
  return { revoked: true, current }
}

export async function revokeOtherBffSessions(event: H3Event, session: BffSession, currentHandle: string): Promise<number> {
  const currentId = sessionId(currentHandle)
  const summaries = await listBffSessions(event, session, currentHandle)
  let revoked = 0
  for (const summary of summaries) {
    if (summary.id === currentId) continue
    const result = await revokeBffSession(event, session.subject, summary.id, currentHandle)
    if (result.revoked) revoked++
  }
  return revoked
}

export async function isSessionRevoked(event: H3Event, sid: string) {
  return withBffRedis(event, async redis => (await redis.exists(revokedSidPrefix + sid)) === 1)
}

export async function clearSessionRevocation(event: H3Event, sid: string) {
  await withBffRedis(event, redis => redis.del(revokedSidPrefix + sid))
}

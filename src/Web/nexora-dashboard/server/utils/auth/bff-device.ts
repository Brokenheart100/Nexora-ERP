import { createHash, timingSafeEqual } from 'node:crypto'
import { createError, getHeader, type H3Event } from 'h3'
import { z } from 'zod'
import { deviceAuthorizationPath, deviceUserCodeSchema, type DeviceClient } from '../../../shared/types/device-authorization'
import { bffConfig } from '../runtime/bff-config'
import { withBffRedis } from '../session/bff-redis'

const challenge = z.string().regex(/^[\w-]{43}$/)
const opaque = z.string().min(1).max(16384).regex(/^[!-~]+$/)
const startRequest = z.strictObject({ codeChallenge: challenge })
const tokenRequest = z.strictObject({ deviceCode: opaque, codeVerifier: z.string().regex(/^[A-Za-z0-9._~-]{43,128}$/) })
const revokeRequest = z.strictObject({ token: opaque, tokenTypeHint: z.enum(['access_token', 'refresh_token']).optional() })
const deviceGrant = z.object({ device_code: opaque, user_code: deviceUserCodeSchema, expires_in: z.number().int().positive(), interval: z.number().int().positive().default(5) })
const deviceTokens = z.object({ access_token: opaque, refresh_token: opaque.optional(), token_type: z.string(),
  expires_in: z.number().nonnegative(), refresh_expires_in: z.number().nonnegative().optional(), scope: z.string().optional() })
const oauthError = z.object({ error: z.enum(['authorization_pending', 'slow_down', 'access_denied', 'expired_token', 'invalid_request',
  'invalid_grant', 'invalid_client', 'unauthorized_client', 'invalid_scope', 'unsupported_grant_type']) })
const waiting = new Set(['authorization_pending', 'slow_down'])
const headers = { 'Cache-Control': 'no-store', 'Pragma': 'no-cache' }
const limit = 32768
const digest = (value: string) => createHash('sha256').update(value).digest('base64url')
const bindingKey = (client: DeviceClient, deviceCode: string) => 'nexora:dashboard:device:' + client + ':' + digest(deviceCode)

function oauthResponse(body: unknown, status = 200) {
  return Response.json(body, { status, headers })
}

export function deviceSettings(event: H3Event, client: DeviceClient) {
  const config = bffConfig(event)
  const base = deviceAuthorizationPath(client)
  return { ...config[client], deviceEndpoint: base + '/device', tokenEndpoint: base + '/token', revokeEndpoint: base + '/revoke',
    verificationEndpoint: base + '/verification' }
}

export function deviceVerificationUrl(event: H3Event, code: string) {
  const href = new URL(bffConfig(event).issuer.href.replace(/\/$/, '') + '/device')
  href.searchParams.set('user_code', code)
  return href.href
}

async function readJson(event: H3Event) {
  if (getHeader(event, 'content-type')?.split(';')[0]?.trim().toLowerCase() !== 'application/json')
    throw createError({ statusCode: 415, statusMessage: 'Expected application/json' })
  if (Number(getHeader(event, 'content-length')) > limit) throw createError({ statusCode: 413, statusMessage: 'Device request is too large' })
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of event.node.req.iterator({ destroyOnReturn: false }) as AsyncIterable<Buffer>) {
    size += chunk.length
    if (size > limit) throw createError({ statusCode: 413, statusMessage: 'Device request is too large' })
    chunks.push(chunk)
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown
  } catch {
    return null
  }
}

async function identityPost(event: H3Event, endpoint: 'auth/device' | 'token' | 'revoke', values: Record<string, string>) {
  const issuer = bffConfig(event).issuer.href.replace(/\/$/, '')
  try {
    return await fetch(issuer + '/protocol/openid-connect/' + endpoint, {
      method: 'POST', body: new URLSearchParams(values), redirect: 'error', signal: AbortSignal.timeout(8000)
    })
  } catch {
    throw createError({ statusCode: 503, statusMessage: 'Device authorization service unavailable' })
  }
}

async function providerError(response: Response) {
  const error = oauthError.safeParse(await response.json().catch(() => null))
  return error.success && response.status < 500 ? oauthResponse(error.data, response.status) : oauthResponse({ error: 'temporarily_unavailable' }, 503)
}

export async function handleDeviceRequest(event: H3Event, client: DeviceClient, action: 'device' | 'token' | 'revoke') {
  const config = bffConfig(event)
  const { clientId, scopes } = config[client]
  const raw = await readJson(event)
  const invalid = () => oauthResponse({ error: 'invalid_request' }, 400)
  if (action === 'device') {
    const request = startRequest.safeParse(raw)
    if (!request.success) return invalid()
    const response = await identityPost(event, 'auth/device', { client_id: clientId, scope: scopes,
      code_challenge: request.data.codeChallenge, code_challenge_method: 'S256' })
    if (!response.ok) return providerError(response)
    const grant = deviceGrant.safeParse(await response.json().catch(() => null))
    if (!grant.success) return oauthResponse({ error: 'temporarily_unavailable' }, 503)
    const { device_code, user_code, expires_in, interval } = grant.data
    await withBffRedis(event, redis => redis.set(bindingKey(client, device_code), request.data.codeChallenge, { EX: expires_in }))
    const target = new URL('/' + client + '/authorize', config.origin)
    target.searchParams.set('user_code', user_code)
    return oauthResponse({ deviceCode: device_code, userCode: user_code, verificationUrl: target.href, expiresIn: expires_in, interval })
  }

  if (action === 'revoke') {
    const request = revokeRequest.safeParse(raw)
    if (!request.success) return invalid()
    const { token, tokenTypeHint } = request.data
    const response = await identityPost(event, 'revoke', { client_id: clientId, token, ...(tokenTypeHint ? { token_type_hint: tokenTypeHint } : {}) })
    return response.ok ? new Response(null, { status: 204, headers }) : providerError(response)
  }

  const request = tokenRequest.safeParse(raw)
  if (!request.success) return invalid()
  const { deviceCode, codeVerifier } = request.data
  const key = bindingKey(client, deviceCode)
  const expected = await withBffRedis(event, redis => redis.get(key))
  if (!expected) return oauthResponse({ error: 'expired_token' }, 400)
  if (!challenge.safeParse(expected).success || !timingSafeEqual(Buffer.from(expected), Buffer.from(digest(codeVerifier))))
    return oauthResponse({ error: 'invalid_grant' }, 400)
  const response = await identityPost(event, 'token', { client_id: clientId, grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
    device_code: deviceCode, code_verifier: codeVerifier })
  if (!response.ok) {
    const result = await providerError(response)
    const { error } = await result.clone().json()
    if (response.status < 500 && !waiting.has(error) && error !== 'temporarily_unavailable') await withBffRedis(event, redis => redis.del(key))
    return result
  }
  await withBffRedis(event, redis => redis.del(key))
  const tokens = deviceTokens.safeParse(await response.json().catch(() => null))
  return tokens.success ? oauthResponse(tokens.data) : oauthResponse({ error: 'temporarily_unavailable' }, 503)
}

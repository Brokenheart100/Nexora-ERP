import type { H3Event } from 'h3'
import { createError, deleteCookie, getCookie, getQuery, sendRedirect, setCookie } from 'h3'
import * as oidc from 'openid-client'
import { bffConfig } from './bff-config'
import { clearCsrf } from './bff-csrf'
import { withBffRedis } from './bff-redis'
import { enforceSessionIdle, fetchSessionPolicy } from './bff-session-policy'
import {
  clearSessionRevocation, clearSsoHint, isHandle, isSessionRevoked, randomHandle, readBffSession, removeBffSession,
  saveBffSession, secureCookie, sessionHandle, touchBffSession, updateBffSession, type BffSession,
} from './bff-session'

const clientId = 'nexora-bff'
const loginPrefix = 'nexora:nitro:oidc:'
const loginCookie = '__Host-Nexora.Login'
const logoutCookie = '__Host-Nexora.Logout'
const flowCookie = { ...secureCookie, maxAge: 600 }
type LoginMode = 'nexora-email-login' | 'nexora-email-register'
interface LoginAttempt {
  verifier: string
  nonce: string
  destination: '/' | '/join'
  reauth: boolean
}

let configuration: Promise<oidc.Configuration> | undefined

function provider(event: H3Event) {
  const settings = bffConfig(event)
  configuration ??= oidc.discovery(settings.issuer, clientId, settings.clientSecret, undefined, {
    timeout: 5,
    execute: [oidc.enableNonRepudiationChecks],
  }).catch(() => {
    configuration = undefined
    throw createError({ statusCode: 503, statusMessage: 'Identity provider unavailable' })
  })
  return configuration
}

export async function beginLogin(event: H3Event, mode?: LoginMode) {
  const join = mode !== undefined && getQuery(event).join === 'true'
  const reauth = getQuery(event).prompt === 'login'
  const state = randomHandle()
  const attempt: LoginAttempt = {
    verifier: oidc.randomPKCECodeVerifier(),
    nonce: oidc.randomNonce(),
    destination: join ? '/join' : '/',
    reauth,
  }
  const settings = bffConfig(event)
  const redirect = oidc.buildAuthorizationUrl(await provider(event), {
    redirect_uri: new URL('/signin-oidc', settings.origin).href,
    scope: 'openid profile email',
    state,
    nonce: attempt.nonce,
    code_challenge: await oidc.calculatePKCECodeChallenge(attempt.verifier),
    code_challenge_method: 'S256',
    ...(mode ? { login_hint: mode } : {}),
    ...(reauth || join || mode === 'nexora-email-register' ? { prompt: 'login' } : {}),
  })
  const previous = getCookie(event, loginCookie)
  await withBffRedis(event, async (redis) => {
    const transaction = redis.multi().set(loginPrefix + state, JSON.stringify(attempt), { EX: flowCookie.maxAge })
    if (isHandle(previous)) transaction.del(loginPrefix + previous)
    await transaction.exec()
  })
  setCookie(event, loginCookie, state, flowCookie)
  return sendRedirect(event, redirect.href)
}

export async function completeLogin(event: H3Event) {
  const state = getCookie(event, loginCookie)
  if (!isHandle(state) || getQuery(event).state !== state)
    throw createError({ statusCode: 400, statusMessage: 'Invalid login response' })

  const value = await withBffRedis(event, redis => redis.getDel(loginPrefix + state))
  deleteCookie(event, loginCookie, secureCookie)
  if (!value) throw createError({ statusCode: 400, statusMessage: 'Login request expired' })
  const attempt: LoginAttempt = JSON.parse(value)
  const config = await provider(event)
  const callback = new URL('/signin-oidc', bffConfig(event).origin)
  callback.search = new URL(event.path, callback).search
  const tokens = await oidc.authorizationCodeGrant(config, callback, {
    expectedState: state, expectedNonce: attempt.nonce, pkceCodeVerifier: attempt.verifier,
  }).catch(() => {
    throw createError({ statusCode: 400, statusMessage: 'Invalid login response' })
  })
  const claims = tokens.claims()
  const accessLifetime = tokens.expiresIn()
  if (!tokens.id_token || !claims?.sub || !accessLifetime || accessLifetime <= 0)
    throw createError({ statusCode: 401, statusMessage: 'Login expired' })
  const sid = typeof claims.sid === 'string' ? claims.sid : undefined
  if (sid && !attempt.reauth && await isSessionRevoked(event, sid))
    return sendRedirect(event, '/bff/login?prompt=login')
  if (sid && attempt.reauth) await clearSessionRevocation(event, sid)
  const refreshLifetime = typeof tokens.refresh_expires_in === 'number' && tokens.refresh_expires_in > 0
    ? tokens.refresh_expires_in
    : 1800
  const now = Date.now()
  const amr = Array.isArray(claims.amr) ? claims.amr.filter((method): method is string => typeof method === 'string') : []
  const acr = typeof claims.acr === 'string' ? claims.acr : undefined
  const authTime = typeof claims.auth_time === 'number' && claims.auth_time > 0 ? claims.auth_time * 1000 : now
  const mfaVerified = amr.includes('otp') || amr.includes('mfa') || acr === '2'
  await saveBffSession(event, {
    subject: claims.sub,
    name: typeof claims.preferred_username === 'string' ? claims.preferred_username : claims.sub,
    accessToken: tokens.access_token,
    idToken: tokens.id_token,
    expiresAt: Math.min(claims.exp * 1000, now + accessLifetime * 1000),
    refreshToken: tokens.refresh_token,
    refreshExpiresAt: now + refreshLifetime * 1000,
    sid,
    ...(mfaVerified ? { mfaAt: Math.min(authTime, now), mfaMethods: amr } : {}),
  })
  clearCsrf(event)
  return sendRedirect(event, attempt.destination)
}

export async function beginLogout(event: H3Event) {
  const config = await provider(event)
  const origin = bffConfig(event).origin
  const state = randomHandle()
  const session = await removeBffSession(event)
  clearCsrf(event)
  const redirect = oidc.buildEndSessionUrl(config, {
    client_id: clientId,
    post_logout_redirect_uri: new URL('/signout-callback-oidc', origin).href,
    state,
    ...(session ? { id_token_hint: session.idToken } : {}),
  })
  setCookie(event, logoutCookie, state, flowCookie)
  return sendRedirect(event, redirect.href, 303)
}

export function completeLogout(event: H3Event) {
  const state = getCookie(event, logoutCookie)
  if (!isHandle(state) || getQuery(event).state !== state)
    throw createError({ statusCode: 400, statusMessage: 'Invalid logout response' })
  deleteCookie(event, logoutCookie, secureCookie)
  clearSsoHint(event)
  return sendRedirect(event, '/')
}

export async function frontChannelLogout(event: H3Event) {
  const { iss, sid } = getQuery(event)
  if (iss !== bffConfig(event).issuer.href || typeof sid !== 'string')
    return
  const session = await readBffSession(event)
  if (session?.sid === sid) {
    await removeBffSession(event)
    clearCsrf(event)
    clearSsoHint(event)
  }
}

export async function requireFreshBffSession(event: H3Event): Promise<BffSession> {
  const handle = sessionHandle(event)
  const session = await readBffSession(event)
  if (!session || !handle) throw createError({ statusCode: 401, statusMessage: 'Sign in required' })
  const policy = await fetchSessionPolicy(event, session)
  await enforceSessionIdle(event, handle, policy)
  if (session.expiresAt - Date.now() > 60_000) {
    await touchBffSession(event, handle, session)
    return session
  }
  return refreshBffSession(event, handle, session)
}

async function refreshBffSession(event: H3Event, handle: string, session: BffSession): Promise<BffSession> {
  if (!session.refreshToken) {
    await removeBffSession(event)
    throw createError({ statusCode: 401, statusMessage: 'Sign in required' })
  }
  let tokens: Awaited<ReturnType<typeof oidc.refreshTokenGrant>>
  try {
    tokens = await oidc.refreshTokenGrant(await provider(event), session.refreshToken)
  } catch {
    await removeBffSession(event)
    throw createError({ statusCode: 401, statusMessage: 'Sign in required' })
  }
  const lifetime = tokens.expiresIn()
  if (!lifetime || lifetime <= 0) {
    await removeBffSession(event)
    throw createError({ statusCode: 401, statusMessage: 'Sign in required' })
  }
  const now = Date.now()
  const claims = tokens.claims()
  const expiresAt = claims?.exp ? Math.min(claims.exp * 1000, now + lifetime * 1000) : now + lifetime * 1000
  const refreshLifetime = typeof tokens.refresh_expires_in === 'number' && tokens.refresh_expires_in > 0
    ? tokens.refresh_expires_in
    : 1800
  const updated: BffSession = {
    ...session,
    accessToken: tokens.access_token,
    idToken: tokens.id_token ?? session.idToken,
    refreshToken: tokens.refresh_token ?? session.refreshToken,
    expiresAt,
    refreshExpiresAt: now + refreshLifetime * 1000,
  }
  await updateBffSession(event, handle, updated)
  return updated
}

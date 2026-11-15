import { createHmac, timingSafeEqual } from 'node:crypto'
import type { H3Event } from 'h3'
import { createError, deleteCookie, getCookie, getHeader, readBody, setCookie } from 'h3'
import { bffConfig } from './bff-config'
import { isHandle, randomHandle, secureCookie, sessionHandle } from './bff-session'

const csrfCookie = '__Host-Nexora.Csrf'
const csrfOptions = { ...secureCookie, sameSite: 'strict' } as const

function tokenFor(event: H3Event, seed: string) {
  return createHmac('sha256', bffConfig(event).sessionKey)
    .update('nexora:nitro:csrf:v1\0')
    .update(seed).update('\0').update(sessionHandle(event) ?? '')
    .digest('base64url')
}

export function issueCsrf(event: H3Event) {
  const current = getCookie(event, csrfCookie)
  const seed = isHandle(current) ? current : randomHandle()
  if (seed !== current) setCookie(event, csrfCookie, seed, csrfOptions)
  return tokenFor(event, seed)
}

export function clearCsrf(event: H3Event) {
  deleteCookie(event, csrfCookie, csrfOptions)
}

export async function requireCsrf(event: H3Event, form = false) {
  const seed = getCookie(event, csrfCookie)
  let token = getHeader(event, 'x-csrf-token')
  if (form && !token && getHeader(event, 'content-type')?.split(';')[0] === 'application/x-www-form-urlencoded') {
    const body = await readBody<{ __RequestVerificationToken?: string }>(event)
    token = body?.__RequestVerificationToken
  }
  const origin = getHeader(event, 'origin')
  if (!isHandle(seed) || typeof token !== 'string' || !isHandle(token)
    || (origin && origin !== bffConfig(event).origin.origin)
    || !timingSafeEqual(Buffer.from(token), Buffer.from(tokenFor(event, seed)))) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid CSRF token' })
  }
}

import type { H3Event } from 'h3'
import { createError } from 'h3'
import { bffConfig } from '../runtime/bff-config'

export const CliScope = 'nexora.cli'
export const McpScope = 'nexora.mcp'
export type CliFlow = 'cli' | 'mcp'

const challengePattern = /^[A-Za-z0-9_-]{43,128}$/
const verifierPattern = /^[A-Za-z0-9._~-]{43,128}$/

export function isCodeChallenge(value: unknown): value is string {
  return typeof value === 'string' && challengePattern.test(value)
}

export function isCodeVerifier(value: unknown): value is string {
  return typeof value === 'string' && verifierPattern.test(value)
}

export function requiredScope(flow: CliFlow): string {
  return flow === 'mcp' ? McpScope : CliScope
}

export function scopeFor(flow: CliFlow, configured: unknown): string {
  const value = typeof configured === 'string' ? configured.trim() : ''
  const scopes = value.split(/\s+/).filter(Boolean)
  const required = requiredScope(flow)
  if (!scopes.includes('openid')) scopes.unshift('openid')
  if (!scopes.includes(required)) scopes.push(required)
  return scopes.join(' ')
}

export function cliScope(configured: unknown): string {
  return scopeFor('cli', configured)
}

function realmUrl(issuer: URL, path: string) {
  return `${issuer.href.replace(/\/$/, '')}/${path}`
}

export function verificationPageUrl(origin: URL, userCode: string) {
  const url = new URL('/cli/authorize', origin)
  url.searchParams.set('user_code', userCode)
  return url.href
}

export function keycloakVerificationUrl(issuer: URL, userCode: string) {
  const url = new URL(realmUrl(issuer, 'device'))
  url.searchParams.set('user_code', userCode)
  return url.href
}

export interface DeviceGrant {
  deviceCode: string
  userCode: string
  verificationUrl: string
  identityUrl: string
  expiresIn: number
  interval: number
}

export function deviceGrantView(body: unknown, settings: { origin: URL, issuer: URL }): DeviceGrant {
  const grant = (body ?? {}) as Record<string, unknown>
  const deviceCode = typeof grant.device_code === 'string' ? grant.device_code : ''
  const userCode = typeof grant.user_code === 'string' ? grant.user_code : ''
  const expiresIn = typeof grant.expires_in === 'number' ? grant.expires_in : 0
  const interval = typeof grant.interval === 'number' && grant.interval > 0 ? grant.interval : 5
  if (!deviceCode || !userCode || expiresIn <= 0)
    throw createError({ statusCode: 502, statusMessage: 'Identity provider rejected the device authorization' })
  return {
    deviceCode,
    userCode,
    verificationUrl: verificationPageUrl(settings.origin, userCode),
    identityUrl: keycloakVerificationUrl(settings.issuer, userCode),
    expiresIn,
    interval,
  }
}

function flowClient(settings: ReturnType<typeof bffConfig>, flow: CliFlow) {
  return flow === 'mcp' ? settings.mcp : settings.cli
}

export async function deviceAuthorization(event: H3Event, codeChallenge: string, flow: CliFlow = 'cli'): Promise<DeviceGrant> {
  const settings = bffConfig(event)
  const client = flowClient(settings, flow)
  const response = await $fetch.raw(realmUrl(settings.issuer, 'protocol/openid-connect/auth/device'), {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: client.clientId,
      scope: scopeFor(flow, client.scopes),
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    }).toString(),
    ignoreResponseError: true,
  })
  if (response.status !== 200)
    throw createError({ statusCode: 502, statusMessage: 'Identity provider rejected the device authorization' })
  return deviceGrantView(response._data, settings)
}

export async function exchangeDeviceCode(event: H3Event, deviceCode: string, codeVerifier: string, flow: CliFlow = 'cli') {
  const settings = bffConfig(event)
  const client = flowClient(settings, flow)
  const response = await $fetch.raw(realmUrl(settings.issuer, 'protocol/openid-connect/token'), {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      device_code: deviceCode,
      client_id: client.clientId,
      code_verifier: codeVerifier,
    }).toString(),
    ignoreResponseError: true,
  })
  return { status: response.status, body: (response._data ?? {}) as Record<string, unknown> }
}

export async function revokeCliToken(event: H3Event, token: string, tokenTypeHint?: string, flow: CliFlow = 'cli') {
  const settings = bffConfig(event)
  const client = flowClient(settings, flow)
  const response = await $fetch.raw(realmUrl(settings.issuer, 'protocol/openid-connect/revoke'), {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: client.clientId,
      token,
      ...(tokenTypeHint ? { token_type_hint: tokenTypeHint } : {}),
    }).toString(),
    ignoreResponseError: true,
  })
  return response.status >= 200 && response.status < 300
}

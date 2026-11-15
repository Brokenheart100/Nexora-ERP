import type { H3Event } from 'h3'
import { createError } from 'h3'
import type { MfaPolicy } from './bff-mfa'

function flag(value: unknown, fallback: boolean) {
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') return value === 'true' || value === '1'
  return fallback
}

function seconds(value: unknown, fallback: number) {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback
}

export function bffConfig(event: H3Event) {
  const { bff, public: { bffOrigin } } = useRuntimeConfig(event)
  if (!bff.issuer || !bff.clientSecret || bff.sessionKey.length < 32 || !bff.redisUrl || !bff.gatewayUrl || !bffOrigin)
    throw createError({ statusCode: 503, statusMessage: 'Web session service unavailable' })

  const issuer = URL.parse(bff.issuer)
  const origin = URL.parse(bffOrigin)
  const gateway = URL.parse(bff.gatewayUrl)
  if (!issuer || !origin || !gateway ||
      [issuer, origin, gateway].some(url => url.protocol !== 'https:' || url.username || url.password || url.search || url.hash))
    throw createError({ statusCode: 503, statusMessage: 'Web session service unavailable' })

  const mfa: MfaPolicy = {
    enabled: flag(bff.mfaEnabled, true),
    required: flag(bff.mfaRequired, true),
    stepUpSeconds: seconds(bff.mfaStepUpSeconds, 300),
  }
  const cli = {
    clientId: typeof bff.cliClientId === 'string' && bff.cliClientId ? bff.cliClientId : 'nexora-cli',
    scopes: typeof bff.cliScopes === 'string' && bff.cliScopes ? bff.cliScopes : 'openid nexora.cli',
  }
  const mcp = {
    clientId: typeof bff.mcpClientId === 'string' && bff.mcpClientId ? bff.mcpClientId : 'nexora-mcp',
    scopes: typeof bff.mcpScopes === 'string' && bff.mcpScopes ? bff.mcpScopes : 'openid nexora.mcp',
  }
  return { clientSecret: bff.clientSecret, sessionKey: bff.sessionKey, redisUrl: bff.redisUrl, gatewayUrl: bff.gatewayUrl, issuer, origin, gateway, mfa, cli, mcp }
}

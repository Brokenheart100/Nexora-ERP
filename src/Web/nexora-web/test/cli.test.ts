import { describe, expect, it } from 'vitest'
import { cliScope, deviceGrantView, isCodeChallenge, isCodeVerifier, keycloakVerificationUrl, requiredScope, scopeFor, verificationPageUrl } from '../server/utils/bff-cli'

const challenge = 'a'.repeat(43)

describe('cli device authorization helpers', () => {
  it('accepts only base64url PKCE challenges and verifiers', () => {
    expect(isCodeChallenge(challenge)).toBe(true)
    expect(isCodeChallenge('a'.repeat(42))).toBe(false)
    expect(isCodeChallenge('not a challenge')).toBe(false)
    expect(isCodeVerifier('b'.repeat(64))).toBe(true)
    expect(isCodeVerifier('short')).toBe(false)
  })

  it('always requests the CLI scope with openid', () => {
    expect(cliScope('openid nexora.cli')).toBe('openid nexora.cli')
    expect(cliScope('openid')).toBe('openid nexora.cli')
    expect(cliScope('nexora.cli')).toBe('openid nexora.cli')
    expect(cliScope(undefined)).toBe('openid nexora.cli')
  })

  it('requests the MCP scope for the finance MCP client', () => {
    expect(requiredScope('mcp')).toBe('nexora.mcp')
    expect(scopeFor('mcp', 'openid nexora.mcp')).toBe('openid nexora.mcp')
    expect(scopeFor('mcp', 'openid')).toBe('openid nexora.mcp')
    expect(scopeFor('mcp', undefined)).toBe('openid nexora.mcp')
    expect(scopeFor('cli', 'openid nexora.mcp')).toBe('openid nexora.mcp nexora.cli')
  })

  it('builds the Nexora page and Keycloak verification urls', () => {
    expect(verificationPageUrl(new URL('https://localhost:7443'), 'ABCD-EFGH'))
      .toBe('https://localhost:7443/cli/authorize?user_code=ABCD-EFGH')
    expect(keycloakVerificationUrl(new URL('https://localhost:8088/realms/nexora'), 'ABCD-EFGH'))
      .toBe('https://localhost:8088/realms/nexora/device?user_code=ABCD-EFGH')
    expect(keycloakVerificationUrl(new URL('https://localhost:8088/realms/nexora/'), 'ABCD-EFGH'))
      .toBe('https://localhost:8088/realms/nexora/device?user_code=ABCD-EFGH')
  })

  it('maps a device grant and rejects incomplete responses', () => {
    const view = deviceGrantView(
      { device_code: 'device-1', user_code: 'ABCD-EFGH', expires_in: 600, interval: 5 },
      { origin: new URL('https://localhost:7443'), issuer: new URL('https://localhost:8088/realms/nexora') },
    )
    expect(view).toEqual({
      deviceCode: 'device-1',
      userCode: 'ABCD-EFGH',
      verificationUrl: 'https://localhost:7443/cli/authorize?user_code=ABCD-EFGH',
      identityUrl: 'https://localhost:8088/realms/nexora/device?user_code=ABCD-EFGH',
      expiresIn: 600,
      interval: 5,
    })
    expect(() => deviceGrantView({ device_code: 'device-1' }, {
      origin: new URL('https://localhost:7443'),
      issuer: new URL('https://localhost:8088/realms/nexora'),
    })).toThrow()
  })
})

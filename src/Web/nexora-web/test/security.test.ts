import { describe, expect, it } from 'vitest'
import { evaluateMfaGate, isSensitiveRequest, securityCapabilities, type MfaPolicy } from '../server/utils/bff-mfa'

const policy: MfaPolicy = { enabled: true, required: true, stepUpSeconds: 300 }
const now = 1_800_000_000_000
const verified = { mfaAt: now - 60_000, mfaMethods: ['pwd', 'otp'] }

describe('securityCapabilities', () => {
  it('reports an enrolled account with its factor methods and last verification', () => {
    const capabilities = securityCapabilities(policy, verified)
    expect(capabilities).toMatchObject({ available: true, required: true, enrolled: true, methods: ['otp'], stepUpSeconds: 300 })
    expect(capabilities.lastVerifiedAt).toBe(new Date(verified.mfaAt).toISOString())
    expect(capabilities.reauthPath).toBe('/bff/login?prompt=login')
  })

  it('keeps the disabled two-state distinct from an unenrolled account', () => {
    const disabled = securityCapabilities({ ...policy, enabled: false }, verified)
    expect(disabled).toMatchObject({ available: false, required: false, enrolled: true })
    const unenrolled = securityCapabilities(policy, {})
    expect(unenrolled).toMatchObject({ available: true, required: true, enrolled: false, methods: [], lastVerifiedAt: null })
  })
})

describe('isSensitiveRequest', () => {
  it('guards the company settings, role, bank and ledger write endpoints', () => {
    expect(isSensitiveRequest('PUT', '/api/workspaces/ws/settings')).toBe(true)
    expect(isSensitiveRequest('POST', '/api/workspaces/ws/members/m1')).toBe(true)
    expect(isSensitiveRequest('POST', '/api/workspaces/ws/members/m1/finance-role')).toBe(true)
    expect(isSensitiveRequest('POST', '/api/finance/workspaces/ws/trade/banks')).toBe(true)
    expect(isSensitiveRequest('POST', '/api/finance/workspaces/ws/ledger/journals/j1/decision')).toBe(true)
    expect(isSensitiveRequest('POST', '/api/finance/workspaces/ws/ledger/journals/j1/reversal')).toBe(true)
  })

  it('ignores reads and ordinary business writes', () => {
    expect(isSensitiveRequest('GET', '/api/workspaces/ws/settings')).toBe(false)
    expect(isSensitiveRequest('POST', '/api/finance/workspaces/ws/receivables/documents')).toBe(false)
    expect(isSensitiveRequest('POST', '/api/workspaces/ws/announcements')).toBe(false)
  })
})

describe('evaluateMfaGate', () => {
  it('allows a recent verification and rejects a stale one', () => {
    expect(evaluateMfaGate(policy, verified, 'PUT', '/api/workspaces/ws/settings', now)).toEqual({ allowed: true })
    expect(evaluateMfaGate(policy, { ...verified, mfaAt: now - 301_000 }, 'PUT', '/api/workspaces/ws/settings', now))
      .toEqual({ allowed: false, code: 'mfa_step_up_required' })
  })

  it('requires enrollment when no factor was used', () => {
    expect(evaluateMfaGate(policy, {}, 'POST', '/api/finance/workspaces/ws/trade/banks', now))
      .toEqual({ allowed: false, code: 'mfa_enrollment_required' })
  })

  it('stays out of the way for reads and when the deployment disables MFA', () => {
    expect(evaluateMfaGate(policy, {}, 'GET', '/api/workspaces/ws/settings', now)).toEqual({ allowed: true })
    expect(evaluateMfaGate({ ...policy, enabled: false }, {}, 'PUT', '/api/workspaces/ws/settings', now)).toEqual({ allowed: true })
    expect(evaluateMfaGate({ ...policy, required: false }, {}, 'PUT', '/api/workspaces/ws/settings', now)).toEqual({ allowed: true })
  })
})

import type { BffSession } from './bff-session'

export interface MfaPolicy {
  enabled: boolean
  required: boolean
  stepUpSeconds: number
}

export interface SecurityCapabilities {
  available: boolean
  required: boolean
  enrolled: boolean
  methods: string[]
  stepUpSeconds: number
  lastVerifiedAt: string | null
  reauthPath: string
}

export type MfaGateCode = 'mfa_enrollment_required' | 'mfa_step_up_required'

export interface MfaGateDecision {
  allowed: boolean
  code?: MfaGateCode
}

export const reauthPath = '/bff/login?prompt=login'

const factorMethods = new Set(['otp', 'mfa'])

export function isSensitiveRequest(method: string, path: string) {
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return false
  return /^\/api\/workspaces\/[^/]+\/settings$/.test(path)
    || /^\/api\/workspaces\/[^/]+\/members\/[^/]+(?:\/(?:business-roles|finance-role|sales-role))?$/.test(path)
    || /^\/api\/finance\/workspaces\/[^/]+\/trade\/banks$/.test(path)
    || /^\/api\/finance\/workspaces\/[^/]+\/ledger\/journals\/[^/]+\/(?:decision|reversal)$/.test(path)
}

export function securityCapabilities(
  policy: MfaPolicy, session: Pick<BffSession, 'mfaAt' | 'mfaMethods'>,
): SecurityCapabilities {
  const enrolled = typeof session.mfaAt === 'number' && Number.isFinite(session.mfaAt)
  return {
    available: policy.enabled,
    required: policy.enabled && policy.required,
    enrolled,
    methods: enrolled ? (session.mfaMethods ?? []).filter(method => factorMethods.has(method)) : [],
    stepUpSeconds: policy.stepUpSeconds,
    lastVerifiedAt: enrolled ? new Date(session.mfaAt!).toISOString() : null,
    reauthPath,
  }
}

export function evaluateMfaGate(
  policy: MfaPolicy, session: Pick<BffSession, 'mfaAt' | 'mfaMethods'>,
  method: string, path: string, now = Date.now(),
): MfaGateDecision {
  if (!policy.enabled || !policy.required) return { allowed: true }
  if (!isSensitiveRequest(method.toUpperCase(), path)) return { allowed: true }
  if (typeof session.mfaAt !== 'number') return { allowed: false, code: 'mfa_enrollment_required' }
  if (now - session.mfaAt > policy.stepUpSeconds * 1000) return { allowed: false, code: 'mfa_step_up_required' }
  return { allowed: true }
}

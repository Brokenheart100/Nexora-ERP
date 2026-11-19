import type { BffSession } from '../session/bff-session'

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

export function hasIndependentFactor(methods: string[]) {
  return methods.includes('mfa') || (methods.includes('otp') && (methods.includes('pwd') || methods.includes('email')))
}

function verifiedAt(session: Pick<BffSession, 'mfaAt' | 'mfaMethods'>) {
  return typeof session.mfaAt === 'number' && Number.isFinite(session.mfaAt) && hasIndependentFactor(session.mfaMethods ?? [])
    ? session.mfaAt : undefined
}

export function isSensitiveRequest(method: string, path: string) {
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return false
  return /^\/api\/workspaces\/[^/]+\/settings$/.test(path)
    || /^\/api\/workspaces\/[^/]+\/members\/[^/]+(?:\/(?:business-roles|finance-role|sales-role))?$/.test(path)
    || /^\/api\/finance\/workspaces\/[^/]+\/trade\/banks$/.test(path)
    || /^\/api\/finance\/workspaces\/[^/]+\/ledger\/journals\/[^/]+\/(?:decision|reversal)$/.test(path)
    || /^\/api\/finance\/workspaces\/[^/]+\/ledger\/opening-subledgers\/[^/]+\/decision$/.test(path)
}

export function securityCapabilities(
  policy: MfaPolicy, session: Pick<BffSession, 'mfaAt' | 'mfaMethods'>,
): SecurityCapabilities {
  const lastVerifiedAt = verifiedAt(session)
  const enrolled = lastVerifiedAt !== undefined
  return {
    available: policy.enabled,
    required: policy.enabled && policy.required,
    enrolled,
    methods: enrolled ? (session.mfaMethods ?? []).filter(method => factorMethods.has(method)) : [],
    stepUpSeconds: policy.stepUpSeconds,
    lastVerifiedAt: lastVerifiedAt === undefined ? null : new Date(lastVerifiedAt).toISOString(),
    reauthPath,
  }
}

export function evaluateMfaGate(
  policy: MfaPolicy, session: Pick<BffSession, 'mfaAt' | 'mfaMethods'>,
  method: string, path: string, now = Date.now(),
): MfaGateDecision {
  if (!policy.enabled || !policy.required) return { allowed: true }
  if (!isSensitiveRequest(method.toUpperCase(), path)) return { allowed: true }
  const at = verifiedAt(session)
  if (at === undefined) return { allowed: false, code: 'mfa_enrollment_required' }
  if (now - at > policy.stepUpSeconds * 1000) return { allowed: false, code: 'mfa_step_up_required' }
  return { allowed: true }
}

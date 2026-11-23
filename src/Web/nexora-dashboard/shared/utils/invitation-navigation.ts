export const pendingInvitationKey = 'nexora-dashboard.pending-invitation'

export function parseInvitationFragment(value: string | null) {
  const match = value?.match(/^([\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12})\.([\da-f]{64})$/i)
  return match ? { id: match[1]!, token: match[2]! } : null
}

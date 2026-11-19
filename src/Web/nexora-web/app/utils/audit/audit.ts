export type AuditSource = 'organization' | 'finance' | 'sales' | 'purchasing'

export interface AuditEntry {
  id: string
  source: string
  action: string
  actorIssuer: string
  actorSubject: string
  targetId: string | null
  version: number | null
  operationId: string | null
  occurredAtUtc: string
}

export interface AuditPage {
  entries: AuditEntry[]
  hasMore: boolean
  retentionDays?: number
}

export interface AuditFilters {
  from: string
  through: string
  actor: string
  action: string
  targetId: string
  source: '' | AuditSource
}

export function auditIsoDate(value: string, endOfDay: boolean): string {
  const trimmed = value.trim()
  if (!trimmed) return ''
  const parsed = new Date(trimmed + (endOfDay ? 'T23:59:59.999Z' : 'T00:00:00.000Z'))
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString()
}

export function auditQueryParams(filters: AuditFilters, page: number): Record<string, string> {
  const params: Record<string, string> = { page: String(page) }
  const from = auditIsoDate(filters.from, false)
  const through = auditIsoDate(filters.through, true)
  if (from) params.from = from
  if (through) params.through = through
  const actor = filters.actor.trim()
  if (actor) params.actor = actor
  const action = filters.action.trim()
  if (action) params.action = action
  const targetId = filters.targetId.trim()
  if (targetId) params.targetId = targetId
  return params
}

export function mergeAuditEntries(entries: AuditEntry[]): AuditEntry[] {
  const seen = new Map<string, AuditEntry>()
  for (const entry of entries) seen.set(entry.source + '|' + entry.id, entry)
  return [...seen.values()].sort((left, right) => right.occurredAtUtc.localeCompare(left.occurredAtUtc))
}

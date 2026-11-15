import { auditIsoDate } from './audit'

export type RecordChangeOperation = '' | 'created' | 'updated' | 'deleted'

export interface RecordChange {
  id: string
  service: string
  entityName: string
  entityId: string
  operation: string
  tenantId: string
  workspaceId: string
  actorIssuer: string
  actorSubject: string
  occurredAtUtc: string
  changedProperties: string | null
  beforeJson: string | null
  afterJson: string | null
}

export interface RecordChangePage {
  changes: RecordChange[]
  hasMore: boolean
  retentionDays?: number
}

export interface RecordChangeFilters {
  from: string
  through: string
  actor: string
  entityName: string
  operation: RecordChangeOperation
  entityId: string
}

export const recordChangeOperations: { id: RecordChangeOperation; label: string }[] = [
  { id: '', label: '全部操作' },
  { id: 'created', label: '创建' },
  { id: 'updated', label: '更新' },
  { id: 'deleted', label: '删除' },
]

export function recordChangeOperationLabel(operation: string): string {
  switch (operation) {
    case 'created': return '创建'
    case 'updated': return '更新'
    case 'deleted': return '删除'
    default: return operation
  }
}

export function recordChangeQueryParams(filters: RecordChangeFilters, page: number): Record<string, string> {
  const params: Record<string, string> = { page: String(page) }
  const from = auditIsoDate(filters.from, false)
  const through = auditIsoDate(filters.through, true)
  if (from) params.from = from
  if (through) params.through = through
  const actor = filters.actor.trim()
  if (actor) params.actor = actor
  const entityName = filters.entityName.trim()
  if (entityName) params.entityName = entityName
  if (filters.operation) params.operation = filters.operation
  const entityId = filters.entityId.trim()
  if (entityId) params.entityId = entityId
  return params
}

export function changedPropertyNames(change: RecordChange): string[] {
  return (change.changedProperties ?? '').split(',').map(name => name.trim()).filter(Boolean)
}

export function recordChangeSummary(change: RecordChange): string {
  if (change.operation === 'created') return '新增记录'
  if (change.operation === 'deleted') return '删除记录'
  const names = changedPropertyNames(change)
  return names.length ? '变更 ' + names.length + ' 项：' + names.join('、') : '无字段变更'
}

export function mergeRecordChanges(changes: RecordChange[]): RecordChange[] {
  const seen = new Map<string, RecordChange>()
  for (const change of changes) seen.set(change.service + '|' + change.id, change)
  return [...seen.values()].sort((left, right) => right.occurredAtUtc.localeCompare(left.occurredAtUtc))
}

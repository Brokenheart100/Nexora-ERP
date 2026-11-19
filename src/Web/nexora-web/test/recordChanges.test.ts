import { describe, expect, it } from 'vitest'
import {
  changedPropertyNames,
  mergeRecordChanges,
  recordChangeOperationLabel,
  recordChangeQueryParams,
  recordChangeSummary,
  type RecordChange,
} from '../app/utils/audit/recordChanges'

function change(overrides: Partial<RecordChange>): RecordChange {
  return {
    id: 'c1', service: 'finance', entityName: 'JournalEntry', entityId: 'e1', operation: 'updated',
    tenantId: 't1', workspaceId: 'w1', actorIssuer: 'issuer', actorSubject: 'subject',
    occurredAtUtc: '2026-11-14T04:00:00+00:00', changedProperties: null, beforeJson: null, afterJson: null,
    ...overrides,
  }
}

describe('recordChangeOperationLabel', () => {
  it('maps known operations and passes through unknown ones', () => {
    expect(recordChangeOperationLabel('created')).toBe('创建')
    expect(recordChangeOperationLabel('updated')).toBe('更新')
    expect(recordChangeOperationLabel('deleted')).toBe('删除')
    expect(recordChangeOperationLabel('restored')).toBe('restored')
  })
})

describe('recordChangeQueryParams', () => {
  it('keeps only the page when filters are empty', () => {
    expect(recordChangeQueryParams({
      from: '', through: '', actor: '', entityName: '', operation: '', entityId: '',
    }, 1)).toEqual({ page: '1' })
  })

  it('converts dates and trims text filters', () => {
    const params = recordChangeQueryParams({
      from: '2026-11-01', through: '2026-11-14', actor: ' subject ', entityName: ' JournalEntry ',
      operation: 'updated', entityId: ' e1 ',
    }, 3)
    expect(params.from).toBe('2026-11-01T00:00:00.000Z')
    expect(params.through).toBe('2026-11-14T23:59:59.999Z')
    expect(params.actor).toBe('subject')
    expect(params.entityName).toBe('JournalEntry')
    expect(params.operation).toBe('updated')
    expect(params.entityId).toBe('e1')
    expect(params.page).toBe('3')
  })
})

describe('recordChangeSummary', () => {
  it('summarizes created, deleted and updated changes', () => {
    expect(recordChangeSummary(change({ operation: 'created' }))).toBe('新增记录')
    expect(recordChangeSummary(change({ operation: 'deleted' }))).toBe('删除记录')
    expect(recordChangeSummary(change({ changedProperties: 'Status,Name' }))).toBe('变更 2 项：Status、Name')
    expect(recordChangeSummary(change({ changedProperties: null }))).toBe('无字段变更')
  })

  it('splits changed property names defensively', () => {
    expect(changedPropertyNames(change({ changedProperties: ' A , B,,' }))).toEqual(['A', 'B'])
    expect(changedPropertyNames(change({ changedProperties: null }))).toEqual([])
  })
})

describe('mergeRecordChanges', () => {
  it('deduplicates by service and id and sorts newest first', () => {
    const merged = mergeRecordChanges([
      change({ id: 'old', occurredAtUtc: '2026-11-13T00:00:00+00:00' }),
      change({ id: 'new', occurredAtUtc: '2026-11-14T00:00:00+00:00' }),
      change({ id: 'old', service: 'finance', occurredAtUtc: '2026-11-13T00:00:00+00:00' }),
    ])
    expect(merged.map(item => item.id)).toEqual(['new', 'old'])
  })
})

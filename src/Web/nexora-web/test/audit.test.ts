import { describe, expect, it } from 'vitest'
import { auditIsoDate, auditQueryParams, mergeAuditEntries } from '../app/utils/audit/audit'
import type { AuditEntry, AuditFilters } from '../app/utils/audit/audit'

const filters: AuditFilters = { from: '', through: '', actor: '', action: '', targetId: '', source: '' }

function entry(id: string, source: string, occurredAtUtc: string): AuditEntry {
  return { id, source, action: 'workspace.opened', actorIssuer: 'issuer', actorSubject: 'subject', targetId: null, version: null, operationId: null, occurredAtUtc }
}

describe('auditIsoDate', () => {
  it('returns an empty string when the date is blank or invalid', () => {
    expect(auditIsoDate('', false)).toBe('')
    expect(auditIsoDate('  ', true)).toBe('')
    expect(auditIsoDate('not-a-date', false)).toBe('')
  })

  it('expands a date to the start or end of the UTC day', () => {
    expect(auditIsoDate('2026-11-13', false)).toBe('2026-11-13T00:00:00.000Z')
    expect(auditIsoDate('2026-11-13', true)).toBe('2026-11-13T23:59:59.999Z')
  })
})

describe('auditQueryParams', () => {
  it('only sends page when every filter is blank', () => {
    expect(auditQueryParams(filters, 1)).toEqual({ page: '1' })
  })

  it('sends trimmed filters with converted date bounds', () => {
    expect(auditQueryParams({ ...filters, from: '2026-11-01', through: '2026-11-13', actor: ' alice ', action: 'workspace.settings.revised', targetId: ' 7f6a ' }, 2))
      .toEqual({
        page: '2',
        from: '2026-11-01T00:00:00.000Z',
        through: '2026-11-13T23:59:59.999Z',
        actor: 'alice',
        action: 'workspace.settings.revised',
        targetId: '7f6a',
      })
  })
})

describe('mergeAuditEntries', () => {
  it('deduplicates by source and id and sorts newest first', () => {
    const merged = mergeAuditEntries([
      entry('b', 'finance', '2026-11-13T02:00:00+00:00'),
      entry('a', 'organization', '2026-11-13T03:00:00+00:00'),
      entry('b', 'finance', '2026-11-13T02:00:00+00:00'),
    ])
    expect(merged.map(item => item.id + ':' + item.source)).toEqual(['a:organization', 'b:finance'])
  })
})

// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { assessPrerequisites, permittedOrderDepartments } from '../app/utils/finance/prerequisites'
import type { FinancePrerequisites } from '../shared/types/prerequisites'
import type { WireAccess } from '../shared/types/wire'

describe('D3 transaction readiness', () => {
  it('retains denied and unavailable states instead of treating them as configured', () => {
    const snapshot = Object.fromEntries(['book', 'chart', 'ledger', 'trade', 'receivables', 'banks', 'tax'].map(key => [key, { state: 'denied', message: 'No permission' }])) as unknown as FinancePrerequisites
    expect(assessPrerequisites(snapshot, '2026-01-03').every(row => row.state === 'denied')).toBe(true)
  })
  it('requires the business-date period, mappings and actual bank and tax configuration', () => {
    const snapshot = { book: { state: 'ready', data: { settings: { baseCurrency: 'CNY' } } }, chart: { state: 'ready', data: { accounts: [{}] } },
      ledger: { state: 'ready', data: { periods: [{ month: '2026-01', state: 'closed' }] } }, trade: { state: 'ready', data: { setup: null } }, receivables: { state: 'ready', data: { accounts: null } },
      banks: { state: 'ready', data: [] }, tax: { state: 'ready', data: { groups: [], rates: [] } } } as unknown as FinancePrerequisites
    const rows = assessPrerequisites(snapshot, '2026-01-03')
    expect(rows.find(row => row.key === 'ledger')?.state).toBe('missing')
    expect(rows.filter(row => row.state === 'ready')).toHaveLength(2)
  })
  it('filters departments by the specific order permission and date window', () => {
    const departments = [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }]
    const access = { permissions: [], scopedPermissions: [{ permission: 'purchasing.order.read', departmentId: 'a', warehouseId: null, startsOn: '2026-01-01', endsOn: '2026-01-31' },
      { permission: 'sales.order.read', departmentId: 'b', warehouseId: null, startsOn: null, endsOn: null }] } as unknown as WireAccess
    expect(permittedOrderDepartments(departments, access, 'purchasing', '2026-01-03').map(value => value.id)).toEqual(['a'])
    expect(permittedOrderDepartments(departments, access, 'purchasing', '2026-02-01')).toEqual([])
  })
})

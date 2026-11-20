import { describe, expect, it } from 'vitest'
import { purchaseActions, remainingAllowance } from '../app/utils/purchasing/order-policy'
import { subtractDecimal } from '../shared/utils/decimal'

const access = { permissions: ['purchasing.order.create', 'purchasing.order.submit', 'purchasing.order.approve'], scopedPermissions: [] }
describe('purchase UI permissions and quantities', () => {
  it('keeps maker and approver actions separate even when one identity has both permissions', () => {
    expect(purchaseActions({ state: 'submitted', isMaker: true, departmentId: null }, access)).toEqual(['withdraw'])
    expect(purchaseActions({ state: 'submitted', isMaker: false, departmentId: null }, access)).toEqual(['return', 'approve'])
    expect(purchaseActions({ state: 'draft', isMaker: false, departmentId: null }, access)).toEqual([])
    expect(purchaseActions({ state: 'closed', isMaker: true, departmentId: null }, access)).toEqual([])
  })
  it('does not grant department-scoped create permission outside that department', () => {
    const scoped = { permissions: [], scopedPermissions: [{ permission: 'purchasing.order.create', departmentId: 'one', warehouseId: null, startsOn: null, endsOn: null }] }
    expect(purchaseActions({ state: 'draft', isMaker: true, departmentId: 'two' }, scoped)).not.toContain('edit')
    expect(purchaseActions({ state: 'draft', isMaker: true, departmentId: 'one' }, scoped)).toContain('edit')
  })
  it('releases only acknowledged cancelled remainder, keeping pending cancellation occupied', () => {
    const permits = [{ lineId: 'line', quantity: '40', executed: '10', state: 'cancelling' }, { lineId: 'line', quantity: '60', executed: '20', state: 'cancelled' }]
    expect(remainingAllowance('100', 'line', permits)).toBe('40')
    expect(subtractDecimal('9007199254740993.000001', '0.000001')).toBe('9007199254740993')
  })
})

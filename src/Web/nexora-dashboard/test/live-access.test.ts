import { describe, expect, it } from 'vitest'
import { canAccessRoute, hasPermission, permittedDepartments } from '../app/utils/api/access'

const access = {
  permissions: ['organization.workspace.read', 'masterdata.catalog.read'],
  scopedPermissions: [{ permission: 'inventory.stock.read', departmentId: null, warehouseId: 'warehouse-one', startsOn: null, endsOn: null },
    { permission: 'sales.order.read', departmentId: 'department-one', warehouseId: null, startsOn: null, endsOn: null }]
}

describe('live workspace navigation and resource scope', () => {
  it('does not promote resource grants to company permissions', () => {
    expect(hasPermission(access, 'inventory.stock.read')).toBe(false)
    expect(hasPermission(access, 'inventory.stock.read', { warehouseId: 'warehouse-one' })).toBe(true)
    expect(hasPermission(access, 'inventory.stock.read', { warehouseId: 'warehouse-two' })).toBe(false)
  })

  it('requires both the published permission and the module entitlement', () => {
    expect(canAccessRoute('/catalog', access, ['catalog'])).toBe(true)
    expect(canAccessRoute('/sales', access, ['sales'])).toBe(true)
    expect(canAccessRoute('/sales', access, ['catalog'])).toBe(false)
    expect(canAccessRoute('/finance', access, ['book'])).toBe(false)
    expect(canAccessRoute('/not-a-module', access, ['catalog'])).toBe(false)
  })

  it('filters order departments by the matching read or create permission', () => {
    const departments = [{ id: 'department-one', name: 'One', isActive: true }, { id: 'department-two', name: 'Two', isActive: true }]
    expect(permittedDepartments(access, departments, 'sales.order.read').map(item => item.id)).toEqual(['department-one'])
    expect(permittedDepartments(access, departments, 'sales.order.create')).toEqual([])
  })

  it('includes an assigned receiver only after the warehouse service confirms access', () => {
    const reader = { permissions: ['organization.workspace.read'], scopedPermissions: [] }
    expect(canAccessRoute('/inventory', reader, ['inventory'])).toBe(false)
    expect(canAccessRoute('/inventory', reader, ['inventory'], { warehouseVisible: true })).toBe(true)
    expect(canAccessRoute('/inventory', reader, [], { warehouseVisible: true })).toBe(false)
  })

  it('checks period grants against a business date without granting company or order access', () => {
    const reader = { permissions: [], scopedPermissions: [{ permission: 'finance.ledger.read', departmentId: null, warehouseId: null, startsOn: '2026-01-01', endsOn: '2026-01-31' }] }
    expect(hasPermission(reader, 'finance.ledger.read')).toBe(false)
    expect(hasPermission(reader, 'finance.ledger.read', { on: '2026-01-15' })).toBe(true)
    expect(hasPermission(reader, 'finance.ledger.read', { on: '2026-02-01' })).toBe(false)
    expect(hasPermission(reader, 'finance.ledger.read', { departmentId: 'department-one', on: '2026-01-15' })).toBe(false)
  })
})

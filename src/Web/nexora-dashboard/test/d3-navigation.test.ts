// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { canVisitWorkspacePage } from '../app/utils/organization/navigation'
import type { WireAccess, WireEntitlements } from '../shared/types/wire'

const access = { permissions: ['masterdata.catalog.read'], scopedPermissions: [] } as unknown as WireAccess
const entitlement = { modules: ['catalog'] } as WireEntitlements
describe('D3 navigation follows authoritative permissions and modules', () => {
  it('requires both the published module and read permission', () => {
    expect(canVisitWorkspacePage('/catalog', access, entitlement)).toBe(true)
    expect(canVisitWorkspacePage('/partners', access, entitlement)).toBe(false)
    expect(canVisitWorkspacePage('/catalog', access, null)).toBe(false)
    expect(canVisitWorkspacePage('/catalog', null, entitlement)).toBe(false)
  })
  it('permits a scoped order reader without granting another module', () => {
    const scoped = { ...access, permissions: [], scopedPermissions: [{ permission: 'purchasing.order.read', departmentId: 'department' }] } as WireAccess
    expect(canVisitWorkspacePage('/purchase-orders', scoped, { modules: ['purchasing'] } as WireEntitlements)).toBe(true)
    expect(canVisitWorkspacePage('/finance', scoped, { modules: ['book'] } as WireEntitlements)).toBe(false)
  })
  it('keeps the workspace entry available without inventing unknown page grants', () => {
    expect(canVisitWorkspacePage('/', null, null)).toBe(true)
    expect(canVisitWorkspacePage('/unpublished', access, entitlement)).toBe(false)
  })
})

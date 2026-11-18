import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useOrganizationStore } from '../app/stores/organization'

describe('organization access request store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('seeds role scopes and one pending request', () => {
    const org = useOrganizationStore()
    const buyer = org.scopeOf('role-buyer')
    expect(buyer.departmentIds).toEqual(['dept-purchase'])
    expect(buyer.warehouseIds).toEqual(['wh-east'])
    expect(buyer.periodIds).toEqual(['period-2026-11'])
    expect(org.accessRequestRows.filter(item => item.status === 'pending')).toHaveLength(1)
  })

  it('rejects an empty scope, empty reason, unchanged scope and duplicate pending request', () => {
    const org = useOrganizationStore()
    const base = {
      workspaceId: 'ws-hq',
      roleId: 'role-buyer',
      requesterId: 'u-1001',
      requesterName: '张明远',
      reason: '华南备货'
    }
    expect(org.submitAccessRequest({ ...base, scope: { departmentIds: [], warehouseIds: [], periodIds: [] } }).message).toContain('至少选择一个')
    expect(org.submitAccessRequest({ ...base, reason: '   ', scope: { departmentIds: ['dept-purchase'], warehouseIds: ['wh-south'], periodIds: [] } }).message).toContain('申请原因')
    expect(org.submitAccessRequest({ ...base, scope: { departmentIds: ['dept-purchase'], warehouseIds: ['wh-east'], periodIds: ['period-2026-11'] } }).message).toContain('与当前授权一致')
    expect(org.submitAccessRequest({ ...base, scope: { departmentIds: ['dept-purchase'], warehouseIds: ['wh-south'], periodIds: ['period-2026-12'] } }).message).toContain('相同的授权申请')
  })

  it('only lets the owner approve and never lets a requester approve their own request', () => {
    const org = useOrganizationStore()
    const nonOwner = org.approveAccessRequest('REQ-2026-1201', 'u-1002', '李思远')
    expect(nonOwner.ok).toBe(false)
    expect(nonOwner.message).toContain('只有工作区所有者')

    const self = org.approveAccessRequest('REQ-2026-1201', 'u-1001', '张明远')
    expect(self.ok).toBe(false)
    expect(self.message).toContain('不能审批自己')

    const approved = org.approveAccessRequest('REQ-2026-1201', 'u-1004', '陈立')
    expect(approved.ok).toBe(true)
    expect(approved.request?.status).toBe('approved')
    const buyer = org.scopeOf('role-buyer')
    expect(buyer.warehouseIds).toContain('wh-south')
    expect(buyer.periodIds).toContain('period-2026-12')
  })

  it('requires a rejection note and records the decision', () => {
    const org = useOrganizationStore()
    const missing = org.rejectAccessRequest('REQ-2026-1201', 'u-1004', '陈立', '  ')
    expect(missing.ok).toBe(false)
    expect(missing.message).toContain('拒绝原因')

    const rejected = org.rejectAccessRequest('REQ-2026-1201', 'u-1004', '陈立', '请按部门拆分后重新申请')
    expect(rejected.ok).toBe(true)
    expect(rejected.request?.status).toBe('rejected')
    expect(rejected.request?.decisions[0]?.note).toContain('按部门拆分')
    expect(org.scopeOf('role-buyer').warehouseIds).toEqual(['wh-east'])
  })

  it('creates a new request and merges its scope after approval', () => {
    const org = useOrganizationStore()
    const submitted = org.submitAccessRequest({
      workspaceId: 'ws-hq',
      roleId: 'role-viewer',
      requesterId: 'u-1001',
      requesterName: '张明远',
      scope: {
        departmentIds: ['dept-root', 'dept-sales'],
        warehouseIds: ['wh-east', 'wh-south'],
        periodIds: ['period-2026-11', 'period-2026-12']
      },
      reason: '季度销售复盘需要查看华东与华南数据'
    })
    expect(submitted.ok).toBe(true)
    expect(submitted.request?.id).toBe('REQ-2026-1203')
    const approved = org.approveAccessRequest('REQ-2026-1203', 'u-1004', '陈立')
    expect(approved.ok).toBe(true)
    expect(org.scopeOf('role-viewer').departmentIds).toContain('dept-sales')
    expect(org.auditRows[0]?.action).toBe('批准授权申请')
  })
})

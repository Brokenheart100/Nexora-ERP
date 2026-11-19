import { describe, expect, it } from 'vitest'
import { roleGrantApprovalName, roleGrantScopeName, roleScopeNames } from '../app/utils/organization/workspaceGovernance'

const grant = {
  scope: 'company', scopeId: null, startsOn: null, endsOn: null,
}

describe('roleGrantScopeName', () => {
  it('names company, department and warehouse scopes', () => {
    expect(roleGrantScopeName(grant)).toBe('整个公司')
    expect(roleGrantScopeName({ ...grant, scope: 'department', scopeId: 'd-1' }, '华东部门')).toBe('华东部门')
    expect(roleGrantScopeName({ ...grant, scope: 'warehouse', scopeId: 'w-1' }, undefined, '华东仓')).toBe('华东仓')
    expect(roleGrantScopeName({ ...grant, scope: 'department', scopeId: 'missing' })).toBe('missing')
  })

  it('renders an inclusive financial period range', () => {
    expect(roleGrantScopeName({
      scope: 'period', scopeId: null, startsOn: '2026-01-01', endsOn: '2026-03-31',
    })).toBe('2026-01-01 至 2026-03-31')
    expect(roleGrantScopeName({ scope: 'period', scopeId: null, startsOn: null, endsOn: null }))
      .toBe(roleScopeNames.period)
  })
})

describe('roleGrantApprovalName', () => {
  it('shows dual-owner approval progress', () => {
    expect(roleGrantApprovalName({ state: 'Pending', approvalCount: 0, requiredApprovals: 1 })).toBe('待审批')
    expect(roleGrantApprovalName({ state: 'Pending', approvalCount: 1, requiredApprovals: 2 })).toBe('待审批（1/2）')
    expect(roleGrantApprovalName({ state: 'Active', approvalCount: 2, requiredApprovals: 2 })).toBe('已授权')
    expect(roleGrantApprovalName({ state: 'Expired', approvalCount: 1, requiredApprovals: 2 })).toBe('已过期')
  })
})

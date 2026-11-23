import type { OrganizationRole } from '#shared/types/workspace-administration'

export const organizationRoles = ['WorkspaceOwner', 'AccessAdministrator', 'WorkspaceReader']

export const executionAreas = [{
  id: 'purchase-role', code: 'purchasing', label: '采购', permission: 'purchase-roles.manage',
  roles: ['PurchasingOperator', 'PurchasingApprover'], current: 'purchaseRole', proposed: 'proposedPurchaseRole'
}, {
  id: 'sales-role', code: 'sales', label: '销售', permission: 'sales-roles.manage',
  roles: ['SalesOperator', 'SalesApprover'], current: 'salesRole', proposed: 'proposedSalesRole'
}, {
  id: 'finance-role', code: 'finance', label: '财务', permission: 'finance-roles.manage',
  roles: ['Accountant', 'FinanceReviewer'], current: 'financeRole', proposed: 'proposedFinanceRole'
}] as const

const roleNames: Record<string, string> = {
  WorkspaceOwner: '工作区所有者', AccessAdministrator: '访问管理员', WorkspaceReader: '工作区成员',
  PurchasingOperator: '采购经办', PurchasingApprover: '采购审批', SalesOperator: '销售经办', SalesApprover: '销售审批',
  Accountant: '会计经办', FinanceReviewer: '财务复核'
}

export const roleName = (role?: string | null) => role ? roleNames[role] ?? role : '无'
export const roleChoices = (roles: readonly string[]) => roles.map(value => ({ label: roleName(value), value }))
export const inviteStateLabel = (state: string) => ({
  Pending: '待接受', PendingApproval: '待独立批准', Accepted: '已接受', Revoked: '已撤销', Expired: '已过期'
}[state] ?? state)

export function organizationRoleChoices(roles: OrganizationRole[] | null, canAssignOwner = true) {
  const codes = roles?.filter(role => !role.area).map(role => role.code) ?? organizationRoles
  return roleChoices(codes.filter(code => canAssignOwner || code !== 'WorkspaceOwner'))
}

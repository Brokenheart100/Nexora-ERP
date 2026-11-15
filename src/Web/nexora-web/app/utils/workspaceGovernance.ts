export interface WorkspaceAccess {
  workspaceId: string
  memberId: string
  authorizationVersion: number
  permissions: string[]
  role: string
  scopedPermissions?: {
    permission: string
    departmentId: string | null
    warehouseId: string | null
    startsOn?: string | null
    endsOn?: string | null
  }[]
}

export interface Department { id: string; name: string }
export interface CustomRole { id: string; name: string; revision: number; permissions: string[] }
export interface PermissionOption { code: string; scopes: string[] }
export interface CustomRoleCatalog { roles: CustomRole[]; permissions: PermissionOption[] }
export interface RoleGrant {
  id: string; memberId: string; roleId: string; roleRevision: number; scope: string; scopeId: string | null
  startsOn: string | null; endsOn: string | null
  requiredApprovals: number; approvalCount: number; firstApprovedBy: string | null
  permissions: string[]; state: string; requestedBy: string; approvedBy: string | null
}

export const roleScopeNames: Record<string, string> = {
  company: '整个公司', department: '指定部门', warehouse: '指定仓库', period: '指定财务期间',
}

export function roleGrantScopeName(grant: {
  scope: string
  scopeId: string | null
  startsOn: string | null
  endsOn: string | null
}, departmentName?: string, warehouseName?: string) {
  if (grant.scope === 'company') return roleScopeNames.company
  if (grant.scope === 'period') {
    if (!grant.startsOn || !grant.endsOn) return roleScopeNames.period
    return `${grant.startsOn} 至 ${grant.endsOn}`
  }
  return (grant.scope === 'department' ? departmentName : warehouseName) ?? grant.scopeId ?? ''
}

export function roleGrantApprovalName(grant: { state: string; approvalCount: number; requiredApprovals: number }) {
  if (grant.state === 'Active') return '已授权'
  if (grant.state === 'Expired') return '已过期'
  if (grant.requiredApprovals > 1) return `待审批（${grant.approvalCount}/${grant.requiredApprovals}）`
  return '待审批'
}

export function loadCustomRoles(workspaceId: string) {
  return $fetch<CustomRoleCatalog>(`/bff/api/workspaces/${workspaceId}/custom-roles`, { retry: 0 })
}

export function loadDepartments(workspaceId: string) {
  return $fetch<Department[]>(`/bff/api/workspaces/${workspaceId}/departments`, { retry: 0 })
}

export async function writeGovernance<T>(workspaceId: string, path: string, expectedVersion: number, body: object) {
  const csrf = await $fetch<{ requestToken: string }>('/bff/antiforgery', { retry: 0 })
  return $fetch<T>(`/bff/api/workspaces/${workspaceId}${path}`, {
    method: 'POST', body: { ...body, expectedVersion }, headers: { 'X-CSRF-TOKEN': csrf.requestToken }, retry: 0,
  })
}

export interface WorkspaceMember {
  id: string
  subject: string
  email: string | null
  role: string
  isActive: boolean
  financeRole: string | null
  purchaseRole: string | null
  salesRole: string | null
  proposedFinanceRole: string | null
  proposedPurchaseRole: string | null
  proposedSalesRole: string | null
  proposedBusinessRoles: string[] | null
  businessRoleProposerId: string | null
  businessRoleProposalVersion: number | null
  businessRoleProposalExpiresAtUtc: string | null
}

export interface WorkspaceInvitation {
  id: string
  email: string
  role: string
  state: string
  expiresAtUtc: string
  businessRoles: string[] | null
  inviterMemberId: string | null
}

export interface WorkspaceRole {
  code: string
  area: string | null
  permissions: string[]
}

export const workspaceRoleNames: Record<string, string> = {
  WorkspaceOwner: '工作区所有者',
  AccessAdministrator: '访问管理员',
  WorkspaceReader: '工作区只读成员',
  Accountant: '财务制单',
  FinanceReviewer: '财务复核与期间管理',
  PurchasingOperator: '采购制单',
  PurchasingApprover: '采购审批',
  SalesOperator: '销售制单',
  SalesApprover: '销售审批与履约',
}

export const executionAreaNames: Record<string, string> = {
  Finance: '财务', Purchasing: '采购', Sales: '销售',
}

export function workspaceRoleName(code: string) {
  return workspaceRoleNames[code] ?? code
}

export function businessRoleNames(roles: string[] | null) {
  return roles?.length ? roles.map(workspaceRoleName).join('、') : '无业务角色'
}

export function memberBusinessRoles(member: WorkspaceMember) {
  return [member.financeRole, member.purchaseRole, member.salesRole].filter((role): role is string => !!role)
}

export function loadWorkspaceRoleCatalog(workspaceId: string) {
  return $fetch<WorkspaceRole[]>(`/bff/api/workspaces/${workspaceId}/roles`, { retry: 0 })
}

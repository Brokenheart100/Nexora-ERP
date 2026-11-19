import type { BadgeColor, Permission } from './types'

export type GovernanceWorkspaceKind = 'company' | 'personal'
export type GovernanceMemberStatus = 'active' | 'invited' | 'disabled'
export type InvitationState = 'valid' | 'pending_approval' | 'revoked' | 'redeemed' | 'expired' | 'mismatch'
export type OrgRoleKey = 'owner' | 'admin' | 'purchaser' | 'sales' | 'finance' | 'viewer' | 'member'
export type BusinessRoleLevel = 'view' | 'operate' | 'approve'
export type BusinessScope = 'all' | 'department'
export type ServiceKey = 'purchase' | 'sales' | 'finance'
export type ServiceActionKey = 'view' | 'operate' | 'approve'
export type CustomRoleStatus = 'pending' | 'active' | 'expired' | 'revoked'
export type AnnouncementLevel = 'info' | 'warning' | 'critical'

/** 演示时钟：原型内所有到期判断都以该日期为“今天”，保证刷新后结果稳定。 */
export const DEMO_TODAY = '2026-11-19'

export interface GovernanceWorkspace {
  id: string
  name: string
  kind: GovernanceWorkspaceKind
  planLabel: string
  ownerName: string
  createdAt: string
  initialized: boolean
  linkedCompanyId: string | null
  linkedAt: string | null
  brandColor: string
}

export interface GovernanceIdentity {
  id: string
  name: string
  title: string
  email: string
  avatarIcon: string
  workspaceIds: string[]
  permissions: Permission[]
}

export interface GovernanceCompanySettings {
  workspaceId: string
  companyName: string
  brandName: string
  brandColor: string
  registrationNo: string
  invoiceTitle: string
  dateFormat: 'YYYY-MM-DD' | 'YYYY/MM/DD' | 'DD/MM/YYYY'
  timezone: string
  idleTimeoutMinutes: number
  approverCount: 1 | 2
}

export interface GovernanceBusinessRole {
  service: ServiceKey
  level: BusinessRoleLevel
  scope: BusinessScope
  departmentName: string | null
}

export interface GovernanceInvitation {
  id: string
  workspaceId: string
  inviteeName: string
  email: string
  invitedBy: string
  roleType: 'organization' | 'business'
  orgRoleLabel: string
  businessRoles: GovernanceBusinessRole[]
  departments: string[]
  status: InvitationState
  sentAt: string
  expiresAt: string
  note: string
  requiredApprover: string | null
  approvedBy: string | null
  approvedAt: string | null
  revokedReason: string | null
  revokedAt: string | null
  redeemedBy: string | null
  redeemedAt: string | null
  mismatchAccount: string | null
  link: string
}

export interface GovernanceMember {
  id: string
  workspaceId: string
  name: string
  email: string
  phone: string
  departmentName: string
  orgRole: OrgRoleKey
  status: GovernanceMemberStatus
  businessRoles: GovernanceBusinessRole[]
  joinedAt: string
  lastActiveAt: string
  note: string
}

export interface CustomRoleServiceGrant {
  service: ServiceKey
  actions: ServiceActionKey[]
  departments: string[]
}

export interface CustomRoleVersion {
  version: number
  changedAt: string
  changedBy: string
  summary: string
}

export interface CustomRoleApproval {
  identityId: string
  name: string
  approvedAt: string
}

export interface CustomRole {
  id: string
  workspaceId: string
  name: string
  description: string
  status: CustomRoleStatus
  currentVersion: number
  versions: CustomRoleVersion[]
  approvalMode: 1 | 2
  approvals: CustomRoleApproval[]
  requestedBy: string
  requestedAt: string
  validFrom: string
  validTo: string
  revokedReason: string | null
  services: CustomRoleServiceGrant[]
}

export interface GovernanceAnnouncement {
  id: string
  workspaceId: string
  title: string
  body: string
  level: AnnouncementLevel
  permission: Permission
  publishedAt: string
  expiresAt: string
  authorName: string
}

export interface DocumentTypeOption {
  id: string
  label: string
  service: ServiceKey
  actions: ServiceActionKey[]
}

export interface SampleDocument {
  id: string
  code: string
  typeId: string
  typeLabel: string
  service: ServiceKey
  departmentName: string
  amount: number
}

export interface GovernanceSeed {
  workspaces: GovernanceWorkspace[]
  identities: GovernanceIdentity[]
  companySettings: GovernanceCompanySettings[]
  invitations: GovernanceInvitation[]
  members: GovernanceMember[]
  customRoles: CustomRole[]
  announcements: GovernanceAnnouncement[]
}

export const serviceKeys: ServiceKey[] = ['purchase', 'sales', 'finance']
export const serviceLabels: Record<ServiceKey, string> = {
  purchase: '采购',
  sales: '销售',
  finance: '财务'
}
export const serviceActionKeys: ServiceActionKey[] = ['view', 'operate', 'approve']
export const serviceActionLabels: Record<ServiceActionKey, string> = {
  view: '查看',
  operate: '经办',
  approve: '审批'
}
export const orgRoleLabels: Record<OrgRoleKey, string> = {
  owner: '所有者',
  admin: '管理员',
  purchaser: '采购员',
  sales: '销售员',
  finance: '财务专员',
  viewer: '只读成员',
  member: '普通成员'
}
export const memberStatusLabels: Record<GovernanceMemberStatus, string> = {
  active: '在职',
  invited: '待接受邀请',
  disabled: '已停用'
}
export const memberStatusColors: Record<GovernanceMemberStatus, BadgeColor> = {
  active: 'success',
  invited: 'warning',
  disabled: 'neutral'
}
export const invitationStateLabels: Record<InvitationState, string> = {
  valid: '有效',
  pending_approval: '待批准',
  revoked: '已撤回',
  redeemed: '已兑换',
  expired: '已过期',
  mismatch: '账户不匹配'
}
export const invitationStateColors: Record<InvitationState, BadgeColor> = {
  valid: 'success',
  pending_approval: 'warning',
  revoked: 'neutral',
  redeemed: 'info',
  expired: 'neutral',
  mismatch: 'error'
}
export const invitationStateOptions: { label: string, value: InvitationState, hint: string }[] = [
  { label: '有效', value: 'valid', hint: '受邀者可立即接受并加入工作区' },
  { label: '待批准', value: 'pending_approval', hint: '业务角色邀请需要另一位管理员独立批准' },
  { label: '已撤回', value: 'revoked', hint: '邀请人已撤回，链接不可再使用' },
  { label: '已兑换', value: 'redeemed', hint: '邀请已被接受，账户已加入工作区' },
  { label: '已过期', value: 'expired', hint: '超过有效期，需要重新发送邀请' },
  { label: '账户不匹配', value: 'mismatch', hint: '打开链接的账户与受邀邮箱不一致' }
]
export const customRoleStatusLabels: Record<CustomRoleStatus, string> = {
  pending: '待审批',
  active: '已生效',
  expired: '已到期',
  revoked: '已撤销'
}
export const customRoleStatusColors: Record<CustomRoleStatus, BadgeColor> = {
  pending: 'warning',
  active: 'success',
  expired: 'neutral',
  revoked: 'error'
}
export const businessRoleLevelLabels: Record<BusinessRoleLevel, string> = {
  view: '只读',
  operate: '经办',
  approve: '审批'
}
export const businessScopeLabels: Record<BusinessScope, string> = {
  all: '全部部门',
  department: '仅本部门'
}
export const announcementLevelLabels: Record<AnnouncementLevel, string> = {
  info: '通知',
  warning: '重要',
  critical: '紧急'
}
export const announcementLevelColors: Record<AnnouncementLevel, BadgeColor> = {
  info: 'info',
  warning: 'warning',
  critical: 'error'
}
export const departmentOptions: string[] = ['采购部', '销售部', '财务部', '仓储部', '总经办']
export const brandColorOptions: { label: string, value: string }[] = [
  { label: '碳黑绿（默认）', value: '#0f766e' },
  { label: '商务蓝', value: '#2563eb' },
  { label: '紫罗兰', value: '#7c3aed' },
  { label: '石墨灰', value: '#334155' }
]
export const dateFormatOptions: { label: string, value: GovernanceCompanySettings['dateFormat'] }[] = [
  { label: '2026-11-19（年-月-日）', value: 'YYYY-MM-DD' },
  { label: '2026/11/19（斜杠）', value: 'YYYY/MM/DD' },
  { label: '19/11/2026（日/月/年）', value: 'DD/MM/YYYY' }
]
export const timezoneOptions: string[] = ['Asia/Shanghai', 'Asia/Hong_Kong', 'Asia/Tokyo', 'UTC']
export const idleTimeoutOptions: { label: string, value: number }[] = [
  { label: '15 分钟', value: 15 },
  { label: '30 分钟（推荐）', value: 30 },
  { label: '60 分钟', value: 60 },
  { label: '120 分钟', value: 120 }
]
export const documentTypeOptions: DocumentTypeOption[] = [
  { id: 'purchase-order', label: '采购订单', service: 'purchase', actions: ['view', 'operate', 'approve'] },
  { id: 'sales-order', label: '销售订单', service: 'sales', actions: ['view', 'operate', 'approve'] },
  { id: 'payment-voucher', label: '付款单', service: 'finance', actions: ['view', 'operate', 'approve'] }
]
export const sampleDocuments: SampleDocument[] = [
  { id: 'doc-6001', code: 'PO-2026-1118', typeId: 'purchase-order', typeLabel: '采购订单', service: 'purchase', departmentName: '采购部', amount: 128600 },
  { id: 'doc-6002', code: 'SO-2026-1117', typeId: 'sales-order', typeLabel: '销售订单', service: 'sales', departmentName: '销售部', amount: 89600.5 },
  { id: 'doc-6003', code: 'PAY-2026-1116', typeId: 'payment-voucher', typeLabel: '付款单', service: 'finance', departmentName: '财务部', amount: 45200 }
]

const allPermissions: Permission[] = [
  'dashboard.view',
  'catalog.view',
  'catalog.edit',
  'purchase.view',
  'purchase.create',
  'purchase.approve',
  'sales.view',
  'sales.create',
  'inventory.view',
  'inventory.adjust',
  'finance.view',
  'finance.post',
  'settings.view',
  'settings.manage'
]

const seed: GovernanceSeed = {
  workspaces: [
    {
      id: 'ws-hq',
      name: '华东总部贸易有限公司',
      kind: 'company',
      planLabel: '专业版',
      ownerName: '陈立',
      createdAt: '2026-01-12',
      initialized: true,
      linkedCompanyId: null,
      linkedAt: null,
      brandColor: '#0f766e'
    },
    {
      id: 'ws-south',
      name: '华南采购中心（深圳）',
      kind: 'company',
      planLabel: '标准版',
      ownerName: '李思远',
      createdAt: '2026-03-08',
      initialized: true,
      linkedCompanyId: null,
      linkedAt: null,
      brandColor: '#2563eb'
    },
    {
      id: 'ws-retail',
      name: '社区零售事业部（杭州试运营）',
      kind: 'company',
      planLabel: '标准版',
      ownerName: '周宁',
      createdAt: '2026-10-21',
      initialized: false,
      linkedCompanyId: null,
      linkedAt: null,
      brandColor: '#7c3aed'
    },
    {
      id: 'ws-personal',
      name: '张明远的个人账本',
      kind: 'personal',
      planLabel: '个人账本',
      ownerName: '张明远',
      createdAt: '2026-02-02',
      initialized: true,
      linkedCompanyId: 'ws-hq',
      linkedAt: '2026-11-02',
      brandColor: '#334155'
    }
  ],
  identities: [
    {
      id: 'gov-id-zhang',
      name: '张明远',
      title: '采购经理',
      email: 'zhangmingyuan@nexora.example',
      avatarIcon: 'i-carbon-user',
      workspaceIds: ['ws-hq', 'ws-personal'],
      permissions: ['dashboard.view', 'catalog.view', 'purchase.view', 'purchase.create', 'sales.view', 'inventory.view', 'finance.view', 'settings.view']
    },
    {
      id: 'gov-id-chen',
      name: '陈立',
      title: '工作区所有者',
      email: 'chenli@nexora.example',
      avatarIcon: 'i-carbon-user-admin',
      workspaceIds: ['ws-hq', 'ws-south', 'ws-retail'],
      permissions: allPermissions
    },
    {
      id: 'gov-id-li',
      name: '李思远',
      title: '工作区管理员',
      email: 'lisiyuan@nexora.example',
      avatarIcon: 'i-carbon-user-admin',
      workspaceIds: ['ws-hq', 'ws-south'],
      permissions: ['dashboard.view', 'catalog.view', 'purchase.view', 'purchase.create', 'purchase.approve', 'sales.view', 'sales.create', 'inventory.view', 'settings.view', 'settings.manage']
    },
    {
      id: 'gov-id-wang',
      name: '王芳',
      title: '财务主管',
      email: 'wangfang@nexora.example',
      avatarIcon: 'i-carbon-user',
      workspaceIds: ['ws-hq', 'ws-south'],
      permissions: ['dashboard.view', 'catalog.view', 'purchase.view', 'finance.view', 'finance.post', 'inventory.view', 'settings.view']
    }
  ],
  companySettings: [
    {
      workspaceId: 'ws-hq',
      companyName: '华东总部贸易有限公司',
      brandName: '华东总部',
      brandColor: '#0f766e',
      registrationNo: '91310000MA1FL8XK2P',
      invoiceTitle: '华东总部贸易有限公司',
      dateFormat: 'YYYY-MM-DD',
      timezone: 'Asia/Shanghai',
      idleTimeoutMinutes: 30,
      approverCount: 2
    },
    {
      workspaceId: 'ws-south',
      companyName: '华南采购中心（深圳）有限公司',
      brandName: '华南采购',
      brandColor: '#2563eb',
      registrationNo: '91440300MA5G7YQ23R',
      invoiceTitle: '华南采购中心（深圳）有限公司',
      dateFormat: 'YYYY-MM-DD',
      timezone: 'Asia/Shanghai',
      idleTimeoutMinutes: 60,
      approverCount: 1
    },
    {
      workspaceId: 'ws-retail',
      companyName: '社区零售事业部（杭州）有限公司',
      brandName: '社区零售',
      brandColor: '#7c3aed',
      registrationNo: '91330100MA2K9T6L4C',
      invoiceTitle: '社区零售事业部（杭州）',
      dateFormat: 'YYYY/MM/DD',
      timezone: 'Asia/Shanghai',
      idleTimeoutMinutes: 15,
      approverCount: 2
    }
  ],
  invitations: [
    {
      id: 'gov-inv-2001',
      workspaceId: 'ws-hq',
      inviteeName: '赵倩',
      email: 'zhaoqian@nexora.example',
      invitedBy: '李思远',
      roleType: 'organization',
      orgRoleLabel: '采购员',
      businessRoles: [],
      departments: ['采购部'],
      status: 'valid',
      sentAt: '2026-11-12',
      expiresAt: '2026-11-26',
      note: '组织角色邀请，接受后直接进入采购部。',
      requiredApprover: null,
      approvedBy: null,
      approvedAt: null,
      revokedReason: null,
      revokedAt: null,
      redeemedBy: null,
      redeemedAt: null,
      mismatchAccount: null,
      link: 'https://app.nexora.example/join#invite=gov-inv-2001'
    },
    {
      id: 'gov-inv-2002',
      workspaceId: 'ws-hq',
      inviteeName: '孙浩',
      email: 'sunhao@nexora.example',
      invitedBy: '李思远',
      roleType: 'business',
      orgRoleLabel: '普通成员',
      businessRoles: [
        { service: 'finance', level: 'approve', scope: 'department', departmentName: '财务部' },
        { service: 'purchase', level: 'view', scope: 'all', departmentName: null }
      ],
      departments: ['财务部', '采购部'],
      status: 'pending_approval',
      sentAt: '2026-11-17',
      expiresAt: '2026-12-01',
      note: '财务审批属于敏感业务角色，需要所有者陈立独立批准后才能发出。',
      requiredApprover: '陈立',
      approvedBy: null,
      approvedAt: null,
      revokedReason: null,
      revokedAt: null,
      redeemedBy: null,
      redeemedAt: null,
      mismatchAccount: null,
      link: 'https://app.nexora.example/join#invite=gov-inv-2002'
    },
    {
      id: 'gov-inv-2003',
      workspaceId: 'ws-hq',
      inviteeName: '何川',
      email: 'hechuan@nexora.example',
      invitedBy: '张明远',
      roleType: 'organization',
      orgRoleLabel: '只读成员',
      businessRoles: [],
      departments: ['仓储部'],
      status: 'revoked',
      sentAt: '2026-11-05',
      expiresAt: '2026-11-19',
      note: '邀请已由邀请人撤回，链接立即失效。',
      requiredApprover: null,
      approvedBy: null,
      approvedAt: null,
      revokedReason: '受邀人已通过内部调动入职，撤回外部邀请。',
      revokedAt: '2026-11-08',
      redeemedBy: null,
      redeemedAt: null,
      mismatchAccount: null,
      link: 'https://app.nexora.example/join#invite=gov-inv-2003'
    },
    {
      id: 'gov-inv-2004',
      workspaceId: 'ws-hq',
      inviteeName: '吴敏',
      email: 'wumin@nexora.example',
      invitedBy: '陈立',
      roleType: 'organization',
      orgRoleLabel: '管理员',
      businessRoles: [],
      departments: ['总经办'],
      status: 'redeemed',
      sentAt: '2026-10-26',
      expiresAt: '2026-11-09',
      note: '邀请已兑换，吴敏已加入财务部并拥有管理员组织角色。',
      requiredApprover: null,
      approvedBy: null,
      approvedAt: null,
      revokedReason: null,
      revokedAt: null,
      redeemedBy: '吴敏',
      redeemedAt: '2026-11-06',
      mismatchAccount: null,
      link: 'https://app.nexora.example/join#invite=gov-inv-2004'
    },
    {
      id: 'gov-inv-2005',
      workspaceId: 'ws-hq',
      inviteeName: '郑珂',
      email: 'zhengke@nexora.example',
      invitedBy: '张明远',
      roleType: 'organization',
      orgRoleLabel: '只读成员',
      businessRoles: [],
      departments: ['销售部'],
      status: 'expired',
      sentAt: '2026-10-01',
      expiresAt: '2026-10-15',
      note: '超过 14 天有效期后自动过期，需要重新发送。',
      requiredApprover: null,
      approvedBy: null,
      approvedAt: null,
      revokedReason: null,
      revokedAt: null,
      redeemedBy: null,
      redeemedAt: null,
      mismatchAccount: null,
      link: 'https://app.nexora.example/join#invite=gov-inv-2005'
    },
    {
      id: 'gov-inv-2006',
      workspaceId: 'ws-hq',
      inviteeName: '黄蕾',
      email: 'huanglei@nexora.example',
      invitedBy: '李思远',
      roleType: 'business',
      orgRoleLabel: '普通成员',
      businessRoles: [
        { service: 'sales', level: 'operate', scope: 'department', departmentName: '销售部' }
      ],
      departments: ['销售部'],
      status: 'mismatch',
      sentAt: '2026-11-11',
      expiresAt: '2026-11-25',
      note: '受邀者曾用个人账户 huanglei.personal@example.com 打开链接，与受邀邮箱不一致。',
      requiredApprover: null,
      approvedBy: '陈立',
      approvedAt: '2026-11-13',
      revokedReason: null,
      revokedAt: null,
      redeemedBy: null,
      redeemedAt: null,
      mismatchAccount: 'huanglei.personal@example.com',
      link: 'https://app.nexora.example/join#invite=gov-inv-2006'
    },
    {
      id: 'gov-inv-2007',
      workspaceId: 'ws-south',
      inviteeName: '郑珂',
      email: 'zhengke@nexora.example',
      invitedBy: '李思远',
      roleType: 'organization',
      orgRoleLabel: '采购员',
      businessRoles: [],
      departments: ['采购部'],
      status: 'valid',
      sentAt: '2026-11-15',
      expiresAt: '2026-11-29',
      note: '华南采购中心的组织角色邀请。',
      requiredApprover: null,
      approvedBy: null,
      approvedAt: null,
      revokedReason: null,
      revokedAt: null,
      redeemedBy: null,
      redeemedAt: null,
      mismatchAccount: null,
      link: 'https://app.nexora.example/join#invite=gov-inv-2007'
    },
    {
      id: 'gov-inv-2008',
      workspaceId: 'ws-retail',
      inviteeName: '林晓',
      email: 'linxiao@nexora.example',
      invitedBy: '周宁',
      roleType: 'business',
      orgRoleLabel: '普通成员',
      businessRoles: [
        { service: 'purchase', level: 'operate', scope: 'department', departmentName: '采购部' },
        { service: 'sales', level: 'view', scope: 'all', departmentName: null }
      ],
      departments: ['采购部', '销售部'],
      status: 'pending_approval',
      sentAt: '2026-11-18',
      expiresAt: '2026-12-02',
      note: '零售试运营工作区，业务角色邀请等待所有者陈立批准。',
      requiredApprover: '陈立',
      approvedBy: null,
      approvedAt: null,
      revokedReason: null,
      revokedAt: null,
      redeemedBy: null,
      redeemedAt: null,
      mismatchAccount: null,
      link: 'https://app.nexora.example/join#invite=gov-inv-2008'
    }
  ],
  members: [
    {
      id: 'gov-m-3001',
      workspaceId: 'ws-hq',
      name: '陈立',
      email: 'chenli@nexora.example',
      phone: '138-0000-1004',
      departmentName: '财务部',
      orgRole: 'owner',
      status: 'active',
      businessRoles: [
        { service: 'finance', level: 'approve', scope: 'all', departmentName: null }
      ],
      joinedAt: '2026-01-12',
      lastActiveAt: '2026-11-19',
      note: '工作区唯一所有者，也是当前唯一拥有管理权限的成员。'
    },
    {
      id: 'gov-m-3002',
      workspaceId: 'ws-hq',
      name: '张明远',
      email: 'zhangmingyuan@nexora.example',
      phone: '138-0000-1001',
      departmentName: '采购部',
      orgRole: 'purchaser',
      status: 'active',
      businessRoles: [
        { service: 'purchase', level: 'operate', scope: 'department', departmentName: '采购部' },
        { service: 'sales', level: 'view', scope: 'all', departmentName: null }
      ],
      joinedAt: '2026-03-02',
      lastActiveAt: '2026-11-19',
      note: '采购经办人，无成员管理权限。'
    },
    {
      id: 'gov-m-3003',
      workspaceId: 'ws-hq',
      name: '李思远',
      email: 'lisiyuan@nexora.example',
      phone: '138-0000-1002',
      departmentName: '销售部',
      orgRole: 'sales',
      status: 'active',
      businessRoles: [
        { service: 'sales', level: 'operate', scope: 'department', departmentName: '销售部' }
      ],
      joinedAt: '2026-04-18',
      lastActiveAt: '2026-11-18',
      note: '销售经办人。'
    },
    {
      id: 'gov-m-3004',
      workspaceId: 'ws-hq',
      name: '周宁',
      email: 'zhouning@nexora.example',
      phone: '138-0000-1003',
      departmentName: '仓储部',
      orgRole: 'viewer',
      status: 'active',
      businessRoles: [],
      joinedAt: '2026-05-09',
      lastActiveAt: '2026-11-17',
      note: '只读成员，未配置业务角色。'
    },
    {
      id: 'gov-m-3005',
      workspaceId: 'ws-hq',
      name: '王芳',
      email: 'wangfang@nexora.example',
      phone: '138-0000-1005',
      departmentName: '财务部',
      orgRole: 'finance',
      status: 'active',
      businessRoles: [
        { service: 'finance', level: 'approve', scope: 'department', departmentName: '财务部' },
        { service: 'purchase', level: 'view', scope: 'all', departmentName: null }
      ],
      joinedAt: '2026-02-14',
      lastActiveAt: '2026-11-19',
      note: '财务审批人，可参与两人授权审批。'
    },
    {
      id: 'gov-m-3006',
      workspaceId: 'ws-hq',
      name: '赵倩',
      email: 'zhaoqian@nexora.example',
      phone: '138-0000-1006',
      departmentName: '采购部',
      orgRole: 'purchaser',
      status: 'invited',
      businessRoles: [
        { service: 'purchase', level: 'view', scope: 'department', departmentName: '采购部' }
      ],
      joinedAt: '2026-11-12',
      lastActiveAt: '2026-11-12',
      note: '已发送邀请，尚未接受。'
    },
    {
      id: 'gov-m-3007',
      workspaceId: 'ws-hq',
      name: '孙浩',
      email: 'sunhao@nexora.example',
      phone: '138-0000-1007',
      departmentName: '销售部',
      orgRole: 'sales',
      status: 'disabled',
      businessRoles: [
        { service: 'sales', level: 'operate', scope: 'department', departmentName: '销售部' }
      ],
      joinedAt: '2025-12-01',
      lastActiveAt: '2026-10-28',
      note: '已停用，业务角色不再参与单据校验。'
    },
    {
      id: 'gov-m-3008',
      workspaceId: 'ws-south',
      name: '李思远',
      email: 'lisiyuan@nexora.example',
      phone: '138-0000-1002',
      departmentName: '总经办',
      orgRole: 'admin',
      status: 'active',
      businessRoles: [
        { service: 'sales', level: 'approve', scope: 'all', departmentName: null },
        { service: 'finance', level: 'view', scope: 'all', departmentName: null }
      ],
      joinedAt: '2026-03-08',
      lastActiveAt: '2026-11-19',
      note: '华南采购中心管理员。'
    },
    {
      id: 'gov-m-3009',
      workspaceId: 'ws-south',
      name: '吴敏',
      email: 'wumin@nexora.example',
      phone: '138-0000-1008',
      departmentName: '财务部',
      orgRole: 'admin',
      status: 'active',
      businessRoles: [
        { service: 'purchase', level: 'approve', scope: 'all', departmentName: null },
        { service: 'finance', level: 'approve', scope: 'department', departmentName: '财务部' }
      ],
      joinedAt: '2026-08-16',
      lastActiveAt: '2026-11-18',
      note: '华南采购中心财务管理员。'
    },
    {
      id: 'gov-m-3010',
      workspaceId: 'ws-south',
      name: '郑珂',
      email: 'zhengke@nexora.example',
      phone: '138-0000-1009',
      departmentName: '采购部',
      orgRole: 'purchaser',
      status: 'active',
      businessRoles: [
        { service: 'purchase', level: 'operate', scope: 'department', departmentName: '采购部' }
      ],
      joinedAt: '2026-09-02',
      lastActiveAt: '2026-11-16',
      note: '华南采购部经办人。'
    },
    {
      id: 'gov-m-3011',
      workspaceId: 'ws-south',
      name: '黄蕾',
      email: 'huanglei@nexora.example',
      phone: '138-0000-1010',
      departmentName: '销售部',
      orgRole: 'sales',
      status: 'active',
      businessRoles: [
        { service: 'sales', level: 'operate', scope: 'department', departmentName: '销售部' }
      ],
      joinedAt: '2026-09-12',
      lastActiveAt: '2026-11-15',
      note: '销售经办人。'
    },
    {
      id: 'gov-m-3012',
      workspaceId: 'ws-retail',
      name: '周宁',
      email: 'zhouning@nexora.example',
      phone: '138-0000-1003',
      departmentName: '总经办',
      orgRole: 'admin',
      status: 'active',
      businessRoles: [
        { service: 'purchase', level: 'view', scope: 'all', departmentName: null }
      ],
      joinedAt: '2026-10-21',
      lastActiveAt: '2026-11-19',
      note: '社区零售事业部管理员，初始化尚未完成。'
    },
    {
      id: 'gov-m-3013',
      workspaceId: 'ws-retail',
      name: '陈立',
      email: 'chenli@nexora.example',
      phone: '138-0000-1004',
      departmentName: '财务部',
      orgRole: 'owner',
      status: 'active',
      businessRoles: [
        { service: 'finance', level: 'approve', scope: 'all', departmentName: null }
      ],
      joinedAt: '2026-10-21',
      lastActiveAt: '2026-11-18',
      note: '社区零售事业部所有者，负责业务角色邀请审批。'
    },
    {
      id: 'gov-m-3014',
      workspaceId: 'ws-retail',
      name: '林晓',
      email: 'linxiao@nexora.example',
      phone: '138-0000-1011',
      departmentName: '销售部',
      orgRole: 'sales',
      status: 'active',
      businessRoles: [
        { service: 'sales', level: 'operate', scope: 'department', departmentName: '销售部' }
      ],
      joinedAt: '2026-10-28',
      lastActiveAt: '2026-11-17',
      note: '门店销售经办人。'
    },
    {
      id: 'gov-m-3015',
      workspaceId: 'ws-personal',
      name: '张明远',
      email: 'zhangmingyuan@nexora.example',
      phone: '138-0000-1001',
      departmentName: '个人账本',
      orgRole: 'owner',
      status: 'active',
      businessRoles: [
        { service: 'finance', level: 'view', scope: 'all', departmentName: null }
      ],
      joinedAt: '2026-02-02',
      lastActiveAt: '2026-11-19',
      note: '个人账本所有者。'
    }
  ],
  customRoles: [
    {
      id: 'gov-cr-4001',
      workspaceId: 'ws-hq',
      name: '采购审批专员',
      description: '采购订单经办与审批，可查看财务部相关采购单据。',
      status: 'active',
      currentVersion: 2,
      versions: [
        { version: 1, changedAt: '2026-10-25', changedBy: '张明远', summary: '初始版本：开放采购查看与经办，范围仅采购部。' },
        { version: 2, changedAt: '2026-11-02', changedBy: '张明远', summary: '新增采购审批动作，部门范围增加财务部，审批人由 1 人调整为 2 人。' }
      ],
      approvalMode: 2,
      approvals: [
        { identityId: 'gov-id-li', name: '李思远', approvedAt: '2026-11-02' },
        { identityId: 'gov-id-wang', name: '王芳', approvedAt: '2026-11-03' }
      ],
      requestedBy: '张明远',
      requestedAt: '2026-10-25',
      validFrom: '2026-11-01',
      validTo: '2027-04-30',
      revokedReason: null,
      services: [
        { service: 'purchase', actions: ['view', 'operate', 'approve'], departments: ['采购部', '财务部'] },
        { service: 'sales', actions: ['view'], departments: ['销售部'] },
        { service: 'finance', actions: [], departments: [] }
      ]
    },
    {
      id: 'gov-cr-4002',
      workspaceId: 'ws-hq',
      name: '财务复核专员',
      description: '财务单据复核与审批，需要两名管理员独立批准后才生效。',
      status: 'pending',
      currentVersion: 1,
      versions: [
        { version: 1, changedAt: '2026-11-18', changedBy: '王芳', summary: '初始版本：开放财务查看与审批，范围仅财务部。' }
      ],
      approvalMode: 2,
      approvals: [
        { identityId: 'gov-id-wang', name: '王芳', approvedAt: '2026-11-18' }
      ],
      requestedBy: '王芳',
      requestedAt: '2026-11-18',
      validFrom: '2026-11-20',
      validTo: '2027-02-28',
      revokedReason: null,
      services: [
        { service: 'finance', actions: ['view', 'approve'], departments: ['财务部'] },
        { service: 'purchase', actions: ['view'], departments: ['采购部'] },
        { service: 'sales', actions: [], departments: [] }
      ]
    },
    {
      id: 'gov-cr-4003',
      workspaceId: 'ws-hq',
      name: '库存盘点专员',
      description: '盘点期间的临时查看授权，有效期已结束。',
      status: 'expired',
      currentVersion: 1,
      versions: [
        { version: 1, changedAt: '2026-08-01', changedBy: '李思远', summary: '初始版本：仓储部盘点查看权限，有效期 3 个月。' }
      ],
      approvalMode: 1,
      approvals: [
        { identityId: 'gov-id-li', name: '李思远', approvedAt: '2026-08-01' }
      ],
      requestedBy: '周宁',
      requestedAt: '2026-07-30',
      validFrom: '2026-08-01',
      validTo: '2026-10-31',
      revokedReason: null,
      services: [
        { service: 'purchase', actions: ['view'], departments: ['仓储部'] },
        { service: 'sales', actions: ['view'], departments: ['仓储部'] },
        { service: 'finance', actions: [], departments: [] }
      ]
    },
    {
      id: 'gov-cr-4004',
      workspaceId: 'ws-south',
      name: '财务过账员',
      description: '财务过账与审批授权，因职责冲突被审批人撤销。',
      status: 'revoked',
      currentVersion: 1,
      versions: [
        { version: 1, changedAt: '2026-09-01', changedBy: '吴敏', summary: '初始版本：财务查看、经办、审批全部动作。' }
      ],
      approvalMode: 1,
      approvals: [
        { identityId: 'gov-id-chen', name: '陈立', approvedAt: '2026-09-02' }
      ],
      requestedBy: '吴敏',
      requestedAt: '2026-09-01',
      validFrom: '2026-09-01',
      validTo: '2026-12-31',
      revokedReason: '审批人发现申请人与制单岗位职责冲突，撤销该授权。',
      services: [
        { service: 'finance', actions: ['view', 'operate', 'approve'], departments: ['财务部'] },
        { service: 'purchase', actions: [], departments: [] },
        { service: 'sales', actions: [], departments: [] }
      ]
    }
  ],
  announcements: [
    {
      id: 'gov-ann-5001',
      workspaceId: 'ws-hq',
      title: '11 月财务月结窗口安排',
      body: '本月结账窗口为 11 月 28 日至 11 月 30 日。请各业务部门在 11 月 27 日 18:00 前完成报销与采购发票录入，逾期单据将计入下月账期。',
      level: 'info',
      permission: 'finance.view',
      publishedAt: '2026-11-15',
      expiresAt: '2026-12-05',
      authorName: '财务部'
    },
    {
      id: 'gov-ann-5002',
      workspaceId: 'ws-hq',
      title: '采购审批人临时调整',
      body: '11 月 20 日至 11 月 24 日，采购审批由王芳代办。单笔超过 10 万元的采购订单仍需两人审批，请在提交时选择正确的审批人组合。',
      level: 'warning',
      permission: 'purchase.approve',
      publishedAt: '2026-11-18',
      expiresAt: '2026-11-24',
      authorName: '采购部'
    },
    {
      id: 'gov-ann-5003',
      workspaceId: 'ws-hq',
      title: '工作区会话空闲期限调整',
      body: '应安全审计要求，工作区会话空闲期限已从 60 分钟调整为 30 分钟。超过空闲期限后需要重新验证身份，未保存的表单草稿会保留。',
      level: 'critical',
      permission: 'settings.view',
      publishedAt: '2026-11-17',
      expiresAt: '2026-12-31',
      authorName: '工作区管理员'
    },
    {
      id: 'gov-ann-5004',
      workspaceId: 'ws-hq',
      title: '两人授权审批规则说明',
      body: '自定义角色授权默认需要两人独立批准。申请人不能批准自己的授权，同一审批人不能重复计入。待审批、已到期、已撤销的授权均不能用于单据操作。',
      level: 'info',
      permission: 'settings.manage',
      publishedAt: '2026-11-10',
      expiresAt: '2026-12-20',
      authorName: '工作区管理员'
    },
    {
      id: 'gov-ann-5005',
      workspaceId: 'ws-south',
      title: '供应商对账提醒',
      body: '请采购部在 11 月 25 日前完成与 12 家核心供应商的对账确认。未确认的供应商将对新采购订单发起审批锁。',
      level: 'warning',
      permission: 'purchase.view',
      publishedAt: '2026-11-16',
      expiresAt: '2026-11-25',
      authorName: '华南采购部'
    },
    {
      id: 'gov-ann-5006',
      workspaceId: 'ws-south',
      title: '销售价格表更新',
      body: '12 月起执行新一期销售价格表。销售订单创建时会自动带出新价格，历史订单不受影响。',
      level: 'info',
      permission: 'sales.view',
      publishedAt: '2026-11-14',
      expiresAt: '2026-11-22',
      authorName: '销售部'
    },
    {
      id: 'gov-ann-5007',
      workspaceId: 'ws-retail',
      title: '杭州门店月度盘点安排',
      body: '杭州三家门店将在 11 月 28 日闭店后盘点。盘点期间库存调整权限仅对盘点专员开放，请提前完成仓储部排班。',
      level: 'warning',
      permission: 'inventory.view',
      publishedAt: '2026-11-13',
      expiresAt: '2026-11-28',
      authorName: '零售运营部'
    },
    {
      id: 'gov-ann-5008',
      workspaceId: 'ws-retail',
      title: '试运营数据保留策略',
      body: '试运营期间产生的演示数据将在正式上线前统一清理。如需保留，请在 12 月 10 日前导出。',
      level: 'info',
      permission: 'dashboard.view',
      publishedAt: '2026-10-20',
      expiresAt: '2026-11-10',
      authorName: '运营中台'
    },
    {
      id: 'gov-ann-5009',
      workspaceId: 'ws-personal',
      title: '个人账本每周备份提醒',
      body: '个人账本已链接华东总部工作区。账本数据与公司账套隔离保存，每周五自动生成备份，也可在账本设置中手动导出。',
      level: 'info',
      permission: 'dashboard.view',
      publishedAt: '2026-11-12',
      expiresAt: '2026-12-12',
      authorName: '个人账本助手'
    }
  ]
}

/** 每次调用返回全新种子，组件切换/重置时不会污染模块常量。 */
export function createGovernanceSeed(): GovernanceSeed {
  return JSON.parse(JSON.stringify(seed)) as GovernanceSeed
}

export function isPastDate(date: string, today = DEMO_TODAY): boolean {
  return date < today
}

export function daysFromToday(date: string, today = DEMO_TODAY): number {
  const target = new Date(date + 'T00:00:00Z').getTime()
  const base = new Date(today + 'T00:00:00Z').getTime()
  return Math.round((target - base) / 86400000)
}

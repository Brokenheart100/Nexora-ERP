import type {
  AccessRequestStatus,
  Announcement,
  AuditEntry,
  CompanyProfile,
  Department,
  Invitation,
  InvitationStatus,
  Member,
  MemberStatus,
  Permission,
  Role,
  RoleAccessRequest,
  RoleScope
} from './types'
import { makeMember } from './factories'

export const memberStatusLabels: Record<MemberStatus, string> = {
  active: '在职',
  invited: '待接受邀请',
  disabled: '已停用'
}
export const memberStatusColors: Record<MemberStatus, 'success' | 'warning' | 'neutral'> = {
  active: 'success',
  invited: 'warning',
  disabled: 'neutral'
}
export const invitationStatusLabels: Record<InvitationStatus, string> = {
  pending: '待接受',
  accepted: '已接受',
  expired: '已过期'
}
export const invitationStatusColors: Record<InvitationStatus, 'warning' | 'success' | 'neutral'> = {
  pending: 'warning',
  accepted: 'success',
  expired: 'neutral'
}

/** 设置页角色权限矩阵的中文标签。 */
export const permissionLabels: Record<Permission, string> = {
  'dashboard.view': '查看工作台',
  'catalog.view': '查看商品',
  'catalog.edit': '维护商品',
  'purchase.view': '查看采购',
  'purchase.create': '创建采购单',
  'purchase.approve': '审批采购单',
  'sales.view': '查看销售',
  'sales.create': '创建销售单',
  'inventory.view': '查看库存',
  'inventory.adjust': '调整库存',
  'finance.view': '查看财务',
  'finance.post': '记账与过账',
  'settings.view': '查看设置',
  'settings.manage': '管理设置与成员'
}

/** 权限矩阵分组，顺序与文档一致。 */
export const permissionGroups: { id: string, label: string, permissions: Permission[] }[] = [
  { id: 'workspace', label: '工作台与商品', permissions: ['dashboard.view', 'catalog.view', 'catalog.edit'] },
  { id: 'purchase', label: '采购', permissions: ['purchase.view', 'purchase.create', 'purchase.approve'] },
  { id: 'sales-inventory', label: '销售与库存', permissions: ['sales.view', 'sales.create', 'inventory.view', 'inventory.adjust'] },
  { id: 'finance', label: '财务', permissions: ['finance.view', 'finance.post'] },
  { id: 'settings', label: '设置', permissions: ['settings.view', 'settings.manage'] }
]

export const roles: Role[] = [
  { id: 'role-owner', name: '所有者', description: '工作区全部权限', permissions: ['*'] },
  { id: 'role-admin', name: '管理员', description: '成员、设置与全部业务模块', permissions: ['settings.manage', 'purchase.approve', 'sales.create', 'finance.view'] },
  { id: 'role-buyer', name: '采购员', description: '采购与商品查看', permissions: ['catalog.view', 'purchase.view', 'purchase.create'] },
  { id: 'role-viewer', name: '只读成员', description: '仅查看业务数据', permissions: ['dashboard.view', 'catalog.view', 'purchase.view', 'sales.view', 'inventory.view'] }
]

export const departments: Department[] = [
  { id: 'dept-root', name: '华东总部', parentId: null, memberCount: 12 },
  { id: 'dept-purchase', name: '采购部', parentId: 'dept-root', memberCount: 5 },
  { id: 'dept-sales', name: '销售部', parentId: 'dept-root', memberCount: 4 },
  { id: 'dept-finance', name: '财务部', parentId: 'dept-root', memberCount: 2 },
  { id: 'dept-warehouse', name: '仓储部', parentId: 'dept-root', memberCount: 1 }
]

export const members: Member[] = [
  { id: 'u-1001', name: '张明远', email: 'zhangmingyuan@nexora.example', phone: '138-0000-1001', departmentId: 'dept-purchase', roleId: 'role-buyer', status: 'active', joinedAt: '2026-03-02' },
  { id: 'u-1002', name: '李思远', email: 'lisiyuan@nexora.example', phone: '138-0000-1002', departmentId: 'dept-sales', roleId: 'role-admin', status: 'active', joinedAt: '2026-04-18' },
  { id: 'u-1003', name: '周宁', email: 'zhouning@nexora.example', phone: '138-0000-1003', departmentId: 'dept-warehouse', roleId: 'role-viewer', status: 'active', joinedAt: '2026-05-09' },
  { id: 'u-1004', name: '陈立', email: 'chenli@nexora.example', phone: '138-0000-1004', departmentId: 'dept-finance', roleId: 'role-owner', status: 'active', joinedAt: '2026-01-12' },
  ...Array.from({ length: 8 }, (_, i) => makeMember({ id: 'u-' + (2001 + i), departmentId: ['dept-purchase', 'dept-sales', 'dept-finance'][i % 3]!, status: i === 7 ? 'invited' : 'active' }, 10100 + i))
]

export const invitations: Invitation[] = [
  { id: 'inv-1001', email: 'newbuyer@nexora.example', roleId: 'role-buyer', status: 'pending', sentAt: '2026-11-12', expiresAt: '2026-11-26' },
  { id: 'inv-1002', email: 'newviewer@nexora.example', roleId: 'role-viewer', status: 'expired', sentAt: '2026-10-28', expiresAt: '2026-11-11' },
  { id: 'inv-1003', email: 'newadmin@nexora.example', roleId: 'role-admin', status: 'accepted', sentAt: '2026-10-20', expiresAt: '2026-11-03' }
]

/** 三个工作区的公司资料，设置页按当前工作区读取。 */
export const companyProfiles: Record<string, CompanyProfile> = {
  'ws-hq': {
    id: 'ws-hq',
    name: '华东总部贸易有限公司',
    legalName: '华东总部贸易有限公司',
    registrationNo: '91310115MA1K4X8Y2Q',
    taxNo: '91310115MA1K4X8Y2Q',
    industry: '批发与零售',
    scale: '100–299 人',
    phone: '021-6888 1200',
    email: 'finance@nexora.example',
    website: 'https://nexora.example',
    address: '上海市浦东新区世纪大道 1200 号 18 层',
    baseCurrency: 'CNY',
    timezone: 'Asia/Shanghai',
    fiscalYearStart: '01-01',
    invoiceTitle: '华东总部贸易有限公司'
  },
  'ws-south': {
    id: 'ws-south',
    name: '华南分公司',
    legalName: '华东总部贸易有限公司华南分公司',
    registrationNo: '91440101MA5C7T9L3M',
    taxNo: '91440101MA5C7T9L3M',
    industry: '批发与零售',
    scale: '30–99 人',
    phone: '020-8333 5600',
    email: 'south-finance@nexora.example',
    website: 'https://nexora.example/south',
    address: '广州市天河区珠江新城华夏路 8 号 12 层',
    baseCurrency: 'CNY',
    timezone: 'Asia/Shanghai',
    fiscalYearStart: '01-01',
    invoiceTitle: '华东总部贸易有限公司华南分公司'
  },
  'ws-retail': {
    id: 'ws-retail',
    name: '新零售事业部',
    legalName: '华东总部贸易有限公司新零售事业部',
    registrationNo: '91330106MA2H6Q4W8K',
    taxNo: '91330106MA2H6Q4W8K',
    industry: '电商零售',
    scale: '10–29 人',
    phone: '0571-8888 7700',
    email: 'retail@nexora.example',
    website: 'https://shop.nexora.example',
    address: '杭州市西湖区文三路 478 号 6 层',
    baseCurrency: 'CNY',
    timezone: 'Asia/Shanghai',
    fiscalYearStart: '01-01',
    invoiceTitle: '华东总部贸易有限公司新零售事业部'
  }
}

export const announcements: Announcement[] = [
  { id: 'ann-1', title: '11 月采购预算已下达', body: '请各部门在本周内完成采购申请，逾期顺延至下月。', level: 'info', createdAt: '2026-11-12' },
  { id: 'ann-2', title: '发票抬头变更提醒', body: '自 12 月 1 日起，公司开票信息中的地址与电话将更新。', level: 'warning', createdAt: '2026-11-10' },
  { id: 'ann-3', title: '系统维护通知', body: '本周六 22:00–23:00 进行例行维护，期间只读。', level: 'info', createdAt: '2026-11-08' }
]

/** 审计日志样例（三个工作区共 30 条，支持分页与筛选）。 */
const auditSeeds: [workspaceId: string, actor: string, action: string, target: string, at: string][] = [
  ['ws-hq', '张明远', '提交采购单', 'PO-2026-0516', '2026-11-18 09:12'],
  ['ws-hq', '陈立', '审批采购单', 'PO-2026-0513', '2026-11-17 16:40'],
  ['ws-hq', '李思远', '创建销售订单', 'SO-2026-9001', '2026-11-17 11:20'],
  ['ws-hq', '周宁', '调整库存', 'SKU-2026-0041', '2026-11-16 15:05'],
  ['ws-hq', '陈立', '登记收款', 'INV-2026-0081', '2026-11-16 10:34'],
  ['ws-hq', '李思远', '创建报价单', 'QT-2026-0412', '2026-11-15 14:18'],
  ['ws-hq', '张明远', '修改商品', 'SKU-2026-0018', '2026-11-14 09:46'],
  ['ws-hq', '陈立', '更新角色', 'role-admin', '2026-11-13 17:02'],
  ['ws-hq', '李思远', '停用成员', 'u-2007', '2026-11-12 13:27'],
  ['ws-hq', '陈立', '导出报表', '2026-10 利润表', '2026-11-11 18:11'],
  ['ws-south', '黄嘉怡', '提交采购单', 'PO-2026-0517', '2026-11-18 08:55'],
  ['ws-south', '黄嘉怡', '修改商品', 'SKU-2026-0102', '2026-11-17 15:33'],
  ['ws-south', '梁子豪', '创建销售订单', 'SO-2026-9012', '2026-11-17 10:08'],
  ['ws-south', '梁子豪', '编辑客户', 'CUS-2026-0033', '2026-11-16 16:21'],
  ['ws-south', '黄嘉怡', '审批采购单', 'PO-2026-0511', '2026-11-15 11:42'],
  ['ws-south', '邓雅雯', '调整库存', 'SKU-2026-0110', '2026-11-14 14:12'],
  ['ws-south', '梁子豪', '创建报价单', 'QT-2026-0421', '2026-11-13 09:31'],
  ['ws-south', '邓雅雯', '导出报表', '2026-10 销售报表', '2026-11-12 17:48'],
  ['ws-south', '黄嘉怡', '更新部门', 'dept-south-sales', '2026-11-11 10:26'],
  ['ws-south', '梁子豪', '登记收款', 'INV-2026-0090', '2026-11-10 15:57'],
  ['ws-retail', '许安然', '创建销售订单', 'SO-2026-9021', '2026-11-18 10:41'],
  ['ws-retail', '许安然', '调整库存', 'SKU-2026-0205', '2026-11-17 19:03'],
  ['ws-retail', '冯子涵', '修改商品', 'SKU-2026-0212', '2026-11-17 13:35'],
  ['ws-retail', '许安然', '创建发票', 'INV-2026-0101', '2026-11-16 11:49'],
  ['ws-retail', '冯子涵', '更新角色', 'role-viewer', '2026-11-15 16:02'],
  ['ws-retail', '许安然', '导出报表', '2026-10 库存报表', '2026-11-14 18:20'],
  ['ws-retail', '冯子涵', '提交采购单', 'PO-2026-0522', '2026-11-13 09:08'],
  ['ws-retail', '许安然', '编辑客户', 'CUS-2026-0041', '2026-11-12 14:44'],
  ['ws-retail', '冯子涵', '停用成员', 'u-2005', '2026-11-11 11:15'],
  ['ws-retail', '许安然', '审批采购单', 'PO-2026-0520', '2026-11-10 10:02']
]

export const auditEntries: AuditEntry[] = auditSeeds.map(([workspaceId, actor, action, target, at], i) => ({
  id: 'audit-' + (1001 + i),
  workspaceId,
  actor,
  action,
  target,
  at
}))

// ---- C4 角色数据范围与授权申请 ----

export const accessRequestStatusLabels: Record<AccessRequestStatus, string> = {
  pending: '待独立审批',
  approved: '已批准',
  rejected: '已拒绝'
}
export const accessRequestStatusColors: Record<AccessRequestStatus, 'warning' | 'success' | 'error'> = {
  pending: 'warning',
  approved: 'success',
  rejected: 'error'
}

const allPeriodIds = Array.from({ length: 12 }, (_, index) => 'period-2026-' + String(index + 1).padStart(2, '0'))

/** 每个角色已有的部门、仓库与财务期间范围（初始演示数据）。 */
export const roleScopes: Record<string, RoleScope> = {
  'role-owner': {
    departmentIds: departments.map(item => item.id),
    warehouseIds: ['wh-east', 'wh-south', 'wh-retail'],
    periodIds: allPeriodIds
  },
  'role-admin': {
    departmentIds: ['dept-root', 'dept-purchase', 'dept-sales', 'dept-finance', 'dept-warehouse'],
    warehouseIds: ['wh-east', 'wh-south'],
    periodIds: ['period-2026-10', 'period-2026-11', 'period-2026-12']
  },
  'role-buyer': {
    departmentIds: ['dept-purchase'],
    warehouseIds: ['wh-east'],
    periodIds: ['period-2026-11']
  },
  'role-viewer': {
    departmentIds: ['dept-root'],
    warehouseIds: ['wh-east', 'wh-south'],
    periodIds: ['period-2026-11']
  }
}

/** 待审批、已拒绝与已批准的授权申请样例。 */
export const roleAccessRequests: RoleAccessRequest[] = [
  {
    id: 'REQ-2026-1201',
    workspaceId: 'ws-hq',
    roleId: 'role-buyer',
    requesterId: 'u-1001',
    requesterName: '张明远',
    scope: {
      departmentIds: ['dept-purchase'],
      warehouseIds: ['wh-south'],
      periodIds: ['period-2026-12']
    },
    reason: '华南前置仓年末备货，需要跨仓查看库存并发起采购。',
    status: 'pending',
    requestedAt: '2026-11-18 09:20',
    decisions: []
  },
  {
    id: 'REQ-2026-1202',
    workspaceId: 'ws-hq',
    roleId: 'role-viewer',
    requesterId: 'u-1002',
    requesterName: '李思远',
    scope: {
      departmentIds: ['dept-sales', 'dept-finance'],
      warehouseIds: ['wh-retail'],
      periodIds: ['period-2026-12']
    },
    reason: '季度复盘需要查看销售与财务数据。',
    status: 'rejected',
    requestedAt: '2026-11-17 14:10',
    decidedAt: '2026-11-17 16:40',
    decisions: [{
      actorId: 'u-1004',
      actorName: '陈立',
      decision: 'rejected',
      at: '2026-11-17 16:40',
      note: '范围超出只读角色职责，请按部门拆分后重新申请。'
    }]
  },
  {
    id: 'REQ-2026-1198',
    workspaceId: 'ws-hq',
    roleId: 'role-buyer',
    requesterId: 'u-1001',
    requesterName: '张明远',
    scope: {
      departmentIds: ['dept-purchase'],
      warehouseIds: ['wh-east'],
      periodIds: ['period-2026-11']
    },
    reason: '采购部日常采购与华东仓收货。',
    status: 'approved',
    requestedAt: '2026-11-14 10:05',
    decidedAt: '2026-11-15 09:12',
    decisions: [{
      actorId: 'u-1004',
      actorName: '陈立',
      decision: 'approved',
      at: '2026-11-15 09:12',
      note: '与采购部职责一致，批准。'
    }]
  }
]

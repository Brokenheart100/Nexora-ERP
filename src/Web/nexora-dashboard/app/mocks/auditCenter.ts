/**
 * C20 审计中心演示数据：组织、财务、采购、销售专项审计与业务变更记录。
 * 纯前端 mock：固定演示日 2026-11-19，刷新恢复种子；不访问后端。
 */

export type AuditServiceKey = 'organization' | 'finance' | 'purchase' | 'sales' | 'change'
export type AuditRoleKey = 'admin' | 'finance' | 'purchase'
export type AuditChangeScope = 'product' | 'partner' | 'warehouse' | 'transfer' | 'stocktake' | 'voucher'
export type AuditOperationKey
  = | 'create'
    | 'update'
    | 'submit'
    | 'approve'
    | 'reject'
    | 'receive'
    | 'ship'
    | 'invoice'
    | 'post'
    | 'reverse'
    | 'transfer'
    | 'stocktake'
    | 'role-change'
    | 'invite'
    | 'disable'
    | 'reconcile'
    | 'close'
    | 'tax'

export type AuditBadgeColor
  = | 'primary'
    | 'secondary'
    | 'success'
    | 'info'
    | 'warning'
    | 'error'
    | 'neutral'

export type AuditSourceKind = 'workbench' | 'document' | 'settings' | 'external'

export interface AuditFieldChange {
  field: string
  before: string
  after: string
}

export interface AuditChainStep {
  at: string
  actor: string
  action: string
  note: string
}

export interface AuditSource {
  label: string
  kind: AuditSourceKind
  /** 来源回跳路径；外部系统或纯演示入口不提供。 */
  to?: string
  hint?: string
}

export interface AuditRecord {
  id: string
  workspaceId: string
  service: AuditServiceKey
  /** 仅业务变更记录使用：商品、伙伴、仓库、调拨、盘点、凭证。 */
  scope?: AuditChangeScope
  entity: string
  documentNo: string
  operation: AuditOperationKey
  actor: string
  actorTitle: string
  /** 演示时间，格式 YYYY-MM-DD HH:mm。 */
  at: string
  version: number
  /** 金额类记录（凭证过账/冲销、调拨、盘点），由 formatMoney 展示。 */
  amount?: number
  source: AuditSource
  summary: string
  fields: AuditFieldChange[]
  chain: AuditChainStep[]
}

export interface AuditRole {
  key: AuditRoleKey
  name: string
  person: string
  title: string
  summary: string
  hint: string
  services: AuditServiceKey[]
  changeScopes: AuditChangeScope[]
}

export interface AuditQuickEntry {
  key: string
  label: string
  description: string
  service: AuditServiceKey
  recordId: string
  icon: string
}

export const AUDIT_DEMO_TODAY = '2026-11-19'

export const auditServiceOrder: AuditServiceKey[] = [
  'organization',
  'finance',
  'purchase',
  'sales',
  'change'
]

export const auditServiceLabels: Record<AuditServiceKey, string> = {
  organization: '组织审计',
  finance: '财务审计',
  purchase: '采购审计',
  sales: '销售审计',
  change: '业务变更'
}

export const auditServiceDescriptions: Record<AuditServiceKey, string> = {
  organization: '角色授权、成员邀请、部门与工作区设置变更；需要 settings.manage 权限。',
  finance: '凭证过账/冲销、银行对账、期间结账与纳税申报；需要 finance.view 权限。',
  purchase: '采购订单提交与审批、收货、供应商启停；需要 purchase.approve 权限。',
  sales: '报价转订单、订单审批、发货过账与开票；需要 sales.view 权限。',
  change: '商品、伙伴、仓库主数据及库存调拨、盘点、凭证过账与冲销的变更记录。'
}

export const auditServiceColors: Record<AuditServiceKey, AuditBadgeColor> = {
  organization: 'info',
  finance: 'warning',
  purchase: 'primary',
  sales: 'success',
  change: 'secondary'
}

export const auditChangeScopeLabels: Record<AuditChangeScope, string> = {
  product: '商品主数据',
  partner: '往来伙伴',
  warehouse: '仓库',
  transfer: '库存调拨',
  stocktake: '库存盘点',
  voucher: '财务凭证'
}

export const auditSourceKindLabels: Record<AuditSourceKind, string> = {
  workbench: '工作台最近动态',
  document: '单据详情',
  settings: '设置审计入口',
  external: '外部系统'
}

export const auditOperationLabels: Record<AuditOperationKey, string> = {
  'create': '新建',
  'update': '修改',
  'submit': '提交',
  'approve': '审批通过',
  'reject': '审批退回',
  'receive': '收货',
  'ship': '发货过账',
  'invoice': '开票',
  'post': '凭证过账',
  'reverse': '凭证冲销',
  'transfer': '调拨过账',
  'stocktake': '盘点确认',
  'role-change': '角色权限调整',
  'invite': '邀请成员',
  'disable': '停用',
  'reconcile': '银行对账',
  'close': '期间结账',
  'tax': '纳税申报'
}

export const auditOperationColors: Record<AuditOperationKey, AuditBadgeColor> = {
  'create': 'primary',
  'update': 'info',
  'submit': 'secondary',
  'approve': 'success',
  'reject': 'error',
  'receive': 'primary',
  'ship': 'info',
  'invoice': 'secondary',
  'post': 'warning',
  'reverse': 'error',
  'transfer': 'primary',
  'stocktake': 'warning',
  'role-change': 'info',
  'invite': 'primary',
  'disable': 'neutral',
  'reconcile': 'info',
  'close': 'secondary',
  'tax': 'warning'
}

export const auditRoles: AuditRole[] = [
  {
    key: 'admin',
    name: '管理员',
    person: '周雨桐',
    title: '系统管理员',
    summary: '拥有全部审计查看权限。',
    hint: '可核对组织、财务、采购、销售专项审计与全部业务变更记录。',
    services: auditServiceOrder,
    changeScopes: ['product', 'partner', 'warehouse', 'transfer', 'stocktake', 'voucher']
  },
  {
    key: 'finance',
    name: '财务',
    person: '陈立',
    title: '财务负责人',
    summary: '可查看财务审计与财务相关业务变更。',
    hint: '组织、采购、销售专项审计对财务身份隐藏；业务变更仅开放凭证、商品与伙伴。',
    services: ['finance', 'change'],
    changeScopes: ['voucher', 'product', 'partner']
  },
  {
    key: 'purchase',
    name: '采购',
    person: '张明远',
    title: '采购经理',
    summary: '可查看采购审计与库存相关业务变更。',
    hint: '组织、财务、销售专项审计对采购身份隐藏；业务变更仅开放商品、伙伴、仓库、调拨与盘点。',
    services: ['purchase', 'change'],
    changeScopes: ['product', 'partner', 'warehouse', 'transfer', 'stocktake']
  }
]

interface AuditSeed extends Omit<AuditRecord, 'chain'> {
  chain?: AuditChainStep[]
}

function createAuditRecord(seed: AuditSeed): AuditRecord {
  const previousVersion = Math.max(1, seed.version - 1)
  const chain = seed.chain ?? [
    {
      at: seed.at.slice(0, 10) + ' 08:30',
      actor: '审计归档服务',
      action: '归档变更前快照',
      note: '版本 v' + previousVersion + ' 的字段原值已归档，可在下方变更字段核对。'
    },
    {
      at: seed.at,
      actor: seed.actor + ' · ' + seed.actorTitle,
      action: auditOperationLabels[seed.operation],
      note: seed.summary
    },
    {
      at: seed.at,
      actor: seed.source.label,
      action: '关联来源',
      note: '与' + auditSourceKindLabels[seed.source.kind] + '建立关联，单据版本递增至 v' + seed.version + '。'
    },
    {
      at: seed.at,
      actor: '审计链服务',
      action: '写入哈希链',
      note: '记录已追加至哈希链，前序摘要校验通过；审计记录只读、不可篡改。'
    }
  ]
  return { ...seed, chain }
}

export const auditRecords: AuditRecord[] = [
  // 组织审计（ws-hq 7 条）
  createAuditRecord({
    id: 'org-2026-1119-01',
    workspaceId: 'ws-hq',
    service: 'organization',
    entity: '角色 · 财务审批人',
    documentNo: 'ROLE-FIN-APPROVER',
    operation: 'role-change',
    actor: '周雨桐',
    actorTitle: '系统管理员',
    at: '2026-11-19 10:24',
    version: 3,
    source: { label: '设置 · 角色与权限', kind: 'settings', to: '/settings?tab=roles' },
    summary: '为财务审批人角色增加过账权限，并上调审批额度。',
    fields: [
      { field: '权限范围', before: 'finance.view', after: 'finance.view、finance.post' },
      { field: '审批额度', before: '20 万元', after: '50 万元' }
    ]
  }),
  createAuditRecord({
    id: 'org-2026-1118-02',
    workspaceId: 'ws-hq',
    service: 'organization',
    entity: '成员 · 赵子涵',
    documentNo: 'INV-2026-0186',
    operation: 'invite',
    actor: '周雨桐',
    actorTitle: '系统管理员',
    at: '2026-11-18 15:10',
    version: 1,
    source: { label: '设置 · 邀请成员', kind: 'settings', to: '/settings?tab=invitations' },
    summary: '向赵子涵发送财务专员邀请，默认角色为财务审批人。',
    fields: [
      { field: '邀请状态', before: '未邀请', after: '已发送（待接受）' },
      { field: '默认角色', before: '—', after: '财务审批人' }
    ]
  }),
  createAuditRecord({
    id: 'org-2026-1117-03',
    workspaceId: 'ws-hq',
    service: 'organization',
    entity: '部门 · 华南采购组',
    documentNo: 'DEPT-2026-011',
    operation: 'create',
    actor: '周雨桐',
    actorTitle: '系统管理员',
    at: '2026-11-17 11:02',
    version: 1,
    source: { label: '设置 · 部门', kind: 'settings', to: '/settings?tab=departments' },
    summary: '新建华南采购组，归属华南采购中心。',
    fields: [
      { field: '部门状态', before: '—', after: '启用' },
      { field: '上级部门', before: '—', after: '采购中心' }
    ]
  }),
  createAuditRecord({
    id: 'org-2026-1116-04',
    workspaceId: 'ws-hq',
    service: 'organization',
    entity: '成员 · 张明远',
    documentNo: 'USR-2026-0102',
    operation: 'update',
    actor: '周雨桐',
    actorTitle: '系统管理员',
    at: '2026-11-16 09:38',
    version: 2,
    source: { label: '设置 · 团队与成员', kind: 'settings', to: '/settings?tab=members' },
    summary: '调整张明远的岗位与默认工作区。',
    fields: [
      { field: '岗位', before: '采购专员', after: '采购经理' },
      { field: '默认工作区', before: '华南采购中心', after: '华东总部贸易有限公司' }
    ]
  }),
  createAuditRecord({
    id: 'org-2026-1113-05',
    workspaceId: 'ws-hq',
    service: 'organization',
    entity: '成员 · 李思远',
    documentNo: 'USR-2026-0088',
    operation: 'disable',
    actor: '周雨桐',
    actorTitle: '系统管理员',
    at: '2026-11-13 17:45',
    version: 3,
    source: { label: '设置 · 团队与成员', kind: 'settings', to: '/settings?tab=members' },
    summary: '离职停用账号，同时回收全部业务角色。',
    fields: [
      { field: '账号状态', before: '启用', after: '停用' },
      { field: '已分配角色', before: '采购专员、销售专员', after: '无' }
    ]
  }),
  createAuditRecord({
    id: 'org-2026-1110-06',
    workspaceId: 'ws-hq',
    service: 'organization',
    entity: '角色 · 采购审批人',
    documentNo: 'ROLE-PUR-APPROVER',
    operation: 'role-change',
    actor: '周雨桐',
    actorTitle: '系统管理员',
    at: '2026-11-10 14:20',
    version: 2,
    source: { label: '设置 · 角色与权限', kind: 'settings', to: '/settings?tab=roles' },
    summary: '采购审批人角色增加采购审批权限。',
    fields: [
      { field: '权限范围', before: 'purchase.view', after: 'purchase.view、purchase.approve' }
    ]
  }),
  createAuditRecord({
    id: 'org-2026-1028-07',
    workspaceId: 'ws-hq',
    service: 'organization',
    entity: '工作区 · 华东总部贸易有限公司',
    documentNo: 'WS-HQ-SETTING',
    operation: 'update',
    actor: '周雨桐',
    actorTitle: '系统管理员',
    at: '2026-10-28 10:05',
    version: 4,
    source: { label: '设置 · 公司信息', kind: 'settings', to: '/settings?tab=company' },
    summary: '更新工作区默认币种与会计年度起始月。',
    fields: [
      { field: '默认币种', before: 'USD', after: 'CNY' },
      { field: '会计年度起始月', before: '1 月', after: '1 月（沿用）' }
    ]
  }),

  // 财务审计（ws-hq 8 条）
  createAuditRecord({
    id: 'fin-2026-1119-01',
    workspaceId: 'ws-hq',
    service: 'finance',
    entity: '凭证 · 采购入库暂估',
    documentNo: 'PV-2026-1119',
    operation: 'post',
    actor: '陈立',
    actorTitle: '财务负责人',
    at: '2026-11-19 09:12',
    version: 2,
    amount: 268000,
    source: { label: '财务 · 凭证明细', kind: 'document', to: '/finance?tab=gl&bill=PV-2026-1119' },
    summary: '采购入库暂估凭证过账，借贷平衡校验通过。',
    fields: [
      { field: '凭证状态', before: '待过账', after: '已过账' },
      { field: '过账期间', before: '2026-11', after: '2026-11' }
    ]
  }),
  createAuditRecord({
    id: 'fin-2026-1118-02',
    workspaceId: 'ws-hq',
    service: 'finance',
    entity: '红字凭证 · 暂估冲销',
    documentNo: 'RV-2026-0042',
    operation: 'reverse',
    actor: '陈立',
    actorTitle: '财务负责人',
    at: '2026-11-18 16:40',
    version: 3,
    amount: 268000,
    source: { label: '财务 · 凭证明细', kind: 'document', to: '/finance?tab=gl&bill=RV-2026-0042' },
    summary: '暂估金额差异，生成红字凭证冲销原暂估。',
    fields: [
      { field: '凭证状态', before: '已过账', after: '已冲销' },
      { field: '冲销原因', before: '—', after: '暂估金额差异冲销' }
    ]
  }),
  createAuditRecord({
    id: 'fin-2026-1117-03',
    workspaceId: 'ws-hq',
    service: 'finance',
    entity: '银行流水 · 招商银行 6225',
    documentNo: 'BNK-2026-1107',
    operation: 'reconcile',
    actor: '何静',
    actorTitle: '出纳',
    at: '2026-11-17 14:05',
    version: 2,
    amount: 128400,
    source: { label: '财务 · 银行对账', kind: 'document', to: '/finance?tab=bank' },
    summary: '完成招商银行 11 月流水与总账的自动对账。',
    fields: [
      { field: '对账状态', before: '未对账', after: '已对账（差异 0 笔）' }
    ]
  }),
  createAuditRecord({
    id: 'fin-2026-1116-04',
    workspaceId: 'ws-hq',
    service: 'finance',
    entity: '会计期间 · 2026-10',
    documentNo: 'PERIOD-2026-10',
    operation: 'close',
    actor: '陈立',
    actorTitle: '财务负责人',
    at: '2026-11-16 18:20',
    version: 2,
    source: { label: '财务 · 期间结账', kind: 'document', to: '/finance?tab=periods' },
    summary: '10 月会计期间结账，未结事项已确认清零。',
    fields: [
      { field: '期间状态', before: '开放', after: '已结账' },
      { field: '未结凭证', before: '3 张', after: '0 张' }
    ]
  }),
  createAuditRecord({
    id: 'fin-2026-1114-05',
    workspaceId: 'ws-hq',
    service: 'finance',
    entity: '增值税申报 · 2026-10',
    documentNo: 'TAX-2026-10',
    operation: 'tax',
    actor: '陈立',
    actorTitle: '财务负责人',
    at: '2026-11-14 10:15',
    version: 1,
    amount: 86520.35,
    source: { label: '财务 · 税务申报', kind: 'document', to: '/finance?tab=tax' },
    summary: '提交 10 月增值税申报，应纳税额与账载一致。',
    fields: [
      { field: '申报状态', before: '待申报', after: '已申报' },
      { field: '申报表版本', before: 'v1（草稿）', after: 'v1（正式）' }
    ]
  }),
  createAuditRecord({
    id: 'fin-2026-1113-06',
    workspaceId: 'ws-hq',
    service: 'finance',
    entity: '凭证 · 销售出库成本结转',
    documentNo: 'PV-2026-1113',
    operation: 'post',
    actor: '陈立',
    actorTitle: '财务负责人',
    at: '2026-11-13 09:55',
    version: 2,
    amount: 186420,
    source: { label: '财务 · 凭证明细', kind: 'document', to: '/finance?tab=gl&bill=PV-2026-1113' },
    summary: '销售出库单成本结转凭证过账。',
    fields: [
      { field: '凭证状态', before: '待过账', after: '已过账' }
    ]
  }),
  createAuditRecord({
    id: 'fin-2026-1108-07',
    workspaceId: 'ws-hq',
    service: 'finance',
    entity: '红字凭证 · 重复付款冲销',
    documentNo: 'RV-2026-0038',
    operation: 'reverse',
    actor: '陈立',
    actorTitle: '财务负责人',
    at: '2026-11-08 15:30',
    version: 3,
    amount: 56000,
    source: { label: '财务 · 凭证明细', kind: 'document', to: '/finance?tab=gl&bill=RV-2026-0038' },
    summary: '供应商重复付款，红字凭证冲销其中一笔。',
    fields: [
      { field: '凭证状态', before: '已过账', after: '已冲销' },
      { field: '冲销原因', before: '—', after: '重复付款退回' }
    ]
  }),
  createAuditRecord({
    id: 'fin-2026-1026-08',
    workspaceId: 'ws-hq',
    service: 'finance',
    entity: '会计期间 · 2026-09',
    documentNo: 'PERIOD-2026-09',
    operation: 'close',
    actor: '陈立',
    actorTitle: '财务负责人',
    at: '2026-10-26 17:50',
    version: 2,
    source: { label: '财务 · 期间结账', kind: 'document', to: '/finance?tab=periods' },
    summary: '9 月会计期间结账。',
    fields: [
      { field: '期间状态', before: '开放', after: '已结账' }
    ]
  }),

  // 采购审计（ws-hq 7 条）
  createAuditRecord({
    id: 'pur-2026-1119-01',
    workspaceId: 'ws-hq',
    service: 'purchase',
    entity: '采购订单 · 宁波华翔',
    documentNo: 'PO-2026-0518',
    operation: 'submit',
    actor: '张明远',
    actorTitle: '采购经理',
    at: '2026-11-19 11:30',
    version: 2,
    amount: 486200,
    source: { label: '采购订单详情', kind: 'document', to: '/purchase-orders?order=PO-2026-0518' },
    summary: '采购订单提交审批，共 6 行、含税金额 48.62 万元。',
    fields: [
      { field: '单据状态', before: '草稿', after: '待审批' },
      { field: '预计交期', before: '2026-11-28', after: '2026-12-02' }
    ]
  }),
  createAuditRecord({
    id: 'pur-2026-1118-02',
    workspaceId: 'ws-hq',
    service: 'purchase',
    entity: '采购订单 · 宁波华翔',
    documentNo: 'PO-2026-0518',
    operation: 'approve',
    actor: '周雨桐',
    actorTitle: '运营总监',
    at: '2026-11-18 16:15',
    version: 3,
    amount: 486200,
    source: { label: '采购订单详情', kind: 'document', to: '/purchase-orders?order=PO-2026-0518' },
    summary: '审批通过采购订单，价格与交期符合预算。',
    fields: [
      { field: '单据状态', before: '待审批', after: '已审批' },
      { field: '审批意见', before: '—', after: '价格与交期符合预算' }
    ]
  }),
  createAuditRecord({
    id: 'pur-2026-1117-03',
    workspaceId: 'ws-hq',
    service: 'purchase',
    entity: '收货单 · 上海主仓',
    documentNo: 'GR-2026-0327',
    operation: 'receive',
    actor: '沈凯',
    actorTitle: '仓管员',
    at: '2026-11-17 09:40',
    version: 2,
    amount: 214800,
    source: { label: '库存 · 收货记录', kind: 'document', to: '/inventory' },
    summary: '采购订单部分收货，实收 4 行共 320 件。',
    fields: [
      { field: '收货状态', before: '待收货', after: '部分收货' },
      { field: '实收数量', before: '0', after: '320 件' }
    ]
  }),
  createAuditRecord({
    id: 'pur-2026-1115-04',
    workspaceId: 'ws-hq',
    service: 'purchase',
    entity: '采购订单 · 上海启明',
    documentNo: 'PO-2026-0507',
    operation: 'update',
    actor: '张明远',
    actorTitle: '采购经理',
    at: '2026-11-15 13:05',
    version: 3,
    amount: 128400,
    source: { label: '采购订单详情', kind: 'document', to: '/purchase-orders?order=PO-2026-0507' },
    summary: '供应商产能调整，顺延预计交期。',
    fields: [
      { field: '预计交期', before: '2026-11-20', after: '2026-11-25' },
      { field: '变更原因', before: '—', after: '供应商产能调整' }
    ]
  }),
  createAuditRecord({
    id: 'pur-2026-1112-05',
    workspaceId: 'ws-hq',
    service: 'purchase',
    entity: '采购订单 · 苏州恒信',
    documentNo: 'PO-2026-0499',
    operation: 'approve',
    actor: '周雨桐',
    actorTitle: '运营总监',
    at: '2026-11-12 10:50',
    version: 3,
    amount: 96200,
    source: { label: '采购订单详情', kind: 'document', to: '/purchase-orders?order=PO-2026-0499' },
    summary: '审批通过补充采购订单。',
    fields: [
      { field: '单据状态', before: '待审批', after: '已审批' }
    ]
  }),
  createAuditRecord({
    id: 'pur-2026-1110-06',
    workspaceId: 'ws-hq',
    service: 'purchase',
    entity: '供应商 · 无锡恒达',
    documentNo: 'SUP-2026-0031',
    operation: 'disable',
    actor: '张明远',
    actorTitle: '采购经理',
    at: '2026-11-10 15:20',
    version: 2,
    source: { label: '伙伴 · 供应商详情', kind: 'document', to: '/partners' },
    summary: '供应商资质过期，暂停下单并停用档案。',
    fields: [
      { field: '供应商状态', before: '合作中', after: '已停用' },
      { field: '停用原因', before: '—', after: '营业执照到期未续' }
    ]
  }),
  createAuditRecord({
    id: 'pur-2026-1029-07',
    workspaceId: 'ws-hq',
    service: 'purchase',
    entity: '采购订单 · 上海启明',
    documentNo: 'PO-2026-0488',
    operation: 'reject',
    actor: '周雨桐',
    actorTitle: '运营总监',
    at: '2026-10-29 11:10',
    version: 2,
    amount: 310000,
    source: { label: '采购订单详情', kind: 'document', to: '/purchase-orders?order=PO-2026-0488' },
    summary: '预算科目不符，审批退回修改。',
    fields: [
      { field: '单据状态', before: '待审批', after: '已退回' },
      { field: '退回原因', before: '—', after: '预算科目与费用归属不一致' }
    ]
  }),

  // 销售审计（ws-hq 7 条）
  createAuditRecord({
    id: 'sal-2026-1119-01',
    workspaceId: 'ws-hq',
    service: 'sales',
    entity: '销售订单 · 杭州云谷科技',
    documentNo: 'SO-2026-9032',
    operation: 'create',
    actor: '林嘉怡',
    actorTitle: '销售专员',
    at: '2026-11-19 10:05',
    version: 1,
    amount: 158000,
    source: { label: '销售订单详情', kind: 'document', to: '/sales?order=SO-2026-9032' },
    summary: '报价转销售订单，客户确认 120 件轴承。',
    fields: [
      { field: '单据状态', before: '报价', after: '订单确认' },
      { field: '订单数量', before: '0', after: '120 件' }
    ]
  }),
  createAuditRecord({
    id: 'sal-2026-1118-02',
    workspaceId: 'ws-hq',
    service: 'sales',
    entity: '销售订单 · 宁波华翔',
    documentNo: 'SO-2026-9025',
    operation: 'approve',
    actor: '周雨桐',
    actorTitle: '运营总监',
    at: '2026-11-18 09:45',
    version: 3,
    amount: 486200,
    source: { label: '销售订单详情', kind: 'document', to: '/sales?order=SO-2026-9025' },
    summary: '销售订单审批通过，进入履约。',
    fields: [
      { field: '单据状态', before: '待审批', after: '已审批' }
    ]
  }),
  createAuditRecord({
    id: 'sal-2026-1117-03',
    workspaceId: 'ws-hq',
    service: 'sales',
    entity: '销售出库 · 上海启明',
    documentNo: 'DN-2026-0418',
    operation: 'ship',
    actor: '沈凯',
    actorTitle: '仓管员',
    at: '2026-11-17 14:30',
    version: 2,
    amount: 128400,
    source: { label: '库存 · 出库记录', kind: 'document', to: '/inventory' },
    summary: '销售订单发货过账，库存同步扣减。',
    fields: [
      { field: '发货状态', before: '待发货', after: '已发货' },
      { field: '出库数量', before: '0', after: '200 件' }
    ]
  }),
  createAuditRecord({
    id: 'sal-2026-1115-04',
    workspaceId: 'ws-hq',
    service: 'sales',
    entity: '销售发票 · 杭州云谷科技',
    documentNo: 'INV-2026-0761',
    operation: 'invoice',
    actor: '陈立',
    actorTitle: '财务负责人',
    at: '2026-11-15 11:20',
    version: 2,
    amount: 158000,
    source: { label: '财务 · 发票详情', kind: 'document', to: '/finance?tab=invoice' },
    summary: '按销售订单开具增值税专用发票。',
    fields: [
      { field: '开票状态', before: '待开票', after: '已开票' },
      { field: '发票类型', before: '—', after: '增值税专用发票' }
    ]
  }),
  createAuditRecord({
    id: 'sal-2026-1112-05',
    workspaceId: 'ws-hq',
    service: 'sales',
    entity: '销售订单 · 苏州恒信',
    documentNo: 'SO-2026-9011',
    operation: 'update',
    actor: '林嘉怡',
    actorTitle: '销售专员',
    at: '2026-11-12 16:10',
    version: 3,
    amount: 96000,
    source: { label: '销售订单详情', kind: 'document', to: '/sales?order=SO-2026-9011' },
    summary: '客户年度框架协议生效，调整订单折扣。',
    fields: [
      { field: '折扣', before: '0%', after: '3%（框架协议）' },
      { field: '价格版本', before: 'v2', after: 'v3' }
    ]
  }),
  createAuditRecord({
    id: 'sal-2026-1109-06',
    workspaceId: 'ws-hq',
    service: 'sales',
    entity: '销售订单 · 宁波华翔',
    documentNo: 'SO-2026-8988',
    operation: 'reject',
    actor: '周雨桐',
    actorTitle: '运营总监',
    at: '2026-11-09 15:25',
    version: 2,
    amount: 264000,
    source: { label: '销售订单详情', kind: 'document', to: '/sales?order=SO-2026-8988' },
    summary: '客户信用余额不足，订单审批退回。',
    fields: [
      { field: '单据状态', before: '待审批', after: '已退回' },
      { field: '退回原因', before: '—', after: '客户信用余额不足' }
    ]
  }),
  createAuditRecord({
    id: 'sal-2026-1027-07',
    workspaceId: 'ws-hq',
    service: 'sales',
    entity: '销售订单 · 南京新港物流',
    documentNo: 'SO-2026-8960',
    operation: 'create',
    actor: '林嘉怡',
    actorTitle: '销售专员',
    at: '2026-10-27 09:20',
    version: 1,
    amount: 264000,
    source: { label: '销售订单详情', kind: 'document', to: '/sales?order=SO-2026-8960' },
    summary: '新签客户首个销售订单。',
    fields: [
      { field: '单据状态', before: '—', after: '待审批' }
    ]
  }),

  // 业务变更（ws-hq 13 条）
  createAuditRecord({
    id: 'chg-2026-1119-01',
    workspaceId: 'ws-hq',
    service: 'change',
    scope: 'product',
    entity: '商品 · 精工深沟球轴承 SKU-1001',
    documentNo: 'SKU-1001',
    operation: 'update',
    actor: '许文清',
    actorTitle: '主数据管理员',
    at: '2026-11-19 09:42',
    version: 4,
    amount: 132,
    source: { label: '工作台 · 最近动态', kind: 'workbench', to: '/catalog' },
    summary: '原材料涨价，同步调整轴承销售价与成本价。',
    fields: [
      { field: '销售价', before: '128.00', after: '132.00' },
      { field: '成本价', before: '96.50', after: '98.00' }
    ]
  }),
  createAuditRecord({
    id: 'chg-2026-1119-02',
    workspaceId: 'ws-hq',
    service: 'change',
    scope: 'transfer',
    entity: '调拨单 · 上海主仓 → 杭州前置仓',
    documentNo: 'TR-2026-0121',
    operation: 'transfer',
    actor: '沈凯',
    actorTitle: '仓管员',
    at: '2026-11-19 08:55',
    version: 2,
    amount: 186420,
    source: { label: '库存 · 调拨单', kind: 'document', to: '/inventory' },
    summary: '双十一备货，调拨 12 个 SKU 至杭州前置仓。',
    fields: [
      { field: '调拨状态', before: '待过账', after: '已过账' },
      { field: '调拨明细', before: '—', after: '12 个 SKU / 860 件' }
    ]
  }),
  createAuditRecord({
    id: 'chg-2026-1118-03',
    workspaceId: 'ws-hq',
    service: 'change',
    scope: 'partner',
    entity: '伙伴 · 宁波华翔',
    documentNo: 'SUP-2026-0007',
    operation: 'update',
    actor: '许文清',
    actorTitle: '主数据管理员',
    at: '2026-11-18 15:20',
    version: 3,
    source: { label: '伙伴 · 供应商详情', kind: 'document', to: '/partners' },
    summary: '供应商开户行变更，同步更新付款银行账户。',
    fields: [
      { field: '开户银行', before: '建设银行宁波分行', after: '招商银行宁波分行' },
      { field: '银行账号', before: '**** 4431', after: '**** 8892' }
    ]
  }),
  createAuditRecord({
    id: 'chg-2026-1118-04',
    workspaceId: 'ws-hq',
    service: 'change',
    scope: 'warehouse',
    entity: '仓库 · 杭州前置仓',
    documentNo: 'WH-2026-003',
    operation: 'update',
    actor: '沈凯',
    actorTitle: '仓管员',
    at: '2026-11-18 11:05',
    version: 2,
    source: { label: '库存 · 仓库设置', kind: 'document', to: '/inventory' },
    summary: '杭州前置仓恢复启用并指定负责人。',
    fields: [
      { field: '启用状态', before: '停用', after: '启用' },
      { field: '仓库负责人', before: '—', after: '沈凯' }
    ]
  }),
  createAuditRecord({
    id: 'chg-2026-1117-05',
    workspaceId: 'ws-hq',
    service: 'change',
    scope: 'stocktake',
    entity: '盘点单 · 上海主仓',
    documentNo: 'ST-2026-0088',
    operation: 'stocktake',
    actor: '沈凯',
    actorTitle: '仓管员',
    at: '2026-11-17 17:40',
    version: 2,
    amount: 4260.5,
    source: { label: '库存 · 盘点单', kind: 'document', to: '/inventory' },
    summary: '盘点差异确认，12 件轴承盘亏并计入存货损失。',
    fields: [
      { field: '差异处理', before: '待确认', after: '已确认盘亏' },
      { field: '调整科目', before: '—', after: '存货盘亏损失' }
    ]
  }),
  createAuditRecord({
    id: 'chg-2026-1117-06',
    workspaceId: 'ws-hq',
    service: 'change',
    scope: 'voucher',
    entity: '凭证 · 采购入库暂估',
    documentNo: 'PV-2026-1109',
    operation: 'post',
    actor: '陈立',
    actorTitle: '财务负责人',
    at: '2026-11-17 09:30',
    version: 2,
    amount: 268000,
    source: { label: '财务 · 凭证明细', kind: 'document', to: '/finance?tab=gl&bill=PV-2026-1109' },
    summary: '采购入库暂估凭证过账，进入总账。',
    fields: [
      { field: '凭证状态', before: '待过账', after: '已过账' },
      { field: '过账人', before: '—', after: '陈立' }
    ]
  }),
  createAuditRecord({
    id: 'chg-2026-1116-07',
    workspaceId: 'ws-hq',
    service: 'change',
    scope: 'voucher',
    entity: '红字凭证 · 暂估冲销',
    documentNo: 'RV-2026-0042',
    operation: 'reverse',
    actor: '陈立',
    actorTitle: '财务负责人',
    at: '2026-11-16 16:20',
    version: 3,
    amount: 268000,
    source: { label: '财务 · 凭证明细', kind: 'document', to: '/finance?tab=gl&bill=RV-2026-0042' },
    summary: '暂估差异冲销，关联原暂估凭证 PV-2026-1109。',
    fields: [
      { field: '凭证状态', before: '已过账', after: '已冲销' },
      { field: '来源单据', before: 'PV-2026-1109', after: 'PV-2026-1109（已冲销）' }
    ]
  }),
  createAuditRecord({
    id: 'chg-2026-1115-08',
    workspaceId: 'ws-hq',
    service: 'change',
    scope: 'partner',
    entity: '伙伴 · 上海启明',
    documentNo: 'CUS-2026-0042',
    operation: 'update',
    actor: '许文清',
    actorTitle: '主数据管理员',
    at: '2026-11-15 10:35',
    version: 2,
    source: { label: '伙伴 · 客户详情', kind: 'document', to: '/partners' },
    summary: '客户信用额度与结算方式调整。',
    fields: [
      { field: '信用额度', before: '50 万元', after: '80 万元' },
      { field: '结算方式', before: '月结 30 天', after: '月结 45 天' }
    ]
  }),
  createAuditRecord({
    id: 'chg-2026-1114-09',
    workspaceId: 'ws-hq',
    service: 'change',
    scope: 'product',
    entity: '商品 · 不锈钢法兰 DN50',
    documentNo: 'SKU-2048',
    operation: 'update',
    actor: '许文清',
    actorTitle: '主数据管理员',
    at: '2026-11-14 14:50',
    version: 5,
    source: { label: '商品 · 商品详情', kind: 'document', to: '/catalog' },
    summary: '供应商停产，商品停售并下架。',
    fields: [
      { field: '商品状态', before: '在售', after: '停售' },
      { field: '停售原因', before: '—', after: '供应商停产' }
    ]
  }),
  createAuditRecord({
    id: 'chg-2026-1113-10',
    workspaceId: 'ws-hq',
    service: 'change',
    scope: 'transfer',
    entity: '调拨单 · 深圳中转仓 → 上海主仓',
    documentNo: 'TR-2026-0119',
    operation: 'transfer',
    actor: '沈凯',
    actorTitle: '仓管员',
    at: '2026-11-13 11:25',
    version: 2,
    amount: 58400,
    source: { label: '库存 · 调拨单', kind: 'document', to: '/inventory' },
    summary: '深圳中转仓清仓，5 个 SKU 调回上海主仓。',
    fields: [
      { field: '调拨状态', before: '待过账', after: '已过账' },
      { field: '调拨明细', before: '—', after: '5 个 SKU / 210 件' }
    ]
  }),
  createAuditRecord({
    id: 'chg-2026-1112-11',
    workspaceId: 'ws-hq',
    service: 'change',
    scope: 'stocktake',
    entity: '盘点单 · 深圳中转仓',
    documentNo: 'ST-2026-0091',
    operation: 'stocktake',
    actor: '沈凯',
    actorTitle: '仓管员',
    at: '2026-11-12 16:05',
    version: 1,
    amount: 860,
    source: { label: '库存 · 盘点单', kind: 'document', to: '/inventory' },
    summary: '月度抽盘完成，盘盈 3 件包装耗材。',
    fields: [
      { field: '盘点结果', before: '待录入', after: '已提交' },
      { field: '差异数量', before: '—', after: '+3 件' }
    ]
  }),
  createAuditRecord({
    id: 'chg-2026-1110-12',
    workspaceId: 'ws-hq',
    service: 'change',
    scope: 'warehouse',
    entity: '仓库 · 深圳中转仓',
    documentNo: 'WH-2026-005',
    operation: 'disable',
    actor: '周雨桐',
    actorTitle: '系统管理员',
    at: '2026-11-10 09:15',
    version: 2,
    source: { label: '库存 · 仓库设置', kind: 'document', to: '/inventory' },
    summary: '租约到期，深圳中转仓停用并归并至上海主仓。',
    fields: [
      { field: '仓库状态', before: '启用', after: '停用' },
      { field: '停用原因', before: '—', after: '租约到期，业务并回上海主仓' }
    ]
  }),
  createAuditRecord({
    id: 'chg-2026-1024-13',
    workspaceId: 'ws-hq',
    service: 'change',
    scope: 'voucher',
    entity: '凭证 · 销售成本结转',
    documentNo: 'PV-2026-1024',
    operation: 'post',
    actor: '陈立',
    actorTitle: '财务负责人',
    at: '2026-10-24 18:10',
    version: 2,
    amount: 152000,
    source: { label: '财务 · 凭证明细', kind: 'document', to: '/finance?tab=gl&bill=PV-2026-1024' },
    summary: '10 月销售成本结转凭证过账。',
    fields: [
      { field: '凭证状态', before: '待过账', after: '已过账' }
    ]
  }),

  // 其他工作区（用于工作区切换空态演示）
  createAuditRecord({
    id: 'org-2026-1024-08',
    workspaceId: 'ws-south',
    service: 'organization',
    entity: '成员 · 林嘉怡',
    documentNo: 'USR-2026-0121',
    operation: 'invite',
    actor: '周雨桐',
    actorTitle: '系统管理员',
    at: '2026-10-24 10:40',
    version: 1,
    source: { label: '设置 · 邀请成员', kind: 'settings', to: '/settings?tab=invitations' },
    summary: '邀请林嘉怡加入华南采购中心。',
    fields: [
      { field: '邀请状态', before: '未邀请', after: '已接受' }
    ]
  }),
  createAuditRecord({
    id: 'pur-2026-1114-08',
    workspaceId: 'ws-south',
    service: 'purchase',
    entity: '采购订单 · 深圳华南供应商',
    documentNo: 'PO-2026-0512',
    operation: 'submit',
    actor: '林嘉怡',
    actorTitle: '采购专员',
    at: '2026-11-14 09:30',
    version: 2,
    amount: 76500,
    source: { label: '采购订单详情', kind: 'document', to: '/purchase-orders?order=PO-2026-0512' },
    summary: '华南采购中心补充采购订单提交审批。',
    fields: [
      { field: '单据状态', before: '草稿', after: '待审批' }
    ]
  })
]

export const auditQuickEntries: AuditQuickEntry[] = [
  {
    key: 'workbench',
    label: '工作台最近动态',
    description: '商品 SKU-1001 售价调整',
    service: 'change',
    recordId: 'chg-2026-1119-01',
    icon: 'i-carbon-dashboard'
  },
  {
    key: 'purchase-order',
    label: '采购单 PO-2026-0518',
    description: '采购订单详情的审批审计',
    service: 'purchase',
    recordId: 'pur-2026-1118-02',
    icon: 'i-carbon-document'
  },
  {
    key: 'settings',
    label: '设置 · 审计入口',
    description: '角色权限调整记录（仅管理员）',
    service: 'organization',
    recordId: 'org-2026-1119-01',
    icon: 'i-carbon-settings'
  }
]

const serviceDeniedReasons: Record<Exclude<AuditRoleKey, 'admin'>, Partial<Record<AuditServiceKey, string>>> = {
  finance: {
    organization: '组织审计涉及角色授权、成员邀请与工作区设置，需要 settings.manage 权限；当前财务身份未获授权。',
    purchase: '采购审计涉及供应商报价、采购审批与收货链路，需要 purchase.approve 权限；当前财务身份未获授权。',
    sales: '销售审计涉及报价审批、订单履约与开票链路，需要 sales.view 权限；当前财务身份未获授权。'
  },
  purchase: {
    organization: '组织审计涉及角色授权、成员邀请与工作区设置，需要 settings.manage 权限；当前采购身份未获授权。',
    finance: '财务审计涉及凭证过账/冲销、银行对账与期间结账，需要 finance.view 权限；当前采购身份未获授权。',
    sales: '销售审计涉及报价审批、订单履约与开票链路，需要 sales.view 权限；当前采购身份未获授权。'
  }
}

const scopeDeniedReasons: Record<AuditChangeScope, string> = {
  voucher: '凭证过账与冲销属于财务审计范围，需要 finance.view 权限；当前采购身份已隐藏该类记录。',
  warehouse: '仓库启用与停用属于库存管理范围，需要 inventory.adjust 权限；当前财务身份已隐藏该类记录。',
  transfer: '库存调拨过账需要 inventory.adjust 权限；当前财务身份已隐藏该类记录。',
  stocktake: '盘点差异确认需要 inventory.adjust 权限；当前财务身份已隐藏该类记录。',
  product: '商品主数据变更需要 catalog.view 权限；当前身份未获授权。',
  partner: '伙伴主数据变更需要 catalog.view 权限；当前身份未获授权。'
}

export function getAuditRole(key: AuditRoleKey): AuditRole {
  return auditRoles.find(role => role.key === key) ?? (auditRoles[0] as AuditRole)
}

export function canViewAuditService(key: AuditRoleKey, service: AuditServiceKey): boolean {
  return getAuditRole(key).services.includes(service)
}

export function canViewAuditScope(key: AuditRoleKey, scope: AuditChangeScope): boolean {
  return getAuditRole(key).changeScopes.includes(scope)
}

export function getAuditServiceDeniedReason(key: AuditRoleKey, service: AuditServiceKey): string {
  if (canViewAuditService(key, service)) return ''
  if (key === 'admin') return ''
  return serviceDeniedReasons[key][service] ?? '当前演示身份未被授予该服务的审计查看权限。'
}

export function getAuditScopeDeniedReason(key: AuditRoleKey, scope: AuditChangeScope): string {
  if (canViewAuditScope(key, scope)) return ''
  return scopeDeniedReasons[scope]
}

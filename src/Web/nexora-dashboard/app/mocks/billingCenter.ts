/**
 * C21 计费中心演示数据：套餐目录、工作区订阅种子、账单历史、模块权益与测试结账。
 * 纯 UI 演示，所有写操作只改本地状态；刷新页面后恢复种子。
 */

export type BillingCycle = 'monthly' | 'annual'
export type BillingInvoiceStatus = 'paid' | 'pending' | 'processing' | 'failed'
export type BillingPaymentMethod = 'test-card' | 'manual' | 'credit'
export type BillingEntitlementState = 'ok' | 'warning' | 'exceeded' | 'blocked'
export type BillingCardBehavior = 'success' | 'processing' | 'failed'

/** 演示环境固定「今天」，与工作区种子日期对齐，保证剩余天数与报价可复现。 */
export const BILLING_DEMO_TODAY = '2026-11-19'

export interface BillingCenterPlan {
  id: string
  name: string
  tier: 'basic' | 'pro' | 'enterprise'
  description: string
  monthlyPrice: number
  annualPrice: number
  seatLimit: number
  storageLimitGb: number
  invoiceLimit: number
  features: string[]
  recommended?: boolean
}

export interface BillingPlanLimit {
  text: string
  quota: number | null
  included: boolean
}

export interface BillingModuleDefinition {
  key: string
  name: string
  unit: string
  memberPermission: string
  limits: Record<string, BillingPlanLimit>
}

export interface BillingCenterInvoice {
  id: string
  workspaceId: string
  number: string
  planId: string
  cycle: BillingCycle
  status: BillingInvoiceStatus
  amount: number
  credit: number
  createdAt: string
  dueAt: string
  paidAt?: string
  paymentMethod?: BillingPaymentMethod
  reference?: string
  cardLabel?: string
  failureReason?: string
  note?: string
}

export interface BillingSchedule {
  planId: string
  effectiveAt: string
}

export interface BillingCenterSeed {
  workspaceId: string
  planId: string
  cycle: BillingCycle
  status: 'active' | 'cancelled'
  periodStart: string
  periodEnd: string
  /** 当前套餐实际生效时间。 */
  effectiveAt: string
  scheduled: BillingSchedule | null
  seatsUsed: number
  storageUsedGb: number
  invoicesUsed: number
  usage: Record<string, number>
  invoices: BillingCenterInvoice[]
}

export interface BillingEntitlementRow {
  key: string
  module: string
  planLimit: string
  memberPermission: string
  usageText: string
  usage: number
  quota: number | null
  percent: number | null
  state: BillingEntitlementState
}

export interface BillingTestCard {
  id: BillingCardBehavior
  behavior: BillingCardBehavior
  brand: string
  number: string
  expiry: string
  title: string
  description: string
}

export interface BillingQuote {
  workspaceId: string
  currentPlanId: string
  currentCycle: BillingCycle
  targetPlanId: string
  targetCycle: BillingCycle
  remainingDays: number
  periodEnd: string
  charge: number
  credit: number
  amountDue: number
  creditRemainder: number
  effectiveAt: string
  newPeriodStart: string
  newPeriodEnd: string
  generatedAt: string
  revision: string
}

/** 三个 SaaS 套餐，与现有 billingPlans 的价格一致，价格按「基础 / 专业 / 企业」分层。 */
export const billingCenterPlans: BillingCenterPlan[] = [
  {
    id: 'plan-standard',
    name: '基础版',
    tier: 'basic',
    description: '适合 10 人以内的小团队起步',
    monthlyPrice: 299,
    annualPrice: 2990,
    seatLimit: 10,
    storageLimitGb: 20,
    invoiceLimit: 200,
    features: ['商品与往来单位管理', '采购与销售单据', '基础库存流水', '标准报表与月度导出']
  },
  {
    id: 'plan-pro',
    name: '专业版',
    tier: 'pro',
    description: '适合有财务与多仓需求的成长型团队',
    monthlyPrice: 899,
    annualPrice: 8990,
    seatLimit: 50,
    storageLimitGb: 100,
    invoiceLimit: 2000,
    features: ['基础版全部能力', '财务总账与报表', '多仓库与调拨', '2 级审批与 180 天审计留痕', 'CSV 批量导入导出'],
    recommended: true
  },
  {
    id: 'plan-enterprise',
    name: '企业版',
    tier: 'enterprise',
    description: '适合多组织、多工作区协同',
    monthlyPrice: 1999,
    annualPrice: 19990,
    seatLimit: 200,
    storageLimitGb: 500,
    invoiceLimit: 10000,
    features: ['专业版全部能力', '多工作区与部门权限', '自定义报表与不限导出', '3 级审批与 3 年审计留痕', 'AI 助手与专属客户成功']
  }
]

/** 模块权益定义：套餐限制与成员权限分开描述，限额随套餐变化。 */
export const billingCenterModules: BillingModuleDefinition[] = [
  {
    key: 'catalog',
    name: '商品与目录',
    unit: '个',
    memberPermission: '采购与销售可编辑，仓管只读',
    limits: {
      'plan-standard': { text: '500 个商品档案', quota: 500, included: true },
      'plan-pro': { text: '5,000 个商品档案', quota: 5000, included: true },
      'plan-enterprise': { text: '不限商品档案', quota: null, included: true }
    }
  },
  {
    key: 'purchase',
    name: '采购管理',
    unit: '张',
    memberPermission: '采购员可创建，采购经理可审批',
    limits: {
      'plan-standard': { text: '每月 100 张采购单', quota: 100, included: true },
      'plan-pro': { text: '每月 300 张采购单', quota: 300, included: true },
      'plan-enterprise': { text: '每月 2,000 张采购单', quota: 2000, included: true }
    }
  },
  {
    key: 'sales',
    name: '销售管理',
    unit: '张',
    memberPermission: '销售可创建，财务可开票',
    limits: {
      'plan-standard': { text: '每月 200 张销售单', quota: 200, included: true },
      'plan-pro': { text: '每月 500 张销售单', quota: 500, included: true },
      'plan-enterprise': { text: '每月 5,000 张销售单', quota: 5000, included: true }
    }
  },
  {
    key: 'inventory',
    name: '库存管理',
    unit: '条',
    memberPermission: '仓管可收发与调拨，财务只读',
    limits: {
      'plan-standard': { text: '1 个仓库 · 500 条流水', quota: 500, included: true },
      'plan-pro': { text: '3 个仓库 · 2,000 条流水', quota: 2000, included: true },
      'plan-enterprise': { text: '不限仓库 · 20,000 条流水', quota: 20000, included: true }
    }
  },
  {
    key: 'finance',
    name: '财务总账',
    unit: '行',
    memberPermission: '会计可记账，出纳只读（双人复核）',
    limits: {
      'plan-standard': { text: '不含总账（仅收支登记）', quota: null, included: false },
      'plan-pro': { text: '每月 3,000 行凭证', quota: 3000, included: true },
      'plan-enterprise': { text: '每月 20,000 行凭证', quota: 20000, included: true }
    }
  },
  {
    key: 'reports',
    name: '报表与导出',
    unit: '次',
    memberPermission: '管理层可查看并导出，其他成员只读',
    limits: {
      'plan-standard': { text: '标准报表 · 每月 5 次导出', quota: 5, included: true },
      'plan-pro': { text: '全部标准报表 · CSV 导出', quota: null, included: true },
      'plan-enterprise': { text: '自定义报表 · 不限导出', quota: null, included: true }
    }
  },
  {
    key: 'audit',
    name: '审批与审计',
    unit: '天',
    memberPermission: '仅工作区所有者可配置审批流',
    limits: {
      'plan-standard': { text: '1 级审批 · 留痕 30 天', quota: 30, included: true },
      'plan-pro': { text: '2 级审批 · 留痕 180 天', quota: 180, included: true },
      'plan-enterprise': { text: '3 级审批 · 留痕 3 年', quota: 1095, included: true }
    }
  },
  {
    key: 'assistant',
    name: 'AI 助手',
    unit: '次',
    memberPermission: '企业版成员可用，其他套餐只读示例',
    limits: {
      'plan-standard': { text: '不含 AI 助手', quota: null, included: false },
      'plan-pro': { text: '每月 200 次', quota: 200, included: true },
      'plan-enterprise': { text: '每月 2,000 次', quota: 2000, included: true }
    }
  }
]

export const billingTestCards: BillingTestCard[] = [
  {
    id: 'success',
    behavior: 'success',
    brand: 'Visa 测试卡',
    number: '4242 4242 4242 4242',
    expiry: '12/30',
    title: '支付成功',
    description: '发卡行即时批准，账单结清并立即切换套餐。'
  },
  {
    id: 'processing',
    behavior: 'processing',
    brand: 'Visa 3DS 测试卡',
    number: '4000 0000 0000 3220',
    expiry: '12/30',
    title: '处理中（需额外验证）',
    description: '模拟 3DS 验证未完成，账单保留未完成状态，可稍后继续支付。'
  },
  {
    id: 'failed',
    behavior: 'failed',
    brand: 'Visa 拒付测试卡',
    number: '4000 0000 0000 0002',
    expiry: '12/30',
    title: '支付失败',
    description: '发卡行拒绝，账单标记失败，可更换卡片重试。'
  }
]

export const billingCycleLabels: Record<BillingCycle, string> = {
  monthly: '按月',
  annual: '按年'
}

export const billingInvoiceStatusLabels: Record<BillingInvoiceStatus, string> = {
  paid: '已支付',
  pending: '待支付',
  processing: '处理中',
  failed: '支付失败'
}

export const billingInvoiceStatusColors: Record<BillingInvoiceStatus, 'success' | 'warning' | 'info' | 'error'> = {
  paid: 'success',
  pending: 'warning',
  processing: 'info',
  failed: 'error'
}

export const billingEntitlementStateLabels: Record<BillingEntitlementState, string> = {
  ok: '正常',
  warning: '接近限额',
  exceeded: '已超限',
  blocked: '未包含'
}

export const billingEntitlementStateColors: Record<BillingEntitlementState, 'success' | 'warning' | 'error' | 'neutral'> = {
  ok: 'success',
  warning: 'warning',
  exceeded: 'error',
  blocked: 'neutral'
}

let invoiceSequence = 10

/** 纯函数：生成新的账单号，保证同一演示会话内不重复。 */
export function nextBillingInvoiceNumber() {
  const number = 'BILL-2026-' + String(invoiceSequence).padStart(4, '0')
  invoiceSequence += 1
  return number
}

export function billingPlanById(planId: string): BillingCenterPlan {
  return billingCenterPlans.find(plan => plan.id === planId) ?? billingCenterPlans[0]!
}

export function billingPlanPrice(plan: BillingCenterPlan, cycle: BillingCycle) {
  return cycle === 'annual' ? plan.annualPrice : plan.monthlyPrice
}

export function billingCycleDays(cycle: BillingCycle) {
  return cycle === 'annual' ? 365 : 30
}

export function billingRoundMoney(value: number) {
  return Math.round(value * 100) / 100
}

export function billingDaysBetween(from: string, to: string) {
  const start = Date.parse(from + 'T00:00:00Z')
  const end = Date.parse(to + 'T00:00:00Z')
  if (Number.isNaN(start) || Number.isNaN(end)) return 0
  return Math.max(0, Math.round((end - start) / 86400000))
}

export function billingAddDays(date: string, days: number) {
  const value = new Date(date + 'T00:00:00Z')
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}

function formatUsageNumber(value: number) {
  return new Intl.NumberFormat('zh-CN').format(value)
}

/** 按当前套餐与用量生成模块权益行，套餐限制和成员权限分别返回。 */
export function buildBillingEntitlementRows(planId: string, usage: Record<string, number>): BillingEntitlementRow[] {
  return billingCenterModules.map((module) => {
    const limit = module.limits[planId] ?? { text: '未配置', quota: null, included: false }
    const used = usage[module.key] ?? 0
    const quota = limit.quota
    const percent = limit.included && quota !== null && quota > 0
      ? Math.min(100, Math.round((used / quota) * 100))
      : null
    let state: BillingEntitlementState = 'ok'
    if (!limit.included) state = 'blocked'
    else if (percent !== null && used >= (quota ?? 0)) state = 'exceeded'
    else if (percent !== null && percent >= 85) state = 'warning'

    const usageText = !limit.included
      ? '未启用'
      : quota === null
        ? formatUsageNumber(used) + ' ' + module.unit + '（不限）'
        : formatUsageNumber(used) + ' / ' + formatUsageNumber(quota) + ' ' + module.unit

    return {
      key: module.key,
      module: module.name,
      planLimit: limit.text,
      memberPermission: module.memberPermission,
      usageText,
      usage: used,
      quota,
      percent,
      state
    }
  })
}

function invoice(
  workspaceId: string,
  seed: Omit<BillingCenterInvoice, 'workspaceId' | 'amount' | 'credit'> & { amount: number, credit?: number }
): BillingCenterInvoice {
  return { workspaceId, credit: 0, ...seed }
}

/** 每个工作区的订阅、用量、账单与模块用量种子；至少两个工作区套餐与用量不同。 */
export const billingCenterSeeds: Record<string, BillingCenterSeed> = {
  'ws-hq': {
    workspaceId: 'ws-hq',
    planId: 'plan-pro',
    cycle: 'annual',
    status: 'active',
    periodStart: '2025-12-08',
    periodEnd: '2026-12-07',
    effectiveAt: '2025-12-08',
    scheduled: { planId: 'plan-enterprise', effectiveAt: '2026-12-08' },
    seatsUsed: 12,
    storageUsedGb: 38.6,
    invoicesUsed: 486,
    usage: {
      catalog: 2860,
      purchase: 186,
      sales: 512,
      inventory: 742,
      finance: 2680,
      reports: 12,
      audit: 146,
      assistant: 176
    },
    invoices: [
      invoice('ws-hq', {
        id: 'binv-hq-0001',
        number: 'BILL-2026-0003',
        planId: 'plan-pro',
        cycle: 'annual',
        status: 'paid',
        amount: 8990,
        createdAt: '2025-12-08',
        dueAt: '2025-12-08',
        paidAt: '2025-12-08',
        paymentMethod: 'manual',
        reference: 'BANK-20251208-67301',
        note: '专业版年费（2025-12-08 至 2026-12-07）'
      }),
      invoice('ws-hq', {
        id: 'binv-hq-0002',
        number: 'BILL-2026-0007',
        planId: 'plan-enterprise',
        cycle: 'annual',
        status: 'failed',
        amount: 542.47,
        credit: 443.34,
        createdAt: '2026-10-20',
        dueAt: '2026-10-27',
        cardLabel: 'Visa 拒付测试卡 尾号 0002',
        failureReason: '发卡行拒绝（测试卡 4000 0000 0000 0002）',
        note: '升级企业版按比例差额（支付失败）'
      }),
      invoice('ws-hq', {
        id: 'binv-hq-0003',
        number: 'BILL-2026-0009',
        planId: 'plan-enterprise',
        cycle: 'annual',
        status: 'pending',
        amount: 542.47,
        credit: 443.34,
        createdAt: '2026-11-19',
        dueAt: '2026-11-26',
        note: '升级企业版按比例差额（待支付，剩余 18 天周期）'
      })
    ]
  },
  'ws-south': {
    workspaceId: 'ws-south',
    planId: 'plan-standard',
    cycle: 'annual',
    status: 'active',
    periodStart: '2026-08-15',
    periodEnd: '2027-08-14',
    effectiveAt: '2026-08-15',
    scheduled: null,
    seatsUsed: 8,
    storageUsedGb: 11.2,
    invoicesUsed: 132,
    usage: {
      catalog: 486,
      purchase: 88,
      sales: 176,
      inventory: 312,
      finance: 0,
      reports: 4,
      audit: 28,
      assistant: 0
    },
    invoices: [
      invoice('ws-south', {
        id: 'binv-south-0001',
        number: 'BILL-2026-0005',
        planId: 'plan-standard',
        cycle: 'annual',
        status: 'paid',
        amount: 2990,
        createdAt: '2026-08-15',
        dueAt: '2026-08-15',
        paidAt: '2026-08-15',
        paymentMethod: 'manual',
        reference: 'BANK-20260815-44820',
        note: '基础版年费（2026-08-15 至 2027-08-14）'
      }),
      invoice('ws-south', {
        id: 'binv-south-0002',
        number: 'BILL-2026-0008',
        planId: 'plan-pro',
        cycle: 'annual',
        status: 'pending',
        amount: 4404.87,
        credit: 2195.4,
        createdAt: '2026-11-19',
        dueAt: '2026-11-26',
        note: '升级专业版按比例差额（剩余 268 天周期）'
      })
    ]
  },
  'ws-retail': {
    workspaceId: 'ws-retail',
    planId: 'plan-enterprise',
    cycle: 'annual',
    status: 'active',
    periodStart: '2026-01-01',
    periodEnd: '2027-01-01',
    effectiveAt: '2026-01-01',
    scheduled: null,
    seatsUsed: 26,
    storageUsedGb: 184.4,
    invoicesUsed: 2140,
    usage: {
      catalog: 8200,
      purchase: 1420,
      sales: 3320,
      inventory: 8400,
      finance: 12600,
      reports: 38,
      audit: 322,
      assistant: 420
    },
    invoices: [
      invoice('ws-retail', {
        id: 'binv-retail-0001',
        number: 'BILL-2026-0001',
        planId: 'plan-enterprise',
        cycle: 'annual',
        status: 'paid',
        amount: 19990,
        createdAt: '2026-01-01',
        dueAt: '2026-01-01',
        paidAt: '2026-01-01',
        paymentMethod: 'manual',
        reference: 'BANK-20260101-10293',
        note: '企业版年费（2026-01-01 至 2026-12-31）'
      }),
      invoice('ws-retail', {
        id: 'binv-retail-0002',
        number: 'BILL-2026-0002',
        planId: 'plan-enterprise',
        cycle: 'annual',
        status: 'paid',
        amount: 4000,
        createdAt: '2026-09-01',
        dueAt: '2026-09-01',
        paidAt: '2026-09-01',
        paymentMethod: 'manual',
        reference: 'BANK-20260901-55210',
        note: '企业版增购 20 个席位（年付）'
      }),
      invoice('ws-retail', {
        id: 'binv-retail-0003',
        number: 'BILL-2026-0006',
        planId: 'plan-enterprise',
        cycle: 'annual',
        status: 'pending',
        amount: 19990,
        createdAt: '2026-11-18',
        dueAt: '2026-12-18',
        note: '企业版年费续费（提前支付）'
      })
    ]
  }
}

/** 每次挂载或显式重置时使用的深拷贝种子，避免直接改到 mocks 常量。 */
export function createBillingCenterSeedState(): Record<string, BillingCenterSeed> {
  return Object.fromEntries(Object.entries(billingCenterSeeds).map(([workspaceId, seed]) => [
    workspaceId,
    {
      ...seed,
      scheduled: seed.scheduled ? { ...seed.scheduled } : null,
      usage: { ...seed.usage },
      invoices: seed.invoices.map(item => ({ ...item }))
    }
  ]))
}

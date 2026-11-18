import type { BillingPlan, WorkspaceSubscription } from './types'

/** 三个 SaaS 套餐，纯 UI 演示，不产生真实扣费。 */
export const billingPlans: BillingPlan[] = [
  {
    id: 'plan-standard',
    name: '标准版',
    description: '适合 10 人以内的小团队起步',
    monthlyPrice: 299,
    annualPrice: 2990,
    seatLimit: 10,
    storageLimitGb: 20,
    invoiceLimit: 200,
    features: ['商品与往来单位管理', '采购与销售单据', '基础库存流水', '月度报表导出']
  },
  {
    id: 'plan-pro',
    name: '专业版',
    description: '适合有财务与多仓需求的成长型团队',
    monthlyPrice: 899,
    annualPrice: 8990,
    seatLimit: 50,
    storageLimitGb: 100,
    invoiceLimit: 2000,
    features: ['标准版全部能力', '财务总账与报表', '多仓库与调拨', '审批流与审计日志', 'CSV 批量导入导出'],
    recommended: true
  },
  {
    id: 'plan-enterprise',
    name: '企业版',
    description: '适合多组织、多工作区协同',
    monthlyPrice: 1999,
    annualPrice: 19990,
    seatLimit: 200,
    storageLimitGb: 500,
    invoiceLimit: 10000,
    features: ['专业版全部能力', '多工作区与部门权限', '专属客户成功', 'SLA 与审计留痕', '自定义发票模板']
  }
]

export const subscriptionStatusLabels: Record<WorkspaceSubscription['status'], string> = {
  active: '生效中',
  cancelled: '已取消'
}

/** 每个工作区的订阅与用量（与 workspace id 对齐）。 */
export const workspaceSubscriptions: Record<string, WorkspaceSubscription> = {
  'ws-hq': {
    workspaceId: 'ws-hq',
    planId: 'plan-pro',
    status: 'active',
    seatsUsed: 12,
    storageUsedGb: 38.6,
    invoicesUsed: 486,
    renewsAt: '2026-12-01',
    startedAt: '2026-06-01'
  },
  'ws-south': {
    workspaceId: 'ws-south',
    planId: 'plan-standard',
    status: 'active',
    seatsUsed: 8,
    storageUsedGb: 11.2,
    invoicesUsed: 132,
    renewsAt: '2026-12-01',
    startedAt: '2026-08-15'
  },
  'ws-retail': {
    workspaceId: 'ws-retail',
    planId: 'plan-enterprise',
    status: 'active',
    seatsUsed: 26,
    storageUsedGb: 184.4,
    invoicesUsed: 2140,
    renewsAt: '2027-01-01',
    startedAt: '2026-01-01'
  }
}

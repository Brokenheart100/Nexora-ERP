export interface PlanLimits {
  workspaces: number
  members: number
  documentsPerMonth: number
}

export interface BillingPlan {
  code: string
  name: string
  monthlyPriceCents: number
  currency: string
  limits: PlanLimits
  modules: string[]
}

export interface BillingUsage {
  workspaces: number
  workspacesLimit: number
  members: number
  membersLimit: number
  documentsThisMonth: number
  documentsLimit: number
  period: string
}

export interface BillingEntitlements {
  workspaceId: string
  planCode: string
  planName: string
  status: string
  effectivePlanCode: string
  modules: string[]
  warnings: string[]
  usage: BillingUsage
  periodEndUtc: string | null
}

export interface BillingSubscription {
  workspaceId: string
  planCode: string
  status: string
  effectivePlanCode: string
  periodStartUtc: string | null
  periodEndUtc: string | null
  version: number
  usage: BillingUsage
}

export interface BillingInvoice {
  id: string
  planCode: string
  status: string
  amountCents: number
  currency: string
  paymentReference: string | null
  issuedAtUtc: string
  paidAtUtc: string | null
}

export interface WorkspaceBillingView {
  workspaceId: string
  subscription: BillingSubscription
  invoices: BillingInvoice[]
  plans: BillingPlan[]
  canManage: boolean
}

export interface BillingPlanQuote {
  planCode: string
  planName: string
  monthlyPriceCents: number
  currency: string
  currentPlanCode: string
  currentPlanName: string
  subscriptionStatus: string
  prorated: boolean
  chargeCents: number
  creditCents: number
  amountDueCents: number
  remainingDays: number
  effectiveAtUtc: string
  periodEndUtc: string
}

export interface PublicPlan extends BillingPlan {
  summary: string
  recommended?: boolean
}

export const publicPlans: PublicPlan[] = [
  {
    code: 'free',
    name: '免费版',
    monthlyPriceCents: 0,
    currency: 'CNY',
    limits: { workspaces: 1, members: 3, documentsPerMonth: 500 },
    modules: ['company', 'book', 'reports', 'aging', 'partners', 'catalog'],
    summary: '适合个人与刚起步的小团队，先跑通公司设置、账簿和基础报表。',
  },
  {
    code: 'standard',
    name: '标准版',
    monthlyPriceCents: 9900,
    currency: 'CNY',
    limits: { workspaces: 10, members: 50, documentsPerMonth: 20000 },
    modules: ['company', 'book', 'reports', 'aging', 'partners', 'catalog', 'inventory', 'purchasing', 'sales'],
    summary: '适合有采购、销售和库存协作的成长型团队。',
    recommended: true,
  },
  {
    code: 'pro',
    name: '专业版',
    monthlyPriceCents: 29900,
    currency: 'CNY',
    limits: { workspaces: 1000, members: 500, documentsPerMonth: 1000000 },
    modules: ['company', 'book', 'reports', 'aging', 'partners', 'catalog', 'inventory', 'purchasing', 'sales', 'receivables', 'audit', 'assistant'],
    summary: '适合需要应收、审计与 AI 助手的完整财务团队。',
  },
]

export function signupPlanCode(value: unknown): string | null {
  return typeof value === 'string' && publicPlans.some(plan => plan.code === value) ? value : null
}

export function quoteIsZeroDue(quote: BillingPlanQuote): boolean {
  return quote.amountDueCents <= 0
}

export interface DocumentReservation {
  workspaceId: string
  operationId: string
  count: number
  documentsThisMonth: number
  documentsLimit: number
  replayed: boolean
}

const statusLabels: Record<string, string> = {
  active: '活跃',
  trial: '试用中',
  past_due: '已逾期',
  canceled: '已取消',
}

const invoiceLabels: Record<string, string> = {
  pending: '待支付',
  paid: '已支付',
  void: '已作废',
}

const warningLabels: Record<string, string> = {
  'subscription.past_due': '订阅已逾期，请尽快登记付款以恢复完整权益。',
  'subscription.trial_ending': '试用即将结束，请选择套餐并登记付款。',
  'workspaces.limit_reached': '已达到套餐的工作区数量上限。',
  'members.limit_reached': '已达到套餐的成员席位上限。',
  'documents.limit_reached': '已达到本月单据数量上限。',
}

const planNames: Record<string, string> = {
  free: '免费版',
  standard: '标准版',
  pro: '专业版',
}

export function billingStatusLabel(status: string): string {
  return statusLabels[status] ?? status
}

export function invoiceStatusLabel(status: string): string {
  return invoiceLabels[status] ?? status
}

export function billingWarningLabel(warning: string): string {
  return warningLabels[warning] ?? warning
}

export function planLabel(planCode: string): string {
  return planNames[planCode] ?? planCode
}

export function formatBillingAmount(cents: number, currency = 'CNY'): string {
  const value = (Math.max(0, Math.round(cents)) / 100).toFixed(2)
  return currency === 'CNY' ? '¥' + value : currency + ' ' + value
}

export function usageRatio(used: number, limit: number): number {
  if (!Number.isFinite(limit) || limit <= 0) return used > 0 ? 1 : 0
  const ratio = used / limit
  if (!Number.isFinite(ratio) || ratio < 0) return 0
  return Math.min(1, ratio)
}

export function moduleAllowed(entitlements: BillingEntitlements | null, moduleKey: string): boolean {
  if (!entitlements) return true
  return entitlements.modules.includes(moduleKey)
}

export function canSelectPlan(planCode: string, subscription: BillingSubscription | null): boolean {
  if (!subscription) return true
  return !(subscription.planCode === planCode && subscription.status !== 'canceled')
}

export function isCurrentPlan(planCode: string, subscription: BillingSubscription | null): boolean {
  if (!subscription) return planCode === 'free'
  return subscription.effectivePlanCode === planCode && subscription.status !== 'canceled'
}

export interface ReadinessCheck {
  code: string
  severity: string
  count: number
  message: string
}

export interface ReadinessBook {
  exists: boolean
  currency: string
  minorUnits: number
  startsOn: string | null
  lastPostingNumber: number
  opening: string
  hasPostings: boolean
}

export interface ReadinessDocument {
  id: string
  kind: string
  number: string
  on: string
  amount: string
}

export interface PendingCost {
  id: string
  on: string
  kind: string
  amount: string
  reason: string
}

export interface ReadinessView {
  ready: boolean
  book: ReadinessBook
  checks: ReadinessCheck[]
  missingDocuments: ReadinessDocument[]
  missingDocumentCount: number
  pendingCosts: PendingCost[]
  pendingCostCount: number
  generatedAt: string
}

export interface BackfilledCost {
  id: string
  on: string
  amount: string
  journalId: string | null
}

export interface BlockedCost {
  id: string
  on: string
  amount: string
  reason: string
}

export interface BackfillResult {
  posted: BackfilledCost[]
  blocked: BlockedCost[]
  replayed: boolean
  readiness: ReadinessView
}

export const readinessCheckLabels: Record<string, string> = {
  'book.missing': '账簿未初始化',
  'book.opening': '期初余额',
  'documents.posted_without_journal': '单据已过账但缺少分录',
  'costs.pending_accrual': '库存成本未入账',
}

export const readinessSeverityLabels: Record<string, string> = {
  pass: '通过',
  warn: '待完善',
  fail: '需处理',
}

export const openingLabels: Record<string, string> = {
  none: '未开始',
  missing: '未录入',
  pending: '待过账',
  posted: '已过账',
}

export const costKindLabels: Record<string, string> = {
  receipt: '采购入库',
  shipment: '销售出库',
  stock: '库存调整',
}

export function checkLabel(code: string): string {
  return readinessCheckLabels[code] ?? code
}

export function severityLabel(severity: string): string {
  return readinessSeverityLabels[severity] ?? severity
}

export function openingLabel(opening: string): string {
  return openingLabels[opening] ?? opening
}

export function costKindLabel(kind: string): string {
  return costKindLabels[kind] ?? kind
}

export function readinessSummary(ready: boolean, missingDocuments: number, pendingCosts: number): string {
  if (ready) return '就绪：可以继续启用财务过账。'
  const parts: string[] = []
  if (missingDocuments > 0) parts.push('已过账单据缺少分录 ' + missingDocuments + ' 项')
  if (pendingCosts > 0) parts.push('库存成本未入账 ' + pendingCosts + ' 项')
  return parts.length > 0 ? '未就绪：' + parts.join('，') + '。' : '未就绪：请先处理检查项。'
}

// 纯 UI 阶段共用的模拟数据类型。

export interface Workspace {
  id: string
  name: string
  plan: string
  members: number
  pendingTasks: number
  monthlyPurchase: number[]
  /** 月度销售额与应收余额（万元），用于工作台趋势演示。 */
  monthlySales: number[]
  monthlyReceivables: number[]
  trendPct: number
  updatedAt: string
}

export type ProductStatus = 'active' | 'draft' | 'archived'
export type OrderStatus = 'draft' | 'pending' | 'approved' | 'partial' | 'received' | 'closed' | 'cancelled'

export type ProductTracking = 'none' | 'batch' | 'serial'

export interface Product {
  id: string
  sku: string
  name: string
  category: string
  unit: string
  price: number
  stock: number
  status: ProductStatus
  updatedAt: string
  brand?: string
  barcode?: string
  spec?: string
  tracking?: ProductTracking
  taxRate?: string
}

export interface PurchaseOrderLine {
  lineNo: number
  sku: string
  name: string
  spec: string
  quantity: number
  received: number
  unitPrice: number
}

export interface PurchaseOrder {
  id: string
  workspaceId: string
  supplier: string
  contact: string
  status: OrderStatus
  orderedAt: string
  expectedAt: string
  note: string
  lines: PurchaseOrderLine[]
  /** 审批轨迹（B4 本地演示）。 */
  approvals?: PurchaseApprovalStep[]
  /** 收货记录（B4 本地演示）。 */
  receipts?: PurchaseReceipt[]
  /** 单据审计记录（B4 本地演示）。 */
  audit?: PurchaseAuditEntry[]
}

export type PurchaseApprovalAction = 'submitted' | 'approved' | 'rejected'

export interface PurchaseApprovalStep {
  id: string
  orderId: string
  action: PurchaseApprovalAction
  actor: string
  at: string
  note: string
}

export interface PurchaseReceiptLine {
  lineNo: number
  sku: string
  name: string
  quantity: number
}

export interface PurchaseReceipt {
  id: string
  orderId: string
  receivedAt: string
  receiver: string
  lines: PurchaseReceiptLine[]
}

export interface PurchaseAuditEntry {
  id: string
  orderId: string
  action: string
  actor: string
  at: string
  detail: string
}

export type SupplierBillStatus = 'pending' | 'posted' | 'cancelled'

/** 供应商账单的一行：对应某张收货单的可匹配明细。 */
export interface SupplierBillLine {
  id: string
  receiptId: string
  receiptLineNo: number
  orderLineNo: number
  sku: string
  name: string
  quantity: number
  /** 供应商账单单价（含价差）。 */
  unitPrice: number
  /** 采购订单/暂估单价，用于计算价差。 */
  accrualUnitPrice: number
  net: number
  tax: number
  total: number
  /** (unitPrice - accrualUnitPrice) × quantity。 */
  variance: number
}

export interface SupplierBill {
  id: string
  workspaceId: string
  supplier: string
  orderId: string
  receiptIds: string[]
  date: string
  dueAt: string
  status: SupplierBillStatus
  lines: SupplierBillLine[]
  net: number
  tax: number
  total: number
  note?: string
  journalId?: string
  reviewer?: string
  reviewedAt?: string
}

export interface SupplierPayment {
  id: string
  workspaceId: string
  billId: string
  date: string
  amount: number
  bankAccountId: string
  bankName: string
  method: 'transfer' | 'cheque' | 'cash'
  reference: string
  note?: string
}

export interface SupplierCredit {
  id: string
  workspaceId: string
  billId: string
  orderId: string
  receiptId: string
  receiptLineNo: number
  sku: string
  name: string
  quantity: number
  unitPrice: number
  net: number
  tax: number
  total: number
  reason: string
  confirmedAt: string
  status: 'confirmed' | 'refunded'
}

export interface SupplierRefund {
  id: string
  workspaceId: string
  creditId: string
  date: string
  amount: number
  bankAccountId: string
  bankName: string
  reference: string
}

export interface Todo {
  id: string
  workspaceId: string
  title: string
  due: string
  priority: 'high' | 'medium' | 'low'
  /** 工作台待办分组：审批、草稿、逾期。 */
  group: 'approval' | 'draft' | 'overdue'
  done: boolean
}

export interface RecentDocument {
  id: string
  workspaceId: string
  type: string
  title: string
  status: string
  amount: number
  at: string
}

export type DefinitionStatus = 'active' | 'inactive'

/** 商品分类定义（B3 定义维护）。 */
export interface ProductCategory {
  id: string
  code: string
  name: string
  description: string
  productCount: number
  status: DefinitionStatus
  updatedAt: string
}

/** 计量单位定义（B3 定义维护）。 */
export interface UnitDefinition {
  id: string
  code: string
  name: string
  precision: number
  status: DefinitionStatus
  updatedAt: string
}

/** 税码定义（B3 定义维护）。 */
export interface TaxCode {
  id: string
  code: string
  name: string
  rate: string
  kind: 'output' | 'input'
  status: DefinitionStatus
  updatedAt: string
}

export type ChangeEntityType = 'product' | 'partner' | 'purchase-order' | 'sales-order' | 'invoice' | 'definition'

/** 商品、伙伴与单据共用的变更记录（B3 变更记录页、工作台最近动态）。 */
export interface ChangeEntry {
  id: string
  workspaceId: string
  entityType: ChangeEntityType
  entityId: string
  entityName: string
  action: string
  actor: string
  summary: string
  at: string
}

// ---- B0 跨域类型（纯 UI 阶段；金额用字符串，日期用 YYYY-MM-DD 或 ISO） ----

export type BadgeColor = 'primary' | 'secondary' | 'success' | 'info' | 'warning' | 'error' | 'neutral'
export type MockState = 'loading' | 'empty' | 'error' | 'forbidden'
export type Permission
  = | 'dashboard.view'
    | 'catalog.view'
    | 'catalog.edit'
    | 'purchase.view'
    | 'purchase.create'
    | 'purchase.approve'
    | 'sales.view'
    | 'sales.create'
    | 'inventory.view'
    | 'inventory.adjust'
    | 'finance.view'
    | 'finance.post'
    | 'settings.view'
    | 'settings.manage'

export interface DemoUser {
  id: string
  name: string
  title: string
  email: string
  avatarIcon: string
  mfaEnabled: boolean
  lastLoginAt: string
}

/** 只读演示用的登录会话（真实会话与设备管理在接入阶段实现）。 */
export interface DemoSession {
  id: string
  device: string
  browser: string
  location: string
  lastActiveAt: string
  current: boolean
}

export type InvoiceStatus = 'draft' | 'issued' | 'paid' | 'overdue' | 'cancelled'
export interface Invoice {
  id: string
  workspaceId: string
  customerName: string
  status: InvoiceStatus
  issuedAt: string
  dueAt: string
  amount: string
  taxAmount: string
  sourceOrderId: string
  /** 明细行（B5 发票详情演示）。 */
  lines?: InvoiceLine[]
  /** 分享与寄送记录（B5 本地演示）。 */
  deliveries?: InvoiceDelivery[]
  /** 分享链接令牌（B5 本地演示）。 */
  shareToken?: string
  updatedAt: string
}

/** 客户收款单：独立于发票保存，可分批核销。 */
export interface CustomerReceipt {
  id: string
  workspaceId: string
  customerName: string
  amount: string
  receivedAt: string
  bankAccountId: string
  bankName: string
  reference: string
  note?: string
  createdAt: string
}

/** 收款或销售贷项对发票的核销记录。 */
export type ReceivableAllocationSource = 'receipt' | 'credit'
export interface ReceivableAllocation {
  id: string
  workspaceId: string
  customerName: string
  invoiceId: string
  amount: string
  at: string
  sourceType: ReceivableAllocationSource
  receiptId?: string
  creditId?: string
}

/** 已确认销售退货产生的贷项，可核销应收或退款。 */
export type SalesCreditStatus = 'confirmed' | 'refunded'
export interface SalesCredit {
  id: string
  workspaceId: string
  customerName: string
  invoiceId: string
  orderId: string
  fulfillmentId: string
  lineNo: number
  sku: string
  name: string
  quantity: number
  net: string
  tax: string
  total: string
  reason: string
  confirmedAt: string
  status: SalesCreditStatus
}

/** 客户退款记录，关联贷项与资金账户。 */
export interface SalesRefund {
  id: string
  workspaceId: string
  customerName: string
  creditId: string
  amount: string
  refundedAt: string
  bankAccountId: string
  bankName: string
  reference: string
}

/** 发票更正留痕（本地演示只登记原因，不改写原发票）。 */
export interface InvoiceCorrection {
  id: string
  workspaceId: string
  invoiceId: string
  reason: string
  actor: string
  at: string
}

/* ---- C3 库存收发货许可与退货 ---- */
export type StockPermitDirection = 'inbound' | 'outbound'
export type StockPermitStatus = 'pending' | 'partial' | 'completed' | 'cancelled' | 'closed'
export type StockPermitSourceType = 'purchase' | 'sales'

export interface StockPermitLine {
  lineNo: number
  sku: string
  name: string
  permitted: number
  executed: number
}

export interface StockPermitExecutionLine {
  lineNo: number
  sku: string
  name: string
  quantity: number
  unitPrice: number
}

/** 一张许可对应一次收发货执行，sourceId 保留原收货单或发货单号。 */
export interface StockPermitExecution {
  id: string
  permitId: string
  sourceType: 'receipt' | 'fulfillment' | 'manual'
  sourceId: string
  warehouseId: string
  operator: string
  at: string
  lines: StockPermitExecutionLine[]
}

/** 采购订单签发入库许可，销售订单签发出库许可。 */
export interface StockPermit {
  id: string
  workspaceId: string
  direction: StockPermitDirection
  sourceType: StockPermitSourceType
  sourceId: string
  sourceNo: string
  partner: string
  status: StockPermitStatus
  createdAt: string
  createdBy: string
  note?: string
  lines: StockPermitLine[]
}

export type StockReturnStatus = 'pending' | 'confirmed' | 'cancelled'
export type StockReturnDirection = 'purchase' | 'sales'

export interface StockReturnLine {
  lineNo: number
  sku: string
  name: string
  quantity: number
  unitPrice: number
}

/** 从原收货/发货执行记录发起的退货单，确认后关联贷项。 */
export interface StockReturn {
  id: string
  workspaceId: string
  direction: StockReturnDirection
  executionId: string
  sourceType: 'receipt' | 'fulfillment'
  sourceId: string
  orderId: string
  partner: string
  warehouseId: string
  status: StockReturnStatus
  reason: string
  createdAt: string
  confirmedAt?: string
  creditId?: string
  lines: StockReturnLine[]
}
export type PartnerType = 'supplier' | 'customer' | 'donor' | 'both'
export type PartnerStatus = 'active' | 'inactive'
export interface Partner {
  id: string
  code: string
  name: string
  type: PartnerType
  contact: string
  phone: string
  email: string
  taxNo: string
  currency: 'CNY'
  status: PartnerStatus
  updatedAt: string
}

export type QuoteStatus = 'draft' | 'sent' | 'accepted' | 'rejected' | 'expired'
export interface QuoteLine {
  lineNo: number
  sku: string
  name: string
  quantity: number
  unitPrice: string
  taxRate: string
  amount: string
}
export interface Quote {
  id: string
  workspaceId: string
  customerName: string
  status: QuoteStatus
  validUntil: string
  owner: string
  totalAmount: string
  lines: QuoteLine[]
  /** 已转换的销售单号（B5 演示）。 */
  convertedOrderId?: string
  updatedAt: string
}

export type SalesOrderStatus = 'draft' | 'pending' | 'approved' | 'partial' | 'fulfilled' | 'closed' | 'cancelled'
export interface SalesOrderLine {
  lineNo: number
  sku: string
  name: string
  quantity: number
  shipped: number
  unitPrice: string
  amount: string
}
export interface SalesOrder {
  id: string
  workspaceId: string
  customerName: string
  status: SalesOrderStatus
  orderedAt: string
  promisedAt: string
  owner: string
  totalAmount: string
  note: string
  lines: SalesOrderLine[]
  /** 来源报价单号（B5 演示）。 */
  quoteId?: string
  /** 审批轨迹（B5 本地演示）。 */
  approvals?: SalesApprovalStep[]
  /** 履约记录（B5 本地演示）。 */
  fulfillments?: SalesFulfillment[]
  updatedAt: string
}

export type WarehouseStatus = 'active' | 'inactive'
export interface Warehouse {
  id: string
  code: string
  name: string
  city: string
  manager: string
  status: WarehouseStatus
}
export interface InventoryPosition {
  id: string
  warehouseId: string
  sku: string
  name: string
  lotNo: string
  quantity: number
  reserved: number
  available: number
  unit: string
  updatedAt: string
}
export type InventoryMovementType = 'inbound' | 'outbound' | 'transfer' | 'adjust'
export interface InventoryMovement {
  id: string
  type: InventoryMovementType
  warehouseId: string
  sku: string
  name: string
  quantity: number
  reference: string
  at: string
}

export type FinanceAccountType = 'asset' | 'liability' | 'equity' | 'revenue' | 'expense'
export interface FinanceAccount {
  id: string
  code: string
  name: string
  type: FinanceAccountType
  balance: string
}
export type JournalStatus = 'draft' | 'posted' | 'reversed'
export interface JournalLine {
  accountCode: string
  accountName: string
  debit: string
  credit: string
}
export interface JournalEntry {
  id: string
  date: string
  period: string
  description: string
  status: JournalStatus
  debitTotal: string
  creditTotal: string
  lines: JournalLine[]
}
export interface ReportRow {
  id: string
  report: 'trial-balance' | 'income-statement' | 'balance-sheet' | 'cash-flow'
  label: string
  amount: string
  level: number
}
export interface AgingBucket {
  bucket: string
  receivable: string
  payable: string
}
export interface TaxPeriod {
  id: string
  period: string
  status: 'open' | 'closed'
  taxableAmount: string
  taxAmount: string
  dueAt: string
}

export type MemberStatus = 'active' | 'invited' | 'disabled'
export interface Member {
  id: string
  name: string
  email: string
  phone: string
  departmentId: string
  roleId: string
  status: MemberStatus
  joinedAt: string
}
export interface Role {
  id: string
  name: string
  description: string
  permissions: string[]
}
/** 角色在部门、仓库与财务期间上的数据范围（C4）。 */
export interface RoleScope {
  departmentIds: string[]
  warehouseIds: string[]
  periodIds: string[]
}
export type AccessRequestStatus = 'pending' | 'approved' | 'rejected'
export interface AccessRequestDecision {
  actorId: string
  actorName: string
  decision: 'approved' | 'rejected'
  at: string
  note?: string
}
export interface RoleAccessRequest {
  id: string
  workspaceId: string
  roleId: string
  requesterId: string
  requesterName: string
  scope: RoleScope
  reason: string
  status: AccessRequestStatus
  requestedAt: string
  decidedAt?: string
  decisions: AccessRequestDecision[]
}
export interface Department {
  id: string
  name: string
  parentId: string | null
  memberCount: number
}
export type InvitationStatus = 'pending' | 'accepted' | 'expired'
export interface Invitation {
  id: string
  email: string
  roleId: string
  status: InvitationStatus
  sentAt: string
  expiresAt: string
}
export interface Announcement {
  id: string
  title: string
  body: string
  level: 'info' | 'warning'
  createdAt: string
}
export interface AuditEntry {
  id: string
  workspaceId: string
  actor: string
  action: string
  target: string
  at: string
}

// ---- B8 组织治理与订阅 ----

/** 工作区公司资料（纯 UI 演示，保存只改本地状态）。 */
export interface CompanyProfile {
  id: string
  name: string
  legalName: string
  registrationNo: string
  taxNo: string
  industry: string
  scale: string
  phone: string
  email: string
  website: string
  address: string
  baseCurrency: 'CNY'
  timezone: string
  fiscalYearStart: string
  invoiceTitle: string
}

/** SaaS 套餐（仅用于对比与本地升级演示）。 */
export interface BillingPlan {
  id: string
  name: string
  description: string
  monthlyPrice: number
  annualPrice: number
  seatLimit: number
  storageLimitGb: number
  invoiceLimit: number
  features: string[]
  recommended?: boolean
}

export type SubscriptionStatus = 'active' | 'cancelled'

/** 工作区当前订阅与用量。 */
export interface WorkspaceSubscription {
  workspaceId: string
  planId: string
  status: SubscriptionStatus
  seatsUsed: number
  storageUsedGb: number
  invoicesUsed: number
  renewsAt: string
  startedAt: string
}

// ---- B5 销售与应收 ----

export type SalesApprovalAction = 'submitted' | 'approved' | 'rejected'
/** 销售订单审批轨迹（本地演示）。 */
export interface SalesApprovalStep {
  id: string
  orderId: string
  action: SalesApprovalAction
  actor: string
  at: string
  note: string
}
/** 履约行（本地演示）。 */
export interface SalesFulfillmentLine {
  lineNo: number
  sku: string
  name: string
  quantity: number
}
/** 一笔发货履约记录。 */
export interface SalesFulfillment {
  id: string
  orderId: string
  shippedAt: string
  shipper: string
  lines: SalesFulfillmentLine[]
}
/** 发票明细行。 */
export interface InvoiceLine {
  lineNo: number
  sku: string
  name: string
  quantity: number
  unitPrice: string
  taxRate: string
  amount: string
}
export type InvoiceDeliveryChannel = 'email' | 'link'
export type InvoiceDeliveryStatus = 'sent' | 'failed'
/** 发票寄送 / 分享记录（本地演示）。 */
export interface InvoiceDelivery {
  id: string
  channel: InvoiceDeliveryChannel
  target: string
  status: InvoiceDeliveryStatus
  at: string
  error?: string
}
/** 定期开票计划（本地演示，不实现真实调度）。 */
export interface RecurringInvoicePlan {
  id: string
  workspaceId: string
  customerName: string
  cadence: 'monthly' | 'quarterly'
  amount: string
  nextRunAt: string
  lastRunAt: string
  status: 'active' | 'paused'
  owner: string
}

// ---- B6 库存作业 ----

export type StocktakeStatus = 'draft' | 'counting' | 'completed'
export interface StocktakeLine {
  lineNo: number
  sku: string
  name: string
  systemQty: number
  countedQty: number
  unit: string
}
/** 盘点单（本地演示）。 */
export interface Stocktake {
  id: string
  workspaceId: string
  warehouseId: string
  status: StocktakeStatus
  createdAt: string
  owner: string
  lines: StocktakeLine[]
}
export type TransferStatus = 'draft' | 'completed'
export interface TransferLine {
  lineNo: number
  sku: string
  name: string
  quantity: number
  unit: string
}
/** 调拨单（本地演示）。 */
export interface TransferOrder {
  id: string
  workspaceId: string
  fromWarehouseId: string
  toWarehouseId: string
  status: TransferStatus
  createdAt: string
  owner: string
  lines: TransferLine[]
}

// ---- B7 财务作业 ----

export type FinancePeriodStatus = 'open' | 'closing' | 'closed'
/** 会计期间（本地演示）。 */
export interface FinancePeriod {
  id: string
  period: string
  status: FinancePeriodStatus
  startDate: string
  endDate: string
  closedAt?: string
}
export type BankAccountStatus = 'active' | 'inactive'
export interface BankAccount {
  id: string
  workspaceId: string
  bankName: string
  accountName: string
  accountNo: string
  balance: string
  currency: 'CNY'
  status: BankAccountStatus
  updatedAt: string
}
export interface BankTransaction {
  id: string
  bankAccountId: string
  date: string
  description: string
  amount: string
  direction: 'in' | 'out'
  counterparty: string
  matched: boolean
  matchedJournalId?: string
}
export interface TaxRateDefinition {
  id: string
  code: string
  name: string
  rate: string
  kind: 'output' | 'input'
  status: DefinitionStatus
}
/** 伙伴明细账（本地演示）。 */
export interface PartnerLedgerEntry {
  id: string
  partnerName: string
  docId: string
  date: string
  summary: string
  debit: string
  credit: string
  balance: string
}
// ---- C5 期初导入与报表导出 ----

export interface OpeningBalanceIssue {
  row?: number
  message: string
  severity: 'error' | 'warning'
}

export interface OpeningBalanceRow {
  row: number
  accountId: string
  accountCode: string
  accountName: string
  debit: number
  credit: number
}

export interface OpeningBalancePreview {
  fileKey: string
  fileName: string
  fileHash: string
  chartRevision: number
  on: string
  currency: 'CNY'
  debit: number
  credit: number
  rowCount: number
  rows: OpeningBalanceRow[]
  issues: OpeningBalanceIssue[]
  canImport: boolean
}

export interface OpeningImportRecord {
  id: string
  workspaceId: string
  fileName: string
  fileHash: string
  importedAt: string
  journalId: string
  debit: number
  credit: number
  rowCount: number
  operator: string
}

export type OpeningSubledgerKind = 'stock' | 'receivable' | 'payable' | 'bank'
export type OpeningSubledgerState = 'submitted' | 'applying' | 'posted' | 'rejected' | 'cancelled'

export interface OpeningSubledgerSource {
  id: string
  kind: OpeningSubledgerKind
  label: string
  fileName: string
  reference: string
  detail: string
  amount: number
  ledgerAmount: number
  difference: number
  matched: boolean
  href: string
  sampleDocNo: string
  sampleLabel: string
}

export interface OpeningSubledgerCheck {
  kind: OpeningSubledgerKind
  label: string
  imported: number
  subledger: number
  ledger: number
  matched: boolean
}

export interface OpeningSubledgerPreview {
  fileKey: string
  fileName: string
  fileHash: string
  chartRevision: number
  on: string
  currency: 'CNY'
  sources: OpeningSubledgerSource[]
  checks: OpeningSubledgerCheck[]
  issues: OpeningBalanceIssue[]
  totalImported: number
  totalSubledger: number
  totalLedger: number
  totalDifference: number
}

export interface OpeningSubledgerPostingResult {
  journalIds: string[]
  stockMovements: number
  receivableDocs: number
  payableDocs: number
  bankMovements: number
  checks: number
  passed: number
  postedAt: string
}

export interface OpeningSubledgerBatch {
  id: string
  workspaceId: string
  state: OpeningSubledgerState
  version: number
  on: string
  currency: 'CNY'
  fileKey: string
  fileName: string
  fileHash: string
  chartRevision: number
  equityAccountCode: string
  equityAccountName: string
  makerId: string
  makerName: string
  reviewerId?: string
  reviewerName?: string
  submittedAt: string
  reviewedAt?: string
  completedAt?: string
  cancelledAt?: string
  reviewNote?: string
  rejection?: string
  sources: OpeningSubledgerSource[]
  checks: OpeningSubledgerCheck[]
  issues: OpeningBalanceIssue[]
  result?: OpeningSubledgerPostingResult
}

export type ReportExportKind = 'trial-balance' | 'income-statement' | 'balance-sheet' | 'cash-flow'
export type ReportExportStatus = 'queued' | 'running' | 'ready' | 'failed'

export interface ReportExportRecord {
  id: string
  workspaceId: string
  kind: ReportExportKind
  period: string
  status: ReportExportStatus
  requestedAt: string
  completedAt?: string
  snapshotId: string
  watermark: number
  rowCount: number
  fileHash: string
  fileName: string
  fileSizeKb: number
  basis: 'ledger' | 'management'
  rebuiltFrom?: string
  failureReason?: string
}

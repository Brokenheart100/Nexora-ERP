import type { CustomerReceipt, ReceivableAllocation, SalesCredit, SalesCreditStatus, SalesRefund } from './types'

export const salesCreditStatusLabels: Record<SalesCreditStatus, string> = {
  confirmed: '已确认 · 待核销或退款',
  refunded: '已退款'
}
export const salesCreditStatusColors: Record<SalesCreditStatus, 'warning' | 'success'> = {
  confirmed: 'warning',
  refunded: 'success'
}

/** 客户收款单由用户在本地登记，初始为空，便于演示“先登记、后核销”。 */
export const customerReceipts: CustomerReceipt[] = []

/**
 * 已确认销售退货样例：SO-2026-9001 的一把网椅在签收后划伤，
 * 关联已收款发票 INV-2026-0081 生成贷项 CR-2026-1201；
 * 其中 500.00 已核销到同客户未结发票 INV-2026-0088，剩余 955.44 可退款。
 */
export const salesCredits: SalesCredit[] = [{
  id: 'CR-2026-1201',
  workspaceId: 'ws-hq',
  customerName: '杭州云杉科技有限公司',
  invoiceId: 'INV-2026-0081',
  orderId: 'SO-2026-9001',
  fulfillmentId: 'FUL-9001-01',
  lineNo: 1,
  sku: 'SKU-1010',
  name: '人体工学网椅（带腰托/可躺 135°）',
  quantity: 1,
  net: '1288.00',
  tax: '167.44',
  total: '1455.44',
  reason: '客户验收发现一把网椅扶手划伤，确认退货并生成贷项。',
  confirmedAt: '2026-11-16',
  status: 'confirmed'
}]

export const receivableAllocations: ReceivableAllocation[] = [{
  id: 'ALLOC-2026-1201',
  workspaceId: 'ws-hq',
  customerName: '杭州云杉科技有限公司',
  invoiceId: 'INV-2026-0088',
  amount: '500.00',
  at: '2026-11-17 10:20',
  sourceType: 'credit',
  creditId: 'CR-2026-1201'
}]

export const salesRefunds: SalesRefund[] = []

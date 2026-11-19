import type { StockReturn } from './types'

export const stockPermitStatusLabels: Record<'pending' | 'partial' | 'completed' | 'cancelled' | 'closed', string> = {
  pending: '待执行',
  partial: '部分执行',
  completed: '已完成',
  cancelled: '已取消',
  closed: '已关闭'
}

export const stockPermitStatusColors: Record<'pending' | 'partial' | 'completed' | 'cancelled' | 'closed', 'neutral' | 'info' | 'success' | 'error' | 'warning'> = {
  pending: 'warning',
  partial: 'info',
  completed: 'success',
  cancelled: 'neutral',
  closed: 'neutral'
}

export const stockReturnStatusLabels: Record<'pending' | 'confirmed' | 'cancelled', string> = {
  pending: '待确认',
  confirmed: '已确认',
  cancelled: '已取消'
}

export const stockReturnStatusColors: Record<'pending' | 'confirmed' | 'cancelled', 'neutral' | 'info' | 'success' | 'error' | 'warning'> = {
  pending: 'warning',
  confirmed: 'success',
  cancelled: 'neutral'
}
/** C3 退货样例：已确认的销售退货关联 C2 贷项，已确认的采购退货关联 C1 供应商贷项。 */
export const stockReturnSeeds: StockReturn[] = [{
  id: 'PR-2026-1201',
  workspaceId: 'ws-hq',
  direction: 'purchase',
  executionId: 'EXE-RC-2026-0511-02',
  sourceType: 'receipt',
  sourceId: 'RC-2026-0511-02',
  orderId: 'PO-2026-0511',
  partner: '苏州精工电子有限公司',
  warehouseId: 'wh-east',
  status: 'confirmed',
  reason: '来料抽检发现 5 个扩展坞外壳划伤，确认退货。',
  createdAt: '2026-11-16 09:40',
  confirmedAt: '2026-11-16 10:05',
  creditId: 'CR-2026-1101',
  lines: [{ lineNo: 3, sku: 'SKU-1016', name: 'Type-C 转 HDMI 4K 扩展坞（含 PD 100W）', quantity: 5, unitPrice: 259, invoicedQuantity: 5, uninvoicedQuantity: 0 }]
}, {
  id: 'SR-2026-1201',
  workspaceId: 'ws-hq',
  direction: 'sales',
  executionId: 'EXE-FUL-9001-01',
  sourceType: 'fulfillment',
  sourceId: 'FUL-9001-01',
  orderId: 'SO-2026-9001',
  partner: '杭州云杉科技有限公司',
  warehouseId: 'wh-east',
  status: 'confirmed',
  reason: '客户验收发现 1 把网椅扶手划伤，确认退货并转销售贷项。',
  createdAt: '2026-11-16 10:20',
  confirmedAt: '2026-11-16 11:00',
  creditId: 'CR-2026-1201',
  lines: [{ lineNo: 1, sku: 'SKU-1010', name: '人体工学网椅（带腰托/可躺 135°）', quantity: 1, unitPrice: 1288, invoicedQuantity: 1, uninvoicedQuantity: 0 }]
}]

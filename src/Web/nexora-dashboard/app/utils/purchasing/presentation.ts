import type { PurchaseOrder } from '~/mocks'
import type { PurchaseDetail, PurchaseSummary } from '#shared/types/purchasing'

/** The existing table's row key stays the resource id. Wire strings remain authoritative in its cells. */
export function purchaseRow(summary: PurchaseSummary, workspaceId: string, detail?: PurchaseDetail | null): PurchaseOrder {
  const state = { submitted: 'pending', receiving: 'partial' }[summary.state] ?? summary.state
  return { id: summary.id, workspaceId, supplier: summary.supplierName, contact: '', orderedAt: summary.on, expectedAt: '—',
    status: state as PurchaseOrder['status'], note: detail?.note ?? '', maker: detail ? (detail.isMaker ? '当前用户' : '其他制单人') : '—',
    lines: detail?.lines.map((line, index) => ({ lineNo: index + 1, sku: line.itemCode, name: line.itemName, spec: line.unitCode,
      quantity: 0, unitPrice: 0, received: 0 })) ?? [], approvals: [], receipts: [], audit: [] }
}

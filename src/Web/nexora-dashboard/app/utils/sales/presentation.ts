import type { SalesDetail, SalesSummary } from '#shared/types/sales'
import type { Invoice, Quote, QuoteStatus, SalesOrder, SalesOrderStatus } from '~/mocks'
import type { CustomerDocument, ShipmentAllowance } from '#shared/types/receivables'
import { compareDecimal, sumDecimals } from '#shared/utils/decimal'

const orderStates: Record<SalesSummary['state'], SalesOrderStatus> = {
  draft: 'draft', submitted: 'pending', approved: 'approved', cancelled: 'cancelled',
  fulfilling: 'partial', fulfilled: 'fulfilled', closed: 'closed', quoted: 'draft', converted: 'draft'
}
const quoteStates: Partial<Record<SalesSummary['state'], QuoteStatus>> = {
  draft: 'draft', quoted: 'sent', converted: 'converted', cancelled: 'cancelled'
}

function viewFields(row: SalesSummary, workspaceId: string, detail?: SalesDetail) {
  return {
    id: row.id, documentNumber: row.number, workspaceId, customerName: row.customerName,
    owner: detail?.isMaker ? '当前用户' : '—', totalAmount: detail?.total ?? row.total ?? '', updatedAt: '—'
  }
}

export function salesOrderView(row: SalesSummary, workspaceId: string, detail?: SalesDetail): SalesOrder {
  return {
    ...viewFields(row, workspaceId, detail), status: orderStates[row.state], orderedAt: row.on,
    promisedAt: '—', note: detail?.note ?? '', quoteId: row.quoteId ?? undefined,
    lines: detail?.lines.map((line, index) => ({ lineNo: index + 1, sku: line.itemCode, name: line.itemName,
      quantity: Number(line.quantity), unitPrice: line.unitPrice, amount: line.amount, shipped: 0 })) ?? []
  }
}

export function salesQuoteView(row: SalesSummary, workspaceId: string, detail?: SalesDetail): Quote {
  return {
    ...viewFields(row, workspaceId, detail), status: quoteStates[row.state] ?? 'draft', validUntil: row.on,
    convertedOrderId: detail?.convertedOrder?.id, convertedOrderNumber: detail?.convertedOrder?.number,
    lines: detail?.lines.map((line, index) => ({ lineNo: index + 1, sku: line.itemCode, name: line.itemName,
      quantity: Number(line.quantity), unitPrice: line.unitPrice, amount: line.amount, taxRate: '—' })) ?? []
  }
}

export function salesInvoiceView(doc: CustomerDocument, workspaceId: string, sources: ShipmentAllowance[]): Invoice {
  const terms = doc.terms
  const dueAt = terms.dueOn ?? terms.on
  const shipment = sources.find(row => terms.lines?.some(line => line.shipmentId === row.id))
  const status = doc.state === 'submitted'
    ? 'draft'
    : doc.state === 'cancelled'
      ? 'cancelled'
      : compareDecimal(doc.openBalance, '0') <= 0 ? 'paid' : dueAt < new Date().toLocaleDateString('en-CA') ? 'overdue' : 'issued'
  return {
    id: doc.id, documentNumber: terms.number || '待分配编号', workspaceId, customerName: terms.customerName,
    status, issuedAt: terms.on, dueAt, amount: terms.total, taxAmount: sumDecimals(terms.lines?.map(line => line.tax) ?? []),
    sourceOrderId: shipment?.orderId ?? '', updatedAt: terms.on
  }
}

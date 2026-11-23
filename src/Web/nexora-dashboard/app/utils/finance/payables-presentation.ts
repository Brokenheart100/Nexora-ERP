import type { AccrualReceipt, TradeDocument } from '#shared/types/trade'
import { compareDecimal, subtractDecimal, sumDecimals } from '#shared/utils/decimal'
import type { SupplierPayment } from '~/mocks'

export function creditedTotal(document: TradeDocument) {
  return sumDecimals((document.billMatches ?? []).flatMap(line => [line.creditedNet, line.creditedTax]))
}
export function paidTotal(document: TradeDocument) {
  return document.state === 'posted'
    ? subtractDecimal(subtractDecimal(document.total, document.outstanding), creditedTotal(document))
    : '0'
}
export function payableBillView(document: TradeDocument, receipts: AccrualReceipt[], name: (id: string) => string) {
  const first = receipts.find(
    value => value.fact.id === (document.billMatches?.[0]?.receiptId ?? document.terms.billReceipts?.[0]?.receiptId)
  )
  const lines
    = document.billMatches
      ?? document.terms.billReceipts?.map(value => ({ ...value, id: value.receiptId, tax: '待复核', variance: '待复核' }))
      ?? []
  return {
    id: document.id,
    number: document.terms.number,
    supplier: document.terms.partnerId ? name(document.terms.partnerId) : '—',
    orderId: first?.fact.orderId ?? '—',
    date: document.terms.on,
    dueAt: document.terms.dueOn ?? '—',
    status: document.state === 'submitted' ? 'pending' : document.state,
    net: document.terms.amount,
    tax: document.state === 'posted' ? sumDecimals((document.billMatches ?? []).map(value => value.tax)) : '待复核',
    total: document.state === 'posted' ? document.total : '待复核',
    note: document.terms.memo,
    journalId: document.journalId ?? undefined,
    reviewer: undefined,
    reviewedAt: undefined,
    lines: lines.map((line) => {
      const receipt = receipts.find(value => value.fact.id === line.receiptId)
      return {
        id: line.id,
        receiptId: line.receiptId,
        receiptLineNo: receipt?.fact.lineId ?? '—',
        name: receipt?.fact.itemId ?? '—',
        sku: '',
        quantity: line.quantity,
        unitPrice: '—',
        accrualUnitPrice: '—',
        net: line.net,
        tax: line.tax ?? '待复核',
        variance: line.variance ?? '待复核'
      }
    })
  }
}
export function isPurchaseReceipt(receipt: AccrualReceipt) {
  return !receipt.fact.stock && !receipt.fact.reversesId && !receipt.fact.adjustmentForBillId && compareDecimal(receipt.fact.quantity, '0') > 0
}

export function payableReceiptView(receipt: AccrualReceipt, itemName: (id: string) => string, partnerName: (id: string) => string) {
  const available = receipt.posted ? subtractDecimal(receipt.fact.quantity, receipt.matchedQuantity) : '0'
  return {
    id: receipt.fact.id,
    receiptId: receipt.fact.id,
    receiptLineNo: receipt.fact.lineId,
    orderId: receipt.fact.orderId,
    orderSupplier: partnerName(receipt.fact.supplierId),
    receivedAt: receipt.fact.on,
    name: itemName(receipt.fact.itemId),
    sku: receipt.fact.itemId,
    spec: '',
    quantity: receipt.fact.quantity,
    unitPrice: '—',
    accrualAmount: receipt.fact.cost,
    matchedQuantity: receipt.matchedQuantity,
    availableQuantity: available,
    status:
      !receipt.posted ? 'unmatched' : compareDecimal(available, '0') <= 0 ? 'matched' : compareDecimal(receipt.matchedQuantity, '0') > 0 ? 'partial' : 'unmatched',
    variance: '—',
    variancePending: false,
    posted: receipt.posted,
    pendingReason: receipt.pendingReason,
    journalId: receipt.journalId
  }
}
export function payablePaymentView(document: TradeDocument, bankName: (id: string) => string) {
  return {
    id: document.id,
    number: document.terms.number,
    billId: document.terms.sourceId ?? '',
    date: document.terms.on,
    bankAccountId: document.terms.bankId ?? '',
    bankName: document.terms.bankId ? bankName(document.terms.bankId) : '—',
    amount: document.terms.amount,
    method: 'transfer' as const,
    reference: document.terms.number,
    note: document.terms.memo,
    status: document.reversedById ? 'voided' : document.state,
    journalId: document.journalId,
    reversal: undefined as SupplierPayment['reversal'],
    voidedAt: undefined,
    voidReason: undefined
  }
}

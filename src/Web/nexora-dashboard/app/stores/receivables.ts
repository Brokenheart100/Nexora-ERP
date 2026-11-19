import { defineStore } from 'pinia'
import type {
  AgingBucket,
  CustomerReceipt,
  Invoice,
  InvoiceCorrection,
  InvoiceDelivery,
  InvoiceLine,
  ReceivableAllocation,
  SalesCredit,
  SalesRefund
} from '~/mocks'
import {
  cloneInvoice,
  customerReceipts as receiptSeed,
  invoices as invoiceSeed,
  receivableAllocations as allocationSeed,
  salesCredits as creditSeed,
  salesRefunds as refundSeed
} from '~/mocks'

export interface RegisterReceiptInput {
  workspaceId: string
  customerName: string
  amount: number
  receivedAt: string
  bankAccountId: string
  bankName: string
  reference: string
  note?: string
}

export interface AllocationInput {
  invoiceId: string
  sourceType: 'receipt' | 'credit'
  sourceId: string
  amount: number
}

export interface RefundCreditInput {
  creditId: string
  amount: number
  refundedAt: string
  bankAccountId: string
  bankName: string
  reference: string
}

export interface ReceivableActionResult {
  ok: boolean
  message: string
  receipt?: CustomerReceipt
  allocation?: ReceivableAllocation
  refund?: SalesRefund
  creditId?: string
}

const AGING_AS_OF = '2026-11-18'

function money(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

function dateStamp() {
  const date = new Date()
  const pad = (value: number) => String(value).padStart(2, '0')
  return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate())
    + ' ' + pad(date.getHours()) + ':' + pad(date.getMinutes())
}

function nextId(prefix: string, rows: { id: string }[], start: number) {
  const max = rows.reduce((value, row) => {
    const parsed = Number(row.id.slice(-4))
    return Number.isFinite(parsed) ? Math.max(value, parsed) : value
  }, start)
  return prefix + String(max + 1).padStart(4, '0')
}

function daysBetween(from: string, to: string) {
  const left = new Date(from + 'T00:00:00').getTime()
  const right = new Date(to + 'T00:00:00').getTime()
  return Math.floor((right - left) / 86400000)
}

function cloneReceipt(row: CustomerReceipt): CustomerReceipt {
  return { ...row }
}
function cloneCredit(row: SalesCredit): SalesCredit {
  return { ...row }
}
function cloneRefund(row: SalesRefund): SalesRefund {
  return { ...row }
}

/**
 * 销售到收款的本地台账：发票、客户收款、核销、销售贷项与退款共享同一份状态。
 * 仅用于 UI 原型，刷新页面后恢复 app/mocks 的初始样例。
 */
export const useReceivablesStore = defineStore('receivables', () => {
  const invoices = ref<Invoice[]>(invoiceSeed.map(cloneInvoice))
  const receipts = ref<CustomerReceipt[]>(receiptSeed.map(cloneReceipt))
  const allocations = ref<ReceivableAllocation[]>(allocationSeed.map(row => ({ ...row })))
  const credits = ref<SalesCredit[]>(creditSeed.map(cloneCredit))
  const refunds = ref<SalesRefund[]>(refundSeed.map(cloneRefund))
  const corrections = ref<InvoiceCorrection[]>([])
  /** C6：未开票退货冲减，key 为 orderId:lineNo。 */
  const unbilledReturned = ref<Record<string, number>>({})

  function invoiceById(id: string) {
    return invoices.value.find(invoice => invoice.id === id) ?? null
  }

  function allocatedOf(invoiceId: string) {
    return money(allocations.value
      .filter(row => row.invoiceId === invoiceId)
      .reduce((sum, row) => sum + Number(row.amount), 0))
  }

  function outstandingOf(invoice: Invoice | null) {
    if (!invoice || !['issued', 'overdue'].includes(invoice.status)) return 0
    return money(Math.max(0, Number(invoice.amount) - allocatedOf(invoice.id)))
  }

  function receiptAllocatedOf(receiptId: string) {
    return money(allocations.value
      .filter(row => row.receiptId === receiptId)
      .reduce((sum, row) => sum + Number(row.amount), 0))
  }

  function receiptAvailableOf(receipt: CustomerReceipt) {
    return money(Math.max(0, Number(receipt.amount) - receiptAllocatedOf(receipt.id)))
  }

  function creditAllocatedOf(creditId: string) {
    return money(allocations.value
      .filter(row => row.creditId === creditId)
      .reduce((sum, row) => sum + Number(row.amount), 0))
  }

  function creditRefundedOf(creditId: string) {
    return money(refunds.value
      .filter(row => row.creditId === creditId)
      .reduce((sum, row) => sum + Number(row.amount), 0))
  }

  function creditAvailableOf(credit: SalesCredit) {
    return money(Math.max(0, Number(credit.total) - creditAllocatedOf(credit.id) - creditRefundedOf(credit.id)))
  }

  function returnKey(orderId: string, lineNo: number) {
    return orderId + ':' + lineNo
  }

  function unbilledReturnedOf(orderId: string, lineNo: number) {
    return unbilledReturned.value[returnKey(orderId, lineNo)] ?? 0
  }

  /** 已开票数量只统计已生效发票，草稿与已取消发票不占用可开票额度。 */
  function invoicedQuantityOf(orderId: string, lineNo: number) {
    return money(invoices.value
      .filter(invoice => invoice.sourceOrderId === orderId && ['issued', 'paid', 'overdue'].includes(invoice.status))
      .flatMap(invoice => invoice.lines ?? [])
      .filter(line => line.lineNo === lineNo)
      .reduce((sum, line) => sum + line.quantity, 0))
  }

  /** 可开票数量 = 已发货数量 - 未开票退货冲减。 */
  function invoiceableQuantityOf(orderId: string, lineNo: number, shipped: number) {
    return Math.max(0, shipped - unbilledReturnedOf(orderId, lineNo))
  }

  /** 未开票退货减少可开票数量，避免退货后仍按原发货数量重复开票。 */
  function recordReturnReduction(orderId: string, lineNo: number, quantity: number): ReceivableActionResult {
    if (!Number.isFinite(quantity) || quantity <= 0) return { ok: false, message: '退货数量必须大于 0。' }
    const key = returnKey(orderId, lineNo)
    unbilledReturned.value = {
      ...unbilledReturned.value,
      [key]: unbilledReturnedOf(orderId, lineNo) + quantity
    }
    return { ok: true, message: '未开票退货已冲减可开票数量。' }
  }

  function agingBucketsFor(workspaceId: string): AgingBucket[] {
    const buckets: AgingBucket[] = [
      { bucket: '未到期', receivable: '0.00', payable: '0.00' },
      { bucket: '1-30 天', receivable: '0.00', payable: '0.00' },
      { bucket: '31-60 天', receivable: '0.00', payable: '0.00' },
      { bucket: '60 天以上', receivable: '0.00', payable: '0.00' }
    ]
    for (const invoice of invoices.value) {
      if (invoice.workspaceId !== workspaceId) continue
      const outstanding = outstandingOf(invoice)
      if (outstanding <= 0) continue
      const diff = daysBetween(AGING_AS_OF, invoice.dueAt)
      const index = diff >= 0 ? 0 : diff <= -60 ? 3 : diff <= -31 ? 2 : 1
      const bucket = buckets[index]!
      bucket.receivable = money(Number(bucket.receivable) + outstanding).toFixed(2)
    }
    return buckets
  }

  function openInvoiceRowsFor(workspaceId: string) {
    return invoices.value
      .filter(invoice => invoice.workspaceId === workspaceId)
      .map((invoice) => {
        const outstanding = outstandingOf(invoice)
        const diff = daysBetween(AGING_AS_OF, invoice.dueAt)
        const bucket = diff >= 0 ? '未到期' : diff <= -60 ? '60 天以上' : diff <= -31 ? '31-60 天' : '1-30 天'
        return { id: invoice.id, customerName: invoice.customerName, dueAt: invoice.dueAt, bucket, outstanding: money(outstanding).toFixed(2) }
      })
      .filter(row => Number(row.outstanding) > 0)
  }

  function outstandingTotalFor(workspaceId: string) {
    return money(invoices.value
      .filter(invoice => invoice.workspaceId === workspaceId)
      .reduce((sum, invoice) => sum + outstandingOf(invoice), 0))
  }

  function availableReceiptsFor(workspaceId: string, customerName?: string) {
    return receipts.value.filter(receipt => receipt.workspaceId === workspaceId
      && (!customerName || receipt.customerName === customerName)
      && receiptAvailableOf(receipt) > 0.005)
  }

  function openInvoicesFor(workspaceId: string, customerName?: string) {
    return invoices.value.filter(invoice => invoice.workspaceId === workspaceId
      && (!customerName || invoice.customerName === customerName)
      && outstandingOf(invoice) > 0.005)
  }

  function registerReceipt(input: RegisterReceiptInput): ReceivableActionResult {
    if (!input.customerName.trim()) return { ok: false, message: '请选择客户。' }
    if (!input.receivedAt) return { ok: false, message: '请选择收款日期。' }
    if (!input.bankAccountId || !input.bankName) return { ok: false, message: '请选择资金账户。' }
    const amount = money(input.amount)
    if (!Number.isFinite(amount) || amount <= 0) return { ok: false, message: '收款金额必须大于 0。' }
    const receipt: CustomerReceipt = {
      id: nextId('RCPT-2026-', receipts.value, 1200),
      workspaceId: input.workspaceId,
      customerName: input.customerName,
      amount: amount.toFixed(2),
      receivedAt: input.receivedAt,
      bankAccountId: input.bankAccountId,
      bankName: input.bankName,
      reference: input.reference || '本地演示收款',
      ...(input.note ? { note: input.note } : {}),
      createdAt: dateStamp()
    }
    receipts.value = [receipt, ...receipts.value]
    return { ok: true, message: '已登记收款单 ' + receipt.id + '，可核销 ' + receipt.amount + '。', receipt }
  }

  function allocate(input: AllocationInput): ReceivableActionResult {
    const invoice = invoiceById(input.invoiceId)
    if (!invoice) return { ok: false, message: '未找到待核销发票。' }
    if (!['issued', 'overdue'].includes(invoice.status)) return { ok: false, message: '仅已开具或已逾期发票可以核销。' }
    const invoiceOutstanding = outstandingOf(invoice)
    if (invoiceOutstanding <= 0) return { ok: false, message: '该发票已结清。' }
    const amount = money(input.amount)
    if (!Number.isFinite(amount) || amount <= 0) return { ok: false, message: '核销金额必须大于 0。' }
    if (amount > invoiceOutstanding + 0.005) {
      return { ok: false, message: '核销金额不能超过发票未结金额 ¥' + invoiceOutstanding.toFixed(2) + '。' }
    }
    let customerName: string
    let available: number
    let receiptId: string | undefined
    let creditId: string | undefined
    if (input.sourceType === 'receipt') {
      const receipt = receipts.value.find(row => row.id === input.sourceId)
      if (!receipt) return { ok: false, message: '未找到收款单。' }
      receiptId = receipt.id
      customerName = receipt.customerName
      available = receiptAvailableOf(receipt)
    } else {
      const credit = credits.value.find(row => row.id === input.sourceId)
      if (!credit) return { ok: false, message: '未找到销售贷项。' }
      creditId = credit.id
      customerName = credit.customerName
      available = creditAvailableOf(credit)
    }
    if (customerName !== invoice.customerName) {
      return { ok: false, message: '收款单或贷项必须与发票属于同一客户。' }
    }
    if (available <= 0) return { ok: false, message: '该款项已无可用余额。' }
    if (amount > available + 0.005) {
      return { ok: false, message: '核销金额不能超过可用余额 ¥' + available.toFixed(2) + '。' }
    }
    const allocation: ReceivableAllocation = {
      id: nextId('ALLOC-2026-', allocations.value, 1200),
      workspaceId: invoice.workspaceId,
      customerName,
      invoiceId: invoice.id,
      amount: amount.toFixed(2),
      at: dateStamp(),
      sourceType: input.sourceType,
      ...(receiptId ? { receiptId } : {}),
      ...(creditId ? { creditId } : {})
    }
    allocations.value = [allocation, ...allocations.value]
    const after = outstandingOf(invoice)
    if (after <= 0.005) {
      invoice.status = 'paid'
      invoice.updatedAt = allocation.at
    }
    return { ok: true, message: '已核销 ¥' + amount.toFixed(2) + '，发票剩余未结 ¥' + after.toFixed(2) + '。', allocation }
  }

  function refundCredit(input: RefundCreditInput): ReceivableActionResult {
    const credit = credits.value.find(row => row.id === input.creditId)
    if (!credit) return { ok: false, message: '未找到销售贷项。' }
    if (credit.status === 'refunded') return { ok: false, message: '该贷项已退款。' }
    const available = creditAvailableOf(credit)
    if (available <= 0) return { ok: false, message: '该贷项已无可退金额。' }
    const amount = money(input.amount)
    if (!Number.isFinite(amount) || amount <= 0) return { ok: false, message: '退款金额必须大于 0。' }
    if (amount > available + 0.005) return { ok: false, message: '退款金额不能超过可退金额 ¥' + available.toFixed(2) + '。' }
    if (!input.bankAccountId || !input.bankName) return { ok: false, message: '请选择退款资金账户。' }
    const refund: SalesRefund = {
      id: nextId('RF-2026-', refunds.value, 1200),
      workspaceId: credit.workspaceId,
      customerName: credit.customerName,
      creditId: credit.id,
      amount: amount.toFixed(2),
      refundedAt: input.refundedAt || dateStamp(),
      bankAccountId: input.bankAccountId,
      bankName: input.bankName,
      reference: input.reference || '销售退货退款'
    }
    refunds.value = [refund, ...refunds.value]
    if (creditAvailableOf(credit) <= 0.005) credit.status = 'refunded'
    return { ok: true, message: '已登记退款 ' + refund.id + '，金额 ¥' + refund.amount + '。', refund }
  }

  function createCreditFromReturn(input: {
    workspaceId: string
    customerName: string
    invoiceId: string
    orderId: string
    fulfillmentId: string
    reason: string
    confirmedAt: string
    lines: { lineNo: number, sku: string, name: string, quantity: number, unitPrice: number }[]
  }): ReceivableActionResult {
    if (!input.lines.length) return { ok: false, message: '退货单没有可生成贷项的明细。' }
    const created: string[] = []
    for (const line of input.lines) {
      const net = line.quantity * line.unitPrice
      const tax = net * 0.13
      const credit: SalesCredit = {
        id: nextId('CR-2026-', credits.value, 1200),
        workspaceId: input.workspaceId,
        customerName: input.customerName,
        invoiceId: input.invoiceId,
        orderId: input.orderId,
        fulfillmentId: input.fulfillmentId,
        lineNo: line.lineNo,
        sku: line.sku,
        name: line.name,
        quantity: line.quantity,
        net: net.toFixed(2),
        tax: tax.toFixed(2),
        total: (net + tax).toFixed(2),
        reason: input.reason,
        confirmedAt: input.confirmedAt,
        status: 'confirmed'
      }
      credits.value = [credit, ...credits.value]
      created.push(credit.id)
    }
    return { ok: true, message: '已生成销售贷项 ' + created.join('、') + '，可在应收台账继续核销或退款。', creditId: created[0] }
  }

  function addInvoice(invoice: Invoice) {
    invoices.value = [invoice, ...invoices.value]
  }

  function saveDraft(invoiceId: string, lines: InvoiceLine[]): ReceivableActionResult {
    const invoice = invoiceById(invoiceId)
    if (!invoice || invoice.status !== 'draft') return { ok: false, message: '仅草稿发票可以编辑。' }
    const cleaned = lines.filter(line => line.quantity > 0).map(line => ({
      ...line,
      taxRate: line.taxRate || '13%',
      amount: money(line.quantity * Number(line.unitPrice)).toFixed(2)
    }))
    if (!cleaned.length) return { ok: false, message: '至少保留一行可开票明细。' }
    const subtotal = cleaned.reduce((sum, line) => sum + Number(line.amount), 0)
    invoice.lines = cleaned
    invoice.amount = (subtotal * 1.13).toFixed(2)
    invoice.taxAmount = (subtotal * 0.13).toFixed(2)
    invoice.updatedAt = dateStamp()
    return { ok: true, message: '草稿已保存，价税合计 ¥' + invoice.amount + '。' }
  }

  function issueInvoice(invoiceId: string): ReceivableActionResult {
    const invoice = invoiceById(invoiceId)
    if (!invoice || invoice.status !== 'draft') return { ok: false, message: '仅草稿发票可以确认开票。' }
    if (!invoice.lines?.length) return { ok: false, message: '请先补充发票明细。' }
    invoice.status = 'issued'
    invoice.issuedAt = dateStamp().slice(0, 10)
    const due = new Date(invoice.issuedAt + 'T00:00:00')
    due.setDate(due.getDate() + 30)
    invoice.dueAt = due.toISOString().slice(0, 10)
    invoice.updatedAt = dateStamp()
    return { ok: true, message: '发票已生效，进入应收台账。' }
  }

  function addDelivery(invoiceId: string, delivery: InvoiceDelivery) {
    const invoice = invoiceById(invoiceId)
    if (!invoice) return false
    invoice.deliveries = [...(invoice.deliveries ?? []), delivery]
    invoice.updatedAt = delivery.at
    return true
  }

  function correctInvoice(invoiceId: string, reason: string, actor: string): ReceivableActionResult {
    const invoice = invoiceById(invoiceId)
    if (!invoice) return { ok: false, message: '未找到发票。' }
    if (!reason.trim()) return { ok: false, message: '请填写更正原因。' }
    const record: InvoiceCorrection = {
      id: nextId('CORR-2026-', corrections.value, 1200),
      workspaceId: invoice.workspaceId,
      invoiceId,
      reason: reason.trim(),
      actor,
      at: dateStamp()
    }
    corrections.value = [record, ...corrections.value]
    invoice.updatedAt = record.at
    return { ok: true, message: '已登记更正原因，正式红字发票由后端生成。' }
  }

  function reset() {
    invoices.value = invoiceSeed.map(cloneInvoice)
    receipts.value = receiptSeed.map(cloneReceipt)
    allocations.value = allocationSeed.map(row => ({ ...row }))
    credits.value = creditSeed.map(cloneCredit)
    refunds.value = refundSeed.map(cloneRefund)
    corrections.value = []
    unbilledReturned.value = {}
  }

  return {
    invoices, receipts, allocations, credits, refunds, corrections,
    invoiceById, allocatedOf, outstandingOf, receiptAllocatedOf, receiptAvailableOf,
    creditAllocatedOf, creditRefundedOf, creditAvailableOf,
    unbilledReturnedOf, invoicedQuantityOf, invoiceableQuantityOf, recordReturnReduction,
    agingBucketsFor, outstandingTotalFor, openInvoiceRowsFor, availableReceiptsFor, openInvoicesFor,
    registerReceipt, allocate, refundCredit, createCreditFromReturn, addInvoice, saveDraft, issueInvoice,
    addDelivery, correctInvoice, reset
  }
})

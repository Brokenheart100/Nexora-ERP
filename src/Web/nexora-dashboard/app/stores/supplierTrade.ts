import { defineStore } from 'pinia'
import type {
  BankAccount,
  PurchaseOrder,
  SupplierBill,
  SupplierBillLine,
  SupplierCredit,
  SupplierPayment,
  SupplierRefund
} from '~/mocks'
import {
  bankAccounts,
  purchaseOrders,
  supplierBills,
  supplierCredits,
  supplierPayments,
  supplierRefunds
} from '~/mocks'

export interface SupplierReceiptLineMatch {
  id: string
  workspaceId: string
  orderId: string
  orderSupplier: string
  receiptId: string
  receiptLineNo: number
  receivedAt: string
  receiver: string
  sku: string
  name: string
  spec: string
  quantity: number
  unitPrice: number
  accrualAmount: number
  matchedQuantity: number
  availableQuantity: number
  variance: number
  variancePending: boolean
  status: 'matched' | 'partial' | 'available'
}

export interface CreateSupplierBillInput {
  date: string
  dueAt: string
  note?: string
  lines: Array<{
    receiptId: string
    receiptLineNo: number
    quantity: number
    unitPrice: number
  }>
}

export interface SupplierBillActionResult {
  ok: boolean
  message: string
  bill?: SupplierBill
  creditId?: string
}

function money(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

function cloneBill(bill: SupplierBill): SupplierBill {
  return {
    ...bill,
    receiptIds: [...bill.receiptIds],
    lines: bill.lines.map(line => ({ ...line }))
  }
}

function cloneCredit(credit: SupplierCredit): SupplierCredit {
  return { ...credit }
}

function clonePayment(payment: SupplierPayment): SupplierPayment {
  return { ...payment }
}

function cloneRefund(refund: SupplierRefund): SupplierRefund {
  return { ...refund }
}

function nextId(prefix: string, rows: Array<{ id: string }>, start: number) {
  const max = rows.reduce((value, row) => {
    if (!row.id.startsWith(prefix)) return value
    const parsed = Number(row.id.slice(prefix.length))
    return Number.isFinite(parsed) ? Math.max(value, parsed) : value
  }, start)
  return prefix + String(max + 1).padStart(4, '0')
}

export const useSupplierTradeStore = defineStore('supplier-trade', () => {
  const bills = ref<SupplierBill[]>(supplierBills.map(cloneBill))
  const payments = ref<SupplierPayment[]>(supplierPayments.map(clonePayment))
  const credits = ref<SupplierCredit[]>(supplierCredits.map(cloneCredit))
  const refunds = ref<SupplierRefund[]>(supplierRefunds.map(cloneRefund))
  const lastPaymentSignature = ref('')
  const lastPaymentAt = ref(0)

  const postedBills = computed(() => bills.value.filter(bill => bill.status === 'posted'))
  const pendingBills = computed(() => bills.value.filter(bill => bill.status === 'pending'))

  const paymentsOf = (billId: string) => payments.value.filter(payment => payment.billId === billId)
  const creditsOf = (billId: string) => credits.value.filter(credit => credit.billId === billId)
  const refundsOf = (creditId: string) => refunds.value.filter(refund => refund.creditId === creditId)

  function paidOf(billId: string) {
    return money(paymentsOf(billId).reduce((sum, payment) => sum + payment.amount, 0))
  }

  function creditedOf(billId: string) {
    return money(creditsOf(billId).reduce((sum, credit) => sum + credit.total, 0))
  }

  function outstandingOf(bill: SupplierBill) {
    return money(Math.max(0, bill.total - paidOf(bill.id) - creditedOf(bill.id)))
  }

  function recoverableOf(credit: SupplierCredit) {
    const refunded = refundsOf(credit.id).reduce((sum, refund) => sum + refund.amount, 0)
    return money(Math.max(0, credit.total - refunded))
  }

  function billStatus(bill: SupplierBill): { label: string, color: 'warning' | 'success' | 'info' | 'neutral' } {
    if (bill.status === 'pending') return { label: '待复核', color: 'warning' }
    if (bill.status === 'cancelled') return { label: '已退回', color: 'neutral' }
    const outstanding = outstandingOf(bill)
    if (outstanding <= 0.005) return { label: '已结清', color: 'success' }
    if (paidOf(bill.id) > 0 || creditedOf(bill.id) > 0) return { label: '部分付款', color: 'info' }
    return { label: '待付款', color: 'warning' }
  }

  /**
   * 由采购收货单推导的匹配视图：已匹配数量包含待复核账单，
   * 可匹配数量用于新建账单；价差为账单单价与采购单价之差。
   */
  const receiptLines = computed<SupplierReceiptLineMatch[]>(() => {
    const rows: SupplierReceiptLineMatch[] = []
    for (const order of purchaseOrders) {
      addOrderReceiptLines(order, rows)
    }
    return rows
  })

  function addOrderReceiptLines(order: PurchaseOrder, rows: SupplierReceiptLineMatch[]) {
    for (const receipt of order.receipts ?? []) {
      for (const receiptLine of receipt.lines) {
        const orderLine = order.lines.find(line => line.lineNo === receiptLine.lineNo)
        if (!orderLine) continue
        const matchedLines = bills.value
          .filter(bill => bill.status !== 'cancelled')
          .flatMap(bill => bill.lines
            .filter(line => line.receiptId === receipt.id && line.receiptLineNo === receiptLine.lineNo)
            .map(line => ({ line, billStatus: bill.status })))
        const matchedQuantity = money(matchedLines.reduce((sum, item) => sum + item.line.quantity, 0))
        const variance = money(matchedLines.reduce((sum, item) => sum + item.line.variance, 0))
        const availableQuantity = money(Math.max(0, receiptLine.quantity - matchedQuantity))
        const status = availableQuantity <= 0.005 ? 'matched' : matchedQuantity > 0 ? 'partial' : 'available'
        rows.push({
          id: receipt.id + ':' + receiptLine.lineNo,
          workspaceId: order.workspaceId,
          orderId: order.id,
          orderSupplier: order.supplier,
          receiptId: receipt.id,
          receiptLineNo: receiptLine.lineNo,
          receivedAt: receipt.receivedAt,
          receiver: receipt.receiver,
          sku: receiptLine.sku,
          name: receiptLine.name,
          spec: orderLine.spec,
          quantity: receiptLine.quantity,
          unitPrice: orderLine.unitPrice,
          accrualAmount: money(receiptLine.quantity * orderLine.unitPrice),
          matchedQuantity,
          availableQuantity,
          variance,
          variancePending: matchedLines.some(item => item.billStatus === 'pending' && Math.abs(item.line.variance) > 0.005),
          status
        })
      }
    }
  }

  const outstandingTotal = computed(() => money(postedBills.value.reduce((sum, bill) => sum + outstandingOf(bill), 0)))

  function createBill(input: CreateSupplierBillInput): SupplierBillActionResult {
    if (!input.lines.length) return { ok: false, message: '至少选择一行可匹配的收货明细。' }
    const prepared: Array<Omit<SupplierBillLine, 'id'>> = []
    let orderId = ''
    let supplier = ''
    let workspaceId = ''
    const seen = new Set<string>()
    for (const inputLine of input.lines) {
      const key = inputLine.receiptId + ':' + inputLine.receiptLineNo
      if (seen.has(key)) return { ok: false, message: '同一收货明细不能重复加入账单。' }
      seen.add(key)
      const match = receiptLines.value.find(line => line.receiptId === inputLine.receiptId && line.receiptLineNo === inputLine.receiptLineNo)
      if (!match) return { ok: false, message: '收货明细不存在或已被删除。' }
      const quantity = Number(inputLine.quantity)
      const unitPrice = Number(inputLine.unitPrice)
      if (!Number.isFinite(quantity) || quantity <= 0) return { ok: false, message: '账单数量必须大于 0。' }
      if (quantity - match.availableQuantity > 0.005) return { ok: false, message: '账单数量超过可匹配数量：' + match.sku + '。' }
      if (!Number.isFinite(unitPrice) || unitPrice < 0) return { ok: false, message: '账单单价不能为负数。' }
      if (orderId && match.orderId !== orderId) return { ok: false, message: '同一张账单只能匹配同一采购订单的收货行。' }
      orderId = match.orderId
      supplier = match.orderSupplier
      workspaceId = match.workspaceId
      const net = money(quantity * unitPrice)
      const tax = money(net * 0.13)
      prepared.push({
        receiptId: match.receiptId,
        receiptLineNo: match.receiptLineNo,
        orderLineNo: match.receiptLineNo,
        sku: match.sku,
        name: match.name,
        quantity,
        unitPrice,
        accrualUnitPrice: match.unitPrice,
        net,
        tax,
        total: money(net + tax),
        variance: money((unitPrice - match.unitPrice) * quantity)
      })
    }
    const id = nextId('BILL-2026-', bills.value, 1101)
    const net = money(prepared.reduce((sum, line) => sum + line.net, 0))
    const tax = money(prepared.reduce((sum, line) => sum + line.tax, 0))
    const bill: SupplierBill = {
      id,
      workspaceId,
      supplier,
      orderId,
      receiptIds: [...new Set(prepared.map(line => line.receiptId))],
      date: input.date,
      dueAt: input.dueAt,
      status: 'pending',
      lines: prepared.map((line, index) => ({ ...line, id: 'BL-' + id.slice(-4) + '-' + String(index + 1).padStart(2, '0') })),
      net,
      tax,
      total: money(net + tax),
      note: input.note
    }
    bills.value.unshift(bill)
    return { ok: true, message: '供应商账单 ' + id + ' 已提交复核。', bill }
  }

  function reviewBill(billId: string, decision: 'approve' | 'reject'): SupplierBillActionResult {
    const bill = bills.value.find(item => item.id === billId)
    if (!bill) return { ok: false, message: '账单不存在。' }
    if (bill.status !== 'pending') return { ok: false, message: '只有待复核账单可以复核。' }
    if (decision === 'reject') {
      bill.status = 'cancelled'
      bill.reviewer = '陈昊'
      bill.reviewedAt = '2026-11-18 15:40'
      return { ok: true, message: '账单 ' + bill.id + ' 已退回供应商。', bill }
    }
    bill.status = 'posted'
    bill.reviewer = '陈昊'
    bill.reviewedAt = '2026-11-18 15:40'
    bill.journalId = 'JE-AP-2026-' + bill.id.slice(-4)
    return { ok: true, message: '账单 ' + bill.id + ' 已复核过账，应付余额已更新。', bill }
  }

  function payBill(input: {
    billId: string
    amount: number
    bankAccountId: string
    method: SupplierPayment['method']
    reference?: string
    note?: string
  }): SupplierBillActionResult {
    const bill = bills.value.find(item => item.id === input.billId)
    if (!bill) return { ok: false, message: '账单不存在。' }
    if (bill.status !== 'posted') return { ok: false, message: '只有已过账账单可以付款。' }
    const outstanding = outstandingOf(bill)
    if (outstanding <= 0.005) return { ok: false, message: '该账单已结清，不能重复付款。' }
    const amount = money(Number(input.amount))
    if (!Number.isFinite(amount) || amount <= 0) return { ok: false, message: '付款金额必须大于 0。' }
    if (amount - outstanding > 0.005) {
      return { ok: false, message: '付款金额不能超过未结金额 ¥' + outstanding.toFixed(2) + '。' }
    }
    const bank = bankAccounts.find((account: BankAccount) => account.id === input.bankAccountId)
    if (!bank) return { ok: false, message: '请选择资金账户。' }
    if (bank.status !== 'active') return { ok: false, message: '该资金账户已停用，不能付款。' }
    const signature = bill.id + ':' + amount.toFixed(2) + ':' + bank.id
    const now = Date.now()
    if (signature === lastPaymentSignature.value && now - lastPaymentAt.value < 8000) {
      return { ok: false, message: '检测到重复提交，请稍后刷新付款记录后再试。' }
    }
    const payment: SupplierPayment = {
      id: nextId('PAY-2026-', payments.value, 1101),
      workspaceId: bill.workspaceId,
      billId: bill.id,
      date: '2026-11-18',
      amount,
      bankAccountId: bank.id,
      bankName: bank.bankName,
      method: input.method,
      reference: input.reference?.trim() || 'BANK-20261118-' + String(payments.value.length + 1).padStart(3, '0'),
      note: input.note
    }
    payments.value.unshift(payment)
    lastPaymentSignature.value = signature
    lastPaymentAt.value = now
    return { ok: true, message: '付款 ¥' + amount.toFixed(2) + ' 已登记，账单未结 ¥' + outstandingOf(bill).toFixed(2) + '。' }
  }

  function recordRefund(creditId: string, bankAccountId: string): SupplierBillActionResult {
    const credit = credits.value.find(item => item.id === creditId)
    if (!credit) return { ok: false, message: '贷项不存在。' }
    if (credit.status === 'refunded') return { ok: false, message: '该贷项已退款。' }
    const amount = recoverableOf(credit)
    if (amount <= 0.005) return { ok: false, message: '该贷项没有可退金额。' }
    const bank = bankAccounts.find((account: BankAccount) => account.id === bankAccountId)
    if (!bank) return { ok: false, message: '请选择退款资金账户。' }
    refunds.value.unshift({
      id: nextId('RF-2026-', refunds.value, 1101),
      workspaceId: credit.workspaceId,
      creditId: credit.id,
      date: '2026-11-18',
      amount,
      bankAccountId: bank.id,
      bankName: bank.bankName,
      reference: 'REF-20261118-' + String(refunds.value.length + 1).padStart(3, '0')
    })
    credit.status = 'refunded'
    return { ok: true, message: '供应商退款 ¥' + amount.toFixed(2) + ' 已登记。' }
  }

  function createCreditFromReturn(input: {
    workspaceId: string
    billId: string
    orderId: string
    receiptId: string
    reason: string
    confirmedAt: string
    lines: { lineNo: number, sku: string, name: string, quantity: number, unitPrice: number }[]
  }): SupplierBillActionResult {
    if (!input.lines.length) return { ok: false, message: '退货单没有可生成贷项的明细。' }
    const created: string[] = []
    for (const line of input.lines) {
      const net = line.quantity * line.unitPrice
      const tax = net * 0.13
      const credit: SupplierCredit = {
        id: nextId('CR-2026-', credits.value, 1100),
        workspaceId: input.workspaceId,
        billId: input.billId,
        orderId: input.orderId,
        receiptId: input.receiptId,
        receiptLineNo: line.lineNo,
        sku: line.sku,
        name: line.name,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        net,
        tax,
        total: net + tax,
        reason: input.reason,
        confirmedAt: input.confirmedAt,
        status: 'confirmed'
      }
      credits.value = [credit, ...credits.value]
      created.push(credit.id)
    }
    return { ok: true, message: '已生成供应商贷项 ' + created.join('、') + '，可在采购应付继续核销或退款。', creditId: created[0] }
  }

  function reset() {
    bills.value = supplierBills.map(cloneBill)
    payments.value = supplierPayments.map(clonePayment)
    credits.value = supplierCredits.map(cloneCredit)
    refunds.value = supplierRefunds.map(cloneRefund)
    lastPaymentSignature.value = ''
    lastPaymentAt.value = 0
  }

  return {
    bills,
    payments,
    credits,
    refunds,
    postedBills,
    pendingBills,
    outstandingTotal,
    receiptLines,
    paymentsOf,
    creditsOf,
    refundsOf,
    paidOf,
    creditedOf,
    outstandingOf,
    recoverableOf,
    billStatus,
    createBill,
    reviewBill,
    payBill,
    recordRefund,
    createCreditFromReturn,
    reset
  }
})

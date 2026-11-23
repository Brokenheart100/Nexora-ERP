<script setup lang="ts">
import { usePayablesConnection, type PayableDraftLine } from '~/composables/finance/usePayablesConnection'
import { displayDecimal } from '~/utils/api/decimal-display'
import { tradeTermsSchema } from '#shared/types/trade'
import { compareDecimal, multiplyDecimals, roundDecimal, subtractDecimal, sumDecimals } from '#shared/utils/decimal'
import type { SupplierCredit, SupplierPayment } from '~/mocks'
import FinancePayablesAgingCredits from '~/components/finance/PayablesAgingCredits.vue'
import FinancePayablesBills from '~/components/finance/PayablesBills.vue'
import FinancePayablesReceipts from '~/components/finance/PayablesReceipts.vue'
import FinancePayablesSummary from '~/components/finance/PayablesSummary.vue'
import { purchaseOrders, supplierPaymentMethodLabels } from '~/mocks'
import { useBankReconStore } from '~/stores/bankRecon'

const props = defineProps<{ canPost: boolean, initialBillId?: string }>()
const connection = usePayablesConnection()
const connected = computed(() => connection.query.connected)
const canPost = computed(() => (connected.value ? connection.canSubmit : props.canPost))
const paymentOn = ref(new Date().toLocaleDateString('en-CA'))
const displayMoney = (value: string | number) =>
  typeof value === 'string' ? displayDecimal(value, connection.query.data?.home.minorUnits ?? 2) : formatMoney(value)
const positive = (value: string | number) =>
  typeof value === 'string' ? /^-?\d+(\.\d+)?$/.test(value) && compareDecimal(value, '0') > 0 : value > 0.005
const hasVariance = computed(() =>
  connected.value ? connection.raw(detailId.value)?.terms.method === 'approve-cost-variance' : Number(detailVariance.value) !== 0
)
const toast = useToast()
const store = useSupplierTradeStore()
const bankRecon = useBankReconStore()
const { activeWorkspaceId } = useMockWorkspace()

const workspaceId = computed(() => activeWorkspaceId.value)
const workspaceBills = computed(() => store.bills.filter(bill => bill.workspaceId === workspaceId.value))
const workspaceReceiptLines = computed(() => store.receiptLines.filter(line => line.workspaceId === workspaceId.value))
const availableReceiptLines = computed(() => workspaceReceiptLines.value.filter(line => line.availableQuantity > 0.005))
const outstandingTotal = computed(() =>
  connected.value
    ? connection.reports.data?.aging.state === 'ready'
      ? connection.reports.data.aging.data.total
      : '待查询'
    : workspaceBills.value.filter(bill => bill.status === 'posted').reduce((sum, bill) => sum + store.outstandingOf(bill), 0)
)
const pendingCount = computed(() =>
  connected.value
    ? connection.bills.filter(value => value.status === 'pending').length
    : workspaceBills.value.filter(bill => bill.status === 'pending').length
)
const availableCount = computed(() =>
  connected.value
    ? connection.receiptRows.filter(value => value.posted && compareDecimal(value.availableQuantity, '0') > 0).length
    : availableReceiptLines.value.length
)
const paymentCount = computed(() =>
  connected.value ? connection.payments.length : store.payments.filter(payment => payment.workspaceId === workspaceId.value).length
)
const fixedBill = computed(() => store.bills.find(bill => bill.id === 'BILL-2026-1101') ?? null)
const fixedOutstanding = computed(() => (fixedBill.value ? store.outstandingOf(fixedBill.value) : 0))
const fixedPaid = computed(() => (fixedBill.value ? store.paidOf(fixedBill.value.id) : 0))
const fixedVoidedAmount = computed(() =>
  fixedBill.value
    ? store
        .paymentsOf(fixedBill.value.id)
        .filter(payment => payment.status === 'voided')
        .reduce((sum, payment) => sum + payment.amount, 0)
    : 0
)
const fixedDescription = computed(() => {
  if (fixedVoidedAmount.value > 0) {
    return (
      '账单 BILL-2026-1101 价税合计 ¥1,130.00，已作废 '
      + formatMoney(fixedVoidedAmount.value)
      + ' 付款，当前未结恢复为 '
      + formatMoney(fixedOutstanding.value)
      + '。冲销记录与更正后的银行流水可在付款详情查看。'
    )
  }
  return (
    '账单 BILL-2026-1101 价税合计 ¥1,130.00，已付 '
    + formatMoney(fixedPaid.value)
    + '，当前未结 '
    + formatMoney(fixedOutstanding.value)
    + '。登记余款后，账单详情与应付账龄会同步结清。'
  )
})

const detailOpen = ref(false)
const detailId = ref('')
const detailError = ref('')
const varianceConfirmed = ref(false)
const detailBill = computed(() =>
  connected.value ? connection.billView(detailId.value) : (store.bills.find(bill => bill.id === detailId.value) ?? null)
)
const detailAssessmentIds = computed(() => {
  const terms = connected.value ? connection.raw(detailId.value)?.terms : undefined
  if (terms?.billReceipts) return Object.fromEntries(terms.billReceipts.map(line => [line.receiptId, line.taxAssessmentId]))
  return terms?.sourceId ? { [terms.sourceId]: terms.taxAssessmentId } : {}
})
const detailPayments = computed(() =>
  connected.value
    ? connection.payments.filter(value => value.billId === detailId.value)
    : detailBill.value
      ? store.paymentsOf(detailBill.value.id)
      : []
)
const detailCredits = computed(() => (connected.value ? [] : detailBill.value ? store.creditsOf(detailBill.value.id) : []))
const detailVariance = computed(() =>
  connected.value
    ? sumDecimals((connection.raw(detailId.value)?.billMatches ?? []).map(value => value.variance))
    : Math.round(
      (store.bills.find(value => value.id === detailId.value)?.lines.reduce((sum, line) => sum + line.variance, 0) ?? 0) * 100
    ) / 100
)
const detailOutstanding = computed(() => {
  if (connected.value) return connection.outstanding(detailId.value)
  const bill = store.bills.find(value => value.id === detailId.value)
  return bill ? store.outstandingOf(bill) : 0
})
async function openBill(id: string) {
  if (connected.value) {
    if (!await connection.select(id)) return
    if (connection.billView(id)) {
      detailId.value = id
      detailError.value = ''
      varianceConfirmed.value = false
      detailOpen.value = true
    }
    return
  }
  if (!store.bills.some(bill => bill.id === id)) {
    detailOpen.value = false
    return
  }
  detailId.value = id
  detailError.value = ''
  varianceConfirmed.value = false
  detailOpen.value = true
}
function closeBill() {
  detailOpen.value = false
  detailError.value = ''
}
async function approveBill() {
  if (connected.value) {
    if (hasVariance.value && !varianceConfirmed.value) {
      detailError.value = '请先独立核对采购价差。'
      return
    }
    await connection.decide(detailId.value, 'approve')
    return
  }
  if (!detailBill.value) return
  if (!props.canPost) {
    detailError.value = '当前演示身份没有 finance.post 权限，不能复核或过账。'
    return
  }
  if (Number(detailVariance.value) > 0.005 && !varianceConfirmed.value) {
    detailError.value = '该账单存在采购价差，请先勾选「已核对价差」再复核。'
    return
  }
  const result = store.reviewBill(detailBill.value.id, 'approve')
  if (!result.ok) {
    detailError.value = result.message
    return
  }
  detailError.value = ''
  toast.add({ title: '账单已复核过账', description: result.message, color: 'success', icon: 'i-carbon-checkmark' })
}
function rejectBill() {
  if (connected.value) {
    connection.decide(detailId.value, 'cancel')
    return
  }
  if (!detailBill.value || !props.canPost) return
  const result = store.reviewBill(detailBill.value.id, 'reject')
  if (!result.ok) {
    detailError.value = result.message
    return
  }
  toast.add({ title: '账单已退回', description: result.message, color: 'neutral', icon: 'i-carbon-undo' })
  closeBill()
}

const paymentOpen = ref(false)
const paymentBillId = ref('')
const paymentError = ref('')
const paymentForm = reactive<{
  amount: string
  bankId: string
  method: SupplierPayment['method']
  reference: string
  note: string
}>({
  amount: '',
  bankId: 'ba-2026-01',
  method: 'transfer',
  reference: '',
  note: ''
})
const paymentBill = computed(() =>
  connected.value ? connection.billView(paymentBillId.value) : (store.bills.find(bill => bill.id === paymentBillId.value) ?? null)
)
const paymentOutstanding = computed(() => {
  if (connected.value) return connection.raw(paymentBillId.value)?.outstanding ?? '0'
  const bill = store.bills.find(value => value.id === paymentBillId.value)
  return bill ? store.outstandingOf(bill) : 0
})
const paymentAfter = computed(() => {
  if (connected.value) {
    try {
      const value = subtractDecimal(String(paymentOutstanding.value), String(paymentForm.amount))
      return compareDecimal(value, '0') < 0 ? '金额超过未结' : value
    } catch {
      return '待填写'
    }
  }
  const amount = Number(paymentForm.amount)
  if (!Number.isFinite(amount)) return paymentOutstanding.value
  return Math.max(0, Math.round((Number(paymentOutstanding.value) - amount) * 100) / 100)
})
const activeBankItems = computed(() =>
  connected.value
    ? (connection.query.data?.home.banks.map(value => ({ label: value.code + ' ' + value.name, value: value.id })) ?? [])
    : bankRecon.accounts
        .filter(account => account.status === 'active')
        .map(account => ({ label: account.bankName + ' · ' + account.accountNo.slice(-4), value: account.id }))
)
const paymentMethodItems = Object.entries(supplierPaymentMethodLabels).map(([value, label]) => ({ label, value }))
const eligiblePaymentBills = computed(() => {
  const options = connection.paymentOptions
  const current = connection.billView(paymentBillId.value)
  return current?.status === 'posted' && positive(paymentOutstanding.value) && !options.some(value => value.value === current.id)
    ? [{ value: current.id, label: current.number + ' · ' + current.supplier + ' · 未结 ' + paymentOutstanding.value }, ...options]
    : options
})
async function choosePaymentBill(billId: string) {
  if (!connection.canSubmit || connection.locked || !await connection.select(billId)) return false
  const bill = connection.raw(billId)
  if (!bill || bill.terms.kind !== 1 || bill.state !== 'posted' || !positive(bill.outstanding)) return false
  paymentBillId.value = bill.id
  paymentForm.amount = bill.outstanding
  return true
}
async function openPayment(billId: string) {
  if (connected.value) {
    if (!await choosePaymentBill(billId)) return
    paymentOn.value = new Date().toLocaleDateString('en-CA')
    Object.assign(paymentForm, {
      bankId: activeBankItems.value[0]?.value ?? '',
      method: 'transfer',
      reference: '',
      note: '供应商付款'
    })
    paymentError.value = ''
    connection.error = ''
    detailOpen.value = false
    paymentOpen.value = true
    return
  }
  const bill = store.bills.find(item => item.id === billId)
  if (!bill) return
  paymentBillId.value = billId
  paymentForm.amount = store.outstandingOf(bill).toFixed(2)
  paymentForm.bankId = activeBankItems.value[0]?.value ?? ''
  paymentForm.method = 'transfer'
  paymentForm.reference = ''
  paymentForm.note = ''
  paymentError.value = ''
  detailOpen.value = false
  paymentOpen.value = true
}
async function submitPayment() {
  if (connected.value) {
    if (
      await connection.savePayment(paymentBillId.value, {
        number: paymentForm.reference,
        on: paymentOn.value,
        amount: String(paymentForm.amount),
        bankId: paymentForm.bankId,
        memo: paymentForm.note
      })
    ) {
      paymentOpen.value = false
      if (connection.submission.result) await openPaymentDetail(connection.submission.result.id)
    }
    return
  }
  if (!paymentBill.value) return
  if (!props.canPost) {
    paymentError.value = '当前演示身份没有 finance.post 权限，不能登记付款。'
    return
  }
  const amount = Number(paymentForm.amount)
  if (!Number.isFinite(amount) || amount <= 0) {
    paymentError.value = '付款金额必须大于 0。'
    return
  }
  const result = store.payBill({
    billId: paymentBill.value.id,
    amount,
    bankAccountId: paymentForm.bankId,
    method: paymentForm.method,
    reference: paymentForm.reference,
    note: paymentForm.note
  })
  if (!result.ok) {
    paymentError.value = result.message
    return
  }
  const billId = paymentBill.value.id
  paymentOpen.value = false
  toast.add({ title: '付款已登记', description: result.message, color: 'success', icon: 'i-carbon-currency-yen' })
  openBill(billId)
}

const paymentDetailOpen = ref(false)
const paymentDetailId = ref('')
const paymentVoidReason = ref('')
const paymentVoidError = ref('')
const paymentVoidNumber = ref('')
const paymentVoidDate = ref('')
const selectedPayment = computed(() =>
  connected.value
    ? connection.paymentView(paymentDetailId.value)
    : (store.payments.find(payment => payment.id === paymentDetailId.value) ?? null)
)
const selectedPaymentBill = computed(() =>
  connected.value
    ? connection.billView(selectedPayment.value?.billId ?? '')
    : selectedPayment.value
      ? (store.bills.find(bill => bill.id === selectedPayment.value?.billId) ?? null)
      : null
)
const selectedPaymentReversalTx = computed(() => {
  const transactionId = selectedPayment.value?.reversal?.bankTransactionId
  return transactionId ? (bankRecon.transactions.find(transaction => transaction.id === transactionId) ?? null) : null
})
const selectedPaymentReversalAccount = computed(() => {
  const accountId = selectedPayment.value?.reversal?.bankAccountId
  return accountId ? (bankRecon.accounts.find(account => account.id === accountId) ?? null) : null
})
async function openPaymentDetail(paymentId: string) {
  if (connected.value) {
    if (!await connection.select(paymentId)) return
    const payment = connection.paymentView(paymentId)
    if (payment) {
      if (payment.billId) await connection.select(payment.billId)
      paymentDetailId.value = paymentId
      paymentVoidReason.value = paymentVoidError.value = paymentVoidNumber.value = ''
      paymentVoidDate.value = new Date().toLocaleDateString('en-CA')
      detailOpen.value = false
      paymentDetailOpen.value = true
    }
    return
  }
  const payment = store.payments.find(item => item.id === paymentId)
  if (!payment) return
  paymentDetailId.value = paymentId
  paymentVoidReason.value = ''
  paymentVoidError.value = ''
  paymentDetailOpen.value = true
}
function openPaymentBill() {
  if (!selectedPaymentBill.value) return
  const billId = selectedPaymentBill.value.id
  paymentDetailOpen.value = false
  openBill(billId)
}
async function submitVoidPayment() {
  if (!selectedPayment.value) return
  if (connected.value) {
    if (await connection.voidPayment(selectedPayment.value.id, { number: paymentVoidNumber.value, on: paymentVoidDate.value, memo: paymentVoidReason.value }))
      paymentVoidReason.value = paymentVoidNumber.value = ''
    return
  }
  if (!props.canPost) {
    paymentVoidError.value = '当前演示身份没有 finance.post 权限，不能发起作废更正。'
    return
  }
  const result = store.voidPayment(selectedPayment.value.id, paymentVoidReason.value)
  if (!result.ok) {
    paymentVoidError.value = result.message
    return
  }
  toast.add({ title: '付款已作废', description: result.message, color: 'success', icon: 'i-carbon-undo' })
  paymentVoidReason.value = ''
  paymentVoidError.value = ''
}

interface DraftBillLine {
  receiptId: string
  receiptLineNo: number
  quantity: number
  unitPrice: number
}
const formOpen = ref(false)
const mockFormLineKey = ref('')
const mockFormNote = ref('')
const formError = ref('')
const mockFormLines = ref<DraftBillLine[]>([])
const formOrderId = computed(() => {
  if (connected.value) return connection.orderId
  const first = mockFormLines.value[0]
  if (!first) return ''
  return (
    workspaceReceiptLines.value.find(line => line.receiptId === first.receiptId && line.receiptLineNo === first.receiptLineNo)
      ?.orderId ?? ''
  )
})
const formSupplier = computed(() => {
  if (connected.value) return connection.supplierId ? connection.partnerName(connection.supplierId) : ''
  const first = mockFormLines.value[0]
  if (!first) return ''
  return (
    workspaceReceiptLines.value.find(line => line.receiptId === first.receiptId && line.receiptLineNo === first.receiptLineNo)
      ?.orderSupplier ?? ''
  )
})
const formLineOptions = computed(() =>
  connected.value
    ? connection.options
    : availableReceiptLines.value
        .filter(
          line => !mockFormLines.value.some(item => item.receiptId === line.receiptId && item.receiptLineNo === line.receiptLineNo)
        )
        .filter(line => !formOrderId.value || line.orderId === formOrderId.value)
        .map(line => ({ label: line.receiptId + ' · ' + line.sku + ' · 可匹配 ' + line.availableQuantity, value: line.id }))
)
const mockFormNet = computed(
  () => Math.round(mockFormLines.value.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0) * 100) / 100
)
const mockFormTax = computed(() => Math.round(mockFormNet.value * 0.13 * 100) / 100)
const mockFormTotal = computed(() => Math.round((mockFormNet.value + mockFormTax.value) * 100) / 100)
const formVariance = computed(
  () =>
    Math.round(
      mockFormLines.value.reduce((sum, line) => {
        const match = workspaceReceiptLines.value.find(
          item => item.receiptId === line.receiptId && item.receiptLineNo === line.receiptLineNo
        )
        return sum + (line.unitPrice - (match?.unitPrice ?? line.unitPrice)) * line.quantity
      }, 0) * 100
    ) / 100
)
function openBillForm() {
  if (connected.value) {
    connection.startBill()
    formOpen.value = true
    return
  }
  mockFormLines.value = []
  mockFormLineKey.value = ''
  mockFormNote.value = ''
  formError.value = ''
  formOpen.value = true
}
function addFormLine() {
  if (connected.value) {
    connection.addLine()
    return
  }
  const selected = workspaceReceiptLines.value.find(line => line.id === mockFormLineKey.value)
  if (!selected || selected.availableQuantity <= 0.005) return
  mockFormLines.value.push({
    receiptId: selected.receiptId,
    receiptLineNo: selected.receiptLineNo,
    quantity: selected.availableQuantity,
    unitPrice: selected.unitPrice
  })
  mockFormLineKey.value = ''
}
function removeFormLine(index: number) {
  if (connected.value) {
    if (!connection.locked) connection.billLines.splice(index, 1)
    return
  }
  mockFormLines.value.splice(index, 1)
}
function updateDraftQuantity(line: DraftBillLine | PayableDraftLine, value: string | number) {
  if (connected.value) {
    connection.updateLine(line.receiptId, 'quantity', value)
    return
  }
  line.quantity = Number(value)
}
function updateDraftPrice(line: DraftBillLine | PayableDraftLine, value: string | number) {
  if (connected.value) {
    connection.updateLine(line.receiptId, 'unitPrice', value)
    return
  }
  line.unitPrice = Number(value)
}
function draftMatchedQuantity(line: DraftBillLine | PayableDraftLine) {
  if (connected.value) return connection.available(line.receiptId)
  return (
    workspaceReceiptLines.value.find(item => item.receiptId === line.receiptId && item.receiptLineNo === line.receiptLineNo)
      ?.availableQuantity ?? 0
  )
}
async function submitBillForm() {
  if (connected.value) {
    if (await connection.saveBill()) {
      formOpen.value = false
      if (connection.submission.result) await openBill(connection.submission.result.id)
    }
    return
  }
  if (!props.canPost) {
    formError.value = '当前演示身份没有 finance.post 权限，不能录入账单。'
    return
  }
  if (!mockFormLines.value.length) {
    formError.value = '请先选择至少一行可匹配的收货明细。'
    return
  }
  const result = store.createBill({
    date: '2026-11-18',
    dueAt: '2026-12-18',
    note: mockFormNote.value.trim() || undefined,
    lines: mockFormLines.value.map(line => ({ ...line }))
  })
  if (!result.ok) {
    formError.value = result.message
    return
  }
  formOpen.value = false
  toast.add({ title: '账单已提交复核', description: result.message, color: 'success', icon: 'i-carbon-document-add' })
  if (result.bill) openBill(result.bill.id)
}

const creditOpen = ref(false)
const creditId = ref('')
function creditBill(credit: SupplierCredit) {
  return store.bills.find(bill => bill.id === credit.billId) ?? null
}

const selectedCredit = computed(() => store.credits.find(credit => credit.id === creditId.value) ?? null)
const selectedCreditBill = computed(() => (selectedCredit.value ? creditBill(selectedCredit.value) : null))
const selectedCreditRefunds = computed(() => (selectedCredit.value ? store.refundsOf(selectedCredit.value.id) : []))
const selectedCreditRecoverable = computed(() => (selectedCredit.value ? store.recoverableOf(selectedCredit.value) : 0))
const selectedCreditReceipt = computed(() => {
  if (!selectedCredit.value) return null
  const order = purchaseOrders.find(item => item.id === selectedCredit.value?.orderId)
  return order?.receipts?.find(receipt => receipt.id === selectedCredit.value?.receiptId) ?? null
})
function openCredit(id: string) {
  if (connected.value) return
  creditId.value = id
  creditOpen.value = true
}
function openCreditFromBill(id: string) {
  detailOpen.value = false
  openCredit(id)
}
function showCreditBill() {
  if (!selectedCreditBill.value) return
  const billId = selectedCreditBill.value.id
  creditOpen.value = false
  openBill(billId)
}
function refundCredit() {
  if (!selectedCredit.value) return
  const result = store.recordRefund(selectedCredit.value.id, 'ba-2026-01')
  toast.add({
    title: result.ok ? '退款已登记' : '退款未登记',
    description: result.message,
    color: result.ok ? 'success' : 'warning',
    icon: 'i-carbon-currency-yen'
  })
}
onMounted(() => {
  if (props.initialBillId) openBill(props.initialBillId)
})
watch(
  () => props.initialBillId,
  (id) => {
    if (id) openBill(id)
  }
)

const formLines = computed(() => (connected.value ? connection.billLines : mockFormLines.value))
const formNote = computed({
  get: () => (connected.value ? connection.billForm.memo : mockFormNote.value),
  set: (value) => {
    if (connected.value) connection.billForm.memo = value
    else mockFormNote.value = value
  }
})
const formLineKey = computed({
  get: () => (connected.value ? connection.chosenReceipt : mockFormLineKey.value),
  set: (value) => {
    if (connected.value) connection.chosenReceipt = value
    else mockFormLineKey.value = value
  }
})
const formNet = computed(() => (connected.value ? connection.formAmount('net') : mockFormNet.value))
const formTax = computed(() => (connected.value ? connection.formAmount('tax') : mockFormTax.value))
const formTotal = computed(() => (connected.value ? connection.formAmount('total') : mockFormTotal.value))
function billState(id: string) {
  if (connected.value) return { label: connection.state(id), color: 'neutral' as const }
  const bill = store.bills.find(value => value.id === id)
  return bill ? store.billStatus(bill) : { label: '待查询', color: 'neutral' as const }
}
function billOutstanding(id: string) {
  if (connected.value) return connection.outstanding(id)
  const bill = store.bills.find(value => value.id === id)
  return bill ? store.outstandingOf(bill) : 0
}
function billLineAmount(line: DraftBillLine | PayableDraftLine, tax = false) {
  if (!connected.value) return Number(line.quantity) * Number(line.unitPrice) * (tax ? 0.13 : 1)
  try {
    return tax
      ? connection.billForm.groupCode === 'none'
        ? '0'
        : (connection.billLines.find(value => value.receiptId === line.receiptId)?.assessment?.amounts.tax ?? '待评估')
      : roundDecimal(multiplyDecimals(String(line.quantity), String(line.unitPrice)), connection.query.data?.home.minorUnits ?? 2)
  } catch {
    return '—'
  }
}
const recoveries = computed(() => [
  { kind: 'write' as const, label: '财务提交', value: connection.submission },
  { kind: 'tax' as const, label: '税额评估', value: connection.taxSubmission }
])
async function recover(kind: 'write' | 'tax', action: 'resume' | 'check' | 'retry') {
  const saved = await connection.recover(kind, action)
  if (!saved) return
  if (action === 'resume') {
    if (kind === 'tax' || saved.action === 'payables.bill') formOpen.value = true
    else if (saved.action === 'payables.payment') {
      const terms = tradeTermsSchema.parse(saved.payload.terms)
      paymentBillId.value = terms.sourceId ?? ''
      paymentOn.value = terms.on
      Object.assign(paymentForm, {
        amount: terms.amount,
        bankId: terms.bankId ?? '',
        reference: terms.number,
        note: terms.memo,
        method: 'transfer'
      })
      paymentOpen.value = true
    }
  }
  if (
    action === 'retry'
    && kind === 'write'
    && !connection.submission.record
    && connection.submission.result
    && saved.action !== 'payables.accrue'
  ) {
    formOpen.value = false
    paymentOpen.value = false
    const result = connection.raw(connection.submission.result.id)
    if (result?.terms.kind === 1) await openBill(result.id)
    else if (result?.terms.kind === 2) await openPaymentDetail(result.id)
  }
}
watch(
  () => connection.query.owner,
  () => {
    detailOpen.value = false
    formOpen.value = false
    paymentOpen.value = false
    paymentDetailOpen.value = false
    detailId.value = ''
    paymentDetailId.value = ''
    paymentBillId.value = ''
    paymentForm.amount = ''
    paymentForm.reference = ''
    paymentForm.note = ''
  },
  { flush: 'sync' }
)
watch(
  () => connection.query.enabled,
  (enabled) => {
    if (enabled && props.initialBillId) openBill(props.initialBillId)
  }
)
defineExpose({ refresh: connection.refresh })
</script>

<template>
  <div class="space-y-4" data-testid="finance-payables">
    <UAlert
      v-if="!connected"
      color="info"
      variant="soft"
      icon="i-carbon-receipt"
      title="C1 采购到付款 · 固定算例"
      :description="fixedDescription"
      data-testid="payables-fixed-example"
    />

    <div v-if="connected" class="space-y-3">
      <UAlert v-if="connection.query.problem" color="error" :title="connection.query.problem" />
      <UAlert v-else-if="connection.error && !formOpen && !paymentOpen" color="error" :title="connection.error" />
      <UAlert
        v-else-if="connection.query.data && !connection.query.data.home.setup"
        color="warning"
        title="请先完成交易科目映射"
        description="在原单据流转页签核对配置后，再录入账单。"
      />
      <div class="flex items-center justify-between gap-3">
        <p class="text-xs text-muted">
          {{ connection.query.data?.home.currency }} · 收货、暂估、独立复核和实际付款分别确认；列表与筛选只覆盖当前服务器页。
        </p><UButton
          label="刷新应付"
          variant="outline"
          data-testid="payables-refresh"
          @click="connection.refresh()"
        />
      </div>
      <UAlert
        v-for="entry in recoveries.filter(value => value.value.record || value.value.message)"
        :key="entry.kind"
        color="warning"
        :title="entry.label + ' · ' + (entry.value.message || '存在上次待恢复提交')"
        :data-testid="'payables-recovery-' + entry.kind"
      >
        <template #actions>
          <UButton v-if="entry.value.record" label="恢复上次提交" @click="recover(entry.kind, 'resume')" /><UButton label="读取当前状态" :disabled="!entry.value.mutation.unknown || entry.value.mutation.busy" @click="recover(entry.kind, 'check')" /><UButton label="重试原提交" :disabled="!entry.value.mutation.operation?.retryAvailable || entry.value.mutation.busy" @click="recover(entry.kind, 'retry')" /><UButton
            v-if="entry.value.failure?.kind === 'mfa' || entry.value.record?.state === 'mfa'"
            label="重新验证"
            to="/bff/login?returnTo=%2Ffinance%3Ftab%3Dpayables"
            external
          />
        </template>
      </UAlert>
    </div>
    <FinancePayablesSummary
      :connected="connected"
      :outstanding-total="outstandingTotal"
      :pending-count="pendingCount"
      :available-count="availableCount"
      :payment-count="paymentCount"
    />

    <FinancePayablesBills
      :live="connected ? connection : undefined"
      :can-post="canPost"
      @open-bill="openBill"
      @pay-bill="openPayment"
      @create="openBillForm"
    />

    <FinancePayablesReceipts :live="connected ? connection : undefined" />

    <FinancePayablesAgingCredits
      :live="connected ? connection : undefined"
      @open-bill="openBill"
      @open-credit="openCredit"
    />
    <FinanceStockReturnAccounting v-if="connected" direction="purchase" />

    <USlideover v-model:open="detailOpen" :ui="{ content: 'sm:max-w-5xl' }">
      <template #header>
        <div class="flex min-w-0 items-center justify-between gap-3">
          <div class="min-w-0">
            <p class="truncate text-sm font-semibold text-highlighted">
              供应商账单详情
            </p><p v-if="detailBill" class="mt-0.5 truncate text-xs text-muted">
              {{ detailBill.id }} · {{ detailBill.supplier }}
            </p>
          </div>
          <UBadge
            v-if="detailBill"
            :label="billState(detailBill.id).label"
            :color="billState(detailBill.id).color"
            variant="subtle"
            size="sm"
          />
        </div>
      </template>
      <template #body>
        <div v-if="detailBill" class="space-y-4" data-testid="bill-detail">
          <UAlert
            v-if="detailBill.id === 'BILL-2026-1101'"
            color="info"
            variant="soft"
            icon="i-carbon-information"
            title="C1 固定算例"
            description="初始已付 ¥600.00。登记余款 ¥530.00 后，账单未结与采购应付账龄均归零。"
          />
          <UAlert v-if="connected && (connection.error || connection.submission.message)" color="warning" :title="connection.error || connection.submission.message">
            <template #actions>
              <UButton label="读取当前单据" @click="connection.select(detailId)" />
            </template>
          </UAlert>
          <UAlert
            v-if="detailError"
            color="error"
            variant="soft"
            icon="i-carbon-warning-alt"
            :title="detailError"
          />
          <div class="grid gap-2 sm:grid-cols-4">
            <div class="rounded-sm border border-default p-3">
              <p class="text-xs text-muted">
                价税合计
              </p><p class="mt-1 text-lg font-semibold tabular-nums">
                {{ displayMoney(detailBill.total) }}
              </p>
            </div>
            <div class="rounded-sm border border-default p-3">
              <p class="text-xs text-muted">
                已付
              </p><p class="mt-1 text-lg font-semibold tabular-nums">
                {{ displayMoney(connected ? connection.paid(detailBill.id) : store.paidOf(detailBill.id)) }}
              </p>
            </div>
            <div class="rounded-sm border border-default p-3">
              <p class="text-xs text-muted">
                已贷项
              </p><p class="mt-1 text-lg font-semibold tabular-nums">
                {{ displayMoney(connected ? connection.credited(detailBill.id) : store.creditedOf(detailBill.id)) }}
              </p>
            </div>
            <div class="rounded-sm border border-default p-3">
              <p class="text-xs text-muted">
                未结
              </p><p class="mt-1 text-lg font-semibold tabular-nums" :class="positive(detailOutstanding) ? 'text-warning' : 'text-success'" data-testid="bill-detail-outstanding">
                {{ displayMoney(detailOutstanding) }}
              </p>
            </div>
          </div>
          <div class="grid gap-2 text-xs sm:grid-cols-3">
            <div class="rounded-sm bg-elevated/40 px-3 py-2">
              <span class="text-muted">采购订单</span><span class="ml-2 text-highlighted">{{ detailBill.orderId }}</span>
            </div>
            <div class="rounded-sm bg-elevated/40 px-3 py-2">
              <span class="text-muted">账单日期 / 到期日</span><span class="ml-2 text-highlighted">{{ detailBill.date }} / {{ detailBill.dueAt }}</span>
            </div>
            <div class="rounded-sm bg-elevated/40 px-3 py-2">
              <span class="text-muted">过账凭证</span><span class="ml-2 text-highlighted">{{ detailBill.journalId ?? '待过账' }}</span>
            </div>
          </div>
          <div>
            <h4 class="mb-2 text-sm font-semibold text-highlighted">
              账单匹配明细
            </h4>
            <div class="overflow-x-auto rounded-sm border border-default">
              <table class="w-full text-left text-xs" data-testid="bill-lines">
                <thead class="bg-elevated/40 text-muted">
                  <tr>
                    <th class="px-3 py-2 font-medium">
                      收货单 / 行
                    </th><th class="px-3 py-2 font-medium">
                      商品
                    </th><th class="px-3 py-2 text-right font-medium">
                      数量
                    </th><th class="px-3 py-2 text-right font-medium">
                      账单单价
                    </th><th class="px-3 py-2 text-right font-medium">
                      暂估单价
                    </th><th class="px-3 py-2 text-right font-medium">
                      未税金额
                    </th><th class="px-3 py-2 text-right font-medium">
                      税额
                    </th><th class="px-3 py-2 text-right font-medium">
                      价差
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="line in detailBill.lines" :key="line.id" class="border-t border-default">
                    <td class="px-3 py-2">
                      {{ line.receiptId }} / {{ line.receiptLineNo }}
                    </td>
                    <td class="px-3 py-2">
                      <p class="max-w-64 truncate text-highlighted">
                        {{ line.name }}
                      </p><p class="text-muted">
                        {{ line.sku }}
                      </p>
                    </td>
                    <td class="px-3 py-2 text-right tabular-nums">
                      {{ line.quantity }}
                    </td>
                    <td class="px-3 py-2 text-right tabular-nums">
                      {{ displayMoney(line.unitPrice) }}
                    </td>
                    <td class="px-3 py-2 text-right tabular-nums">
                      {{ displayMoney(line.accrualUnitPrice) }}
                    </td>
                    <td class="px-3 py-2 text-right tabular-nums">
                      {{ displayMoney(line.net) }}
                    </td>
                    <td class="px-3 py-2 text-right tabular-nums">
                      {{ displayMoney(line.tax) }}
                      <FinanceTaxSnapshotDetail
                        v-if="detailAssessmentIds[line.receiptId]"
                        :key="detailAssessmentIds[line.receiptId]!" :id="detailAssessmentIds[line.receiptId]!"
                      />
                    </td>
                    <td class="px-3 py-2 text-right tabular-nums" :class="positive(line.variance) ? 'text-warning' : 'text-muted'">
                      {{ positive(line.variance) ? displayMoney(line.variance) : '—' }}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p v-if="hasVariance" class="mt-2 text-xs text-warning">
              本账单存在价差 {{ displayMoney(detailVariance) }}，复核前需确认采购价差。
            </p>
          </div>
          <div v-if="connected && connection.proofs[detailBill.id]?.journal" data-testid="bill-journal">
            <p class="text-sm font-medium">
              过账凭证 {{ connection.proofs[detailBill.id]?.journal?.journal.id }}
            </p><table class="w-full text-xs">
              <tbody>
                <tr v-for="line in connection.proofs[detailBill.id]?.journal?.lines" :key="line.accountId">
                  <td>{{ line.code }} {{ line.name }}</td><td>借 {{ displayMoney(line.debit) }}</td><td>贷 {{ displayMoney(line.credit) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div class="grid gap-4 xl:grid-cols-2">
            <div>
              <h4 class="mb-2 text-sm font-semibold text-highlighted">
                付款记录
              </h4>
              <div v-if="detailPayments.length" class="overflow-hidden rounded-sm border border-default">
                <table class="w-full text-left text-xs" data-testid="bill-payment-history">
                  <thead class="bg-elevated/40 text-muted">
                    <tr>
                      <th class="px-3 py-2 font-medium">
                        付款单
                      </th><th class="px-3 py-2 font-medium">
                        资金账户
                      </th><th class="px-3 py-2 text-right font-medium">
                        金额
                      </th><th class="px-3 py-2 font-medium">
                        状态
                      </th><th class="px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="payment in detailPayments" :key="payment.id" class="border-t border-default">
                      <td class="px-3 py-2">
                        {{ payment.id }}<span class="ml-1 text-muted">{{ payment.date }}</span>
                      </td><td class="px-3 py-2">
                        {{ payment.bankName }}
                      </td><td class="px-3 py-2 text-right tabular-nums">
                        {{ displayMoney(payment.amount) }}
                      </td><td class="px-3 py-2">
                        <UBadge
                          :color="payment.status === 'voided' ? 'error' : 'success'"
                          variant="soft"
                          size="sm"
                          :label="connected ? connection.state(payment.id) : payment.status === 'voided' ? '已作废' : '已完成'"
                        />
                      </td><td class="px-3 py-2 text-right">
                        <UButton
                          label="详情"
                          color="neutral"
                          variant="ghost"
                          size="xs"
                          :data-testid="'payment-open-' + payment.id"
                          @click="openPaymentDetail(payment.id)"
                        />
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p v-else class="rounded-sm border border-default px-3 py-4 text-xs text-muted">
                尚无付款记录。
              </p>
            </div>
            <div v-if="!connected">
              <h4 class="mb-2 text-sm font-semibold text-highlighted">
                关联贷项
              </h4>
              <div v-if="detailCredits.length" class="space-y-2">
                <div v-for="credit in detailCredits" :key="credit.id" class="rounded-sm border border-default px-3 py-2 text-xs">
                  <div class="flex items-center justify-between gap-2">
                    <span class="font-medium text-highlighted">{{ credit.id }}</span><span class="tabular-nums">{{ displayMoney(credit.total) }}</span>
                  </div>
                  <p class="mt-1 text-muted">
                    {{ credit.reason }}
                  </p>
                  <UButton
                    label="查看贷项详情"
                    color="neutral"
                    variant="ghost"
                    size="xs"
                    class="mt-1 px-0"
                    :data-testid="'bill-credit-' + credit.id"
                    @click="openCreditFromBill(credit.id)"
                  />
                </div>
              </div>
              <p v-else class="rounded-sm border border-default px-3 py-4 text-xs text-muted">
                该账单暂无贷项。
              </p>
            </div>
          </div>
          <UAlert
            v-if="detailBill.note"
            color="neutral"
            variant="soft"
            icon="i-carbon-note"
            :title="detailBill.note"
          />
          <UAlert
            v-if="detailBill.reviewer"
            color="neutral"
            variant="soft"
            icon="i-carbon-user-check"
            :title="'复核人 ' + detailBill.reviewer"
            :description="'复核时间 ' + (detailBill.reviewedAt ?? '—') + ' · 过账凭证 ' + (detailBill.journalId ?? '—')"
          />
        </div>
      </template>
      <template #footer>
        <div class="flex w-full flex-wrap items-center justify-between gap-2">
          <div class="flex items-center gap-2">
            <UButton
              label="关闭"
              color="neutral"
              variant="ghost"
              data-testid="bill-close"
              @click="closeBill"
            />
            <UCheckbox
              v-if="detailBill?.status === 'pending' && hasVariance"
              v-model="varianceConfirmed"
              :label="'已核对价差 ' + displayMoney(detailVariance)"
              data-testid="bill-variance-confirm"
            />
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <template v-if="detailBill">
              <template v-if="detailBill.status === 'pending'">
                <UButton
                  v-if="!connected || connection.raw(detailId)?.isMaker"
                  :label="connected ? '取消本人申请' : '退回账单'"
                  color="neutral"
                  variant="outline"
                  data-testid="bill-review-reject"
                  :disabled="!canPost"
                  @click="rejectBill"
                />
                <UButton
                  label="复核通过并过账"
                  icon="i-carbon-checkmark"
                  data-testid="bill-review-approve"
                  :disabled="connected ? !connection.canApprove || !!connection.raw(detailId)?.isMaker || connection.locked || (hasVariance && !varianceConfirmed) : !canPost || (hasVariance && !varianceConfirmed)"
                  @click="approveBill"
                />
              </template>
              <UButton
                v-else-if="detailBill.status === 'posted' && positive(detailOutstanding) && (!connected || connection.canSubmit)"
                label="登记付款"
                icon="i-carbon-currency-yen"
                data-testid="bill-pay"
                :disabled="!canPost"
                @click="openPayment(detailBill.id)"
              />
              <UBadge
                v-else-if="detailBill.status === 'posted'"
                label="已结清"
                color="success"
                variant="subtle"
                size="sm"
              />
            </template>
          </div>
        </div>
      </template>
    </USlideover>

    <USlideover v-model:open="formOpen" :ui="{ content: 'sm:max-w-4xl' }">
      <template #header>
        <div>
          <p class="text-sm font-semibold text-highlighted">
            新建供应商账单
          </p><p class="mt-0.5 text-xs text-muted">
            选择可匹配收货行，核对数量、单价、税额和总额后提交复核。
          </p>
        </div>
      </template>
      <template #body>
        <div class="space-y-4" data-testid="bill-form">
          <UAlert
            v-if="formError || connection.error || connection.submission.message || connection.taxSubmission.message"
            color="error"
            variant="soft"
            icon="i-carbon-warning-alt"
            :title="formError || connection.error || connection.submission.message || connection.taxSubmission.message"
            data-testid="bill-form-error"
          />
          <div v-if="connected && connection.locked" class="flex flex-wrap gap-2">
            <UButton label="读取当前状态" @click="recover(connection.taxSubmission.record ? 'tax' : 'write', 'check')" /><UButton label="重试原提交" :disabled="!(connection.taxSubmission.mutation.operation?.retryAvailable || connection.submission.mutation.operation?.retryAvailable)" @click="recover(connection.taxSubmission.record ? 'tax' : 'write', 'retry')" />
          </div>
          <fieldset :disabled="connected && connection.locked" class="space-y-4">
            <div v-if="connected" class="grid gap-3 sm:grid-cols-2">
              <UFormField label="供应商账单号" required>
                <UInput v-model="connection.billForm.number" class="w-full" data-testid="bill-form-number" />
              </UFormField><UFormField label="账单日期" required>
                <UInput
                  v-model="connection.billForm.on"
                  type="date"
                  class="w-full"
                  data-testid="bill-form-date"
                />
              </UFormField><UFormField label="到期日">
                <UInput
                  v-model="connection.billForm.dueOn"
                  type="date"
                  class="w-full"
                  data-testid="bill-form-due"
                />
              </UFormField><UFormField label="税务处理" required>
                <USelect
                  v-model="connection.billForm.groupCode"
                  :items="[{ label: '不计税（明确选择）', value: 'none' }, ...(connection.query.data?.tax.state === 'ready' ? connection.query.data.tax.data.groups.map(value => ({ label: value.code + ' ' + value.name, value: value.code })) : [])]"
                  class="w-full"
                  data-testid="bill-form-tax-group"
                />
              </UFormField>
            </div>
            <div class="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
              <UFormField label="可匹配收货行" :description="formOrderId ? '同一账单只能匹配同一采购订单' : '先选择一行收货明细，再按需继续添加'">
                <USelect
                  v-model="formLineKey"
                  :items="formLineOptions"
                  placeholder="选择收货单、商品和可匹配数量"
                  class="w-full"
                  data-testid="bill-form-line-select"
                />
              </UFormField>
              <UButton
                label="加入账单"
                icon="i-carbon-add"
                color="neutral"
                variant="outline"
                data-testid="bill-form-add-line"
                :disabled="!formLineKey"
                @click="addFormLine"
              />
            </div>
            <div v-if="connected && (connection.receiptsPage > 1 || connection.query.data?.receipts.length === 50)" class="flex items-center gap-2 text-xs">
              <UButton
                label="上一页实收"
                variant="outline"
                size="xs"
                :disabled="connection.receiptsPage === 1 || connection.query.loading"
                @click="connection.changePage('receipts', -1)"
              />
              <span>第 {{ connection.receiptsPage }} 页</span>
              <UButton
                label="下一页实收"
                variant="outline"
                size="xs"
                :disabled="connection.query.loading || connection.query.data?.receipts.length !== 50"
                @click="connection.changePage('receipts', 1)"
              />
            </div>
            <div v-if="formSupplier" class="rounded-sm bg-elevated/40 px-3 py-2 text-xs text-muted">
              供应商 <span class="text-highlighted">{{ formSupplier }}</span> · 采购订单 <span class="text-highlighted">{{ formOrderId }}</span> · {{ connected ? '账单日期 ' + connection.billForm.on + ' · 到期日 ' + (connection.billForm.dueOn || '未指定') : '账单日期 2026-11-18 · 到期日 2026-12-18' }}
            </div>
            <div v-if="formLines.length" class="overflow-x-auto rounded-sm border border-default">
              <table class="w-full text-left text-xs" data-testid="bill-form-lines">
                <thead class="bg-elevated/40 text-muted">
                  <tr>
                    <th class="px-3 py-2 font-medium">
                      收货行
                    </th><th class="px-3 py-2 text-right font-medium">
                      可匹配
                    </th><th class="px-3 py-2 text-right font-medium">
                      账单数量
                    </th><th class="px-3 py-2 text-right font-medium">
                      账单单价
                    </th><th class="px-3 py-2 text-right font-medium">
                      未税金额
                    </th><th class="px-3 py-2 text-right font-medium">
                      税额
                    </th><th class="px-3 py-2 text-right font-medium">
                      操作
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(line, index) in formLines" :key="line.receiptId + ':' + line.receiptLineNo" class="border-t border-default">
                    <td class="px-3 py-2">
                      {{ line.receiptId }} / {{ line.receiptLineNo }}
                    </td>
                    <td class="px-3 py-2 text-right tabular-nums">
                      {{ draftMatchedQuantity(line) }}
                    </td>
                    <td class="px-3 py-2">
                      <UInput
                        :model-value="String(line.quantity)"
                        :type="connected ? 'text' : 'number'"
                        inputmode="decimal"
                        min="0"
                        :max="String(draftMatchedQuantity(line))"
                        size="xs"
                        class="w-24"
                        data-testid="bill-form-quantity"
                        @update:model-value="value => updateDraftQuantity(line, value)"
                      />
                    </td>
                    <td class="px-3 py-2">
                      <UInput
                        :model-value="String(line.unitPrice)"
                        :type="connected ? 'text' : 'number'"
                        inputmode="decimal"
                        min="0"
                        step="0.01"
                        size="xs"
                        class="w-24"
                        data-testid="bill-form-unit-price"
                        @update:model-value="value => updateDraftPrice(line, value)"
                      />
                    </td>
                    <td class="px-3 py-2 text-right tabular-nums">
                      {{ displayMoney(billLineAmount(line)) }}
                    </td>
                    <td class="px-3 py-2 text-right tabular-nums">
                      {{ displayMoney(billLineAmount(line, true)) }}<UButton
                        v-if="connected && connection.billForm.groupCode !== 'none'"
                        label="评估本行税额"
                        size="xs"
                        variant="outline"
                        :data-testid="'bill-assess-' + line.receiptId"
                        @click="connection.assess(line.receiptId)"
                      />
                    </td>
                    <td class="px-3 py-2 text-right">
                      <UButton
                        label="移除"
                        color="neutral"
                        variant="ghost"
                        size="xs"
                        @click="removeFormLine(index)"
                      />
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <UEmpty
              v-else
              variant="naked"
              icon="i-carbon-receipt"
              title="尚未加入收货行"
              :description="connected ? '从已暂估实收行选择数量、填写未税单价，再按已配置税组评估。' : '从上方选择一行可匹配收货明细；账单会按 13% 税率计算进项税。'"
              class="py-6"
            />
            <div class="grid gap-2 sm:grid-cols-3">
              <div class="rounded-sm border border-default p-3">
                <p class="text-xs text-muted">
                  未税金额
                </p><p class="mt-1 text-lg font-semibold tabular-nums">
                  {{ displayMoney(formNet) }}
                </p>
              </div>
              <div class="rounded-sm border border-default p-3">
                <p class="text-xs text-muted">
                  {{ connected ? '已评估税额' : '税额（13%）' }}
                </p><p class="mt-1 text-lg font-semibold tabular-nums">
                  {{ displayMoney(formTax) }}
                </p>
              </div>
              <div class="rounded-sm border border-default p-3">
                <p class="text-xs text-muted">
                  价税合计
                </p><p class="mt-1 text-lg font-semibold tabular-nums" data-testid="bill-form-total">
                  {{ displayMoney(formTotal) }}
                </p>
              </div>
            </div>
            <p v-if="Math.abs(formVariance) > 0.005" class="text-xs text-warning" data-testid="bill-form-variance">
              价差 {{ displayMoney(formVariance) }}：复核人需先核对价差。
            </p>
            <UFormField label="备注">
              <UTextarea
                v-model="formNote"
                data-testid="bill-form-memo"
                :rows="2"
                placeholder="可选：说明调价、批次或对账信息"
              />
            </UFormField>
            <UCheckbox
              v-if="connected"
              v-model="connection.billForm.approveVariance"
              label="本申请允许采购价差，独立复核人仍须确认"
              data-testid="bill-form-allow-variance"
            />
          </fieldset>
        </div>
      </template>
      <template #footer>
        <div class="flex w-full items-center justify-end gap-2">
          <UButton
            label="取消"
            color="neutral"
            variant="ghost"
            data-testid="bill-form-cancel"
            @click="formOpen = false"
          />
          <UButton
            label="提交复核"
            icon="i-carbon-send-alt"
            data-testid="bill-form-submit"
            :disabled="connected ? !connection.canSubmit || connection.locked || !formLines.length : !canPost || !formLines.length"
            :loading="connected && connection.submission.mutation.busy"
            @click="submitBillForm"
          />
        </div>
      </template>
    </USlideover>

    <USlideover v-model:open="paymentOpen" :ui="{ content: 'sm:max-w-xl' }">
      <template #header>
        <div>
          <p class="text-sm font-semibold text-highlighted">
            登记供应商付款
          </p><p v-if="paymentBill" class="mt-0.5 text-xs text-muted">
            {{ paymentBill.id }} · {{ paymentBill.supplier }} · 未结 {{ displayMoney(paymentOutstanding) }}
          </p>
        </div>
      </template>
      <template #body>
        <div class="space-y-4" data-testid="payment-form">
          <UAlert
            v-if="paymentError || connection.error || connection.submission.message"
            color="error"
            variant="soft"
            icon="i-carbon-warning-alt"
            :title="paymentError || connection.error || connection.submission.message"
            data-testid="payment-error"
          />
          <div v-if="connected && connection.submission.record" class="flex flex-wrap gap-2">
            <UButton
              label="读取当前状态"
              :disabled="!connection.submission.mutation.unknown || connection.submission.mutation.busy"
              data-testid="payment-recovery-read"
              @click="recover('write', 'check')"
            /><UButton
              label="重试原提交"
              :disabled="!connection.submission.mutation.operation?.retryAvailable || connection.submission.mutation.busy"
              data-testid="payment-recovery-retry"
              @click="recover('write', 'retry')"
            />
          </div>
          <fieldset :disabled="connected && connection.locked" class="space-y-4">
            <UFormField v-if="connected" label="未结供应商账单" required>
              <USelect
                :model-value="paymentBillId"
                :items="eligiblePaymentBills"
                :disabled="connection.detailLoading"
                class="w-full"
                data-testid="payment-source-bill"
                @update:model-value="value => choosePaymentBill(String(value))"
              />
              <div v-if="connection.billsPage > 1 || connection.query.data?.bills.length === 50" class="mt-2 flex items-center gap-2 text-xs">
                <UButton
                  label="上一页账单"
                  variant="outline"
                  size="xs"
                  :disabled="connection.billsPage === 1 || connection.query.loading"
                  @click="connection.changePage('bills', -1)"
                />
                <span>第 {{ connection.billsPage }} 页</span>
                <UButton
                  label="下一页账单"
                  variant="outline"
                  size="xs"
                  :disabled="connection.query.loading || connection.query.data?.bills.length !== 50"
                  @click="connection.changePage('bills', 1)"
                />
              </div>
            </UFormField>
            <UFormField v-if="connected" label="付款日期" required>
              <UInput
                v-model="paymentOn"
                type="date"
                class="w-full"
                data-testid="payment-date"
              />
            </UFormField>
            <UFormField label="付款金额">
              <UInput
                v-model="paymentForm.amount"
                :type="connected ? 'text' : 'number'"
                inputmode="decimal"
                min="0"
                step="0.01"
                class="w-full"
                data-testid="payment-amount"
              />
            </UFormField>
            <div class="grid gap-3 sm:grid-cols-2">
              <UFormField label="资金账户">
                <USelect
                  v-model="paymentForm.bankId"
                  :items="activeBankItems"
                  class="w-full"
                  data-testid="payment-bank"
                />
              </UFormField>
              <UFormField v-if="!connected" label="付款方式">
                <USelect v-model="paymentForm.method" :items="paymentMethodItems" class="w-full" />
              </UFormField>
            </div>
            <UFormField :label="connected ? '付款单号' : '银行流水号'">
              <UInput
                v-model="paymentForm.reference"
                data-testid="payment-number"
                placeholder="留空自动生成"
                class="w-full"
              />
            </UFormField>
            <UFormField label="备注">
              <UInput
                v-model="paymentForm.note"
                data-testid="payment-memo"
                placeholder="可选"
                class="w-full"
              />
            </UFormField>
            <div class="flex items-center justify-between rounded-sm bg-elevated/40 px-3 py-2 text-xs">
              <span class="text-muted">{{ connected ? '独立复核付款后未结' : '本次付款后未结' }}</span><span class="tabular-nums font-medium text-highlighted">{{ displayMoney(paymentAfter) }}</span>
            </div>
            <p class="text-xs text-muted">
              {{ connected ? '提交后等待独立复核，过账成功才改变应付和银行流水；已提交金额及原操作键在未知结果时冻结。' : '付款只登记本地流水并更新应付余额；超额付款、已结清账单和重复提交会被拒绝。' }}
            </p>
          </fieldset>
        </div>
      </template>
      <template #footer>
        <div class="flex w-full items-center justify-end gap-2">
          <UButton
            label="取消"
            color="neutral"
            variant="ghost"
            @click="paymentOpen = false"
          /><UButton
            :label="connected ? '提交付款复核' : '确认付款'"
            icon="i-carbon-currency-yen"
            data-testid="payment-submit"
            :disabled="connected ? !connection.canSubmit || connection.locked : !canPost"
            :loading="connected && connection.submission.mutation.busy"
            @click="submitPayment"
          />
        </div>
      </template>
    </USlideover>

    <USlideover v-model:open="paymentDetailOpen" :ui="{ content: 'sm:max-w-2xl' }">
      <template #header>
        <div class="flex items-center justify-between gap-3">
          <div>
            <p class="text-sm font-semibold text-highlighted">
              付款详情
            </p><p class="mt-0.5 text-xs text-muted">
              {{ selectedPayment?.id ?? '—' }}
            </p>
          </div>
          <UBadge
            v-if="selectedPayment"
            :color="selectedPayment.status === 'voided' ? 'error' : 'success'"
            variant="soft"
            :label="selectedPayment.status === 'voided' ? '已作废' : connected ? connection.state(selectedPayment.id) : '已完成'"
            data-testid="payment-detail-status"
          />
        </div>
      </template>
      <template #body>
        <div v-if="selectedPayment" class="space-y-4" data-testid="payment-detail">
          <div class="grid gap-3 rounded-sm border border-default p-3 text-xs sm:grid-cols-2">
            <div>
              <p class="text-muted">
                原付款
              </p><p class="mt-0.5 font-medium text-highlighted">
                {{ selectedPayment.id }} · {{ selectedPayment.date }}
              </p>
            </div>
            <div>
              <p class="text-muted">
                付款金额
              </p><p class="mt-0.5 font-medium tabular-nums text-highlighted">
                {{ displayMoney(selectedPayment.amount) }}
              </p>
            </div>
            <div>
              <p class="text-muted">
                关联账单
              </p><UButton
                v-if="selectedPaymentBill"
                :label="selectedPaymentBill.id + ' · 未结 ' + displayMoney(billOutstanding(selectedPaymentBill.id))"
                color="neutral"
                variant="ghost"
                size="xs"
                class="mt-0.5 px-0"
                data-testid="payment-detail-bill"
                @click="openPaymentBill"
              />
              <p v-else class="mt-0.5 text-muted">
                未找到关联账单
              </p>
            </div>
            <div>
              <p class="text-muted">
                资金账户
              </p><p class="mt-0.5 font-medium text-highlighted">
                {{ selectedPayment.bankName }} · {{ connected ? connection.raw(selectedPayment.id)?.terms.method ?? '未提供方式' : supplierPaymentMethodLabels[selectedPayment.method] }}
              </p>
            </div>
            <div>
              <p class="text-muted">
                银行流水号
              </p><p class="mt-0.5 font-medium text-highlighted">
                {{ selectedPayment.reference }}
              </p>
            </div>
            <div>
              <p class="text-muted">
                备注
              </p><p class="mt-0.5 text-muted">
                {{ selectedPayment.note || '—' }}
              </p>
            </div>
          </div>

          <div v-if="!connected && selectedPayment.status === 'voided'" class="space-y-3" data-testid="payment-reversal">
            <div class="flex items-center justify-between gap-2">
              <p class="text-sm font-semibold text-highlighted">
                冲销记录
              </p><UBadge color="error" variant="soft" label="已作废" />
            </div>
            <div class="grid gap-3 rounded-sm border border-default p-3 text-xs sm:grid-cols-2">
              <div>
                <p class="text-muted">
                  冲销单
                </p><p class="mt-0.5 font-medium text-highlighted">
                  {{ selectedPayment.reversal?.id }}
                </p>
              </div>
              <div>
                <p class="text-muted">
                  作废时间
                </p><p class="mt-0.5 font-medium text-highlighted">
                  {{ selectedPayment.voidedAt }}
                </p>
              </div>
              <div class="sm:col-span-2">
                <p class="text-muted">
                  作废原因
                </p><p class="mt-0.5 text-highlighted" data-testid="payment-reversal-reason">
                  {{ selectedPayment.voidReason }}
                </p>
              </div>
            </div>
            <div v-if="selectedPaymentReversalTx" class="rounded-sm border border-default p-3 text-xs" data-testid="payment-reversal-tx">
              <p class="text-sm font-semibold text-highlighted">
                更正后的银行流水
              </p>
              <p class="mt-1 text-muted">
                {{ selectedPaymentReversalTx.description }}
              </p>
              <p class="mt-1 tabular-nums text-highlighted">
                入账 {{ selectedPaymentReversalTx.amount }} · {{ selectedPaymentReversalTx.matched ? '已匹配' : '待匹配' }} · 凭证 {{ selectedPaymentReversalTx.matchedJournalId ?? '—' }}
              </p>
              <p v-if="selectedPaymentReversalAccount" class="mt-1 tabular-nums text-muted" data-testid="payment-reversal-balance">
                账户余额 {{ displayMoney(Number(selectedPaymentReversalAccount.balance)) }}
              </p>
            </div>
            <UAlert
              color="warning"
              variant="soft"
              icon="i-carbon-undo"
              title="付款已作废，账单未结已恢复"
              :description="'关联账单 ' + (selectedPaymentBill?.id ?? '—') + ' 的未结金额已按原付款金额回补；应付账龄同步更新。'"
            />
          </div>

          <div v-else-if="!connected || (selectedPayment.status === 'posted' && connection.canSubmit && !connection.corrections(selectedPayment.id).some(row => row.state === 'submitted'))"
            class="space-y-3 rounded-sm border border-default p-3" data-testid="payment-void-form">
            <p class="text-sm font-semibold text-highlighted">
              作废更正
            </p>
            <p class="text-xs text-muted">
              {{ connected ? '提交后由另一位财务成员复核。过账后恢复账单未结金额，并生成冲销凭证和银行流水。' : '作废后该付款不再冲减账单未结，系统生成冲销记录与银行入账流水，保留原付款供审计。' }}
            </p>
            <UAlert
              v-if="paymentVoidError"
              color="error"
              variant="soft"
              icon="i-carbon-warning-alt"
              :title="paymentVoidError"
              data-testid="payment-void-error"
            />
            <div v-if="connected" class="grid gap-2 sm:grid-cols-2">
              <UFormField label="作废单号" required>
                <UInput v-model="paymentVoidNumber" :maxlength="60" data-testid="payment-void-number" />
              </UFormField>
              <UFormField label="作废日期" required>
                <UInput v-model="paymentVoidDate" type="date" data-testid="payment-void-date" />
              </UFormField>
            </div>
            <UFormField label="作废原因" required>
              <UTextarea
                v-model="paymentVoidReason"
                :rows="3"
                class="w-full"
                placeholder="例如：银行退回，原付款账户信息有误"
                data-testid="payment-void-reason"
              />
            </UFormField>
            <UButton
              :label="connected ? '提交作废复核' : '确认作废并生成冲销'"
              color="error"
              icon="i-carbon-undo"
              :disabled="connected ? connection.locked : !canPost"
              data-testid="payment-void-submit"
              @click="submitVoidPayment"
            />
          </div>
        </div>
        <div v-if="connected && selectedPayment" class="space-y-3">
          <UAlert v-if="connection.error || connection.submission.message" color="warning" :title="connection.error || connection.submission.message" />
          <div v-for="correction in connection.corrections(selectedPayment.id)" :key="correction.id"
            class="space-y-2 rounded-sm border border-default p-3" :data-testid="'payment-correction-' + correction.id">
            <p class="text-sm font-semibold">作废单 {{ correction.terms.number }} · {{ connection.state(correction.id) }}</p>
            <p class="text-xs text-muted">{{ correction.terms.on }} · {{ correction.terms.memo }}</p>
            <div class="flex flex-wrap gap-2">
              <UButton v-if="correction.state === 'submitted' && connection.canApprove && !correction.isMaker" label="独立复核作废并过账"
                size="sm" :disabled="connection.locked" :data-testid="'payment-void-approve-' + correction.id" @click="connection.decide(correction.id, 'approve')" />
              <UButton v-if="correction.state === 'submitted' && correction.isMaker" label="取消本人作废申请"
                size="sm" variant="outline" :disabled="connection.locked" @click="connection.decide(correction.id, 'cancel')" />
              <UButton v-if="correction.journalId" label="查看冲销凭证" size="sm" variant="outline"
                :to="{ path: '/finance', query: { tab: 'journals', journal: correction.journalId } }" />
              <UButton v-if="correction.state === 'posted'" label="查看冲销单与资金流水" size="sm" variant="outline"
                :to="{ path: '/finance', query: { tab: 'treasury', bank: selectedPayment.bankAccountId, document: correction.id } }" />
            </div>
            <p v-if="correction.state === 'posted'" class="text-sm text-success" data-testid="payment-reversal-balance">
              账单当前未结 {{ displayMoney(billOutstanding(selectedPayment.billId)) }}
            </p>
          </div>
          <div class="flex flex-wrap gap-2">
            <UButton
              v-if="connection.raw(selectedPayment.id)?.state === 'submitted'"
              label="独立复核付款并过账"
              :disabled="!connection.canApprove || !!connection.raw(selectedPayment.id)?.isMaker || connection.locked"
              data-testid="payment-review-approve"
              @click="connection.decide(selectedPayment.id, 'approve')"
            /><UButton
              v-if="connection.raw(selectedPayment.id)?.state === 'submitted' && connection.raw(selectedPayment.id)?.isMaker"
              label="取消本人付款申请"
              variant="outline"
              :disabled="connection.locked"
              @click="connection.decide(selectedPayment.id, 'cancel')"
            /><UButton label="刷新付款详情" variant="outline" @click="connection.select(selectedPayment.id)" />
          </div>
          <UAlert v-if="connection.proofs[selectedPayment.id]?.message" color="warning" :title="connection.proofs[selectedPayment.id]?.message" />
          <div v-if="connection.proofs[selectedPayment.id]?.journal" data-testid="payment-journal">
            <p class="text-sm font-medium">
              过账凭证 {{ connection.proofs[selectedPayment.id]?.journal?.journal.id }}
            </p><table class="w-full text-xs">
              <tbody>
                <tr v-for="line in connection.proofs[selectedPayment.id]?.journal?.lines" :key="line.accountId">
                  <td>{{ line.code }} {{ line.name }}</td><td>借 {{ displayMoney(line.debit) }}</td><td>贷 {{ displayMoney(line.credit) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div v-if="connection.proofs[selectedPayment.id]" data-testid="payment-bank-movements">
            <p class="text-sm font-medium">
              银行流水（当前页）
            </p><div v-for="movement in connection.proofs[selectedPayment.id]?.movements.filter(value => value.documentId === selectedPayment!.id)" :key="movement.id" class="flex flex-wrap justify-between gap-2 text-xs">
              <span>{{ movement.id }} · {{ movement.on }}</span><span>{{ displayMoney(movement.amount) }} · 凭证 {{ movement.journalId }}</span>
            </div><p class="mt-2 text-xs">
              当前资金账户余额 {{ displayMoney(connection.query.data?.home.banks.find(value => value.id === selectedPayment!.bankAccountId)?.balance ?? '待查询') }}
            </p><UButton
              label="下一页银行流水"
              variant="ghost"
              :disabled="(connection.proofs[selectedPayment.id]?.movements.length ?? 0) < 50"
              @click="connection.raw(selectedPayment.id) && connection.readProof(connection.raw(selectedPayment.id)!, (connection.proofs[selectedPayment.id]?.bankPage ?? 1) + 1)"
            />
          </div>
        </div>
      </template>
      <template #footer>
        <div class="flex w-full items-center justify-end">
          <UButton
            label="关闭"
            color="neutral"
            variant="ghost"
            data-testid="payment-detail-close"
            @click="paymentDetailOpen = false"
          />
        </div>
      </template>
    </USlideover>

    <USlideover v-if="!connected" v-model:open="creditOpen" :ui="{ content: 'sm:max-w-3xl' }">
      <template #header>
        <div class="flex items-center justify-between gap-3">
          <div>
            <p class="text-sm font-semibold text-highlighted">
              供应商贷项与退款
            </p><p v-if="selectedCredit" class="mt-0.5 text-xs text-muted">
              {{ selectedCredit.id }} · {{ selectedCredit.confirmedAt }}
            </p>
          </div><UBadge
            v-if="selectedCredit"
            :label="selectedCredit.status === 'refunded' ? '已退款' : '已确认'"
            :color="selectedCredit.status === 'refunded' ? 'success' : 'info'"
            variant="subtle"
            size="sm"
          />
        </div>
      </template>
      <template #body>
        <div v-if="selectedCredit" class="space-y-4" data-testid="credit-detail">
          <UAlert
            color="success"
            variant="soft"
            icon="i-carbon-checkmark"
            title="退货已确认"
            :description="selectedCredit.reason"
          />
          <div class="grid gap-3 sm:grid-cols-2">
            <UCard class="rounded-sm" :ui="{ body: 'p-4' }">
              <p class="text-xs text-muted">
                原收货行
              </p><p class="mt-1 text-sm font-medium text-highlighted">
                {{ selectedCredit.receiptId }} / 行 {{ selectedCredit.receiptLineNo }}
              </p><p class="mt-1 text-xs text-muted">
                {{ selectedCredit.name }} · {{ selectedCredit.sku }}
              </p><p class="mt-2 text-xs text-muted">
                收货时间 {{ selectedCreditReceipt?.receivedAt ?? '—' }} · 收货人 {{ selectedCreditReceipt?.receiver ?? '—' }}
              </p><p class="mt-1 text-xs text-muted">
                本次退货 {{ selectedCredit.quantity }} 件
              </p>
            </UCard>
            <UCard class="rounded-sm" :ui="{ body: 'p-4' }">
              <p class="text-xs text-muted">
                原供应商账单
              </p><button
                v-if="selectedCreditBill"
                type="button"
                class="mt-1 text-sm font-medium text-primary hover:underline"
                data-testid="credit-bill-link"
                @click="showCreditBill"
              >
                {{ selectedCreditBill.id }}
              </button><p v-else class="mt-1 text-sm text-muted">
                —
              </p><p class="mt-1 text-xs text-muted">
                {{ selectedCreditBill?.supplier ?? '—' }}
              </p><p class="mt-2 text-xs text-muted">
                账单价税合计 {{ selectedCreditBill ? displayMoney(selectedCreditBill.total) : '—' }}
              </p>
            </UCard>
          </div>
          <div class="grid gap-2 sm:grid-cols-3">
            <div class="rounded-sm border border-default p-3">
              <p class="text-xs text-muted">
                贷项未税
              </p><p class="mt-1 text-lg font-semibold tabular-nums">
                {{ displayMoney(selectedCredit.net) }}
              </p>
            </div>
            <div class="rounded-sm border border-default p-3">
              <p class="text-xs text-muted">
                进项税转出
              </p><p class="mt-1 text-lg font-semibold tabular-nums">
                {{ displayMoney(selectedCredit.tax) }}
              </p>
            </div>
            <div class="rounded-sm border border-default p-3">
              <p class="text-xs text-muted">
                贷项合计
              </p><p class="mt-1 text-lg font-semibold tabular-nums">
                {{ displayMoney(selectedCredit.total) }}
              </p>
            </div>
          </div>
          <div>
            <h4 class="mb-2 text-sm font-semibold text-highlighted">
              退款记录
            </h4>
            <div v-if="selectedCreditRefunds.length" class="overflow-hidden rounded-sm border border-default">
              <table class="w-full text-left text-xs">
                <thead class="bg-elevated/40 text-muted">
                  <tr>
                    <th class="px-3 py-2 font-medium">
                      退款单
                    </th><th class="px-3 py-2 font-medium">
                      日期 / 账户
                    </th><th class="px-3 py-2 text-right font-medium">
                      金额
                    </th>
                  </tr>
                </thead><tbody>
                  <tr v-for="refund in selectedCreditRefunds" :key="refund.id" class="border-t border-default">
                    <td class="px-3 py-2">
                      {{ refund.id }}
                    </td><td class="px-3 py-2">
                      {{ refund.date }} · {{ refund.bankName }}
                    </td><td class="px-3 py-2 text-right tabular-nums">
                      {{ displayMoney(refund.amount) }}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div v-else class="flex items-center justify-between rounded-sm border border-default px-3 py-3 text-xs">
              <span class="text-muted">待退金额 {{ displayMoney(selectedCreditRecoverable) }}</span><UButton
                label="登记退款"
                size="xs"
                data-testid="credit-refund"
                @click="refundCredit"
              />
            </div>
          </div>
          <UAlert
            color="neutral"
            variant="soft"
            icon="i-carbon-link"
            title="关联链路"
            :description="'确认退货 → 供应商贷项 ' + selectedCredit.id + ' → 原账单 ' + selectedCredit.billId + ' → 退款记录。刷新页面后恢复初始样例。'"
          />
        </div>
      </template>
      <template #footer>
        <div class="flex w-full items-center justify-end gap-2">
          <UButton
            label="关闭"
            color="neutral"
            variant="ghost"
            @click="creditOpen = false"
          /><UButton
            v-if="selectedCreditBill"
            label="查看原账单"
            color="primary"
            variant="outline"
            @click="showCreditBill"
          />
        </div>
      </template>
    </USlideover>
  </div>
</template>

<script setup lang="ts">
import type {
  Invoice,
  InvoiceDelivery,
  InvoiceLine,
  InvoiceStatus,
  Quote,
  QuoteLine,
  QuoteStatus,
  RecurringInvoicePlan,
  SalesFulfillment,
  SalesOrder,
  SalesOrderStatus
} from '~/mocks'
import {
  cloneQuote,
  cloneSalesOrder,
  invoiceStatusLabels,
  quoteStatusLabels,
  quotes as quoteSeed,
  salesOrders as orderSeed,
  salesStatusLabels
} from '~/mocks'
import type { RecurringPlanInput } from '~/stores/recurringInvoices'

interface SalesFormPayload {
  kind: 'order' | 'quote'
  mode: 'draft' | 'submit'
  data: {
    customerName: string
    date: string
    note: string
    lines: { sku: string, name: string, quantity: number, unitPrice: number }[]
  }
}

interface ReceiptFormPayload {
  customerName: string
  amount: number
  receivedAt: string
  bankAccountId: string
  bankName: string
  reference: string
  note?: string
}

interface AllocationFormPayload {
  invoiceId: string
  sourceType: 'receipt' | 'credit'
  sourceId: string
  amount: number
}

const route = useRoute()
const toast = useToast()
const session = useSessionStore()
const receivables = useReceivablesStore()
const recurring = useRecurringInvoicesStore()
const { workspace } = useMockWorkspace()
const { can } = useMockPermissions()
const { isLoading: stateLoading, isEmpty, isError, isForbidden } = useMockState()
const { loading, run: runRefresh } = useMockRefresh()

const { actor: demoActor, isMaker, isApprover, setActorRole } = useDemoActor()
const canCreate = computed(() => can('sales.create') && isMaker.value)
const canApprove = computed(() => can('sales.create') && isApprover.value)
const showSkeleton = computed(() => loading.value || stateLoading.value)
const pageSize = 8
const PREVIEW_NOTE = '仅本次预览，刷新后恢复。'

const tabItems = [
  { label: '销售订单', value: 'orders' },
  { label: '报价单', value: 'quotes' },
  { label: '应收', value: 'receivables' },
  { label: '发票', value: 'invoices' },
  { label: '定期开票', value: 'recurring' },
  { label: '发票交付', value: 'invoice-delivery' }
]
const tab = ref(String(route.query.tab ?? 'orders'))
if (!tabItems.some(item => item.value === tab.value)) tab.value = 'orders'

const orders = ref<SalesOrder[]>([])
const quoteRows = ref<Quote[]>([])
const invoiceRows = computed(() => receivables.invoices)

function resetRows() {
  orders.value = orderSeed.map(cloneSalesOrder)
  quoteRows.value = quoteSeed.map(cloneQuote)
}
resetRows()

const search = ref('')
const statusFilter = ref('all')
const customerFilter = ref('all')
const dateFrom = ref('')
const dateTo = ref('')

const showFilters = computed(() => ['orders', 'quotes', 'invoices'].includes(tab.value))

const workspaceOrders = computed(() => orders.value.filter(order => order.workspaceId === workspace.value.id))
const workspaceQuotes = computed(() => quoteRows.value.filter(quote => quote.workspaceId === workspace.value.id))
const workspaceInvoices = computed(() => invoiceRows.value.filter(invoice => invoice.workspaceId === workspace.value.id))
const workspaceRecurring = computed(() => recurring.plans.filter(plan => plan.workspaceId === workspace.value.id))

const statusItems = computed(() => {
  if (tab.value === 'quotes') {
    return [
      { label: '全部状态', value: 'all' },
      ...(Object.keys(quoteStatusLabels) as QuoteStatus[]).map(value => ({ label: quoteStatusLabels[value], value }))
    ]
  }
  if (tab.value === 'invoices') {
    return [
      { label: '全部状态', value: 'all' },
      ...(Object.keys(invoiceStatusLabels) as InvoiceStatus[]).map(value => ({ label: invoiceStatusLabels[value], value }))
    ]
  }
  return [
    { label: '全部状态', value: 'all' },
    ...(Object.keys(salesStatusLabels) as SalesOrderStatus[]).map(value => ({ label: salesStatusLabels[value], value }))
  ]
})

const customerOptions = computed(() => {
  const names = new Set<string>()
  for (const row of [...workspaceOrders.value, ...workspaceQuotes.value, ...workspaceInvoices.value]) names.add(row.customerName)
  return [...names].sort((a, b) => a.localeCompare(b, 'zh-CN'))
})
const customerFilterItems = computed(() => [
  { label: '全部客户', value: 'all' },
  ...customerOptions.value.map(name => ({ label: name, value: name }))
])

function matchesKeyword(id: string, customerName: string) {
  const keyword = search.value.trim().toLowerCase()
  if (!keyword) return true
  return id.toLowerCase().includes(keyword) || customerName.toLowerCase().includes(keyword)
}

function matchesCustomer(customerName: string) {
  return customerFilter.value === 'all' || customerFilter.value === customerName
}

const filteredOrders = computed(() => {
  if (isForbidden.value || isError.value || isEmpty.value) return []
  return workspaceOrders.value.filter((order) => {
    if (statusFilter.value !== 'all' && order.status !== statusFilter.value) return false
    if (!matchesCustomer(order.customerName)) return false
    if (dateFrom.value && order.orderedAt < dateFrom.value) return false
    if (dateTo.value && order.orderedAt > dateTo.value) return false
    return matchesKeyword(order.id, order.customerName)
  })
})

const filteredQuotes = computed(() => {
  if (isForbidden.value || isError.value || isEmpty.value) return []
  return workspaceQuotes.value.filter((quote) => {
    if (statusFilter.value !== 'all' && quote.status !== statusFilter.value) return false
    if (!matchesCustomer(quote.customerName)) return false
    if (dateFrom.value && quote.validUntil < dateFrom.value) return false
    if (dateTo.value && quote.validUntil > dateTo.value) return false
    return matchesKeyword(quote.id, quote.customerName)
  })
})

const filteredInvoices = computed(() => {
  if (isForbidden.value || isError.value || isEmpty.value) return []
  return workspaceInvoices.value.filter((invoice) => {
    if (statusFilter.value !== 'all' && invoice.status !== statusFilter.value) return false
    if (!matchesCustomer(invoice.customerName)) return false
    if (dateFrom.value && invoice.issuedAt < dateFrom.value) return false
    if (dateTo.value && invoice.issuedAt > dateTo.value) return false
    return matchesKeyword(invoice.id, invoice.customerName)
  })
})

const filteredRecurring = computed(() => {
  if (isForbidden.value || isError.value || isEmpty.value) return []
  return workspaceRecurring.value
})

const orderPagination = useClientPagination(filteredOrders, pageSize)
const quotePagination = useClientPagination(filteredQuotes, pageSize)
const invoicePagination = useClientPagination(filteredInvoices, pageSize)
const recurringPagination = useClientPagination(filteredRecurring, pageSize)

const orderPage = orderPagination.page
const quotePage = quotePagination.page
const invoicePage = invoicePagination.page
const recurringPage = recurringPagination.page

const pageOrders = orderPagination.pageRows
const pageQuotes = quotePagination.pageRows
const pageInvoices = invoicePagination.pageRows
const pageRecurring = recurringPagination.pageRows

const activeTotal = computed(() => {
  switch (tab.value) {
    case 'quotes': return filteredQuotes.value.length
    case 'invoices': return filteredInvoices.value.length
    case 'recurring': return filteredRecurring.value.length
    case 'orders': return filteredOrders.value.length
    default: return 0
  }
})

const activePagination = computed(() => {
  switch (tab.value) {
    case 'quotes': return quotePagination
    case 'invoices': return invoicePagination
    case 'recurring': return recurringPagination
    default: return orderPagination
  }
})

const pageStart = computed(() => activePagination.value.pageStart.value)
const pageEnd = computed(() => activePagination.value.pageEnd.value)

watch(tab, () => {
  statusFilter.value = 'all'
  orderPage.value = 1
  quotePage.value = 1
  invoicePage.value = 1
  recurringPage.value = 1
  recurringPlanOpen.value = false
  recurringFormOpen.value = false
  selectedRecurringId.value = null
})

watch(() => route.query.tab, (value) => {
  const next = String(value ?? 'orders')
  if (next === tab.value || !tabItems.some(item => item.value === next)) return
  tab.value = next
  detailOpen.value = false
  quoteOpen.value = false
  invoiceOpen.value = false
  selectedOrderId.value = null
  selectedQuoteId.value = null
  selectedInvoiceId.value = null
  recurringPlanOpen.value = false
  recurringFormOpen.value = false
  selectedRecurringId.value = null
})

watch([search, statusFilter, customerFilter, dateFrom, dateTo], () => {
  orderPage.value = 1
  quotePage.value = 1
  invoicePage.value = 1
  recurringPage.value = 1
})

function resetFilters() {
  search.value = ''
  statusFilter.value = 'all'
  customerFilter.value = 'all'
  dateFrom.value = ''
  dateTo.value = ''
}

function nowStamp() {
  const date = new Date()
  const pad = (value: number) => String(value).padStart(2, '0')
  return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate())
    + ' ' + pad(date.getHours()) + ':' + pad(date.getMinutes())
}

function todayIso() {
  return new Date().toISOString().slice(0, 10)
}

function addDays(isoDate: string, days: number) {
  const date = new Date(isoDate + 'T00:00:00')
  date.setDate(date.getDate() + days)
  return date.toISOString().slice(0, 10)
}

let localCounter = 0
function localId(prefix: string) {
  localCounter += 1
  return prefix + '-local-' + Date.now().toString(36) + '-' + localCounter
}

function toastPreview(title: string, description: string, color: 'success' | 'warning' | 'error' = 'success') {
  toast.add({
    title,
    description: description + '（' + PREVIEW_NOTE + '）',
    color,
    icon: color === 'success' ? 'i-carbon-checkmark-filled' : 'i-carbon-warning-alt'
  })
}

function nextSeriesId(prefix: string, rows: { id: string }[], digits: number) {
  const max = rows.reduce((value, row) => {
    const parsed = Number(row.id.slice(-digits))
    return Number.isFinite(parsed) ? Math.max(value, parsed) : value
  }, 0)
  return prefix + String(max + 1).padStart(digits, '0')
}

function nextOrderId() {
  return nextSeriesId('SO-2026-', orders.value, 4)
}
function nextQuoteId() {
  return nextSeriesId('QT-2026-', quoteRows.value, 4)
}
function nextInvoiceId() {
  return nextSeriesId('INV-2026-', invoiceRows.value, 4)
}

const detailOpen = ref(false)
const selectedOrderId = ref<string | null>(null)
const selectedOrder = computed(() => orders.value.find(order => order.id === selectedOrderId.value) ?? null)

function salesOrderMaker(order: SalesOrder) {
  return order.maker ?? order.approvals?.find(step => step.action === 'submitted')?.actor ?? '张明远'
}
const selectedMaker = computed(() => selectedOrder.value ? salesOrderMaker(selectedOrder.value) : '')
const selfApprovalBlocked = computed(() => Boolean(
  selectedOrder.value && isApprover.value && selectedMaker.value === demoActor.value.name
))
const canWithdrawSelected = computed(() => Boolean(
  selectedOrder.value && canCreate.value && selectedOrder.value.status === 'pending' && selectedMaker.value === demoActor.value.name
))
const canCancelSelected = computed(() => Boolean(
  selectedOrder.value && canCreate.value && selectedOrder.value.status === 'draft'
))
const canResubmitSelected = computed(() => Boolean(
  selectedOrder.value && canCreate.value && selectedOrder.value.status === 'draft' && selectedMaker.value === demoActor.value.name
))
const canApproveSelected = computed(() => Boolean(
  canApprove.value && selectedOrder.value?.status === 'pending' && !selfApprovalBlocked.value
))

const quoteOpen = ref(false)
const selectedQuoteId = ref<string | null>(null)
const selectedQuote = computed(() => quoteRows.value.find(quote => quote.id === selectedQuoteId.value) ?? null)

const invoiceOpen = ref(false)
const selectedInvoiceId = ref<string | null>(null)
const selectedInvoice = computed(() => invoiceRows.value.find(invoice => invoice.id === selectedInvoiceId.value) ?? null)
const selectedInvoiceOrder = computed(() => orders.value.find(order => order.id === selectedInvoice.value?.sourceOrderId) ?? null)

const recurringPlanOpen = ref(false)
const selectedRecurringId = ref<string | null>(null)
const recurringFormOpen = ref(false)
const recurringEditingId = ref<string | null>(null)
const recurringFormError = ref('')
const selectedRecurringPlan = computed(() => selectedRecurringId.value ? recurring.planOf(selectedRecurringId.value) ?? null : null)
const recurringOccurrences = computed(() => selectedRecurringPlan.value ? recurring.historyFor(selectedRecurringPlan.value.id) : [])
const recurringPreview = computed(() => selectedRecurringPlan.value ? recurring.previewDates(selectedRecurringPlan.value) : [])
const recurringEditingPlan = computed(() => recurringEditingId.value ? recurring.planOf(recurringEditingId.value) ?? null : null)
const receiptOpen = ref(false)
const receiptCustomer = ref('')
const receiptInvoiceId = ref<string | null>(null)
const creditOpen = ref(false)
const creditId = ref<string | null>(null)
const allocationOpen = ref(false)
const allocationInvoiceId = ref<string | null>(null)
const allocationReceiptId = ref<string | null>(null)
const correctionOpen = ref(false)
const correctionInvoiceId = ref<string | null>(null)
const correctionReason = ref('')

const formOpen = ref(false)
const formKind = ref<'order' | 'quote'>('order')
const editingOrder = ref<SalesOrder | null>(null)
const editingQuote = ref<Quote | null>(null)

const fulfillmentOpen = ref(false)
const fulfillmentOrder = ref<SalesOrder | null>(null)

const convertOpen = ref(false)
const pendingConvert = ref<{ quoteId: string, orderId: string } | null>(null)
const pendingQuote = computed(() => {
  const pending = pendingConvert.value
  if (!pending) return null
  return quoteRows.value.find(quote => quote.id === pending.quoteId) ?? null
})

const { loading: invoiceBusy, run: runInvoiceAction } = useMockAsync(async () => undefined, { delay: 480 })

function openOrder(orderId: string) {
  selectedOrderId.value = orderId
  detailOpen.value = true
}

function openQuote(quoteId: string) {
  selectedQuoteId.value = quoteId
  quoteOpen.value = true
}

function openInvoice(invoiceId: string) {
  selectedInvoiceId.value = invoiceId
  invoiceOpen.value = true
}

function closeOrderDetail() {
  detailOpen.value = false
  selectedOrderId.value = null
}

function closeQuoteDetail() {
  quoteOpen.value = false
  selectedQuoteId.value = null
}

function openOrderFromOther(orderId: string) {
  if (!orderId) {
    return
  }

  quoteOpen.value = false
  invoiceOpen.value = false
  resetFilters()
  orderPage.value = 1
  tab.value = 'orders'
  openOrder(orderId)
}

function openQuoteFromOrder(quoteId: string) {
  if (!quoteId) {
    return
  }

  detailOpen.value = false
  tab.value = 'quotes'
  resetFilters()
  quotePage.value = 1
  openQuote(quoteId)
}

// 支持从库存流水等页面按单号直达订单详情：/sales?tab=orders&order=SO-2026-9003
onMounted(() => {
  const orderId = String(route.query.order ?? '')
  if (orderId) openOrderFromOther(orderId)
})

function openCreate(kind: 'order' | 'quote') {
  editingOrder.value = null
  editingQuote.value = null
  formKind.value = kind
  formOpen.value = true
}

function startEditOrder() {
  editingOrder.value = selectedOrder.value
  editingQuote.value = null
  formKind.value = 'order'
  formOpen.value = true
}

function startEditQuote() {
  editingQuote.value = selectedQuote.value
  editingOrder.value = null
  formKind.value = 'quote'
  formOpen.value = true
}

function approveSelectedOrder() {
  const order = selectedOrder.value
  if (!order) return
  if (isApprover.value && salesOrderMaker(order) === demoActor.value.name) {
    toastPreview('不能审批自己提交的单据', '请切换到另一位业务主管后再审批。', 'error')
    return
  }
  if (!canApproveSelected.value || order.status !== 'pending') return
  const stamp = nowStamp()
  order.approvals = [...(order.approvals ?? []), {
    id: localId('approval'),
    orderId: order.id,
    action: 'approved',
    actor: demoActor.value.name,
    at: stamp,
    note: '审批通过（本地演示）'
  }]
  order.status = 'approved'
  order.updatedAt = stamp
  toastPreview('已批准销售订单', order.id + ' 现在可以发起履约')
}

function rejectSelectedOrder() {
  const order = selectedOrder.value
  if (!order || !canCreate.value || order.status !== 'pending') return
  const stamp = nowStamp()
  order.approvals = [...(order.approvals ?? []), {
    id: localId('approval'),
    orderId: order.id,
    action: 'rejected',
    actor: demoActor.value.name,
    at: stamp,
    note: '审批驳回：请核对价格与交期（本地演示）'
  }]
  order.status = 'draft'
  order.updatedAt = stamp
  toastPreview('已驳回销售订单', order.id + ' 已退回草稿', 'warning')
}

function withdrawSelectedOrder() {
  const order = selectedOrder.value
  if (!order || !canWithdrawSelected.value) return
  const stamp = nowStamp()
  order.status = 'draft'
  order.withdrawnAt = stamp
  order.approvals = [...(order.approvals ?? []), {
    id: localId('approval'),
    orderId: order.id,
    action: 'withdrawn',
    actor: demoActor.value.name,
    at: stamp,
    note: '制单人撤回提交，销售订单退回草稿。'
  }]
  order.updatedAt = stamp
  toastPreview('已撤回销售订单', order.id + ' 回到草稿，可修改后重新提交', 'warning')
}

function cancelSelectedOrderDraft() {
  const order = selectedOrder.value
  if (!order || !canCancelSelected.value) return
  const stamp = nowStamp()
  order.status = 'cancelled'
  order.cancelledAt = stamp
  order.cancelReason = '草稿取消：客户调整采购计划。'
  order.updatedAt = stamp
  toastPreview('已取消销售订单草稿', order.id + ' 保留原单与取消原因', 'error')
}

function resubmitSelectedOrder() {
  const order = selectedOrder.value
  if (!order || !canResubmitSelected.value) return
  const stamp = nowStamp()
  order.status = 'pending'
  order.withdrawnAt = undefined
  order.approvals = [...(order.approvals ?? []), {
    id: localId('approval'),
    orderId: order.id,
    action: 'submitted',
    actor: demoActor.value.name,
    at: stamp,
    note: '撤回修改后重新提交审批。'
  }]
  order.updatedAt = stamp
  toastPreview('已重新提交审批', order.id + ' 等待独立审批人处理')
}

const canSendSelectedQuote = computed(() => Boolean(
  selectedQuote.value && canCreate.value && selectedQuote.value.status === 'draft' && !selectedQuote.value.convertedOrderId
))

function sendSelectedQuote() {
  const quote = selectedQuote.value
  if (!quote || !canSendSelectedQuote.value) return
  quote.status = 'sent'
  quote.sentAt = nowStamp()
  quote.updatedAt = quote.sentAt
  toastPreview('报价已正式发出', quote.id + ' · ' + quote.customerName)
}

function startFulfillment() {
  const order = selectedOrder.value
  if (!order || !canCreate.value) return
  fulfillmentOrder.value = order
  fulfillmentOpen.value = true
}

function confirmFulfillment(payload: { shippedAt: string, shipper: string, lines: { lineNo: number, quantity: number }[] }) {
  const order = fulfillmentOrder.value
  if (!order || !canCreate.value) return
  const shippedLines = payload.lines.filter(line => line.quantity > 0)
  if (!shippedLines.length) {
    toast.add({ title: '请至少填写一行发货数量', color: 'warning', icon: 'i-carbon-warning-alt' })
    return
  }
  const stamp = nowStamp()
  const fulfillment: SalesFulfillment = {
    id: localId('fulfillment'),
    orderId: order.id,
    shippedAt: payload.shippedAt,
    shipper: payload.shipper,
    lines: shippedLines.map((line) => {
      const orderLine = order.lines.find(item => item.lineNo === line.lineNo)
      return {
        lineNo: line.lineNo,
        sku: orderLine?.sku ?? '',
        name: orderLine?.name ?? '',
        quantity: line.quantity
      }
    })
  }
  order.fulfillments = [...(order.fulfillments ?? []), fulfillment]
  for (const shipped of shippedLines) {
    const orderLine = order.lines.find(item => item.lineNo === shipped.lineNo)
    if (orderLine) orderLine.shipped = Math.min(orderLine.quantity, orderLine.shipped + shipped.quantity)
  }
  order.status = order.lines.every(line => line.shipped >= line.quantity) ? 'fulfilled' : 'partial'
  order.updatedAt = stamp
  fulfillmentOpen.value = false
  fulfillmentOrder.value = null
  toastPreview('已登记履约发货', order.id + ' · ' + payload.shipper)
}

function openConversion() {
  const quote = selectedQuote.value
  if (!quote || !canCreate.value) return
  pendingConvert.value = { quoteId: quote.id, orderId: nextOrderId() }
  convertOpen.value = true
}

function cancelConversion() {
  convertOpen.value = false
  pendingConvert.value = null
}

function confirmConversion() {
  const pending = pendingConvert.value
  const quote = pendingQuote.value
  if (!pending || !quote || !canCreate.value) return
  const stamp = nowStamp()
  const newOrder: SalesOrder = {
    id: pending.orderId,
    workspaceId: quote.workspaceId,
    customerName: quote.customerName,
    status: 'draft',
    orderedAt: todayIso(),
    promisedAt: addDays(todayIso(), 14),
    owner: quote.owner,
    totalAmount: quote.totalAmount,
    note: '由报价 ' + quote.id + ' 转换生成（本地演示）',
    lines: quote.lines.map(line => ({
      lineNo: line.lineNo,
      sku: line.sku,
      name: line.name,
      quantity: line.quantity,
      shipped: 0,
      unitPrice: line.unitPrice,
      amount: line.amount
    })),
    quoteId: quote.id,
    approvals: [],
    fulfillments: [],
    updatedAt: stamp
  }
  orders.value = [newOrder, ...orders.value]
  quote.convertedOrderId = pending.orderId
  quote.updatedAt = stamp
  if (quote.status === 'sent') quote.status = 'accepted'
  convertOpen.value = false
  pendingConvert.value = null
  quoteOpen.value = false
  selectedQuoteId.value = null
  resetFilters()
  orderPage.value = 1
  tab.value = 'orders'
  openOrder(newOrder.id)
  toastPreview('报价已转换为销售订单', newOrder.id + ' · 来源 ' + quote.id)
}

function handleFormSave(payload: SalesFormPayload) {
  const { kind, mode, data } = payload
  const stamp = nowStamp()
  const total = data.lines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0)
  if (kind === 'order') {
    const editing = editingOrder.value
    const id = editing?.id ?? nextOrderId()
    const status: SalesOrderStatus = mode === 'draft' ? 'draft' : 'pending'
    const lines = data.lines.map((line, index) => ({
      lineNo: index + 1,
      sku: line.sku,
      name: line.name,
      quantity: line.quantity,
      shipped: editing?.lines.find(item => item.lineNo === index + 1)?.shipped ?? 0,
      unitPrice: line.unitPrice.toFixed(2),
      amount: (line.quantity * line.unitPrice).toFixed(2)
    }))
    const approvals = mode === 'submit'
      ? [...(editing?.approvals ?? []), {
          id: localId('approval'),
          orderId: id,
          action: 'submitted' as const,
          actor: demoActor.value.name,
          at: stamp,
          note: '提交审批（本地演示）'
        }]
      : (editing?.approvals ?? [])
    if (editing) {
      editing.customerName = data.customerName
      editing.promisedAt = data.date
      editing.note = data.note
      editing.lines = lines
      editing.totalAmount = total.toFixed(2)
      editing.status = status
      editing.approvals = approvals
      editing.updatedAt = stamp
    } else {
      const order: SalesOrder = {
        id,
        workspaceId: workspace.value.id,
        customerName: data.customerName,
        status,
        orderedAt: todayIso(),
        promisedAt: data.date,
        owner: demoActor.value.name,
        maker: demoActor.value.name,
        totalAmount: total.toFixed(2),
        note: data.note,
        lines,
        approvals,
        fulfillments: [],
        updatedAt: stamp
      }
      orders.value = [order, ...orders.value]
    }
    orderPage.value = 1
    toastPreview(mode === 'draft' ? '已保存销售订单草稿' : '已提交销售订单审批', id + ' · ' + data.customerName)
    return
  }

  const editing = editingQuote.value
  const id = editing?.id ?? nextQuoteId()
  const status: QuoteStatus = mode === 'draft' ? 'draft' : 'sent'
  const lines: QuoteLine[] = data.lines.map((line, index) => ({
    lineNo: index + 1,
    sku: line.sku,
    name: line.name,
    quantity: line.quantity,
    unitPrice: line.unitPrice.toFixed(2),
    taxRate: '13%',
    amount: (line.quantity * line.unitPrice).toFixed(2)
  }))
  if (editing) {
    editing.customerName = data.customerName
    editing.validUntil = data.date
    editing.totalAmount = total.toFixed(2)
    editing.lines = lines
    editing.status = status
    editing.updatedAt = stamp
  } else {
    const quote: Quote = {
      id,
      workspaceId: workspace.value.id,
      customerName: data.customerName,
      status,
      validUntil: data.date,
      owner: demoActor.value.name,
      totalAmount: total.toFixed(2),
      lines,
      sentAt: status === 'sent' ? stamp : undefined,
      updatedAt: stamp
    }
    quoteRows.value = [quote, ...quoteRows.value]
  }
  quotePage.value = 1
  toastPreview(mode === 'draft' ? '已保存报价草稿' : '报价已提交（模拟发送）', id + ' · ' + data.customerName)
}

async function sendSelectedInvoice() {
  const invoice = selectedInvoice.value
  if (!invoice || !canCreate.value) return
  if (!['issued', 'overdue'].includes(invoice.status)) return
  await runInvoiceAction()
  const delivery: InvoiceDelivery = {
    id: localId('delivery'),
    channel: 'email',
    target: 'billing+' + invoice.id.toLowerCase() + '@demo.nexora.example',
    status: 'sent',
    at: nowStamp()
  }
  invoice.deliveries = [...(invoice.deliveries ?? []), delivery]
  invoice.updatedAt = delivery.at
  toastPreview('已发送发票邮件', invoice.id + '（本地模拟发送，不会真正发出邮件）')
}

async function retryDelivery(deliveryId: string) {
  const invoice = selectedInvoice.value
  if (!invoice || !canCreate.value) return
  const record = (invoice.deliveries ?? []).find(item => item.id === deliveryId)
  if (!record) return
  await runInvoiceAction()
  record.status = 'sent'
  record.at = nowStamp()
  if (record.error !== undefined) delete record.error
  toastPreview('已重新发送', invoice.id + ' · ' + record.target)
}

function openReceiptForm(customerName = '', invoiceId: string | null = null) {
  if (!canCreate.value) return
  receiptCustomer.value = customerName
  receiptInvoiceId.value = invoiceId
  receiptOpen.value = true
}

function handleReceiptSave(payload: ReceiptFormPayload) {
  const result = receivables.registerReceipt({
    workspaceId: workspace.value.id,
    customerName: payload.customerName,
    amount: payload.amount,
    receivedAt: payload.receivedAt,
    bankAccountId: payload.bankAccountId,
    bankName: payload.bankName,
    reference: payload.reference,
    ...(payload.note ? { note: payload.note } : {})
  })
  if (!result.ok) {
    toast.add({ title: '登记收款失败', description: result.message, color: 'error', icon: 'i-carbon-warning-alt' })
    return
  }
  receiptOpen.value = false
  toastPreview('已登记客户收款', result.message)
}

function openAllocation(invoiceId: string, receiptId: string | null = null) {
  if (!canCreate.value) return
  allocationInvoiceId.value = invoiceId || null
  allocationReceiptId.value = receiptId
  allocationOpen.value = true
}

function handleAllocationSave(payload: AllocationFormPayload) {
  const invoice = receivables.invoiceById(payload.invoiceId)
  if (!invoice) {
    toast.add({ title: '核销失败', description: '未找到发票。', color: 'error', icon: 'i-carbon-warning-alt' })
    return
  }
  const result = receivables.allocate(payload)
  if (!result.ok) {
    toast.add({ title: '核销失败', description: result.message, color: 'error', icon: 'i-carbon-warning-alt' })
    return
  }
  allocationOpen.value = false
  toastPreview('已完成应收核销', invoice.id + ' · ' + result.message)
}

function handleSaveDraft(lines: InvoiceLine[]) {
  const invoice = selectedInvoice.value
  if (!invoice || !canCreate.value) return
  const result = receivables.saveDraft(invoice.id, lines)
  if (!result.ok) {
    toast.add({ title: '保存草稿失败', description: result.message, color: 'error', icon: 'i-carbon-warning-alt' })
    return
  }
  toastPreview('已保存发票草稿', result.message)
}

function handleIssueInvoice() {
  const invoice = selectedInvoice.value
  if (!invoice || !canCreate.value) return
  const result = receivables.issueInvoice(invoice.id)
  if (!result.ok) {
    toast.add({ title: '确认开票失败', description: result.message, color: 'error', icon: 'i-carbon-warning-alt' })
    return
  }
  toastPreview('发票已生效', invoice.id + ' · 到期 ' + invoice.dueAt)
}

function openCredit(id: string) {
  creditId.value = id
  creditOpen.value = true
}

function handleCreditRefund(payload: {
  creditId: string
  amount: number
  refundedAt: string
  bankAccountId: string
  bankName: string
  reference: string
}) {
  const result = receivables.refundCredit(payload)
  if (!result.ok) {
    toast.add({ title: '退款失败', description: result.message, color: 'error', icon: 'i-carbon-warning-alt' })
    return
  }
  toastPreview('已登记客户退款', result.message)
}

function openCreditInvoice(invoiceId: string) {
  creditOpen.value = false
  openInvoice(invoiceId)
}

function openCorrection(invoiceId: string) {
  if (!canCreate.value) return
  correctionInvoiceId.value = invoiceId
  correctionReason.value = ''
  correctionOpen.value = true
}

function submitCorrection() {
  const invoiceId = correctionInvoiceId.value
  if (!invoiceId || !canCreate.value) return
  if (!correctionReason.value.trim()) {
    toast.add({ title: '请填写更正原因', color: 'warning', icon: 'i-carbon-warning-alt' })
    return
  }
  const result = receivables.correctInvoice(invoiceId, correctionReason.value, session.user.name)
  if (!result.ok) {
    toast.add({ title: '更正登记失败', description: result.message, color: 'error', icon: 'i-carbon-warning-alt' })
    return
  }
  correctionOpen.value = false
  toastPreview('已登记发票更正', invoiceId + ' · ' + result.message)
}

async function createInvoiceForOrder(orderId: string) {
  const order = orders.value.find(item => item.id === orderId)
  if (!order || !canCreate.value) return
  if (invoiceRows.value.some(invoice => invoice.sourceOrderId === order.id && invoice.status !== 'cancelled')) return
  const lines: InvoiceLine[] = order.lines
    .map(line => ({
      lineNo: line.lineNo,
      sku: line.sku,
      name: line.name,
      unitPrice: line.unitPrice,
      invoiceable: receivables.invoiceableQuantityOf(order.id, line.lineNo, line.shipped)
    }))
    .filter(line => line.invoiceable > 0)
    .map(line => ({
      lineNo: line.lineNo,
      sku: line.sku,
      name: line.name,
      quantity: line.invoiceable,
      unitPrice: line.unitPrice,
      taxRate: '13%',
      amount: (line.invoiceable * Number(line.unitPrice)).toFixed(2)
    }))
  if (!lines.length) {
    toast.add({ title: '暂无可开票数量', description: '请先在订单详情登记履约发货。', color: 'warning', icon: 'i-carbon-warning-alt' })
    return
  }
  await runInvoiceAction()
  const id = nextInvoiceId()
  const subtotal = lines.reduce((sum, line) => sum + Number(line.amount), 0)
  const invoice: Invoice = {
    id,
    workspaceId: order.workspaceId,
    customerName: order.customerName,
    status: 'draft',
    issuedAt: todayIso(),
    dueAt: addDays(todayIso(), 30),
    amount: (subtotal * 1.13).toFixed(2),
    taxAmount: (subtotal * 0.13).toFixed(2),
    sourceOrderId: order.id,
    lines,
    deliveries: [],
    shareToken: 'demo-' + id.toLowerCase(),
    updatedAt: nowStamp()
  }
  receivables.addInvoice(invoice)
  resetFilters()
  invoicePage.value = 1
  tab.value = 'invoices'
  openInvoice(id)
  toastPreview('已生成草稿发票', id + ' · 来自 ' + order.id)
}

function openRecurring(plan: RecurringInvoicePlan) {
  selectedRecurringId.value = plan.id
  recurringPlanOpen.value = true
}

function openRecurringCreate() {
  if (!canCreate.value) return
  recurringEditingId.value = null
  recurringFormError.value = ''
  recurringFormOpen.value = true
}

function openRecurringEdit() {
  if (!canCreate.value || !selectedRecurringPlan.value) return
  recurringEditingId.value = selectedRecurringPlan.value.id
  recurringFormError.value = ''
  recurringFormOpen.value = true
}

function saveRecurring(input: RecurringPlanInput) {
  if (!canCreate.value) return
  const result = recurringEditingId.value
    ? recurring.updatePlan(recurringEditingId.value, input)
    : recurring.createPlan({ ...input, workspaceId: workspace.value.id })
  if (!result.ok) {
    recurringFormError.value = result.message
    return
  }
  const wasEditing = Boolean(recurringEditingId.value)
  recurringFormOpen.value = false
  recurringFormError.value = ''
  if (result.plan) selectedRecurringId.value = result.plan.id
  recurringEditingId.value = null
  toastPreview(wasEditing ? '已更新定期开票计划' : '已创建定期开票计划', result.message)
}

function toggleRecurringRow(plan: RecurringInvoicePlan) {
  if (!canCreate.value) return
  const result = recurring.togglePlan(plan.id)
  if (!result.ok) {
    toast.add({ title: '操作失败', description: result.message, color: 'error', icon: 'i-carbon-warning-alt' })
    return
  }
  toastPreview(result.plan?.status === 'active' ? '已恢复定期开票计划' : '已暂停定期开票计划', result.message, result.plan?.status === 'active' ? 'success' : 'warning')
}

function toggleSelectedRecurring() {
  if (selectedRecurringPlan.value) toggleRecurringRow(selectedRecurringPlan.value)
}

function runRecurring(on: string) {
  if (!canCreate.value || !selectedRecurringPlan.value) return
  const result = recurring.runPlan(selectedRecurringPlan.value.id, on)
  if (!result.ok) {
    toast.add({
      title: result.blocked ? '期间阻断，已保留待处理' : '执行失败',
      description: result.message,
      color: result.blocked ? 'warning' : 'error',
      icon: 'i-carbon-warning-alt'
    })
    return
  }
  toastPreview(result.duplicate ? '未重复生成发票' : '已执行定期开票', result.message)
}

function skipRecurring(on: string) {
  if (!canCreate.value || !selectedRecurringPlan.value) return
  const result = recurring.skipPlan(selectedRecurringPlan.value.id, on)
  if (!result.ok) {
    toast.add({ title: '跳过失败', description: result.message, color: 'error', icon: 'i-carbon-warning-alt' })
    return
  }
  toastPreview('已跳过到期日', result.message, 'warning')
}

function openRecurringInvoice(invoiceId: string) {
  recurringPlanOpen.value = false
  selectedRecurringId.value = null
  openInvoice(invoiceId)
}

function refreshAll() {
  runRefresh(() => {
    resetRows()
    receivables.reset()
    recurring.reset()
    resetFilters()
    detailOpen.value = false
    quoteOpen.value = false
    invoiceOpen.value = false
    selectedOrderId.value = null
    selectedQuoteId.value = null
    selectedInvoiceId.value = null
    toast.add({
      title: '已刷新模拟数据',
      description: '销售订单、报价、发票与定期开票计划已恢复初始演示数据。',
      color: 'success',
      icon: 'i-carbon-renew'
    })
  })
}

async function reloadPage() {
  await navigateTo({ path: route.path, query: {} })
}
</script>

<template>
  <div class="contents">
    <UDashboardPanel id="sales">
      <template #header>
        <UDashboardNavbar title="销售与应收" :ui="{ right: 'gap-2' }">
          <template #leading>
            <UDashboardSidebarCollapse />
          </template>
          <template #right>
            <UBadge
              color="neutral"
              variant="subtle"
              size="sm"
              label="本地原型 · 模拟数据"
              class="hidden sm:inline-flex"
            />
            <NotificationButton />
            <div
              class="flex items-center gap-1 rounded-lg border border-default p-0.5"
              data-testid="sales-actor-switch"
            >
              <UButton
                label="张明远 · 经办"
                size="xs"
                :color="isMaker ? 'primary' : 'neutral'"
                :variant="isMaker ? 'solid' : 'ghost'"
                data-testid="sales-actor-maker"
                @click="setActorRole('maker')"
              />
              <UButton
                label="陈立 · 主管"
                size="xs"
                :color="isApprover ? 'primary' : 'neutral'"
                :variant="isApprover ? 'solid' : 'ghost'"
                data-testid="sales-actor-approver"
                @click="setActorRole('approver')"
              />
            </div>
          </template>
        </UDashboardNavbar>

        <UDashboardToolbar :ui="{ root: 'flex-wrap gap-3 py-2' }">
          <template #left>
            <UTabs
              v-model="tab"
              :items="tabItems"
              :content="false"
              size="sm"
              data-testid="sales-tabs"
            />
          </template>
          <template #right>
            <UTooltip text="恢复初始模拟数据">
              <UButton
                icon="i-carbon-renew"
                color="neutral"
                variant="ghost"
                size="sm"
                aria-label="刷新模拟数据"
                :loading="loading"
                data-testid="sales-refresh"
                @click="refreshAll"
              />
            </UTooltip>
            <UButton
              v-if="tab === 'orders'"
              label="新建销售订单"
              icon="i-carbon-add"
              size="sm"
              :disabled="!canCreate"
              data-testid="sales-new-order"
              @click="openCreate('order')"
            />
            <UButton
              v-else-if="tab === 'quotes'"
              label="新建报价单"
              icon="i-carbon-add"
              size="sm"
              :disabled="!canCreate"
              data-testid="quote-new"
              @click="openCreate('quote')"
            />
            <UButton
              v-else-if="tab === 'recurring'"
              label="新建定期开票"
              icon="i-carbon-add"
              size="sm"
              :disabled="!canCreate"
              data-testid="recurring-new"
              @click="openRecurringCreate"
            />
          </template>
        </UDashboardToolbar>

        <UDashboardToolbar v-if="showFilters" :ui="{ root: 'flex-wrap gap-3 py-2.5' }">
          <template #left>
            <UInput
              v-model="search"
              icon="i-carbon-search"
              placeholder="搜索单号或客户"
              size="sm"
              class="w-56"
              data-testid="sales-search"
            />
            <USelect
              v-model="statusFilter"
              :items="statusItems"
              size="sm"
              class="w-36"
              data-testid="sales-status-filter"
            />
            <USelect
              v-model="customerFilter"
              :items="customerFilterItems"
              size="sm"
              class="w-52"
              data-testid="sales-customer-filter"
            />
            <UInput
              v-model="dateFrom"
              type="date"
              size="sm"
              class="w-36"
              aria-label="开始日期"
              data-testid="sales-date-from"
            />
            <UInput
              v-model="dateTo"
              type="date"
              size="sm"
              class="w-36"
              aria-label="结束日期"
              data-testid="sales-date-to"
            />
            <UButton
              label="重置"
              icon="i-carbon-reset"
              color="neutral"
              variant="ghost"
              size="sm"
              data-testid="sales-reset-filters"
              @click="resetFilters"
            />
          </template>
          <template #right>
            <p class="text-xs tabular-nums text-muted">
              共 {{ activeTotal }} 条
            </p>
          </template>
        </UDashboardToolbar>
      </template>

      <template #body>
        <AppBreadcrumb current="销售与应收" class="mb-3" />

        <UCard class="nx-reveal rounded-sm" :ui="{ body: 'p-0 sm:p-0', footer: 'p-0 sm:p-0' }">
          <div v-if="showSkeleton" class="space-y-2 p-4" data-testid="sales-skeleton">
            <USkeleton v-for="n in 8" :key="n" class="h-9 w-full" />
          </div>

          <div v-else-if="isError" class="p-6">
            <UAlert
              color="error"
              variant="soft"
              icon="i-carbon-warning-alt"
              title="销售与应收加载失败（演示）"
              description="?state=error 会模拟一次加载失败。本原型不会访问后端。"
              :actions="[{ label: '恢复正常', color: 'neutral', variant: 'outline', onClick: reloadPage }]"
              data-testid="sales-state-error"
            />
          </div>

          <div v-else-if="isForbidden" class="py-6">
            <UEmpty
              variant="naked"
              icon="i-carbon-view-off"
              title="没有销售与应收读取权限（演示）"
              description="使用 ?state=forbidden 模拟权限不足；本原型不会访问后端。"
              data-testid="sales-state-forbidden"
            />
          </div>

          <div v-else-if="isEmpty" class="flex flex-col items-center gap-3 py-10">
            <UEmpty
              variant="naked"
              icon="i-carbon-shopping-cart"
              title="空状态演示"
              description="使用 ?state=empty 模拟没有销售与应收数据；可恢复默认状态查看完整列表。"
              data-testid="sales-state-empty"
            />
            <UButton
              label="恢复默认状态"
              icon="i-carbon-reset"
              color="neutral"
              variant="outline"
              size="sm"
              @click="reloadPage"
            />
          </div>

          <div v-else :key="'sales-tab-' + tab" class="nx-fade">
            <SalesOrdersTable
              v-if="tab === 'orders'"
              :rows="pageOrders"
              @open="openOrder"
              @reset="resetFilters"
            />
            <SalesQuotesTable
              v-else-if="tab === 'quotes'"
              :rows="pageQuotes"
              @open="openQuote"
              @reset="resetFilters"
            />
            <template v-else-if="tab === 'receivables'">
              <div class="p-3">
                <SalesReceivableWorkbench
                  :invoices="workspaceInvoices"
                  :orders="workspaceOrders"
                  :can-create="canCreate"
                  @open-invoice="openInvoice"
                  @open-order="openOrderFromOther"
                  @create-invoice="createInvoiceForOrder"
                  @register-receipt="openReceiptForm"
                  @allocate="openAllocation"
                  @open-credit="openCredit"
                />
              </div>
            </template>
            <SalesInvoicesTable
              v-else-if="tab === 'invoices'"
              :rows="pageInvoices"
              @open="openInvoice"
              @reset="resetFilters"
            />
            <SalesRecurringTable
              v-else-if="tab === 'recurring'"
              :rows="pageRecurring"
              :can-create="canCreate"
              @open="openRecurring"
              @toggle="toggleRecurringRow"
            />
            <SalesInvoiceDelivery
              v-else
            />
          </div>

          <template #footer>
            <div
              v-if="!showSkeleton && !isError && !isForbidden && !isEmpty && !['receivables', 'invoice-delivery'].includes(tab)"
              class="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5"
            >
              <p class="text-xs tabular-nums text-muted">
                第 {{ pageStart }}–{{ pageEnd }} 条 / 共 {{ activeTotal }} 条
              </p>
              <UPagination
                v-if="tab === 'orders'"
                v-model:page="orderPage"
                :total="filteredOrders.length"
                :items-per-page="pageSize"
                size="sm"
                data-testid="sales-orders-pagination"
              />
              <UPagination
                v-else-if="tab === 'quotes'"
                v-model:page="quotePage"
                :total="filteredQuotes.length"
                :items-per-page="pageSize"
                size="sm"
                data-testid="quote-pagination"
              />
              <UPagination
                v-else-if="tab === 'invoices'"
                v-model:page="invoicePage"
                :total="filteredInvoices.length"
                :items-per-page="pageSize"
                size="sm"
                data-testid="invoice-pagination"
              />
              <UPagination
                v-else
                v-model:page="recurringPage"
                :total="filteredRecurring.length"
                :items-per-page="pageSize"
                size="sm"
                data-testid="recurring-pagination"
              />
            </div>
          </template>
        </UCard>

        <SalesOrderDetailSlideover
          v-model:open="detailOpen"
          :order="selectedOrder"
          :can-create="canCreate"
          :can-approve="canApproveSelected"
          :can-withdraw="canWithdrawSelected"
          :can-cancel="canCancelSelected"
          :can-resubmit="canResubmitSelected"
          :self-approval-blocked="selfApprovalBlocked"
          @edit="startEditOrder"
          @approve="approveSelectedOrder"
          @reject="rejectSelectedOrder"
          @fulfill="startFulfillment"
          @withdraw="withdrawSelectedOrder"
          @cancel-draft="cancelSelectedOrderDraft"
          @resubmit="resubmitSelectedOrder"
          @back="closeOrderDetail"
          @open-quote="openQuoteFromOrder"
        />

        <SalesQuoteDetailSlideover
          v-model:open="quoteOpen"
          :quote="selectedQuote"
          :can-create="canCreate"
          @convert="openConversion"
          @edit="startEditQuote"
          @send="sendSelectedQuote"
          @back="closeQuoteDetail"
          @open-order="openOrderFromOther"
        />

        <SalesFormSlideover
          v-model:open="formOpen"
          :kind="formKind"
          :order="editingOrder"
          :quote="editingQuote"
          :customers="customerOptions"
          @save="handleFormSave"
        />

        <SalesFulfillmentSlideover
          v-model:open="fulfillmentOpen"
          :order="fulfillmentOrder"
          @confirm="confirmFulfillment"
        />

        <SalesInvoiceDetailSlideover
          v-model:open="invoiceOpen"
          :invoice="selectedInvoice"
          :order="selectedInvoiceOrder"
          :can-create="canCreate"
          :busy="invoiceBusy"
          @send="sendSelectedInvoice"
          @retry="retryDelivery"
          @back="invoiceOpen = false; selectedInvoiceId = null"
          @open-order="openOrderFromOther"
          @register-receipt="openReceiptForm"
          @allocate="openAllocation"
          @save-draft="handleSaveDraft"
          @issue="handleIssueInvoice"
          @correct="openCorrection"
        />

        <SalesRecurringPlanSlideover
          v-model:open="recurringPlanOpen"
          :plan="selectedRecurringPlan"
          :occurrences="recurringOccurrences"
          :preview="recurringPreview"
          :can-manage="canCreate"
          @run="runRecurring"
          @skip="skipRecurring"
          @edit="openRecurringEdit"
          @toggle="toggleSelectedRecurring"
          @open-invoice="openRecurringInvoice"
        />

        <SalesRecurringFormSlideover
          v-model:open="recurringFormOpen"
          :plan="recurringEditingPlan"
          :customers="customerOptions"
          :can-manage="canCreate"
          :error="recurringFormError"
          @save="saveRecurring"
        />

        <SalesReceiptFormSlideover
          v-model:open="receiptOpen"
          :customer-name="receiptCustomer"
          :invoice-id="receiptInvoiceId"
          @save="handleReceiptSave"
        />

        <SalesReceivableAllocationSlideover
          v-model:open="allocationOpen"
          :invoice-id="allocationInvoiceId"
          :receipt-id="allocationReceiptId"
          @save="handleAllocationSave"
        />

        <SalesCreditSlideover
          v-model:open="creditOpen"
          :credit-id="creditId"
          @refund="handleCreditRefund"
          @open-invoice="openCreditInvoice"
        />

        <UModal v-model:open="correctionOpen" title="发票更正登记" data-testid="invoice-correction-modal">
          <template #body>
            <div class="space-y-3">
              <UAlert
                color="info"
                variant="soft"
                icon="i-carbon-information"
                title="本地演示更正"
                description="登记更正原因后，正式红字发票与账务调整由后端生成；当前不修改发票金额。"
              />
              <p class="font-mono text-xs text-muted">
                {{ correctionInvoiceId }}
              </p>
              <UFormField label="更正原因" required>
                <UTextarea
                  v-model="correctionReason"
                  :rows="3"
                  class="w-full"
                  placeholder="如客户抬头错误、金额调整或退货更正"
                  data-testid="invoice-correction-reason"
                />
              </UFormField>
            </div>
          </template>
          <template #footer>
            <div class="flex w-full items-center justify-end gap-2">
              <UButton
                label="取消"
                color="neutral"
                variant="ghost"
                data-testid="invoice-correction-cancel"
                @click="correctionOpen = false"
              />
              <UButton
                label="登记更正"
                icon="i-carbon-edit"
                data-testid="invoice-correction-submit"
                @click="submitCorrection"
              />
            </div>
          </template>
        </UModal>

        <UModal v-model:open="convertOpen" title="将报价转换为销售订单" data-testid="quote-convert-modal">
          <template #body>
            <div class="space-y-3">
              <UAlert
                color="info"
                variant="soft"
                icon="i-carbon-information"
                title="本地演示转换"
                description="确认后将在浏览器内生成销售订单并标记报价已转单；刷新页面后恢复初始数据。"
              />
              <dl class="space-y-1.5 rounded-sm border border-default px-3 py-2.5 text-[13px]">
                <div class="flex justify-between gap-3">
                  <dt class="text-muted">
                    报价单
                  </dt>
                  <dd class="font-mono text-default">
                    {{ pendingQuote?.id }}
                  </dd>
                </div>
                <div class="flex justify-between gap-3">
                  <dt class="text-muted">
                    客户
                  </dt>
                  <dd class="text-default">
                    {{ pendingQuote?.customerName }}
                  </dd>
                </div>
                <div class="flex justify-between gap-3">
                  <dt class="text-muted">
                    明细行数
                  </dt>
                  <dd class="tabular-nums text-default">
                    {{ pendingQuote?.lines.length ?? 0 }} 行
                  </dd>
                </div>
                <div class="flex justify-between gap-3">
                  <dt class="text-muted">
                    未税金额
                  </dt>
                  <dd class="tabular-nums text-default">
                    {{ formatMoney(Number(pendingQuote?.totalAmount ?? 0)) }}
                  </dd>
                </div>
                <div class="flex justify-between gap-3 border-t border-default pt-1.5 text-sm font-semibold">
                  <dt class="text-highlighted">
                    转换后销售订单
                  </dt>
                  <dd class="font-mono tabular-nums text-highlighted">
                    {{ pendingConvert?.orderId }}
                  </dd>
                </div>
              </dl>
              <p class="text-xs text-muted">
                转换后订单状态为「草稿」，需在订单详情中提交审批。
              </p>
            </div>
          </template>
          <template #footer>
            <div class="flex w-full items-center justify-end gap-2">
              <UButton
                label="取消"
                color="neutral"
                variant="ghost"
                data-testid="quote-convert-cancel"
                @click="cancelConversion"
              />
              <UButton
                label="确认转换"
                icon="i-carbon-arrow-right"
                data-testid="quote-convert-confirm"
                @click="confirmConversion"
              />
            </div>
          </template>
        </UModal>
      </template>
    </UDashboardPanel>
  </div>
</template>

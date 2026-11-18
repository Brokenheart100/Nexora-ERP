<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import StockPermitPanel from '~/components/inventory/StockPermitPanel.vue'
import type {
  PurchaseApprovalStep,
  PurchaseAuditEntry,
  PurchaseOrder,
  PurchaseOrderLine,
  PurchaseReceipt
} from '~/mocks'
import {
  approvalActionLabels,
  clonePurchaseOrder,
  isRejectedOrder,
  latestApproval,
  purchaseOrders,
  statusColors,
  statusLabels
} from '~/mocks'

const toast = useToast()
const route = useRoute()
const { workspace, activeWorkspaceId } = useMockWorkspace()
const { isLoading: stateLoading, isEmpty, isError, isForbidden } = useMockState()
const { can } = useMockPermissions()
const { loading, run: runRefresh } = useMockRefresh()
const session = useSessionStore()
const { copy, isSupported } = useClipboard()
const ui = useUiStore()

const densityItems = [
  { label: '舒适', value: 'cozy' },
  { label: '紧凑', value: 'compact' }
]
const tableUi = computed(() => ui.tableDensity === 'compact'
  ? { th: 'py-1.5', td: 'py-2' }
  : { th: 'py-2.5', td: 'py-3' })

const canCreate = computed(() => can('purchase.create'))
const canApprove = computed(() => can('purchase.approve'))
const showSkeleton = computed(() => loading.value || stateLoading.value)

/**
 * 本地可写副本：审批、驳回、收货与编辑都只改这里。
 * 纯 UI 原型没有持久化，刷新页面后从 app/mocks 恢复初始样例。
 */
const rows = ref<PurchaseOrder[]>(purchaseOrders.map(clonePurchaseOrder))

const searchInput = ref('')
const search = ref('')
const applySearch = useDebounceFn((value: string) => {
  search.value = value
}, 220)

watch(searchInput, value => applySearch(value))

const status = ref('all')
const supplier = ref('all')
const dateFrom = ref('')
const dateTo = ref('')

const pageSize = 8

const statusItems = [
  { label: '全部状态', value: 'all' },
  ...Object.entries(statusLabels).map(([value, label]) => ({ label, value }))
]

const workspaceOrders = computed(() => rows.value.filter(order => order.workspaceId === workspace.value.id))

const supplierItems = computed(() => [
  { label: '全部供应商', value: 'all' },
  ...[...new Set(workspaceOrders.value.map(order => order.supplier))].map(name => ({ label: name, value: name }))
])

const filteredOrders = computed(() => {
  if (isForbidden.value || isError.value || isEmpty.value) return []
  const keyword = search.value.trim().toLowerCase()
  return workspaceOrders.value.filter((order) => {
    if (status.value !== 'all' && order.status !== status.value) return false
    if (supplier.value !== 'all' && order.supplier !== supplier.value) return false
    if (dateFrom.value && order.orderedAt < dateFrom.value) return false
    if (dateTo.value && order.orderedAt > dateTo.value) return false
    if (!keyword) return true
    const text = [
      order.id,
      order.supplier,
      order.contact,
      order.note,
      ...order.lines.map(line => line.sku + ' ' + line.name)
    ].join(' ').toLowerCase()
    return text.includes(keyword)
  })
})

const hasFilters = computed(() => Boolean(
  search.value
  || status.value !== 'all'
  || supplier.value !== 'all'
  || dateFrom.value
  || dateTo.value
))

const {
  page,
  pageRows,
  pageStart,
  pageEnd,
  resetPage
} = useClientPagination(filteredOrders, pageSize)

watch([search, status, supplier, dateFrom, dateTo], resetPage)

watch(workspace, () => {
  resetPage()
  supplier.value = 'all'
  dateFrom.value = ''
  dateTo.value = ''
})

function resetFilters() {
  searchInput.value = ''
  search.value = ''
  status.value = 'all'
  supplier.value = 'all'
  dateFrom.value = ''
  dateTo.value = ''
  resetPage()
}

function orderLines(order: PurchaseOrder) {
  return order.lines.reduce((sum, line) => sum + line.quantity, 0)
}

const columns: TableColumn<PurchaseOrder>[] = [{
  accessorKey: 'id',
  header: '采购单号',
  meta: { class: { td: 'whitespace-nowrap font-mono text-[12px] text-muted' } }
}, {
  accessorKey: 'supplier',
  header: '供应商',
  meta: { class: { td: 'min-w-[200px] whitespace-normal' } }
}, {
  accessorKey: 'status',
  header: '状态'
}, {
  accessorKey: 'orderedAt',
  header: '下单日期',
  meta: { class: { td: 'whitespace-nowrap' } }
}, {
  accessorKey: 'expectedAt',
  header: '预计到货',
  meta: { class: { td: 'whitespace-nowrap text-muted' } }
}, {
  id: 'lines',
  header: '明细',
  meta: { class: { th: 'text-right', td: 'text-right tabular-nums' } }
}, {
  id: 'amount',
  header: '金额',
  meta: { class: { th: 'text-right', td: 'text-right tabular-nums whitespace-nowrap' } }
}, {
  id: 'actions',
  header: '操作',
  meta: { class: { th: 'w-20', td: 'w-20 text-right' } }
}]

const detailOpen = ref(false)
const selectedId = ref<string | null>(null)
const selected = computed(() => rows.value.find(order => order.id === selectedId.value) ?? null)

function openDetail(order: PurchaseOrder) {
  selectedId.value = order.id
  detailOpen.value = true
}

function closeDetail() {
  detailOpen.value = false
}

// 支持从库存流水等页面按单号直达详情：/purchase-orders?order=PO-2026-0511
onMounted(() => {
  const orderId = String(route.query.order ?? '')
  if (!orderId) return
  const order = rows.value.find(item => item.id === orderId)
  if (!order) return
  if (order.workspaceId !== workspace.value.id) activeWorkspaceId.value = order.workspaceId
  openDetail(order)
})

const lineColumns: TableColumn<PurchaseOrderLine>[] = [{
  accessorKey: 'lineNo',
  header: '序号',
  meta: { class: { td: 'tabular-nums text-muted' } }
}, {
  accessorKey: 'name',
  header: '商品',
  meta: { class: { td: 'min-w-[180px] whitespace-normal' } }
}, {
  accessorKey: 'spec',
  header: '规格',
  meta: { class: { td: 'whitespace-normal text-muted' } }
}, {
  accessorKey: 'quantity',
  header: '数量',
  meta: { class: { th: 'text-right', td: 'text-right tabular-nums' } }
}, {
  accessorKey: 'received',
  header: '已入库',
  meta: { class: { th: 'text-right', td: 'text-right tabular-nums' } }
}, {
  accessorKey: 'unitPrice',
  header: '单价',
  meta: { class: { th: 'text-right', td: 'text-right tabular-nums whitespace-nowrap' } }
}, {
  id: 'amount',
  header: '金额',
  meta: { class: { th: 'text-right', td: 'text-right tabular-nums whitespace-nowrap' } }
}]

const statusSteps = [{
  slot: 'created',
  value: 0,
  title: '已下单',
  description: '提交采购申请',
  icon: 'i-carbon-document'
}, {
  slot: 'approved',
  value: 1,
  title: '已审批',
  description: '审批通过',
  icon: 'i-carbon-checkmark'
}, {
  slot: 'received',
  value: 2,
  title: '已入库',
  description: '收货并入库',
  icon: 'i-carbon-inventory-management'
}, {
  slot: 'closed',
  value: 3,
  title: '已完成',
  description: '对账与结算',
  icon: 'i-carbon-checkmark-filled'
}]

// UStepper 的数字 modelValue 是「步骤索引」，草稿与待审批都停在已下单
function stepForStatus(order: PurchaseOrder) {
  if (order.status === 'approved') return 1
  if (order.status === 'partial' || order.status === 'received') return 2
  if (order.status === 'closed') return 3
  return 0
}

const stepValue = computed(() => (selected.value ? stepForStatus(selected.value) : 0))

const detailLines = computed(() => selected.value?.lines ?? [])
const approvalSteps = computed(() => selected.value?.approvals ?? [])
const receipts = computed(() => selected.value?.receipts ?? [])
const auditEntries = computed(() => [...(selected.value?.audit ?? [])].sort((a, b) => b.at.localeCompare(a.at)))
const rejectedStep = computed(() => (selected.value && isRejectedOrder(selected.value) ? latestApproval(selected.value) : null))

const subtotal = computed(() => detailLines.value.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0))
const tax = computed(() => subtotal.value * 0.13)
const total = computed(() => subtotal.value + tax.value)

function lineAmount(line: PurchaseOrderLine) {
  return formatMoney(line.quantity * line.unitPrice)
}

const receivedRate = computed(() => {
  const lines = detailLines.value
  const quantity = lines.reduce((sum, line) => sum + line.quantity, 0)
  if (!quantity) return 0
  const received = lines.reduce((sum, line) => sum + line.received, 0)
  return Math.round(received / quantity * 100)
})

const canEditSelected = computed(() => Boolean(
  selected.value && canCreate.value && ['draft', 'pending'].includes(selected.value.status)
))
const canApproveSelected = computed(() => Boolean(
  selected.value && canApprove.value && selected.value.status === 'pending'
))
const canReceiveSelected = computed(() => Boolean(
  selected.value && canCreate.value && ['approved', 'partial'].includes(selected.value.status)
))

let localSequence = 0

function makeLocalId(prefix: string, orderId: string) {
  localSequence += 1
  return prefix + '-' + orderId.slice(-4) + '-L' + localSequence
}

function nowStamp() {
  const now = new Date()
  const pad = (value: number) => String(value).padStart(2, '0')
  return now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate())
    + ' ' + pad(now.getHours()) + ':' + pad(now.getMinutes())
}

function today() {
  return new Date().toISOString().slice(0, 10)
}

function pushAudit(order: PurchaseOrder, action: string, detail: string, actor = session.user.name) {
  const entry: PurchaseAuditEntry = {
    id: makeLocalId('aud', order.id),
    orderId: order.id,
    action,
    actor,
    at: nowStamp(),
    detail
  }
  order.audit = [...(order.audit ?? []), entry]
}

function pushApproval(order: PurchaseOrder, action: PurchaseApprovalStep['action'], note: string, actor = session.user.name) {
  const step: PurchaseApprovalStep = {
    id: makeLocalId('ap', order.id),
    orderId: order.id,
    action,
    actor,
    at: nowStamp(),
    note
  }
  order.approvals = [...(order.approvals ?? []), step]
}

function approveOrder() {
  const order = selected.value
  if (!order || !canApproveSelected.value) return
  pushApproval(order, 'approved', '审批通过（本地演示），可继续发起收货。')
  order.status = 'approved'
  pushAudit(order, approvalActionLabels.approved, '审批通过，订单状态更新为已审批。')
  toast.add({
    title: '已批准 ' + order.id,
    description: '订单状态已在本地更新为「已审批」，可发起收货。',
    color: 'success',
    icon: 'i-carbon-checkmark'
  })
}

function rejectOrder() {
  const order = selected.value
  if (!order || !canApproveSelected.value) return
  const note = '预算科目缺失，请补充成本中心后重新提交。'
  pushApproval(order, 'rejected', note)
  order.status = 'draft'
  order.note = '上次提交被驳回：' + note
  pushAudit(order, approvalActionLabels.rejected, '审批驳回，订单退回草稿，可修改后重新提交。')
  toast.add({
    title: '已驳回 ' + order.id,
    description: '订单状态已在本地退回「草稿」，并写入审批轨迹。',
    color: 'error',
    icon: 'i-carbon-close'
  })
}

const receiptOpen = ref(false)

function openReceipt() {
  if (!selected.value) return
  if (!canCreate.value) {
    toast.add({ title: '没有收货权限', description: '当前演示身份缺少 purchase.create 权限。', color: 'error' })
    return
  }
  receiptOpen.value = true
}

function handleReceipt(payload: { receiver: string, receivedAt: string, lines: { lineNo: number, quantity: number }[] }) {
  const order = selected.value
  if (!order) return
  const invalid = payload.lines.some((item) => {
    const line = order.lines.find(entry => entry.lineNo === item.lineNo)
    return !line || item.quantity <= 0 || item.quantity > line.quantity - line.received
  })
  if (invalid) {
    toast.add({
      title: '收货数量超出待收数量',
      description: '请核对各行本次收货数量后重试。',
      color: 'error',
      icon: 'i-carbon-warning-alt'
    })
    return
  }
  const receipt: PurchaseReceipt = {
    id: makeLocalId('RC', order.id).toUpperCase(),
    orderId: order.id,
    receivedAt: payload.receivedAt,
    receiver: payload.receiver,
    lines: payload.lines.map((item) => {
      const line = order.lines.find(entry => entry.lineNo === item.lineNo)!
      return { lineNo: line.lineNo, sku: line.sku, name: line.name, quantity: item.quantity }
    })
  }
  order.receipts = [...(order.receipts ?? []), receipt]
  for (const item of payload.lines) {
    const line = order.lines.find(entry => entry.lineNo === item.lineNo)
    if (line) line.received += item.quantity
  }
  const allReceived = order.lines.every(line => line.received >= line.quantity)
  order.status = allReceived ? 'received' : 'partial'
  const quantity = payload.lines.reduce((sum, item) => sum + item.quantity, 0)
  pushAudit(
    order,
    '收货',
    '登记收货单 ' + receipt.id + '，共 ' + quantity + ' 件，'
    + (allReceived ? '全部明细已到货。' : '订单状态更新为部分入库。'),
    payload.receiver
  )
  receiptOpen.value = false
  toast.add({
    title: allReceived ? '收货完成' : '已登记部分收货',
    description: order.id + ' · ' + receipt.id + ' · 本次 ' + quantity + ' 件',
    color: 'success',
    icon: 'i-carbon-inventory-management'
  })
}

const formOpen = ref(false)
const editingOrder = ref<PurchaseOrder | null>(null)

interface OrderFormData {
  supplier: string
  contact: string
  expectedAt: string
  note: string
  lines: { sku: string, name: string, spec: string, quantity: number, unitPrice: number }[]
}

function createOrder() {
  if (!canCreate.value) {
    toast.add({ title: '没有新建权限', description: '?state=forbidden 演示只读身份。', color: 'error' })
    return
  }
  editingOrder.value = null
  formOpen.value = true
}

function editOrder() {
  if (!selected.value) return
  if (!canCreate.value) {
    toast.add({ title: '没有编辑权限', description: '当前演示身份缺少 purchase.create 权限。', color: 'error' })
    return
  }
  if (!canEditSelected.value) {
    toast.add({ title: '当前状态不可编辑', description: '只有草稿或待审批的采购单可以修改。', color: 'warning' })
    return
  }
  editingOrder.value = selected.value
  formOpen.value = true
}

function nextOrderId() {
  const sequence = rows.value.reduce((max, order) => Math.max(max, Number(order.id.slice(-4)) || 0), 0) + 1
  return 'PO-2026-' + String(sequence).padStart(4, '0')
}

function handleSave(payload: { mode: 'draft' | 'submit', data: OrderFormData }) {
  const actor = session.user.name
  const orderLinesPayload = payload.data.lines.map((line, index) => ({
    lineNo: index + 1,
    sku: line.sku,
    name: line.name,
    spec: line.spec,
    quantity: line.quantity,
    received: 0,
    unitPrice: line.unitPrice
  }))

  if (editingOrder.value) {
    const order = editingOrder.value
    order.supplier = payload.data.supplier
    order.contact = payload.data.contact
    order.expectedAt = payload.data.expectedAt
    order.note = payload.data.note
    order.lines = orderLinesPayload
    if (payload.mode === 'submit') {
      order.status = 'pending'
      pushApproval(order, 'submitted', '修改采购单后重新提交审批（本地演示）。', actor)
      pushAudit(order, approvalActionLabels.submitted, '修改采购单后重新提交审批。', actor)
    } else {
      if (order.status === 'pending') order.status = 'draft'
      pushAudit(order, '保存修改', '保存采购单修改，未提交审批。', actor)
    }
    formOpen.value = false
    toast.add({
      title: payload.mode === 'submit' ? '已重新提交审批' : '已保存修改',
      description: order.id + ' · 仅更新本地列表，刷新页面后恢复初始数据。',
      color: payload.mode === 'submit' ? 'success' : 'neutral',
      icon: 'i-carbon-save'
    })
    return
  }

  const order: PurchaseOrder = {
    id: nextOrderId(),
    workspaceId: workspace.value.id,
    supplier: payload.data.supplier,
    contact: payload.data.contact,
    status: payload.mode === 'submit' ? 'pending' : 'draft',
    orderedAt: today(),
    expectedAt: payload.data.expectedAt,
    note: payload.data.note,
    lines: orderLinesPayload,
    approvals: [],
    receipts: [],
    audit: []
  }
  if (payload.mode === 'submit') {
    pushApproval(order, 'submitted', '新建采购单并提交审批（本地演示）。', actor)
    pushAudit(order, approvalActionLabels.submitted, '创建采购单并提交审批。', actor)
  } else {
    pushAudit(order, '保存草稿', '创建采购单草稿，未提交审批。', actor)
  }
  rows.value = [order, ...rows.value]
  page.value = 1
  formOpen.value = false
  toast.add({
    title: payload.mode === 'submit' ? '已提交审批' : '已保存草稿',
    description: order.id + ' · 纯 UI 演示，刷新页面后恢复初始数据。',
    color: payload.mode === 'submit' ? 'success' : 'neutral',
    icon: 'i-carbon-document-add'
  })
}

const printOpen = ref(false)

function printOrder() {
  if (!selected.value) return
  printOpen.value = true
}

const overflowItems = [[{
  label: '导出当前筛选（CSV）',
  icon: 'i-carbon-document-export',
  onSelect: exportOrders
}, {
  label: '打开采购审计',
  icon: 'i-carbon-list-checked',
  onSelect: openAudit
}]]

function exportOrders() {
  downloadCsv(
    '采购订单-' + new Date().toISOString().slice(0, 10) + '.csv',
    ['采购单号', '供应商', '状态', '下单日期', '预计到货', '明细行数', '金额'],
    filteredOrders.value.map(order => [
      order.id,
      order.supplier,
      statusLabels[order.status],
      order.orderedAt,
      order.expectedAt,
      orderLines(order),
      orderTotal(order).toFixed(2)
    ])
  )
  toast.add({
    title: '已导出 ' + filteredOrders.value.length + ' 张采购单',
    description: 'CSV 由浏览器本地生成，未经过后端。',
    color: 'success',
    icon: 'i-carbon-document-export'
  })
}

function openAudit() {
  navigateTo('/purchase-audit')
}

function refreshOrders() {
  runRefresh(() => {
    rows.value = purchaseOrders.map(clonePurchaseOrder)
    toast.add({
      title: '采购订单已刷新',
      description: '本地演示数据已恢复为初始样例。',
      color: 'neutral',
      icon: 'i-carbon-renew'
    })
  })
}

async function reloadPage() {
  await navigateTo({ path: route.path, query: {} })
}

async function copyOrderId() {
  if (!selected.value || !isSupported.value) return
  await copy(selected.value.id)
  toast.add({
    title: '已复制采购单号',
    description: selected.value.id,
    color: 'success',
    icon: 'i-carbon-copy'
  })
}
</script>

<template>
  <div class="contents">
    <UDashboardPanel id="purchase-orders">
      <template #header>
        <UDashboardNavbar title="采购订单">
          <template #leading>
            <UDashboardSidebarCollapse />
          </template>

          <template #right>
            <NotificationButton />
            <UButton
              label="新建采购单"
              icon="i-carbon-add"
              color="primary"
              size="sm"
              data-testid="orders-create"
              :disabled="!canCreate"
              @click="createOrder"
            />
            <UDropdownMenu :items="overflowItems" :content="{ align: 'end' }">
              <UButton
                icon="i-carbon-overflow-menu-horizontal"
                color="neutral"
                variant="ghost"
                size="sm"
                aria-label="更多采购单操作"
                data-testid="orders-more"
              />
            </UDropdownMenu>
          </template>
        </UDashboardNavbar>

        <UDashboardToolbar :ui="{ root: 'flex-wrap gap-3 py-2.5' }">
          <template #left>
            <UInput
              v-model="searchInput"
              icon="i-carbon-search"
              placeholder="搜索单号、供应商或商品"
              size="sm"
              class="w-60 max-w-full"
              data-testid="orders-search"
            />
            <USelect
              v-model="status"
              :items="statusItems"
              size="sm"
              class="w-36"
              data-testid="orders-status"
            />
            <USelect
              v-model="supplier"
              :items="supplierItems"
              size="sm"
              class="w-52"
              data-testid="orders-supplier"
            />
            <div class="flex items-center gap-1.5">
              <span class="text-xs text-muted">下单日期</span>
              <UInput
                v-model="dateFrom"
                type="date"
                size="sm"
                class="w-36"
                aria-label="下单日期起"
                data-testid="orders-date-from"
              />
              <span class="text-xs text-muted">至</span>
              <UInput
                v-model="dateTo"
                type="date"
                size="sm"
                class="w-36"
                aria-label="下单日期止"
                data-testid="orders-date-to"
              />
            </div>
            <UButton
              v-if="hasFilters"
              label="重置筛选"
              icon="i-carbon-reset"
              color="neutral"
              variant="ghost"
              size="sm"
              data-testid="orders-reset"
              @click="resetFilters"
            />
          </template>

          <template #right>
            <UBadge
              v-if="hasFilters"
              color="primary"
              variant="subtle"
              size="sm"
              data-testid="orders-filter-count"
            >
              当前筛选 {{ filteredOrders.length }} 张
            </UBadge>
            <p class="text-xs text-muted">
              共 {{ filteredOrders.length }} 张采购单
            </p>
            <USelect
              :model-value="ui.tableDensity"
              :items="densityItems"
              size="sm"
              class="w-24"
              aria-label="表格密度"
              data-testid="orders-density"
              @update:model-value="value => ui.setTableDensity(value === 'compact' ? 'compact' : 'cozy')"
            />
            <UButton
              label="采购审计"
              icon="i-carbon-list-checked"
              color="neutral"
              variant="ghost"
              size="sm"
              data-testid="orders-audit-link"
              @click="openAudit"
            />
            <UTooltip text="刷新列表">
              <UButton
                icon="i-carbon-renew"
                color="neutral"
                variant="ghost"
                size="sm"
                :loading="loading"
                aria-label="刷新采购订单列表"
                data-testid="orders-refresh"
                @click="refreshOrders"
              />
            </UTooltip>
          </template>
        </UDashboardToolbar>
      </template>

      <template #body>
        <AppBreadcrumb current="采购订单" class="mb-3" />
        <UCard class="nx-reveal rounded-sm" :ui="{ body: 'p-0 sm:p-0', footer: 'p-0 sm:p-0' }">
          <div v-if="showSkeleton" class="space-y-2 p-4" data-testid="orders-skeleton">
            <USkeleton v-for="n in 8" :key="n" class="h-9 w-full" />
          </div>
          <div v-else-if="isError" class="p-6" data-testid="orders-state-error">
            <UAlert
              color="error"
              variant="soft"
              icon="i-carbon-warning-alt"
              title="采购订单加载失败（演示）"
              description="?state=error 会模拟一次加载失败。本原型不会访问后端。"
              :actions="[{ label: '恢复正常', color: 'neutral', variant: 'outline', size: 'sm', onClick: reloadPage }]"
            />
          </div>
          <div v-else-if="isForbidden" class="py-6" data-testid="orders-state-forbidden">
            <UEmpty
              variant="naked"
              icon="i-carbon-view-off"
              title="没有采购订单读取权限（演示）"
              description="?state=forbidden 模拟演示身份缺少 purchase.view 权限。"
              :actions="[{ label: '恢复正常', color: 'neutral', variant: 'outline', size: 'sm', onClick: reloadPage }]"
            />
          </div>
          <div v-else-if="isEmpty" class="py-6" data-testid="orders-state-empty">
            <UEmpty
              variant="naked"
              icon="i-carbon-purchase"
              title="空状态演示"
              description="?state=empty 让采购订单列表返回 0 条数据。"
              :actions="[{ label: '恢复正常', color: 'neutral', variant: 'outline', size: 'sm', onClick: reloadPage }]"
            />
          </div>
          <div v-else :key="'orders-page-' + page" class="nx-fade">
            <ResizableTable
              :data="pageRows"
              :columns="columns"
              class="nx-table"
              :ui="tableUi"
              :row-activate="openDetail"
              data-testid="orders-table"
            >
              <template #status-cell="{ row }">
                <div class="flex flex-wrap items-center gap-1">
                  <UBadge
                    :color="statusColors[row.original.status]"
                    variant="subtle"
                    size="sm"
                    :label="statusLabels[row.original.status]"
                  />
                  <UBadge
                    v-if="isRejectedOrder(row.original)"
                    color="error"
                    variant="outline"
                    size="sm"
                    label="已驳回"
                    data-testid="orders-rejected-badge"
                  />
                </div>
              </template>
              <template #lines-cell="{ row }">
                {{ orderLines(row.original) }}
              </template>
              <template #amount-cell="{ row }">
                {{ formatMoney(orderTotal(row.original)) }}
              </template>
              <template #actions-cell="{ row }">
                <UButton
                  label="查看"
                  color="neutral"
                  variant="ghost"
                  size="xs"
                  data-testid="orders-open"
                  @click="openDetail(row.original)"
                />
              </template>
              <template #empty>
                <UEmpty
                  variant="naked"
                  icon="i-carbon-purchase"
                  title="当前筛选下没有采购订单"
                  description="切换工作区或清空筛选条件后重试"
                  :actions="[{ label: '清空筛选', color: 'neutral', variant: 'outline', size: 'sm', onClick: resetFilters }]"
                />
              </template>
            </ResizableTable>
          </div>

          <template #footer>
            <div
              v-if="!showSkeleton && !isError && !isForbidden && !isEmpty"
              class="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5"
            >
              <p class="text-xs text-muted">
                第 {{ pageStart }}–{{ pageEnd }} 条，共 {{ filteredOrders.length }} 条
                <span v-if="hasFilters" class="text-primary">
                  · 当前筛选 {{ filteredOrders.length }} 张
                </span>
              </p>
              <UPagination
                v-model:page="page"
                :total="filteredOrders.length"
                :items-per-page="pageSize"
                size="sm"
                data-testid="orders-pagination"
              />
            </div>
          </template>
        </UCard>
      </template>
    </UDashboardPanel>

    <USlideover v-model:open="detailOpen" :ui="{ content: 'w-full sm:max-w-3xl' }" data-testid="order-detail">
      <template #header>
        <div class="flex flex-wrap items-start justify-between gap-2">
          <div>
            <div class="flex items-center gap-1">
              <p class="font-mono text-xs text-muted">
                {{ selected?.id }}
              </p>
              <UButton
                v-if="selected && isSupported"
                icon="i-carbon-copy"
                color="neutral"
                variant="ghost"
                size="xs"
                aria-label="复制采购单号"
                @click="copyOrderId"
              />
            </div>
            <h2 class="mt-1 text-base font-semibold text-highlighted">
              {{ selected?.supplier }}
            </h2>
            <p class="mt-0.5 text-xs text-muted">
              {{ selected?.contact }}
            </p>
          </div>
          <UBadge
            v-if="selected"
            :color="statusColors[selected.status]"
            variant="subtle"
            size="sm"
            :label="statusLabels[selected.status]"
          />
        </div>
      </template>

      <template #body>
        <div v-if="selected" class="space-y-5">
          <AppBreadcrumb current="采购订单" :detail="selected.id" />
          <UStepper
            :model-value="stepValue"
            :items="statusSteps"
            size="sm"
            class="pb-1"
          />

          <UAlert
            v-if="rejectedStep"
            color="error"
            variant="soft"
            icon="i-carbon-close-outline"
            title="审批被驳回（演示样例）"
            :description="rejectedStep.actor + ' 于 ' + rejectedStep.at + ' 驳回：' + rejectedStep.note"
            data-testid="order-rejected-alert"
          />

          <dl class="grid grid-cols-2 gap-x-4 gap-y-2 text-[13px] sm:grid-cols-4">
            <div>
              <dt class="text-xs text-muted">
                下单日期
              </dt>
              <dd class="mt-0.5 text-default">
                {{ selected.orderedAt }}
              </dd>
            </div>
            <div>
              <dt class="text-xs text-muted">
                预计到货
              </dt>
              <dd class="mt-0.5 text-default">
                {{ selected.expectedAt }}
              </dd>
            </div>
            <div>
              <dt class="text-xs text-muted">
                明细行数
              </dt>
              <dd class="mt-0.5 tabular-nums text-default">
                {{ selected.lines.length }} 行
              </dd>
            </div>
            <div>
              <dt class="text-xs text-muted">
                总数量
              </dt>
              <dd class="mt-0.5 tabular-nums text-default">
                {{ orderLines(selected) }}
              </dd>
            </div>
          </dl>

          <div class="space-y-1.5">
            <div class="flex items-center justify-between text-xs text-muted">
              <span>入库进度</span>
              <span class="tabular-nums">{{ receivedRate }}%</span>
            </div>
            <UProgress :model-value="receivedRate" size="sm" color="primary" />
          </div>

          <UAlert
            v-if="selected.note"
            color="neutral"
            variant="soft"
            icon="i-carbon-information"
            :description="selected.note"
            :ui="{ description: 'text-xs' }"
            data-testid="order-note"
          />

          <UCard class="rounded-sm" :ui="{ body: 'p-3 sm:p-3', header: 'p-3 sm:p-3' }">
            <template #header>
              <div class="flex flex-wrap items-center justify-between gap-2">
                <p class="text-sm font-medium text-highlighted">
                  审批轨迹
                </p>
                <div class="flex items-center gap-1.5">
                  <UBadge
                    v-if="rejectedStep"
                    color="error"
                    variant="subtle"
                    size="sm"
                    label="已驳回"
                  />
                  <span class="text-xs text-muted">{{ approvalSteps.length }} 条</span>
                </div>
              </div>
            </template>
            <PurchaseApprovalTimeline :steps="approvalSteps" />
          </UCard>

          <UCard class="rounded-sm" :ui="{ body: 'p-0 sm:p-0', header: 'p-3 sm:p-3' }">
            <template #header>
              <div class="flex flex-wrap items-center justify-between gap-2">
                <p class="text-sm font-medium text-highlighted">
                  采购明细（{{ detailLines.length }} 行）
                </p>
                <p v-if="detailLines.length > 5" class="text-xs text-muted">
                  表格内部滚动查看全部明细
                </p>
              </div>
            </template>
            <div class="max-h-72 overflow-auto">
              <ResizableTable
                :data="selected.lines"
                :columns="lineColumns"
                class="nx-table"
                :ui="{ th: 'sticky top-0 z-10 bg-elevated py-2', td: 'py-2', root: 'text-[12.5px]' }"
                data-testid="order-lines"
              >
                <template #amount-cell="{ row }">
                  {{ lineAmount(row.original) }}
                </template>
              </ResizableTable>
            </div>
          </UCard>

          <UCard class="rounded-sm" :ui="{ body: 'p-3 sm:p-3', header: 'p-3 sm:p-3' }">
            <template #header>
              <div class="flex flex-wrap items-center justify-between gap-2">
                <p class="text-sm font-medium text-highlighted">
                  关联收货记录
                </p>
                <span class="text-xs text-muted">共 {{ receipts.length }} 张收货单</span>
              </div>
            </template>
            <div data-testid="order-receipts">
              <PurchaseReceiptTable :receipts="receipts" />
            </div>
          </UCard>

          <StockPermitPanel
            source-type="purchase"
            :source-id="selected.id"
            :can-manage="canReceiveSelected || canApprove"
          />

          <PurchasePayablesCard :order-id="selected.id" />

          <UCard class="rounded-sm" :ui="{ body: 'p-3 sm:p-3', header: 'p-3 sm:p-3' }">
            <template #header>
              <div class="flex flex-wrap items-center justify-between gap-2">
                <p class="text-sm font-medium text-highlighted">
                  审计记录
                </p>
                <span class="text-xs text-muted">共 {{ auditEntries.length }} 条</span>
              </div>
            </template>
            <div data-testid="order-audit-section">
              <PurchaseAuditList :entries="auditEntries" />
            </div>
          </UCard>

          <div class="flex justify-end">
            <dl class="w-full max-w-xs space-y-1.5 text-[13px]">
              <div class="flex justify-between gap-3">
                <dt class="text-muted">
                  未税合计
                </dt>
                <dd class="tabular-nums text-default">
                  {{ formatMoney(subtotal) }}
                </dd>
              </div>
              <div class="flex justify-between gap-3">
                <dt class="text-muted">
                  税额（13%）
                </dt>
                <dd class="tabular-nums text-default">
                  {{ formatMoney(tax) }}
                </dd>
              </div>
              <div class="flex justify-between gap-3 border-t border-default pt-1.5 text-sm font-semibold">
                <dt class="text-highlighted">
                  价税合计
                </dt>
                <dd class="tabular-nums text-highlighted">
                  {{ formatMoney(total) }}
                </dd>
              </div>
            </dl>
          </div>
        </div>
      </template>

      <template #footer>
        <div class="flex w-full flex-wrap items-center justify-between gap-2">
          <UButton
            label="返回列表"
            icon="i-carbon-arrow-left"
            color="neutral"
            variant="ghost"
            data-testid="order-back"
            @click="closeDetail"
          />
          <div class="flex flex-wrap items-center justify-end gap-2">
            <p
              v-if="selected?.status === 'pending' && !canApprove"
              class="text-xs text-muted"
              data-testid="order-no-approve-permission"
            >
              当前身份无审批权限
            </p>
            <UButton
              v-if="canEditSelected"
              label="编辑单据"
              icon="i-carbon-edit"
              color="neutral"
              variant="outline"
              data-testid="order-edit"
              @click="editOrder"
            />
            <UButton
              v-if="canApproveSelected"
              label="驳回"
              icon="i-carbon-close"
              color="error"
              variant="outline"
              data-testid="order-reject"
              @click="rejectOrder"
            />
            <UButton
              v-if="canApproveSelected"
              label="批准"
              icon="i-carbon-checkmark"
              data-testid="order-approve"
              @click="approveOrder"
            />
            <UButton
              v-if="canReceiveSelected"
              label="发起收货"
              icon="i-carbon-inventory-management"
              data-testid="order-receive"
              @click="openReceipt"
            />
            <UButton
              label="打印预览"
              icon="i-carbon-printer"
              color="neutral"
              variant="outline"
              data-testid="order-print"
              @click="printOrder"
            />
          </div>
        </div>
      </template>
    </USlideover>

    <PurchaseOrderFormSlideover v-model:open="formOpen" :order="editingOrder" @save="handleSave" />

    <PurchaseReceiptSlideover v-model:open="receiptOpen" :order="selected" @confirm="handleReceipt" />

    <PurchasePrintPreview v-model:open="printOpen" :order="selected" :company-name="workspace.name" />
  </div>
</template>

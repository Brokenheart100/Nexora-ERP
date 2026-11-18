<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import StockPermitExecutionSlideover from '~/components/inventory/StockPermitExecutionSlideover.vue'
import type {
  InventoryMovement,
  InventoryPosition,
  LowStockItem,
  PurchaseOrder,
  SalesOrder,
  StockPermit,
  Stocktake,
  StocktakeLine,
  TransferOrder
} from '~/mocks'
import {
  LOW_STOCK_THRESHOLD,
  clonePurchaseOrder,
  cloneStocktake,
  cloneTransferOrder,
  inventoryMovements,
  inventoryPositions,
  inventoryProducts,
  movementTypeColors,
  movementTypeLabels,
  purchaseOrders,
  salesOrders,
  stockPermitStatusColors,
  stockPermitStatusLabels,
  stocktakeStatusColors,
  stocktakeStatusLabels,
  stocktakes,
  summarizeLowStock,
  summarizeWarehouse,
  transferStatusColors,
  transferStatusLabels,
  transfers,
  warehouseAddresses,
  warehouses
} from '~/mocks'

interface ReceivePayload {
  purchaseOrderId: string
  warehouseId: string
  receiver: string
  receivedAt: string
  lines: { lineNo: number, sku: string, name: string, quantity: number }[]
}
interface IssuePayload {
  salesOrderId: string
  warehouseId: string
  shipper: string
  shippedAt: string
  lines: { lineNo: number, sku: string, name: string, quantity: number }[]
}
interface StocktakeSavePayload {
  warehouseId: string
  lines: StocktakeLine[]
}
interface StocktakeUpdatePayload {
  id: string
  lines: StocktakeLine[]
}
interface TransferConfirmPayload {
  fromWarehouseId: string
  toWarehouseId: string
  lines: { sku: string, quantity: number }[]
}

const toast = useToast()
const route = useRoute()
const { workspace } = useMockWorkspace()
const { isLoading: stateLoading, isEmpty, isError, isForbidden } = useMockState()
const { can } = useMockPermissions()
const session = useSessionStore()

const canAdjust = computed(() => can('inventory.adjust'))

/** 本地可写副本：收货、出库、盘点、调拨都只改这里，刷新后从 app/mocks 恢复初始样例。 */
const rows = ref<InventoryPosition[]>(inventoryPositions.map(position => ({ ...position })))
const movementRows = ref<InventoryMovement[]>(inventoryMovements.map(movement => ({ ...movement })))
const stocktakeList = ref<Stocktake[]>(stocktakes.map(cloneStocktake))
const transferList = ref<TransferOrder[]>(transfers.map(cloneTransferOrder))
const inboundOrders = ref<PurchaseOrder[]>(cloneInboundOrders())
const outboundOrders = ref<SalesOrder[]>(cloneOutboundOrders())

const { loading, run: runLoad } = useMockAsync(async () => {
  resetLocalState()
  return true
}, { delay: 420, immediate: true })

const showSkeleton = computed(() => loading.value || stateLoading.value)

const tab = ref('warehouses')
const tabItems = [
  { label: '仓库总览', value: 'warehouses', icon: 'i-carbon-building' },
  { label: '库存位置', value: 'positions', icon: 'i-carbon-package' },
  { label: '库存流水', value: 'movements', icon: 'i-carbon-flow' },
  { label: '盘点与调拨', value: 'operations', icon: 'i-carbon-task-complete' },
  { label: '低库存', value: 'low-stock', icon: 'i-carbon-warning-alt' }
]

const lowStockItems = computed(() => summarizeLowStock(rows.value))
const zeroStockItems = computed(() => lowStockItems.value.filter(item => item.zeroWarehouseCount > 0).length)

const warehouseRows = computed(() => warehouses.map(warehouse => ({
  warehouse,
  address: warehouseAddresses[warehouse.id] ?? warehouse.city,
  summary: summarizeWarehouse(rows.value, warehouse.id)
})))

const overviewStats = computed(() => [
  { label: '仓库', value: warehouseRows.value.length, unit: '个', hint: '华东 / 华南 / 杭州' },
  { label: '库存位置', value: rows.value.length, unit: '个', hint: '按仓库与批次登记' },
  { label: '低于演示阈值', value: lowStockItems.value.length, unit: '个 SKU', hint: '可用量 < ' + LOW_STOCK_THRESHOLD },
  { label: '库存流水', value: movementRows.value.length, unit: '条', hint: '本地样例流水' }
])

function warehouseName(id: string) {
  return warehouses.find(warehouse => warehouse.id === id)?.name ?? id
}

function productOf(sku: string) {
  return inventoryProducts[sku] ?? { name: sku, unit: '件' }
}

let localSequence = 0
function makeLocalId(prefix: string) {
  localSequence += 1
  return prefix + '-L' + String(localSequence).padStart(2, '0')
}

function nowStamp() {
  const now = new Date()
  const pad = (value: number) => String(value).padStart(2, '0')
  return now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate()) + ' ' + pad(now.getHours()) + ':' + pad(now.getMinutes())
}

function cloneInboundOrders() {
  return purchaseOrders
    .filter(order => ['approved', 'partial'].includes(order.status) && order.lines.some(line => line.received < line.quantity))
    .map(clonePurchaseOrder)
}

function cloneOutboundOrders() {
  return salesOrders
    .filter(order => ['approved', 'partial'].includes(order.status) && order.lines.some(line => line.shipped < line.quantity))
    .map(order => ({ ...order, lines: order.lines.map(line => ({ ...line })) }))
}

function resetLocalState() {
  rows.value = inventoryPositions.map(position => ({ ...position }))
  movementRows.value = inventoryMovements.map(movement => ({ ...movement }))
  stocktakeList.value = stocktakes.map(cloneStocktake)
  transferList.value = transfers.map(cloneTransferOrder)
  inboundOrders.value = cloneInboundOrders()
  outboundOrders.value = cloneOutboundOrders()
}

function addStock(warehouseId: string, sku: string, name: string, unit: string, quantity: number) {
  if (quantity <= 0) return
  let position = rows.value.find(item => item.warehouseId === warehouseId && item.sku === sku)
  if (!position) {
    position = {
      id: makeLocalId('ip'),
      warehouseId,
      sku,
      name,
      lotNo: 'LOT-' + new Date().getFullYear() + '-' + String(8000 + localSequence),
      quantity: 0,
      reserved: 0,
      available: 0,
      unit,
      updatedAt: nowStamp()
    }
    rows.value = [position, ...rows.value]
  }
  position.quantity += quantity
  position.available = Math.max(position.quantity - position.reserved, 0)
  position.updatedAt = nowStamp()
}

function removeStock(warehouseId: string, sku: string, quantity: number) {
  const position = rows.value.find(item => item.warehouseId === warehouseId && item.sku === sku)
  if (!position) return
  position.quantity = Math.max(position.quantity - quantity, 0)
  position.available = Math.max(position.quantity - position.reserved, 0)
  position.updatedAt = nowStamp()
}

function pushMovement(
  type: InventoryMovement['type'],
  warehouseId: string,
  sku: string,
  name: string,
  quantity: number,
  reference: string
) {
  movementRows.value = [{
    id: makeLocalId('mv'),
    type,
    warehouseId,
    sku,
    name,
    quantity,
    reference,
    at: nowStamp()
  }, ...movementRows.value]
}

const stockFlow = useStockFlowStore()
const permitExecOpen = ref(false)
const permitExecId = ref<string | null>(null)
const activePermits = computed(() => stockFlow.permits
  .filter(permit => permit.workspaceId === workspace.value.id && (permit.status === 'pending' || permit.status === 'partial'))
  .sort((a, b) => a.direction.localeCompare(b.direction) || a.sourceNo.localeCompare(b.sourceNo)))

const permitColumns: TableColumn<StockPermit>[] = [{
  accessorKey: 'id', header: '许可号', meta: { class: { td: 'whitespace-nowrap font-mono text-[12px]' } }
}, {
  accessorKey: 'sourceNo', header: '来源单据', meta: { class: { td: 'whitespace-nowrap font-mono text-[12px]' } }
}, {
  accessorKey: 'partner', header: '往来单位', meta: { class: { td: 'min-w-[180px]' } }
}, {
  accessorKey: 'direction', header: '方向', meta: { class: { th: 'w-24' } }
}, {
  accessorKey: 'status', header: '状态', meta: { class: { th: 'w-24' } }
}, {
  id: 'actions', header: '操作', meta: { class: { th: 'w-28', td: 'text-right' } }
}]

function openPermitExecution(id: string) {
  permitExecId.value = id
  permitExecOpen.value = true
}

function handlePermitExecute(payload: {
  permitId: string
  warehouseId: string
  operator: string
  at: string
  lines: { lineNo: number, quantity: number }[]
}) {
  const permit = stockFlow.permits.find(row => row.id === payload.permitId)
  if (!permit) return
  if (permit.direction === 'outbound') {
    for (const line of payload.lines) {
      const permitLine = permit.lines.find(row => row.lineNo === line.lineNo)
      if (!permitLine) continue
      const available = availableIn(payload.warehouseId, permitLine.sku)
      if (available < line.quantity) {
        toast.add({ title: '仓库可用量不足', description: permitLine.name + ' 当前可用 ' + available + '，本次需 ' + line.quantity + '。', color: 'error' })
        return
      }
    }
  }
  const result = stockFlow.execute(payload.permitId, {
    warehouseId: payload.warehouseId,
    operator: payload.operator,
    at: payload.at,
    lines: payload.lines
  })
  if (!result.ok || !result.execution) {
    toast.add({ title: '执行未完成', description: result.message, color: 'error' })
    return
  }
  permitExecOpen.value = false
  for (const line of result.execution.lines) {
    const product = productOf(line.sku)
    if (permit.direction === 'inbound') {
      addStock(payload.warehouseId, line.sku, line.name, product.unit, line.quantity)
    } else {
      removeStock(payload.warehouseId, line.sku, line.quantity)
    }
    pushMovement(
      permit.direction === 'inbound' ? 'inbound' : 'outbound',
      payload.warehouseId, line.sku, line.name, line.quantity,
      permit.sourceNo + ' / ' + result.execution.id
    )
  }
  toast.add({ title: '收发货已执行', description: result.message, color: 'success' })
}

function availableIn(warehouseId: string, sku: string) {
  return rows.value
    .filter(item => item.warehouseId === warehouseId && item.sku === sku)
    .reduce((sum, item) => sum + item.available, 0)
}

function requireAdjust() {
  if (canAdjust.value) return true
  toast.add({
    title: '没有库存调整权限（演示）',
    description: '当前演示身份缺少 inventory.adjust 权限。?state=forbidden 可演示无权限状态。',
    color: 'warning',
    icon: 'i-carbon-warning-alt'
  })
  return false
}

/* ---------------- 仓库总览 ---------------- */

function openWarehouse(id: string) {
  positionWarehouse.value = id
  positionSearchInput.value = ''
  positionSearch.value = ''
  positionPage.value = 1
  tab.value = 'positions'
}

/* ---------------- 库存位置 ---------------- */

const positionWarehouse = ref('all')
const positionSearchInput = ref('')
const positionSearch = ref('')
const applyPositionSearch = useDebounceFn((value: string) => {
  positionSearch.value = value
}, 220)
watch(positionSearchInput, value => applyPositionSearch(value))

const positionPage = ref(1)
const positionPageSize = 8

const positionWarehouseItems = computed(() => [
  { label: '全部仓库', value: 'all' },
  ...warehouses.map(warehouse => ({ label: warehouse.name, value: warehouse.id }))
])

const filteredPositions = computed(() => {
  if (isForbidden.value || isError.value || isEmpty.value) return []
  const keyword = positionSearch.value.trim().toLowerCase()
  const list = rows.value.filter((position) => {
    if (positionWarehouse.value !== 'all' && position.warehouseId !== positionWarehouse.value) return false
    if (!keyword) return true
    const text = [position.sku, position.name, position.lotNo, warehouseName(position.warehouseId)].join(' ').toLowerCase()
    return text.includes(keyword)
  })
  return [...list].sort((a, b) => a.warehouseId.localeCompare(b.warehouseId) || a.sku.localeCompare(b.sku) || a.lotNo.localeCompare(b.lotNo))
})

const positionPageRows = computed(() => {
  const start = (positionPage.value - 1) * positionPageSize
  return filteredPositions.value.slice(start, start + positionPageSize)
})
const positionPageStart = computed(() => (filteredPositions.value.length ? (positionPage.value - 1) * positionPageSize + 1 : 0))
const positionPageEnd = computed(() => (positionPage.value - 1) * positionPageSize + positionPageRows.value.length)
const positionHasFilters = computed(() => positionWarehouse.value !== 'all' || Boolean(positionSearch.value))

watch([positionWarehouse, positionSearch], () => {
  positionPage.value = 1
})

const positionColumns: TableColumn<InventoryPosition>[] = [
  { accessorKey: 'name', header: '商品', meta: { class: { td: 'min-w-[220px] whitespace-normal' } } },
  { id: 'warehouse', header: '仓库', meta: { class: { td: 'whitespace-nowrap text-muted' } } },
  { accessorKey: 'lotNo', header: '批次', meta: { class: { td: 'font-mono text-[11px] text-muted' } } },
  { accessorKey: 'quantity', header: '数量', meta: { class: { th: 'text-right', td: 'text-right tabular-nums' } } },
  { accessorKey: 'reserved', header: '预留', meta: { class: { th: 'text-right', td: 'text-right tabular-nums text-muted' } } },
  { accessorKey: 'available', header: '可用量', meta: { class: { th: 'text-right', td: 'text-right tabular-nums' } } },
  { accessorKey: 'updatedAt', header: '更新时间', meta: { class: { td: 'whitespace-nowrap text-xs text-muted' } } },
  { id: 'actions', header: '操作', meta: { class: { th: 'w-28 text-right', td: 'w-28 text-right' } } }
]

function resetPositionFilters() {
  positionWarehouse.value = 'all'
  positionSearchInput.value = ''
  positionSearch.value = ''
  positionPage.value = 1
}

function openPositionMovements(position: InventoryPosition) {
  movementType.value = 'all'
  movementFrom.value = ''
  movementTo.value = ''
  movementSearchInput.value = position.sku
  movementSearch.value = position.sku
  movementPage.value = 1
  tab.value = 'movements'
}

/* ---------------- 库存流水 ---------------- */

const movementSearchInput = ref('')
const movementSearch = ref('')
const applyMovementSearch = useDebounceFn((value: string) => {
  movementSearch.value = value
}, 220)
watch(movementSearchInput, value => applyMovementSearch(value))

const movementType = ref('all')
const movementFrom = ref('')
const movementTo = ref('')
const movementPage = ref(1)
const movementPageSize = 8

const movementTypeItems = [
  { label: '全部类型', value: 'all' },
  ...Object.entries(movementTypeLabels).map(([value, label]) => ({ label, value }))
]

const filteredMovements = computed(() => {
  if (isForbidden.value || isError.value || isEmpty.value) return []
  const keyword = movementSearch.value.trim().toLowerCase()
  return movementRows.value
    .filter((movement) => {
      if (movementType.value !== 'all' && movement.type !== movementType.value) return false
      const date = movement.at.slice(0, 10)
      if (movementFrom.value && date < movementFrom.value) return false
      if (movementTo.value && date > movementTo.value) return false
      if (!keyword) return true
      const text = [movement.reference, movement.sku, movement.name, warehouseName(movement.warehouseId)].join(' ').toLowerCase()
      return text.includes(keyword)
    })
    .sort((a, b) => b.at.localeCompare(a.at))
})

const movementPageRows = computed(() => {
  const start = (movementPage.value - 1) * movementPageSize
  return filteredMovements.value.slice(start, start + movementPageSize)
})
const movementPageStart = computed(() => (filteredMovements.value.length ? (movementPage.value - 1) * movementPageSize + 1 : 0))
const movementPageEnd = computed(() => (movementPage.value - 1) * movementPageSize + movementPageRows.value.length)
const movementHasFilters = computed(() => Boolean(movementSearch.value) || movementType.value !== 'all' || Boolean(movementFrom.value) || Boolean(movementTo.value))

watch([movementSearch, movementType, movementFrom, movementTo], () => {
  movementPage.value = 1
})

const movementColumns: TableColumn<InventoryMovement>[] = [
  { accessorKey: 'at', header: '时间', meta: { class: { td: 'whitespace-nowrap text-xs tabular-nums text-muted' } } },
  { accessorKey: 'reference', header: '单据号', meta: { class: { td: 'w-44' } } },
  { accessorKey: 'type', header: '类型' },
  { accessorKey: 'name', header: '商品', meta: { class: { td: 'min-w-[200px] whitespace-normal' } } },
  { id: 'warehouse', header: '仓库', meta: { class: { td: 'whitespace-nowrap text-muted' } } },
  { accessorKey: 'quantity', header: '数量', meta: { class: { th: 'text-right', td: 'text-right tabular-nums' } } }
]

function movementQuantityLabel(movement: InventoryMovement) {
  if (movement.type === 'inbound') return '+' + formatNumber(movement.quantity)
  if (movement.type === 'outbound') return '-' + formatNumber(movement.quantity)
  if (movement.type === 'adjust') return '±' + formatNumber(movement.quantity)
  return formatNumber(movement.quantity)
}

function resetMovementFilters() {
  movementSearchInput.value = ''
  movementSearch.value = ''
  movementType.value = 'all'
  movementFrom.value = ''
  movementTo.value = ''
  movementPage.value = 1
}

function openMovementReference(movement: InventoryMovement) {
  if (movement.reference.startsWith('PO-')) {
    navigateTo({ path: '/purchase-orders', query: { order: movement.reference } })
    return
  }
  if (movement.reference.startsWith('SO-')) {
    navigateTo({ path: '/sales', query: { tab: 'orders', order: movement.reference } })
    return
  }
  if (movement.reference.startsWith('TR-')) {
    const transfer = transferList.value.find(item => item.id === movement.reference)
    if (transfer) {
      openTransferDetail(transfer)
      return
    }
  }
  if (movement.reference.startsWith('ST-')) {
    const stocktake = stocktakeList.value.find(item => item.id === movement.reference)
    if (stocktake) {
      openStocktakeDetail(stocktake)
      return
    }
  }
  toast.add({
    title: '单据 ' + movement.reference,
    description: '本地演示未关联可跳转的详情。',
    color: 'neutral',
    icon: 'i-carbon-information'
  })
}

/* ---------------- 盘点与调拨 ---------------- */

const receiveOpen = ref(false)
const issueOpen = ref(false)
const stocktakeOpen = ref(false)
const transferOpen = ref(false)
const editingStocktake = ref<Stocktake | null>(null)
const editingTransfer = ref<TransferOrder | null>(null)

function openReceive() {
  if (!requireAdjust()) return
  if (!inboundOrders.value.length) {
    toast.add({
      title: '没有待收货的采购单',
      description: '示例采购单已全部收货，刷新页面可恢复初始样例。',
      color: 'neutral',
      icon: 'i-carbon-information'
    })
    return
  }
  receiveOpen.value = true
}

function openIssue() {
  if (!requireAdjust()) return
  if (!outboundOrders.value.length) {
    toast.add({
      title: '没有待出库的销售单',
      description: '示例销售单已全部发货，刷新页面可恢复初始样例。',
      color: 'neutral',
      icon: 'i-carbon-information'
    })
    return
  }
  issueOpen.value = true
}

function handleReceive(payload: ReceivePayload) {
  const order = inboundOrders.value.find(item => item.id === payload.purchaseOrderId)
  if (!order) return
  const invalid = payload.lines.find((line) => {
    const orderLine = order.lines.find(item => item.lineNo === line.lineNo)
    return !orderLine || line.quantity > orderLine.quantity - orderLine.received
  })
  if (invalid) {
    toast.add({
      title: '收货数量已变化',
      description: '采购单待收数量不足，请重新打开收货面板。',
      color: 'error',
      icon: 'i-carbon-warning'
    })
    return
  }
  let total = 0
  for (const line of payload.lines) {
    const orderLine = order.lines.find(item => item.lineNo === line.lineNo)
    if (!orderLine) continue
    orderLine.received += line.quantity
    const product = productOf(line.sku)
    addStock(payload.warehouseId, line.sku, orderLine.name, product.unit, line.quantity)
    pushMovement('inbound', payload.warehouseId, line.sku, orderLine.name, line.quantity, order.id)
    total += line.quantity
  }
  order.status = order.lines.every(line => line.received >= line.quantity) ? 'received' : 'partial'
  inboundOrders.value = inboundOrders.value.filter(item => item.lines.some(line => line.received < line.quantity))
  toast.add({
    title: '收货入库完成',
    description: order.id + ' · ' + warehouseName(payload.warehouseId) + ' · 本次入库 ' + total + ' 件；仅本次预览，刷新后恢复初始数据。',
    color: 'success',
    icon: 'i-carbon-inventory-management'
  })
}

function handleIssue(payload: IssuePayload) {
  const order = outboundOrders.value.find(item => item.id === payload.salesOrderId)
  if (!order) return
  for (const line of payload.lines) {
    const orderLine = order.lines.find(item => item.lineNo === line.lineNo)
    if (!orderLine || line.quantity > orderLine.quantity - orderLine.shipped) {
      toast.add({
        title: '出库数量已变化',
        description: '销售单待发数量不足，请重新打开出库面板。',
        color: 'error',
        icon: 'i-carbon-warning'
      })
      return
    }
    if (line.quantity > availableIn(payload.warehouseId, line.sku)) {
      toast.add({
        title: '库存不足',
        description: line.sku + ' 在 ' + warehouseName(payload.warehouseId) + ' 的可用库存不足，请调整出库数量。',
        color: 'error',
        icon: 'i-carbon-warning-alt'
      })
      return
    }
  }
  let total = 0
  for (const line of payload.lines) {
    const orderLine = order.lines.find(item => item.lineNo === line.lineNo)
    if (!orderLine) continue
    orderLine.shipped += line.quantity
    removeStock(payload.warehouseId, line.sku, line.quantity)
    pushMovement('outbound', payload.warehouseId, line.sku, orderLine.name, line.quantity, order.id)
    total += line.quantity
  }
  order.status = order.lines.every(line => line.shipped >= line.quantity) ? 'fulfilled' : 'partial'
  outboundOrders.value = outboundOrders.value.filter(item => item.lines.some(line => line.shipped < line.quantity))
  toast.add({
    title: '销售出库完成',
    description: order.id + ' · ' + warehouseName(payload.warehouseId) + ' · 本次出库 ' + total + ' 件；仅本次预览，刷新后恢复初始数据。',
    color: 'success',
    icon: 'i-carbon-arrow-up-right'
  })
}

function diffLineCount(lines: StocktakeLine[]) {
  return lines.filter(line => line.countedQty !== line.systemQty).length
}

function stocktakeDiffCount(stocktake: Stocktake) {
  return diffLineCount(stocktake.lines)
}

function nextStocktakeId() {
  const maxNumber = stocktakeList.value.reduce((max, item) => {
    const value = Number(item.id.slice(-4))
    return Number.isFinite(value) && value > max ? value : max
  }, 0)
  return 'ST-2026-' + String(maxNumber + 1).padStart(4, '0')
}

function nextTransferId() {
  const maxNumber = transferList.value.reduce((max, item) => {
    const value = Number(item.id.slice(-4))
    return Number.isFinite(value) && value > max ? value : max
  }, 0)
  return 'TR-2026-' + String(maxNumber + 1).padStart(4, '0')
}

function openStocktakeCreate() {
  if (!requireAdjust()) return
  editingStocktake.value = null
  stocktakeOpen.value = true
}

function openStocktakeDetail(stocktake: Stocktake) {
  editingStocktake.value = stocktake
  stocktakeOpen.value = true
}

function handleStocktakeSave(payload: StocktakeSavePayload) {
  const stocktake: Stocktake = {
    id: nextStocktakeId(),
    workspaceId: workspace.value.id,
    warehouseId: payload.warehouseId,
    status: 'counting',
    createdAt: nowStamp(),
    owner: session.user.name,
    lines: payload.lines
  }
  stocktakeList.value = [stocktake, ...stocktakeList.value]
  toast.add({
    title: '盘点单已创建',
    description: stocktake.id + ' · ' + warehouseName(payload.warehouseId) + ' · ' + payload.lines.length + ' 行，差异 ' + diffLineCount(payload.lines) + ' 行；仅本次预览，刷新后恢复。',
    color: 'success',
    icon: 'i-carbon-task-complete'
  })
}

function handleStocktakeUpdate(payload: StocktakeUpdatePayload) {
  const target = stocktakeList.value.find(item => item.id === payload.id)
  if (!target) return
  target.lines = payload.lines
  toast.add({
    title: '实盘数已保存',
    description: target.id + ' · 差异 ' + diffLineCount(payload.lines) + ' 行；保存实盘数不会修改库存。仅本次预览，刷新后恢复。',
    color: 'neutral',
    icon: 'i-carbon-save'
  })
}

function applyStocktake(warehouseId: string, lines: StocktakeLine[], reference: string) {
  let adjusted = 0
  for (const line of lines) {
    const diff = line.countedQty - line.systemQty
    if (!diff) continue
    const quantity = Math.max(line.countedQty, 0)
    const position = rows.value.find(item => item.warehouseId === warehouseId && item.sku === line.sku)
    if (position) {
      position.quantity = quantity
      position.available = Math.max(quantity - position.reserved, 0)
      position.updatedAt = nowStamp()
    } else {
      rows.value = [{
        id: makeLocalId('ip'),
        warehouseId,
        sku: line.sku,
        name: line.name,
        lotNo: 'LOT-' + new Date().getFullYear() + '-ST',
        quantity,
        reserved: 0,
        available: quantity,
        unit: line.unit,
        updatedAt: nowStamp()
      }, ...rows.value]
    }
    pushMovement('adjust', warehouseId, line.sku, line.name, Math.abs(diff), reference)
    adjusted += 1
  }
  return adjusted
}

function handleStocktakeComplete(payload: StocktakeUpdatePayload) {
  const target = stocktakeList.value.find(item => item.id === payload.id)
  if (!target) return
  target.lines = payload.lines
  target.status = 'completed'
  const adjusted = applyStocktake(target.warehouseId, payload.lines, target.id)
  toast.add({
    title: '盘点完成',
    description: target.id + ' · 已按差异回写 ' + adjusted + ' 个库存位置并生成盘点调整流水；仅本次预览，刷新后恢复。',
    color: 'success',
    icon: 'i-carbon-checkmark'
  })
}

function openTransferCreate() {
  if (!requireAdjust()) return
  editingTransfer.value = null
  transferOpen.value = true
}

function openTransferDetail(transfer: TransferOrder) {
  editingTransfer.value = transfer
  transferOpen.value = true
}

function executeTransferLines(
  reference: string,
  fromWarehouseId: string,
  toWarehouseId: string,
  lines: { sku: string, quantity: number }[]
) {
  for (const line of lines) {
    const product = productOf(line.sku)
    removeStock(fromWarehouseId, line.sku, line.quantity)
    addStock(toWarehouseId, line.sku, product.name, product.unit, line.quantity)
    pushMovement('transfer', fromWarehouseId, line.sku, product.name, line.quantity, reference)
    pushMovement('transfer', toWarehouseId, line.sku, product.name, line.quantity, reference)
  }
}

function handleTransferConfirm(payload: TransferConfirmPayload) {
  const shortage = payload.lines.find(line => availableIn(payload.fromWarehouseId, line.sku) < line.quantity)
  if (shortage) {
    toast.add({
      title: '源仓库存不足',
      description: shortage.sku + ' 可用库存不足，请调整调拨数量。',
      color: 'error',
      icon: 'i-carbon-warning-alt'
    })
    return
  }
  const id = nextTransferId()
  executeTransferLines(id, payload.fromWarehouseId, payload.toWarehouseId, payload.lines)
  const transfer: TransferOrder = {
    id,
    workspaceId: workspace.value.id,
    fromWarehouseId: payload.fromWarehouseId,
    toWarehouseId: payload.toWarehouseId,
    status: 'completed',
    createdAt: nowStamp(),
    owner: session.user.name,
    lines: payload.lines.map((line, index) => {
      const product = productOf(line.sku)
      return {
        lineNo: index + 1,
        sku: line.sku,
        name: product.name,
        quantity: line.quantity,
        unit: product.unit
      }
    })
  }
  transferList.value = [transfer, ...transferList.value]
  toast.add({
    title: '调拨单已生成并执行',
    description: transfer.id + ' · ' + warehouseName(payload.fromWarehouseId) + ' → ' + warehouseName(payload.toWarehouseId) + '；仅本次预览，刷新后恢复。',
    color: 'success',
    icon: 'i-carbon-arrows-horizontal'
  })
}

function handleTransferExecute(id: string) {
  const transfer = transferList.value.find(item => item.id === id)
  if (!transfer || transfer.status !== 'draft') return
  const shortage = transfer.lines.find(line => availableIn(transfer.fromWarehouseId, line.sku) < line.quantity)
  if (shortage) {
    toast.add({
      title: '源仓库存不足',
      description: shortage.sku + ' 可用库存不足，无法执行调拨。',
      color: 'error',
      icon: 'i-carbon-warning-alt'
    })
    return
  }
  executeTransferLines(
    transfer.id,
    transfer.fromWarehouseId,
    transfer.toWarehouseId,
    transfer.lines.map(line => ({ sku: line.sku, quantity: line.quantity }))
  )
  transfer.status = 'completed'
  toast.add({
    title: '调拨单已执行',
    description: transfer.id + ' · ' + warehouseName(transfer.fromWarehouseId) + ' → ' + warehouseName(transfer.toWarehouseId) + '；仅本次预览，刷新后恢复。',
    color: 'success',
    icon: 'i-carbon-arrows-horizontal'
  })
}

const stocktakeColumns: TableColumn<Stocktake>[] = [
  { accessorKey: 'id', header: '盘点单号', meta: { class: { td: 'font-mono text-[12px]' } } },
  { id: 'warehouse', header: '仓库', meta: { class: { td: 'whitespace-nowrap text-muted' } } },
  { accessorKey: 'status', header: '状态' },
  { id: 'diff', header: '差异', meta: { class: { th: 'text-right', td: 'text-right' } } },
  { accessorKey: 'owner', header: '负责人', meta: { class: { td: 'text-muted' } } },
  { accessorKey: 'createdAt', header: '创建时间', meta: { class: { td: 'whitespace-nowrap text-xs text-muted' } } },
  { id: 'actions', header: '操作', meta: { class: { th: 'w-24 text-right', td: 'w-24 text-right' } } }
]

const transferColumns: TableColumn<TransferOrder>[] = [
  { accessorKey: 'id', header: '调拨单号', meta: { class: { td: 'font-mono text-[12px]' } } },
  { id: 'route', header: '调拨路径', meta: { class: { td: 'whitespace-nowrap' } } },
  { accessorKey: 'status', header: '状态' },
  { accessorKey: 'owner', header: '负责人', meta: { class: { td: 'text-muted' } } },
  { accessorKey: 'createdAt', header: '创建时间', meta: { class: { td: 'whitespace-nowrap text-xs text-muted' } } },
  { id: 'actions', header: '操作', meta: { class: { th: 'w-24 text-right', td: 'w-24 text-right' } } }
]

/* ---------------- 低库存 ---------------- */

const lowStockColumns: TableColumn<LowStockItem>[] = [
  { accessorKey: 'name', header: '商品', meta: { class: { td: 'min-w-[220px] whitespace-normal' } } },
  { accessorKey: 'unit', header: '单位', meta: { class: { td: 'text-muted' } } },
  { accessorKey: 'totalAvailable', header: '合计可用', meta: { class: { th: 'text-right', td: 'text-right tabular-nums' } } },
  { id: 'distribution', header: '各仓库可用量', meta: { class: { td: 'whitespace-nowrap' } } },
  { id: 'status', header: '状态', meta: { class: { th: 'w-24' } } },
  { id: 'actions', header: '操作', meta: { class: { th: 'w-28 text-right', td: 'w-28 text-right' } } }
]

function openLowStockItem(item: LowStockItem) {
  positionWarehouse.value = 'all'
  positionSearchInput.value = item.sku
  positionSearch.value = item.sku
  positionPage.value = 1
  tab.value = 'positions'
}

/* ---------------- 导出与刷新 ---------------- */

function exportPositions() {
  downloadCsv(
    '库存位置-' + new Date().toISOString().slice(0, 10) + '.csv',
    ['商品', 'SKU', '仓库', '批次', '数量', '预留', '可用量', '更新时间'],
    filteredPositions.value.map(position => [
      position.name,
      position.sku,
      warehouseName(position.warehouseId),
      position.lotNo,
      position.quantity,
      position.reserved,
      position.available,
      position.updatedAt
    ])
  )
  toast.add({
    title: '已导出 ' + filteredPositions.value.length + ' 个库存位置',
    description: 'CSV 由浏览器本地生成，未经过后端。',
    color: 'success',
    icon: 'i-carbon-document-export'
  })
}

function exportMovements() {
  downloadCsv(
    '库存流水-' + new Date().toISOString().slice(0, 10) + '.csv',
    ['时间', '单据号', '类型', '商品', 'SKU', '仓库', '数量'],
    filteredMovements.value.map(movement => [
      movement.at,
      movement.reference,
      movementTypeLabels[movement.type],
      movement.name,
      movement.sku,
      warehouseName(movement.warehouseId),
      movement.quantity
    ])
  )
  toast.add({
    title: '已导出 ' + filteredMovements.value.length + ' 条库存流水',
    description: 'CSV 由浏览器本地生成，未经过后端。',
    color: 'success',
    icon: 'i-carbon-document-export'
  })
}

function exportLowStock() {
  downloadCsv(
    '低库存-' + new Date().toISOString().slice(0, 10) + '.csv',
    ['商品', 'SKU', '单位', '合计可用', '阈值', '涉及仓库数', '零库存仓库数'],
    lowStockItems.value.map(item => [
      item.name,
      item.sku,
      item.unit,
      item.totalAvailable,
      LOW_STOCK_THRESHOLD,
      item.warehouseIds.length,
      item.zeroWarehouseCount
    ])
  )
  toast.add({
    title: '已导出 ' + lowStockItems.value.length + ' 个低库存 SKU',
    description: '阈值 ' + LOW_STOCK_THRESHOLD + ' 件，CSV 由浏览器本地生成。',
    color: 'success',
    icon: 'i-carbon-document-export'
  })
}

function refreshInventory() {
  void runLoad().then(() => {
    if (isError.value || isForbidden.value) return
    toast.add({
      title: '库存数据已刷新',
      description: '本地演示数据已恢复为初始样例。',
      color: 'neutral',
      icon: 'i-carbon-renew'
    })
  })
}

async function reloadPage() {
  await navigateTo({ path: route.path, query: {} })
}

const overflowItems = computed(() => [
  [{
    label: '出库发货',
    icon: 'i-carbon-arrow-up-right',
    disabled: !canAdjust.value,
    onSelect: openIssue
  }],
  [{
    label: '新建盘点',
    icon: 'i-carbon-task-complete',
    disabled: !canAdjust.value,
    onSelect: openStocktakeCreate
  }, {
    label: '新建调拨',
    icon: 'i-carbon-arrows-horizontal',
    disabled: !canAdjust.value,
    onSelect: openTransferCreate
  }],
  [{
    label: '导出当前库存位置',
    icon: 'i-carbon-download',
    onSelect: exportPositions
  }]
])
</script>

<template>
  <div class="contents">
    <UDashboardPanel id="inventory">
      <template #header>
        <UDashboardNavbar title="库存管理">
          <template #leading>
            <UDashboardSidebarCollapse />
          </template>

          <template #right>
            <NotificationButton />
            <UButton
              label="收货入库"
              icon="i-carbon-inventory-management"
              color="primary"
              size="sm"
              :disabled="!canAdjust"
              data-testid="inventory-receive"
              @click="openReceive"
            />
            <UDropdownMenu :items="overflowItems" :content="{ align: 'end' }">
              <UButton
                icon="i-carbon-overflow-menu-horizontal"
                color="neutral"
                variant="ghost"
                size="sm"
                aria-label="更多库存操作"
                data-testid="inventory-more"
              />
            </UDropdownMenu>
          </template>
        </UDashboardNavbar>

        <UDashboardToolbar :ui="{ root: 'flex-wrap gap-3 py-2.5' }">
          <template #left>
            <UTabs
              v-model="tab"
              :items="tabItems"
              :content="false"
              size="sm"
              data-testid="inventory-tabs"
            />
          </template>

          <template #right>
            <UBadge
              v-if="lowStockItems.length"
              color="warning"
              variant="subtle"
              size="sm"
              data-testid="inventory-low-badge"
            >
              低库存 {{ lowStockItems.length }} 个 SKU
            </UBadge>
            <p class="text-xs text-muted">
              共 {{ rows.length }} 个库存位置 · {{ movementRows.length }} 条流水
            </p>
            <UTooltip text="刷新库存数据">
              <UButton
                icon="i-carbon-renew"
                color="neutral"
                variant="ghost"
                size="sm"
                :loading="loading"
                aria-label="刷新库存数据"
                data-testid="inventory-refresh"
                @click="refreshInventory"
              />
            </UTooltip>
          </template>
        </UDashboardToolbar>
      </template>

      <template #body>
        <AppBreadcrumb current="库存管理" class="mb-3" />
        <UCard class="nx-reveal rounded-sm" :ui="{ body: 'p-0 sm:p-0', footer: 'p-0 sm:p-0' }">
          <div v-if="showSkeleton" class="space-y-2 p-4" data-testid="inventory-skeleton">
            <USkeleton v-for="n in 8" :key="n" class="h-9 w-full" />
          </div>
          <div v-else-if="isError" class="p-6" data-testid="inventory-state-error">
            <UAlert
              color="error"
              variant="soft"
              icon="i-carbon-warning-alt"
              title="库存数据加载失败（演示）"
              description="?state=error 会模拟一次加载失败。本原型不会访问后端。"
              :actions="[{ label: '恢复正常', color: 'neutral', variant: 'outline', size: 'sm', onClick: reloadPage }]"
            />
          </div>
          <div v-else-if="isForbidden" class="py-6" data-testid="inventory-state-forbidden">
            <UEmpty
              variant="naked"
              icon="i-carbon-view-off"
              title="没有库存读取权限（演示）"
              description="?state=forbidden 模拟演示身份缺少 inventory.view 权限。"
              :actions="[{ label: '恢复正常', color: 'neutral', variant: 'outline', size: 'sm', onClick: reloadPage }]"
            />
          </div>
          <div v-else-if="isEmpty" class="py-6" data-testid="inventory-state-empty">
            <UEmpty
              variant="naked"
              icon="i-carbon-inventory-management"
              title="空状态演示"
              description="?state=empty 让仓库、库存位置与库存流水返回 0 条数据。"
              :actions="[{ label: '恢复正常', color: 'neutral', variant: 'outline', size: 'sm', onClick: reloadPage }]"
            />
          </div>
          <div v-else :key="'inventory-' + tab" class="nx-fade">
            <div v-if="tab === 'warehouses'" data-testid="inventory-warehouses">
              <div class="grid gap-3 border-b border-default px-4 py-3 sm:grid-cols-2 xl:grid-cols-4">
                <div
                  v-for="stat in overviewStats"
                  :key="stat.label"
                  class="rounded-sm border border-default p-3"
                  data-testid="inventory-overview"
                >
                  <p class="text-xs text-muted">
                    {{ stat.label }}
                  </p>
                  <p class="mt-1 text-xl font-semibold tabular-nums text-highlighted">
                    {{ stat.value }}
                    <span class="ml-1 text-xs font-normal text-muted">{{ stat.unit }}</span>
                  </p>
                  <p class="mt-0.5 text-[11px] text-muted">
                    {{ stat.hint }}
                  </p>
                </div>
              </div>
              <div class="grid gap-4 p-4 xl:grid-cols-3">
                <InventoryWarehouseCard
                  v-for="entry in warehouseRows"
                  :key="entry.warehouse.id"
                  :warehouse="entry.warehouse"
                  :address="entry.address"
                  :summary="entry.summary"
                  @open="openWarehouse(entry.warehouse.id)"
                />
              </div>
              <div class="border-t border-default px-4 py-2.5 text-xs text-muted" data-testid="inventory-threshold-hint">
                预警口径：单仓库存位置可用量低于 {{ LOW_STOCK_THRESHOLD }} 件计入预警；「低库存」页签按商品跨仓库汇总可用量。
              </div>
            </div>

            <div v-else-if="tab === 'positions'" data-testid="inventory-positions">
              <div class="flex flex-wrap items-center gap-2 border-b border-default px-4 py-2.5">
                <USelect
                  v-model="positionWarehouse"
                  :items="positionWarehouseItems"
                  size="sm"
                  class="w-44"
                  data-testid="inventory-position-warehouse"
                />
                <UInput
                  v-model="positionSearchInput"
                  icon="i-carbon-search"
                  placeholder="搜索商品、SKU 或批次"
                  size="sm"
                  class="w-64 max-w-full"
                  data-testid="inventory-position-search"
                />
                <UButton
                  v-if="positionHasFilters"
                  label="重置"
                  icon="i-carbon-reset"
                  color="neutral"
                  variant="ghost"
                  size="sm"
                  data-testid="inventory-position-reset"
                  @click="resetPositionFilters"
                />
                <div class="ml-auto flex items-center gap-2">
                  <p class="text-xs text-muted">
                    共 {{ filteredPositions.length }} 个位置
                  </p>
                  <UButton
                    label="导出 CSV"
                    icon="i-carbon-download"
                    color="neutral"
                    variant="ghost"
                    size="sm"
                    data-testid="inventory-position-export"
                    @click="exportPositions"
                  />
                </div>
              </div>
              <ResizableTable
                :data="positionPageRows"
                :columns="positionColumns"
                class="nx-table"
                :ui="{ th: 'py-2.5', td: 'py-3' }"
                :row-activate="openPositionMovements"
                data-testid="inventory-position-table"
              >
                <template #name-cell="{ row }">
                  <div class="min-w-0">
                    <p class="truncate text-default">
                      {{ row.original.name }}
                    </p>
                    <p class="mt-0.5 font-mono text-[11px] text-muted">
                      {{ row.original.sku }}
                    </p>
                  </div>
                </template>
                <template #warehouse-cell="{ row }">
                  {{ warehouseName(row.original.warehouseId) }}
                </template>
                <template #available-cell="{ row }">
                  <span :class="row.original.available < LOW_STOCK_THRESHOLD ? 'text-warning' : ''">
                    {{ formatNumber(row.original.available) }}
                  </span>
                </template>
                <template #actions-cell="{ row }">
                  <UButton
                    label="流水"
                    color="neutral"
                    variant="ghost"
                    size="xs"
                    data-testid="inventory-position-movements"
                    @click="openPositionMovements(row.original)"
                  />
                </template>
                <template #empty>
                  <UEmpty
                    variant="naked"
                    icon="i-carbon-package"
                    title="当前筛选下没有库存位置"
                    description="切换仓库或清空搜索条件后重试"
                    :actions="[{ label: '清空筛选', color: 'neutral', variant: 'outline', size: 'sm', onClick: resetPositionFilters }]"
                  />
                </template>
              </ResizableTable>
              <div class="flex flex-wrap items-center justify-between gap-3 border-t border-default px-4 py-2.5">
                <p class="text-xs text-muted">
                  第 {{ positionPageStart }}–{{ positionPageEnd }} 条，共 {{ filteredPositions.length }} 条
                </p>
                <UPagination
                  v-model:page="positionPage"
                  :total="filteredPositions.length"
                  :items-per-page="positionPageSize"
                  size="sm"
                  data-testid="inventory-position-pagination"
                />
              </div>
            </div>

            <div v-else-if="tab === 'movements'" data-testid="inventory-movements">
              <div class="flex flex-wrap items-center gap-2 border-b border-default px-4 py-2.5">
                <UInput
                  v-model="movementSearchInput"
                  icon="i-carbon-search"
                  placeholder="搜索单据号、商品或 SKU"
                  size="sm"
                  class="w-64 max-w-full"
                  data-testid="movement-search"
                />
                <USelect
                  v-model="movementType"
                  :items="movementTypeItems"
                  size="sm"
                  class="w-36"
                  data-testid="movement-type"
                />
                <div class="flex items-center gap-1.5">
                  <UInput
                    v-model="movementFrom"
                    type="date"
                    size="sm"
                    class="w-36"
                    aria-label="流水开始日期"
                    data-testid="movement-date-from"
                  />
                  <span class="text-xs text-muted">至</span>
                  <UInput
                    v-model="movementTo"
                    type="date"
                    size="sm"
                    class="w-36"
                    aria-label="流水结束日期"
                    data-testid="movement-date-to"
                  />
                </div>
                <UButton
                  v-if="movementHasFilters"
                  label="重置"
                  icon="i-carbon-reset"
                  color="neutral"
                  variant="ghost"
                  size="sm"
                  data-testid="movement-reset"
                  @click="resetMovementFilters"
                />
                <div class="ml-auto flex items-center gap-2">
                  <p class="text-xs text-muted">
                    共 {{ filteredMovements.length }} 条流水
                  </p>
                  <UButton
                    label="导出 CSV"
                    icon="i-carbon-download"
                    color="neutral"
                    variant="ghost"
                    size="sm"
                    data-testid="movement-export"
                    @click="exportMovements"
                  />
                </div>
              </div>
              <ResizableTable
                :data="movementPageRows"
                :columns="movementColumns"
                class="nx-table"
                :ui="{ th: 'py-2.5', td: 'py-3' }"
                :row-activate="openMovementReference"
                data-testid="movement-table"
              >
                <template #reference-cell="{ row }">
                  <UButton
                    :label="row.original.reference"
                    color="primary"
                    variant="ghost"
                    size="xs"
                    class="px-0 font-mono text-[12px]"
                    data-testid="movement-reference"
                    @click="openMovementReference(row.original)"
                  />
                </template>
                <template #type-cell="{ row }">
                  <UBadge
                    :color="movementTypeColors[row.original.type]"
                    variant="subtle"
                    size="sm"
                    :label="movementTypeLabels[row.original.type]"
                  />
                </template>
                <template #name-cell="{ row }">
                  <div class="min-w-0">
                    <p class="truncate text-default">
                      {{ row.original.name }}
                    </p>
                    <p class="mt-0.5 font-mono text-[11px] text-muted">
                      {{ row.original.sku }}
                    </p>
                  </div>
                </template>
                <template #warehouse-cell="{ row }">
                  {{ warehouseName(row.original.warehouseId) }}
                </template>
                <template #quantity-cell="{ row }">
                  {{ movementQuantityLabel(row.original) }}
                </template>
                <template #empty>
                  <UEmpty
                    variant="naked"
                    icon="i-carbon-flow"
                    title="当前筛选下没有库存流水"
                    description="调整商品、类型或时间范围后重试"
                    :actions="[{ label: '清空筛选', color: 'neutral', variant: 'outline', size: 'sm', onClick: resetMovementFilters }]"
                  />
                </template>
              </ResizableTable>
              <div class="flex flex-wrap items-center justify-between gap-3 border-t border-default px-4 py-2.5">
                <p class="text-xs text-muted">
                  第 {{ movementPageStart }}–{{ movementPageEnd }} 条，共 {{ filteredMovements.length }} 条
                </p>
                <UPagination
                  v-model:page="movementPage"
                  :total="filteredMovements.length"
                  :items-per-page="movementPageSize"
                  size="sm"
                  data-testid="movement-pagination"
                />
              </div>
            </div>

            <div v-else-if="tab === 'operations'" class="grid gap-4 p-4 xl:grid-cols-2" data-testid="inventory-operations">
              <UCard class="rounded-sm xl:col-span-2" :ui="{ body: 'p-0 sm:p-0', header: 'p-3 sm:px-4' }">
                <template #header>
                  <div class="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p class="text-sm font-medium text-highlighted">
                        待执行收发货许可
                      </p>
                      <p class="mt-0.5 text-xs text-muted">
                        仓库按许可执行，执行成功同步库存位置与流水，并回写采购或销售详情
                      </p>
                    </div>
                    <UBadge
                      color="neutral"
                      variant="subtle"
                      size="sm"
                      :label="activePermits.length + ' 张待执行'"
                    />
                  </div>
                </template>
                <ResizableTable
                  :data="activePermits"
                  :columns="permitColumns"
                  class="nx-table"
                  data-testid="inventory-permits"
                >
                  <template #direction-cell="{ row }">
                    <UBadge
                      :color="row.original.direction === 'inbound' ? 'info' : 'warning'"
                      variant="subtle"
                      size="sm"
                      :label="row.original.direction === 'inbound' ? '入库' : '出库'"
                    />
                  </template>
                  <template #status-cell="{ row }">
                    <UBadge
                      :color="stockPermitStatusColors[row.original.status]"
                      variant="subtle"
                      size="sm"
                      :label="stockPermitStatusLabels[row.original.status]"
                    />
                  </template>
                  <template #actions-cell="{ row }">
                    <div class="flex justify-end">
                      <UButton
                        label="执行"
                        color="primary"
                        variant="ghost"
                        size="xs"
                        :data-testid="'permit-execute-' + row.original.id"
                        @click="openPermitExecution(row.original.id)"
                      />
                    </div>
                  </template>
                  <template #empty>
                    <div class="px-4 py-10 text-center text-sm text-muted" data-testid="inventory-permits-empty">
                      当前没有待执行的收发货许可；采购或销售订单审批后会在此显示。
                    </div>
                  </template>
                </ResizableTable>
                <StockPermitExecutionSlideover
                  v-model:open="permitExecOpen"
                  :permit-id="permitExecId"
                  @confirm="handlePermitExecute"
                />
              </UCard>
              <UCard class="rounded-sm" :ui="{ body: 'p-0 sm:p-0', header: 'p-3 sm:px-4' }">
                <template #header>
                  <div class="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p class="text-sm font-medium text-highlighted">
                        盘点单
                      </p>
                      <p class="mt-0.5 text-xs text-muted">
                        录入实盘数，差异高亮；完成后回写库存位置
                      </p>
                    </div>
                    <UButton
                      label="新建盘点"
                      icon="i-carbon-add"
                      size="sm"
                      :disabled="!canAdjust"
                      data-testid="stocktake-create"
                      @click="openStocktakeCreate"
                    />
                  </div>
                </template>
                <ResizableTable
                  :data="stocktakeList"
                  :columns="stocktakeColumns"
                  class="nx-table"
                  :ui="{ th: 'py-2.5', td: 'py-2.5' }"
                  :row-activate="openStocktakeDetail"
                  data-testid="stocktake-table"
                >
                  <template #warehouse-cell="{ row }">
                    {{ warehouseName(row.original.warehouseId) }}
                  </template>
                  <template #status-cell="{ row }">
                    <UBadge
                      :color="stocktakeStatusColors[row.original.status]"
                      variant="subtle"
                      size="sm"
                      :label="stocktakeStatusLabels[row.original.status]"
                    />
                  </template>
                  <template #diff-cell="{ row }">
                    <UBadge
                      :color="stocktakeDiffCount(row.original) ? 'warning' : 'neutral'"
                      variant="subtle"
                      size="sm"
                    >
                      {{ stocktakeDiffCount(row.original) ? stocktakeDiffCount(row.original) + ' 行差异' : '无差异' }}
                    </UBadge>
                  </template>
                  <template #actions-cell="{ row }">
                    <UButton
                      :label="row.original.status === 'completed' ? '查看' : '录入'"
                      color="neutral"
                      variant="ghost"
                      size="xs"
                      data-testid="stocktake-open"
                      @click="openStocktakeDetail(row.original)"
                    />
                  </template>
                  <template #empty>
                    <UEmpty
                      variant="naked"
                      icon="i-carbon-task-complete"
                      title="还没有盘点单"
                      description="点击「新建盘点」创建第一张盘点单"
                    />
                  </template>
                </ResizableTable>
                <div class="border-t border-default px-4 py-2 text-xs text-muted">
                  共 {{ stocktakeList.length }} 张盘点单
                </div>
              </UCard>

              <UCard class="rounded-sm" :ui="{ body: 'p-0 sm:p-0', header: 'p-3 sm:px-4' }">
                <template #header>
                  <div class="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p class="text-sm font-medium text-highlighted">
                        调拨单
                      </p>
                      <p class="mt-0.5 text-xs text-muted">
                        选择源 / 目标仓库，执行后同时更新两边库存
                      </p>
                    </div>
                    <UButton
                      label="新建调拨"
                      icon="i-carbon-add"
                      size="sm"
                      :disabled="!canAdjust"
                      data-testid="transfer-create"
                      @click="openTransferCreate"
                    />
                  </div>
                </template>
                <ResizableTable
                  :data="transferList"
                  :columns="transferColumns"
                  class="nx-table"
                  :ui="{ th: 'py-2.5', td: 'py-2.5' }"
                  :row-activate="openTransferDetail"
                  data-testid="transfer-table"
                >
                  <template #route-cell="{ row }">
                    <span class="inline-flex items-center gap-1">
                      {{ warehouseName(row.original.fromWarehouseId) }}
                      <UIcon name="i-carbon-arrow-right" class="size-3.5 text-muted" />
                      {{ warehouseName(row.original.toWarehouseId) }}
                    </span>
                  </template>
                  <template #status-cell="{ row }">
                    <UBadge
                      :color="transferStatusColors[row.original.status]"
                      variant="subtle"
                      size="sm"
                      :label="transferStatusLabels[row.original.status]"
                    />
                  </template>
                  <template #actions-cell="{ row }">
                    <UButton
                      :label="row.original.status === 'draft' ? '执行' : '查看'"
                      color="neutral"
                      variant="ghost"
                      size="xs"
                      data-testid="transfer-open"
                      @click="openTransferDetail(row.original)"
                    />
                  </template>
                  <template #empty>
                    <UEmpty
                      variant="naked"
                      icon="i-carbon-arrows-horizontal"
                      title="还没有调拨单"
                      description="点击「新建调拨」创建第一张调拨单"
                    />
                  </template>
                </ResizableTable>
                <div class="border-t border-default px-4 py-2 text-xs text-muted">
                  共 {{ transferList.length }} 张调拨单
                </div>
              </UCard>
            </div>

            <div v-else class="p-4" data-testid="inventory-low-stock">
              <UAlert
                color="warning"
                variant="soft"
                icon="i-carbon-warning-alt"
                title="低库存演示阈值"
                :description="'按商品跨仓库汇总可用量，低于 ' + LOW_STOCK_THRESHOLD + ' 件（含 0）计入低库存；阈值常量定义在 app/mocks/inventory.ts 的 LOW_STOCK_THRESHOLD。'"
                data-testid="inventory-low-threshold"
              />
              <div class="mt-3 flex flex-wrap items-center justify-between gap-2">
                <div class="flex items-center gap-2">
                  <p class="text-sm font-medium text-highlighted">
                    低库存商品
                  </p>
                  <UBadge variant="subtle" color="warning" size="sm">
                    {{ lowStockItems.length }} 个 SKU
                  </UBadge>
                </div>
                <div class="flex items-center gap-2">
                  <p class="text-xs text-muted">
                    至少一个仓库零库存：{{ zeroStockItems }} 个
                  </p>
                  <UButton
                    label="导出 CSV"
                    icon="i-carbon-download"
                    color="neutral"
                    variant="ghost"
                    size="sm"
                    data-testid="inventory-low-export"
                    @click="exportLowStock"
                  />
                </div>
              </div>
              <ResizableTable
                :data="lowStockItems"
                :columns="lowStockColumns"
                class="nx-table mt-3"
                :ui="{ th: 'py-2.5', td: 'py-3' }"
                :row-activate="openLowStockItem"
                data-testid="inventory-low-table"
              >
                <template #name-cell="{ row }">
                  <div class="min-w-0">
                    <p class="truncate text-default">
                      {{ row.original.name }}
                    </p>
                    <p class="mt-0.5 font-mono text-[11px] text-muted">
                      {{ row.original.sku }}
                    </p>
                  </div>
                </template>
                <template #totalAvailable-cell="{ row }">
                  <span :class="row.original.totalAvailable === 0 ? 'text-error' : 'text-warning'">
                    {{ formatNumber(row.original.totalAvailable) }}
                  </span>
                  <span class="ml-1 text-xs text-muted">{{ row.original.unit }}</span>
                </template>
                <template #distribution-cell="{ row }">
                  <div class="flex flex-wrap items-center gap-1.5">
                    <span
                      v-for="warehouseId in row.original.warehouseIds"
                      :key="warehouseId"
                      class="inline-flex items-center gap-1 rounded-sm border border-default px-1.5 py-0.5 text-[11px]"
                      :class="(row.original.byWarehouse[warehouseId] ?? 0) === 0 ? 'text-error' : 'text-muted'"
                    >
                      {{ warehouseName(warehouseId).slice(0, 2) }}
                      <span class="font-mono tabular-nums text-default">{{ formatNumber(row.original.byWarehouse[warehouseId] ?? 0) }}</span>
                    </span>
                  </div>
                </template>
                <template #status-cell="{ row }">
                  <UBadge
                    :color="row.original.totalAvailable === 0 ? 'error' : 'warning'"
                    variant="subtle"
                    size="sm"
                    data-testid="inventory-low-status"
                  >
                    {{ row.original.totalAvailable === 0 ? '零库存' : '低库存' }}
                  </UBadge>
                </template>
                <template #actions-cell="{ row }">
                  <UButton
                    label="查看位置"
                    color="neutral"
                    variant="ghost"
                    size="xs"
                    data-testid="inventory-low-open"
                    @click="openLowStockItem(row.original)"
                  />
                </template>
                <template #empty>
                  <UEmpty
                    variant="naked"
                    icon="i-carbon-checkmark-filled"
                    title="当前没有低库存商品"
                    description="所有商品跨仓库可用量均高于演示阈值"
                  />
                </template>
              </ResizableTable>
            </div>
          </div>
        </UCard>
      </template>
    </UDashboardPanel>

    <InventoryReceiveSlideover
      v-model:open="receiveOpen"
      :orders="inboundOrders"
      :warehouses="warehouses"
      :default-warehouse-id="workspace.id === 'ws-hq' ? 'wh-east' : undefined"
      @confirm="handleReceive"
    />

    <InventoryIssueSlideover
      v-model:open="issueOpen"
      :orders="outboundOrders"
      :warehouses="warehouses"
      :positions="rows"
      :default-warehouse-id="workspace.id === 'ws-hq' ? 'wh-east' : undefined"
      @confirm="handleIssue"
    />

    <InventoryStocktakeSlideover
      v-model:open="stocktakeOpen"
      :stocktake="editingStocktake"
      :warehouses="warehouses"
      :positions="rows"
      @save="handleStocktakeSave"
      @update="handleStocktakeUpdate"
      @complete="handleStocktakeComplete"
    />

    <InventoryTransferSlideover
      v-model:open="transferOpen"
      :transfer="editingTransfer"
      :warehouses="warehouses"
      :positions="rows"
      @confirm="handleTransferConfirm"
      @execute="handleTransferExecute"
    />
  </div>
</template>

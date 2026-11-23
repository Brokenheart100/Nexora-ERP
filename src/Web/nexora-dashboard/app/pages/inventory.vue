<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import { z } from 'zod'
import { useWarehouseConnection } from '~/composables/inventory/useWarehouseConnection'
import { useWarehouseReturns } from '~/composables/inventory/useWarehouseReturns'
import { useWarehouseOperations } from '~/composables/inventory/useWarehouseOperations'
import StockPermitExecutionSlideover from '~/components/inventory/StockPermitExecutionSlideover.vue'
import InventoryLowStockTab from '~/components/inventory/LowStockTab.vue'
import InventoryMovementsTab from '~/components/inventory/MovementsTab.vue'
import InventoryOverviewTab from '~/components/inventory/OverviewTab.vue'
import InventoryPositionsTab from '~/components/inventory/PositionsTab.vue'
import StockReturnDetailSlideover from '~/components/inventory/StockReturnDetailSlideover.vue'
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
  inventoryProducts,
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

const connection = useWarehouseConnection()
const connected = computed(() => connection.query.connected)
const toast = useToast()
const route = useRoute()
const { workspace } = useMockWorkspace()
const mockState = useMockState()
const stateLoading = computed(() => (connected.value ? connection.query.loading : mockState.isLoading.value))
const isEmpty = computed(() => (connected.value ? false : mockState.isEmpty.value))
const isError = computed(() =>
  connected.value ? !!connection.query.problem && ![403, 404].includes(connection.query.status) : mockState.isError.value
)
const isForbidden = computed(() =>
  connected.value
    ? (!connection.query.enabled && !connection.query.loading) || [403, 404].includes(connection.query.status)
    : mockState.isForbidden.value
)
const { can } = useMockPermissions()
const session = useSessionStore()

const canAdjust = computed(() => (connected.value ? connection.query.data?.selected?.canReceive === true : can('inventory.adjust')))

const inventory = useInventoryStore()

/** 本地可写副本：收货、出库、盘点、调拨只改这里；初始样例来自 inventory store，退货确认后重新进入本页即可看到联动后的库存与流水。 */
const rows = ref<InventoryPosition[]>(inventory.positions.map(position => ({ ...position })))
const movementRows = ref<InventoryMovement[]>(inventory.movements.map(movement => ({ ...movement })))
const stocktakeList = ref<Stocktake[]>(stocktakes.map(cloneStocktake))
const transferList = ref<TransferOrder[]>(transfers.map(cloneTransferOrder))
const inboundOrders = ref<PurchaseOrder[]>(cloneInboundOrders())
const outboundOrders = ref<SalesOrder[]>(cloneOutboundOrders())

const { loading, run: runLoad } = useMockAsync(
  async () => {
    resetLocalState()
    return true
  },
  { delay: 420, immediate: true }
)

const showSkeleton = computed(() => (connected.value ? false : loading.value) || stateLoading.value)

const mockTabItems = [
  { label: '仓库总览', value: 'warehouses', icon: 'i-carbon-building' },
  { label: '库存位置', value: 'positions', icon: 'i-carbon-package' },
  { label: '库存流水', value: 'movements', icon: 'i-carbon-flow' },
  { label: '盘点与调拨', value: 'operations', icon: 'i-carbon-task-complete' },
  { label: '仓网与调拨', value: 'warehouse-ops', icon: 'i-carbon-network-4' },
  { label: '低库存', value: 'low-stock', icon: 'i-carbon-warning-alt' }
]
const initialTab = () => mockTabItems.some(item => item.value === route.query.tab) ? String(route.query.tab) : 'warehouses'
const tab = ref(initialTab())
const returnFlow = useWarehouseReturns(connection, tab)
const warehouseOps = useWarehouseOperations(connection, tab)
watch(() => route.query.tab, () => { if (connected.value) tab.value = initialTab() })

const tabItems = computed(() =>
  connected.value
    ? mockTabItems.filter(value => value.value !== 'low-stock')
    : mockTabItems
)
const lowStockItems = computed(() => summarizeLowStock(rows.value))

const warehouseRows = computed(() =>
  warehouses.map(warehouse => ({
    warehouse,
    address: warehouseAddresses[warehouse.id] ?? warehouse.city,
    summary: summarizeWarehouse(rows.value, warehouse.id)
  }))
)

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
  return (
    now.getFullYear()
    + '-'
    + pad(now.getMonth() + 1)
    + '-'
    + pad(now.getDate())
    + ' '
    + pad(now.getHours())
    + ':'
    + pad(now.getMinutes())
  )
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
  rows.value = inventory.positions.map(position => ({ ...position }))
  movementRows.value = inventory.movements.map(movement => ({ ...movement }))
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
  movementRows.value = [
    {
      id: makeLocalId('mv'),
      type,
      warehouseId,
      sku,
      name,
      quantity,
      reference,
      at: nowStamp()
    },
    ...movementRows.value
  ]
}

const stockFlow = useStockFlowStore()
const permitExecOpen = ref(false)
const permitExecId = ref<string | null>(null)
const activePermits = computed(() =>
  connected.value
    ? connection.taskRows
    : stockFlow.permits
        .filter(permit => permit.workspaceId === workspace.value.id && (permit.status === 'pending' || permit.status === 'partial'))
        .sort((a, b) => a.direction.localeCompare(b.direction) || a.sourceNo.localeCompare(b.sourceNo))
)

const permitColumns: TableColumn<Pick<StockPermit, 'id' | 'sourceNo' | 'partner' | 'direction' | 'status'>>[] = [
  {
    accessorKey: 'id',
    header: '许可号',
    meta: { class: { td: 'whitespace-nowrap font-mono text-[12px]' } }
  },
  {
    accessorKey: 'sourceNo',
    header: '来源单据',
    meta: { class: { td: 'whitespace-nowrap font-mono text-[12px]' } }
  },
  {
    accessorKey: 'partner',
    header: '往来单位',
    meta: { class: { td: 'min-w-[180px]' } }
  },
  {
    accessorKey: 'direction',
    header: '方向',
    meta: { class: { th: 'w-24' } }
  },
  {
    accessorKey: 'status',
    header: '状态',
    meta: { class: { th: 'w-24' } }
  },
  {
    id: 'actions',
    header: '操作',
    meta: { class: { th: 'w-28', td: 'text-right' } }
  }
]

function openPermitExecution(id: string) {
  if (connected.value) {
    if (!connection.canExecute(id)) return
    connection.start(id)
  }
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
        toast.add({
          title: '仓库可用量不足',
          description: permitLine.name + ' 当前可用 ' + available + '，本次需 ' + line.quantity + '。',
          color: 'error'
        })
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
      payload.warehouseId,
      line.sku,
      line.name,
      line.quantity,
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

const positionsTab = ref<{
  filterByWarehouse: (id: string) => void
  filterBySku: (sku: string) => void
  exportCsv: () => void
} | null>(null)
const movementsTab = ref<{ searchBySku: (sku: string) => void } | null>(null)

function openWarehouse(id: string) {
  if (connected.value) {
    connection.warehouseId = id
    tab.value = 'operations'
    return
  }
  positionsTab.value?.filterByWarehouse(id)
  tab.value = 'positions'
}

/* ---------------- 库存位置 / 库存流水 ---------------- */

function openPositionMovements(position: InventoryPosition) {
  movementsTab.value?.searchBySku(position.sku)
  tab.value = 'movements'
}

const returnDetailOpen = ref(false)
const returnDetailId = ref<string | null>(null)
const returnOpen = ref(false)
watch(() => [returnFlow.query.owner, connection.warehouseId], () => {
  returnOpen.value = returnDetailOpen.value = false
  returnDetailId.value = null
}, { flush: 'sync' })

function startReturn(id: string) {
  if (returnFlow.start(id)) returnOpen.value = true
}

function openReturnDetail(returnId: string) {
  returnDetailId.value = returnId
  returnDetailOpen.value = true
}

function openMovementReference(movement: InventoryMovement) {
  if (connected.value) {
    const returned = returnFlow.list.find(row => row.movementId === movement.id)
    if (returned) {
      openReturnDetail(returned.id)
      return
    }
    const task = connection.tasks.find(value => value.id === movement.reference)
    if (task) {
      navigateTo({
        path: task.direction === 'outbound' ? '/sales' : '/purchase-orders',
        query: { workspace: connection.query.session.activeWorkspaceId, order: task.sourceNo }
      })
      return
    }
    if (z.uuid().safeParse(movement.reference).success) {
      tab.value = 'warehouse-ops'
      warehouseOps.openDetail(movement.reference)
    }
    return
  }
  if (movement.returnId) {
    openReturnDetail(movement.returnId)
    return
  }
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
  if (connected.value) {
    tab.value = 'operations'
    return
  }
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
    description:
      order.id + ' · ' + warehouseName(payload.warehouseId) + ' · 本次入库 ' + total + ' 件；仅本次预览，刷新后恢复初始数据。',
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
    description:
      order.id + ' · ' + warehouseName(payload.warehouseId) + ' · 本次出库 ' + total + ' 件；仅本次预览，刷新后恢复初始数据。',
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
    description:
      stocktake.id
      + ' · '
      + warehouseName(payload.warehouseId)
      + ' · '
      + payload.lines.length
      + ' 行，差异 '
      + diffLineCount(payload.lines)
      + ' 行；仅本次预览，刷新后恢复。',
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
      rows.value = [
        {
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
        },
        ...rows.value
      ]
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
    description:
      transfer.id
      + ' · '
      + warehouseName(payload.fromWarehouseId)
      + ' → '
      + warehouseName(payload.toWarehouseId)
      + '；仅本次预览，刷新后恢复。',
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
    description:
      transfer.id
      + ' · '
      + warehouseName(transfer.fromWarehouseId)
      + ' → '
      + warehouseName(transfer.toWarehouseId)
      + '；仅本次预览，刷新后恢复。',
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

function openLowStockItem(item: LowStockItem) {
  positionsTab.value?.filterBySku(item.sku)
  tab.value = 'positions'
}

function refreshInventory() {
  if (connected.value) {
    connection.query.refresh()
    returnFlow.query.refresh()
    warehouseOps.query.refresh()
    return
  }
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
  [
    {
      label: '出库发货',
      icon: 'i-carbon-arrow-up-right',
      disabled: !canAdjust.value,
      onSelect: openIssue
    }
  ],
  [
    {
      label: '新建盘点',
      icon: 'i-carbon-task-complete',
      disabled: !canAdjust.value,
      onSelect: openStocktakeCreate
    },
    {
      label: '新建调拨',
      icon: 'i-carbon-arrows-horizontal',
      disabled: !canAdjust.value,
      onSelect: openTransferCreate
    }
  ],
  [
    {
      label: '导出当前库存位置',
      icon: 'i-carbon-download',
      onSelect: () => positionsTab.value?.exportCsv()
    }
  ]
])
watch(
  () => connection.query.owner,
  () => {
    permitExecOpen.value = false
    permitExecId.value = null
  },
  { flush: 'sync' }
)
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
            <UDropdownMenu v-if="!connected" :items="overflowItems" :content="{ align: 'end' }">
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
              v-if="!connected && lowStockItems.length"
              color="warning"
              variant="subtle"
              size="sm"
              data-testid="inventory-low-badge"
            >
              低库存 {{ lowStockItems.length }} 个 SKU
            </UBadge>
            <p v-if="connected" class="text-xs text-muted">
              {{ connection.query.data?.selected?.name ?? '选择仓库' }} · 当前仓许可 {{ connection.tasks.length }} 张
            </p>
            <p v-else class="text-xs text-muted">
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
        <div v-if="connected" class="mb-3 space-y-3">
          <UFormField label="当前授权仓库">
            <USelect
              v-model="connection.warehouseId"
              :items="connection.query.data?.warehouses.warehouses.map(value => ({ label: value.code + ' ' + value.name, value: value.id })) ?? []"
              placeholder="选择仓库"
              class="w-full sm:w-80"
              data-testid="inventory-live-warehouse"
            />
          </UFormField>
          <UAlert color="neutral" title="当前工作区仓库任务与库存" :description="connection.query.data?.movements == null ? '当前可执行已授权的许可。库存查询权限由仓库范围决定。' : '从库存流水回查收发货来源和退货。'" />
          <UAlert
            v-if="connection.submission.record || connection.submission.message"
            color="warning"
            :title="connection.submission.message || '存在上次待恢复收货'"
            data-testid="warehouse-recovery"
          >
            <template v-if="connection.submission.record" #description>
              原提交数量 {{ connection.submission.record.payload.quantity }} · 业务日期 {{ connection.submission.record.payload.on }}
            </template>
            <template #actions>
              <UButton v-if="connection.submission.record" label="恢复上次提交" @click="connection.recover('resume')" /><UButton label="读取当前状态" :disabled="!connection.submission.mutation.unknown || connection.submission.mutation.busy" @click="connection.recover('check')" /><UButton label="重试原提交" :disabled="!connection.submission.mutation.operation?.retryAvailable || connection.submission.mutation.busy" @click="connection.recover('retry')" /><UButton
                v-if="connection.submission.failure?.kind === 'mfa' || connection.submission.record?.state === 'mfa'"
                label="重新验证"
                to="/bff/login?returnTo=/inventory"
                external
              />
            </template>
          </UAlert>
        </div>
        <UCard class="nx-reveal rounded-sm" :ui="{ body: 'p-0 sm:p-0', footer: 'p-0 sm:p-0' }">
          <div v-if="showSkeleton" class="space-y-2 p-4" data-testid="inventory-skeleton">
            <USkeleton v-for="n in 8" :key="n" class="h-9 w-full" />
          </div>
          <div v-else-if="isError" class="p-6" data-testid="inventory-state-error">
            <UAlert
              color="error"
              variant="soft"
              icon="i-carbon-warning-alt"
              :title="connected ? '库存数据加载失败' : '库存数据加载失败（演示）'"
              :description="connected ? connection.query.problem : '?state=error 会模拟一次加载失败。本原型不会访问后端。'"
              :actions="[{ label: '恢复正常', color: 'neutral', variant: 'outline', size: 'sm', onClick: reloadPage }]"
            />
          </div>
          <div v-else-if="isForbidden" class="py-6" data-testid="inventory-state-forbidden">
            <UEmpty
              variant="naked"
              icon="i-carbon-view-off"
              :title="connected ? '没有可访问的仓库' : '没有库存读取权限（演示）'"
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
          <div v-else class="nx-fade">
            <InventoryOverviewTab
              v-show="tab === 'warehouses'"
              :live="connected ? connection : undefined"
              :stats="overviewStats"
              :rows="warehouseRows"
              @open="openWarehouse"
            />

            <InventoryPositionsTab
              v-show="tab === 'positions'"
              ref="positionsTab"
              :live="connected ? connection : undefined"
              :rows="rows"
              @open-movements="openPositionMovements"
            />

            <InventoryMovementsTab
              v-show="tab === 'movements'"
              ref="movementsTab"
              :live="connected ? connection : undefined"
              :returns="connected ? returnFlow : undefined"
              :rows="movementRows"
              @open-reference="openMovementReference"
              @start-return="startReturn"
              @open-return="openReturnDetail"
            />

            <div v-show="tab === 'operations'" class="grid gap-4 p-4 xl:grid-cols-2" data-testid="inventory-operations">
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
                      :label="activePermits.length + (connected ? ' 张许可' : ' 张待执行')"
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
                        :disabled="connected && !connection.canExecute(row.original.id)"
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
              </UCard>
              <UCard v-if="!connected" class="rounded-sm" :ui="{ body: 'p-0 sm:p-0', header: 'p-3 sm:px-4' }">
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

              <UCard v-if="!connected" class="rounded-sm" :ui="{ body: 'p-0 sm:p-0', header: 'p-3 sm:px-4' }">
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

            <InventoryWarehouseOperations v-if="tab === 'warehouse-ops'" :live="connected ? warehouseOps : undefined" />

            <InventoryLowStockTab
              v-if="!connected"
              v-show="tab === 'low-stock'"
              :items="lowStockItems"
              @open-item="openLowStockItem"
            />
          </div>
        </UCard>
      </template>
    </UDashboardPanel>

    <StockPermitExecutionSlideover
      v-model:open="permitExecOpen"
      :live="connected ? connection : undefined"
      :permit-id="permitExecId"
      @confirm="handlePermitExecute"
    />

    <InventoryStockReturnSlideover v-if="connected" v-model:open="returnOpen" :execution-id="returnFlow.sourceId" :live="returnFlow" @created="openReturnDetail" />
    <StockReturnDetailSlideover v-model:open="returnDetailOpen" :return-id="returnDetailId" :live="connected ? returnFlow : undefined" />

    <InventoryReceiveSlideover
      v-if="!connected"
      v-model:open="receiveOpen"
      :orders="inboundOrders"
      :warehouses="warehouses"
      :default-warehouse-id="workspace.id === 'ws-hq' ? 'wh-east' : undefined"
      @confirm="handleReceive"
    />

    <InventoryIssueSlideover
      v-if="!connected"
      v-model:open="issueOpen"
      :orders="outboundOrders"
      :warehouses="warehouses"
      :positions="rows"
      :default-warehouse-id="workspace.id === 'ws-hq' ? 'wh-east' : undefined"
      @confirm="handleIssue"
    />

    <InventoryStocktakeSlideover
      v-if="!connected"
      v-model:open="stocktakeOpen"
      :stocktake="editingStocktake"
      :warehouses="warehouses"
      :positions="rows"
      @save="handleStocktakeSave"
      @update="handleStocktakeUpdate"
      @complete="handleStocktakeComplete"
    />

    <InventoryTransferSlideover
      v-if="!connected"
      v-model:open="transferOpen"
      :transfer="editingTransfer"
      :warehouses="warehouses"
      :positions="rows"
      @confirm="handleTransferConfirm"
      @execute="handleTransferExecute"
    />
  </div>
</template>

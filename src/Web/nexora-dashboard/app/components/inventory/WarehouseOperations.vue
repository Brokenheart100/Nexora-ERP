<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { WarehouseOperationsConnection } from '~/composables/inventory/useWarehouseOperations'

defineProps<{ live?: WarehouseOperationsConnection }>()

type StocktakeStatus = 'counting' | 'submitted' | 'completed' | 'cancelled'
type TransferStatus = 'draft' | 'in_transit' | 'completed'
type MovementType = 'outbound' | 'inbound' | 'adjust'
type BadgeColor = 'primary' | 'secondary' | 'success' | 'info' | 'warning' | 'error' | 'neutral'

interface StaffPermission {
  name: string
  canReceive: boolean
  canTransfer: boolean
}

interface Warehouse {
  id: string
  code: string
  name: string
  city: string
  receiver: string
  active: boolean
  permissions: StaffPermission[]
}

interface Product {
  sku: string
  name: string
  unit: string
  unitCost: number
}

interface StockItem {
  warehouseId: string
  sku: string
  name: string
  unit: string
  available: number
}

interface StocktakeLine {
  lineNo: number
  sku: string
  name: string
  unit: string
  systemQty: number
  countedQty: number
  reason: string
}

interface HistoryEntry {
  at: string
  action: string
  actor: string
  note: string
}

interface Stocktake {
  id: string
  warehouseId: string
  owner: string
  status: StocktakeStatus
  reason: string
  createdAt: string
  updatedAt: string
  submittedBy?: string
  reviewedBy?: string
  lines: StocktakeLine[]
  history: HistoryEntry[]
}

interface TransferOrder {
  id: string
  fromWarehouseId: string
  toWarehouseId: string
  sku: string
  name: string
  unit: string
  quantity: number
  unitCost: number
  status: TransferStatus
  createdAt: string
  issuedAt?: string
  issuedBy?: string
  receivedAt?: string
  receivedBy?: string
  history: HistoryEntry[]
}

interface StockMovement {
  id: string
  docNo: string
  type: MovementType
  warehouseId: string
  sku: string
  name: string
  quantity: number
  at: string
}

interface WarehouseForm {
  code: string
  name: string
  city: string
  receiver: string
  canReceive: boolean
  canTransfer: boolean
}

const STAFF = ['陈立', '张明远', '林小雨', '周宁', '王倩']

const PRODUCTS: Product[] = [
  { sku: 'SKU-1001', name: 'ThinkPad X1 笔记本', unit: '台', unitCost: 4500 },
  { sku: 'SKU-1002', name: 'A4 复印纸（500 张/箱）', unit: '箱', unitCost: 18.5 },
  { sku: 'SKU-1006', name: 'SATA 数据线', unit: '根', unitCost: 6.8 },
  { sku: 'SKU-1010', name: '人体工学网椅', unit: '把', unitCost: 320 },
  { sku: 'SKU-1012', name: '48 口千兆交换机', unit: '台', unitCost: 1280 },
  { sku: 'SKU-1016', name: 'USB-C 扩展坞', unit: '个', unitCost: 240 }
]

const stocktakeStatusLabels: Record<StocktakeStatus, string> = {
  counting: '盘点中',
  submitted: '待复核',
  completed: '已完成',
  cancelled: '已取消'
}
const stocktakeStatusColors: Record<StocktakeStatus, BadgeColor> = {
  counting: 'warning',
  submitted: 'info',
  completed: 'success',
  cancelled: 'neutral'
}
const transferStatusLabels: Record<TransferStatus, string> = {
  draft: '草稿',
  in_transit: '在途',
  completed: '已完成'
}
const transferStatusColors: Record<TransferStatus, BadgeColor> = {
  draft: 'neutral',
  in_transit: 'warning',
  completed: 'success'
}

const toast = useToast()

function productOf(sku: string): Product {
  return PRODUCTS.find(item => item.sku === sku) ?? { sku, name: sku, unit: '件', unitCost: 0 }
}

function nowStamp() {
  const now = new Date()
  const pad = (value: number) => String(value).padStart(2, '0')
  return now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate()) + ' ' + pad(now.getHours()) + ':' + pad(now.getMinutes())
}

function signed(value: number) {
  return value > 0 ? '+' + value : String(value)
}

/* ---------------- 本地种子数据 ---------------- */

function seedWarehouses(): Warehouse[] {
  return [
    {
      id: 'wh-east',
      code: 'wh-east',
      name: '华东中心仓',
      city: '上海',
      receiver: '陈立',
      active: true,
      permissions: [
        { name: '陈立', canReceive: true, canTransfer: true },
        { name: '张明远', canReceive: false, canTransfer: true },
        { name: '王倩', canReceive: true, canTransfer: false }
      ]
    },
    {
      id: 'wh-south',
      code: 'wh-south',
      name: '华南前置仓',
      city: '深圳',
      receiver: '林小雨',
      active: true,
      permissions: [
        { name: '林小雨', canReceive: true, canTransfer: true },
        { name: '陈立', canReceive: false, canTransfer: true },
        { name: '周宁', canReceive: true, canTransfer: false }
      ]
    },
    {
      id: 'wh-retail',
      code: 'wh-retail',
      name: '杭州零售仓',
      city: '杭州',
      receiver: '周宁',
      active: true,
      permissions: [
        { name: '周宁', canReceive: true, canTransfer: false },
        { name: '林小雨', canReceive: false, canTransfer: true }
      ]
    }
  ]
}

function seedStock(): StockItem[] {
  return [
    { warehouseId: 'wh-east', sku: 'SKU-1001', name: 'ThinkPad X1 笔记本', unit: '台', available: 60 },
    { warehouseId: 'wh-east', sku: 'SKU-1002', name: 'A4 复印纸（500 张/箱）', unit: '箱', available: 120 },
    { warehouseId: 'wh-east', sku: 'SKU-1006', name: 'SATA 数据线', unit: '根', available: 80 },
    { warehouseId: 'wh-east', sku: 'SKU-1012', name: '48 口千兆交换机', unit: '台', available: 15 },
    { warehouseId: 'wh-south', sku: 'SKU-1001', name: 'ThinkPad X1 笔记本', unit: '台', available: 12 },
    { warehouseId: 'wh-south', sku: 'SKU-1002', name: 'A4 复印纸（500 张/箱）', unit: '箱', available: 30 },
    { warehouseId: 'wh-south', sku: 'SKU-1016', name: 'USB-C 扩展坞', unit: '个', available: 25 },
    { warehouseId: 'wh-retail', sku: 'SKU-1002', name: 'A4 复印纸（500 张/箱）', unit: '箱', available: 40 },
    { warehouseId: 'wh-retail', sku: 'SKU-1010', name: '人体工学网椅', unit: '把', available: 8 }
  ]
}

function seedStocktakes(): Stocktake[] {
  return [
    {
      id: 'ST-2026-0001',
      warehouseId: 'wh-east',
      owner: '张明远',
      status: 'counting',
      reason: '货架盘点差异，待复核',
      createdAt: '2026-11-18 09:20',
      updatedAt: '2026-11-18 09:45',
      lines: [
        { lineNo: 1, sku: 'SKU-1001', name: 'ThinkPad X1 笔记本', unit: '台', systemQty: 60, countedQty: 57, reason: '展示机转借未登记' },
        { lineNo: 2, sku: 'SKU-1002', name: 'A4 复印纸（500 张/箱）', unit: '箱', systemQty: 120, countedQty: 124, reason: '到货补录滞后' },
        { lineNo: 3, sku: 'SKU-1006', name: 'SATA 数据线', unit: '根', systemQty: 80, countedQty: 80, reason: '' }
      ],
      history: [
        { at: '2026-11-18 09:20', action: '创建盘点单', actor: '张明远', note: '华东中心仓，共 3 行' },
        { at: '2026-11-18 09:45', action: '保存实盘数', actor: '张明远', note: '差异 2 行，差异合计 -3 +4' }
      ]
    },
    {
      id: 'ST-2026-0002',
      warehouseId: 'wh-retail',
      owner: '林小雨',
      status: 'completed',
      reason: '门店重排后复盘差异',
      createdAt: '2026-11-16 14:05',
      updatedAt: '2026-11-16 16:10',
      submittedBy: '林小雨',
      reviewedBy: '陈立',
      lines: [
        { lineNo: 1, sku: 'SKU-1010', name: '人体工学网椅', unit: '把', systemQty: 10, countedQty: 8, reason: '样机领用未出库' },
        { lineNo: 2, sku: 'SKU-1002', name: 'A4 复印纸（500 张/箱）', unit: '箱', systemQty: 42, countedQty: 40, reason: '门店自领未登记' }
      ],
      history: [
        { at: '2026-11-16 14:05', action: '创建盘点单', actor: '林小雨', note: '杭州零售仓，共 2 行' },
        { at: '2026-11-16 15:30', action: '提交复核', actor: '林小雨', note: '差异 2 行' },
        { at: '2026-11-16 16:10', action: '复核完成', actor: '陈立', note: '已回写库存并生成 2 条 adjust 流水' }
      ]
    }
  ]
}

function seedTransfers(): TransferOrder[] {
  return [
    {
      id: 'TR-2026-0001',
      fromWarehouseId: 'wh-east',
      toWarehouseId: 'wh-south',
      sku: 'SKU-1002',
      name: 'A4 复印纸（500 张/箱）',
      unit: '箱',
      quantity: 10,
      unitCost: 18.5,
      status: 'completed',
      createdAt: '2026-11-17 10:10',
      issuedAt: '2026-11-17 10:30',
      issuedBy: '张明远',
      receivedAt: '2026-11-17 15:20',
      receivedBy: '林小雨',
      history: [
        { at: '2026-11-17 10:10', action: '创建调拨单', actor: '张明远', note: '华东中心仓 → 华南前置仓，草稿' },
        { at: '2026-11-17 10:30', action: '确认出库', actor: '张明远', note: '在途 10 箱，成本 ¥185.00' },
        { at: '2026-11-17 15:20', action: '确认入库', actor: '林小雨', note: '目标仓可用量 +10，两端流水关联 TR-2026-0001' }
      ]
    }
  ]
}

function seedMovements(): StockMovement[] {
  return [
    { id: 'IN-2026-0001', docNo: 'TR-2026-0001', type: 'inbound', warehouseId: 'wh-south', sku: 'SKU-1002', name: 'A4 复印纸（500 张/箱）', quantity: 10, at: '2026-11-17 15:20' },
    { id: 'OUT-2026-0001', docNo: 'TR-2026-0001', type: 'outbound', warehouseId: 'wh-east', sku: 'SKU-1002', name: 'A4 复印纸（500 张/箱）', quantity: 10, at: '2026-11-17 10:30' },
    { id: 'ADJ-2026-0002', docNo: 'ST-2026-0002', type: 'adjust', warehouseId: 'wh-retail', sku: 'SKU-1002', name: 'A4 复印纸（500 张/箱）', quantity: -2, at: '2026-11-16 16:10' },
    { id: 'ADJ-2026-0001', docNo: 'ST-2026-0002', type: 'adjust', warehouseId: 'wh-retail', sku: 'SKU-1010', name: '人体工学网椅', quantity: -2, at: '2026-11-16 16:10' }
  ]
}

const warehouses = ref<Warehouse[]>(seedWarehouses())
const stock = ref<StockItem[]>(seedStock())
const stocktakes = ref<Stocktake[]>(seedStocktakes())
const transfers = ref<TransferOrder[]>(seedTransfers())
const movements = ref<StockMovement[]>(seedMovements())
let localSequence = 0
let transferSequence = 2

function warehouseOf(id: string) {
  return warehouses.value.find(item => item.id === id)
}

function warehouseName(id: string) {
  return warehouseOf(id)?.name ?? id
}

function availableIn(warehouseId: string, sku: string) {
  return stock.value
    .filter(item => item.warehouseId === warehouseId && item.sku === sku)
    .reduce((sum, item) => sum + item.available, 0)
}

function stockItemOf(warehouseId: string, sku: string) {
  return stock.value.find(item => item.warehouseId === warehouseId && item.sku === sku)
}

function pushMovement(type: MovementType, warehouseId: string, sku: string, quantity: number, docNo: string) {
  const product = productOf(sku)
  movements.value = [{
    id: (type === 'adjust' ? 'ADJ' : type === 'inbound' ? 'IN' : 'OUT') + '-LOCAL-' + String(localSequence + 1).padStart(3, '0'),
    docNo,
    type,
    warehouseId,
    sku,
    name: product.name,
    quantity,
    at: nowStamp()
  }, ...movements.value]
  localSequence += 1
}

/* ---------------- 仓库网络 ---------------- */

const warehouseCreateOpen = ref(false)
const warehouseDetailOpen = ref(false)
const detailWarehouseId = ref('')
const detailReceiver = ref('')
const detailHint = ref('')
const detailError = ref('')
const createError = ref('')
const createForm = ref<WarehouseForm>({
  code: '',
  name: '',
  city: '',
  receiver: '陈立',
  canReceive: true,
  canTransfer: false
})

const staffItems = STAFF.map(name => ({ label: name, value: name }))
const activeWarehouse = computed(() => warehouses.value.find(item => item.id === detailWarehouseId.value) ?? null)

function permissionLabel(permission: StaffPermission) {
  const parts = [permission.canReceive ? '可收货' : '', permission.canTransfer ? '可调拨' : ''].filter(Boolean)
  return parts.length ? parts.join(' / ') : '仅查看'
}

function permissionColor(permission: StaffPermission): BadgeColor {
  if (permission.canReceive && permission.canTransfer) return 'success'
  if (permission.canReceive) return 'info'
  if (permission.canTransfer) return 'warning'
  return 'neutral'
}

function shortWarehouseName(name: string) {
  return name.replace(/(中心仓|前置仓|零售仓|区域仓)$/, '')
}

function receiverHint(warehouse: Warehouse, name: string) {
  const receiveWarehouses = warehouses.value
    .filter(item => item.receiver === name || item.permissions.some(permission => permission.name === name && permission.canReceive))
    .map(item => item.name)
  const permission = warehouse.permissions.find(item => item.name === name)
  const canReceiveHere = warehouse.receiver === name || Boolean(permission?.canReceive)
  const canTransferHere = Boolean(permission?.canTransfer)
  const receivePart = canReceiveHere
    ? '可确认' + warehouse.name + '入库'
    : receiveWarehouses.length
      ? '仅可确认' + receiveWarehouses.join('、') + '入库'
      : '没有任何仓库的收货权限'
  const shortName = shortWarehouseName(warehouse.name)
  const transferPart = canTransferHere ? '可发起' + shortName + '调拨出库' : '不能发起' + shortName + '出库'
  return name + '：' + receivePart + '，' + transferPart
}

function openCreateWarehouse() {
  createError.value = ''
  createForm.value = { code: '', name: '', city: '', receiver: '陈立', canReceive: true, canTransfer: false }
  warehouseCreateOpen.value = true
}

function saveWarehouse() {
  const form = createForm.value
  createError.value = ''
  const code = form.code.trim().toLowerCase()
  const name = form.name.trim()
  const city = form.city.trim()
  if (!code) {
    createError.value = '请输入仓库编码，例如 wh-north'
    return
  }
  if (!/^[a-z0-9-]+$/.test(code)) {
    createError.value = '仓库编码只能包含小写字母、数字和短横线'
    return
  }
  if (warehouses.value.some(item => item.id === code || item.code === code)) {
    createError.value = '仓库编码 ' + code + ' 已存在，请更换编码'
    return
  }
  if (!name) {
    createError.value = '请输入仓库名称'
    return
  }
  if (!city) {
    createError.value = '请输入仓库所在城市'
    return
  }
  if (!form.receiver) {
    createError.value = '请选择收货人'
    return
  }
  const warehouse: Warehouse = {
    id: code,
    code,
    name,
    city,
    receiver: form.receiver,
    active: true,
    permissions: [{ name: form.receiver, canReceive: form.canReceive, canTransfer: form.canTransfer }]
  }
  warehouses.value = [...warehouses.value, warehouse]
  warehouseCreateOpen.value = false
  toast.add({
    title: '仓库已创建',
    description: name + '（' + code + '）已加入仓库网络，指定收货人 ' + form.receiver + '；仅本次预览，刷新后恢复。',
    color: 'success',
    icon: 'i-carbon-checkmark'
  })
}

function openWarehouseDetail(warehouse: Warehouse) {
  detailWarehouseId.value = warehouse.id
  detailReceiver.value = warehouse.receiver
  detailError.value = ''
  detailHint.value = receiverHint(warehouse, warehouse.receiver)
  warehouseDetailOpen.value = true
}

watch(detailReceiver, (name) => {
  const warehouse = activeWarehouse.value
  if (!warehouse || !name) return
  detailHint.value = receiverHint(warehouse, name)
})

function saveReceiver() {
  const warehouse = activeWarehouse.value
  detailError.value = ''
  if (!warehouse) return
  const name = detailReceiver.value
  if (!name) {
    detailError.value = '请选择新的收货人'
    return
  }
  if (name === warehouse.receiver) {
    detailError.value = name + ' 已经是' + warehouse.name + '的收货人，请选择其他人员'
    return
  }
  const previous = warehouse.receiver
  const previousPermission = warehouse.permissions.find(item => item.name === previous)
  if (previousPermission) previousPermission.canReceive = false
  const nextPermission = warehouse.permissions.find(item => item.name === name)
  if (nextPermission) {
    nextPermission.canReceive = true
  } else {
    warehouse.permissions.push({ name, canReceive: true, canTransfer: false })
  }
  warehouse.receiver = name
  detailHint.value = receiverHint(warehouse, name)
  toast.add({
    title: '收货人已更换',
    description: warehouse.name + ' 的收货人由 ' + previous + ' 变更为 ' + name + '，相关收货权限已同步调整。',
    color: 'success',
    icon: 'i-carbon-user-admin'
  })
}

/* ---------------- 盘点 ---------------- */

const stocktakeActor = ref('张明远')
const stocktakeDetailOpen = ref(false)
const stocktakeDetailId = ref('')
const stocktakeError = ref('')

const activeStocktake = computed(() => stocktakes.value.find(item => item.id === stocktakeDetailId.value) ?? null)
const stocktakeEditable = computed(() => Boolean(activeStocktake.value && activeStocktake.value.status === 'counting' && stocktakeActor.value === activeStocktake.value.owner))

const stocktakeColumns: TableColumn<Stocktake>[] = [
  { accessorKey: 'id', header: '盘点单号', meta: { class: { td: 'whitespace-nowrap font-mono text-[12px]' } } },
  { id: 'warehouse', header: '仓库', meta: { class: { td: 'whitespace-nowrap' } } },
  { id: 'status', header: '状态', meta: { class: { th: 'w-24' } } },
  { id: 'diff', header: '差异', meta: { class: { th: 'w-24 text-right', td: 'text-right' } } },
  { accessorKey: 'reason', header: '差异原因', meta: { class: { td: 'min-w-[200px] whitespace-normal text-muted' } } },
  { id: 'actions', header: '操作', meta: { class: { th: 'w-24', td: 'text-right' } } }
]

const stocktakeLineColumns: TableColumn<StocktakeLine>[] = [
  { accessorKey: 'lineNo', header: '序号', meta: { class: { th: 'w-12', td: 'text-muted' } } },
  { accessorKey: 'name', header: '商品', meta: { class: { td: 'min-w-[180px] whitespace-normal' } } },
  { accessorKey: 'sku', header: 'SKU', meta: { class: { td: 'font-mono text-[11px] text-muted' } } },
  { accessorKey: 'systemQty', header: '账面数', meta: { class: { th: 'text-right', td: 'text-right tabular-nums' } } },
  { accessorKey: 'countedQty', header: '实盘数', meta: { class: { th: 'w-28 text-right', td: 'text-right' } } },
  { id: 'diff', header: '差异', meta: { class: { th: 'w-20 text-right', td: 'text-right' } } },
  { id: 'reason', header: '原因', meta: { class: { td: 'min-w-[180px]' } } }
]

function stocktakeDiff(stocktake: Stocktake) {
  return stocktake.lines.reduce((sum, line) => sum + line.countedQty - line.systemQty, 0)
}

function lineDiff(line: StocktakeLine) {
  return line.countedQty - line.systemQty
}

function diffColor(value: number): BadgeColor {
  if (value === 0) return 'neutral'
  return value > 0 ? 'success' : 'error'
}

const stocktakeActionHint = computed(() => {
  const stocktake = activeStocktake.value
  if (!stocktake) return ''
  if (stocktake.status === 'counting') {
    if (stocktakeActor.value !== stocktake.owner) {
      return stocktakeActor.value + ' 不是本单制单人，不能提交；请在盘点卡片顶部切换为制单人 ' + stocktake.owner
    }
    return '提交后由制单人 ' + stocktake.owner + ' 锁定实盘数，需切换为审批人 陈立 确认后才回写库存。'
  }
  if (stocktake.status === 'submitted') {
    if (stocktakeActor.value === stocktake.submittedBy) {
      return stocktakeActor.value + ' 是制单人，不能确认自己提交的盘点；请切换为审批人 陈立。'
    }
    return '审批确认后将按实盘数更新本地库存，并为差异行写入 adjust 流水。'
  }
  if (stocktake.status === 'completed') return '盘点已完成，明细与原因只读。'
  return '盘点已取消，明细只读。'
})

const stockGroups = computed(() => warehouses.value.map(warehouse => ({
  warehouse,
  items: stock.value.filter(item => item.warehouseId === warehouse.id)
})))

const adjustMovements = computed(() => movements.value.filter(item => item.type === 'adjust').slice(0, 5))

function openStocktakeDetail(stocktake: Stocktake) {
  stocktakeDetailId.value = stocktake.id
  stocktakeError.value = ''
  stocktakeDetailOpen.value = true
}

function updateCounted(line: StocktakeLine, value: string | number) {
  if (!stocktakeEditable.value) return
  const parsed = typeof value === 'number' ? value : Number(value)
  line.countedQty = Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0
  stocktakeError.value = ''
}

function updateLineReason(line: StocktakeLine, value: string | number) {
  if (!stocktakeEditable.value) return
  line.reason = String(value)
}

function updateStocktakeReason(value: string | number) {
  if (!activeStocktake.value) return
  activeStocktake.value.reason = String(value)
}

function submitStocktake() {
  const stocktake = activeStocktake.value
  if (!stocktake) return
  stocktakeError.value = ''
  if (stocktake.status !== 'counting') {
    stocktakeError.value = '只有盘点中的单据可以提交复核'
    return
  }
  if (stocktakeActor.value !== stocktake.owner) {
    stocktakeError.value = stocktakeActor.value + ' 不是本单制单人，不能提交；请切换为 ' + stocktake.owner
    return
  }
  if (stocktakeDiff(stocktake) !== 0 && !stocktake.reason.trim()) {
    stocktakeError.value = '存在盘点差异，请填写差异原因后再提交'
    return
  }
  stocktake.status = 'submitted'
  stocktake.submittedBy = stocktakeActor.value
  stocktake.updatedAt = nowStamp()
  stocktake.history.push({
    at: stocktake.updatedAt,
    action: '提交复核',
    actor: stocktakeActor.value,
    note: '差异合计 ' + signed(stocktakeDiff(stocktake)) + '，等待非制单人确认'
  })
  toast.add({
    title: '盘点已提交',
    description: stocktake.id + ' 等待审批。制单人不能确认本人单据，请切换为审批人 陈立。',
    color: 'success',
    icon: 'i-carbon-send-alt'
  })
}

function reviewStocktake() {
  const stocktake = activeStocktake.value
  if (!stocktake) return
  stocktakeError.value = ''
  if (stocktake.status !== 'submitted') {
    stocktakeError.value = '只有待复核的盘点单可以确认'
    return
  }
  if (stocktakeActor.value === stocktake.submittedBy) {
    stocktakeError.value = stocktakeActor.value + ' 是制单人，不能确认自己提交的盘点；请切换为审批人 陈立'
    return
  }
  let adjustLines = 0
  for (const line of stocktake.lines) {
    const diff = lineDiff(line)
    const existing = stockItemOf(stocktake.warehouseId, line.sku)
    if (existing) {
      existing.available = line.countedQty
    } else {
      stock.value = [...stock.value, {
        warehouseId: stocktake.warehouseId,
        sku: line.sku,
        name: line.name,
        unit: line.unit,
        available: line.countedQty
      }]
    }
    if (diff !== 0) {
      pushMovement('adjust', stocktake.warehouseId, line.sku, diff, stocktake.id)
      adjustLines += 1
    }
  }
  stocktake.status = 'completed'
  stocktake.reviewedBy = stocktakeActor.value
  stocktake.updatedAt = nowStamp()
  stocktake.history.push({
    at: stocktake.updatedAt,
    action: '复核完成',
    actor: stocktakeActor.value,
    note: '已回写本地库存，生成 ' + adjustLines + ' 条 adjust 流水'
  })
  toast.add({
    title: '盘点已确认',
    description: stocktake.id + ' 已回写库存并生成 ' + adjustLines + ' 条盘点调整流水；仅本次预览，刷新后恢复。',
    color: 'success',
    icon: 'i-carbon-checkmark'
  })
}

function cancelStocktake() {
  const stocktake = activeStocktake.value
  if (!stocktake) return
  stocktakeError.value = ''
  if (stocktake.status === 'completed' || stocktake.status === 'cancelled') {
    stocktakeError.value = '已完成或已取消的盘点单不能再次取消'
    return
  }
  const reason = stocktake.reason.trim() || '未填写取消原因'
  stocktake.status = 'cancelled'
  stocktake.updatedAt = nowStamp()
  stocktake.history.push({
    at: stocktake.updatedAt,
    action: '取消盘点',
    actor: stocktakeActor.value,
    note: '取消原因：' + reason
  })
  toast.add({
    title: '盘点已取消',
    description: stocktake.id + ' 已取消，库存保持不变；取消原因：' + reason,
    color: 'warning',
    icon: 'i-carbon-close-outline'
  })
}

function switchToApprover() {
  stocktakeActor.value = '陈立'
  stocktakeError.value = ''
}

function setStocktakeActor(name: string) {
  stocktakeActor.value = name
  stocktakeError.value = ''
}

/* ---------------- 调拨 ---------------- */

const transferActor = ref('张明远')
const transferFormOpen = ref(false)
const transferDetailOpen = ref(false)
const transferDetailId = ref('')
const transferError = ref('')
const transferForm = ref({
  fromWarehouseId: 'wh-east',
  toWarehouseId: 'wh-south',
  sku: 'SKU-1001',
  quantity: 1
})

const transferActorItems = computed(() => {
  const names = new Set<string>()
  for (const warehouse of warehouses.value) {
    names.add(warehouse.receiver)
    for (const permission of warehouse.permissions) names.add(permission.name)
  }
  return [...names].map(name => ({ label: name, value: name }))
})

const activeTransfer = computed(() => transfers.value.find(item => item.id === transferDetailId.value) ?? null)

const transferColumns: TableColumn<TransferOrder>[] = [
  { accessorKey: 'id', header: '调拨单号', meta: { class: { td: 'whitespace-nowrap font-mono text-[12px]' } } },
  { id: 'route', header: '调拨路径', meta: { class: { td: 'min-w-[200px]' } } },
  { id: 'sku', header: '商品', meta: { class: { td: 'min-w-[200px] whitespace-normal' } } },
  { accessorKey: 'quantity', header: '数量', meta: { class: { th: 'text-right', td: 'text-right tabular-nums' } } },
  { id: 'state', header: '状态', meta: { class: { th: 'w-24' } } },
  { id: 'actions', header: '操作', meta: { class: { th: 'w-[320px] text-right', td: 'text-right' } } }
]

function transferTo(t: TransferOrder) {
  return warehouseOf(t.toWarehouseId)
}

function canTransferFrom(warehouseId: string, name: string) {
  return Boolean(warehouseOf(warehouseId)?.permissions.some(permission => permission.name === name && permission.canTransfer))
}

function issueBlockedReason(t: TransferOrder) {
  if (t.status !== 'draft') {
    return t.status === 'in_transit' ? '已确认出库，等待目标仓收货，不能重复出库' : '调拨已完成，不能再次出库'
  }
  if (!canTransferFrom(t.fromWarehouseId, transferActor.value)) {
    return transferActor.value + ' 无' + warehouseName(t.fromWarehouseId) + '调拨权限，不能发起出库'
  }
  return ''
}

function receiveBlockedReason(t: TransferOrder) {
  if (t.status === 'completed') return ''
  if (t.status === 'draft') return '尚未确认出库，不能确认入库'
  const target = transferTo(t)
  if (!target) return '目标仓不存在，无法确认入库'
  if (transferActor.value !== target.receiver) {
    return transferActor.value + ' 不是' + target.name + '指定收货人（' + target.receiver + '），不能确认入库'
  }
  return ''
}

function intransitQty(t: TransferOrder) {
  return t.status === 'in_transit' ? t.quantity : 0
}

function transferCost(t: TransferOrder) {
  return t.quantity * t.unitCost
}

function transferMovements(id: string) {
  return movements.value.filter(item => item.docNo === id)
}

function openTransferForm() {
  transferError.value = ''
  const from = warehouses.value[0]
  const to = warehouses.value.find(item => item.id !== from?.id) ?? warehouses.value[1]
  const skuItem = from ? stock.value.find(item => item.warehouseId === from.id && item.available > 0) : undefined
  transferForm.value = {
    fromWarehouseId: from?.id ?? '',
    toWarehouseId: to?.id ?? '',
    sku: skuItem?.sku ?? '',
    quantity: 1
  }
  transferFormOpen.value = true
}

function openTransferDetail(t: TransferOrder) {
  transferDetailId.value = t.id
  transferError.value = ''
  transferDetailOpen.value = true
}

const transferSkuItems = computed(() => {
  const warehouseId = transferForm.value.fromWarehouseId
  return stock.value
    .filter(item => item.warehouseId === warehouseId && item.available > 0)
    .map(item => ({ label: item.name + ' · 可用 ' + item.available, value: item.sku }))
})

watch(() => transferForm.value.fromWarehouseId, (warehouseId) => {
  const first = stock.value.find(item => item.warehouseId === warehouseId && item.available > 0)
  transferForm.value.sku = first?.sku ?? ''
  if (transferForm.value.toWarehouseId === warehouseId) {
    transferForm.value.toWarehouseId = warehouses.value.find(item => item.id !== warehouseId)?.id ?? ''
  }
  transferError.value = ''
})

function saveTransfer() {
  const form = transferForm.value
  transferError.value = ''
  if (!form.fromWarehouseId) {
    transferError.value = '请选择源仓库'
    return
  }
  if (!form.toWarehouseId) {
    transferError.value = '请选择目标仓库'
    return
  }
  if (form.fromWarehouseId === form.toWarehouseId) {
    transferError.value = '源仓库与目标仓库不能相同'
    return
  }
  if (!form.sku) {
    transferError.value = '请选择调拨商品'
    return
  }
  const quantity = Math.floor(Number(form.quantity))
  if (!Number.isFinite(quantity) || quantity <= 0) {
    transferError.value = '调拨数量必须为正整数'
    return
  }
  const available = availableIn(form.fromWarehouseId, form.sku)
  if (quantity > available) {
    transferError.value = '超出' + warehouseName(form.fromWarehouseId) + '可用库存（当前可用 ' + available + '）'
    return
  }
  const product = productOf(form.sku)
  const transfer: TransferOrder = {
    id: 'TR-2026-' + String(transferSequence).padStart(4, '0'),
    fromWarehouseId: form.fromWarehouseId,
    toWarehouseId: form.toWarehouseId,
    sku: form.sku,
    name: product.name,
    unit: product.unit,
    quantity,
    unitCost: product.unitCost,
    status: 'draft',
    createdAt: nowStamp(),
    history: [{
      at: nowStamp(),
      action: '创建调拨单',
      actor: transferActor.value,
      note: warehouseName(form.fromWarehouseId) + ' → ' + warehouseName(form.toWarehouseId) + '，待确认出库'
    }]
  }
  transferSequence += 1
  transfers.value = [transfer, ...transfers.value]
  transferFormOpen.value = false
  toast.add({
    title: '调拨单已创建',
    description: transfer.id + ' 处于草稿状态，确认出库后进入在途；仅本次预览，刷新后恢复。',
    color: 'success',
    icon: 'i-carbon-checkmark'
  })
}

function issueTransfer(t: TransferOrder) {
  const reason = issueBlockedReason(t)
  if (reason) {
    transferError.value = reason
    toast.add({ title: '不能确认出库', description: reason, color: 'warning', icon: 'i-carbon-warning-alt' })
    return
  }
  transferError.value = ''
  t.status = 'in_transit'
  t.issuedAt = nowStamp()
  t.issuedBy = transferActor.value
  t.history.push({
    at: t.issuedAt,
    action: '确认出库',
    actor: transferActor.value,
    note: '源仓可用量 -' + t.quantity + '，在途 ' + t.quantity + ' ' + t.unit + '，成本 ' + formatMoney(t.quantity * t.unitCost)
  })
  const item = stockItemOf(t.fromWarehouseId, t.sku)
  if (item) item.available = Math.max(item.available - t.quantity, 0)
  pushMovement('outbound', t.fromWarehouseId, t.sku, t.quantity, t.id)
  toast.add({
    title: '已确认出库',
    description: t.id + ' 在途 ' + t.quantity + ' ' + t.unit + ' · 成本 ' + formatMoney(t.quantity * t.unitCost) + '；' + warehouseName(t.fromWarehouseId) + '可用量已减少，' + warehouseName(t.toWarehouseId) + '保持不变。',
    color: 'success',
    icon: 'i-carbon-arrow-up-right'
  })
}

function receiveTransfer(t: TransferOrder) {
  if (t.status === 'completed') {
    transferError.value = '已确认入库，不会重复增加库存'
    toast.add({
      title: '已确认入库',
      description: '已确认入库，不会重复增加库存。',
      color: 'warning',
      icon: 'i-carbon-information'
    })
    return
  }
  const reason = receiveBlockedReason(t)
  if (reason) {
    transferError.value = reason
    toast.add({ title: '不能确认入库', description: reason, color: 'warning', icon: 'i-carbon-warning-alt' })
    return
  }
  transferError.value = ''
  const target = transferTo(t)
  if (!target) return
  t.status = 'completed'
  t.receivedAt = nowStamp()
  t.receivedBy = transferActor.value
  t.history.push({
    at: t.receivedAt,
    action: '确认入库',
    actor: transferActor.value,
    note: '目标仓可用量 +' + t.quantity + '，两端流水关联 ' + t.id
  })
  const existing = stockItemOf(t.toWarehouseId, t.sku)
  if (existing) {
    existing.available += t.quantity
  } else {
    stock.value = [...stock.value, {
      warehouseId: t.toWarehouseId,
      sku: t.sku,
      name: t.name,
      unit: t.unit,
      available: t.quantity
    }]
  }
  pushMovement('inbound', t.toWarehouseId, t.sku, t.quantity, t.id)
  toast.add({
    title: '已确认入库',
    description: t.id + ' 已完成，' + target.name + '可用量 +' + t.quantity + '；源仓出库与目标仓入库流水均关联该调拨单。',
    color: 'success',
    icon: 'i-carbon-arrow-down-left'
  })
}

function switchToReceiver() {
  const target = activeTransfer.value ? transferTo(activeTransfer.value) : undefined
  if (!target) return
  transferActor.value = target.receiver
  transferError.value = ''
}
</script>

<template>
  <InventoryWarehouseRecords v-if="live" :work="live" />
  <div v-else class="space-y-4" data-testid="warehouse-operations">
    <UAlert
      color="neutral"
      variant="soft"
      icon="i-carbon-information"
      title="仓库管理 · 本地原型"
      description="新建仓库、指定收货人、盘点复核与在途调拨均为本地 ref 演示，仅本次预览，刷新后恢复初始样例。"
      data-testid="warehouse-ops-tip"
    />

    <UCard class="rounded-sm" :ui="{ body: 'p-3 sm:p-4' }">
      <template #header>
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div class="flex items-center gap-2">
            <UIcon name="i-carbon-building" class="size-4 text-primary" />
            <h2 class="text-sm font-semibold text-highlighted">
              仓库网络
            </h2>
            <UBadge variant="subtle" color="neutral" size="sm">
              {{ warehouses.length }} 个仓库
            </UBadge>
          </div>
          <UButton
            size="sm"
            icon="i-carbon-add"
            label="新建仓库"
            data-testid="warehouse-ops-create"
            @click="openCreateWarehouse"
          />
        </div>
      </template>

      <div class="space-y-3">
        <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <div
            v-for="warehouse in warehouses"
            :key="warehouse.id"
            class="rounded-sm border border-default p-3"
            :data-testid="'warehouse-ops-card-' + warehouse.id"
          >
            <div class="flex items-start justify-between gap-2">
              <div class="min-w-0">
                <p class="truncate text-sm font-semibold text-highlighted">
                  {{ warehouse.name }}
                </p>
                <p class="mt-0.5 truncate text-[11px] text-muted">
                  {{ warehouse.code }} · {{ warehouse.city }}
                </p>
              </div>
              <UBadge
                :color="warehouse.active ? 'success' : 'neutral'"
                variant="subtle"
                size="sm"
                :label="warehouse.active ? '启用' : '停用'"
              />
            </div>

            <dl class="mt-3 space-y-1.5 text-xs">
              <div class="flex items-center justify-between gap-2">
                <dt class="text-muted">
                  指定收货人
                </dt>
                <dd class="font-medium text-default" :data-testid="'warehouse-ops-receiver-' + warehouse.id">
                  {{ warehouse.receiver }}
                </dd>
              </div>
            </dl>

            <div class="mt-2 flex flex-wrap gap-1" :data-testid="'warehouse-ops-permissions-' + warehouse.id">
              <UBadge
                v-for="permission in warehouse.permissions"
                :key="permission.name"
                :color="permissionColor(permission)"
                variant="subtle"
                size="sm"
              >
                {{ permission.name }} · {{ permissionLabel(permission) }}
              </UBadge>
            </div>

            <div class="mt-3 flex items-center justify-between gap-2">
              <p class="text-[11px] text-muted">
                调拨权限人员可确认出库；指定收货人可确认入库
              </p>
              <UButton
                size="xs"
                color="neutral"
                variant="outline"
                label="仓库详情"
                :data-testid="'warehouse-ops-open-' + warehouse.id"
                @click="openWarehouseDetail(warehouse)"
              />
            </div>
          </div>
        </div>

        <p class="text-xs text-muted">
          提示：打开仓库详情可更换指定收货人，权限 chips 与提示会同步变化；新建仓库后列表立即刷新。
        </p>
      </div>
    </UCard>

    <UCard class="rounded-sm" :ui="{ body: 'p-3 sm:p-4' }">
      <template #header>
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div class="flex items-center gap-2">
            <UIcon name="i-carbon-task-complete" class="size-4 text-primary" />
            <h2 class="text-sm font-semibold text-highlighted">
              盘点
            </h2>
            <UBadge variant="subtle" color="neutral" size="sm">
              {{ stocktakes.length }} 张
            </UBadge>
          </div>
          <div class="flex items-center gap-1 rounded-sm border border-default p-1">
            <span class="px-1 text-[11px] text-muted">当前身份</span>
            <UButton
              size="xs"
              :color="stocktakeActor === '张明远' ? 'primary' : 'neutral'"
              :variant="stocktakeActor === '张明远' ? 'soft' : 'ghost'"
              label="制单人 张明远"
              data-testid="stocktake-ops-actor-maker"
              @click="setStocktakeActor('张明远')"
            />
            <UButton
              size="xs"
              :color="stocktakeActor === '陈立' ? 'primary' : 'neutral'"
              :variant="stocktakeActor === '陈立' ? 'soft' : 'ghost'"
              label="审批人 陈立"
              data-testid="stocktake-ops-actor-approver"
              @click="setStocktakeActor('陈立')"
            />
          </div>
        </div>
      </template>

      <div class="space-y-3">
        <ResizableTable
          :data="stocktakes"
          :columns="stocktakeColumns"
          class="nx-table"
          :ui="{ th: 'py-2.5', td: 'py-2' }"
          :row-activate="openStocktakeDetail"
          data-testid="stocktake-ops-table"
        >
          <template #warehouse-cell="{ row }">
            <span class="text-sm text-default">{{ warehouseName(row.original.warehouseId) }}</span>
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
              :color="diffColor(stocktakeDiff(row.original))"
              variant="subtle"
              size="sm"
              :data-testid="'stocktake-ops-diff-' + row.original.id"
            >
              {{ signed(stocktakeDiff(row.original)) }}
            </UBadge>
          </template>
          <template #actions-cell="{ row }">
            <UButton
              size="xs"
              color="neutral"
              variant="outline"
              label="盘点详情"
              :data-testid="'stocktake-ops-open-' + row.original.id"
              @click="openStocktakeDetail(row.original)"
            />
          </template>
        </ResizableTable>

        <div class="grid gap-3 lg:grid-cols-2">
          <div class="rounded-sm border border-default p-3" data-testid="stocktake-ops-inventory">
            <p class="text-xs font-medium text-highlighted">
              本地库存快照（确认盘点后更新）
            </p>
            <div class="mt-2 space-y-1.5">
              <div
                v-for="group in stockGroups"
                :key="group.warehouse.id"
                class="flex flex-wrap items-center gap-1"
              >
                <span class="w-24 shrink-0 text-[11px] text-muted">{{ group.warehouse.name }}</span>
                <UBadge
                  v-for="item in group.items"
                  :key="group.warehouse.id + '-' + item.sku"
                  variant="subtle"
                  color="neutral"
                  size="sm"
                >
                  {{ item.sku }} × {{ item.available }}
                </UBadge>
              </div>
            </div>
          </div>

          <div class="rounded-sm border border-default p-3" data-testid="stocktake-ops-adjustments">
            <p class="text-xs font-medium text-highlighted">
              最近调整流水（adjust）
            </p>
            <ul v-if="adjustMovements.length" class="mt-2 space-y-1 text-[11px] text-muted">
              <li
                v-for="movement in adjustMovements"
                :key="movement.id"
                class="flex items-center justify-between gap-2"
              >
                <span class="font-mono">{{ movement.id }}</span>
                <span class="truncate">{{ warehouseName(movement.warehouseId) }} · {{ movement.sku }} · {{ signed(movement.quantity) }}</span>
                <span class="shrink-0 tabular-nums">{{ movement.at }}</span>
              </li>
            </ul>
            <p v-else class="mt-2 text-[11px] text-muted">
              暂无调整流水，确认盘点后生成。
            </p>
          </div>
        </div>

        <p class="text-xs text-muted">
          演示流程：默认身份制单人张明远，打开 ST-2026-0001 提交复核；切换审批人陈立后确认完成，库存与 adjust 流水立即更新。取消时会把当前原因写入取消记录。已完成单据只读。
        </p>
      </div>
    </UCard>

    <UCard class="rounded-sm" :ui="{ body: 'p-3 sm:p-4' }">
      <template #header>
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div class="flex items-center gap-2">
            <UIcon name="i-carbon-arrows-horizontal" class="size-4 text-primary" />
            <h2 class="text-sm font-semibold text-highlighted">
              调拨
            </h2>
            <UBadge variant="subtle" color="neutral" size="sm">
              {{ transfers.length }} 张
            </UBadge>
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <span class="text-[11px] text-muted">操作人</span>
            <USelect
              v-model="transferActor"
              :items="transferActorItems"
              class="w-32"
              data-testid="transfer-ops-actor"
            />
            <UButton
              size="sm"
              icon="i-carbon-add"
              label="新建调拨"
              data-testid="transfer-ops-create"
              @click="openTransferForm"
            />
          </div>
        </div>
      </template>

      <div class="space-y-3">
        <ResizableTable
          :data="transfers"
          :columns="transferColumns"
          class="nx-table"
          :ui="{ th: 'py-2.5', td: 'py-2' }"
          :row-activate="openTransferDetail"
          data-testid="transfer-ops-table"
        >
          <template #route-cell="{ row }">
            <div class="flex items-center gap-1 text-sm text-default">
              <span class="whitespace-nowrap">{{ warehouseName(row.original.fromWarehouseId) }}</span>
              <UIcon name="i-carbon-arrow-right" class="size-3.5 text-muted" />
              <span class="whitespace-nowrap">{{ warehouseName(row.original.toWarehouseId) }}</span>
            </div>
          </template>
          <template #sku-cell="{ row }">
            <div class="text-sm text-default">
              {{ row.original.name }}
            </div>
            <div class="text-[11px] text-muted">
              {{ row.original.sku }} · {{ row.original.unit }}
            </div>
          </template>
          <template #state-cell="{ row }">
            <UBadge
              :color="transferStatusColors[row.original.status]"
              variant="subtle"
              size="sm"
              :label="transferStatusLabels[row.original.status]"
            />
          </template>
          <template #actions-cell="{ row }">
            <div class="flex flex-wrap items-center justify-end gap-1">
              <UButton
                size="xs"
                color="neutral"
                variant="ghost"
                label="详情"
                :data-testid="'transfer-ops-open-' + row.original.id"
                @click="openTransferDetail(row.original)"
              />
              <UButton
                v-if="row.original.status === 'draft'"
                size="xs"
                label="确认出库"
                icon="i-carbon-arrow-up-right"
                :disabled="Boolean(issueBlockedReason(row.original))"
                :data-testid="'transfer-ops-issue-' + row.original.id"
                @click="issueTransfer(row.original)"
              />
              <UButton
                v-if="row.original.status === 'in_transit'"
                size="xs"
                label="确认入库"
                icon="i-carbon-arrow-down-left"
                :disabled="Boolean(receiveBlockedReason(row.original))"
                :data-testid="'transfer-ops-receive-' + row.original.id"
                @click="receiveTransfer(row.original)"
              />
              <UButton
                v-if="row.original.status === 'completed'"
                size="xs"
                color="neutral"
                variant="outline"
                label="确认入库"
                icon="i-carbon-arrow-down-left"
                :data-testid="'transfer-ops-receive-' + row.original.id"
                @click="receiveTransfer(row.original)"
              />
            </div>
            <p
              v-if="row.original.status === 'draft' && issueBlockedReason(row.original)"
              class="mt-1 text-[11px] text-warning"
              :data-testid="'transfer-ops-permission-' + row.original.id"
            >
              {{ issueBlockedReason(row.original) }}
            </p>
            <p
              v-else-if="row.original.status === 'in_transit' && receiveBlockedReason(row.original)"
              class="mt-1 text-[11px] text-warning"
              :data-testid="'transfer-ops-permission-' + row.original.id"
            >
              {{ receiveBlockedReason(row.original) }}
            </p>
          </template>
        </ResizableTable>

        <p class="text-xs text-muted">
          演示流程：新建 TR 草稿 → 源仓调拨权限人员确认出库（源仓可用量减少、目标仓不变、记录在途数量与成本）→ 切换操作人为目标仓指定收货人确认入库（目标仓可用量增加，两端流水同单号追溯）。已完成单据再次点击确认入库只会提示，不会重复增加库存。
        </p>
      </div>
    </UCard>

    <USlideover
      v-model:open="warehouseCreateOpen"
      :ui="{ content: 'w-full sm:max-w-xl' }"
      data-testid="warehouse-ops-form"
    >
      <template #header>
        <div>
          <p class="text-sm font-semibold text-highlighted">
            新建仓库
          </p>
          <p class="mt-0.5 text-xs text-muted">
            编码用于单据与流水追溯；保存后仓库卡片与权限立即出现在仓库网络。
          </p>
        </div>
      </template>

      <template #body>
        <div class="space-y-4">
          <div class="grid gap-3 sm:grid-cols-2">
            <UFormField label="仓库编码" required>
              <UInput
                v-model="createForm.code"
                placeholder="例如 wh-north"
                class="w-full"
                data-testid="warehouse-ops-form-code"
              />
            </UFormField>
            <UFormField label="仓库名称" required>
              <UInput
                v-model="createForm.name"
                placeholder="例如 华北区域仓"
                class="w-full"
                data-testid="warehouse-ops-form-name"
              />
            </UFormField>
            <UFormField label="城市" required>
              <UInput
                v-model="createForm.city"
                placeholder="例如 北京"
                class="w-full"
                data-testid="warehouse-ops-form-city"
              />
            </UFormField>
            <UFormField label="指定收货人" required>
              <USelect
                v-model="createForm.receiver"
                :items="staffItems"
                class="w-full"
                data-testid="warehouse-ops-form-receiver"
              />
            </UFormField>
          </div>

          <div class="space-y-2">
            <p class="text-xs font-medium text-highlighted">
              收货人权限
            </p>
            <UCheckbox
              v-model="createForm.canReceive"
              label="可确认本仓入库"
              data-testid="warehouse-ops-form-receive"
            />
            <UCheckbox
              v-model="createForm.canTransfer"
              label="可发起本仓调拨出库"
              data-testid="warehouse-ops-form-transfer"
            />
          </div>

          <UAlert
            v-if="createError"
            color="error"
            variant="soft"
            icon="i-carbon-warning"
            :description="createError"
            data-testid="warehouse-ops-error"
          />

          <p class="text-xs text-muted">
            仅本次预览，刷新后恢复初始仓库样例。
          </p>
        </div>
      </template>

      <template #footer>
        <div class="flex w-full items-center justify-end gap-2">
          <UButton
            label="取消"
            color="neutral"
            variant="ghost"
            data-testid="warehouse-ops-form-cancel"
            @click="warehouseCreateOpen = false"
          />
          <UButton
            label="保存仓库"
            icon="i-carbon-save"
            data-testid="warehouse-ops-save"
            @click="saveWarehouse"
          />
        </div>
      </template>
    </USlideover>

    <USlideover
      v-model:open="warehouseDetailOpen"
      :ui="{ content: 'w-full sm:max-w-xl' }"
      data-testid="warehouse-ops-detail"
    >
      <template #header>
        <div class="flex items-center justify-between gap-2">
          <div v-if="activeWarehouse">
            <p class="text-sm font-semibold text-highlighted">
              仓库详情 · {{ activeWarehouse.name }}
            </p>
            <p class="mt-0.5 text-xs text-muted">
              {{ activeWarehouse.code }} · {{ activeWarehouse.city }} · 指定收货人与权限按本地状态实时变化
            </p>
          </div>
        </div>
      </template>

      <template #body>
        <div v-if="activeWarehouse" class="space-y-4">
          <dl class="grid grid-cols-3 gap-3 text-sm">
            <div>
              <dt class="text-[11px] text-muted">
                仓库编码
              </dt>
              <dd class="mt-0.5 font-mono text-default">
                {{ activeWarehouse.code }}
              </dd>
            </div>
            <div>
              <dt class="text-[11px] text-muted">
                城市
              </dt>
              <dd class="mt-0.5 text-default">
                {{ activeWarehouse.city }}
              </dd>
            </div>
            <div>
              <dt class="text-[11px] text-muted">
                状态
              </dt>
              <dd class="mt-0.5">
                <UBadge
                  :color="activeWarehouse.active ? 'success' : 'neutral'"
                  variant="subtle"
                  size="sm"
                  :label="activeWarehouse.active ? '启用' : '停用'"
                />
              </dd>
            </div>
          </dl>

          <div class="rounded-sm border border-default p-3">
            <div class="flex items-center justify-between gap-2">
              <p class="text-[11px] text-muted">
                当前指定收货人
              </p>
              <p class="text-sm font-semibold text-highlighted" data-testid="warehouse-ops-receiver">
                {{ activeWarehouse.receiver }}
              </p>
            </div>
            <div class="mt-2 flex flex-wrap gap-1" data-testid="warehouse-ops-permissions">
              <UBadge
                v-for="permission in activeWarehouse.permissions"
                :key="permission.name"
                :color="permissionColor(permission)"
                variant="subtle"
                size="sm"
              >
                {{ permission.name }} · {{ permissionLabel(permission) }}
              </UBadge>
            </div>
          </div>

          <div class="flex flex-wrap items-end gap-2">
            <UFormField label="更换指定收货人" class="min-w-[200px] flex-1">
              <USelect
                v-model="detailReceiver"
                :items="staffItems"
                class="w-full"
                data-testid="warehouse-ops-change-receiver"
              />
            </UFormField>
            <UButton
              label="保存收货人"
              icon="i-carbon-user-admin"
              data-testid="warehouse-ops-save-receiver"
              @click="saveReceiver"
            />
          </div>

          <UAlert
            v-if="detailHint"
            color="info"
            variant="soft"
            icon="i-carbon-information"
            :description="detailHint"
            data-testid="warehouse-ops-hint"
          />

          <UAlert
            v-if="detailError"
            color="error"
            variant="soft"
            icon="i-carbon-warning"
            :description="detailError"
            data-testid="warehouse-ops-detail-error"
          />

          <p class="text-xs text-muted">
            更换收货人后，原收货人失去本仓收货权限，新收货人获得收货权限；调拨权限保留，权限 chips 与提示同步更新。
          </p>
        </div>
      </template>

      <template #footer>
        <div class="flex w-full items-center justify-end gap-2">
          <UButton
            label="关闭"
            color="neutral"
            variant="outline"
            data-testid="warehouse-ops-detail-close"
            @click="warehouseDetailOpen = false"
          />
        </div>
      </template>
    </USlideover>

    <USlideover
      v-model:open="stocktakeDetailOpen"
      :ui="{ content: 'w-full sm:max-w-3xl' }"
      data-testid="stocktake-ops-detail"
    >
      <template #header>
        <div v-if="activeStocktake" class="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p class="text-sm font-semibold text-highlighted">
              盘点单 {{ activeStocktake.id }}
            </p>
            <p class="mt-0.5 text-xs text-muted">
              {{ warehouseName(activeStocktake.warehouseId) }} · 制单人 {{ activeStocktake.owner }} · {{ activeStocktake.createdAt }}
            </p>
          </div>
          <UBadge
            :color="stocktakeStatusColors[activeStocktake.status]"
            variant="subtle"
            size="sm"
            :label="stocktakeStatusLabels[activeStocktake.status]"
          />
        </div>
      </template>

      <template #body>
        <div v-if="activeStocktake" class="space-y-4">
          <div class="flex flex-wrap items-center justify-between gap-2 rounded-sm border border-default p-2.5">
            <div class="flex items-center gap-2">
              <span class="text-[11px] text-muted">当前身份</span>
              <UBadge variant="subtle" color="primary" size="sm">
                {{ stocktakeActor }}
              </UBadge>
              <span class="text-[11px] text-muted">操作人需与制单人 / 审批人匹配</span>
            </div>
            <UButton
              v-if="activeStocktake.status === 'submitted' && stocktakeActor === activeStocktake.submittedBy"
              size="xs"
              color="warning"
              variant="soft"
              icon="i-carbon-user-follow"
              label="切换为审批人陈立"
              data-testid="stocktake-ops-switch-approver"
              @click="switchToApprover"
            />
          </div>

          <dl class="grid grid-cols-3 gap-3 text-sm">
            <div>
              <dt class="text-[11px] text-muted">
                仓库
              </dt>
              <dd class="mt-0.5 text-default">
                {{ warehouseName(activeStocktake.warehouseId) }}
              </dd>
            </div>
            <div>
              <dt class="text-[11px] text-muted">
                差异合计
              </dt>
              <dd class="mt-0.5 tabular-nums text-default">
                {{ signed(stocktakeDiff(activeStocktake)) }}
              </dd>
            </div>
            <div>
              <dt class="text-[11px] text-muted">
                最近更新
              </dt>
              <dd class="mt-0.5 tabular-nums text-default">
                {{ activeStocktake.updatedAt }}
              </dd>
            </div>
          </dl>

          <ResizableTable
            :data="activeStocktake.lines"
            :columns="stocktakeLineColumns"
            class="nx-table"
            :ui="{ th: 'py-2.5', td: 'py-2' }"
            data-testid="stocktake-ops-lines"
          >
            <template #countedQty-cell="{ row }">
              <UInput
                :model-value="row.original.countedQty"
                type="number"
                :min="0"
                :disabled="!stocktakeEditable"
                class="ml-auto w-20"
                :data-testid="'stocktake-ops-counted-' + row.original.lineNo"
                @update:model-value="updateCounted(row.original, $event)"
              />
            </template>
            <template #diff-cell="{ row }">
              <UBadge
                :color="diffColor(lineDiff(row.original))"
                variant="subtle"
                size="sm"
              >
                {{ signed(lineDiff(row.original)) }}
              </UBadge>
            </template>
            <template #reason-cell="{ row }">
              <UInput
                :model-value="row.original.reason"
                placeholder="差异原因"
                :disabled="!stocktakeEditable"
                class="w-full min-w-[150px]"
                :data-testid="'stocktake-ops-line-reason-' + row.original.lineNo"
                @update:model-value="updateLineReason(row.original, $event)"
              />
            </template>
          </ResizableTable>

          <UFormField label="盘点 / 取消原因">
            <UInput
              :model-value="activeStocktake.reason"
              placeholder="差异说明或取消原因"
              :disabled="activeStocktake.status === 'completed' || activeStocktake.status === 'cancelled'"
              class="w-full"
              data-testid="stocktake-ops-reason"
              @update:model-value="updateStocktakeReason"
            />
          </UFormField>

          <div class="rounded-sm border border-default p-3">
            <p class="text-xs font-medium text-highlighted">
              处理记录
            </p>
            <ol class="mt-2 space-y-1.5" data-testid="stocktake-ops-history">
              <li
                v-for="(entry, index) in activeStocktake.history"
                :key="index"
                class="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[11px] text-muted"
              >
                <span class="shrink-0 tabular-nums">{{ entry.at }}</span>
                <span class="font-medium text-default">{{ entry.actor }}</span>
                <span>{{ entry.action }}</span>
                <span v-if="entry.note">· {{ entry.note }}</span>
              </li>
            </ol>
          </div>

          <UAlert
            v-if="stocktakeError"
            color="error"
            variant="soft"
            icon="i-carbon-warning"
            :description="stocktakeError"
            data-testid="stocktake-ops-error"
          />

          <p class="text-xs text-muted">
            {{ stocktakeActionHint }}
          </p>
        </div>
      </template>

      <template #footer>
        <div v-if="activeStocktake" class="flex w-full flex-wrap items-center justify-end gap-2">
          <UButton
            label="关闭"
            color="neutral"
            variant="ghost"
            data-testid="stocktake-ops-close"
            @click="stocktakeDetailOpen = false"
          />
          <template v-if="activeStocktake.status === 'counting' || activeStocktake.status === 'submitted'">
            <UButton
              label="取消盘点"
              color="error"
              variant="soft"
              icon="i-carbon-close-outline"
              data-testid="stocktake-ops-cancel"
              @click="cancelStocktake"
            />
          </template>
          <UButton
            v-if="activeStocktake.status === 'counting'"
            label="提交复核"
            icon="i-carbon-send-alt"
            data-testid="stocktake-ops-submit"
            @click="submitStocktake"
          />
          <UButton
            v-if="activeStocktake.status === 'submitted'"
            label="确认完成"
            icon="i-carbon-checkmark"
            data-testid="stocktake-ops-review"
            @click="reviewStocktake"
          />
        </div>
      </template>
    </USlideover>

    <USlideover
      v-model:open="transferFormOpen"
      :ui="{ content: 'w-full sm:max-w-xl' }"
      data-testid="transfer-ops-form"
    >
      <template #header>
        <div>
          <p class="text-sm font-semibold text-highlighted">
            新建调拨单
          </p>
          <p class="mt-0.5 text-xs text-muted">
            保存后为草稿；确认出库后进入在途，目标仓可用量在收货前保持不变。
          </p>
        </div>
      </template>

      <template #body>
        <div class="space-y-4">
          <div class="grid gap-3 sm:grid-cols-2">
            <UFormField label="源仓库" required>
              <USelect
                v-model="transferForm.fromWarehouseId"
                :items="warehouses.map(item => ({ label: item.name, value: item.id }))"
                class="w-full"
                data-testid="transfer-ops-from"
              />
            </UFormField>
            <UFormField label="目标仓库" required>
              <USelect
                v-model="transferForm.toWarehouseId"
                :items="warehouses.filter(item => item.id !== transferForm.fromWarehouseId).map(item => ({ label: item.name, value: item.id }))"
                placeholder="选择目标仓库"
                class="w-full"
                data-testid="transfer-ops-to"
              />
            </UFormField>
            <UFormField label="调拨商品" required>
              <USelect
                v-model="transferForm.sku"
                :items="transferSkuItems"
                placeholder="选择源仓商品"
                class="w-full"
                data-testid="transfer-ops-sku"
              />
            </UFormField>
            <UFormField label="调拨数量" required>
              <UInput
                v-model="transferForm.quantity"
                type="number"
                :min="1"
                class="w-full"
                data-testid="transfer-ops-qty"
              />
            </UFormField>
          </div>

          <p class="text-xs text-muted">
            当前操作人 {{ transferActor }}；源仓可用量 {{ transferForm.sku ? availableIn(transferForm.fromWarehouseId, transferForm.sku) : '—' }}，单件成本 {{ transferForm.sku ? formatMoney(productOf(transferForm.sku).unitCost) : '—' }}。
          </p>

          <UAlert
            v-if="transferError"
            color="error"
            variant="soft"
            icon="i-carbon-warning"
            :description="transferError"
            data-testid="transfer-ops-error"
          />
        </div>
      </template>

      <template #footer>
        <div class="flex w-full items-center justify-end gap-2">
          <UButton
            label="取消"
            color="neutral"
            variant="ghost"
            data-testid="transfer-ops-form-cancel"
            @click="transferFormOpen = false"
          />
          <UButton
            label="保存草稿"
            icon="i-carbon-save"
            data-testid="transfer-ops-save"
            @click="saveTransfer"
          />
        </div>
      </template>
    </USlideover>

    <USlideover
      v-model:open="transferDetailOpen"
      :ui="{ content: 'w-full sm:max-w-2xl' }"
      data-testid="transfer-ops-detail"
    >
      <template #header>
        <div v-if="activeTransfer" class="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p class="text-sm font-semibold text-highlighted">
              调拨单 {{ activeTransfer.id }}
            </p>
            <p class="mt-0.5 text-xs text-muted">
              {{ warehouseName(activeTransfer.fromWarehouseId) }} → {{ warehouseName(activeTransfer.toWarehouseId) }} · {{ activeTransfer.createdAt }}
            </p>
          </div>
          <UBadge
            :color="transferStatusColors[activeTransfer.status]"
            variant="subtle"
            size="sm"
            :label="transferStatusLabels[activeTransfer.status]"
            data-testid="transfer-ops-state"
          />
        </div>
      </template>

      <template #body>
        <div v-if="activeTransfer" class="space-y-4">
          <dl class="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <div>
              <dt class="text-[11px] text-muted">
                商品
              </dt>
              <dd class="mt-0.5 whitespace-normal text-default">
                {{ activeTransfer.name }}
              </dd>
            </div>
            <div>
              <dt class="text-[11px] text-muted">
                调拨数量
              </dt>
              <dd class="mt-0.5 tabular-nums text-default">
                {{ activeTransfer.quantity }} {{ activeTransfer.unit }}
              </dd>
            </div>
            <div>
              <dt class="text-[11px] text-muted">
                在途数量
              </dt>
              <dd class="mt-0.5 tabular-nums text-default" data-testid="transfer-ops-intransit">
                {{ intransitQty(activeTransfer) }} {{ activeTransfer.unit }}
              </dd>
            </div>
            <div>
              <dt class="text-[11px] text-muted">
                在途成本
              </dt>
              <dd class="mt-0.5 tabular-nums text-default" data-testid="transfer-ops-cost">
                {{ formatMoney(transferCost(activeTransfer)) }}
              </dd>
            </div>
          </dl>

          <div class="rounded-sm border border-default p-3">
            <div class="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span class="text-muted">源仓可用（确认出库后减少）</span>
              <span class="tabular-nums text-default">{{ availableIn(activeTransfer.fromWarehouseId, activeTransfer.sku) }}</span>
            </div>
            <div class="mt-1.5 flex flex-wrap items-center justify-between gap-2 text-xs">
              <span class="text-muted">目标仓可用（收货前保持原值）</span>
              <span class="tabular-nums text-default">{{ availableIn(activeTransfer.toWarehouseId, activeTransfer.sku) }}</span>
            </div>
          </div>

          <div v-if="activeTransfer.status === 'in_transit' && transferActor !== transferTo(activeTransfer)?.receiver" class="flex flex-wrap items-center justify-between gap-2 rounded-sm border border-default p-2.5">
            <p class="text-[11px] text-muted">
              当前操作人 {{ transferActor }} 不是目标仓指定收货人，需切换为 {{ transferTo(activeTransfer)?.receiver }} 才能确认入库。
            </p>
            <UButton
              size="xs"
              color="warning"
              variant="soft"
              icon="i-carbon-user-follow"
              :label="'切换为 ' + (transferTo(activeTransfer)?.receiver ?? '收货人')"
              data-testid="transfer-ops-switch-receiver"
              @click="switchToReceiver"
            />
          </div>

          <UAlert
            v-if="activeTransfer.status === 'draft' && issueBlockedReason(activeTransfer)"
            color="warning"
            variant="soft"
            icon="i-carbon-warning-alt"
            :description="issueBlockedReason(activeTransfer)"
            data-testid="transfer-ops-permission"
          />
          <UAlert
            v-else-if="activeTransfer.status === 'in_transit' && receiveBlockedReason(activeTransfer)"
            color="warning"
            variant="soft"
            icon="i-carbon-warning-alt"
            :description="receiveBlockedReason(activeTransfer)"
            data-testid="transfer-ops-permission"
          />

          <div class="rounded-sm border border-default p-3">
            <p class="text-xs font-medium text-highlighted">
              处理记录
            </p>
            <ol class="mt-2 space-y-1.5" data-testid="transfer-ops-history">
              <li
                v-for="(entry, index) in activeTransfer.history"
                :key="index"
                class="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[11px] text-muted"
              >
                <span class="shrink-0 tabular-nums">{{ entry.at }}</span>
                <span class="font-medium text-default">{{ entry.actor }}</span>
                <span>{{ entry.action }}</span>
                <span v-if="entry.note">· {{ entry.note }}</span>
              </li>
            </ol>
          </div>

          <div class="rounded-sm border border-default p-3">
            <p class="text-xs font-medium text-highlighted">
              调拨流水（同一单号可追溯两端）
            </p>
            <ul v-if="transferMovements(activeTransfer.id).length" class="mt-2 space-y-1.5" data-testid="transfer-ops-movements">
              <li
                v-for="movement in transferMovements(activeTransfer.id)"
                :key="movement.id"
                class="flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted"
              >
                <span class="font-mono">{{ movement.id }}</span>
                <span>{{ movement.type === 'inbound' ? '目标仓入库' : '源仓出库' }} · {{ warehouseName(movement.warehouseId) }} · {{ movement.sku }} · {{ signed(movement.quantity) }}</span>
                <span class="tabular-nums">{{ movement.at }}</span>
              </li>
            </ul>
            <p v-else class="mt-2 text-[11px] text-muted">
              确认出库后生成源仓 outbound 流水，确认入库后生成目标仓 inbound 流水，两者共用调拨单号。
            </p>
          </div>

          <UAlert
            v-if="transferError"
            color="error"
            variant="soft"
            icon="i-carbon-warning"
            :description="transferError"
            data-testid="transfer-ops-error"
          />

          <p class="text-xs text-muted">
            {{ activeTransfer.status === 'completed' ? '该调拨单已完成，重复确认入库不会重复增加库存。' : '确认出库后源仓可用量减少、目标仓保持不变；目标仓指定收货人确认入库后才增加目标仓可用量。' }}
          </p>
        </div>
      </template>

      <template #footer>
        <div v-if="activeTransfer" class="flex w-full flex-wrap items-center justify-end gap-2">
          <UButton
            label="关闭"
            color="neutral"
            variant="ghost"
            data-testid="transfer-ops-close"
            @click="transferDetailOpen = false"
          />
          <UButton
            v-if="activeTransfer.status === 'draft'"
            label="确认出库"
            icon="i-carbon-arrow-up-right"
            :disabled="Boolean(issueBlockedReason(activeTransfer))"
            data-testid="transfer-ops-issue"
            @click="issueTransfer(activeTransfer)"
          />
          <UButton
            v-if="activeTransfer.status === 'in_transit'"
            label="确认入库"
            icon="i-carbon-arrow-down-left"
            :disabled="Boolean(receiveBlockedReason(activeTransfer))"
            data-testid="transfer-ops-receive"
            @click="receiveTransfer(activeTransfer)"
          />
          <UButton
            v-if="activeTransfer.status === 'completed'"
            label="确认入库（已完成）"
            icon="i-carbon-arrow-down-left"
            color="neutral"
            variant="outline"
            data-testid="transfer-ops-receive"
            @click="receiveTransfer(activeTransfer)"
          />
        </div>
      </template>
    </USlideover>
  </div>
</template>

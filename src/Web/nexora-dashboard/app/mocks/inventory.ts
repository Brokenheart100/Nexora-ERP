import type {
  InventoryMovement,
  InventoryMovementType,
  InventoryPosition,
  Stocktake,
  StocktakeLine,
  StocktakeStatus,
  TransferLine,
  TransferOrder,
  TransferStatus,
  Warehouse,
  WarehouseStatus
} from './types'
import { makeInventoryMovement, makeInventoryPosition } from './factories'

export const warehouseStatusLabels: Record<WarehouseStatus, string> = {
  active: '启用',
  inactive: '停用'
}
export const warehouseStatusColors: Record<WarehouseStatus, 'success' | 'neutral'> = {
  active: 'success',
  inactive: 'neutral'
}
export const movementTypeLabels: Record<InventoryMovementType, string> = {
  inbound: '入库',
  outbound: '出库',
  transfer: '调拨',
  adjust: '盘点调整'
}
export const movementTypeColors: Record<InventoryMovementType, 'success' | 'warning' | 'info' | 'neutral'> = {
  inbound: 'success',
  outbound: 'warning',
  transfer: 'info',
  adjust: 'neutral'
}
export const stocktakeStatusLabels: Record<StocktakeStatus, string> = {
  draft: '草稿',
  counting: '盘点中',
  completed: '已完成'
}
export const stocktakeStatusColors: Record<StocktakeStatus, 'neutral' | 'warning' | 'success'> = {
  draft: 'neutral',
  counting: 'warning',
  completed: 'success'
}
export const transferStatusLabels: Record<TransferStatus, string> = {
  draft: '待执行',
  completed: '已执行'
}
export const transferStatusColors: Record<TransferStatus, 'neutral' | 'success'> = {
  draft: 'neutral',
  completed: 'success'
}

/**
 * 低库存演示阈值：按商品跨仓库汇总后的可用量计算，低于该值（含 0）进入低库存视图。
 * 阈值是前端演示常量，真实业务应由库存政策按 SKU / 仓库配置安全库存。
 */
export const LOW_STOCK_THRESHOLD = 120

/** 仓库地址不在共享类型 Warehouse 内（types.ts 已锁定），演示地址在此补充。 */
export const warehouseAddresses: Record<string, string> = {
  'wh-east': '上海市青浦区华新镇华志路 1688 号 A 栋 3 层 (201708)',
  'wh-south': '深圳市龙岗区坂田街道五和大道 88 号 2 号库 (518129)',
  'wh-retail': '杭州市余杭区仓前街道良睦路 1399 号 1 层 (311121)'
}

export const warehouses: Warehouse[] = [
  { id: 'wh-east', code: 'WH-EAST', name: '华东中心仓', city: '上海', manager: '陈立', status: 'active' },
  { id: 'wh-south', code: 'WH-SOUTH', name: '华南前置仓', city: '深圳', manager: '林小雨', status: 'active' },
  { id: 'wh-retail', code: 'WH-RETAIL', name: '杭州零售仓', city: '杭州', manager: '周宁', status: 'inactive' }
]

const warehouseIds = ['wh-east', 'wh-south', 'wh-retail']

export interface InventoryProduct {
  name: string
  unit: string
}

/**
 * 12 个演示 SKU 的商品名与单位。位置、流水与盘点行统一从这里取名称，
 * 保证同一 SKU 在不同仓库的名称、单位一致，便于跨仓汇总。
 */
export const inventoryProducts: Record<string, InventoryProduct> = {
  'SKU-1001': { name: 'ThinkPad E14 商务笔记本电脑（i7/16G/512G）', unit: '台' },
  'SKU-1002': { name: 'A4 复印纸 70g 500 张/包', unit: '包' },
  'SKU-1003': { name: '兄弟 DCP-B7530DN 黑白激光一体机', unit: '台' },
  'SKU-1004': { name: '双面高密度聚乙烯（HDPE）包装袋 40×50cm 加厚', unit: '包' },
  'SKU-1006': { name: 'SATA 6Gb/s 数据线 0.5m 蓝色', unit: '根' },
  'SKU-1007': { name: '60W USB-C 快充充电器（国标插头）', unit: '个' },
  'SKU-1010': { name: '人体工学网椅（带腰托/可躺 135°）', unit: '把' },
  'SKU-1011': { name: '一次性丁腈手套 100 只/盒 M 码', unit: '盒' },
  'SKU-1012': { name: '24 口千兆非网管交换机', unit: '台' },
  'SKU-1014': { name: '白板笔（可擦写）黑色 10 支/盒', unit: '盒' },
  'SKU-1016': { name: 'Type-C 转 HDMI 4K 扩展坞（含 PD 100W）', unit: '个' },
  'SKU-1018': { name: '高精度电子台秤 30kg/1g（带 RS232）', unit: '台' }
}

/**
 * 30 个库存位置：每个仓库 10 个，SKU 按三段列表重复出现，
 * 让同一商品分布在多个仓库，低库存视图可以演示跨仓库汇总。
 */
const positionSkus = [
  'SKU-1001', 'SKU-1002', 'SKU-1003', 'SKU-1006', 'SKU-1007', 'SKU-1010', 'SKU-1011', 'SKU-1012', 'SKU-1014', 'SKU-1016',
  'SKU-1001', 'SKU-1002', 'SKU-1004', 'SKU-1006', 'SKU-1007', 'SKU-1010', 'SKU-1011', 'SKU-1012', 'SKU-1016', 'SKU-1018',
  'SKU-1001', 'SKU-1002', 'SKU-1003', 'SKU-1004', 'SKU-1007', 'SKU-1010', 'SKU-1014', 'SKU-1016', 'SKU-1018', 'SKU-1011'
]

/** 固定的低库存 / 零库存样例（覆盖生成数量），保证 ?state= 正常时也有可演示的数据。 */
const positionOverrides: Record<number, Partial<InventoryPosition>> = {
  2: { quantity: 0, reserved: 0, available: 0 },
  5: { quantity: 100, reserved: 0, available: 100 },
  8: { quantity: 40, reserved: 10, available: 30 },
  9: { quantity: 100, reserved: 0, available: 100 },
  12: { quantity: 24, reserved: 12, available: 12 },
  19: { quantity: 0, reserved: 0, available: 0 },
  22: { quantity: 0, reserved: 0, available: 0 },
  23: { quantity: 30, reserved: 6, available: 24 },
  26: { quantity: 20, reserved: 0, available: 20 },
  28: { quantity: 18, reserved: 0, available: 18 }
}

export const inventoryPositions: InventoryPosition[] = Array.from({ length: 30 }, (_, i) => {
  const sku = positionSkus[i]!
  const product = inventoryProducts[sku]!
  return makeInventoryPosition({
    id: 'ip-' + (3001 + i),
    warehouseId: warehouseIds[Math.floor(i / 10)]!,
    sku,
    name: product.name,
    unit: product.unit,
    lotNo: 'LOT-2026-' + String(1100 + i),
    updatedAt: '2026-11-' + String(10 + (i % 8)).padStart(2, '0') + ' ' + String(9 + (i % 9)).padStart(2, '0') + ':' + String((i * 11) % 60).padStart(2, '0'),
    ...(positionOverrides[i] ?? {})
  }, 7100 + i)
})

/** 20 条流水：单据号挂到采购单 / 销售单 / 调拨单 / 盘点单，供页面演示「单据号跳转」。 */
const movementPlan: { type: InventoryMovementType, reference: string }[] = [
  { type: 'inbound', reference: 'PO-2026-0511' },
  { type: 'outbound', reference: 'SO-2026-9002' },
  { type: 'inbound', reference: 'PO-2026-0514' },
  { type: 'transfer', reference: 'TR-2026-0001' },
  { type: 'outbound', reference: 'SO-2026-9003' },
  { type: 'adjust', reference: 'ST-2026-0002' },
  { type: 'inbound', reference: 'PO-2026-0517' },
  { type: 'outbound', reference: 'SO-2026-9008' },
  { type: 'transfer', reference: 'TR-2026-0001' },
  { type: 'inbound', reference: 'PO-2026-0511' },
  { type: 'outbound', reference: 'SO-2026-9002' },
  { type: 'adjust', reference: 'ST-2026-0001' },
  { type: 'inbound', reference: 'PO-2026-0514' },
  { type: 'outbound', reference: 'SO-2026-9003' },
  { type: 'transfer', reference: 'TR-2026-0002' },
  { type: 'inbound', reference: 'PO-2026-0517' },
  { type: 'outbound', reference: 'SO-2026-9008' },
  { type: 'adjust', reference: 'ST-2026-0002' },
  { type: 'inbound', reference: 'PO-2026-0511' },
  { type: 'outbound', reference: 'SO-2026-9002' }
]

const generatedMovements: InventoryMovement[] = Array.from({ length: 20 }, (_, i) => {
  const plan = movementPlan[i]!
  const sku = positionSkus[(i * 3) % positionSkus.length]!
  const product = inventoryProducts[sku]!
  return makeInventoryMovement({
    id: 'mv-' + (4001 + i),
    type: plan.type,
    warehouseId: warehouseIds[i % warehouseIds.length]!,
    sku,
    name: product.name,
    quantity: 6 + i * 4,
    reference: plan.reference,
    at: '2026-11-' + String(17 - (i % 12)).padStart(2, '0') + ' ' + String(9 + (i % 8)).padStart(2, '0') + ':' + String((i * 7) % 60).padStart(2, '0')
  }, 8100 + i)
})

/**
 * C6：两张已确认退货单的历史流水，让退货详情、库存位置与流水在首次加载时即可对照。
 * 位置结存已包含这两笔退货（采购出库、销售入库各 5/1 件），流水只补历史记录。
 */
export const inventoryMovements: InventoryMovement[] = [
  ...generatedMovements,
  {
    id: 'mv-4021',
    type: 'outbound',
    warehouseId: 'wh-east',
    sku: 'SKU-1016',
    name: inventoryProducts['SKU-1016']!.name,
    quantity: 5,
    reference: 'PR-2026-1201',
    at: '2026-11-16 10:05',
    returnId: 'PR-2026-1201',
    executionId: 'EXE-RC-2026-0511-02',
    balanceAfter: 100
  },
  {
    id: 'mv-4022',
    type: 'inbound',
    warehouseId: 'wh-east',
    sku: 'SKU-1010',
    name: inventoryProducts['SKU-1010']!.name,
    quantity: 1,
    reference: 'SR-2026-1201',
    at: '2026-11-16 11:00',
    returnId: 'SR-2026-1201',
    executionId: 'EXE-FUL-9001-01',
    balanceAfter: 100
  }
]

function stocktakeLine(index: number, lineNo: number, countedDelta: number): StocktakeLine {
  const position = inventoryPositions[index]!
  return {
    lineNo,
    sku: position.sku,
    name: position.name,
    systemQty: position.quantity,
    countedQty: Math.max(position.quantity + countedDelta, 0),
    unit: position.unit
  }
}

/** 2 张盘点单：一张盘点中（有差异），一张已完成。 */
export const stocktakes: Stocktake[] = [
  {
    id: 'ST-2026-0001',
    workspaceId: 'ws-hq',
    warehouseId: 'wh-east',
    status: 'counting',
    createdAt: '2026-11-14 09:30',
    owner: '陈立',
    lines: [stocktakeLine(0, 1, -3), stocktakeLine(3, 2, 0), stocktakeLine(6, 3, 2), stocktakeLine(9, 4, -1)]
  },
  {
    id: 'ST-2026-0002',
    workspaceId: 'ws-south',
    warehouseId: 'wh-south',
    status: 'completed',
    createdAt: '2026-11-10 14:00',
    owner: '林小雨',
    lines: [stocktakeLine(10, 1, 0), stocktakeLine(15, 2, -2)]
  }
]

function transferLine(index: number, lineNo: number, quantity: number): TransferLine {
  const position = inventoryPositions[index]!
  return { lineNo, sku: position.sku, name: position.name, quantity, unit: position.unit }
}

/** 2 张调拨单：一张已执行（华东 → 华南），一张待执行（华东 → 杭州）。 */
export const transfers: TransferOrder[] = [
  {
    id: 'TR-2026-0001',
    workspaceId: 'ws-hq',
    fromWarehouseId: 'wh-east',
    toWarehouseId: 'wh-south',
    status: 'completed',
    createdAt: '2026-11-12 15:20',
    owner: '陈立',
    lines: [transferLine(0, 1, 2), transferLine(3, 2, 6)]
  },
  {
    id: 'TR-2026-0002',
    workspaceId: 'ws-hq',
    fromWarehouseId: 'wh-east',
    toWarehouseId: 'wh-retail',
    status: 'draft',
    createdAt: '2026-11-15 10:10',
    owner: '周宁',
    lines: [transferLine(6, 1, 4)]
  }
]

export interface WarehouseSummary {
  positionCount: number
  skuCount: number
  warningCount: number
  zeroCount: number
  totalQuantity: number
  totalAvailable: number
}

/** 单个仓库的库存概览：库存种类、位置数、预警位置数与数量合计。 */
export function summarizeWarehouse(
  positions: InventoryPosition[],
  warehouseId: string,
  threshold = LOW_STOCK_THRESHOLD
): WarehouseSummary {
  const list = positions.filter(position => position.warehouseId === warehouseId)
  return {
    positionCount: list.length,
    skuCount: new Set(list.map(position => position.sku)).size,
    warningCount: list.filter(position => position.available < threshold).length,
    zeroCount: list.filter(position => position.available === 0).length,
    totalQuantity: list.reduce((sum, position) => sum + position.quantity, 0),
    totalAvailable: list.reduce((sum, position) => sum + position.available, 0)
  }
}

export interface LowStockItem {
  sku: string
  name: string
  unit: string
  totalQuantity: number
  totalAvailable: number
  byWarehouse: Record<string, number>
  warehouseIds: string[]
  zeroWarehouseCount: number
}

/** 跨仓库汇总的低库存商品：可用量合计低于演示阈值（含 0）。 */
export function summarizeLowStock(
  positions: InventoryPosition[],
  threshold = LOW_STOCK_THRESHOLD
): LowStockItem[] {
  const map = new Map<string, LowStockItem>()
  for (const position of positions) {
    const item = map.get(position.sku) ?? {
      sku: position.sku,
      name: position.name,
      unit: position.unit,
      totalQuantity: 0,
      totalAvailable: 0,
      byWarehouse: {},
      warehouseIds: [] as string[],
      zeroWarehouseCount: 0
    }
    item.totalQuantity += position.quantity
    item.totalAvailable += position.available
    item.byWarehouse[position.warehouseId] = (item.byWarehouse[position.warehouseId] ?? 0) + position.available
    if (!item.warehouseIds.includes(position.warehouseId)) item.warehouseIds.push(position.warehouseId)
    if (position.available === 0) item.zeroWarehouseCount += 1
    map.set(position.sku, item)
  }
  return [...map.values()]
    .filter(item => item.totalAvailable < threshold)
    .sort((a, b) => a.totalAvailable - b.totalAvailable)
}

/** 深拷贝盘点单：页面上的实盘录入只改副本，刷新后回到初始样例。 */
export function cloneStocktake(stocktake: Stocktake): Stocktake {
  return { ...stocktake, lines: stocktake.lines.map(line => ({ ...line })) }
}

/** 深拷贝调拨单：页面上的执行动作只改副本，刷新后回到初始样例。 */
export function cloneTransferOrder(transfer: TransferOrder): TransferOrder {
  return { ...transfer, lines: transfer.lines.map(line => ({ ...line })) }
}

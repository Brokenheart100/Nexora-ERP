import { defineStore } from 'pinia'
import type { InventoryMovement, InventoryPosition, StockReturn } from '~/mocks'
import { inventoryMovements, inventoryPositions, inventoryProducts } from '~/mocks'

export interface InventoryStockResult {
  ok: boolean
  message: string
  movements?: InventoryMovement[]
}

function pad(value: number) {
  return String(value).padStart(2, '0')
}

function nowStamp() {
  const date = new Date()
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function unitOf(sku: string) {
  return inventoryProducts[sku]?.unit ?? '件'
}

function nextNumber(rows: { id: string }[], prefix: string) {
  let max = 0
  for (const row of rows) {
    const matched = row.id.match(new RegExp('^' + prefix + '(\\d+)$'))
    if (matched) max = Math.max(max, Number(matched[1]))
  }
  return max + 1
}

/**
 * C6：工作区级库存唯一数据源。退货确认后所有页面都从该 store 读取库存位置和流水，
 * 保证退货详情、库存位置与流水数量一致。页面上的临时收发仍保留各自副本。
 */
export const useInventoryStore = defineStore('inventory', () => {
  const positions = ref<InventoryPosition[]>(inventoryPositions.map(position => ({ ...position })))
  const movements = ref<InventoryMovement[]>(inventoryMovements.map(movement => ({ ...movement })))
  const revision = ref(0)

  function positionsIn(warehouseId: string, sku: string) {
    return positions.value.filter(position => position.warehouseId === warehouseId && position.sku === sku)
  }

  function positionOf(warehouseId: string, sku: string) {
    return positionsIn(warehouseId, sku)[0]
  }

  function totalQuantityIn(warehouseId: string, sku: string) {
    return positionsIn(warehouseId, sku).reduce((sum, position) => sum + position.quantity, 0)
  }

  function availableIn(warehouseId: string, sku: string) {
    return positionsIn(warehouseId, sku).reduce((sum, position) => sum + position.available, 0)
  }

  function movementsForReturn(returnId: string) {
    return movements.value.filter(movement => movement.returnId === returnId)
  }

  function canApplyReturn(stockReturn: StockReturn): InventoryStockResult {
    if (!stockReturn.lines.length) return { ok: false, message: '退货单缺少明细，不能更新库存。' }
    if (stockReturn.direction !== 'purchase') return { ok: true, message: '' }
    for (const line of stockReturn.lines) {
      const total = totalQuantityIn(stockReturn.warehouseId, line.sku)
      if (total < line.quantity) {
        const unit = unitOf(line.sku)
        return {
          ok: false,
          message: `${line.name} 在原收货仓的库存为 ${total} ${unit}，不足以退回 ${line.quantity} ${unit}。`
        }
      }
    }
    return { ok: true, message: '' }
  }

  function makeMovement(
    stockReturn: StockReturn,
    line: StockReturn['lines'][number],
    type: InventoryMovement['type'],
    quantity: number,
    at: string,
    id: string
  ): InventoryMovement {
    return {
      id,
      type,
      warehouseId: stockReturn.warehouseId,
      sku: line.sku,
      name: line.name,
      quantity,
      reference: stockReturn.id,
      at,
      returnId: stockReturn.id,
      executionId: stockReturn.executionId,
      balanceAfter: totalQuantityIn(stockReturn.warehouseId, line.sku)
    }
  }

  /**
   * 把已确认退货写回库存：采购退货从原收货仓扣减（跨批次），销售退货计入收回仓。
   * 同一退货单已写入流水时直接返回，保证重复确认不会重复扣减。
   */
  function applyReturn(stockReturn: StockReturn): InventoryStockResult {
    const existing = movementsForReturn(stockReturn.id)
    if (existing.length) return { ok: true, message: '该退货单的库存已同步。', movements: existing }

    const checked = canApplyReturn(stockReturn)
    if (!checked.ok) return checked

    const at = stockReturn.confirmedAt ?? nowStamp()
    let sequence = nextNumber(movements.value, 'mv-')
    const created: InventoryMovement[] = []

    for (const line of stockReturn.lines) {
      if (stockReturn.direction === 'purchase') {
        let remaining = line.quantity
        const lots = positionsIn(stockReturn.warehouseId, line.sku)
          .filter(position => position.quantity > 0)
          .sort((a, b) => b.quantity - a.quantity)
        for (const position of lots) {
          if (remaining <= 0) break
          const taken = Math.min(position.quantity, remaining)
          position.quantity -= taken
          position.available = Math.max(0, position.quantity - position.reserved)
          position.updatedAt = at
          remaining -= taken
          created.push(makeMovement(stockReturn, line, 'outbound', taken, at, 'mv-' + sequence))
          sequence += 1
        }
        if (remaining > 0) {
          return { ok: false, message: `${line.name} 的库存不足以完成退货。` }
        }
        continue
      }

      let position = positionOf(stockReturn.warehouseId, line.sku)
      if (!position) {
        position = {
          id: 'ip-' + nextNumber(positions.value, 'ip-'),
          warehouseId: stockReturn.warehouseId,
          sku: line.sku,
          name: line.name,
          lotNo: 'LOT-RET-' + stockReturn.id.replace(/^[PS]R-2026-/, ''),
          quantity: 0,
          reserved: 0,
          available: 0,
          unit: unitOf(line.sku),
          updatedAt: at
        }
        positions.value.push(position)
      }
      position.quantity += line.quantity
      position.available = Math.max(0, position.quantity - position.reserved)
      position.updatedAt = at
      created.push(makeMovement(stockReturn, line, 'inbound', line.quantity, at, 'mv-' + sequence))
      sequence += 1
    }

    movements.value = [...created, ...movements.value]
    revision.value += 1
    const summary = stockReturn.lines
      .map(line => `${line.name} ${stockReturn.direction === 'purchase' ? '-' : '+'}${line.quantity}`)
      .join('、')
    return { ok: true, message: `库存已更新：${summary}。`, movements: created }
  }

  function reset() {
    positions.value = inventoryPositions.map(position => ({ ...position }))
    movements.value = inventoryMovements.map(movement => ({ ...movement }))
    revision.value += 1
  }

  return {
    positions,
    movements,
    revision,
    positionOf,
    positionsIn,
    totalQuantityIn,
    availableIn,
    movementsForReturn,
    canApplyReturn,
    applyReturn,
    reset
  }
})

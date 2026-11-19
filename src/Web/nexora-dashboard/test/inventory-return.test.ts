import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { inventoryProducts } from '../app/mocks/inventory'
import { useStockFlowStore } from '../app/stores/stockFlow'
import { useInventoryStore } from '../app/stores/inventory'
import { useSupplierTradeStore } from '../app/stores/supplierTrade'
import { useReceivablesStore } from '../app/stores/receivables'

/**
 * C6：退货确认同时写回库存位置与流水，并按原明细开票状态拆分为贷项和未开票冲减。
 * 两个 100 件样例：wh-east / SKU-1016（采购退货）与 wh-east / SKU-1010（销售退货）。
 */
function seedPosition(sku: string, quantity: number) {
  const inventory = useInventoryStore()
  const product = inventoryProducts[sku]
  if (!product) throw new Error('未找到演示商品 ' + sku)
  inventory.positions.push({
    id: 'ip-test-' + sku,
    warehouseId: 'wh-east',
    sku,
    name: product.name,
    lotNo: 'LOT-TEST-' + sku,
    quantity,
    reserved: 0,
    available: quantity,
    unit: product.unit,
    updatedAt: '2026-11-18 10:00'
  })
}

describe('inventory return flow', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('reduces the original receipt warehouse by 5 for a purchase return', () => {
    const flow = useStockFlowStore()
    const inventory = useInventoryStore()
    expect(inventory.totalQuantityIn('wh-east', 'SKU-1016')).toBe(100)

    const created = flow.createReturn('EXE-RC-2026-0511-02', [{ lineNo: 3, quantity: 5 }], '外箱破损，退回供应商')
    expect(created.ok).toBe(true)
    expect(created.stockReturn?.id).toBe('PR-2026-1202')

    const confirmed = flow.confirmReturn('PR-2026-1202')
    expect(confirmed.ok).toBe(true)
    expect(confirmed.stockReturn?.status).toBe('confirmed')
    expect(confirmed.stockReturn?.lines[0]?.invoicedQuantity).toBe(5)
    expect(confirmed.stockReturn?.lines[0]?.uninvoicedQuantity).toBe(0)
    expect(confirmed.stockReturn?.creditId).toMatch(/^CR-2026-1103$/)
    expect(confirmed.message).toContain('结存 95 个')

    expect(inventory.totalQuantityIn('wh-east', 'SKU-1016')).toBe(95)
    const movements = inventory.movementsForReturn('PR-2026-1202')
    expect(movements).toHaveLength(1)
    expect(movements[0]).toMatchObject({
      type: 'outbound',
      warehouseId: 'wh-east',
      sku: 'SKU-1016',
      quantity: 5,
      balanceAfter: 95,
      executionId: 'EXE-RC-2026-0511-02'
    })
  })

  it('adds 5 back to the receiving warehouse for a sales return', () => {
    const flow = useStockFlowStore()
    const inventory = useInventoryStore()
    expect(inventory.totalQuantityIn('wh-east', 'SKU-1010')).toBe(100)

    const created = flow.createReturn('EXE-FUL-9001-01', [{ lineNo: 1, quantity: 5 }], '客户退货，商品完好')
    expect(created.stockReturn?.id).toBe('SR-2026-1202')

    const confirmed = flow.confirmReturn('SR-2026-1202')
    expect(confirmed.ok).toBe(true)
    expect(confirmed.stockReturn?.lines[0]?.invoicedQuantity).toBe(5)
    expect(confirmed.stockReturn?.creditId).toMatch(/^CR-2026-1202$/)
    expect(confirmed.message).toContain('结存 105 把')

    expect(inventory.totalQuantityIn('wh-east', 'SKU-1010')).toBe(105)
    const movements = inventory.movementsForReturn('SR-2026-1202')
    expect(movements).toHaveLength(1)
    expect(movements[0]).toMatchObject({
      type: 'inbound',
      sku: 'SKU-1010',
      quantity: 5,
      balanceAfter: 105,
      executionId: 'EXE-FUL-9001-01'
    })
  })

  it('keeps inventory and movements unchanged when confirming twice', () => {
    const flow = useStockFlowStore()
    const inventory = useInventoryStore()
    flow.createReturn('EXE-RC-2026-0511-02', [{ lineNo: 3, quantity: 5 }], '重复确认')
    expect(flow.confirmReturn('PR-2026-1202').ok).toBe(true)

    const again = flow.confirmReturn('PR-2026-1202')
    expect(again.ok).toBe(false)
    expect(again.message).toContain('仅待确认退货可以确认')
    expect(inventory.totalQuantityIn('wh-east', 'SKU-1016')).toBe(95)
    expect(inventory.movementsForReturn('PR-2026-1202')).toHaveLength(1)
  })

  it('releases the pending quantity without touching inventory when a return is cancelled', () => {
    const flow = useStockFlowStore()
    const inventory = useInventoryStore()
    const receivables = useReceivablesStore()
    const creditsBefore = receivables.credits.length

    const created = flow.createReturn('EXE-FUL-9001-01', [{ lineNo: 1, quantity: 5 }], '客户取消退货')
    expect(created.ok).toBe(true)
    const cancelled = flow.cancelReturn('SR-2026-1202')
    expect(cancelled.ok).toBe(true)
    expect(cancelled.stockReturn?.status).toBe('cancelled')
    expect(cancelled.stockReturn?.creditId).toBeUndefined()

    expect(inventory.totalQuantityIn('wh-east', 'SKU-1010')).toBe(100)
    expect(inventory.movementsForReturn('SR-2026-1202')).toHaveLength(0)
    expect(receivables.credits.length).toBe(creditsBefore)

    const again = flow.createReturn('EXE-FUL-9001-01', [{ lineNo: 1, quantity: 5 }], '重新发起退货')
    expect(again.ok).toBe(true)
    expect(again.stockReturn?.id).toBe('SR-2026-1203')
  })

  it('rejects a return quantity above the returnable remainder', () => {
    const flow = useStockFlowStore()
    const inventory = useInventoryStore()
    const over = flow.createReturn('EXE-RC-2026-0511-02', [{ lineNo: 3, quantity: 16 }], '超量退货')
    expect(over.ok).toBe(false)
    expect(over.message).toContain('超过可退数量 15')
    expect(inventory.totalQuantityIn('wh-east', 'SKU-1016')).toBe(100)
    expect(inventory.movementsForReturn('PR-2026-1202')).toHaveLength(0)
  })

  it('splits a purchase return into billed credit and unbilled matchable reduction', () => {
    const flow = useStockFlowStore()
    const inventory = useInventoryStore()
    const supplier = useSupplierTradeStore()
    const before = inventory.totalQuantityIn('wh-east', 'SKU-1006')

    const created = flow.createReturn('EXE-RC-2026-0511-01', [{ lineNo: 1, quantity: 150 }], '整批质量不合格')
    expect(created.ok).toBe(true)

    const confirmed = flow.confirmReturn(created.stockReturn?.id ?? '')
    expect(confirmed.ok).toBe(true)
    const line = confirmed.stockReturn?.lines[0]
    expect(line?.invoicedQuantity).toBe(100)
    expect(line?.uninvoicedQuantity).toBe(50)
    expect(confirmed.stockReturn?.creditId).toMatch(/^CR-2026-1103$/)
    expect(confirmed.message).toContain('已开票 100 件生成贷项 CR-2026-1103')
    expect(confirmed.message).toContain('未开票 50 件已冲减可匹配数量')

    expect(inventory.totalQuantityIn('wh-east', 'SKU-1006')).toBe(before - 150)
    expect(confirmed.message).toContain('结存 ' + (before - 150) + ' 根')
    const movements = inventory.movementsForReturn(confirmed.stockReturn?.id ?? '')
    expect(movements[0]?.balanceAfter).toBe(before - 150)
    const credit = supplier.credits.find(row => row.id === confirmed.stockReturn?.creditId)
    expect(credit?.quantity).toBe(100)
    const receiptLine = supplier.receiptLines.find(row => row.receiptId === 'RC-2026-0511-01' && row.receiptLineNo === 1)
    expect(receiptLine?.availableQuantity).toBe(50)
  })

  it('reduces matchable quantity without a credit when the receipt line is unbilled', () => {
    const flow = useStockFlowStore()
    const inventory = useInventoryStore()
    const supplier = useSupplierTradeStore()
    seedPosition('SKU-1011', 200)
    const before = inventory.totalQuantityIn('wh-east', 'SKU-1011')

    const created = flow.createReturn('EXE-RC-2026-0514-01', [{ lineNo: 1, quantity: 5 }], '未开票退货')
    const confirmed = flow.confirmReturn(created.stockReturn?.id ?? '')
    expect(confirmed.ok).toBe(true)
    expect(confirmed.stockReturn?.creditId).toBeUndefined()
    expect(confirmed.stockReturn?.lines[0]?.invoicedQuantity).toBe(0)
    expect(confirmed.stockReturn?.lines[0]?.uninvoicedQuantity).toBe(5)
    expect(confirmed.message).toContain('本单没有已开票数量，不生成贷项')
    expect(confirmed.message).toContain('未开票 5 件已冲减可匹配数量')

    expect(inventory.totalQuantityIn('wh-east', 'SKU-1011')).toBe(before - 5)
    expect(supplier.unbilledReturnedOf('RC-2026-0514-01', 1)).toBe(5)
    const receiptLine = supplier.receiptLines.find(row => row.receiptId === 'RC-2026-0514-01' && row.receiptLineNo === 1)
    expect(receiptLine?.availableQuantity).toBe(75)
  })

  it('reduces the invoiceable quantity for uninvoiced sales returns', () => {
    const receivables = useReceivablesStore()
    expect(receivables.invoicedQuantityOf('SO-2026-9001', 1)).toBe(80)
    expect(receivables.invoiceableQuantityOf('SO-2026-9001', 1, 80)).toBe(80)

    const reduced = receivables.recordReturnReduction('SO-2026-9001', 1, 3)
    expect(reduced.ok).toBe(true)
    expect(receivables.invoiceableQuantityOf('SO-2026-9001', 1, 80)).toBe(77)
    expect(receivables.invoicedQuantityOf('SO-2026-9001', 1)).toBe(80)
  })
})

import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useStockFlowStore } from '../app/stores/stockFlow'
import { useReceivablesStore } from '../app/stores/receivables'

describe('stock flow store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('seeds pending inbound and outbound permits from approved orders', () => {
    const store = useStockFlowStore()
    expect(store.pendingPermits.length).toBe(6)
    const inbound = store.permits.find(permit => permit.id === 'SP-IN-0513-01')
    expect(inbound?.status).toBe('pending')
    expect(inbound?.direction).toBe('inbound')
  })

  it('executes a partial permit and rejects a quantity above the remainder', () => {
    const store = useStockFlowStore()
    const over = store.execute('SP-IN-0513-01', {
      warehouseId: 'wh-east',
      operator: '陈立',
      at: '2026-11-18',
      lines: [{ lineNo: 1, quantity: 401 }]
    })
    expect(over.ok).toBe(false)
    expect(over.message).toContain('超过许可剩余 400')

    const result = store.execute('SP-IN-0513-01', {
      warehouseId: 'wh-east',
      operator: '陈立',
      at: '2026-11-18',
      lines: [{ lineNo: 1, quantity: 10 }]
    })
    expect(result.ok).toBe(true)
    expect(result.execution?.id).toBe('EXE-2026-0001')
    const permit = store.permits.find(row => row.id === 'SP-IN-0513-01')
    expect(permit?.status).toBe('partial')
    expect(store.executionsFor('SP-IN-0513-01')[0]?.lines[0]?.quantity).toBe(10)
  })

  it('creates a pending sales return and confirms it into a receivable credit', () => {
    const store = useStockFlowStore()
    const over = store.createReturn('EXE-FUL-9001-01', [{ lineNo: 1, quantity: 40 }], '客户取消')
    expect(over.ok).toBe(false)
    expect(over.message).toContain('超过可退数量 39')

    const created = store.createReturn('EXE-FUL-9001-01', [{ lineNo: 1, quantity: 1 }], '客户取消')
    expect(created.ok).toBe(true)
    expect(created.stockReturn?.id).toBe('SR-2026-1202')
    expect(created.stockReturn?.status).toBe('pending')

    const confirmed = store.confirmReturn('SR-2026-1202')
    expect(confirmed.ok).toBe(true)
    expect(confirmed.stockReturn?.status).toBe('confirmed')
    expect(confirmed.stockReturn?.creditId).toMatch(/^CR-2026-1202$/)
    const receivables = useReceivablesStore()
    expect(receivables.credits.some(credit => credit.id === 'CR-2026-1202')).toBe(true)
  })

  it('cancels a pending return without creating a credit', () => {
    const store = useStockFlowStore()
    const created = store.createReturn('EXE-FUL-9001-01', [{ lineNo: 1, quantity: 1 }], '重复创建')
    expect(created.stockReturn?.id).toBe('SR-2026-1202')
    const cancelled = store.cancelReturn('SR-2026-1202')
    expect(cancelled.ok).toBe(true)
    expect(cancelled.stockReturn?.status).toBe('cancelled')
    expect(cancelled.stockReturn?.creditId).toBeUndefined()
  })

  it('closes the remainder of a partially executed permit', () => {
    const store = useStockFlowStore()
    const executed = store.execute('SP-OUT-9001-01', {
      warehouseId: 'wh-south',
      operator: '陈立',
      at: '2026-11-18',
      lines: [{ lineNo: 1, quantity: 1 }]
    })
    expect(executed.ok).toBe(true)
    const closed = store.closePermit('SP-OUT-9001-01')
    expect(closed.ok).toBe(true)
    expect(store.permits.find(row => row.id === 'SP-OUT-9001-01')?.status).toBe('closed')
  })
})

import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useSupplierTradeStore } from '../app/stores/supplierTrade'

function fixedBill() {
  const store = useSupplierTradeStore()
  return store.bills.find(bill => bill.id === 'BILL-2026-1101')!
}

describe('supplier trade store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('keeps the C1 fixed ledger at 600 paid and 530 outstanding', () => {
    const store = useSupplierTradeStore()
    const bill = fixedBill()
    expect(bill.total).toBe(1130)
    expect(store.paidOf(bill.id)).toBe(600)
    expect(store.outstandingOf(bill)).toBe(530)
  })

  it('pays off the fixed ledger and rejects an overpayment', () => {
    const store = useSupplierTradeStore()
    const bill = fixedBill()
    const overpay = store.payBill({ billId: bill.id, amount: 999, bankAccountId: 'ba-2026-01', method: 'transfer' })
    expect(overpay.ok).toBe(false)
    expect(overpay.message).toContain('530.00')

    const paid = store.payBill({ billId: bill.id, amount: 530, bankAccountId: 'ba-2026-01', method: 'transfer' })
    expect(paid.ok).toBe(true)
    expect(store.paidOf(bill.id)).toBe(1130)
    expect(store.outstandingOf(bill)).toBe(0)
    expect(store.payments[0]?.amount).toBe(530)
    expect(store.bills.find(item => item.id === bill.id)?.status).toBe('posted')
  })

  it('rejects a duplicate payment submitted within the guard window', () => {
    const store = useSupplierTradeStore()
    const first = store.payBill({ billId: 'BILL-2026-1101', amount: 100, bankAccountId: 'ba-2026-01', method: 'transfer' })
    expect(first.ok).toBe(true)
    const second = store.payBill({ billId: 'BILL-2026-1101', amount: 100, bankAccountId: 'ba-2026-01', method: 'transfer' })
    expect(second.ok).toBe(false)
    expect(second.message).toContain('重复提交')
    expect(store.outstandingOf(fixedBill())).toBe(430)
  })

  it('posts a reviewed bill with its journal reference', () => {
    const store = useSupplierTradeStore()
    const result = store.reviewBill('BILL-2026-1102', 'approve')
    expect(result.ok).toBe(true)
    const bill = store.bills.find(item => item.id === 'BILL-2026-1102')
    expect(bill?.status).toBe('posted')
    expect(bill?.journalId).toBe('JE-AP-2026-1102')
  })

  it('creates a pending supplier bill from available receipt lines and posts it', () => {
    const store = useSupplierTradeStore()
    const created = store.createBill({
      date: '2026-11-18',
      dueAt: '2026-12-18',
      lines: [{ receiptId: 'RC-2026-0511-01', receiptLineNo: 1, quantity: 100, unitPrice: 8.8 }]
    })
    expect(created.ok).toBe(true)
    expect(created.bill?.id).toBe('BILL-2026-1105')
    expect(created.bill?.status).toBe('pending')
    expect(created.bill?.total).toBe(994.4)

    const reviewed = store.reviewBill('BILL-2026-1105', 'approve')
    expect(reviewed.ok).toBe(true)
    expect(reviewed.bill?.journalId).toBe('JE-AP-2026-1105')
  })

  it('rejects a bill quantity above the available receipt quantity', () => {
    const store = useSupplierTradeStore()
    const created = store.createBill({
      date: '2026-11-18',
      dueAt: '2026-12-18',
      lines: [{ receiptId: 'RC-2026-0511-01', receiptLineNo: 1, quantity: 101, unitPrice: 8.8 }]
    })
    expect(created.ok).toBe(false)
    expect(created.message).toContain('超过可匹配数量')
  })

  it('records a supplier credit refund and marks the credit refunded', () => {
    const store = useSupplierTradeStore()
    const credit = store.credits.find(item => item.id === 'CR-2026-1102')
    expect(store.recoverableOf(credit!)).toBe(291.54)
    const result = store.recordRefund('CR-2026-1102', 'ba-2026-01')
    expect(result.ok).toBe(true)
    expect(store.refunds[0]?.id).toBe('RF-2026-1102')
    expect(store.credits.find(item => item.id === 'CR-2026-1102')?.status).toBe('refunded')
  })
})

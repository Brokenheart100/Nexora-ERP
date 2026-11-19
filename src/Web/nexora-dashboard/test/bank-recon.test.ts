import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useBankReconStore } from '../app/stores/bankRecon'
import { useSupplierTradeStore } from '../app/stores/supplierTrade'

describe('C7 付款作废与银行对账', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('作废 C1 首笔付款后恢复账单未结并生成冲销流水', () => {
    const supplier = useSupplierTradeStore()
    const bank = useBankReconStore()
    const bill = supplier.bills.find(item => item.id === 'BILL-2026-1101')
    expect(bill).toBeTruthy()
    expect(supplier.outstandingOf(bill!)).toBe(530)
    const account = bank.accounts.find(item => item.id === 'ba-2026-01')
    expect(account).toBeTruthy()
    const balanceBefore = Number(account!.balance)

    const result = supplier.voidPayment('PAY-2026-1101', '银行退回，原付款账户信息有误')

    expect(result.ok).toBe(true)
    expect(supplier.outstandingOf(bill!)).toBe(1130)
    expect(supplier.paidOf('BILL-2026-1101')).toBe(0)
    const payment = supplier.payments.find(item => item.id === 'PAY-2026-1101')
    expect(payment?.status).toBe('voided')
    expect(payment?.reversal?.id).toBe('RV-2026-1101')
    expect(payment?.reversal?.bankTransactionId).toBe('bt-rev-PAY-2026-1101')
    const transaction = bank.transactions.find(item => item.id === 'bt-rev-PAY-2026-1101')
    expect(transaction?.direction).toBe('in')
    expect(transaction?.matched).toBe(true)
    expect(Number(account!.balance)).toBeCloseTo(balanceBefore + 600, 2)
    expect(result.message).toContain('未结 ¥1130.00')
  })

  it('拒绝空原因与重复作废', () => {
    const supplier = useSupplierTradeStore()
    const emptyReason = supplier.voidPayment('PAY-2026-1101', '   ')
    expect(emptyReason.ok).toBe(false)
    expect(emptyReason.message).toContain('请填写作废原因')

    expect(supplier.voidPayment('PAY-2026-1101', '银行退回').ok).toBe(true)
    const duplicate = supplier.voidPayment('PAY-2026-1101', '再次作废')
    expect(duplicate.ok).toBe(false)
    expect(duplicate.message).toContain('不能重复作废')
  })

  it('解除匹配后回到待匹配并可重新匹配', () => {
    const bank = useBankReconStore()
    const matched = bank.transactions.find(item => item.matched && item.bankAccountId === 'ba-2026-01')
    expect(matched).toBeTruthy()
    const pendingBefore = bank.pendingCountOf('ba-2026-01')

    const unmatch = bank.unmatch(matched!.id)
    expect(unmatch.ok).toBe(true)
    expect(bank.transactions.find(item => item.id === matched!.id)?.matched).toBe(false)
    expect(bank.pendingCountOf('ba-2026-01')).toBe(pendingBefore + 1)

    const rematch = bank.match(matched!.id, 'JE-AP-2026-1101')
    expect(rematch.ok).toBe(true)
    expect(bank.transactions.find(item => item.id === matched!.id)?.matchedJournalId).toBe('JE-AP-2026-1101')
    expect(bank.pendingCountOf('ba-2026-01')).toBe(pendingBefore)
  })

  it('只能按倒序撤销最近一次对账并可重新对账', () => {
    const bank = useBankReconStore()
    const account = bank.accounts.find(item => item.id === 'ba-2026-02')
    expect(account).toBeTruthy()
    for (const transaction of bank.transactionsFor(account!.id).filter(item => !item.matched)) {
      expect(bank.match(transaction.id, 'JE-AP-2026-1101').ok).toBe(true)
    }
    expect(bank.pendingCountOf(account!.id)).toBe(0)

    const first = bank.completeReconciliation(account!.id)
    expect(first.ok).toBe(true)
    expect(first.record?.sequence).toBe(1)
    const second = bank.completeReconciliation(account!.id)
    expect(second.ok).toBe(true)
    expect(second.record?.sequence).toBe(2)

    const undoOlder = bank.undoReconciliation(first.record!.id, '先尝试撤销旧记录')
    expect(undoOlder.ok).toBe(false)
    expect(undoOlder.message).toContain('最近一次')
    const emptyReason = bank.undoReconciliation(second.record!.id, ' ')
    expect(emptyReason.ok).toBe(false)
    expect(emptyReason.message).toContain('撤销原因')

    const undoLatest = bank.undoReconciliation(second.record!.id, '遗漏两笔手续费流水')
    expect(undoLatest.ok).toBe(true)
    expect(bank.latestCompletedOf(account!.id)?.id).toBe(first.record!.id)
    expect(bank.isReconciled(account!.id)).toBe(true)
    const secondRow = bank.recordsFor(account!.id).find(item => item.id === second.record!.id)
    expect(secondRow?.status).toBe('voided')
    expect(secondRow?.voidReason).toBe('遗漏两笔手续费流水')

    const again = bank.completeReconciliation(account!.id)
    expect(again.ok).toBe(true)
    expect(again.record?.sequence).toBe(3)
    expect(bank.latestCompletedOf(account!.id)?.id).toBe(again.record!.id)
  })
})

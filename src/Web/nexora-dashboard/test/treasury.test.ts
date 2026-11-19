import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useTreasuryStore } from '../app/stores/treasury'

describe('treasury store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('creates accounts, keeps one default and rejects duplicate account numbers', () => {
    const store = useTreasuryStore()
    expect(store.accounts).toHaveLength(5)
    expect(store.accounts.filter(account => account.isDefault)).toHaveLength(1)

    const duplicate = store.createAccount({
      kind: 'bank', name: '重复账户', accountNo: '6222021011086601', ledgerCode: '1002', isDefault: false
    })
    expect(duplicate.ok).toBe(false)
    expect(duplicate.message).toContain('已存在')

    const created = store.createAccount({
      kind: 'cash', name: '新设备用金', accountNo: 'CASH-TEST-01', ledgerCode: '1001', isDefault: true
    })
    expect(created.ok).toBe(true)
    expect(store.accounts.filter(account => account.isDefault)).toHaveLength(1)
    expect(store.accounts.find(account => account.isDefault)?.name).toBe('新设备用金')
  })

  it('posts a transfer as two opposite legs and blocks self approval', () => {
    const store = useTreasuryStore()
    const beforeSource = store.accountMap.get('ACC-B1')!.balance
    const beforeTarget = store.accountMap.get('ACC-B2')!.balance
    const created = store.createFlow({
      type: 'transfer', date: '2026-12-03', amount: 1000, counterparty: '内部划转', summary: '基本户转一般户',
      sourceAccountId: 'ACC-B1', targetAccountId: 'ACC-B2'
    }, '张明远')
    expect(created.ok).toBe(true)
    expect(created.ids).toHaveLength(2)

    const [outId, inId] = created.ids!
    expect(store.flowMap.get(outId!)?.direction).toBe('out')
    expect(store.flowMap.get(inId!)?.direction).toBe('in')
    expect(store.submitFlow(outId!, '张明远').ok).toBe(true)
    expect(store.submitFlow(inId!, '张明远').ok).toBe(true)
    const self = store.approveFlow(outId!, '张明远')
    expect(self.ok).toBe(false)
    expect(self.message).toContain('复核人不能是制单人')
    expect(store.approveFlow(outId!, '陈立').ok).toBe(true)
    expect(store.approveFlow(inId!, '陈立').ok).toBe(true)
    expect(store.accountMap.get('ACC-B1')!.balance).toBe(beforeSource - 1000)
    expect(store.accountMap.get('ACC-B2')!.balance).toBe(beforeTarget + 1000)
    expect(store.flowMap.get(outId!)?.transferGroupId).toBe(store.flowMap.get(inId!)?.transferGroupId)
  })

  it('imports statements once and matches them in partial and full steps', () => {
    const store = useTreasuryStore()
    const rows = [
      { date: '2026-12-01', summary: '收到货款', amount: 8600, direction: 'in' as const },
      { date: '2026-12-02', summary: '支付办公费', amount: 1200, direction: 'out' as const }
    ]
    const first = store.importStatements({ accountId: 'ACC-B1', fileName: '工商银行_2026-12.csv', rows, problemCount: 2 })
    expect(first.ok).toBe(true)
    expect(store.statementsForAccount('ACC-B1')).toHaveLength(5)
    const duplicate = store.importStatements({ accountId: 'ACC-B1', fileName: '工商银行_2026-12.csv', rows, problemCount: 0 })
    expect(duplicate.ok).toBe(false)
    expect(duplicate.message).toContain('已导入')

    const partial = store.matchStatement('STM-2601', { kind: 'flow', flowId: 'F-2601', amount: 5000 }, '张明远')
    expect(partial.ok).toBe(true)
    expect(store.statementMap.get('STM-2601')?.status).toBe('partial')
    const rest = store.matchStatement('STM-2601', { kind: 'flow', flowId: 'F-2601', amount: 7000 }, '张明远')
    expect(rest.ok).toBe(true)
    expect(store.statementMap.get('STM-2601')?.status).toBe('matched')
    const over = store.matchStatement('STM-2602', { kind: 'flow', flowId: 'F-2602', amount: 99999 }, '张明远')
    expect(over.ok).toBe(false)
    expect(over.message).toContain('超过该行剩余金额')
  })

  it('confirms and undoes a reconciliation with independent review and a reason', () => {
    const store = useTreasuryStore()
    const saved = store.saveReconciliation({ accountId: 'ACC-B3', cutoff: '2026-11-30', bankBalance: store.accountMap.get('ACC-B3')!.balance }, '张明远')
    expect(saved.ok).toBe(true)
    const draftId = saved.id!
    const self = store.confirmReconciliation(draftId, '张明远')
    expect(self.ok).toBe(false)
    expect(self.message).toContain('复核人不能是制单人')
    const confirmed = store.confirmReconciliation(draftId, '陈立')
    expect(confirmed.ok).toBe(true)
    expect(store.latestCompleted?.id).toBe(draftId)

    const noReason = store.undoReconciliation(draftId, '陈立', '')
    expect(noReason.ok).toBe(false)
    expect(noReason.message).toContain('撤销原因')
    const undone = store.undoReconciliation(draftId, '陈立', '发现未达账项遗漏')
    expect(undone.ok).toBe(true)
    expect(store.reconciliations.find(record => record.id === draftId)?.status).toBe('undone')
    expect(store.reconciliations.find(record => record.id === draftId)?.undoReason).toBe('发现未达账项遗漏')
  })
})

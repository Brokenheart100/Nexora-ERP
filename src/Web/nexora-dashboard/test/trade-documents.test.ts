import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useTradeDocumentsStore } from '~/stores/tradeDocuments'

describe('trade documents', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('供应商账单独立复核后过账，制单人不能自审', () => {
    const store = useTradeDocumentsStore()
    const rejected = store.reviewDocument('BILL-2026-1101', '张明远', 'approve')
    expect(rejected.ok).toBe(false)
    expect(rejected.message).toContain('复核人不能是制单人')
    expect(store.reviewDocument('BILL-2026-1101', '陈立', 'approve').ok).toBe(true)
    expect(store.documentOf('BILL-2026-1101')?.status).toBe('reviewed')
    expect(store.postDocument('BILL-2026-1101', '张明远').ok).toBe(false)
    expect(store.postDocument('BILL-2026-1101', '陈立').ok).toBe(true)
    expect(store.documentOf('BILL-2026-1101')?.status).toBe('posted')
  })

  it('草稿提交后进入待复核，已过账不能取消', () => {
    const store = useTradeDocumentsStore()
    expect(store.submitDocument('BILL-2026-1102', '陈立').ok).toBe(false)
    expect(store.submitDocument('BILL-2026-1102', '张明远').ok).toBe(true)
    expect(store.documentOf('BILL-2026-1102')?.status).toBe('submitted')
    expect(store.cancelDocument('BILL-2026-1102', '张明远', '客户取消').ok).toBe(true)
    expect(store.documentOf('BILL-2026-1102')?.status).toBe('cancelled')
    expect(store.cancelDocument('BILL-2026-1103', '张明远', '重复').ok).toBe(false)
  })

  it('取消必须填写原因且只有制单人可取消', () => {
    const store = useTradeDocumentsStore()
    expect(store.cancelDocument('RCPT-2026-0501', '张明远', '  ').ok).toBe(false)
    expect(store.cancelDocument('RCPT-2026-0501', '陈立', '越权').ok).toBe(false)
    expect(store.cancelDocument('RCPT-2026-0501', '张明远', '客户改汇其他账户').ok).toBe(true)
  })

  it('暂估确认前后金额口径分离，冲回恢复待处理', () => {
    const store = useTradeDocumentsStore()
    expect(store.provisionalPendingTotal).toBe(98400)
    expect(store.provisionalPostedTotal).toBe(52600)
    expect(store.confirmProvisional('PB-2026-001', '陈立').ok).toBe(true)
    expect(store.provisionalPendingTotal).toBe(0)
    expect(store.provisionalPostedTotal).toBe(151000)
    expect(store.reverseProvisional('PB-2026-001', '陈立').ok).toBe(true)
    expect(store.provisionalPendingTotal).toBe(98400)
    expect(store.provisionalPostedTotal).toBe(52600)
  })

  it('账单、收款与核销按类型分开', () => {
    const store = useTradeDocumentsStore()
    expect(store.documents.filter(row => row.kind === 'bill')).toHaveLength(3)
    expect(store.documents.filter(row => row.kind === 'receipt')).toHaveLength(2)
    expect(store.documents.filter(row => row.kind === 'allocation')).toHaveLength(2)
    expect(store.accountMappings.every(row => row.status === 'mapped')).toBe(true)
  })
})

import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useOpeningBalancesStore } from '../app/stores/openingBalances'

describe('opening balances store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('previews the balanced GL file and rejects the file with validation issues', () => {
    const store = useOpeningBalancesStore()
    const balanced = store.previewOpening('standard')
    expect(balanced.preview.debit).toBe(3406040)
    expect(balanced.preview.credit).toBe(3406040)
    expect(balanced.preview.rowCount).toBe(8)
    expect(balanced.preview.canImport).toBe(true)

    const issues = store.previewOpening('issues').preview
    expect(issues.canImport).toBe(false)
    expect(issues.debit - issues.credit).toBe(1200)
    expect(issues.issues).toHaveLength(3)
    expect(issues.issues.map(issue => issue.message).join(' ')).toContain('9999')
  })

  it('imports the GL opening once per workspace and links the journal', () => {
    const store = useOpeningBalancesStore()
    const imported = store.importOpening('standard', 'ws-hq', '张明远')
    expect(imported.ok).toBe(true)
    expect(imported.record?.id).toBe('OPEN-GL-2026-0001')
    expect(imported.record?.journalId).toBe('JE-OPEN-GL-2026-0001')

    const duplicate = store.importOpening('standard', 'ws-hq', '张明远')
    expect(duplicate.ok).toBe(false)
    expect(duplicate.message).toContain('已导入总账期初')
  })

  it('rejects self approval and requires a note when subledger differences exist', () => {
    const store = useOpeningBalancesStore()
    const submitted = store.submitBatch(store.subledgerPreview, 'ws-hq', 'u-1001', '张明远')
    expect(submitted.batch?.id).toBe('OB-2026-0002')
    expect(submitted.batch?.state).toBe('submitted')

    const selfReview = store.reviewBatch('OB-2026-0002', 'approve', 'u-1001', '张明远', '自行批准')
    expect(selfReview.ok).toBe(false)
    expect(selfReview.message).toContain('复核人不能是制单人')

    const missingNote = store.reviewBatch('OB-2026-0002', 'approve', 'u-1004', '陈立')
    expect(missingNote.ok).toBe(false)
    expect(missingNote.message).toContain('请填写复核说明')

    const approved = store.reviewBatch('OB-2026-0002', 'approve', 'u-1004', '陈立', '库存差异 2,000 元已盘点核对')
    expect(approved.ok).toBe(true)
    expect(approved.batch?.state).toBe('applying')

    const posted = store.postBatch('OB-2026-0002')
    expect(posted.ok).toBe(true)
    expect(posted.batch?.state).toBe('posted')
    expect(posted.batch?.result?.journalIds).toHaveLength(4)
    expect(posted.batch?.result?.passed).toBe(3)

    const result = posted.batch?.result
    expect(result?.records).toHaveLength(17)
    expect(result?.records.filter(record => record.kind === 'journal')).toHaveLength(4)
    expect(result?.records.filter(record => record.kind === 'stock')).toHaveLength(2)
    expect(result?.records.filter(record => record.kind === 'receivable')).toHaveLength(5)
    expect(result?.records.filter(record => record.kind === 'payable')).toHaveLength(4)
    expect(result?.records.filter(record => record.kind === 'bank')).toHaveLength(2)

    const stock = result?.records.find(record => record.kind === 'stock')
    expect(stock?.docNo).toBe('STK-OPEN-0002-0001')
    expect(stock?.sourceId).toBe('src-stock-east')
    expect(stock?.sourceLabel).toBe('华东中心仓')
    expect(stock?.sourceReference).toBe('第 1–12 行')
    expect(stock?.amount).toBe(486400)
    expect(stock?.at).toBe(result?.postedAt)
    expect(result?.records.filter(record => record.kind === 'journal').map(record => record.docNo)).toEqual(result?.journalIds)
  })

  it('requires a rejection reason and keeps the source rows on the batch', () => {
    const store = useOpeningBalancesStore()
    store.submitBatch(store.subledgerPreview, 'ws-hq', 'u-1001', '张明远')

    const missingReason = store.reviewBatch('OB-2026-0002', 'reject', 'u-1004', '陈立')
    expect(missingReason.ok).toBe(false)
    expect(missingReason.message).toContain('拒绝时必须填写原因')

    const rejected = store.reviewBatch('OB-2026-0002', 'reject', 'u-1004', '陈立', '库存子账数量与盘点表不一致')
    expect(rejected.ok).toBe(true)
    expect(rejected.batch?.state).toBe('rejected')
    expect(rejected.batch?.rejection).toContain('盘点表')
    expect(rejected.batch?.sources).toHaveLength(8)
  })

  it('lets only the maker cancel a submitted batch', () => {
    const store = useOpeningBalancesStore()
    store.submitBatch(store.subledgerPreview, 'ws-hq', 'u-1001', '张明远')

    const wrongActor = store.cancelBatch('OB-2026-0002', 'u-1004')
    expect(wrongActor.ok).toBe(false)
    expect(wrongActor.message).toContain('只有制单人')

    const cancelled = store.cancelBatch('OB-2026-0002', 'u-1001')
    expect(cancelled.ok).toBe(true)
    expect(cancelled.batch?.state).toBe('cancelled')
  })
})

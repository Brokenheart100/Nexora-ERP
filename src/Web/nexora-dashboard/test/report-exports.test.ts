import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useReportExportsStore } from '../app/stores/reportExports'

describe('report exports store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('seeds ready and failed exports for the current workspace', () => {
    const store = useReportExportsStore()
    expect(store.records.map(record => record.id)).toEqual(['EXP-2026-0001', 'EXP-2026-0002', 'EXP-2026-0003'])
    expect(store.readyCount).toBe(2)
    expect(store.failedCount).toBe(1)
    expect(store.records[1]?.failureReason).toContain('现金流量表')
  })

  it('queues an export for the selected period and completes it', () => {
    const store = useReportExportsStore()
    const queued = store.queueExport({ workspaceId: 'ws-hq', kind: 'trial-balance', period: '2026-11' })
    expect(queued.ok).toBe(true)
    expect(queued.record?.id).toBe('EXP-2026-0004')
    expect(queued.record?.status).toBe('queued')
    expect(queued.record?.snapshotId).toBe('snap-2026-11-live')

    const completed = store.completeExport('EXP-2026-0004')
    expect(completed.ok).toBe(true)
    expect(completed.record?.status).toBe('ready')
    expect(completed.record?.completedAt).toBeTruthy()
  })

  it('rebuilds a ready export from its original snapshot without changing the source', () => {
    const store = useReportExportsStore()
    const original = store.records.find(record => record.id === 'EXP-2026-0001')!
    const rebuilt = store.rebuildExport('EXP-2026-0001')
    expect(rebuilt.ok).toBe(true)
    expect(rebuilt.record?.id).toBe('EXP-2026-0004')
    expect(rebuilt.record?.rebuiltFrom).toBe('EXP-2026-0001')
    expect(rebuilt.record?.snapshotId).toBe(original.snapshotId)
    expect(rebuilt.record?.watermark).toBe(original.watermark)
    expect(rebuilt.record?.fileName).toContain('-rebuild.csv')
    expect(store.records.find(record => record.id === 'EXP-2026-0001')?.status).toBe('ready')
  })

  it('refuses to rebuild a queued export', () => {
    const store = useReportExportsStore()
    store.queueExport({ workspaceId: 'ws-hq', kind: 'cash-flow', period: '2026-11' })
    const rebuilt = store.rebuildExport('EXP-2026-0004')
    expect(rebuilt.ok).toBe(false)
    expect(rebuilt.message).toContain('只有已完成或失败')
  })
})

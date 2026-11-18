import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import type { ReportExportKind, ReportExportRecord } from '~/mocks'
import { reportExportSeeds } from '~/mocks'

function nowText() {
  const date = new Date()
  const pad = (value: number) => String(value).padStart(2, '0')
  return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()) + ' ' + pad(date.getHours()) + ':' + pad(date.getMinutes())
}

function nextExportId(records: ReportExportRecord[]) {
  const prefix = 'EXP-2026-'
  const max = records.reduce((value, record) => {
    const parsed = Number(record.id.slice(prefix.length))
    return Number.isFinite(parsed) ? Math.max(value, parsed) : value
  }, 0)
  return prefix + String(max + 1).padStart(4, '0')
}

type ReportExportResult
  = | { ok: true, message: string, record: ReportExportRecord }
    | { ok: false, message: string }

const rowCountByKind: Record<ReportExportKind, number> = {
  'trial-balance': 42,
  'income-statement': 18,
  'balance-sheet': 28,
  'cash-flow': 16
}

const fileSizeByKind: Record<ReportExportKind, number> = {
  'trial-balance': 3.2,
  'income-statement': 2.1,
  'balance-sheet': 2.6,
  'cash-flow': 1.8
}

export const useReportExportsStore = defineStore('report-exports', () => {
  const recordRows = ref<ReportExportRecord[]>(structuredClone(reportExportSeeds))

  const records = computed(() => recordRows.value)
  const readyCount = computed(() => recordRows.value.filter(record => record.status === 'ready').length)
  const failedCount = computed(() => recordRows.value.filter(record => record.status === 'failed').length)

  function queueExport(input: { workspaceId: string, kind: ReportExportKind, period: string }): ReportExportResult {
    const id = nextExportId(recordRows.value)
    const record: ReportExportRecord = {
      id,
      workspaceId: input.workspaceId,
      kind: input.kind,
      period: input.period,
      status: 'queued',
      requestedAt: nowText(),
      snapshotId: 'snap-' + input.period + '-live',
      watermark: 142,
      rowCount: rowCountByKind[input.kind],
      fileHash: 'live-' + id.toLowerCase() + '-a13f90d6',
      fileName: input.kind + '-' + input.period + '.csv',
      fileSizeKb: fileSizeByKind[input.kind],
      basis: 'ledger'
    }
    recordRows.value.unshift(record)
    return { ok: true, message: '导出任务已排队，期间 ' + input.period + ' 的账面快照已固定。', record }
  }

  function completeExport(recordId: string): ReportExportResult {
    const record = recordRows.value.find(row => row.id === recordId)
    if (!record) return { ok: false, message: '导出记录不存在。' }
    if (record.status === 'ready') return { ok: true, message: '导出文件已生成。', record }
    record.status = 'ready'
    record.completedAt = nowText()
    record.failureReason = undefined
    return { ok: true, message: '导出文件已生成，可下载。', record }
  }

  function failExport(recordId: string, reason: string): ReportExportResult {
    const record = recordRows.value.find(row => row.id === recordId)
    if (!record) return { ok: false, message: '导出记录不存在。' }
    record.status = 'failed'
    record.completedAt = nowText()
    record.failureReason = reason
    return { ok: true, message: '导出失败，失败原因已记录。', record }
  }

  function rebuildExport(recordId: string): ReportExportResult {
    const original = recordRows.value.find(row => row.id === recordId)
    if (!original) return { ok: false, message: '导出记录不存在。' }
    if (original.status !== 'ready' && original.status !== 'failed') {
      return { ok: false, message: '只有已完成或失败的导出可以按原快照重建。' }
    }
    const id = nextExportId(recordRows.value)
    const record: ReportExportRecord = {
      ...original,
      id,
      status: 'queued',
      requestedAt: nowText(),
      completedAt: undefined,
      rebuiltFrom: original.id,
      failureReason: undefined,
      fileHash: 'rebuild-' + id.toLowerCase() + '-' + original.snapshotId.slice(-4),
      fileName: original.fileName.replace('.csv', '-rebuild.csv')
    }
    recordRows.value.unshift(record)
    return { ok: true, message: '已按快照 ' + original.snapshotId + ' 重建，原记录保持不变。', record }
  }

  function reset() {
    recordRows.value = structuredClone(reportExportSeeds)
  }

  return { records, readyCount, failedCount, queueExport, completeExport, failExport, rebuildExport, reset }
})

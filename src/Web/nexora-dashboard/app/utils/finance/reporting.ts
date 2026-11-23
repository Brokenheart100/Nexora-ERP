import { z } from 'zod'
import type { ReportKind, ReportRange } from '#shared/types/reporting'

export const reportNames: Record<ReportKind, string> = {
  'trial-balance': '试算平衡表',
  'profit-and-loss': '利润表',
  'balance-sheet': '资产负债表',
  'cash-flow': '现金流量表',
  'equity-changes': '权益变动表'
}

export function currentReportRange(bookStartsOn: string): ReportRange {
  const today = new Date().toLocaleDateString('en-CA')
  const month = today.slice(0, 7) + '-01'
  return { from: month < bookStartsOn ? bookStartsOn : month, through: today < bookStartsOn ? bookStartsOn : today }
}

export function validReportRange(range: ReportRange, bookStartsOn: string) {
  return z.iso.date().safeParse(range.from).success && z.iso.date().safeParse(range.through).success
    && range.from >= bookStartsOn && range.through >= range.from && range.through.slice(0, 4) <= '9998'
}

export function bookmarkedReportWatermark(query: { snapshotWorkspace?: unknown, watermark?: unknown }, workspace: string) {
  if (query.snapshotWorkspace === workspace && typeof query.watermark === 'string' && /^\d{1,19}$/.test(query.watermark)) {
    return query.watermark
  }
}

export function saveReportBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

import { downloadCsv, exportFileName, toCsv, type CsvColumn } from '../utils/export'

export interface ExportPage<T> {
  rows: T[]
  hasMore: boolean
}

export interface ExportOptions<T> {
  name: string
  columns: CsvColumn<T>[]
  fetchPage: (page: number) => Promise<ExportPage<T>>
  maxPages?: number
}

/** 分页拉取列表后在前端生成 CSV；每页最多 50 行，默认最多 60 页。 */
export function useCsvExport() {
  const exporting = ref(false)
  const notice = ref('')
  const error = ref('')

  async function exportCsv<T>(options: ExportOptions<T>) {
    if (exporting.value) return
    exporting.value = true
    notice.value = ''
    error.value = ''
    try {
      const rows: T[] = []
      const maxPages = options.maxPages ?? 60
      for (let page = 1; page <= maxPages; page++) {
        const result = await options.fetchPage(page)
        rows.push(...result.rows)
        if (!result.hasMore || !result.rows.length) break
      }
      downloadCsv(exportFileName(options.name), toCsv(options.columns, rows))
      notice.value = `已导出 ${rows.length} 行数据。`
    } catch (failure) {
      const detail = (failure as { data?: { detail?: string } }).data?.detail
      error.value = detail || '导出未完成，请稍后重试。'
    } finally {
      exporting.value = false
    }
  }

  return { exporting, notice, error, exportCsv }
}

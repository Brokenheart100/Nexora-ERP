export interface CsvColumn<T> {
  header: string
  value: (row: T) => string | number | null | undefined
}

/** 单元格转义：双引号包裹，公式前缀加单引号，避免 CSV 注入。 */
export function csvText(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value)
  const guarded = /^[=+\-@\t\r\n]/.test(text) ? `'${text}` : text
  return `"${guarded.replaceAll('"', '""')}"`
}

/** 生成带 UTF-8 BOM 的 CSV 文本，表头取自列定义。 */
export function toCsv<T>(columns: CsvColumn<T>[], rows: T[]): string {
  const lines = [columns.map(column => csvText(column.header)).join(',')]
  for (const row of rows) lines.push(columns.map(column => csvText(column.value(row))).join(','))
  return `\uFEFF${lines.join('\r\n')}\r\n`
}

/** 导出文件名：<前缀>-yyyyMMdd-HHmm.csv，默认使用浏览器本地时间。 */
export function exportFileName(prefix: string, at = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${prefix}-${at.getFullYear()}${pad(at.getMonth() + 1)}${pad(at.getDate())}-${pad(at.getHours())}${pad(at.getMinutes())}.csv`
}

/** 触发浏览器下载；链接在点击后释放对象 URL。 */
export function downloadCsv(name: string, csv: string): void {
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** 打印指定区域：标记目标后调用打印，打印结束立即清理标记。 */
export function printSection(target: Element | null | undefined): boolean {
  if (!target) return false
  const root = document.documentElement
  const clear = () => {
    target.removeAttribute('data-print-target')
    root.removeAttribute('data-print-section')
  }
  target.setAttribute('data-print-target', '')
  root.setAttribute('data-print-section', '')
  window.addEventListener('afterprint', clear, { once: true })
  try {
    window.print()
    return true
  } catch {
    return false
  } finally {
    clear()
  }
}

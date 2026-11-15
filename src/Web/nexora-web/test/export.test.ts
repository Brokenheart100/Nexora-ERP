import { describe, expect, it } from 'vitest'
import { csvText, exportFileName, toCsv } from '../app/utils/export'

describe('csvText', () => {
  it('quotes text and doubles embedded quotes', () => {
    expect(csvText('华东客户')).toBe('"华东客户"')
    expect(csvText('他说"好"')).toBe('"他说""好"""')
    expect(csvText(null)).toBe('""')
    expect(csvText(undefined)).toBe('""')
    expect(csvText(12.5)).toBe('"12.5"')
  })

  it('guards spreadsheet formula prefixes', () => {
    expect(csvText('=1+1')).toBe(`"'=1+1"`)
    expect(csvText('+86')).toBe(`"'+86"`)
    expect(csvText('-5')).toBe(`"'-5"`)
    expect(csvText('@cmd')).toBe(`"'@cmd"`)
    expect(csvText(' a')).toBe('" a"')
  })
})

describe('toCsv', () => {
  it('writes BOM, header and rows with CRLF', () => {
    const columns = [
      { header: '单号', value: (row: { number: string; total: number }) => row.number },
      { header: '金额', value: (row: { number: string; total: number }) => row.total },
    ]
    const csv = toCsv(columns, [{ number: 'SO-1', total: 12.5 }])
    expect(csv.startsWith('\uFEFF')).toBe(true)
    expect(csv).toBe('\uFEFF"单号","金额"\r\n"SO-1","12.5"\r\n')
  })

  it('keeps an empty list with header only', () => {
    const csv = toCsv([{ header: '单号', value: () => '' }], [])
    expect(csv).toBe('\uFEFF"单号"\r\n')
  })
})

describe('exportFileName', () => {
  it('formats prefix and local timestamp', () => {
    expect(exportFileName('销售订单', new Date(2026, 10, 13, 9, 5))).toBe('销售订单-20261113-0905.csv')
  })
})

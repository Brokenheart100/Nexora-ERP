import { describe, expect, it } from 'vitest'
import { barWidth, delta, monthWindows, previousWindow, statementCheck, topPartners } from '../app/utils/dashboard'

describe('monthWindows', () => {
  it('splits the trailing months and clamps to the book start', () => {
    const windows = monthWindows('2026-06-15', '2026-11-13', 6)
    expect(windows.map(window => window.label)).toEqual([
      '2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11',
    ])
    expect(windows[0]).toEqual({ label: '2026-06', from: '2026-06-15', through: '2026-06-30' })
    expect(windows[5]).toEqual({ label: '2026-11', from: '2026-11-01', through: '2026-11-13' })
  })

  it('returns a single clamped window when the book starts today', () => {
    expect(monthWindows('2026-11-13', '2026-11-13')).toEqual([
      { label: '2026-11', from: '2026-11-13', through: '2026-11-13' },
    ])
  })
})

describe('previousWindow', () => {
  it('mirrors the current window directly before it', () => {
    expect(previousWindow('2026-01-01', { from: '2026-11-01', through: '2026-11-13' }))
      .toEqual({ from: '2026-10-19', through: '2026-10-31' })
  })

  it('returns null when the book starts after the previous window', () => {
    expect(previousWindow('2026-11-01', { from: '2026-11-01', through: '2026-11-13' })).toBeNull()
  })
})

describe('topPartners', () => {
  it('aggregates outstanding amounts per partner and keeps the largest', () => {
    const partners = topPartners([
      { partnerId: 'a', partnerName: '华东客户', outstanding: '120.00' },
      { partnerId: 'a', partnerName: '华东客户', outstanding: '30.00' },
      { partnerId: 'b', partnerName: '华南客户', outstanding: '200.00' },
      { partnerId: null, partnerName: null, outstanding: '10.00' },
    ], 2)
    expect(partners).toHaveLength(2)
    expect(partners[0]).toMatchObject({ key: 'b', name: '华南客户', count: 1, amount: 200 })
    expect(partners[1]).toMatchObject({ key: 'a', name: '华东客户', count: 2, amount: 150 })
  })
})

describe('delta', () => {
  it('reports the difference against the previous period', () => {
    expect(delta('150.00', '100.00')).toEqual({ previous: 100, difference: 50 })
    expect(delta('150.00', null)).toEqual({ previous: null, difference: null })
  })
})

describe('barWidth', () => {
  it('scales bars and keeps small non-zero values visible', () => {
    expect(barWidth(0, 100)).toBe('0%')
    expect(barWidth(50, 100)).toBe('50.0%')
    expect(barWidth(1, 10_000)).toBe('4.0%')
    expect(barWidth(200, 100)).toBe('100.0%')
  })
})

describe('statementCheck', () => {
  it('accepts matching totals and rejects drift', () => {
    const overview = { income: '100.00', expense: '60.00', profit: '40.00' }
    expect(statementCheck(overview, [
      { key: 'income', amount: '100.00' },
      { key: 'expense', amount: '60.00' },
      { key: 'profit', amount: '40.00' },
    ])).toBe(true)
    expect(statementCheck(overview, [
      { key: 'income', amount: '100.01' },
      { key: 'expense', amount: '60.00' },
      { key: 'profit', amount: '40.00' },
    ])).toBe(false)
  })
})

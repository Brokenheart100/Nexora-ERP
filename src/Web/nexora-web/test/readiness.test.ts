import { describe, expect, it } from 'vitest'
import {
  checkLabel,
  costKindLabel,
  openingLabel,
  readinessSummary,
  severityLabel,
} from '../app/utils/readiness'

describe('readiness labels', () => {
  it('maps known check codes and falls back to the code', () => {
    expect(checkLabel('costs.pending_accrual')).toBe('库存成本未入账')
    expect(checkLabel('documents.posted_without_journal')).toBe('单据已过账但缺少分录')
    expect(checkLabel('unknown.code')).toBe('unknown.code')
  })

  it('maps severities with a raw fallback', () => {
    expect(severityLabel('fail')).toBe('需处理')
    expect(severityLabel('warn')).toBe('待完善')
    expect(severityLabel('pass')).toBe('通过')
    expect(severityLabel('other')).toBe('other')
  })

  it('maps opening and cost kinds', () => {
    expect(openingLabel('pending')).toBe('待过账')
    expect(openingLabel('missing')).toBe('未录入')
    expect(costKindLabel('shipment')).toBe('销售出库')
    expect(costKindLabel('stock')).toBe('库存调整')
  })

  it('summarizes readiness with blocking counts', () => {
    expect(readinessSummary(true, 0, 0)).toContain('就绪')
    expect(readinessSummary(false, 2, 3)).toContain('已过账单据缺少分录 2 项')
    expect(readinessSummary(false, 2, 3)).toContain('库存成本未入账 3 项')
    expect(readinessSummary(false, 0, 0)).toContain('请先处理检查项')
  })
})

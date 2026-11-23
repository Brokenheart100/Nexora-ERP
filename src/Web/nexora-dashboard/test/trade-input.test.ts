import { describe, expect, it } from 'vitest'
import { billTerms, paymentTerms } from '../shared/utils/trade-documents'
import { taxSnapshotSchema } from '../shared/types/tax'
import { roundDecimal } from '../shared/utils/decimal'

const supplierId = '11111111-1111-4111-8111-111111111111'
const common = { on: '2026-01-04', number: 'BILL-001', memo: 'Supplier bill', partnerId: supplierId, dueOn: '2026-01-31', currency: 'CNY', minorUnits: 2, groupCode: 'VAT13' }
const line = (index: number, quantity: string, net: string, tax: string) => ({ receiptId: `22222222-2222-4222-8222-${String(index).padStart(12, '0')}`, quantity, unitPrice: '10',
  assessment: { id: `33333333-3333-4333-8333-${String(index).padStart(12, '0')}`, on: common.on, currency: 'CNY', unitPrice: '10', quantity, group: { code: 'VAT13' },
    references: [{ kind: 'partner', resourceId: supplierId }], amounts: { net, tax, total: String(index) } } })

describe('trade submission contracts', () => {
  it('sends bill kind as the numeric enum and nets separately from assessed taxes', () => {
    const terms = billTerms(common, [line(1, '40', '400', '52'), line(2, '60', '600', '78')])
    expect(terms.kind).toBe(1)
    expect(terms.amount).toBe('1000')
    expect(terms.quantity).toBe('100')
    expect(terms.billReceipts.map(item => item.net)).toEqual(['400', '600'])
    expect(terms.billReceipts.every(item => !!item.taxAssessmentId)).toBe(true)
  })
  it('rejects an assessment after quantity or supplier changes', () => {
    expect(() => billTerms(common, [{ ...line(1, '40', '400', '52'), quantity: '41' }])).toThrow()
    expect(() => billTerms({ ...common, partnerId: 'other' }, [line(1, '40', '400', '52')])).toThrow()
  })
  it('keeps an unposted bill or an overpayment out of the payment request', () => {
    const bill = { id: 'bill', state: 'posted', outstanding: '1130.00', terms: { kind: 1, partnerId: supplierId } }
    expect(paymentTerms({ on: '2026-01-05', number: 'PAY-001', memo: 'Partial payment', bankId: 'bank', amount: '600' }, bill).amount).toBe('600')
    expect(() => paymentTerms({ on: '2026-01-05', number: 'PAY-001', memo: 'Too much', bankId: 'bank', amount: '1130.01' }, bill)).toThrow()
    expect(() => paymentTerms({ on: '2026-01-05', number: 'PAY-001', memo: 'Pending bill', bankId: 'bank', amount: '600' }, { ...bill, state: 'submitted' })).toThrow()
  })
  it('accepts the Finance TaxAmounts total contract and rejects a missing total', () => {
    const snapshot = { ...line(1, '40', '400', '52').assessment, minorUnits: 2, policy: 'tax-v1', discount: '0', includesTax: false,
      group: { code: 'VAT13', name: 'VAT13', version: 1, rateCodes: ['VAT13'] },
      references: [{ kind: 'partner', resourceId: supplierId, version: 1, classificationVersion: null }], amounts: { net: '400', tax: '52', total: '452' } }
    expect(taxSnapshotSchema.parse(snapshot).amounts.total).toBe('452')
    expect(taxSnapshotSchema.safeParse({ ...snapshot, amounts: { net: '400', tax: '52', gross: '452' } }).success).toBe(false)
  })
  it('rounds currency values with exact decimal half-away-from-zero semantics', () => {
    expect(roundDecimal('0.005', 2)).toBe('0.01')
    expect(roundDecimal('-0.005', 2)).toBe('-0.01')
    expect(roundDecimal('9007199254740993.995', 2)).toBe('9007199254740994')
  })
})

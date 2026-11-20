import { describe, expect, it } from 'vitest'
import { mappingCandidates, tradeMappingFields, tradeMappingSchema, receivableMappingSchema } from '../app/utils/api/account-mappings'

describe('transaction account mappings', () => {
  it('offers active matching accounts and excludes bank control accounts', () => {
    const accounts = [
      { id: 'inventory', code: 'INV', name: 'Inventory', category: 'asset', purpose: 'control', isArchived: false, isUsed: true, parentCode: null, version: 1 },
      { id: 'bank', code: 'BANK', name: 'Bank', category: 'asset', purpose: 'control', isArchived: false, isUsed: true, parentCode: null, version: 1 },
      { id: 'old', code: 'OLD', name: 'Old', category: 'asset', purpose: 'control', isArchived: true, isUsed: false, parentCode: null, version: 1 },
      { id: 'expense', code: 'EXP', name: 'Expense', category: 'expense', purpose: 'posting', isArchived: false, isUsed: false, parentCode: null, version: 1 }
    ]
    expect(mappingCandidates(accounts, tradeMappingFields[0]!, ['bank']).map(account => account.id)).toEqual(['inventory'])
  })

  it('keeps trade and receivable contracts distinct and rejects duplicate posting functions', () => {
    const id = (index: number) => `11111111-1111-4111-8111-${String(index).padStart(12, '0')}`
    const trade = { inventoryAccountId: id(1), accrualAccountId: id(2), payableAccountId: id(3), inputTaxAccountId: id(4), varianceAccountId: id(5), donationIncomeAccountId: id(6), supplierRecoveryAccountId: '' }
    expect(tradeMappingSchema.safeParse(trade).success).toBe(true)
    expect(tradeMappingSchema.safeParse({ ...trade, payableAccountId: trade.accrualAccountId }).success).toBe(false)
    expect(receivableMappingSchema.safeParse(trade).success).toBe(false)
    expect(receivableMappingSchema.safeParse({ receivableAccountId: id(1), advanceAccountId: id(2), revenueAccountId: id(3), outputTaxAccountId: id(4), costOfGoodsAccountId: id(5) }).success).toBe(true)
  })
})

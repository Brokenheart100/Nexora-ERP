import { z } from 'zod'
import { receivableAccountsSchema, tradeAccountsSchema, type WireChart } from '#shared/types/prerequisites'

export interface MappingField { key: string, label: string, category: string, purpose: string, optional?: boolean }
export const tradeMappingFields: MappingField[] = [
  { key: 'inventoryAccountId', label: '库存资产科目', category: 'asset', purpose: 'control' },
  { key: 'accrualAccountId', label: '暂估负债科目', category: 'liability', purpose: 'control' },
  { key: 'payableAccountId', label: '应付账款科目', category: 'liability', purpose: 'control' },
  { key: 'inputTaxAccountId', label: '进项税科目', category: 'asset', purpose: 'posting' },
  { key: 'varianceAccountId', label: '采购价差科目', category: 'expense', purpose: 'posting' },
  { key: 'donationIncomeAccountId', label: '捐赠收入科目', category: 'income', purpose: 'posting' },
  { key: 'supplierRecoveryAccountId', label: '供应商追偿科目', category: 'asset', purpose: 'control', optional: true }
]
export const receivableMappingFields: MappingField[] = [
  { key: 'receivableAccountId', label: '应收账款科目', category: 'asset', purpose: 'control' },
  { key: 'advanceAccountId', label: '客户预收科目', category: 'liability', purpose: 'control' },
  { key: 'revenueAccountId', label: '销售收入科目', category: 'income', purpose: 'posting' },
  { key: 'outputTaxAccountId', label: '销项税科目', category: 'liability', purpose: 'control' },
  { key: 'costOfGoodsAccountId', label: '销售成本科目', category: 'expense', purpose: 'posting' }
]
function distinct(value: Record<string, string | null | undefined>, context: z.RefinementCtx) {
  const seen = new Set<string>()
  for (const [key, id] of Object.entries(value)) {
    if (!id) continue
    if (seen.has(id)) context.addIssue({ code: 'custom', path: [key], message: '同一映射的各项用途必须选择不同科目。' })
    seen.add(id)
  }
}
export const tradeMappingSchema = tradeAccountsSchema.extend({ supplierRecoveryAccountId: z.union([z.uuid(), z.literal('')]).transform(value => value || null) }).superRefine(distinct)
export const receivableMappingSchema = receivableAccountsSchema.superRefine(distinct)
export function mappingCandidates(accounts: WireChart['accounts'], field: MappingField, bankAccountIds: string[]) {
  return accounts.filter(account => !account.isArchived && account.category === field.category && account.purpose === field.purpose && !bankAccountIds.includes(account.id))
}

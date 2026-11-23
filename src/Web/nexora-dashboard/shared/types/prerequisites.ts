import { z } from 'zod'
import { revision } from './wire'
import type { TaxSetup } from './tax'

export const warehouseSchema = z.object({ id: z.uuid(), code: z.string(), name: z.string(), receiverId: z.uuid().nullable(), version: revision,
  canReceive: z.boolean(), canApproveReturns: z.boolean(), canApproveSalesReturns: z.boolean(), canReadStock: z.boolean() })
export const warehousesSchema = z.object({ canManage: z.boolean(), warehouses: z.array(warehouseSchema) })
export const bookSchema = z.object({ isPersonal: z.boolean(), canInitialize: z.boolean(),
  settings: z.object({ baseCurrency: z.string(), minorUnits: z.number(), startsOn: z.string(), fiscalYearStartMonth: z.number(), template: z.string() }).nullable(),
  accounts: z.array(z.object({ id: z.uuid(), code: z.string(), name: z.string(), category: z.string() })) })
export const chartAccountSchema = z.object({ id: z.uuid(), code: z.string(), name: z.string(), category: z.string(), parentCode: z.string().nullable(), purpose: z.string(), isArchived: z.boolean(), isUsed: z.boolean(), version: revision })
export const chartSchema = z.object({ revision, canManage: z.boolean(), canImport: z.boolean(), canExport: z.boolean(), accounts: z.array(chartAccountSchema) })
export const tradeAccountsSchema = z.object({ inventoryAccountId: z.uuid(), accrualAccountId: z.uuid(), payableAccountId: z.uuid(), inputTaxAccountId: z.uuid(), varianceAccountId: z.uuid(), donationIncomeAccountId: z.uuid(), supplierRecoveryAccountId: z.uuid().nullable().optional() })
export const receivableAccountsSchema = z.object({ receivableAccountId: z.uuid(), advanceAccountId: z.uuid(), revenueAccountId: z.uuid(), outputTaxAccountId: z.uuid(), costOfGoodsAccountId: z.uuid() })
export const bankSchema = z.object({ id: z.uuid(), code: z.string(), name: z.string(), kind: z.string(), accountId: z.uuid(), isDefault: z.boolean(), balance: z.string(), version: revision })
export const tradeSchema = z.object({ currency: z.string(), minorUnits: z.number(), canConfigure: z.boolean(), canSubmit: z.boolean(), canApprove: z.boolean(),
  setup: tradeAccountsSchema.extend({ version: revision }).nullable(), banks: z.array(bankSchema) })
export const receivableSchema = z.object({ accounts: receivableAccountsSchema.nullable(), canConfigure: z.boolean(), canDraft: z.boolean(), canPost: z.boolean(), currency: z.string(), fiscalNumbering: z.boolean() })
export const ledgerSchema = z.object({ currency: z.string(), minorUnits: z.number(), startsOn: z.string(), canDraft: z.boolean(), canPost: z.boolean(), canReverse: z.boolean(), canManagePeriods: z.boolean(),
  canConfigurePartnership: z.boolean().optional(),
  periods: z.array(z.object({ month: z.string(), state: z.string(), version: revision, closingWatermark: revision.nullable() })) })
export type WireWarehouse = z.infer<typeof warehouseSchema>
export type WireWarehouses = z.infer<typeof warehousesSchema>
export type WireBook = z.infer<typeof bookSchema>
export type WireChart = z.infer<typeof chartSchema>
export type WireTrade = z.infer<typeof tradeSchema>
export type WireReceivables = z.infer<typeof receivableSchema>
export type WireLedger = z.infer<typeof ledgerSchema>
export type WireTax = TaxSetup
export type WireBank = z.infer<typeof bankSchema>
export type TradeAccounts = z.infer<typeof tradeAccountsSchema>
export type ReceivableAccounts = z.infer<typeof receivableAccountsSchema>
export type Probe<T> = { state: 'ready', data: T } | { state: 'missing' | 'denied' | 'unavailable', message: string }
export interface FinancePrerequisites {
  book: Probe<WireBook>
  chart: Probe<WireChart>
  ledger: Probe<WireLedger>
  trade: Probe<WireTrade>
  receivables: Probe<WireReceivables>
  banks: Probe<WireBank[]>
  tax: Probe<WireTax>
}

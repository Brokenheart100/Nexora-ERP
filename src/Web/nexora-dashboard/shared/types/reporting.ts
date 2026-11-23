import { z } from 'zod'
import { revision } from './wire'

const date = z.iso.date()
const money = z.string().regex(/^-?\d+(?:\.\d+)?$/)
const currency = { currency: z.string(), minorUnits: z.number().int() }
const period = z.object({ from: date, through: date })
export const reportKindSchema = z.enum(['trial-balance', 'profit-and-loss', 'balance-sheet', 'cash-flow', 'equity-changes'])
const basis = z.enum(['accrual', 'cash'])
const comparison = { previous: money.nullish(), difference: money.nullish() }
const statementRow = z.object({
  key: z.string(), code: z.string(), name: z.string(), section: z.string(), amount: money,
  opening: money.nullish(), debit: money.nullish(), credit: money.nullish()
})
const equityPartner = z.object({
  code: z.string(), name: z.string(), share: money, opening: money,
  contributions: money, drawings: money, profitShare: money, closing: money
})
export const financialReportSchema = z.object({
  ...currency, kind: reportKindSchema, basis, period, watermark: revision, previousPeriod: period.nullish(),
  lines: z.array(z.object({ row: statementRow, ...comparison })),
  totals: z.array(z.object({ key: z.string(), amount: money, ...comparison })),
  partners: z.array(equityPartner).nullish()
})
export const reportDrillSchema = z.object({
  period, watermark: revision, hasMore: z.boolean(),
  postings: z.array(z.object({
    journalId: z.uuid(), postingNumber: revision, on: date, sourceNumber: z.string(), memo: z.string(),
    accountId: z.uuid(), code: z.string(), name: z.string(), debit: money, credit: money, reportAmount: money.nullish()
  }))
})
export const reportExportSchema = z.object({
  id: z.uuid(), kind: reportKindSchema, watermark: revision, requestedAtUtc: z.string(), completedAtUtc: z.string().nullable()
})
export const financeOverviewSchema = z.object({
  ...currency, period, watermark: revision, income: money, expense: money, profit: money, cash: money, receivable: money, payable: money
})
export const workspaceProjectionSchema = z.object({
  workspaceId: z.uuid(), tenantId: z.uuid(), name: z.string(), countryCode: z.string(), baseCurrency: z.string(),
  version: revision, lastEventId: z.uuid(), projectedAtUtc: z.string()
})

export type ReportKind = z.infer<typeof reportKindSchema>
export type FinancialReport = z.infer<typeof financialReportSchema>
export type FinanceOverview = z.infer<typeof financeOverviewSchema>
export type ReportExport = z.infer<typeof reportExportSchema>
export type AgingKind = 'receivables' | 'payables'
export type ReportRange = z.infer<typeof period>
export type ReportBasis = z.infer<typeof basis>
export interface ReportOptions extends ReportRange { compare: boolean, basis: ReportBasis }
export type ReportRevision = z.infer<typeof revision>

import { z } from 'zod'
import { revision } from './wire'
import { tradeJournalSchema } from './trade'
import { ledgerSchema } from './prerequisites'

const id = z.uuid()
const date = z.iso.date()
export const ledgerDecimal = z.string().regex(/^-?\d+(?:\.\d+)?$/)
const issue = z.object({ row: revision.nullish(), message: z.string(), code: z.string().nullish() })
const versioned = z.object({ id, version: revision })

export const chartPreviewSchema = z.object({
  previewId: id.nullish(), revision, fileHash: z.string(), errors: z.array(issue),
  changes: z.array(z.object({ row: revision.nullish(), code: z.string(), name: z.string(), action: z.string() }))
})
export const chartImportStatusSchema = z.object({ id, state: z.string(), expiresAtUtc: z.string(), revision, committedRevision: revision.nullish() })
export const chartChangeSchema = z.object({ revision })

export const journalSummarySchema = tradeJournalSchema.shape.journal.extend({
  reversesId: id.nullish(), importProvider: z.string().nullish(), externalId: z.string().nullish()
})
export const ledgerJournalSchema = tradeJournalSchema.extend({
  journal: journalSummarySchema, isMaker: z.boolean(), cashActivity: z.string().nullish()
})
export const trialBalanceSchema = z.object({
  through: date, currency: z.string(), debit: ledgerDecimal, credit: ledgerDecimal,
  accounts: z.array(tradeJournalSchema.shape.lines.element.extend({ balance: ledgerDecimal }))
})
export const journalLinkSchema = versioned.extend({
  fromJournalId: id, fromSourceNumber: z.string(), fromOn: date, toJournalId: id, toSourceNumber: z.string(),
  toOn: date, kind: z.string(), memo: z.string()
})
export const journalScanSchema = z.object({
  scannedAtUtc: z.string(), linkCount: z.number(), journalCount: z.number(),
  issues: z.array(z.object({ code: z.string(), linkId: id.nullish(), journalId: id.nullish(), message: z.string() }))
})

export const openingPreviewSchema = z.object({
  chartRevision: revision, fileHash: z.string(), currency: z.string(), debit: ledgerDecimal, credit: ledgerDecimal,
  errors: z.array(issue), rows: z.array(tradeJournalSchema.shape.lines.element.extend({ row: revision }))
})
const openingRowSchema = z.object({
  id, kind: z.union([z.number(), z.string()]), reference: z.string(), resourceId: id, name: z.string(), quantity: ledgerDecimal,
  amount: ledgerDecimal, dueOn: date.nullish(), accountId: id, warehouseId: id.nullish()
})
export const subledgerPreviewSchema = z.object({
  fileHash: z.string(), chartRevision: revision, on: date, currency: z.string(), rows: z.array(openingRowSchema), errors: z.array(issue)
})
export const subledgerBatchSchema = versioned.extend({
  state: z.string(), on: date, currency: z.string(), fileHash: z.string(), equityAccountId: id, rows: z.array(openingRowSchema),
  isMaker: z.boolean(), rejection: z.string().nullish(),
  postings: z.array(z.object({ rowId: id, journalId: id.nullish(), subledgerId: id })),
  checks: z.array(z.object({ rowId: id, accountId: id, imported: ledgerDecimal, subledger: ledgerDecimal, ledger: ledgerDecimal, matched: z.boolean() }))
})

export const readinessSchema = z.object({
  ready: z.boolean(), book: z.object({ exists: z.boolean(), currency: z.string(), startsOn: date.nullish(), opening: z.string(), lastPostingNumber: revision }),
  checks: z.array(z.object({ code: z.string(), severity: z.string(), count: z.number(), message: z.string() })),
  missingDocumentCount: z.number(), pendingCostCount: z.number(),
  missingDocuments: z.array(z.object({ id, kind: z.string(), number: z.string(), on: date, amount: ledgerDecimal })),
  pendingCosts: z.array(z.object({ id, on: date, kind: z.string(), amount: ledgerDecimal, reason: z.string() }))
})
export const backfillSchema = z.object({
  posted: z.array(z.object({ id, on: date, amount: ledgerDecimal, journalId: id.nullish() })),
  blocked: z.array(z.object({ id, on: date, amount: ledgerDecimal, reason: z.string() })),
  replayed: z.boolean(), readiness: readinessSchema
})
export const periodDetailSchema = z.object({
  period: ledgerSchema.shape.periods.element,
  check: z.object({ watermark: revision, postedCount: z.number(), pendingCount: z.number(), debit: ledgerDecimal, credit: ledgerDecimal }),
  history: z.array(z.object({ id, version: revision, state: z.union([z.number(), z.string()]), watermark: revision.nullish(), reason: z.string(), occurredAtUtc: z.string() }))
})
export const periodChangeSchema = z.object({ month: date, version: revision })
const fiscalLineSchema = z.object({ accountId: id, code: z.string(), name: z.string(), balance: ledgerDecimal })
export const fiscalYearPreviewSchema = z.object({
  period: z.object({ from: date, through: date }), equityAccountId: id, netProfit: ledgerDecimal, lines: z.array(fiscalLineSchema),
  openMonths: z.array(date), pendingDocuments: z.number().optional(),
  partnerAllocations: z.array(z.object({ code: z.string(), name: z.string(), share: ledgerDecimal, capital: fiscalLineSchema, drawings: fiscalLineSchema })).nullish()
})
export const fiscalYearSchema = versioned.extend({
  state: z.string(), report: fiscalYearPreviewSchema, closingJournals: z.array(id), reopeningJournals: z.array(id), reopenReason: z.string().nullish()
})
export const partnerCapitalSchema = z.object({
  code: z.string(), name: z.string(), capitalAccountId: id, drawingsAccountId: id, share: ledgerDecimal
})
export const partnershipSchema = z.object({ year: z.number(), version: revision, partners: z.array(partnerCapitalSchema) })

export type ChartPreview = z.infer<typeof chartPreviewSchema>
export type LedgerJournal = z.infer<typeof ledgerJournalSchema>
export type JournalSummary = z.infer<typeof journalSummarySchema>
export type OpeningBatch = z.infer<typeof subledgerBatchSchema>

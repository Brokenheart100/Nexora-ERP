import { z } from 'zod'
import { revision } from './wire'

const issue = z.object({ row: z.number().int(), message: z.string() })
const entry = z.object({ row: z.number().int(), externalId: z.string(), on: z.string(), amount: z.string(), description: z.string() })
export const bankCsvPreviewSchema = z.object({ previewId: z.uuid().nullable(), fileHash: z.string(),
  rows: z.array(z.object({ entry, duplicate: z.boolean() })), errors: z.array(issue), skipped: z.array(issue).nullish() })
export const bankImportSchema = z.object({ id: z.uuid(), bankId: z.uuid(), state: z.enum(['ready', 'committed', 'expired']),
  expiresAtUtc: z.string(), committedCount: z.number().int().nullable() })
export const bankImportResultSchema = z.object({ id: z.uuid(), count: z.number().int() })
export const statementLineSchema = entry.extend({ id: z.uuid(), bankId: z.uuid(), batchId: z.uuid(),
  matched: z.string(), version: revision, excluded: z.boolean() })
export const statementMatchSchema = z.object({ id: z.uuid(), statementLineId: z.uuid(), movementId: z.uuid(), referenceId: z.uuid(), amount: z.string(), reversed: z.boolean() })

const outstandingItem = z.object({ id: z.uuid(), on: z.string(), reference: z.string(), amount: z.string(), journalId: z.uuid().nullable() })
export const reconciliationReportSchema = z.object({ through: z.string(), statementBalance: z.string(), bookBalance: z.string(),
  outstandingBooks: z.string(), outstandingStatement: z.string(), adjustedStatement: z.string(), difference: z.string(), ledgerDifference: z.string(),
  books: z.array(outstandingItem), statement: z.array(outstandingItem), matches: z.array(z.uuid()) })
export const reconciliationSchema = z.object({ id: z.uuid(), bankId: z.uuid(), version: revision,
  state: z.enum(['pending', 'completed', 'undone', 'cancelled']), report: reconciliationReportSchema, undoReason: z.string().nullable() })

export const donationReceiptSchema = z.object({ number: z.string(), donationNumber: z.string(), on: z.string(), currency: z.string(),
  minorUnits: z.number().int(), amount: z.string(), method: z.string(), donor: z.string(), recipient: z.string().nullable(),
  journalId: z.uuid(), reversedById: z.uuid().nullable() })
export const fiscalTicketSchema = z.object({ id: z.uuid(), donationId: z.uuid(), code: z.string(), number: z.string(), issuedOn: z.string(), linkedAtUtc: z.string() })
export const receiptDispatchSchema = z.object({ id: z.uuid(), donationId: z.uuid(), recipient: z.string(),
  state: z.enum(['queued', 'sending', 'sent', 'failed', 'unknown', 'abandoned']), attempt: z.number().int(), version: revision,
  previousId: z.uuid().nullable(), resentAsId: z.uuid().nullable(), updatedAtUtc: z.string(), detail: z.string().nullable() })
export const financeCapabilitiesSchema = z.object({ invoiceMail: z.string(), workspaceMailSender: z.boolean(), statutoryDonationReceipt: z.boolean() })

export type BankCsvMapping = { externalId: string, date: string, amount: string, description: string }
export type BankCsvPreview = z.infer<typeof bankCsvPreviewSchema>
export type StatementLine = z.infer<typeof statementLineSchema>
export type Reconciliation = z.infer<typeof reconciliationSchema>
export type ReconciliationReport = z.infer<typeof reconciliationReportSchema>
export type ReceiptDispatch = z.infer<typeof receiptDispatchSchema>

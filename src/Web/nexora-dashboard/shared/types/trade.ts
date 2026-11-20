import { z } from 'zod'
import { revision } from './wire'
import { decimalInput, quantityInput } from './purchasing'

const nullableId = z.uuid().nullish()
export const tradeTermsSchema = z.object({ kind: z.number().int(), on: z.string(), number: z.string(), memo: z.string(), amount: z.string(), bankId: nullableId, otherBankId: nullableId,
  counterAccountId: nullableId, sourceId: nullableId, partnerId: nullableId, quantity: z.string(), taxAssessmentId: nullableId, statementLineId: nullableId, method: z.string().nullish(), dueOn: z.string().nullish(),
  billReceipts: z.array(z.object({ receiptId: z.uuid(), quantity: z.string(), net: z.string(), taxAssessmentId: nullableId })).nullish() })
export const billMatchSchema = z.object({ id: z.uuid(), receiptId: z.uuid(), quantity: z.string(), net: z.string(), tax: z.string(), variance: z.string(), creditedQuantity: z.string(), creditedNet: z.string(), creditedTax: z.string() })
export const tradeDocumentSchema = z.object({ id: z.uuid(), terms: tradeTermsSchema, state: z.string(), version: revision, journalId: nullableId, reversedById: nullableId,
  total: z.string(), outstanding: z.string(), recoverable: z.string(), isMaker: z.boolean(), billMatches: z.array(billMatchSchema).nullable() })
export const receiptFactSchema = z.object({ id: z.uuid(), tenantId: z.uuid(), workspaceId: z.uuid(), warehouseId: z.uuid(), itemId: z.uuid(), orderId: z.uuid(), lineId: z.uuid(), permitId: z.uuid(), supplierId: z.uuid(),
  sequence: revision, on: z.string(), quantity: z.string(), cost: z.string(), currency: z.string(), reversesId: nullableId, adjustmentForBillId: nullableId })
export const accrualSchema = z.object({ fact: receiptFactSchema, posted: z.boolean(), pendingReason: z.string().nullable(), journalId: nullableId, matchedQuantity: z.string(), matchedCost: z.string() })
export const taxSnapshotSchema = z.object({ id: z.uuid(), on: z.string(), currency: z.string(), minorUnits: z.number(), policy: z.string(), group: z.object({ code: z.string(), name: z.string(), version: revision, rateCodes: z.array(z.string()) }),
  references: z.array(z.object({ kind: z.string(), resourceId: z.uuid(), version: revision, classificationVersion: revision.nullable() })), unitPrice: z.string(), quantity: z.string(), discount: z.string(), includesTax: z.boolean(),
  amounts: z.object({ net: z.string(), tax: z.string(), total: z.string() }) })
export const bankMovementSchema = z.object({ id: z.uuid(), bankId: z.uuid(), documentId: z.uuid(), journalId: z.uuid(), on: z.string(), amount: z.string(), matched: z.string(), voided: z.boolean(), reversesId: nullableId })
export const partnerLedgerSchema = z.object({ kind: z.string(), partnerId: z.uuid(), currency: z.string(), minorUnits: z.number(), from: z.string(), through: z.string(), watermark: revision,
  open: z.object({ opening: z.string(), increases: z.string(), decreases: z.string(), closing: z.string() }), funds: z.object({ opening: z.string(), increases: z.string(), decreases: z.string(), closing: z.string() }), hasMore: z.boolean(),
  items: z.array(z.object({ id: z.uuid(), kind: z.string(), number: z.string(), on: z.string(), journalId: z.uuid(), postingNumber: revision, relatedDocumentId: nullableId, openDelta: z.string(), openBalance: z.string(), fundsDelta: z.string(), fundsBalance: z.string() })) })
export const agingSchema = z.object({ kind: z.string(), currency: z.string(), minorUnits: z.number(), through: z.string(), watermark: revision, total: z.string(), buckets: z.array(z.object({ key: z.string(), count: z.number(), amount: z.string() })),
  items: z.array(z.object({ id: z.uuid(), partnerId: nullableId, partnerName: z.string().nullable(), number: z.string(), on: z.string(), dueOn: z.string(), journalId: z.uuid(), original: z.string(), outstanding: z.string(), bucket: z.string() })) })
export const billFormLineSchema = z.object({ receiptId: z.uuid('请选择实收行。'), quantity: quantityInput, unitPrice: decimalInput, assessment: taxSnapshotSchema.nullable() })
export const tradeJournalSchema = z.object({ journal: z.object({ id: z.uuid(), kind: z.string(), sourceNumber: z.string(), on: z.string(), memo: z.string(), state: z.string(), version: revision, postingNumber: revision.nullable() }),
  lines: z.array(z.object({ accountId: z.uuid(), code: z.string(), name: z.string(), debit: z.string(), credit: z.string() })) })
export type TradeJournal = z.infer<typeof tradeJournalSchema>
export type BillFormLine = z.infer<typeof billFormLineSchema>
export type TradeDocument = z.infer<typeof tradeDocumentSchema>
export type AccrualReceipt = z.infer<typeof accrualSchema>
export type TaxSnapshot = z.infer<typeof taxSnapshotSchema>
export type BankMovement = z.infer<typeof bankMovementSchema>

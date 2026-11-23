import { z } from 'zod'
import { revision } from './wire'

const id = z.uuid()
const date = z.iso.date()
const amount = z.string().regex(/^\d+(?:\.\d+)?$/)
const uuidOrNull = id.nullish()

export const invoiceScheduleInputSchema = z.object({
  customerId: id, serviceId: id, quantity: amount, unitPrice: amount,
  nextOn: date, endsOn: date.nullable(), intervalMonths: z.number().int().min(1).max(24),
  dueDays: z.number().int().min(0).max(180)
})
const scheduleTerms = invoiceScheduleInputSchema.omit({ nextOn: true }).extend({
  customerName: z.string(), serviceName: z.string(), anchorDay: z.number().int(),
  brand: z.object({ timeZone: z.string() })
})
export const invoiceScheduleSchema = z.object({
  id, version: revision, paused: z.boolean(), terms: scheduleTerms, nextOn: date.nullable(),
  lastOn: date.nullable(), pendingReason: z.string().nullish(), preview: z.array(date), nextAtUtc: z.string().nullish()
})
export const invoiceOccurrenceSchema = z.object({
  scheduleId: id, on: date, templateVersion: revision, documentId: uuidOrNull, createdAtUtc: z.string()
})
export const scheduleChangeSchema = z.object({ id, version: revision, invoiceId: uuidOrNull, pendingReason: z.string().nullish() })

export const invoiceNumberingSchema = z.object({ pattern: z.string().nullable(), startingNumber: revision, version: revision })
export const invoiceShareTokenSchema = z.string().regex(/^[0-9a-f]{64}$/i)
export const invoiceShareSchema = z.object({ id, expiresAtUtc: z.string(), revokedAtUtc: z.string().nullish(), token: invoiceShareTokenSchema.nullish() })
export const invoiceDispatchSchema = z.object({
  id, invoiceId: id, recipient: z.string(),
  state: z.enum(['queued', 'sending', 'sent', 'failed', 'unknown', 'abandoned']),
  attempt: z.number().int(), version: revision, previousId: uuidOrNull, resentAsId: uuidOrNull,
  updatedAtUtc: z.string(), detail: z.string().nullish()
})

export type InvoiceScheduleInput = z.infer<typeof invoiceScheduleInputSchema>
export type InvoiceSchedule = z.infer<typeof invoiceScheduleSchema>
export type InvoiceOccurrence = z.infer<typeof invoiceOccurrenceSchema>
export type InvoiceShare = z.infer<typeof invoiceShareSchema>
export type InvoiceDispatch = z.infer<typeof invoiceDispatchSchema>

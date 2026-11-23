import { z } from 'zod'
import { revision } from './wire'
import { taxComponentSchema } from './tax'

const money = z.string().regex(/^-?\d+(?:\.\d+)?$/)
const id = z.uuid()
const line = z.object({ shipmentId: id.nullish(), itemId: id, name: z.string(), quantity: money, unitPrice: money, net: money, tax: money,
  components: z.array(taxComponentSchema).optional() })
export const customerDocumentSchema = z.object({
  id,
  state: z.enum(['submitted', 'posted', 'cancelled']),
  version: revision,
  journalId: id.nullish(),
  openBalance: money,
  isMaker: z.boolean(),
  awaitsFiscalNumber: z.boolean(),
  terms: z.object({
    kind: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
    number: z.string(), on: z.iso.date(), customerId: id, customerName: z.string(), currency: z.string(), total: money,
    lines: z.array(line).nullish(), bankId: id.nullish(), invoiceId: id.nullish(), fundsId: id.nullish(),
    dueOn: z.iso.date().nullish(), returnId: id.nullish(), openingSource: z.object({}).nullish()
  })
})
export const shipmentAllowanceSchema = z.object({
  id, orderId: id, itemId: id, customerId: id, customerName: z.string(), itemName: z.string(),
  on: z.iso.date(), quantity: money, unitPrice: money, available: money, returnOf: id.nullish(),
  creditable: money, posted: z.boolean(), pendingReason: z.string().nullish()
})
export const invoiceNumberPreviewSchema = z.object({ number: z.string(), fiscalYear: z.number().int(), sequence: revision })
export type CustomerDocument = z.infer<typeof customerDocumentSchema>
export type ShipmentAllowance = z.infer<typeof shipmentAllowanceSchema>

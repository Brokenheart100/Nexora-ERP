import { z } from 'zod'
import { revision } from './wire'

const id = z.uuid()
const decimal = z.string().regex(/^-?\d+(?:\.\d+)?$/)

export const stockReturnSchema = z.object({
  id, originalId: id, on: z.iso.date(), quantity: decimal, reason: z.string(),
  movementId: id.nullish(), cancelled: z.boolean(), canConfirm: z.boolean()
})

export const stockOperationSchema = z.object({
  id, warehouseId: id, itemId: id, destinationId: id.nullish(),
  on: z.iso.date(), quantity: decimal, bookQuantity: decimal, reason: z.string(),
  state: z.string(), canConfirm: z.boolean(), canCancel: z.boolean(), version: revision,
  movementId: id.nullish(), destinationMovementId: id.nullish(), transitCost: decimal.nullish(),
  receivedOn: z.iso.date().nullish(), canReceive: z.boolean()
})

export const transferDestinationSchema = z.object({ id, code: z.string(), name: z.string() })

export type StockReturn = z.infer<typeof stockReturnSchema>
export type StockOperation = z.infer<typeof stockOperationSchema>

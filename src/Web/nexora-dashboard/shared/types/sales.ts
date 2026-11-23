import { z } from 'zod'
import { revision } from './wire'
import { compareDecimal } from '../utils/decimal'

const salesState = z.enum(['draft', 'submitted', 'approved', 'cancelled', 'fulfilling', 'fulfilled', 'closed', 'quoted', 'converted'])
const salesReference = z.object({ id: z.uuid(), number: z.string() })

export const salesSummarySchema = salesReference.extend({
  on: z.iso.date(), currency: z.string(), customerName: z.string(), state: salesState,
  version: revision, isQuote: z.boolean(), quoteId: z.uuid().nullish(), departmentId: z.uuid().nullish(), total: z.string().nullish()
})
export const salesListSchema = z.object({
  canCreate: z.boolean(), canApprove: z.boolean(), hasMore: z.boolean(), orders: z.array(salesSummarySchema)
})
export const salesLineSchema = z.object({
  id: z.uuid(), itemId: z.uuid(), itemCode: z.string(), itemName: z.string(), itemVersion: revision,
  unitCode: z.string(), unitVersion: revision, quantity: z.string(), unitPrice: z.string(), amount: z.string()
})
export const salesDetailSchema = z.object({
  order: salesSummarySchema, customerId: z.uuid(), customerCode: z.string(), customerVersion: revision,
  note: z.string(), minorUnits: z.number(), lines: z.array(salesLineSchema), total: z.string(), isMaker: z.boolean(),
  approvedVersion: revision.nullish(), approvedAtUtc: z.string().nullish(), convertedOrder: salesReference.nullish()
})

export const salesNumberSchema = z.string().trim().min(1, '请输入单号。').max(60)
  .regex(/^[A-Za-z0-9/_-]+$/, '单号只能使用字母、数字、斜线、短横线或下划线。')
  .transform(value => value.toUpperCase())
function positiveDecimal(max: string, description: string) {
  return z.string().trim().refine(value => value.length <= 40 && /^\d+(?:\.\d{1,6})?$/.test(value)
    && /[1-9]/.test(value) && compareDecimal(value, max) <= 0, `${description}须大于零且不超过 ${max}，最多六位小数。`)
}
export const salesDraftSchema = z.object({
  on: z.iso.date({ error: '请输入业务日期。' }), customerId: z.uuid('请选择客户。'),
  departmentId: z.uuid().nullable(), note: z.string().max(300, '备注最多 300 字。'),
  lines: z.array(z.object({ itemId: z.uuid('请选择库存商品。'),
    quantity: positiveDecimal('1000000', '数量'), unitPrice: positiveDecimal('10000000', '单价') })).min(1, '请至少添加一行明细。').max(50)
}).refine(draft => new Set(draft.lines.map(line => line.itemId)).size === draft.lines.length,
  { path: ['lines'], message: '同一单据不能重复选择库存商品。' })
export const salesDecisionSchema = z.enum(['issue-quote', 'submit', 'withdraw', 'approve', 'return', 'cancel'])

export type SalesSummary = z.infer<typeof salesSummarySchema>
export type SalesDetail = z.infer<typeof salesDetailSchema>
export type SalesDecision = z.infer<typeof salesDecisionSchema>

export const salesPermitsSchema = z.object({
  canManage: z.boolean(),
  permits: z.array(z.object({
    id: z.uuid(), lineId: z.uuid(), warehouseId: z.uuid(), quantity: z.string(), executed: z.string(),
    revision, state: z.enum(['dispatching', 'reserved', 'cancelling', 'cancelled', 'completed']), expiresAtUtc: z.string(), batchId: z.uuid()
  }))
})
export const fulfillmentChangeSchema = z.union([
  z.object({ batchId: z.uuid(), permitIds: z.array(z.uuid()).min(1), orderVersion: revision }),
  z.object({ permitId: z.uuid(), orderVersion: revision }),
  salesReference.pick({ id: true }).extend({ version: revision })
])
export const warehouseShipmentSchema = z.object({
  id: z.uuid(), orderId: z.uuid(), itemId: z.uuid(), itemName: z.string(), quantity: z.string(), executed: z.string(),
  revision, fenced: z.boolean(), expiresAtUtc: z.string(), canShip: z.boolean()
})
export type SalesPermit = z.infer<typeof salesPermitsSchema>['permits'][number]
export type WarehouseShipment = z.infer<typeof warehouseShipmentSchema>

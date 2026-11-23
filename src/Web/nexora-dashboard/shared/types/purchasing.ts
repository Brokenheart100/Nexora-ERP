import { z } from 'zod'
import { revision } from './wire'
import { compareDecimal } from '../utils/decimal'

export const decimalInput = z.string().trim().max(40).regex(/^\d+(?:\.\d+)?$/, '请输入十进制数值。')
export const quantityInput = decimalInput.refine(value => /[1-9]/.test(value) && (value.split('.')[1]?.length ?? 0) <= 6, '数量须大于零，最多六位小数。')
const purchaseUnitPriceInput = z.string().trim().refine(
  value => value.length <= 40 && /^\d+(?:\.\d{1,6})?$/.test(value) && /[1-9]/.test(value) && compareDecimal(value, '10000000') <= 0,
  '单价须大于 0 且不超过 10,000,000，最多六位小数。'
)
export const changeSchema = z.object({ id: z.uuid(), version: revision })
export const purchaseSummarySchema = z.object({ id: z.uuid(), number: z.string(), on: z.string(), currency: z.string(), supplierName: z.string(), state: z.string(), version: revision, departmentId: z.uuid().nullish() })
export const purchaseListSchema = z.object({ canCreate: z.boolean(), canApprove: z.boolean(), hasMore: z.boolean(), orders: z.array(purchaseSummarySchema) })
export const purchaseLineSchema = z.object({ id: z.uuid(), itemId: z.uuid(), itemCode: z.string(), itemName: z.string(), itemVersion: revision, unitCode: z.string(), unitVersion: revision, quantity: z.string(), unitPrice: z.string(), amount: z.string() })
export const purchaseDetailSchema = z.object({ order: purchaseSummarySchema, supplierId: z.uuid(), supplierCode: z.string(), supplierVersion: revision, note: z.string(), minorUnits: z.number(), lines: z.array(purchaseLineSchema), total: z.string(), isMaker: z.boolean(), approvedVersion: revision.nullable(), approvedAtUtc: z.string().nullable() })
export const purchaseDraftSchema = z.object({ on: z.iso.date(), supplierId: z.uuid('请选择供应商。'), departmentId: z.uuid().nullable(), note: z.string().max(300),
  lines: z.array(z.object({ itemId: z.uuid('请选择商品。'), quantity: quantityInput, unitPrice: purchaseUnitPriceInput })).min(1).max(50) })
  .refine(value => new Set(value.lines.map(line => line.itemId)).size === value.lines.length, { path: ['lines'], message: '同一订单不能重复选择商品。' })
export const purchaseInputSchema = z.object({ number: z.string().trim().min(1).max(60).regex(/^[A-Za-z0-9/_-]+$/, '单号只能使用字母、数字、斜线、短横线或下划线。'), draft: purchaseDraftSchema })
export const permitSchema = z.object({ id: z.uuid(), lineId: z.uuid(), warehouseId: z.uuid(), quantity: z.string(), executed: z.string(), revision, state: z.string() })
export const permitsSchema = z.object({ canManage: z.boolean(), permits: z.array(permitSchema) })
export const permitChangeSchema = z.object({ permitId: z.uuid(), orderVersion: revision })
export const receiptTicketSchema = z.object({ tenantId: z.uuid(), workspaceId: z.uuid(), permitId: z.uuid(), orderId: z.uuid(), lineId: z.uuid(), approvedVersion: revision, warehouseId: z.uuid(), itemId: z.uuid(), unitId: z.uuid(), supplierId: z.uuid(), orderDate: z.string(), quantity: z.string(), unitPrice: z.string(), currency: z.string(), minorUnits: z.number() })
export const inventoryReceiptSchema = z.object({ ticket: receiptTicketSchema, executed: z.string(), cost: z.string(), fenced: z.boolean(), revision })
export const inventoryPoolSchema = z.object({ itemId: z.uuid(), unitId: z.uuid(), currency: z.string(), quantity: z.string(), value: z.string(), average: z.string(), sequence: revision, reserved: z.string(), available: z.string() })
export const inventoryMovementSchema = z.object({ id: z.uuid(), itemId: z.uuid(), permitId: z.uuid(), sequence: revision, on: z.string(), quantity: z.string(), cost: z.string(), reversesId: z.uuid().nullable() })
export type PurchaseSummary = z.infer<typeof purchaseSummarySchema>
export type PurchaseDetail = z.infer<typeof purchaseDetailSchema>
export type PurchaseInput = z.infer<typeof purchaseInputSchema>
export type ReceiptPermit = z.infer<typeof permitSchema>
export type PermitChange = z.infer<typeof permitChangeSchema>
export type InventoryReceipt = z.infer<typeof inventoryReceiptSchema>

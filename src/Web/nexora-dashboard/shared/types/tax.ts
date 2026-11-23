import { z } from 'zod'
import { revision } from './wire'

const day = z.iso.date()
const amount = z.string()
const period = z.object({ from: day, through: day })
const code = z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{1,40}$/, '请输入 1–40 位字母、数字、连字符或下划线。')
const name = z.string().trim().min(1, '请输入名称。').max(160)
const inputDecimal = (minimum: number, maximum: number, message: string) => z.string().trim()
  .regex(/^\d+(?:\.\d{1,6})?$/, '请输入最多六位小数的十进制数。')
  .refine(value => Number(value) >= minimum && Number(value) <= maximum, message)

export const taxRateSchema = z.object({ id: z.uuid(), code: z.string(), name: z.string(), effectiveOn: day, rate: amount })
export const taxGroupSchema = z.object({ code: z.string(), name: z.string(), version: revision, rateCodes: z.array(z.string()) })
export const taxClassificationSchema = z.object({
  kind: z.enum(['item', 'partner']), resourceId: z.uuid(), groupCode: z.string(), version: revision, referenceVersion: revision
})
export const taxSchema = z.object({
  canManage: z.boolean(), rates: z.array(taxRateSchema), groups: z.array(taxGroupSchema), classifications: z.array(taxClassificationSchema)
})
export const taxComponentSchema = z.object({ rateId: z.uuid(), code: z.string(), effectiveOn: day, rate: amount, amount })
export const taxSnapshotSchema = z.object({
  id: z.uuid(), on: day, currency: z.string(), minorUnits: z.number().int(), policy: z.string(), group: taxGroupSchema,
  groupSource: z.enum(['explicit', 'partner', 'item']).nullish(),
  references: z.array(z.object({ kind: z.string(), resourceId: z.uuid(), version: revision, classificationVersion: revision.nullable() })),
  unitPrice: amount, quantity: amount, discount: amount, includesTax: z.boolean(),
  amounts: z.object({ net: amount, tax: amount, total: amount, components: z.array(taxComponentSchema).optional() })
})
export const taxCycleSchema = z.enum(['monthly', 'quarterly'])
export const taxBasisSchema = z.enum(['accrual', 'cash'])
export const taxCalendarSchema = z.object({
  cycle: taxCycleSchema, version: revision, lockedThrough: day.nullable(), canManage: z.boolean(), canLock: z.boolean(),
  basis: taxBasisSchema, canChangeCalendar: z.boolean()
})
const taxPostingSchema = z.object({
  on: day, postingNumber: revision, journalId: z.uuid(), documentId: z.uuid(), documentNumber: z.string(),
  kind: z.string(), direction: z.enum(['input', 'output']), code: z.string(), amount,
  taxDocumentId: z.uuid().nullish(), taxDocumentNumber: z.string().nullish()
})
export const taxTotalsSchema = z.object({
  period, currency: z.string(), watermark: revision, fingerprint: z.string(), input: amount, output: amount, netPayable: amount,
  codes: z.array(z.object({ code: z.string(), input: amount, output: amount, netPayable: amount })),
  sources: z.array(taxPostingSchema), basis: taxBasisSchema
})
export const taxFilingEntrySchema = period.extend({
  id: z.uuid(), version: revision, correctsId: z.uuid().nullable(), reference: z.string(), reason: z.string().nullable(),
  recordedAtUtc: z.string(), lockBooks: z.boolean(), fingerprint: z.string()
})
export const taxFilingSchema = z.object({ filing: taxFilingEntrySchema, snapshot: taxTotalsSchema })
export const taxPeriodSchema = z.object({
  current: taxTotalsSchema, filings: z.array(taxFilingEntrySchema), changedSinceFiling: z.boolean(), lockedThrough: day.nullable()
})

export const taxRateInputSchema = z.object({
  code, name, effectiveOn: day, rate: inputDecimal(0, 1, '税率须在 0 到 1 之间，13% 输入 0.13。')
})
export const taxGroupInputSchema = z.object({
  code, name, rateCodes: z.array(code).min(1, '请选择至少一个税码。').max(8, '最多可选择八个税码。')
})
export const taxAssessmentInputSchema = z.object({
  on: day,
  groupCode: code.nullable(),
  itemId: z.uuid().nullable(),
  partnerId: z.uuid().nullable(),
  unitPrice: inputDecimal(0, 1_000_000_000, '请输入 0 至 1,000,000,000 的单价。'),
  quantity: inputDecimal(0.000001, 1_000_000, '请输入大于 0 且不超过 1,000,000 的数量。'),
  discount: inputDecimal(0, 1, '请输入 0 到 1 的折扣率，10% 输入 0.10。'),
  includesTax: z.boolean()
}).refine(input => input.groupCode || input.itemId || input.partnerId, {
  path: ['groupCode'], message: '请选择显式税组、商品或伙伴。'
})

export type TaxSetup = z.infer<typeof taxSchema>
export type TaxRate = z.infer<typeof taxRateSchema>
export type TaxGroup = z.infer<typeof taxGroupSchema>
export type TaxComponent = z.infer<typeof taxComponentSchema>
export type TaxSnapshot = z.infer<typeof taxSnapshotSchema>
export type TaxCalendar = z.infer<typeof taxCalendarSchema>
export type TaxPeriod = z.infer<typeof taxPeriodSchema>
export type TaxTotals = z.infer<typeof taxTotalsSchema>
export type TaxFiling = z.infer<typeof taxFilingSchema>

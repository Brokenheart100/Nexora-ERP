import { z } from 'zod'
import { revision, itemSchema } from './wire'

const code = z.string().trim().min(1).max(40).regex(/^[a-z0-9][a-z0-9._-]*$/i, '编码只能包含字母、数字、点、下划线与短横线。')
const name = z.string().trim().min(1, '请输入名称。').max(160)
export const definitionSchema = z.object({ id: z.uuid(), kind: z.enum(['category', 'unit']), code: z.string(), name: z.string(), isActive: z.boolean(), version: revision })
export const definitionInputSchema = z.object({ code, name, kind: z.enum(['category', 'unit']), isActive: z.boolean() })
export const itemInputSchema = z.object({ code, name, kind: z.enum(['product', 'service']), categoryId: z.uuid('请选择分类。'), unitId: z.uuid('请选择计量单位。'), tracksInventory: z.boolean(), isActive: z.boolean() })
  .refine(value => value.kind !== 'service' || !value.tracksInventory, { path: ['tracksInventory'], message: '服务项目不能跟踪库存。' })
export const itemReferenceSchema = z.object({ item: itemSchema, category: definitionSchema, unit: definitionSchema })
export const partnerRoleSchema = z.enum(['customer', 'supplier', 'donor'])
export const contactSchema = z.object({ id: z.uuid().nullable(), name: z.string(), email: z.string().nullable(), phone: z.string().nullable() })
export const partnerSummarySchema = z.object({ id: z.uuid(), code: z.string(), name: z.string(), roles: z.array(partnerRoleSchema), isActive: z.boolean(), version: revision })
export const partnerDetailSchema = partnerSummarySchema.extend({ taxNumber: z.string().nullable(), address: z.string().nullable(), contacts: z.array(contactSchema) })
export const partnerListSchema = z.object({ items: z.array(partnerSummarySchema), hasMore: z.boolean(), canManage: z.boolean() })
export const partnerReferenceSchema = z.object({ id: z.uuid(), code: z.string(), name: z.string(), role: partnerRoleSchema, version: revision })
export const partnerInputSchema = z.object({ code, name, roles: z.array(partnerRoleSchema).min(1, '至少选择一种身份。'), taxNumber: z.string().max(64), address: z.string().max(300), isActive: z.boolean(),
  contacts: z.array(z.object({ id: z.uuid().nullable(), name, email: z.union([z.literal(''), z.email()]), phone: z.string().max(40) })).max(20) })

export type WireDefinition = z.infer<typeof definitionSchema>
export type ItemInput = z.infer<typeof itemInputSchema>
export type DefinitionInput = z.infer<typeof definitionInputSchema>
export type WirePartner = z.infer<typeof partnerDetailSchema>
export type PartnerInput = z.infer<typeof partnerInputSchema>
export type PartnerRole = z.infer<typeof partnerRoleSchema>

import { z } from 'zod'

export const revision = z.union([z.number().int().nonnegative(), z.string().regex(/^\d+$/)])
export const workspaceSchema = z.object({
  id: z.uuid(), tenantId: z.uuid(), name: z.string(), countryCode: z.string(), baseCurrency: z.string(), version: revision, isPersonal: z.boolean()
})
export const sessionSchema = z.object({ subject: z.string().min(1), name: z.string() })
export const accessSchema = z.object({
  workspaceId: z.uuid(), tenantId: z.uuid(), memberId: z.uuid(), authorizationVersion: revision,
  role: z.string(), isPersonal: z.boolean(), permissions: z.array(z.string()),
  scopedPermissions: z.array(z.object({ permission: z.string(), departmentId: z.uuid().nullable(), warehouseId: z.uuid().nullable(), startsOn: z.string().nullable(), endsOn: z.string().nullable() })).nullish(),
  departmentIds: z.array(z.uuid()).nullish()
})
export const accountSchema = z.object({ id: z.uuid(), issuer: z.string(), subject: z.string(), verifiedEmail: z.string().nullable(), isActive: z.boolean() })
export const entitlementSchema = z.object({
  workspaceId: z.uuid(), planCode: z.string(), planName: z.string(), effectivePlanCode: z.string(), status: z.string(),
  modules: z.array(z.string()), warnings: z.array(z.string()), periodEndUtc: z.string().nullable(),
  usage: z.object({ workspaces: z.number(), workspacesLimit: z.number(), members: z.number(), membersLimit: z.number(), documentsThisMonth: z.number(), documentsLimit: z.number(), period: z.string() })
})
export const departmentSchema = z.object({ id: z.uuid(), name: z.string() })
export const itemSchema = z.object({
  id: z.uuid(), code: z.string(), name: z.string(), kind: z.enum(['product', 'service']),
  tracksInventory: z.boolean(), categoryId: z.uuid(), unitId: z.uuid(), isActive: z.boolean(), version: revision
})
export const catalogSchema = z.object({
  definitions: z.array(z.object({ id: z.uuid(), code: z.string(), name: z.string(), kind: z.enum(['category', 'unit']), isActive: z.boolean(), version: revision })),
  page: z.object({ items: z.array(itemSchema), hasMore: z.boolean() }).passthrough(), canManage: z.boolean()
})
export type WireWorkspace = z.infer<typeof workspaceSchema>
export type WireSession = z.infer<typeof sessionSchema>
export type WireAccess = z.infer<typeof accessSchema>
export type WireAccount = z.infer<typeof accountSchema>
export type WireEntitlements = z.infer<typeof entitlementSchema>
export type WireDepartment = z.infer<typeof departmentSchema>
export type WireItem = z.infer<typeof itemSchema>
export type WireCatalog = z.infer<typeof catalogSchema>
export type DecimalString = string
export interface ChangeReceipt { id: string, version: number | string }

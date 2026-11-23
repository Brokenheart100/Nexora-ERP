import { z } from 'zod'
import { revision } from './wire'

const id = z.uuid()
const time = z.string()
const text = z.string()
export const companyPresentationSchema = z.object({
  legalName: text, brandName: text, accentColor: text, dateFormat: text, timeZone: text,
  logoDataUrl: text.nullable()
})
export const companySettingsSchema = z.object({
  workspaceId: id, baseCurrency: text, version: revision, presentation: companyPresentationSchema,
  sessionIdleMinutes: z.number().int(), roleGrantApprovals: z.number().int(), canManage: z.boolean()
})
export const personalLinkSchema = z.object({ personalWorkspaceId: id, companyWorkspaceId: id, isLinked: z.boolean() })
export const announcementSchema = z.object({ id: text, title: text, message: text, endsAtUtc: time })
export const memberSchema = z.object({
  id, userId: id, subject: text, email: text.nullish(), role: text, isActive: z.boolean(), joinedAtUtc: time,
  financeRole: text.nullish(), proposedFinanceRole: text.nullish(), financeRoleProposalVersion: revision.nullish(),
  purchaseRole: text.nullish(), proposedPurchaseRole: text.nullish(), purchaseRoleProposalVersion: revision.nullish(),
  salesRole: text.nullish(), proposedSalesRole: text.nullish(), salesRoleProposalVersion: revision.nullish(),
  proposedBusinessRoles: z.array(text).nullish(), businessRoleProposerId: id.nullish(),
  businessRoleProposalVersion: revision.nullish(), businessRoleProposalExpiresAtUtc: time.nullish()
})
export const organizationRoleSchema = z.object({ code: text, area: text.nullish(), permissions: z.array(text) })
export const organizationInvitationSchema = z.object({
  id, email: text, role: text, state: text, expiresAtUtc: time, businessRoles: z.array(text).nullish(),
  inviterMemberId: id.nullish()
})
export const createdInvitationSchema = z.object({
  invitation: organizationInvitationSchema, token: text, authorizationVersion: revision, mailStatus: text.nullish()
})
export const governanceChangeSchema = z.object({ workspaceId: id, authorizationVersion: revision })
export const customRoleSchema = z.object({ id, name: text, revision, permissions: z.array(text) })
export const customRoleCatalogSchema = z.object({
  roles: z.array(customRoleSchema), permissions: z.array(z.object({ code: text, scopes: z.array(text) }))
})
export const roleGrantSchema = z.object({
  id, memberId: id, roleId: id, roleRevision: revision, scope: text, scopeId: id.nullish(),
  startsOn: text.nullish(), endsOn: text.nullish(), requiredApprovals: z.number().int(), approvalCount: z.number().int(),
  permissions: z.array(text), state: text, requestedBy: id, firstApprovedBy: id.nullish(), approvedBy: id.nullish(), expiresAtUtc: time
})
export type CompanySettings = z.infer<typeof companySettingsSchema>
export type OrganizationMember = z.infer<typeof memberSchema>
export type OrganizationRole = z.infer<typeof organizationRoleSchema>
export type OrganizationInvitation = z.infer<typeof organizationInvitationSchema>
export type InvitationReceipt = z.infer<typeof createdInvitationSchema>
export type CustomRole = z.infer<typeof customRoleSchema>
export type RoleGrant = z.infer<typeof roleGrantSchema>

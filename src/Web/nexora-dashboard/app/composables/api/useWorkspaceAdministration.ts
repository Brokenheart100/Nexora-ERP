import { z } from 'zod'
import { accessSchema, departmentSchema, workspaceSchema } from '#shared/types/wire'
import {
  announcementSchema, companySettingsSchema, createdInvitationSchema, customRoleCatalogSchema, customRoleSchema,
  governanceChangeSchema, memberSchema, organizationInvitationSchema, organizationRoleSchema, personalLinkSchema,
  roleGrantSchema
} from '#shared/types/workspace-administration'
import { billingCheckoutIntentSchema, billingCheckoutSchema, billingQuoteSchema, organizationBillingSchema } from '#shared/types/organization-billing'
import { useDashboardApi } from './useDashboardApi'

export const organizationPath = (workspace: string) => '/bff/api/workspaces/' + workspace
export const administrationPageSize = 20
type Version = string | number
type Body = Record<string, unknown>

export function useWorkspaceAdministration(owner: 'workspace' | 'account' = 'workspace') {
  const api = useDashboardApi(owner)
  async function read<T>(path: string, schema: z.ZodType<T>, signal?: AbortSignal) {
    return schema.parse((await api.get(path, { signal })).data)
  }
  function get<T>(id: string, path: string, schema: z.ZodType<T>, signal?: AbortSignal) {
    return read(organizationPath(id) + path, schema, signal)
  }
  function write<T>(path: string, body: Body, schema: z.ZodType<T>, options: { idempotent?: boolean, version?: Version, method?: 'POST' | 'PUT' } = {}) {
    return api.createWrite(path, body, { method: options.method, idempotent: options.idempotent === true,
      etag: options.version === undefined ? undefined : '"' + options.version + '"', parse: schema.parse })
  }
  const paged = (path: string, page?: number) => page === undefined ? path : path + '?page=' + page + '&pageSize=' + administrationPageSize
  return {
    open: (personal: boolean, name: string) =>
      write('/bff/api/workspaces' + (personal ? '/personal' : ''), { name }, workspaceSchema, { idempotent: true }),
    workspaces: (signal?: AbortSignal) => read('/bff/api/workspaces', z.array(workspaceSchema), signal),
    access: (id: string, signal?: AbortSignal) => get(id, '/access', accessSchema, signal),
    company: (id: string, signal?: AbortSignal) => get(id, '/settings', companySettingsSchema, signal),
    saveCompany: (id: string, version: Version, body: Body) =>
      write(organizationPath(id) + '/settings', body, companySettingsSchema, { method: 'PUT', version }),
    links: (id: string, signal?: AbortSignal) => get(id, '/personal-links', z.array(personalLinkSchema), signal),
    personalLink: (id: string, personal: string, isLinked: boolean) =>
      write(organizationPath(id) + '/personal-links/' + personal, { isLinked }, personalLinkSchema, { method: 'PUT' }),
    announcements: (id: string, signal?: AbortSignal) => get(id, '/announcements', z.array(announcementSchema), signal),
    roles: (id: string, signal?: AbortSignal) => get(id, '/roles', z.array(organizationRoleSchema), signal),
    members: (id: string, page?: number, signal?: AbortSignal) => get(id, paged('/members', page), z.array(memberSchema), signal),
    memberChange: (id: string, member: string, version: Version, body: Body, area?: 'business-roles' | 'purchase-role' | 'sales-role' | 'finance-role') =>
      write(organizationPath(id) + '/members/' + member + (area ? '/' + area : ''), body, governanceChangeSchema, { version }),
    invites: (id: string, page: number, signal?: AbortSignal) => get(id, paged('/invitations', page), z.array(organizationInvitationSchema), signal),
    invitation: (id: string, invite: string, signal?: AbortSignal) => get(id, '/invitations/' + invite, organizationInvitationSchema, signal),
    invite: (id: string, version: Version, body: Body) =>
      write(organizationPath(id) + '/invitations', body, createdInvitationSchema, { idempotent: true, version }),
    approveInvitation: (id: string, invite: string, version: Version) =>
      write(organizationPath(id) + '/invitations/' + invite + '/approve', {}, createdInvitationSchema, { version }),
    revokeInvitation: (id: string, invite: string, version: Version) =>
      write(organizationPath(id) + '/invitations/' + invite + '/revoke', {}, governanceChangeSchema, { version }),
    redeem: (invite: string, token: string) => write('/bff/api/invitations/' + invite + '/redeem', { token }, governanceChangeSchema),
    customRoles: (id: string, signal?: AbortSignal) => get(id, '/custom-roles', customRoleCatalogSchema, signal),
    grants: (id: string, signal?: AbortSignal) => get(id, '/role-grants', z.array(roleGrantSchema), signal),
    departments: (id: string, signal?: AbortSignal) => get(id, '/departments', z.array(departmentSchema), signal),
    saveCustomRole: (id: string, version: Version, body: Body) =>
      write(organizationPath(id) + '/custom-roles', body, customRoleSchema, { version }),
    addDepartment: (id: string, version: Version, name: string) =>
      write(organizationPath(id) + '/departments', { name }, departmentSchema, { version }),
    grant: (id: string, version: Version, body: Body) =>
      write(organizationPath(id) + '/role-grants', body, roleGrantSchema, { version }),
    decideGrant: (id: string, grant: string, version: Version, action: 'approve' | 'revoke') =>
      write(organizationPath(id) + '/role-grants/' + grant, { action }, roleGrantSchema, { version }),
    billing: (id: string, signal?: AbortSignal) => get(id, '/billing', organizationBillingSchema, signal),
    quote: (id: string, planCode: string, signal?: AbortSignal) =>
      get(id, '/billing/plan-quote?' + new URLSearchParams({ planCode }), billingQuoteSchema, signal),
    selectPlan: (id: string, planCode: string, paymentReference?: string) =>
      write(organizationPath(id) + '/billing/subscription', { planCode, paymentReference }, organizationBillingSchema, { idempotent: true }),
    cancelPlan: (id: string) =>
      write(organizationPath(id) + '/billing/subscription/cancel', {}, organizationBillingSchema, { idempotent: true }),
    payInvoice: (id: string, invoice: string, reference: string) =>
      write(organizationPath(id) + '/billing/invoices/' + invoice + '/pay', { reference }, organizationBillingSchema, { idempotent: true }),
    checkout: (id: string, signal?: AbortSignal) => get(id, '/billing/local-checkout', billingCheckoutSchema, signal),
    startCheckout: (id: string, body: { planCode: string, expectedAmountCents: number, useSavedCard: boolean }) =>
      write(organizationPath(id) + '/billing/local-checkout', body, billingCheckoutIntentSchema, { idempotent: true }),
    confirmCheckout: (id: string, invoice: string, ticket: string, saveCard: boolean) =>
      write(organizationPath(id) + '/billing/local-checkout/' + invoice + '/callback', { ticket, saveCard }, organizationBillingSchema)
  }
}

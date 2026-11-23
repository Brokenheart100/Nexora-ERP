import { partnerDetailSchema, partnerListSchema, partnerReferenceSchema, type PartnerInput, type PartnerRole, type WirePartner } from '#shared/types/masterdata'
import type { ChangeReceipt } from '#shared/types/wire'
import { useDashboardApi } from './useDashboardApi'

export function usePartnersApi() {
  const api = useDashboardApi()
  const profile = (input: PartnerInput) => ({ name: input.name, taxNumber: input.taxNumber || null, address: input.address || null, roles: input.roles,
    contacts: input.contacts.map(contact => ({ ...contact, email: contact.email || null, phone: contact.phone || null })) })
  return {
    profile,
    list: async (workspaceId: string, page = 1, role?: PartnerRole, signal?: AbortSignal, pageSize = 20) => partnerListSchema.parse((await api.get(
      `/bff/api/masterdata/workspaces/${workspaceId}/partners?${new URLSearchParams({ page: String(page), pageSize: String(pageSize), ...(role ? { role } : {}) })}`, { signal })).data),
    detail: async (workspaceId: string, id: string) => {
      const response = await api.get(`/bff/api/masterdata/workspaces/${workspaceId}/partners/${id}`)
      return { ...response, data: partnerDetailSchema.parse(response.data) }
    },
    reference: async (workspaceId: string, id: string, role: PartnerRole) => partnerReferenceSchema.parse((await api.get(
      `/bff/api/masterdata/workspaces/${workspaceId}/partners/${id}/reference?role=${role}`)).data),
    create: (workspaceId: string, input: PartnerInput) => api.createWrite<ChangeReceipt>(`/bff/api/masterdata/workspaces/${workspaceId}/partners`, { code: input.code, profile: profile(input) }, { idempotent: true }),
    revise: (workspaceId: string, partner: WirePartner, input: PartnerInput, etag: string) => api.createWrite<ChangeReceipt>(
      `/bff/api/masterdata/workspaces/${workspaceId}/partners/${partner.id}`, { profile: profile(input), isActive: input.isActive }, { method: 'PUT', etag, idempotent: true })
  }
}

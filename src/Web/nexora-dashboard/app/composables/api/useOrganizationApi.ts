import { z } from 'zod'
import { accessSchema, accountSchema, departmentSchema, entitlementSchema, sessionSchema, workspaceSchema } from '#shared/types/wire'
import { useDashboardApi } from './useDashboardApi'

export function useOrganizationApi() {
  const api = useDashboardApi()
  return {
    session: async () => sessionSchema.parse((await api.get('/bff/me')).data),
    account: async () => accountSchema.parse((await api.get('/bff/api/me')).data),
    workspaces: async () => z.array(workspaceSchema).parse((await api.get('/bff/api/workspaces')).data),
    access: async (id: string) => accessSchema.parse((await api.get(`/bff/api/workspaces/${id}/access`)).data),
    workspace: async (id: string) => workspaceSchema.parse((await api.get(`/bff/api/workspaces/${id}`)).data),
    entitlements: async (id: string) => entitlementSchema.parse((await api.get(`/bff/api/workspaces/${id}/billing/entitlements`)).data),
    departments: async (id: string, signal?: AbortSignal) => z.array(departmentSchema).parse((await api.get(`/bff/api/workspaces/${id}/departments`, { signal })).data),
    authorize: async (id: string, permission: string) => {
      if (!/^[a-z][a-z.-]+$/.test(permission)) throw new Error('权限标识无效。')
      return accessSchema.parse((await api.get(`/bff/api/workspaces/${id}/authorization/${permission}`)).data)
    }
  }
}

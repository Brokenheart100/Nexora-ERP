import { auditPageSchema, recordChangePageSchema, type AuditSource, type ChangeSource } from '#shared/types/workspace-audit'
import { useDashboardApi } from './useDashboardApi'

export const auditPageSize = 20
const path = (id: string, source: ChangeSource) => '/bff/api/' + (source === 'organization' ? '' : source + '/') + 'workspaces/' + id

export function useWorkspaceAuditApi() {
  const api = useDashboardApi()
  return {
    audit: async (id: string, source: AuditSource, query: URLSearchParams, signal?: AbortSignal) =>
      auditPageSchema.parse((await api.get(path(id, source) + '/audit?' + query, { signal })).data),
    changes: async (id: string, source: ChangeSource, query: URLSearchParams, signal?: AbortSignal) =>
      recordChangePageSchema.parse((await api.get(path(id, source) + '/record-changes?' + query, { signal })).data),
    exportChanges: async (id: string, source: ChangeSource, query: URLSearchParams) => {
      const result = await api.get<Blob>(path(id, source) + '/record-changes.csv?' + query, { responseType: 'blob' })
      if (!result.headers.get('content-type')?.includes('text/csv')) throw new Error('服务未返回 CSV。')
      return result.data
    }
  }
}

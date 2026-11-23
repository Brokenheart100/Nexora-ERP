import { salesDetailSchema, salesListSchema, salesPermitsSchema } from '#shared/types/sales'
import { useDashboardApi } from './useDashboardApi'

export function salesOrdersPath(workspaceId: string) {
  return `/bff/api/sales/workspaces/${workspaceId}/orders`
}

export function useSalesApi() {
  const api = useDashboardApi()
  return {
    async list(workspaceId: string, isQuote: boolean, page: number, pageSize: number, signal?: AbortSignal) {
      const params = new URLSearchParams({ isQuote: String(isQuote), page: String(page), pageSize: String(pageSize) })
      return salesListSchema.parse((await api.get(`${salesOrdersPath(workspaceId)}?${params}`, { signal })).data)
    },
    async detail(workspaceId: string, id: string, signal?: AbortSignal) {
      const response = await api.get(`${salesOrdersPath(workspaceId)}/${id}`, { signal })
      return { data: salesDetailSchema.parse(response.data), etag: response.headers.get('etag') ?? undefined }
    },
    async permits(workspaceId: string, id: string, signal?: AbortSignal) {
      return salesPermitsSchema.parse((await api.get(`${salesOrdersPath(workspaceId)}/${id}/fulfillments`, { signal })).data)
    }
  }
}

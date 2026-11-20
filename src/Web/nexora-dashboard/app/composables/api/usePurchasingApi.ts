import type { z } from 'zod'
import { changeSchema, permitChangeSchema, permitsSchema, purchaseDetailSchema, purchaseListSchema, type PurchaseInput } from '#shared/types/purchasing'
import { useDashboardApi } from './useDashboardApi'
import type { PurchaseDecision } from '~/utils/purchasing/order-policy'
import type { WireWorkspace } from '#shared/types/wire'

export function usePurchasingApi() {
  const api = useDashboardApi()
  const root = (id: string) => `/bff/api/purchasing/workspaces/${id}/orders`
  function write<T>(path: string, body: Record<string, unknown>, schema: z.ZodType<T>, method: 'POST' | 'PUT' = 'POST') {
    return api.createWrite<T>(path, body, { method, idempotent: true, parse: value => schema.parse(value) })
  }
  return {
    list: async (id: string, page = 1, signal?: AbortSignal) => purchaseListSchema.parse((await api.get(`${root(id)}?page=${page}&pageSize=20`, { signal })).data),
    detail: async (id: string, orderId: string) => purchaseDetailSchema.parse((await api.get(`${root(id)}/${orderId}`)).data),
    create: (id: string, input: PurchaseInput) => write(root(id), input, changeSchema),
    edit: (id: string, orderId: string, version: WireWorkspace['version'], input: PurchaseInput) => write(`${root(id)}/${orderId}`, { expectedVersion: version, draft: input.draft }, changeSchema, 'PUT'),
    decide: (id: string, orderId: string, version: WireWorkspace['version'], decision: PurchaseDecision, reason: string) => write(`${root(id)}/${orderId}/decision`, { expectedVersion: version, decision, reason }, changeSchema),
    permits: async (id: string, orderId: string) => permitsSchema.parse((await api.get(`${root(id)}/${orderId}/receipts`)).data),
    issue: (id: string, orderId: string, version: WireWorkspace['version'], lineId: string, warehouseId: string, quantity: string) => write(`${root(id)}/${orderId}/receipts`, { expectedVersion: version, lineId, warehouseId, quantity }, permitChangeSchema),
    cancelPermit: (id: string, orderId: string, version: WireWorkspace['version'], permitId: string, reason: string) => write(`${root(id)}/${orderId}/receipts/${permitId}/cancel`, { expectedVersion: version, reason }, permitChangeSchema),
    close: (id: string, orderId: string, version: WireWorkspace['version'], reason: string) => write(`${root(id)}/${orderId}/receipts/close`, { expectedVersion: version, reason }, changeSchema),
    waitForPermit: async (location: string, permitId: string) => api.poll(location, { complete: response => permitsSchema.parse(response.data).permits.some(permit => permit.id === permitId && permit.state !== 'dispatching'), budgetMs: 15000 })
  }
}

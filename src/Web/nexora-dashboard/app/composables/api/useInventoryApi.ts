import { warehousesSchema, warehouseSchema } from '#shared/types/prerequisites'
import { z } from 'zod'
import { changeSchema, inventoryReceiptSchema, inventoryPoolSchema, inventoryMovementSchema } from '#shared/types/purchasing'
import type { ChangeReceipt, WireWorkspace } from '#shared/types/wire'
import { useDashboardApi } from './useDashboardApi'

export function useInventoryApi() {
  const api = useDashboardApi()
  return {
    warehouses: async (workspaceId: string, signal?: AbortSignal) => warehousesSchema.parse((await api.get(`/bff/api/inventory/workspaces/${workspaceId}/warehouses`, { signal })).data),
    detail: async (workspaceId: string, id: string) => warehouseSchema.parse((await api.get(`/bff/api/inventory/workspaces/${workspaceId}/warehouses/${id}`)).data),
    reference: async (workspaceId: string, id: string) => warehouseSchema.parse((await api.get(`/bff/api/inventory/workspaces/${workspaceId}/warehouses/${id}/reference`)).data),
    receipts: async (workspaceId: string, id: string) => z.array(inventoryReceiptSchema).parse((await api.get(`/bff/api/inventory/workspaces/${workspaceId}/warehouses/${id}/receipts`)).data),
    pools: async (workspaceId: string, id: string, page = 1) => z.array(inventoryPoolSchema).parse((await api.get(`/bff/api/inventory/workspaces/${workspaceId}/warehouses/${id}/positions?page=${page}&pageSize=20`)).data),
    movements: async (workspaceId: string, id: string, page = 1) => z.array(inventoryMovementSchema).parse((await api.get(`/bff/api/inventory/workspaces/${workspaceId}/warehouses/${id}/movements?page=${page}&pageSize=20`)).data),
    receive: (workspaceId: string, permitId: string, expectedRevision: WireWorkspace['version'], on: string, quantity: string) => api.createWrite<ChangeReceipt>(`/bff/api/inventory/workspaces/${workspaceId}/receipts/${permitId}/receive`,
      { expectedRevision, on, quantity }, { idempotent: true, parse: value => changeSchema.parse(value) })
  }
}

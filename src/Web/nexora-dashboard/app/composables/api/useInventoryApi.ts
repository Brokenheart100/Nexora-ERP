import { warehousesSchema, warehouseSchema } from '#shared/types/prerequisites'
import { z } from 'zod'
import { changeSchema, inventoryReceiptSchema, inventoryPoolSchema, inventoryMovementSchema } from '#shared/types/purchasing'
import type { ChangeReceipt, WireWorkspace } from '#shared/types/wire'
import { useDashboardApi } from './useDashboardApi'
import { warehouseShipmentSchema } from '#shared/types/sales'
import { stockOperationSchema, stockReturnSchema, transferDestinationSchema } from '#shared/types/inventory'

export const inventoryPath = (workspaceId: string) => `/bff/api/inventory/workspaces/${workspaceId}`
export const warehousePath = (workspaceId: string, id: string) => `${inventoryPath(workspaceId)}/warehouses/${id}`

export function useInventoryApi() {
  const api = useDashboardApi()
  async function read<T>(path: string, schema: z.ZodType<T>, signal?: AbortSignal) {
    return schema.parse((await api.get(path, { signal })).data)
  }
  return {
    returns: (workspaceId: string, id: string, sales: boolean, signal?: AbortSignal) =>
      read(`${warehousePath(workspaceId, id)}/${sales ? 'sales-returns' : 'returns'}`, z.array(stockReturnSchema), signal),
    operations: (workspaceId: string, id: string, signal?: AbortSignal) =>
      read(warehousePath(workspaceId, id) + '/stock-operations', z.array(stockOperationSchema), signal),
    operation: (workspaceId: string, id: string, operationId: string, signal?: AbortSignal) =>
      read(warehousePath(workspaceId, id) + '/stock-operations/' + operationId, stockOperationSchema, signal),
    destinations: (workspaceId: string, id: string, signal?: AbortSignal) =>
      read(warehousePath(workspaceId, id) + '/stock-operations/destinations', z.array(transferDestinationSchema), signal),
    warehouses: async (workspaceId: string, signal?: AbortSignal) => warehousesSchema.parse((await api.get(`/bff/api/inventory/workspaces/${workspaceId}/warehouses`, { signal })).data),
    detail: async (workspaceId: string, id: string, signal?: AbortSignal) => warehouseSchema.parse((await api.get(`/bff/api/inventory/workspaces/${workspaceId}/warehouses/${id}`, { signal })).data),
    reference: async (workspaceId: string, id: string, signal?: AbortSignal) => warehouseSchema.parse((await api.get(`/bff/api/inventory/workspaces/${workspaceId}/warehouses/${id}/reference`, { signal })).data),
    receipts: async (workspaceId: string, id: string, signal?: AbortSignal) => z.array(inventoryReceiptSchema).parse((await api.get(`/bff/api/inventory/workspaces/${workspaceId}/warehouses/${id}/receipts`, { signal })).data),
    shipments: async (workspaceId: string, id: string, signal?: AbortSignal) => z.array(warehouseShipmentSchema).parse((await api.get(`/bff/api/inventory/workspaces/${workspaceId}/warehouses/${id}/shipments`, { signal })).data),
    pools: async (workspaceId: string, id: string, page = 1, signal?: AbortSignal) => z.array(inventoryPoolSchema).parse((await api.get(`/bff/api/inventory/workspaces/${workspaceId}/warehouses/${id}/positions?page=${page}&pageSize=20`, { signal })).data),
    movements: (workspaceId: string, id: string, page = 1, signal?: AbortSignal, itemId?: string) =>
      read(warehousePath(workspaceId, id) + '/movements?' + new URLSearchParams({ page: String(page), pageSize: '20', ...(itemId ? { itemId } : {}) }),
        z.array(inventoryMovementSchema), signal),
    receive: (workspaceId: string, permitId: string, expectedRevision: WireWorkspace['version'], on: string, quantity: string) => api.createWrite<ChangeReceipt>(`/bff/api/inventory/workspaces/${workspaceId}/receipts/${permitId}/receive`,
      { expectedRevision, on, quantity }, { idempotent: true, parse: value => changeSchema.parse(value) })
  }
}

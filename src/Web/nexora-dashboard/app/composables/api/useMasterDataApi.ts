import { z } from 'zod'
import { catalogSchema, itemSchema, revision } from '#shared/types/wire'
import type { ChangeReceipt, WireItem } from '#shared/types/wire'
import { definitionSchema, itemReferenceSchema, type DefinitionInput, type ItemInput, type WireDefinition } from '#shared/types/masterdata'
import { useDashboardApi } from './useDashboardApi'
import { ApiFailure } from '~/utils/api/client'

export function useMasterDataApi() {
  const api = useDashboardApi()
  async function receipt(workspaceId: string, operationId: string, action: string, resourceId?: string) {
    const subject = api.scope.identity.subject
    const query = new URLSearchParams({ entityName: 'CatalogReceipt', actor: subject, pageSize: '100' })
    const response = await api.get(`/bff/api/masterdata/workspaces/${workspaceId}/record-changes?${query}`).catch((failure) => {
      if (failure instanceof ApiFailure && [403, 404].includes(failure.status)) return null
      throw failure
    })
    if (!response) return null
    const page = z.object({ changes: z.array(z.object({ actorSubject: z.string(), afterJson: z.string().nullable() })) }).parse(response.data)
    const schema = z.object({ OperationId: z.uuid(), ResourceId: z.uuid(), ResourceVersion: revision, Action: z.string() })
    for (const change of page.changes) {
      if (change.actorSubject !== subject || !change.afterJson) continue
      try {
        const record = schema.safeParse(JSON.parse(change.afterJson))
        if (record.success && record.data.OperationId === operationId && record.data.Action === action && (!resourceId || record.data.ResourceId === resourceId))
          return { id: record.data.ResourceId, version: record.data.ResourceVersion }
      } catch { /* A partial audit snapshot cannot confirm the operation. */ }
    }
    return null
  }
  return {
    definition: async (workspaceId: string, id: string) => {
      const response = await api.get(`/bff/api/masterdata/workspaces/${workspaceId}/definitions/${id}`)
      return { ...response, data: definitionSchema.parse(response.data) }
    },
    createDefinition: (workspaceId: string, input: DefinitionInput) => api.createWrite<ChangeReceipt>(`/bff/api/masterdata/workspaces/${workspaceId}/definitions`,
      { kind: input.kind, code: input.code, name: input.name }, { idempotent: true }),
    reviseDefinition: (workspaceId: string, definition: WireDefinition, name: string, isActive: boolean, etag: string) => api.createWrite<ChangeReceipt>(
      `/bff/api/masterdata/workspaces/${workspaceId}/definitions/${definition.id}`, { name, isActive }, { method: 'PUT', etag, idempotent: true }),
    createItem: (workspaceId: string, input: ItemInput) => api.createWrite<ChangeReceipt>(`/bff/api/masterdata/workspaces/${workspaceId}/items`,
      { code: input.code, name: input.name, kind: input.kind, categoryId: input.categoryId, unitId: input.unitId, tracksInventory: input.tracksInventory }, { idempotent: true }),
    reference: async (workspaceId: string, id: string, inventory = false) => itemReferenceSchema.parse((await api.get(
      `/bff/api/masterdata/workspaces/${workspaceId}/items/${id}/reference${inventory ? '?inventory=true' : ''}`)).data),
    catalog: async (workspaceId: string, page = 1, signal?: AbortSignal) => {
      const response = await api.get(`/bff/api/masterdata/workspaces/${workspaceId}/catalog?page=${page}&pageSize=20`, { signal })
      return { ...response, data: catalogSchema.parse(response.data) }
    },
    item: async (workspaceId: string, id: string) => {
      const response = await api.get(`/bff/api/masterdata/workspaces/${workspaceId}/items/${id}`)
      return { ...response, data: itemSchema.parse(response.data) }
    },
    receipt,
    applied: (workspaceId: string, itemId: string, operationId: string, _subject: string) => receipt(workspaceId, operationId, 'catalog.item.revised', itemId),
    revise: (workspaceId: string, item: WireItem, name: string, etag: string, changes?: { categoryId: string, isActive: boolean }) => api.createWrite<ChangeReceipt>(
      `/bff/api/masterdata/workspaces/${workspaceId}/items/${item.id}`,
      { name, categoryId: changes?.categoryId ?? item.categoryId, isActive: changes?.isActive ?? item.isActive }, { method: 'PUT', etag, idempotent: true }
    )
  }
}

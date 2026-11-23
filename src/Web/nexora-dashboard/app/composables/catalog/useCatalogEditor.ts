import { useMasterDataApi } from '~/composables/api/useMasterDataApi'
import { useDashboardApi } from '~/composables/api/useDashboardApi'
import { useLiveMutation } from '~/composables/useLiveMutation'
import { ApiFailure, type ApiResponse } from '~/utils/api/client'
import { ScopeChangedError } from '~/utils/api/scope'
import { createCatalogRecoveryStore, type CatalogRecovery } from '~/utils/catalog/recovery'
import type { CatalogConnection } from './useCatalogConnection'
import { changeReceiptSchema, type ChangeReceipt, type WireItem } from '#shared/types/wire'

export function useCatalogEditor(connection: CatalogConnection) {
  const api = useDashboardApi()
  const masterData = useMasterDataApi()
  const mutation = useLiveMutation<ChangeReceipt>()
  const ledger = import.meta.client ? createCatalogRecoveryStore(sessionStorage) : null
  const baseline = shallowRef<{ item: WireItem, etag: string } | null>(null)
  const record = shallowRef<CatalogRecovery | null>(null)
  const message = ref('')
  const reading = ref(false)
  let selection = 0

  watch(() => connection.owner, () => {
    selection++
    baseline.value = null
    mutation.resetScope()
    message.value = ''
    reading.value = false
    record.value = connection.canEdit ? ledger?.read(connection.auth.user!.subject, connection.session.activeWorkspaceId) ?? null : null
  }, { immediate: true, flush: 'sync' })
  watch(() => connection.canEdit, (allowed) => {
    record.value = allowed ? ledger?.read(connection.auth.user!.subject, connection.session.activeWorkspaceId) ?? null : null
  })

  async function read(id: string) {
    const current = ++selection
    reading.value = true
    try {
      const response = await masterData.item(connection.session.activeWorkspaceId, id)
      if (current !== selection) return null
      const etag = response.headers.get('etag')
      if (!etag) throw new Error('当前记录缺少版本，暂不能保存。')
      baseline.value = { item: response.data, etag }
      return response.data
    } catch (failure) {
      if (current === selection && !(failure instanceof ScopeChangedError)) message.value = failure instanceof Error ? failure.message : '商品暂不可用。'
      return null
    } finally {
      if (current === selection) reading.value = false
    }
  }

  async function open(id: string) {
    if (record.value) {
      message.value = '请先恢复并核对上次提交。'
      return null
    }
    mutation.reset()
    message.value = ''
    return read(id)
  }

  function finish(result: ApiResponse<ChangeReceipt> | null, captured: CatalogRecovery, owner: string) {
    if (owner !== connection.owner) return false
    if (result) {
      ledger?.remove(captured.subject, captured.workspaceId, captured.operationId)
      record.value = null
      void connection.refresh()
      return true
    }
    const failure = mutation.failure.value
    if (failure instanceof ApiFailure && !mutation.unknown.value) {
      if (failure.kind === 'mfa') {
        record.value = { ...captured, state: 'mfa' }
        ledger?.save(record.value)
      } else {
        ledger?.remove(captured.subject, captured.workspaceId, captured.operationId)
        record.value = null
      }
    }
    return false
  }

  async function save(input: { name: string, category: string, status: 'active' | 'archived' }) {
    if (!connection.canEdit || !baseline.value || mutation.busy.value) return false
    if (record.value) {
      message.value = '请先核对上次提交，不能直接再次保存。'
      return false
    }
    const current = baseline.value
    const captured: CatalogRecovery = { subject: connection.auth.user!.subject, workspaceId: connection.session.activeWorkspaceId,
      itemId: current.item.id, operationId: crypto.randomUUID(), etag: current.etag, createdAt: Date.now(),
      payload: { name: input.name, categoryId: input.category, isActive: input.status === 'active' } }
    const owner = connection.owner
    try {
      ledger?.save(captured)
      record.value = captured
      const result = await mutation.run(() => api.createWrite<ChangeReceipt>(`/bff/api/masterdata/workspaces/${captured.workspaceId}/items/${captured.itemId}`,
        captured.payload, { method: 'PUT', etag: captured.etag, operationId: captured.operationId, idempotent: true,
          parse: data => changeReceiptSchema.parse(data) }))
      return finish(result, captured, owner)
    } catch (failure) {
      if (owner === connection.owner) message.value = failure instanceof Error ? failure.message : '提交暂不可用。'
      return false
    }
  }

  async function resume() {
    const original = record.value
    if (!original || !connection.canEdit || original.subject !== connection.auth.user?.subject || original.workspaceId !== connection.session.activeWorkspaceId) return null
    const item = await read(original.itemId)
    if (!item || record.value?.operationId !== original.operationId) return null
    mutation.resetScope()
    if (original.state === 'mfa') {
      ledger?.remove(original.subject, original.workspaceId, original.operationId)
      record.value = null
    } else {
      const operation = api.createWrite<ChangeReceipt>(`/bff/api/masterdata/workspaces/${original.workspaceId}/items/${original.itemId}`, original.payload,
        { method: 'PUT', etag: original.etag, operationId: original.operationId, idempotent: true, parse: data => changeReceiptSchema.parse(data) })
      operation.state = 'unknown'
      mutation.operation.value = operation
    }
    return { item, payload: original.payload }
  }

  async function check() {
    const captured = record.value
    if (!captured || !mutation.unknown.value) return false
    const owner = connection.owner
    const result = await mutation.check(async () => {
      const receipt = await masterData.applied(captured.workspaceId, captured.itemId, captured.operationId, captured.subject)
      await masterData.item(captured.workspaceId, captured.itemId)
      return receipt ? { status: 200, data: receipt, headers: new Headers() } : null
    })
    return finish(result, captured, owner)
  }

  async function retry() {
    const captured = record.value
    if (!captured) return false
    const owner = connection.owner
    return finish(await mutation.retry(), captured, owner)
  }

  return reactive({ baseline, record, reading, mutation, open, save, resume, check, retry,
    failure: computed(() => mutation.failure.value instanceof ApiFailure ? mutation.failure.value : null),
    message: computed(() => message.value || mutation.message.value), readCurrent: () => baseline.value ? read(baseline.value.item.id) : null,
    fieldError: (field: string) => mutation.failure.value instanceof ApiFailure
      ? Object.entries(mutation.failure.value.errors).find(([name]) => name.toLowerCase() === field.toLowerCase())?.[1]?.join('；')
      : undefined })
}

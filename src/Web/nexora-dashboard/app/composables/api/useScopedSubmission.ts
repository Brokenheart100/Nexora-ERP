import { useDashboardApi } from './useDashboardApi'
import { useLiveSessionStore } from '~/stores/liveSession'
import { useLiveMutation } from '~/composables/useLiveMutation'
import { ApiFailure, type ApiResponse } from '~/utils/api/client'
import { createSubmissionStore, type SavedSubmission } from '~/utils/api/submission'
import { changeReceiptSchema, type ChangeReceipt } from '#shared/types/wire'

/** Persist one frozen operation per service form, identity and workspace. */
export function useScopedSubmission<T = ChangeReceipt>(namespace: string, allowed: () => boolean,
  parse: (value: unknown) => T = changeReceiptSchema.parse as (value: unknown) => T) {
  const session = useLiveSessionStore()
  const api = useDashboardApi()
  const mutation = useLiveMutation<T>()
  const ledger = import.meta.client ? createSubmissionStore(namespace, sessionStorage) : null
  const record = shallowRef<SavedSubmission | null>(null)
  const owner = computed(() => JSON.stringify([session.user?.subject, session.activeWorkspaceId, session.access?.authorizationVersion, session.epoch]))
  const localError = ref('')
  function load() {
    record.value = allowed() && session.user ? ledger?.read(session.user.subject, session.activeWorkspaceId) ?? null : null
  }
  watch(owner, () => {
    mutation.resetScope()
    localError.value = ''
    load()
  }, { immediate: true, flush: 'sync' })
  watch(allowed, load)
  const make = (saved: SavedSubmission) => api.createWrite<T>(saved.path, saved.payload, { method: saved.method, etag: saved.etag,
    operationId: saved.operationId, idempotent: true, parse })
  function finish(result: ApiResponse<T> | null, saved: SavedSubmission, captured: string) {
    if (captured !== owner.value) return false
    const failure = mutation.failure.value
    if (result || (failure instanceof ApiFailure && !mutation.unknown.value && failure.kind !== 'mfa')) {
      ledger?.remove(saved.subject, saved.workspaceId, saved.operationId)
      record.value = null
    } else if (failure instanceof ApiFailure && failure.kind === 'mfa' && !mutation.unknown.value) {
      record.value = { ...saved, state: 'mfa' }
      ledger?.save(record.value)
    }
    return !!result
  }
  async function send(action: string, path: string, payload: Record<string, unknown>, options: { etag?: string, resourceId?: string, warehouseId?: string, draft?: Record<string, unknown>, method?: 'POST' | 'PUT' } = {}) {
    if (!allowed() || !session.user || mutation.busy.value || record.value) return false
    const captured = owner.value
    const saved: SavedSubmission = { subject: session.user.subject, workspaceId: session.activeWorkspaceId, operationId: crypto.randomUUID(),
      path, action, payload: structuredClone(toRaw(payload)), draft: options.draft, method: options.method ?? 'POST', etag: options.etag, resourceId: options.resourceId, warehouseId: options.warehouseId, state: 'unknown' }
    try {
      ledger?.save(saved)
      record.value = saved
      mutation.reset()
      return finish(await mutation.run(() => make(saved)), saved, captured)
    } catch (failure) {
      if (captured === owner.value) localError.value = failure instanceof Error ? failure.message : '提交暂不可用。'
      return false
    }
  }
  function resume() {
    const saved = record.value
    if (!saved || !allowed() || mutation.busy.value) return null
    mutation.resetScope()
    if (saved.state === 'mfa') {
      ledger?.remove(saved.subject, saved.workspaceId, saved.operationId)
      record.value = null
    } else {
      const operation = make(saved)
      operation.state = 'unknown'
      mutation.operation.value = operation
    }
    return saved
  }
  async function check(read: (saved: SavedSubmission) => Promise<T | null>) {
    const saved = record.value
    if (!saved || !allowed()) return false
    const captured = owner.value
    return finish(await mutation.check(async () => {
      const value = await read(saved)
      return value ? { status: 200, data: value, headers: new Headers() } : null
    }), saved, captured)
  }
  async function retry() {
    const saved = record.value
    const captured = owner.value
    if (saved && mutation.operation.value?.retryAvailable && !mutation.busy.value && allowed()) {
      const result = await mutation.retry()
      const failure = mutation.failure.value
      if (captured === owner.value && !result && failure instanceof ApiFailure && [401, 403, 404].includes(failure.status)) {
        const operation = make(saved)
        operation.state = 'unknown'
        mutation.operation.value = operation
        return false
      }
      return finish(result, saved, captured)
    }
    return false
  }
  return reactive({ owner, mutation, record, send, resume, check, retry,
    result: computed(() => mutation.operation.value?.result?.data ?? null),
    fieldError: (field: string) => mutation.failure.value instanceof ApiFailure
      ? Object.entries(mutation.failure.value.errors).find(([name]) => [field.toLowerCase(), 'profile.' + field.toLowerCase()].includes(name.toLowerCase()))?.[1]?.join('；')
      : undefined,
    failure: computed(() => mutation.failure.value instanceof ApiFailure ? mutation.failure.value : null),
    message: computed(() => localError.value || mutation.message.value),
    reset: () => {
      if (!record.value) {
        mutation.reset()
        localError.value = ''
      }
    } })
}

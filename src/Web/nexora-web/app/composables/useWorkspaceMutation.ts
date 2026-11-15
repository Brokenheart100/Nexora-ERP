// An ambiguous response keeps the operation ID so a manual retry can confirm the result.
export function useWorkspaceMutation() {
  const pending = new Map<string, { payload: string; operationId: string }>()

  return async function submit<T>(key: string, path: string, method: 'POST' | 'PUT', payload: object) {
    const serialized = JSON.stringify([method, path, payload])
    const previous = pending.get(key)
    const operationId = previous?.payload === serialized ? previous.operationId : crypto.randomUUID()
    pending.set(key, { payload: serialized, operationId })

    const csrf = await $fetch<{ requestToken: string }>('/bff/antiforgery', { retry: 0 })
    const result = await $fetch<T>(path, {
      method, body: { ...payload, operationId }, headers: { 'X-CSRF-TOKEN': csrf.requestToken }, retry: 0,
    })
    pending.delete(key)
    return result
  }
}

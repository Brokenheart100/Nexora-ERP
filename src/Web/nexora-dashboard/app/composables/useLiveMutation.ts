import { computed, ref, shallowRef, triggerRef } from 'vue'
import { ApiFailure, ResultUnknownError, type ApiResponse, type WriteOperation } from '~/utils/api/client'

export function useLiveMutation<T>() {
  const operation = shallowRef<WriteOperation<T> | null>(null)
  const busy = ref(false)
  const message = ref('')
  const failure = shallowRef<Error | null>(null)
  const unknown = computed(() => operation.value?.state === 'unknown')
  let generation = 0

  function rejected(error: unknown) {
    failure.value = error instanceof Error ? error : new Error('操作未完成。')
    message.value = error instanceof ApiFailure && error.kind === 'version'
      ? '记录已被修改，输入已保留。请读取当前记录后核对。'
      : failure.value.message
    if (operation.value?.state === 'rejected') operation.value = null
  }

  async function perform(send: () => Promise<ApiResponse<T>>) {
    if (busy.value) return null
    busy.value = true
    message.value = ''
    failure.value = null
    const current = generation
    try {
      const result = await send()
      return current === generation ? result : null
    } catch (error) {
      if (current === generation) rejected(error)
      return null
    } finally {
      if (current === generation) {
        busy.value = false
        triggerRef(operation)
      }
    }
  }

  async function run(make: () => WriteOperation<T>) {
    if (busy.value) return null
    if (unknown.value) {
      message.value = new ResultUnknownError().message
      return null
    }
    return perform(async () => {
      operation.value ??= make()
      return operation.value.send()
    })
  }

  async function check(read: () => Promise<ApiResponse<T> | null>) {
    if (!unknown.value || !operation.value || busy.value) return null
    busy.value = true
    const current = generation
    const submission = operation.value
    try {
      const applied = await submission.readBack(async () => {
        const result = await read()
        return result ? { applied: true, result } : { applied: false }
      })
      if (current !== generation) return null
      message.value = applied ? '已确认本次操作。' : '已读取当前记录，尚无法确认本次提交，可明确重试原操作。'
      return applied ? submission.result! : null
    } catch (error) {
      if (current === generation) rejected(error)
      return null
    } finally {
      if (current === generation) {
        busy.value = false
        triggerRef(operation)
      }
    }
  }

  function reset() {
    if (busy.value || unknown.value) return
    resetScope()
  }

  function resetScope() {
    generation++
    busy.value = false
    operation.value = null
    message.value = ''
    failure.value = null
  }

  return { operation, busy, message, failure, unknown, run, check, reset, resetScope,
    retry: () => perform(async () => {
      if (!operation.value) throw new ResultUnknownError()
      return operation.value.retryExplicitly()
    }) }
}

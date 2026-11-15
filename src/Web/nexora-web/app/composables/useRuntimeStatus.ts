import type { RuntimeStatus } from '~/utils/runtimeStatus'
import { isRuntimeBlocked, parseRuntimeStatus } from '~/utils/runtimeStatus'

const status = shallowRef<RuntimeStatus>(parseRuntimeStatus(null))
const checkedAt = ref(0)
const refreshing = ref(false)

let started = false
let timer: number | undefined
let inflight: Promise<void> | null = null

async function refresh(): Promise<void> {
  if (inflight) return inflight
  refreshing.value = true
  inflight = (async () => {
    try {
      const payload = await $fetch<unknown>('/bff/status', {
        retry: 0,
        timeout: 5000,
        headers: { Accept: 'application/json' },
      })
      status.value = parseRuntimeStatus(payload)
      checkedAt.value = Date.now()
    } catch {
      // Keep the last known state; the next poll retries.
    }
  })()
  try {
    await inflight
  } finally {
    inflight = null
    refreshing.value = false
  }
}

function checkWhenVisible(): void {
  if (document.visibilityState === 'visible') void refresh()
}

export function startRuntimePolling(intervalMs: number): void {
  if (started || typeof window === 'undefined') return
  started = true
  void refresh()
  timer = window.setInterval(checkWhenVisible, intervalMs)
  document.addEventListener('visibilitychange', checkWhenVisible)
  window.addEventListener('focus', checkWhenVisible)
  window.addEventListener('online', checkWhenVisible)
}

export function stopRuntimePolling(): void {
  if (typeof window === 'undefined') return
  if (timer !== undefined) window.clearInterval(timer)
  timer = undefined
  started = false
  document.removeEventListener('visibilitychange', checkWhenVisible)
  window.removeEventListener('focus', checkWhenVisible)
  window.removeEventListener('online', checkWhenVisible)
}

export function useRuntimeStatus() {
  return {
    status: readonly(status),
    blocked: computed(() => isRuntimeBlocked(status.value)),
    checkedAt: readonly(checkedAt),
    refreshing: readonly(refreshing),
    refresh,
  }
}

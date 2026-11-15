import type { RuntimeBuildInfo } from '~/utils/runtimeStatus'
import { isNewBuild, parseBuildInfo, versionSnoozeMs } from '~/utils/runtimeStatus'

const initial = shallowRef<RuntimeBuildInfo | null>(null)
const latest = shallowRef<RuntimeBuildInfo | null>(null)
const dismissedFor = ref('')

let started = false
let timer: number | undefined
let snoozeTimer: number | undefined
let inflight: Promise<void> | null = null

async function refresh(): Promise<void> {
  if (inflight) return inflight
  inflight = (async () => {
    try {
      const payload = await $fetch<unknown>('/bff/version', {
        retry: 0,
        timeout: 5000,
        headers: { Accept: 'application/json' },
      })
      const info = parseBuildInfo(payload)
      if (!info) return
      if (!initial.value) initial.value = info
      latest.value = info
    } catch {
      // Transient failures are retried by the next poll.
    }
  })()
  try {
    await inflight
  } finally {
    inflight = null
  }
}

function checkWhenVisible(): void {
  if (document.visibilityState === 'visible') void refresh()
}

export function startVersionPolling(intervalMs: number): void {
  if (started || typeof window === 'undefined') return
  started = true
  void refresh()
  timer = window.setInterval(checkWhenVisible, intervalMs)
  document.addEventListener('visibilitychange', checkWhenVisible)
  window.addEventListener('focus', checkWhenVisible)
  window.addEventListener('online', checkWhenVisible)
}

export function stopVersionPolling(): void {
  if (typeof window === 'undefined') return
  if (timer !== undefined) window.clearInterval(timer)
  timer = undefined
  started = false
  document.removeEventListener('visibilitychange', checkWhenVisible)
  window.removeEventListener('focus', checkWhenVisible)
  window.removeEventListener('online', checkWhenVisible)
}

export function useBuildVersion() {
  const updateAvailable = computed(() => isNewBuild(initial.value, latest.value)
    && latest.value?.buildId !== dismissedFor.value)
  function dismiss(): void {
    const current = latest.value
    if (!current) return
    dismissedFor.value = current.buildId
    if (snoozeTimer !== undefined) window.clearTimeout(snoozeTimer)
    snoozeTimer = window.setTimeout(() => {
      dismissedFor.value = ''
    }, versionSnoozeMs)
  }
  function reload(): void {
    window.location.reload()
  }
  return {
    version: computed(() => latest.value?.version ?? ''),
    buildId: computed(() => latest.value?.buildId ?? ''),
    updateAvailable,
    dismiss,
    reload,
  }
}

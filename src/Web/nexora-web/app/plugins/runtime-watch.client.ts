import { startRuntimePolling } from '~/composables/runtime/useRuntimeStatus'
import { startVersionPolling } from '~/composables/runtime/useBuildVersion'

function pollMs(value: unknown, fallback: number): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 1000 ? parsed : fallback
}

export default defineNuxtPlugin(() => {
  const config = useRuntimeConfig()
  startRuntimePolling(pollMs(config.public.statusPollMs, 10_000))
  startVersionPolling(pollMs(config.public.versionPollMs, 60_000))
})

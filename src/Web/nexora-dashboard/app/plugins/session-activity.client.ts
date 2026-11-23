import { useAccountSecurityApi } from '~/composables/api/useAccountSecurityApi'
import { useBrowserSessionPolicy } from '~/composables/useBrowserSessionPolicy'

export default defineNuxtPlugin({
  name: 'dashboard-session-activity',
  dependsOn: ['dashboard-auth-session'],
  setup() {
    const auth = useAuthSessionStore()
    if (!auth.connected) return
    const workspace = useLiveSessionStore()
    const api = useAccountSecurityApi()
    const { snapshot, refresh, recordActivity, clear } = useBrowserSessionPolicy()
    let lastAttempt = 0
    let pending = false
    let deadline: ReturnType<typeof setTimeout> | undefined

    function schedule() {
      clearTimeout(deadline)
      const policy = snapshot.value
      if (!auth.user || !policy) return
      const remaining = policy.lastSeenAt + policy.idleTimeoutMinutes * 60_000 - Date.now()
      deadline = setTimeout(async () => {
        await refresh()
        if (snapshot.value === policy && auth.user) schedule()
      }, Math.max(5000, remaining + 100))
    }

    async function activity(event: Event) {
      const subject = auth.user?.subject
      const now = Date.now()
      if (!subject || !event.isTrusted || document.visibilityState !== 'visible' || pending || now - lastAttempt < 15_000) return
      lastAttempt = now
      pending = true
      try {
        const { data } = await api.activity()
        if (subject === auth.user?.subject) {
          if (snapshot.value) recordActivity(data)
          else await refresh()
        }
      } catch {
        // A later explicit interaction or read can confirm the server's status.
      } finally {
        pending = false
      }
    }

    const onFocus = () => {
      if (auth.user) void refresh()
    }
    watch(() => auth.user?.subject, (subject) => {
      lastAttempt = 0
      clear()
      if (subject) void refresh()
    }, { immediate: true, flush: 'sync' })
    watch(() => workspace.activeWorkspaceId, (value, previous) => {
      if (value && value !== previous && auth.user) void refresh(true)
    })
    watch(snapshot, schedule)
    window.addEventListener('pointerdown', activity, { passive: true })
    window.addEventListener('keydown', activity)
    window.addEventListener('focus', onFocus)
    if (import.meta.hot) import.meta.hot.dispose(() => {
      clearTimeout(deadline)
      window.removeEventListener('pointerdown', activity)
      window.removeEventListener('keydown', activity)
      window.removeEventListener('focus', onFocus)
    })
  }
})

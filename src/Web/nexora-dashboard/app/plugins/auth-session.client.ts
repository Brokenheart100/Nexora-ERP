import { useAuthSessionStore } from '~/stores/authSession'

export default defineNuxtPlugin({
  name: 'dashboard-auth-session',
  dependsOn: ['msw', 'dashboard-https-entry'],
  setup() {
    const config = useRuntimeConfig().public
    if (config.dataMode === 'live' && URL.parse(config.bffOrigin)?.origin !== window.location.origin) return
    const auth = useAuthSessionStore()
    if (!auth.connected) return
    const refresh = () => {
      void auth.refresh()
    }
    window.addEventListener('focus', refresh)
    if (import.meta.hot) import.meta.hot.dispose(() => window.removeEventListener('focus', refresh))
    return auth.refresh()
  }
})

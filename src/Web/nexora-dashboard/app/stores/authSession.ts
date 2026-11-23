import { defineStore } from 'pinia'
import { $fetch } from '#imports'
import { sessionSchema, type WireSession } from '#shared/types/wire'
import { csrfTokenSchema, securityCapabilitiesSchema, type SessionSecurity } from '#shared/types/auth'

/** BFF identity only. Business data and workspace authorization are integrated in later stages. */
export const useAuthSessionStore = defineStore('auth-session', () => {
  const config = useRuntimeConfig().public
  const connected = computed(() => config.dataMode === 'live' || config.apiMocking === true)
  const simulated = computed(() => config.apiMocking === true)
  const user = ref<WireSession | null>(null)
  const security = ref<SessionSecurity | null>(null)
  const loading = ref(false)
  const loggingOut = ref(false)
  const ready = ref(false)
  const error = ref('')
  let generation = 0

  function clear() {
    generation++
    user.value = null
    security.value = null
  }

  function unauthorized(failure: unknown) {
    return (failure as { statusCode?: number })?.statusCode === 401
  }

  function expire(reason = '') {
    clear()
    loading.value = false
    ready.value = true
    error.value = reason
  }

  async function refresh() {
    if (!connected.value || loggingOut.value) return
    const current = ++generation
    loading.value = true
    error.value = ''
    security.value = null
    try {
      const identity = sessionSchema.parse(await $fetch('/bff/me', { retry: 0, timeout: 10_000 }))
      if (current !== generation) return
      user.value = identity
      try {
        const capabilities = securityCapabilitiesSchema.parse(await $fetch('/bff/security/capabilities', { retry: 0, timeout: 10_000 }))
        if (current === generation) security.value = capabilities
      } catch (failure) {
        if (current !== generation) return
        if (unauthorized(failure)) user.value = null
        else error.value = 'auth.securityUnavailable'
      }
    } catch (failure) {
      if (current !== generation) return
      user.value = null
      if (!unauthorized(failure)) error.value = 'auth.sessionUnavailable'
      else if ((failure as { data?: { data?: { code?: string } } }).data?.data?.code === 'session.idle_timeout') error.value = 'auth.idleTimeout'
    } finally {
      if (current === generation) {
        loading.value = false
        ready.value = true
      }
    }
  }

  async function logout() {
    if (loggingOut.value || !connected.value) return
    loggingOut.value = true
    error.value = ''
    try {
      const csrf = csrfTokenSchema.parse(await $fetch('/bff/antiforgery', { retry: 0, timeout: 10_000 }))
      clear()
      loading.value = false
      const form = document.createElement('form')
      form.method = 'POST'
      form.action = '/bff/logout'
      const field = document.createElement('input')
      field.type = 'hidden'
      field.name = '__RequestVerificationToken'
      field.value = csrf.requestToken
      form.appendChild(field)
      document.body.appendChild(form)
      form.submit()
    } catch (failure) {
      if (unauthorized(failure)) clear()
      error.value = 'auth.logoutIncomplete'
    } finally {
      loggingOut.value = false
    }
  }

  return { connected, simulated, user, security, loading, loggingOut, ready, error, refresh, logout, expire }
})

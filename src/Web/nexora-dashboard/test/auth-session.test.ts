import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useRuntimeConfig } from '#app'
import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import { useAuthSessionStore } from '../app/stores/authSession'

const request = vi.hoisted(() => vi.fn())
mockNuxtImport('$fetch', () => request)
const capabilities = { available: true, required: true, enrolled: true, methods: ['otp'], stepUpSeconds: 300, lastVerifiedAt: new Date().toISOString(), reauthPath: '/bff/login?prompt=login' }
beforeEach(() => {
  setActivePinia(createPinia())
  const settings = useRuntimeConfig().public
  settings.dataMode = 'live'
  settings.apiMocking = false
  request.mockReset()
})
afterEach(() => {
  useRuntimeConfig().public.dataMode = 'mock'
  useRuntimeConfig().public.apiMocking = false
  vi.restoreAllMocks()
  document.querySelectorAll('form[action="/bff/logout"]').forEach(form => form.remove())
})

describe('original UI authentication session', () => {
  it('keeps the pure prototype offline and explicitly enables MSW sessions', async () => {
    const settings = useRuntimeConfig().public
    settings.dataMode = 'mock'
    const auth = useAuthSessionStore()
    await auth.refresh()
    expect(request).not.toHaveBeenCalled()
    settings.apiMocking = true
    setActivePinia(createPinia())
    expect(useAuthSessionStore().connected).toBe(true)
  })

  it('uses the BFF identity and verified MFA summary without retaining token fields', async () => {
    request.mockResolvedValueOnce({ subject: 'alice-id', name: 'alice', accessToken: 'must-not-be-kept' }).mockResolvedValueOnce(capabilities)
    const auth = useAuthSessionStore()
    await auth.refresh()
    expect(auth.user).toEqual({ subject: 'alice-id', name: 'alice' })
    expect(auth.security?.enrolled).toBe(true)
    expect(auth.error).toBe('')
    expect(auth.ready).toBe(true)
  })

  it('distinguishes an expired session from an unavailable session store', async () => {
    const auth = useAuthSessionStore()
    request.mockRejectedValueOnce({ statusCode: 401 })
    await auth.refresh()
    expect(auth.user).toBeNull()
    expect(auth.error).toBe('')
    request.mockRejectedValueOnce({ statusCode: 503 })
    await auth.refresh()
    expect(auth.user).toBeNull()
    expect(auth.error).not.toBe('')
  })

  it('keeps an older account response from replacing a newer identity', async () => {
    let resolveOld!: (value: unknown) => void
    request.mockImplementationOnce(() => new Promise((resolve) => {
      resolveOld = resolve
    }))
      .mockResolvedValueOnce({ subject: 'bob-id', name: 'bob' }).mockResolvedValueOnce(capabilities)
    const auth = useAuthSessionStore()
    const old = auth.refresh()
    await auth.refresh()
    resolveOld({ subject: 'alice-id', name: 'alice' })
    await old
    expect(auth.user?.name).toBe('bob')
  })

  it('does not report verified MFA when capabilities are unavailable', async () => {
    request.mockResolvedValueOnce({ subject: 'alice-id', name: 'alice' }).mockRejectedValueOnce({ statusCode: 503 })
    const auth = useAuthSessionStore()
    await auth.refresh()
    expect(auth.user?.name).toBe('alice')
    expect(auth.security).toBeNull()
    expect(auth.error).not.toBe('')
  })

  it('keeps the identity when logout cannot obtain CSRF, and clears late reads after a valid logout', async () => {
    const auth = useAuthSessionStore()
    request.mockResolvedValueOnce({ subject: 'alice-id', name: 'alice' }).mockResolvedValueOnce(capabilities)
    await auth.refresh()
    request.mockRejectedValueOnce({ statusCode: 503 })
    await auth.logout()
    expect(auth.user?.name).toBe('alice')
    expect(auth.error).not.toBe('')
    let resolveOld!: (value: unknown) => void
    request.mockImplementationOnce(() => new Promise((resolve) => {
      resolveOld = resolve
    }))
    const pending = auth.refresh()
    request.mockResolvedValueOnce({ requestToken: 'test-only-csrf' })
    vi.spyOn(HTMLFormElement.prototype, 'submit').mockImplementation(() => {})
    await auth.logout()
    resolveOld({ subject: 'alice-id', name: 'alice' })
    await pending
    expect(auth.user).toBeNull()
  })
})

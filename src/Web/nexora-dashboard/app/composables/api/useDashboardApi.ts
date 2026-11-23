import { createApiClient } from '~/utils/api/client'
import type { DashboardApi } from '~/utils/api/client'
import { RequestScope } from '~/utils/api/scope'
import { useAuthSessionStore } from '~/stores/authSession'

const runtimes = new WeakMap<object, DashboardApi>()

export function useDashboardMode(): 'mock' | 'live' {
  const mode = useRuntimeConfig().public.dataMode
  if (mode !== 'mock' && mode !== 'live') throw createError({ statusCode: 503, statusMessage: 'Dashboard data mode unavailable' })
  return mode
}

export function useDashboardApi(owner: 'workspace' | 'account' = 'workspace'): DashboardApi {
  const app = useNuxtApp()
  const existing = runtimes.get(app)
  if (owner === 'workspace' && existing) return existing
  const mode = useDashboardMode()
  const auth = useAuthSessionStore()
  const scope = new RequestScope({ mode, subject: '', workspaceId: '', authorizationVersion: '' })
  const client = createApiClient(scope, async (path, options) => {
    const response = await $fetch.raw<unknown>(path, {
      ...options, retry: 0, ignoreResponseError: true, redirect: 'error',
      responseType: options.responseType ?? 'json'
    })
    return { status: response.status, data: response._data, headers: response.headers }
  }, { onFailure: (failure) => {
    if (failure.status === 401) auth.expire(failure.code === 'session.idle_timeout' ? 'auth.idleTimeout' : '')
  } })
  if (owner === 'account') {
    watch(() => auth.user?.subject ?? '', (subject) => {
      scope.change({ mode, subject, workspaceId: '', authorizationVersion: '' })
    }, { immediate: true, flush: 'sync' })
  } else runtimes.set(app, client)
  return client
}

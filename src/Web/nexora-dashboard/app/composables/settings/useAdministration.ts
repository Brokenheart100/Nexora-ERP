import type { WriteOperation } from '~/utils/api/client'
import { ApiFailure } from '~/utils/api/client'
import { loginDestination } from '#shared/utils/auth-navigation'
import { useWorkspaceAdministration } from '../api/useWorkspaceAdministration'
import { useWorkspaceQuery } from '../api/useWorkspaceQuery'
import { useLiveMutation } from '../useLiveMutation'

export function useAdministration(requestScope: 'workspace' | 'account' = 'workspace') {
  const auth = useAuthSessionStore()
  const session = useLiveSessionStore()
  const api = useWorkspaceAdministration(requestScope)
  const owner = () => JSON.stringify([auth.user?.subject, session.activeWorkspaceId, session.epoch])
  const workspace = () => session.activeWorkspaceId
  const allows = (permission: string) => session.access?.permissions.includes('organization.' + permission) === true
  return { auth, session, api, owner, workspace, allows }
}

export function useAdministrationVersion() {
  const api = useWorkspaceAdministration()
  return useWorkspaceQuery('administration-revision', '/settings', api.access)
}

export function useAdministrationMutation<T>(owner: () => string) {
  const auth = useAuthSessionStore()
  const route = useRoute()
  const mutation = useLiveMutation<T>()
  const confirmed = ref(false)
  const reviewed = ref(false)
  let onConfirmed: ((value: T) => Promise<unknown> | unknown) | undefined
  watch(owner, () => {
    mutation.resetScope()
    confirmed.value = false
    reviewed.value = false
    onConfirmed = undefined
  }, { flush: 'sync' })

  const reauthenticate = computed(() => {
    if (!(mutation.failure.value instanceof ApiFailure) || mutation.failure.value.kind !== 'mfa') return undefined
    const destination = route.path === '/join' ? '/join' : loginDestination(route.fullPath)
    return (auth.security?.reauthPath ?? '/bff/login?prompt=login') + '&returnTo=' + encodeURIComponent(destination)
  })

  async function complete(value: T) {
    mutation.reset()
    confirmed.value = true
    reviewed.value = false
    const callback = onConfirmed
    onConfirmed = undefined
    await callback?.(value)
  }

  async function run(make: () => WriteOperation<T>, onSuccess?: (value: T) => Promise<unknown> | unknown) {
    if (mutation.busy.value || mutation.unknown.value) return
    onConfirmed = onSuccess
    confirmed.value = false
    const result = await mutation.run(make)
    if (result) await complete(result.data)
  }

  async function retry() {
    if (!mutation.operation.value?.retryAvailable || mutation.busy.value) return
    reviewed.value = false
    const result = await mutation.retry()
    if (result) await complete(result.data)
  }

  async function readCurrent(read: () => Promise<unknown>) {
    const current = owner()
    if (!mutation.unknown.value) {
      try {
        await read()
        if (current === owner()) mutation.reset()
      } catch (failure) {
        if (current === owner()) mutation.message.value = failure instanceof Error ? failure.message : '读取当前记录失败。'
      }
      return
    }
    await mutation.check(async () => {
      await read()
      if (current === owner()) reviewed.value = true
      return null
    })
    if (reviewed.value) mutation.message.value = '已读取服务端记录。请核对当前状态后再发起新操作。'
  }

  function acknowledge() {
    if (!reviewed.value || mutation.busy.value) return
    reviewed.value = false
    mutation.resetScope()
  }

  return reactive({ ...mutation, confirmed, reviewed, reauthenticate, run, retry, readCurrent, acknowledge })
}

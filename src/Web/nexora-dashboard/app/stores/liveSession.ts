import { defineStore } from 'pinia'
import type { WireAccess, WireAccount, WireEntitlements, WireSession, WireWorkspace } from '#shared/types/wire'
import { useDashboardApi, useDashboardMode } from '~/composables/api/useDashboardApi'
import { useOrganizationApi } from '~/composables/api/useOrganizationApi'
import { ApiFailure } from '~/utils/api/client'
import { ScopeChangedError } from '~/utils/api/scope'
import { useInventoryApi } from '~/composables/api/useInventoryApi'
import type { WireWarehouses } from '#shared/types/prerequisites'

export const useLiveSessionStore = defineStore('live-session', () => {
  const api = useDashboardApi()
  const organization = useOrganizationApi()
  const inventory = useInventoryApi()
  const mode = useDashboardMode()
  const user = ref<WireSession | null>(null)
  const workspaces = ref<WireWorkspace[]>([])
  const activeWorkspaceId = ref('')
  const access = ref<WireAccess | null>(null)
  const account = ref<WireAccount | null>(null)
  const entitlements = ref<WireEntitlements | null>(null)
  const denied = ref(false)
  const inventoryDirectory = ref<WireWarehouses | null>(null)
  const ready = ref(false)
  const loading = ref(false)
  const error = ref('')
  const epoch = ref(0)
  const workspace = computed(() => workspaces.value.find(item => item.id === activeWorkspaceId.value) ?? null)

  function invalidate() {
    epoch.value++
    api.scope.change({ mode, subject: user.value?.subject ?? '', workspaceId: activeWorkspaceId.value, authorizationVersion: String(access.value?.authorizationVersion ?? '') })
    clearNuxtData()
  }

  function clearIdentity() {
    user.value = null
    account.value = null
    workspaces.value = []
    activeWorkspaceId.value = ''
    access.value = null
    entitlements.value = null
    inventoryDirectory.value = null
    denied.value = false
    invalidate()
  }

  async function selectWorkspace(id: string) {
    activeWorkspaceId.value = id
    access.value = null
    entitlements.value = null
    inventoryDirectory.value = null
    denied.value = !workspaces.value.some(item => item.id === id)
    error.value = ''
    invalidate()
    if (denied.value) return
    const selection = api.scope.capture()
    try {
      const [detail, permissions, billing] = await Promise.all([organization.workspace(id), organization.access(id), organization.entitlements(id)])
      let directoryNotice = ''
      const directory = billing.modules.includes('inventory')
        ? await inventory.warehouses(id).catch((failure) => {
            if (failure instanceof ScopeChangedError || (failure instanceof ApiFailure && failure.status === 401)) throw failure
            if (!(failure instanceof ApiFailure && [403, 404].includes(failure.status))) directoryNotice = '仓库权限暂时无法核对，请刷新后重试。'
            return null
          })
        : null
      api.scope.demand(selection)
      error.value = directoryNotice
      workspaces.value = workspaces.value.map(item => item.id === id ? detail : item)
      access.value = permissions
      entitlements.value = billing
      inventoryDirectory.value = directory
      invalidate()
    } catch (failure) {
      if (failure instanceof ScopeChangedError) return
      if (failure instanceof ApiFailure && failure.status === 401) clearIdentity()
      if (failure instanceof ApiFailure && [403, 404].includes(failure.status)) denied.value = true
      error.value = failure instanceof Error ? failure.message : '工作区暂不可用。'
    }
  }

  async function load(requestedWorkspace?: string) {
    loading.value = true
    error.value = ''
    try {
      const session = await organization.session()
      if (user.value?.subject !== session.subject) clearIdentity()
      user.value = session
      invalidate()
      workspaces.value = await organization.workspaces()
      account.value = await organization.account()
      const id = requestedWorkspace ?? (workspaces.value.some(item => item.id === activeWorkspaceId.value) ? activeWorkspaceId.value : workspaces.value[0]?.id)
      if (id) await selectWorkspace(id)
    } catch (failure) {
      if (failure instanceof ApiFailure && failure.status === 401) clearIdentity()
      else if (!(failure instanceof ScopeChangedError)) error.value = failure instanceof Error ? failure.message : '登录状态暂不可用。'
    } finally {
      ready.value = true
      loading.value = false
    }
  }

  async function logout() {
    const csrf = await $fetch<{ requestToken: string }>('/bff/antiforgery', { retry: 0 })
    clearIdentity()
    const form = document.createElement('form')
    form.method = 'POST'
    form.action = '/bff/logout'
    const input = document.createElement('input')
    input.type = 'hidden'
    input.name = '__RequestVerificationToken'
    input.value = csrf.requestToken
    form.appendChild(input)
    document.body.appendChild(form)
    form.submit()
  }

  return { user, account, workspaces, workspace, activeWorkspaceId, access, entitlements, inventoryDirectory, denied, ready, loading, error, epoch, load, selectWorkspace, logout, clearIdentity }
})

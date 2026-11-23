import { defineStore } from 'pinia'
import type { WireAccess, WireAccount, WireEntitlements, WireWorkspace } from '#shared/types/wire'
import { canVisitWorkspacePage } from '~/utils/organization/navigation'
import { useAuthSessionStore } from './authSession'
import { useDashboardApi, useDashboardMode } from '~/composables/api/useDashboardApi'
import { useOrganizationApi } from '~/composables/api/useOrganizationApi'
import { useInventoryApi } from '~/composables/api/useInventoryApi'
import { ApiFailure } from '~/utils/api/client'
import { ScopeChangedError } from '~/utils/api/scope'

/** Authorized workspace selection follows the canonical BFF identity. */
export const useLiveSessionStore = defineStore('live-session', () => {
  const auth = useAuthSessionStore()
  const api = useDashboardApi()
  const organization = useOrganizationApi()
  const inventoryApi = useInventoryApi()
  const inventoryVisible = ref(false)
  const mode = useDashboardMode()
  const nuxtApp = useNuxtApp()
  const route = useRoute()
  const user = computed(() => auth.user)
  const workspaces = ref<WireWorkspace[]>([])
  const activeWorkspaceId = ref('')
  const access = ref<WireAccess | null>(null)
  const account = ref<WireAccount | null>(null)
  const entitlements = ref<WireEntitlements | null>(null)
  const currentWorkspace = ref<WireWorkspace | null>(null)
  const ready = ref(false)
  const listing = ref(false)
  const selecting = ref(false)
  const error = ref('')
  const denied = ref(false)
  const epoch = ref(0)
  const loading = computed(() => listing.value || selecting.value)
  const workspace = computed(() => currentWorkspace.value)
  let listGeneration = 0
  let selectionGeneration = 0

  function invalidate() {
    api.scope.change({ mode, subject: auth.user?.subject ?? '', workspaceId: activeWorkspaceId.value,
      authorizationVersion: String(access.value?.authorizationVersion ?? '') })
    epoch.value++
    nuxtApp.runWithContext(() => clearNuxtData(key => key.startsWith('dashboard:')))
  }

  function clearIdentity() {
    listGeneration++
    selectionGeneration++
    workspaces.value = []
    activeWorkspaceId.value = ''
    access.value = null
    account.value = null
    entitlements.value = null
    currentWorkspace.value = null
    inventoryVisible.value = false
    denied.value = false
    listing.value = false
    selecting.value = false
    ready.value = false
    error.value = ''
    invalidate()
  }

  function failed(failure: unknown) {
    if (failure instanceof ScopeChangedError) return
    if (failure instanceof ApiFailure && failure.status === 401) auth.expire()
    else error.value = failure instanceof ApiFailure ? failure.message : '工作区暂不可用，请重试。'
  }

  async function selectWorkspace(id: string) {
    const current = ++selectionGeneration
    activeWorkspaceId.value = id
    access.value = null
    entitlements.value = null
    currentWorkspace.value = null
    inventoryVisible.value = false
    denied.value = !workspaces.value.some(item => item.id === id)
    error.value = ''
    invalidate()
    if (denied.value || !auth.user) return
    selecting.value = true
    try {
      const [details, permissions, plan] = await Promise.all([organization.workspace(id), organization.access(id), organization.entitlements(id)])
      if (current !== selectionGeneration) return
      const warehouses = plan.modules.includes('inventory') ? await inventoryApi.warehouses(id).catch(() => null) : null
      if (current !== selectionGeneration) return
      inventoryVisible.value = warehouses?.warehouses.some(value => value.canReadStock || value.canReceive) === true
      currentWorkspace.value = details
      entitlements.value = plan
      access.value = permissions
      invalidate()
    } catch (failure) {
      if (current !== selectionGeneration) return
      if (failure instanceof ApiFailure && [403, 404].includes(failure.status)) denied.value = true
      failed(failure)
    } finally {
      if (current === selectionGeneration) selecting.value = false
    }
  }

  async function load(requestedWorkspace?: string) {
    if (!auth.connected || !auth.user) return
    const current = ++listGeneration
    listing.value = true
    error.value = ''
    try {
      const [identity, result] = await Promise.all([organization.account(), organization.workspaces()])
      if (current !== listGeneration) return
      account.value = identity
      workspaces.value = result
      const requested = requestedWorkspace ?? (typeof route.query.workspace === 'string' ? route.query.workspace : undefined)
      const id = requested ?? (result.some(item => item.id === activeWorkspaceId.value) ? activeWorkspaceId.value : result[0]?.id)
      if (id) await selectWorkspace(id)
      else {
        activeWorkspaceId.value = ''
        access.value = null
        entitlements.value = null
        currentWorkspace.value = null
        inventoryVisible.value = false
        invalidate()
      }
    } catch (failure) {
      if (current === listGeneration) failed(failure)
    } finally {
      if (current === listGeneration) {
        listing.value = false
        ready.value = true
      }
    }
  }

  watch(() => auth.user?.subject ?? '', (subject) => {
    clearIdentity()
    if (auth.connected && subject) void load()
  }, { immediate: true, flush: 'sync' })

  watch(() => route.query.workspace, (id) => {
    if (auth.connected && auth.user && !listing.value && typeof id === 'string' && id !== activeWorkspaceId.value) void selectWorkspace(id)
  })

  return { user, account, workspaces, workspace, activeWorkspaceId, access, entitlements, denied, ready, loading, error, epoch,
    canVisit: (path: string) => canVisitWorkspacePage(path, access.value, entitlements.value, { warehouseVisible: inventoryVisible.value }),
    load, selectWorkspace, clearIdentity, refreshAccess: () => selectWorkspace(activeWorkspaceId.value) }
})

import { defineStore } from 'pinia'
import { computed, ref, shallowRef } from 'vue'
import type { Identity, Projection, Workspace } from '~/utils/workspace'
import { invitationCodeSchema, workspaceLabel, workspaceNameSchema } from '~/utils/workspace'

type MessageKey =
  | 'loadFailed'
  | 'nameInvalid'
  | 'created'
  | 'createConflict'
  | 'createAmbiguous'
  | 'projectionPending'
  | 'projectionUnavailable'
  | 'invitationInvalid'
  | 'joined'
  | 'invitationFailed'
  | 'logoutFailed'

export const useWorkspaceStore = defineStore('workspace', () => {
  const user = shallowRef<Identity | null>(null)
  const workspaces = shallowRef<Workspace[]>([])
  const selected = shallowRef<Workspace | null>(null)
  const projection = shallowRef<Projection | null>(null)
  const loaded = ref(false)
  const busy = ref(false)
  const accepting = ref(false)
  const loggingOut = ref(false)
  const logoutError = ref('')
  const messageKey = ref<MessageKey | ''>('')

  const displayName = computed(() => {
    const candidate = typeof user.value?.name === 'string' ? user.value.name.trim() : ''
    const subject = typeof user.value?.subject === 'string' ? user.value.subject.trim() : ''
    return candidate || subject
  })
  const personalWorkspaces = computed(() => workspaces.value
    .filter(workspace => workspace.isPersonal)
    .map(workspace => ({ id: workspace.id, name: workspaceLabel(workspace) })))

  let selectionVersion = 0
  let loadVersion = 0
  // Retain the operation id after an ambiguous response; a manual retry reuses the same intent.
  let intent: { operationId: string; name: string; personal: boolean } | undefined

  function reset() {
    user.value = null
    workspaces.value = []
    selected.value = null
    projection.value = null
    selectionVersion++
    loadVersion++
  }

  async function load() {
    const current = ++loadVersion
    loaded.value = true
    try {
      const identity = await $fetch<Identity>('/bff/me', { retry: 0 })
      if (current !== loadVersion) return
      user.value = identity
    } catch {
      if (current === loadVersion) reset()
      return
    }
    try {
      const loadedWorkspaces = await $fetch<Workspace[]>('/bff/api/workspaces', { retry: 0 })
      if (current !== loadVersion) return
      workspaces.value = (Array.isArray(loadedWorkspaces) ? loadedWorkspaces : [])
        .filter(workspace => Boolean(workspace) && typeof workspace === 'object')
        .map(workspace => ({
          ...workspace,
          name: typeof workspace.name === 'string' ? workspace.name.trim() : '',
        }))
      if (selected.value && !workspaces.value.some(workspace => workspace.id === selected.value!.id)) {
        selected.value = null
        projection.value = null
        selectionVersion++
      }
    } catch {
      if (current === loadVersion) messageKey.value = 'loadFailed'
    }
  }

  async function create(rawName: string, personal: boolean) {
    const parsed = workspaceNameSchema.safeParse(rawName)
    if (!parsed.success) {
      messageKey.value = 'nameInvalid'
      return false
    }
    busy.value = true
    messageKey.value = ''
    const name = parsed.data
    if (!intent || intent.name !== name || intent.personal !== personal)
      intent = { operationId: crypto.randomUUID(), name, personal }
    try {
      const csrf = await $fetch<{ requestToken: string }>('/bff/antiforgery', { retry: 0 })
      const created = await $fetch<Workspace>(personal ? '/bff/api/workspaces/personal' : '/bff/api/workspaces', {
        method: 'POST',
        body: { operationId: intent.operationId, name: intent.name },
        headers: { 'X-CSRF-TOKEN': csrf.requestToken },
        retry: 0,
      })
      intent = undefined
      await load()
      await select(workspaces.value.find(workspace => workspace.id === created.id)
        ?? { ...created, name: workspaceLabel(created) })
      messageKey.value = 'created'
      return true
    } catch (error) {
      messageKey.value = (error as { statusCode?: number }).statusCode === 409
        ? 'createConflict'
        : 'createAmbiguous'
      return false
    } finally {
      busy.value = false
    }
  }

  async function select(workspace: Workspace) {
    const version = ++selectionVersion
    selected.value = workspace
    projection.value = null
    try {
      const result = await $fetch<Projection | { status: string }>(
        `/bff/api/reports/workspaces/${workspace.id}`,
        { retry: 0 },
      )
      if (version !== selectionVersion) return
      if ('workspaceId' in result) projection.value = result
      else messageKey.value = 'projectionPending'
    } catch {
      if (version === selectionVersion) messageKey.value = 'projectionUnavailable'
    }
  }

  function navigateToWorkspace(id: string) {
    const workspace = workspaces.value.find(option => option.id === id)
    if (workspace) return select(workspace)
  }

  async function acceptInvitation(rawCode: string) {
    const parsed = invitationCodeSchema.safeParse(rawCode)
    if (!parsed.success) {
      messageKey.value = 'invitationInvalid'
      return false
    }
    const [id, token] = parsed.data.split('.')
    if (!id || !token) {
      messageKey.value = 'invitationInvalid'
      return false
    }
    accepting.value = true
    try {
      const csrf = await $fetch<{ requestToken: string }>('/bff/antiforgery', { retry: 0 })
      const result = await $fetch<{ workspaceId: string }>(`/bff/api/invitations/${id}/redeem`, {
        method: 'POST',
        body: { token },
        headers: { 'X-CSRF-TOKEN': csrf.requestToken },
        retry: 0,
      })
      await load()
      const workspace = workspaces.value.find(option => option.id === result.workspaceId)
      if (workspace) await select(workspace)
      messageKey.value = 'joined'
      return true
    } catch {
      await load()
      messageKey.value = 'invitationFailed'
      return false
    } finally {
      accepting.value = false
    }
  }

  async function logout() {
    if (loggingOut.value) return
    loggingOut.value = true
    logoutError.value = ''
    try {
      const csrf = await $fetch<{ requestToken?: string }>('/bff/antiforgery', { retry: 0 })
      const requestToken = csrf?.requestToken
      if (typeof requestToken !== 'string' || !requestToken) throw new Error('Missing CSRF request token')
      const form = document.createElement('form')
      form.method = 'post'
      form.action = '/bff/logout'
      const input = document.createElement('input')
      input.type = 'hidden'
      input.name = '__RequestVerificationToken'
      input.value = requestToken
      form.append(input)
      document.body.append(form)
      form.submit()
    } catch {
      logoutError.value = 'logoutFailed'
      loggingOut.value = false
    }
  }

  return {
    user,
    workspaces,
    selected,
    projection,
    loaded,
    busy,
    accepting,
    loggingOut,
    logoutError,
    messageKey,
    displayName,
    personalWorkspaces,
    load,
    create,
    select,
    navigateToWorkspace,
    acceptInvitation,
    logout,
  }
})

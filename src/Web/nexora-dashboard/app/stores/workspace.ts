import { defineStore } from 'pinia'
import type { Workspace } from '~/mocks'
import { currentWorkspaceId, workspaces } from '~/mocks'

/**
 * 当前工作区是跨页共享的 UI 状态，放在 Pinia。
 * 工作区列表仍来自 app/mocks，刷新页面后回到默认工作区。
 */
export const useWorkspaceStore = defineStore('workspace', () => {
  const activeWorkspaceId = ref(currentWorkspaceId)
  const workspace = computed<Workspace>(() => workspaces.find(item => item.id === activeWorkspaceId.value) ?? workspaces[0]!)

  function setWorkspace(id: string) {
    if (workspaces.some(item => item.id === id)) {
      activeWorkspaceId.value = id
    }
  }

  function reset() {
    activeWorkspaceId.value = currentWorkspaceId
  }

  return { workspaces, activeWorkspaceId, workspace, setWorkspace, reset }
})

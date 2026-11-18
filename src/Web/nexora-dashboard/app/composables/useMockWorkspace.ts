import { storeToRefs } from 'pinia'
import { useWorkspaceStore } from '~/stores/workspace'

/**
 * 兼容原有页面调用方式的工作区入口，实际状态由 Pinia 的 workspace store 持有。
 */
export function useMockWorkspace() {
  const store = useWorkspaceStore()
  const { workspace, activeWorkspaceId } = storeToRefs(store)

  return {
    workspaces: store.workspaces,
    workspace,
    activeWorkspaceId
  }
}

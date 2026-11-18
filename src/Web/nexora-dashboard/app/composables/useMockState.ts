import type { MockState } from '~/mocks'
import { mockStateSchema } from '~/utils/mockSchemas'

/**
 * 从 URL 的 ?state=loading|empty|error|forbidden 读取演示状态。
 * 列表页用它在本地切换骨架、空态、错误与无权限呈现。
 */
export function useMockState() {
  const route = useRoute()

  const state = computed<MockState | null>(() => {
    const parsed = mockStateSchema.safeParse(route.query.state)
    return parsed.success ? parsed.data : null
  })

  return {
    state,
    isLoading: computed(() => state.value === 'loading'),
    isEmpty: computed(() => state.value === 'empty'),
    isError: computed(() => state.value === 'error'),
    isForbidden: computed(() => state.value === 'forbidden')
  }
}

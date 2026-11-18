import type { Permission } from '~/mocks'
import { mockStateSchema } from '~/utils/mockSchemas'
import { useSessionStore } from '~/stores/session'

/**
 * 纯 UI 阶段的权限判断。?state=forbidden 会覆盖为无权限，用于演示权限空态。
 * 真实权限校验必须在服务端完成，这里只影响界面呈现。
 */
export function useMockPermissions() {
  const route = useRoute()
  const session = useSessionStore()

  const forcedForbidden = computed(() => {
    const parsed = mockStateSchema.safeParse(route.query.state)
    return parsed.success && parsed.data === 'forbidden'
  })

  function can(permission: Permission) {
    return !forcedForbidden.value && session.can(permission)
  }

  return { can, forcedForbidden }
}

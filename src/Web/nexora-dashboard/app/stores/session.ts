import { defineStore } from 'pinia'
import type { DemoSession, DemoUser, Permission } from '~/mocks'
import { demoUser, demoSessions } from '~/mocks'

export const ALL_PERMISSIONS: Permission[] = [
  'dashboard.view',
  'catalog.view',
  'catalog.edit',
  'purchase.view',
  'purchase.create',
  'purchase.approve',
  'sales.view',
  'sales.create',
  'inventory.view',
  'inventory.adjust',
  'finance.view',
  'finance.post',
  'settings.view',
  'settings.manage'
]

/**
 * 纯 UI 阶段的演示身份与权限。用户、会话与 MFA 状态全部来自 app/mocks/identity.ts，
 * 真实登录、会话与鉴权在后续接入阶段实现。
 */
export const useSessionStore = defineStore('session', () => {
  const user = ref<DemoUser>({ ...demoUser })
  const sessions = ref<DemoSession[]>(demoSessions.map(session => ({ ...session })))
  const permissions = ref<Permission[]>([...ALL_PERMISSIONS])

  const currentSession = computed(() => sessions.value.find(session => session.current))

  function can(permission: Permission) {
    return permissions.value.includes(permission)
  }

  /** 只读演示：把「结束其他会话」表现为移除本地会话列表，不涉及真实令牌。 */
  function endOtherSessions() {
    sessions.value = sessions.value.filter(session => session.current)
  }

  function reset() {
    user.value = { ...demoUser }
    sessions.value = demoSessions.map(session => ({ ...session }))
    permissions.value = [...ALL_PERMISSIONS]
  }

  return { user, sessions, currentSession, permissions, can, endOtherSessions, reset }
})

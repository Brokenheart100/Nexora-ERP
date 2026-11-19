import { defineStore } from 'pinia'
import type { DemoSession, DemoUser, Permission } from '~/mocks'
import { securityProfileByKey, securityProfiles } from '~/mocks'

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
 * 纯 UI 阶段的演示身份与权限。用户、会话、登录渠道与注销预检来自 app/mocks/security.ts，
 * 切换身份会同步账户菜单、设备列表、MFA 状态与预检结果。
 */
export const useSessionStore = defineStore('session', () => {
  const profileKey = ref(securityProfiles[0]!.key)
  const profile = computed(() => securityProfileByKey(profileKey.value))
  const user = ref<DemoUser>(toUser(profile.value))
  const sessions = ref<DemoSession[]>(cloneSessions(profile.value.sessions))
  const permissions = ref<Permission[]>([...profile.value.permissions])
  const stepUpVerified = ref(profile.value.stepUpVerified)
  const stepUpDetail = ref(profile.value.stepUpDetail)

  const currentSession = computed(() => sessions.value.find(session => session.current))
  const activeSessions = computed(() => sessions.value.filter(session => session.status !== 'revoked'))
  const otherActiveSessions = computed(() => activeSessions.value.filter(session => !session.current))
  const identityOptions = computed(() => securityProfiles.map(item => ({
    label: item.name + ' · ' + item.title,
    value: item.key
  })))

  function toUser(value: typeof profile.value): DemoUser {
    return {
      id: 'user-' + value.key,
      name: value.name,
      title: value.title,
      email: value.email,
      avatarIcon: value.avatarIcon,
      mfaEnabled: value.mfaEnabled,
      lastLoginAt: value.lastLoginAt,
      role: value.role,
      roleLabel: value.roleLabel
    }
  }

  function cloneSessions(items: DemoSession[]) {
    return items.map(item => ({ ...item }))
  }

  function can(permission: Permission) {
    return permissions.value.includes(permission)
  }

  function switchIdentity(key: string) {
    const next = securityProfileByKey(key)
    profileKey.value = next.key
    user.value = toUser(next)
    sessions.value = cloneSessions(next.sessions)
    permissions.value = [...next.permissions]
    stepUpVerified.value = next.stepUpVerified
    stepUpDetail.value = next.stepUpDetail
  }

  /** 单个撤销：保留记录并标记已撤销，便于核对设备历史。 */
  function revokeSession(id: string) {
    const target = sessions.value.find(session => session.id === id)
    if (!target || target.current || target.status === 'revoked') return false
    target.status = 'revoked'
    target.lastActiveAt = '已于刚刚撤销'
    return true
  }

  /** 批量撤销其他设备。 */
  function endOtherSessions() {
    let count = 0
    for (const item of sessions.value) {
      if (!item.current && item.status !== 'revoked') {
        item.status = 'revoked'
        item.lastActiveAt = '已于刚刚撤销'
        count += 1
      }
    }
    return count
  }

  /** 延长当前会话 30 分钟，清除临期提示。 */
  function extendCurrentSession() {
    const current = currentSession.value
    if (!current) return
    current.expiresInMinutes += 30
    const next = new Date(Date.now() + current.expiresInMinutes * 60_000)
    const pad = (value: number) => String(value).padStart(2, '0')
    current.expiresAt = next.getFullYear() + '-' + pad(next.getMonth() + 1) + '-' + pad(next.getDate()) + ' ' + pad(next.getHours()) + ':' + pad(next.getMinutes())
    current.status = 'active'
  }

  /** 演示敏感操作附加验证。 */
  function verifyStepUp() {
    if (!user.value.mfaEnabled) return false
    stepUpVerified.value = true
    stepUpDetail.value = '刚刚完成附加验证 · 10 分钟内可执行敏感操作'
    return true
  }

  function reset() {
    switchIdentity(securityProfiles[0]!.key)
  }

  return {
    profileKey,
    profile,
    user,
    sessions,
    permissions,
    currentSession,
    activeSessions,
    otherActiveSessions,
    identityOptions,
    stepUpVerified,
    stepUpDetail,
    can,
    switchIdentity,
    revokeSession,
    endOtherSessions,
    extendCurrentSession,
    verifyStepUp,
    reset
  }
})

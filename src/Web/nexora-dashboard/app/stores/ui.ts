import { defineStore } from 'pinia'

export type TableDensity = 'cozy' | 'compact'

const NOTIFICATION_STORAGE_KEY = 'nexora-read-notifications'

/**
 * 跨页的界面状态：侧栏折叠、通知抽屉、账户安全抽屉与已读标记。
 * 已读标记与表格密度持久化到浏览器存储，其余演示状态刷新后重置。
 */
export const useUiStore = defineStore('ui', () => {
  const sidebarCollapsed = ref(false)
  const notificationsOpen = ref(false)
  const accountSecurityOpen = ref(false)
  const readNotificationIds = ref<string[]>([])

  function persistNotificationIds() {
    if (!import.meta.client) return
    try {
      sessionStorage.setItem(NOTIFICATION_STORAGE_KEY, JSON.stringify(readNotificationIds.value))
    } catch {
      // 浏览器禁用会话存储时保持内存态即可。
    }
  }

  if (import.meta.client) {
    onMounted(() => {
      try {
        const raw = sessionStorage.getItem(NOTIFICATION_STORAGE_KEY)
        if (!raw) return
        const parsed: unknown = JSON.parse(raw)
        if (Array.isArray(parsed)) {
          readNotificationIds.value = parsed.filter((id): id is string => typeof id === 'string')
        }
      } catch {
        readNotificationIds.value = []
      }
    })
  }
  const tableDensity = useLocalStorage<TableDensity>('nexora-table-density', 'cozy', { initOnMounted: true })

  function markNotificationRead(id: string) {
    if (!readNotificationIds.value.includes(id)) {
      readNotificationIds.value = [...readNotificationIds.value, id]
      persistNotificationIds()
    }
  }

  function markNotificationsRead(ids: string[]) {
    readNotificationIds.value = [...new Set([...readNotificationIds.value, ...ids])]
    persistNotificationIds()
  }

  function setTableDensity(value: TableDensity) {
    tableDensity.value = value
  }

  function toggleTableDensity() {
    tableDensity.value = tableDensity.value === 'cozy' ? 'compact' : 'cozy'
  }

  function reset() {
    sidebarCollapsed.value = false
    notificationsOpen.value = false
    accountSecurityOpen.value = false
    readNotificationIds.value = []
    persistNotificationIds()
  }

  return {
    sidebarCollapsed,
    notificationsOpen,
    accountSecurityOpen,
    readNotificationIds,
    tableDensity,
    markNotificationRead,
    markNotificationsRead,
    setTableDensity,
    toggleTableDensity,
    reset
  }
})

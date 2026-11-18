import { storeToRefs } from 'pinia'
import { announcements, products, purchaseOrders, recentDocuments, salesOrders } from '~/mocks'
import { useUiStore } from '~/stores/ui'

export type NotificationSource = '公告' | '采购审批' | '销售审批' | '库存预警' | '最近单据'

export interface DashboardNotification {
  id: string
  source: NotificationSource
  title: string
  description: string
  icon: string
  color: 'primary' | 'warning' | 'error' | 'info'
  at: string
  to: string
}

/**
 * 通知抽屉的本地模拟数据：公告、采购/销售待审批、库存预警与最近单据。
 * 打开状态与已读标记放在 ui store，刷新页面后恢复未读。
 */
export function useNotifications() {
  const ui = useUiStore()
  const { readNotificationIds } = storeToRefs(ui)
  const { workspace } = useMockWorkspace()

  const open = computed({
    get: () => ui.notificationsOpen,
    set: (value: boolean) => {
      ui.notificationsOpen = value
    }
  })

  const items = computed<DashboardNotification[]>(() => {
    const list: DashboardNotification[] = []

    const pendingPurchases = purchaseOrders.filter(order => order.workspaceId === workspace.value.id && (order.status === 'pending' || order.status === 'approved'))
    if (pendingPurchases.length) {
      list.push({
        id: 'purchase-' + workspace.value.id,
        source: '采购审批',
        title: pendingPurchases.length + ' 张采购订单等待处理',
        description: pendingPurchases.slice(0, 2).map(order => order.id + ' · ' + order.supplier).join('；'),
        icon: 'i-carbon-purchase',
        color: 'warning',
        at: '今天 09:42',
        to: '/purchase-orders'
      })
    }

    const pendingSales = salesOrders.filter(order => order.workspaceId === workspace.value.id && order.status === 'pending')
    if (pendingSales.length) {
      list.push({
        id: 'sales-' + workspace.value.id,
        source: '销售审批',
        title: pendingSales.length + ' 张销售订单等待审批',
        description: pendingSales.slice(0, 2).map(order => order.id + ' · ' + order.customerName).join('；'),
        icon: 'i-carbon-shopping-cart',
        color: 'warning',
        at: '今天 08:15',
        to: '/sales'
      })
    }

    const lowStock = products.filter(product => product.status === 'active' && product.stock < 30)
    if (lowStock.length) {
      list.push({
        id: 'stock-warning',
        source: '库存预警',
        title: lowStock.length + ' 个商品低于安全库存',
        description: lowStock.slice(0, 2).map(product => product.name).join('；'),
        icon: 'i-carbon-warning-alt',
        color: 'error',
        at: '昨天 17:05',
        to: '/catalog'
      })
    }

    for (const announcement of announcements.slice(0, 2)) {
      list.push({
        id: 'announcement-' + announcement.id,
        source: '公告',
        title: announcement.title,
        description: announcement.body,
        icon: 'i-carbon-notification-new',
        color: announcement.level === 'warning' ? 'warning' : 'info',
        at: announcement.createdAt,
        to: '/settings'
      })
    }

    const documents = recentDocuments.filter(document => document.workspaceId === workspace.value.id).slice(0, 2)
    for (const document of documents) {
      list.push({
        id: 'document-' + document.id,
        source: '最近单据',
        title: document.title,
        description: document.type + ' · ' + document.status,
        icon: 'i-carbon-document',
        color: 'info',
        at: document.at,
        to: '/'
      })
    }

    return list
  })

  const unread = computed(() => items.value.filter(item => !readNotificationIds.value.includes(item.id)))

  function markAllRead() {
    ui.markNotificationsRead(items.value.map(item => item.id))
  }

  function markRead(id: string) {
    ui.markNotificationRead(id)
  }

  return { open, items, unread, markAllRead, markRead }
}

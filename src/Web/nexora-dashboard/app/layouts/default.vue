<script setup lang="ts">
import type { NavigationMenuItem } from '@nuxt/ui'
import { purchaseOrders, salesOrders } from '~/mocks'
import { useUiStore } from '~/stores/ui'

const open = ref(false)
const ui = useUiStore()
const isDesktop = useMediaQuery('(min-width: 1024px)', { ssrWidth: 1440 })
const { workspace } = useMockWorkspace()
const { groups: searchGroups } = useDashboardSearch()
const route = useRoute()
const { recordVisit } = useRecentVisits()

const pendingOrderCount = computed(() => purchaseOrders.filter(order => order.workspaceId === workspace.value.id && (order.status === 'pending' || order.status === 'approved')).length)

const pendingSalesCount = computed(() => salesOrders.filter(order => order.workspaceId === workspace.value.id && order.status === 'pending').length)

const links = computed<NavigationMenuItem[]>(() => [{
  label: '工作台',
  icon: 'i-carbon-dashboard',
  to: '/',
  onSelect: () => {
    open.value = false
  }
}, {
  label: '商品目录',
  icon: 'i-carbon-catalog',
  to: '/catalog',
  onSelect: () => {
    open.value = false
  }
}, {
  label: '伙伴档案',
  icon: 'i-carbon-partnership',
  to: '/partners',
  onSelect: () => {
    open.value = false
  }
}, {
  label: '主数据定义',
  icon: 'i-carbon-list',
  to: '/definitions',
  onSelect: () => {
    open.value = false
  }
}, {
  label: '采购订单',
  icon: 'i-carbon-purchase',
  to: '/purchase-orders',
  badge: pendingOrderCount.value || undefined,
  onSelect: () => {
    open.value = false
  }
}, {
  label: '采购审计',
  icon: 'i-carbon-document-view',
  to: '/purchase-audit',
  onSelect: () => {
    open.value = false
  }
}, {
  label: '销售与应收',
  icon: 'i-carbon-shopping-cart',
  to: '/sales',
  badge: pendingSalesCount.value || undefined,
  onSelect: () => {
    open.value = false
  }
}, {
  label: '库存管理',
  icon: 'i-carbon-inventory-management',
  to: '/inventory',
  onSelect: () => {
    open.value = false
  }
}, {
  label: '财务',
  icon: 'i-carbon-finance',
  to: '/finance',
  onSelect: () => {
    open.value = false
  }
}, {
  label: '变更记录',
  icon: 'i-carbon-time',
  to: '/change-log',
  onSelect: () => {
    open.value = false
  }
}, {
  label: '设置',
  icon: 'i-carbon-settings',
  to: '/settings',
  onSelect: () => {
    open.value = false
  }
}])

watch(() => route.path, (path) => {
  const link = links.value.find(item => typeof item.to === 'string' && item.to === path)
  if (link && typeof link.label === 'string' && typeof link.icon === 'string') {
    recordVisit({ label: link.label, to: path, icon: link.icon })
  }
}, { immediate: true })
</script>

<template>
  <UDashboardGroup unit="rem" class="bg-(--nx-page)">
    <UDashboardSidebar
      id="default"
      v-model:open="open"
      v-model:collapsed="ui.sidebarCollapsed"
      collapsible
      resizable
      class="bg-elevated"
      :ui="{
        header: 'border-b border-default',
        footer: 'border-t border-default',
        body: 'gap-3'
      }"
    >
      <template #header="{ collapsed }">
        <WorkspaceMenu :collapsed="collapsed" />
      </template>

      <template #default="{ collapsed }">
        <UDashboardSearchButton
          label="搜索或跳转…"
          :collapsed="collapsed"
          :kbds="collapsed ? [] : [{ value: '⌘' }, { value: 'K' }]"
          :tooltip="collapsed"
          block
          :square="collapsed"
          data-testid="dashboard-search-button"
        />

        <UNavigationMenu
          :collapsed="collapsed"
          :items="links"
          orientation="vertical"
          tooltip
          popover
        />

        <p v-if="!collapsed && isDesktop" class="mt-auto px-2 text-[11px] leading-5 text-dimmed">
          本地 UI 原型 · 模拟数据<br>
          不连接后端服务
        </p>
      </template>

      <template #footer="{ collapsed }">
        <UserMenu :collapsed="collapsed" />
      </template>
    </UDashboardSidebar>

    <slot />

    <UDashboardSearch
      :groups="searchGroups"
      description="搜索页面、商品、伙伴或单据；结果来自本地模拟数据。"
      placeholder="搜索页面、商品、伙伴或单据…"
      :color-mode="false"
    >
      <template #empty>
        <div class="px-6 py-10 text-center" data-testid="command-empty">
          <p class="text-sm font-medium text-highlighted">
            没有匹配结果
          </p>
          <p class="mt-1 text-xs text-muted">
            试试商品 SKU、单据号或页面名称；当前仅检索本地模拟数据。
          </p>
        </div>
      </template>
      <template #footer>
        <div
          class="flex w-full flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2 text-[11px] text-muted"
          data-testid="command-footer"
        >
          <span>
            <UKbd value="↑" />
            <UKbd value="↓" /> 选择
          </span>
          <span>
            <UKbd value="↵" /> 打开
          </span>
          <span>
            <UKbd value="Esc" /> 关闭
          </span>
          <span class="ml-auto">演示范围：本地模拟页面、商品、伙伴与单据</span>
        </div>
      </template>
    </UDashboardSearch>

    <NotificationSlideover />
    <AccountSecuritySlideover />
  </UDashboardGroup>
</template>

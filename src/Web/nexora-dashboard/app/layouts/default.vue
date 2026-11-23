<script setup lang="ts">
import type { NavigationMenuItem } from '@nuxt/ui'
import { purchaseOrders, salesOrders } from '~/mocks'
import { useUiStore } from '~/stores/ui'
import { useAuthSessionStore } from '~/stores/authSession'
import { usesConnectedBusinessData } from '~/utils/organization/navigation'

const open = ref(false)
const ui = useUiStore()
const auth = useAuthSessionStore()
const live = useLiveSessionStore()
const isDesktop = useMediaQuery('(min-width: 1024px)', { ssrWidth: 1440 })
const { t } = useI18n()
const { localeModel, localeOptions } = useLocaleSwitch()
const { workspace } = useMockWorkspace()
const searchOpen = ref(false)
const { groups: searchGroups, records: searchRecords } = useDashboardSearch(searchOpen)
const route = useRoute()
const connectedBusiness = computed(() => auth.connected && usesConnectedBusinessData(route.path, route.query.tab))
const { recordVisit } = useRecentVisits()

const pendingOrderCount = computed(() => purchaseOrders.filter(order => order.workspaceId === workspace.value.id && (order.status === 'pending' || order.status === 'approved')).length)

const pendingSalesCount = computed(() => salesOrders.filter(order => order.workspaceId === workspace.value.id && order.status === 'pending').length)

const links = computed<NavigationMenuItem[]>(() => [{
  label: t('nav.dashboard'),
  icon: 'i-carbon-dashboard',
  to: '/',
  onSelect: () => {
    open.value = false
  }
}, {
  label: t('nav.catalog'),
  icon: 'i-carbon-catalog',
  to: '/catalog',
  onSelect: () => {
    open.value = false
  }
}, {
  label: t('nav.partners'),
  icon: 'i-carbon-partnership',
  to: '/partners',
  onSelect: () => {
    open.value = false
  }
}, {
  label: t('nav.definitions'),
  icon: 'i-carbon-list',
  to: '/definitions',
  onSelect: () => {
    open.value = false
  }
}, {
  label: t('nav.purchaseOrders'),
  icon: 'i-carbon-purchase',
  to: '/purchase-orders',
  badge: auth.connected ? undefined : pendingOrderCount.value || undefined,
  onSelect: () => {
    open.value = false
  }
}, {
  label: t('nav.purchaseAudit'),
  icon: 'i-carbon-document-view',
  to: '/purchase-audit',
  onSelect: () => {
    open.value = false
  }
}, {
  label: t('nav.sales'),
  icon: 'i-carbon-shopping-cart',
  to: '/sales',
  badge: auth.connected ? undefined : pendingSalesCount.value || undefined,
  onSelect: () => {
    open.value = false
  }
}, {
  label: t('nav.inventory'),
  icon: 'i-carbon-inventory-management',
  to: '/inventory',
  onSelect: () => {
    open.value = false
  }
}, {
  label: t('nav.finance'),
  icon: 'i-carbon-finance',
  to: '/finance',
  onSelect: () => {
    open.value = false
  }
}, {
  label: t('nav.changeLog'),
  icon: 'i-carbon-time',
  to: '/change-log',
  onSelect: () => {
    open.value = false
  }
}, {
  label: t('nav.assistant'),
  icon: 'i-carbon-bot',
  to: '/assistant',
  onSelect: () => {
    open.value = false
  }
}, {
  label: t('nav.settings'),
  icon: 'i-carbon-settings',
  to: '/settings',
  onSelect: () => {
    open.value = false
  }
}].filter(item => !auth.connected || live.canVisit(item.to)))

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
          :label="t('shell.searchButton')"
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
          {{ t(connectedBusiness ? 'auth.catalogSource' : 'shell.sidebarNote') }}<br>
          {{ t(auth.connected ? connectedBusiness ? auth.simulated ? 'auth.catalogMock' : 'auth.catalogLive' : auth.simulated ? 'auth.simulated' : 'auth.connected' : 'shell.sidebarDisconnected') }}
        </p>
      </template>

      <template #footer="{ collapsed }">
        <div class="w-full space-y-1">
          <USelect
            v-if="!collapsed"
            v-model="localeModel"
            :items="localeOptions"
            icon="i-carbon-language"
            size="xs"
            variant="ghost"
            class="w-full"
            :aria-label="t('shell.language')"
            data-testid="locale-switch"
          />
          <UserMenu :collapsed="collapsed" />
        </div>
      </template>
    </UDashboardSidebar>

    <slot />

    <UDashboardSearch
      v-model:open="searchOpen"
      :groups="searchGroups"
      :loading="searchRecords.loading"
      :description="t('shell.searchDescription')"
      :placeholder="t('shell.searchPlaceholder')"
      :color-mode="false"
    >
      <template #empty>
        <div class="px-6 py-10 text-center" data-testid="command-empty">
          <p class="text-sm font-medium text-highlighted">
            {{ t('shell.searchEmptyTitle') }}
          </p>
          <p class="mt-1 text-xs text-muted">
            {{ t('shell.searchEmptyBody') }}
          </p>
        </div>
      </template>
      <template #footer>
        <div
          class="flex w-full flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2 text-[11px] text-muted"
          data-testid="command-footer"
        >
          <span v-if="auth.connected" class="basis-full">
            搜索各模块当前工作区可见的首批记录。<template v-if="searchRecords.data?.partial">部分模块未返回结果。</template>
          </span>
          <span>
            <UKbd value="↑" />
            <UKbd value="↓" /> {{ t('shell.searchSelect') }}
          </span>
          <span>
            <UKbd value="↵" /> {{ t('shell.searchOpen') }}
          </span>
          <span>
            <UKbd value="Esc" /> {{ t('shell.searchClose') }}
          </span>
          <span class="ml-auto">{{ t('shell.searchScope') }}</span>
        </div>
      </template>
    </UDashboardSearch>

    <NotificationSlideover />
    <AccountSecuritySlideover />
  </UDashboardGroup>
</template>

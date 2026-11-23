<script setup lang="ts">
import type { ButtonProps, TableColumn, TimelineItem } from '@nuxt/ui'
import type { BadgeColor, ChangeEntityType, RecentDocument } from '~/mocks'
import {
  changeLogEntries,
  invoiceStatusColors,
  invoices,
  products,
  purchaseOrders,
  recentDocuments,
  salesOrders,
  salesStatusColors,
  statusColors,
  todos
} from '~/mocks'

type TrendMetric = 'purchase' | 'sales' | 'receivable'
type TodoGroup = 'approval' | 'draft' | 'overdue'
type ActivityFilter = 'all' | ChangeEntityType

const toast = useToast()
const route = useRoute()
const { t, locale } = useI18n()
const auth = useAuthSessionStore()
const live = useLiveSessionStore()
type RefreshPanel = { refresh: () => Promise<unknown> }
const liveProjection = ref<RefreshPanel | null>(null)
const liveOverview = ref<RefreshPanel | null>(null)
const liveQueues = ref<RefreshPanel | null>(null)
async function refreshConnected() {
  await Promise.all([liveProjection.value?.refresh(), liveOverview.value?.refresh(), liveQueues.value?.refresh()])
}
const { loading: refreshing, run: runRefresh } = useMockRefresh()
const { workspace } = useMockWorkspace()
const {
  purchaseStatusLabel,
  salesStatusLabel,
  invoiceStatusLabel,
  changeEntityLabel,
  todoPriorityLabel,
  documentTypeLabel,
  rawDocumentStatusLabel
} = useMockLabels()

const monthLabels = computed(() => Array.from({ length: 12 }, (_, index) =>
  new Intl.DateTimeFormat(locale.value, { month: 'short' }).format(new Date(2026, index, 1))
))

const lastUpdatedAt = ref(workspace.value.updatedAt)
watch(() => workspace.value.id, () => {
  lastUpdatedAt.value = workspace.value.updatedAt
})

function nowLabel() {
  const now = new Date()
  const pad = (value: number) => String(value).padStart(2, '0')
  return now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate()) + ' ' + pad(now.getHours()) + ':' + pad(now.getMinutes())
}

const overviewDescription = computed(() => t('dashboard.overviewMeta', {
  plan: workspace.value.plan,
  members: workspace.value.members,
  time: lastUpdatedAt.value
}))

// ---- 趋势指标切换 ----
const trendMetric = ref<TrendMetric>('purchase')
const trendOptions = computed<Array<{ label: string, value: TrendMetric }>>(() => [
  { label: t('dashboard.trend.purchase'), value: 'purchase' },
  { label: t('dashboard.trend.sales'), value: 'sales' },
  { label: t('dashboard.trend.receivable'), value: 'receivable' }
])
const trendMeta = computed<Record<TrendMetric, { label: string, title: string }>>(() => ({
  purchase: { label: t('dashboard.trend.purchase'), title: t('dashboard.trend.purchaseTitle') },
  sales: { label: t('dashboard.trend.sales'), title: t('dashboard.trend.salesTitle') },
  receivable: { label: t('dashboard.trend.receivable'), title: t('dashboard.trend.receivableTitle') }
}))
const trendValues = computed(() => trendMetric.value === 'purchase'
  ? workspace.value.monthlyPurchase
  : trendMetric.value === 'sales'
    ? workspace.value.monthlySales
    : workspace.value.monthlyReceivables)
const chartData = computed(() => trendValues.value.map((value, index) => ({ month: monthLabels.value[index]!, amount: value })))

function formatTrendTick(value: number) {
  const amount = Number(value)
  if (locale.value === 'en') return '¥' + (amount * 10).toFixed(0) + 'k'
  return new Intl.NumberFormat(locale.value, { maximumFractionDigits: 1 }).format(amount) + ' 万'
}

// ---- KPI ----
const monthPurchase = computed(() => workspace.value.monthlyPurchase.at(-1)! * 10000)
const monthSales = computed(() => workspace.value.monthlySales.at(-1)! * 10000)
const salesTrendPct = computed(() => {
  const series = workspace.value.monthlySales
  const previous = series.at(-2) ?? 0
  return previous ? ((series.at(-1)! - previous) / previous * 100).toFixed(1) : '0.0'
})
const workspaceOrders = computed(() => purchaseOrders.filter(order => order.workspaceId === workspace.value.id))
const pendingOrders = computed(() => workspaceOrders.value.filter(order => order.status === 'pending' || order.status === 'approved'))
const activeProducts = computed(() => products.filter(product => product.status === 'active'))
const stockWarnings = computed(() => activeProducts.value.filter(product => product.stock < 30).length)
const stockWarningRate = computed(() => Math.round(stockWarnings.value / Math.max(1, activeProducts.value.length) * 100))
const activeCategories = computed(() => new Set(activeProducts.value.map(product => product.category)).size)
const workspaceInvoices = computed(() => invoices.filter(invoice => invoice.workspaceId === workspace.value.id))
const receivableInvoices = computed(() => workspaceInvoices.value.filter(invoice => invoice.status === 'issued' || invoice.status === 'overdue'))
const receivableTotal = computed(() => receivableInvoices.value.reduce((sum, invoice) => sum + Number(invoice.amount), 0))
const payableOrders = computed(() => workspaceOrders.value.filter(order => order.status === 'pending' || order.status === 'approved' || order.status === 'partial'))
const payableTotal = computed(() => payableOrders.value.reduce((sum, order) => sum + orderTotal(order), 0))

function formatWan(value: number) {
  if (locale.value === 'en') return '¥' + (value / 1000).toFixed(1) + 'k'
  return '¥' + (value / 10000).toFixed(1) + ' 万'
}

interface Kpi {
  label: string
  value: string
  hint: string
  icon: string
  tone: 'success' | 'warning' | 'primary' | 'error' | 'info'
  iconClass: string
  progress?: number
  to: string
}

const kpis = computed<Kpi[]>(() => [{
  label: t('dashboard.kpi.purchase'),
  value: formatMoney(monthPurchase.value),
  hint: t('dashboard.kpi.purchaseHint', { percent: workspace.value.trendPct }),
  icon: 'i-carbon-growth',
  tone: 'success',
  iconClass: 'bg-success/10 text-success',
  to: '/purchase-orders'
}, {
  label: t('dashboard.kpi.sales'),
  value: formatMoney(monthSales.value),
  hint: t('dashboard.kpi.salesHint', { percent: salesTrendPct.value }),
  icon: 'i-carbon-chart-line',
  tone: 'info',
  iconClass: 'bg-info/10 text-info',
  to: '/sales'
}, {
  label: t('dashboard.kpi.receivablePayable'),
  value: formatWan(receivableTotal.value) + ' / ' + formatWan(payableTotal.value),
  hint: t('dashboard.kpi.receivableHint', { receivables: receivableInvoices.value.length, orders: payableOrders.value.length }),
  icon: 'i-carbon-receipt',
  tone: 'primary',
  iconClass: 'bg-primary/10 text-primary',
  to: '/finance'
}, {
  label: t('dashboard.kpi.pendingPurchases'),
  value: t('dashboard.kpi.orders', { count: pendingOrders.value.length }),
  hint: pendingOrders.value.length ? t('dashboard.kpi.pendingHint') : t('dashboard.kpi.pendingHintIdle'),
  icon: 'i-carbon-purchase',
  tone: 'warning',
  iconClass: 'bg-warning/10 text-warning',
  to: '/purchase-orders'
}, {
  label: t('dashboard.kpi.lowStock'),
  value: t('dashboard.kpi.products', { count: stockWarnings.value }),
  hint: t('dashboard.kpi.stockHint', { percent: stockWarningRate.value }),
  icon: 'i-carbon-warning-alt',
  tone: 'error',
  iconClass: 'bg-error/10 text-error',
  progress: stockWarningRate.value,
  to: '/inventory'
}, {
  label: t('dashboard.kpi.activeProducts'),
  value: t('dashboard.kpi.products', { count: activeProducts.value.length }),
  hint: t('dashboard.kpi.productHint', { categories: activeCategories.value }),
  icon: 'i-carbon-catalog',
  tone: 'primary',
  iconClass: 'bg-primary/10 text-primary',
  to: '/catalog'
}])

// ---- 待办 ----
const todoGroup = ref<TodoGroup>('approval')
const todoGroups = computed<Array<{ key: TodoGroup, label: string }>>(() => [
  { key: 'approval', label: t('dashboard.todos.groups.approval') },
  { key: 'draft', label: t('dashboard.todos.groups.draft') },
  { key: 'overdue', label: t('dashboard.todos.groups.overdue') }
])
const workspaceTodos = computed(() => todos.filter(todo => todo.workspaceId === workspace.value.id))
const doneTodos = computed(() => workspaceTodos.value.filter(todo => todo.done).length)
const pendingTodos = computed(() => workspaceTodos.value.filter(todo => !todo.done).length)
const todoProgress = computed(() => Math.round(doneTodos.value / Math.max(1, workspaceTodos.value.length) * 100))
const allTodosDone = computed(() => workspaceTodos.value.length > 0 && workspaceTodos.value.every(todo => todo.done))
const groupCounts = computed(() => Object.fromEntries(todoGroups.value.map(group => [group.key, workspaceTodos.value.filter(todo => todo.group === group.key && !todo.done).length])) as Record<TodoGroup, number>)
const filteredTodos = computed(() => workspaceTodos.value.filter(todo => todo.group === todoGroup.value))
const activeTodoGroupLabel = computed(() => todoGroups.value.find(group => group.key === todoGroup.value)?.label ?? '')

function markAllDone() {
  const changed = workspaceTodos.value.filter(todo => !todo.done)
  if (!changed.length) return
  changed.forEach((todo) => {
    todo.done = true
  })
  toast.add({
    title: t('dashboard.todos.allDoneTitle'),
    description: t('dashboard.todos.allDoneDescription'),
    color: 'success',
    icon: 'i-carbon-checkmark',
    actions: [{
      label: t('dashboard.todos.restore'),
      onClick: () => changed.forEach((todo) => {
        todo.done = false
      })
    }]
  })
}

function restoreTodos() {
  workspaceTodos.value.forEach((todo) => {
    todo.done = false
  })
}

// ---- 最近单据 ----
const emptyFlags = computed(() => String(route.query.empty ?? '').split(',').filter(Boolean))
const emptyTodos = computed(() => emptyFlags.value.includes('todos') || emptyFlags.value.includes('all'))
const emptyDocuments = computed(() => emptyFlags.value.includes('documents') || emptyFlags.value.includes('all'))
const emptyActivity = computed(() => emptyFlags.value.includes('activity') || emptyFlags.value.includes('all'))
const workspaceDocuments = computed(() => emptyDocuments.value ? [] : recentDocuments.filter(document => document.workspaceId === workspace.value.id))

const documentColumns = computed<TableColumn<RecentDocument>[]>(() => [{
  accessorKey: 'id',
  header: t('dashboard.documents.columns.id')
}, {
  accessorKey: 'type',
  header: t('dashboard.documents.columns.type')
}, {
  accessorKey: 'title',
  header: t('dashboard.documents.columns.counterparty')
}, {
  accessorKey: 'status',
  header: t('dashboard.documents.columns.status')
}, {
  accessorKey: 'amount',
  header: t('dashboard.documents.columns.amount'),
  meta: { class: { th: 'text-right', td: 'text-right' } }
}, {
  accessorKey: 'at',
  header: t('dashboard.documents.columns.updatedAt'),
  meta: { class: { th: 'text-right', td: 'text-right whitespace-nowrap' } }
}])

function documentStatusLabel(document: RecentDocument) {
  if (document.type === '销售订单') {
    const order = salesOrders.find(item => item.id === document.id)
    return order ? salesStatusLabel(order.status) : rawDocumentStatusLabel(document.status)
  }
  if (document.type === '采购发票') {
    const invoice = invoices.find(item => item.id === document.id)
    return invoice ? invoiceStatusLabel(invoice.status) : rawDocumentStatusLabel(document.status)
  }
  if (document.type === '采购订单') {
    const order = purchaseOrders.find(item => item.id === document.id)
    return order ? purchaseStatusLabel(order.status) : rawDocumentStatusLabel(document.status)
  }
  return rawDocumentStatusLabel(document.status)
}

function documentStatusColor(document: RecentDocument): BadgeColor {
  if (document.type === '销售订单') {
    const order = salesOrders.find(item => item.id === document.id)
    return order ? salesStatusColors[order.status] : 'neutral'
  }
  if (document.type === '采购发票') {
    const invoice = invoices.find(item => item.id === document.id)
    return invoice ? invoiceStatusColors[invoice.status] : 'neutral'
  }
  if (document.type === '采购订单') {
    const order = purchaseOrders.find(item => item.id === document.id)
    return order ? statusColors[order.status] : 'neutral'
  }
  if (document.status.includes('待审批') || document.status.includes('部分')) return 'warning'
  if (document.status.startsWith('已')) return 'success'
  return 'neutral'
}

// ---- 最近动态 ----
const activityFilter = ref<ActivityFilter>('all')
const changeEntityTypes: ChangeEntityType[] = ['product', 'partner', 'purchase-order', 'sales-order', 'invoice', 'definition']
const activityOptions = computed<Array<{ label: string, value: ActivityFilter }>>(() => [
  { label: t('dashboard.activity.all'), value: 'all' },
  ...changeEntityTypes.map(value => ({ label: changeEntityLabel(value), value }))
])
const activityIconMap: Record<ChangeEntityType, string> = {
  'product': 'i-carbon-catalog',
  'partner': 'i-carbon-user-multiple',
  'purchase-order': 'i-carbon-purchase',
  'sales-order': 'i-carbon-shopping-cart',
  'invoice': 'i-carbon-receipt',
  'definition': 'i-carbon-settings'
}
const activityEntries = computed(() => emptyActivity.value
  ? []
  : changeLogEntries
      .filter(entry => entry.workspaceId === workspace.value.id)
      .filter(entry => activityFilter.value === 'all' || entry.entityType === activityFilter.value)
      .slice(0, 7))
const activityItems = computed<TimelineItem[]>(() => activityEntries.value.map(entry => ({
  date: entry.at.slice(5, 16),
  title: changeEntityLabel(entry.entityType) + ' · ' + entry.action,
  description: entry.entityName + ' · ' + entry.actor + '：' + entry.summary,
  icon: activityIconMap[entry.entityType]
})))

function exportReport() {
  downloadCsv(
    t('dashboard.documents.exportFilename', { date: new Date().toISOString().slice(0, 10) }),
    [
      t('dashboard.documents.columns.id'),
      t('dashboard.documents.columns.type'),
      t('dashboard.documents.columns.counterparty'),
      t('dashboard.documents.columns.status'),
      t('dashboard.documents.columns.amount'),
      t('dashboard.documents.columns.updatedAt')
    ],
    workspaceDocuments.value.map(document => [
      document.id,
      documentTypeLabel(document.type),
      document.title,
      documentStatusLabel(document),
      document.amount.toFixed(2),
      document.at
    ])
  )
  toast.add({
    title: t('dashboard.documents.exportTitle', { count: workspaceDocuments.value.length }),
    description: t('dashboard.documents.exportDescription'),
    color: 'success',
    icon: 'i-carbon-document-export'
  })
}

function refreshData() {
  runRefresh(() => {
    lastUpdatedAt.value = nowLabel()
    toast.add({
      title: t('dashboard.refresh.title'),
      description: t('dashboard.refresh.description'),
      color: 'neutral',
      icon: 'i-carbon-renew'
    })
  })
}

const overviewLinks = computed<ButtonProps[]>(() => [{
  label: t('dashboard.documents.exportButton'),
  icon: 'i-carbon-document-export',
  color: 'neutral',
  variant: 'outline',
  size: 'sm',
  onClick: exportReport
}, {
  label: t('dashboard.refresh.button'),
  icon: 'i-carbon-renew',
  color: 'neutral',
  variant: 'ghost',
  size: 'sm',
  loading: refreshing.value,
  onClick: refreshData
}])
</script>

<template>
  <div class="contents">
    <UDashboardPanel id="home">
      <template #header>
        <UDashboardNavbar :title="t('nav.dashboard')" :ui="{ right: 'gap-2' }">
          <template #leading>
            <UDashboardSidebarCollapse />
          </template>

          <template #right>
            <NotificationButton />
            <UButton
              v-if="!auth.connected || live.canVisit('/purchase-orders')"
              to="/purchase-orders"
              :label="t('dashboard.newPurchaseOrder')"
              icon="i-carbon-add"
              color="primary"
              size="sm"
            />
          </template>
        </UDashboardNavbar>
      </template>

      <template #body>
        <template v-if="auth.connected">
          <UAlert v-if="live.error" color="error" :title="live.error" />
          <USkeleton v-else-if="live.loading" class="h-32 w-full" />
          <div v-else-if="live.canVisit('/')" class="space-y-4" data-testid="live-workbench">
            <UPageHeader
              :title="live.workspace?.name ?? '工作台'"
              :links="[{ label: '刷新工作台', icon: 'i-carbon-renew', color: 'neutral', variant: 'outline', onClick: refreshConnected }]"
              :ui="{ root: 'border-0 py-0', title: 'text-xl font-semibold' }"
            />
            <FinanceReportingOverview v-if="live.canVisit('/finance')" ref="liveOverview" />
            <FinanceWorkspaceProjection ref="liveProjection" page-path="/" />
            <DashboardWorkbenchQueues ref="liveQueues" />
          </div>
          <UAlert v-else color="neutral" title="登录并选择可访问的工作区以查看工作台。" />
        </template>
        <template v-else>
        <UPageHeader
          :headline="t('dashboard.headline')"
          :title="workspace.name"
          :description="overviewDescription"
          :links="overviewLinks"
          :ui="{
            root: 'border-0 py-0',
            wrapper: 'items-start xl:flex-row xl:items-end',
            headline: 'mb-1 text-xs font-medium uppercase tracking-[0.08em] text-muted',
            title: 'text-xl font-semibold',
            description: 'mt-1 text-sm text-muted'
          }"
        />

        <div v-if="refreshing" class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" data-testid="dashboard-skeleton">
          <UCard
            v-for="n in 6"
            :key="n"
            class="rounded-sm"
            :ui="{ body: 'p-4 sm:p-4' }"
          >
            <USkeleton class="h-3 w-24" />
            <USkeleton class="mt-3 h-7 w-32" />
            <USkeleton class="mt-2 h-3 w-20" />
          </UCard>
        </div>
        <div v-else class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <NuxtLink
            v-for="(kpi, index) in kpis"
            :key="kpi.label"
            :to="kpi.to"
            class="block"
            :data-testid="'kpi-card-' + (index + 1)"
          >
            <UCard
              class="h-full rounded-sm nx-lift nx-reveal"
              :style="{ '--nx-delay': (index * 50) + 'ms' }"
              :ui="{ body: 'p-4 sm:p-4' }"
            >
              <div class="flex items-start justify-between gap-2">
                <div class="min-w-0">
                  <p class="text-xs text-muted">
                    {{ kpi.label }}
                  </p>
                  <p class="mt-2 text-2xl font-semibold tabular-nums text-highlighted">
                    {{ kpi.value }}
                  </p>
                </div>
                <span class="flex size-8 shrink-0 items-center justify-center rounded-sm" :class="kpi.iconClass">
                  <UIcon :name="kpi.icon" class="size-4" />
                </span>
              </div>
              <p
                class="mt-2 text-xs"
                :class="{
                  'text-success': kpi.tone === 'success',
                  'text-warning': kpi.tone === 'warning',
                  'text-primary': kpi.tone === 'primary',
                  'text-error': kpi.tone === 'error',
                  'text-info': kpi.tone === 'info'
                }"
              >
                {{ kpi.hint }}
              </p>
              <UProgress
                v-if="kpi.progress !== undefined"
                :model-value="kpi.progress"
                size="xs"
                :color="kpi.tone"
                class="mt-2"
                :aria-label="t('dashboard.stockAria')"
              />
            </UCard>
          </NuxtLink>
        </div>

        <div class="grid gap-4 xl:grid-cols-3">
          <UCard
            class="nx-lift nx-reveal rounded-sm xl:col-span-2"
            :style="{ '--nx-delay': '150ms' }"
            :ui="{ header: 'p-4 sm:px-4', body: 'p-4 sm:p-4' }"
          >
            <template #header>
              <div class="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 class="text-sm font-semibold text-highlighted">
                    {{ trendMeta[trendMetric].title }}
                  </h3>
                  <p class="mt-0.5 text-xs text-muted">
                    {{ t('dashboard.trend.range') }}
                  </p>
                </div>
                <USelect
                  v-model="trendMetric"
                  :items="trendOptions"
                  size="sm"
                  class="w-32"
                  data-testid="dashboard-trend-metric"
                />
              </div>
            </template>

            <div v-if="refreshing" class="space-y-3" data-testid="dashboard-chart-skeleton">
              <USkeleton class="h-4 w-40" />
              <USkeleton class="h-56 w-full" />
            </div>
            <UChart
              v-else
              type="bar"
              :data="chartData"
              index="month"
              :categories="[{ key: 'amount', label: trendMeta[trendMetric].label }]"
              :height="248"
              :format="formatTrendTick"
              :aria-label="t('dashboard.trend.chartAria', { title: trendMeta[trendMetric].title })"
            />
          </UCard>

          <UCard
            class="nx-lift nx-reveal rounded-sm"
            :style="{ '--nx-delay': '200ms' }"
            :ui="{ header: 'p-4 sm:px-4', body: 'p-4 sm:p-4' }"
          >
            <template #header>
              <div class="flex items-center justify-between gap-2">
                <div>
                  <h3 class="text-sm font-semibold text-highlighted">
                    {{ t('dashboard.todos.title') }}
                  </h3>
                  <p class="mt-0.5 text-xs text-muted">
                    {{ t('dashboard.todos.subtitle') }}
                  </p>
                </div>
                <UButton
                  :label="t('dashboard.todos.completeAll')"
                  icon="i-carbon-checkmark"
                  color="neutral"
                  variant="ghost"
                  size="xs"
                  :disabled="pendingTodos === 0"
                  data-testid="dashboard-todo-complete-all"
                  @click="markAllDone"
                />
              </div>
            </template>

            <div v-if="refreshing" class="space-y-3" data-testid="dashboard-todo-skeleton">
              <USkeleton class="h-2 w-full" />
              <USkeleton v-for="n in 3" :key="n" class="h-10 w-full" />
            </div>
            <template v-else>
              <div class="mb-3 flex flex-wrap items-center gap-1">
                <UButton
                  v-for="group in todoGroups"
                  :key="group.key"
                  size="xs"
                  :label="group.label + ' ' + groupCounts[group.key]"
                  :color="todoGroup === group.key ? 'primary' : 'neutral'"
                  :variant="todoGroup === group.key ? 'subtle' : 'ghost'"
                  :data-testid="'dashboard-todo-group-' + group.key"
                  @click="todoGroup = group.key"
                />
                <span class="ml-auto text-xs tabular-nums text-muted">{{ doneTodos }}/{{ workspaceTodos.length }}</span>
              </div>

              <UProgress
                :model-value="todoProgress"
                size="sm"
                color="primary"
                class="mb-3"
                :aria-label="t('dashboard.todos.progressAria')"
              />

              <div v-if="emptyTodos" class="py-2" data-testid="dashboard-empty-todos">
                <UEmpty
                  variant="naked"
                  icon="i-carbon-task"
                  :title="t('dashboard.todos.emptyTitle')"
                  :description="t('dashboard.todos.emptyDescription')"
                />
              </div>
              <div v-else-if="allTodosDone" class="py-2" data-testid="dashboard-todo-all-done">
                <UEmpty
                  variant="naked"
                  icon="i-carbon-checkmark-filled"
                  :title="t('dashboard.todos.allDoneTitle')"
                  :description="t('dashboard.todos.allDoneDescription')"
                />
                <div class="mt-2 text-center">
                  <UButton
                    :label="t('dashboard.todos.restore')"
                    color="neutral"
                    variant="outline"
                    size="xs"
                    @click="restoreTodos"
                  />
                </div>
              </div>
              <div v-else-if="!filteredTodos.length" class="py-2" data-testid="dashboard-todo-empty-group">
                <UEmpty
                  variant="naked"
                  icon="i-carbon-task"
                  :title="t('dashboard.todos.groupEmptyTitle')"
                  :description="t('dashboard.todos.groupEmptyDescription', { group: activeTodoGroupLabel })"
                />
              </div>
              <ul v-else class="divide-y divide-default">
                <li v-for="todo in filteredTodos" :key="todo.id" class="flex items-start gap-2.5 py-2.5">
                  <UCheckbox
                    v-model="todo.done"
                    size="sm"
                    class="mt-0.5 shrink-0"
                    :aria-label="todo.title"
                  />
                  <div class="min-w-0 flex-1">
                    <p class="text-[13px] leading-5" :class="todo.done ? 'text-dimmed line-through' : 'text-default'">
                      {{ todo.title }}
                    </p>
                    <div class="mt-1 flex items-center gap-2 text-[11px] text-muted">
                      <span class="inline-flex items-center gap-1">
                        <UIcon name="i-carbon-calendar" class="size-3" />
                        {{ todo.due }}
                      </span>
                      <UBadge
                        :color="todo.priority === 'high' ? 'error' : todo.priority === 'medium' ? 'warning' : 'neutral'"
                        variant="subtle"
                        size="sm"
                        :label="todoPriorityLabel(todo.priority)"
                      />
                    </div>
                  </div>
                </li>
              </ul>
            </template>
          </UCard>
        </div>

        <FinanceReportingProjectionCard class="mb-4" />

        <div class="grid gap-4 xl:grid-cols-3">
          <UCard
            class="nx-lift nx-reveal rounded-sm xl:col-span-2"
            :style="{ '--nx-delay': '240ms' }"
            :ui="{ header: 'p-4 sm:px-4', body: 'p-0 sm:p-0' }"
          >
            <template #header>
              <div class="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 class="text-sm font-semibold text-highlighted">
                    {{ t('dashboard.documents.title') }}
                  </h3>
                  <p class="mt-0.5 text-xs text-muted">
                    {{ t('dashboard.documents.subtitle') }}
                  </p>
                </div>
                <UButton
                  to="/change-log"
                  :label="t('dashboard.documents.viewAll')"
                  color="neutral"
                  variant="ghost"
                  size="sm"
                  trailing-icon="i-carbon-arrow-right"
                />
              </div>
            </template>

            <div v-if="refreshing" class="space-y-2 p-4" data-testid="dashboard-docs-skeleton">
              <USkeleton v-for="n in 5" :key="n" class="h-8 w-full" />
            </div>
            <ResizableTable
              v-else
              :data="workspaceDocuments"
              :columns="documentColumns"
              class="nx-table"
              :ui="{ th: 'py-2.5', td: 'py-2.5' }"
            >
              <template #status-cell="{ row }">
                <UBadge
                  :color="documentStatusColor(row.original)"
                  variant="subtle"
                  size="sm"
                  :label="documentStatusLabel(row.original)"
                />
              </template>
              <template #amount-cell="{ row }">
                <span class="tabular-nums">{{ formatMoney(row.original.amount) }}</span>
              </template>
              <template #empty>
                <div data-testid="dashboard-empty-documents">
                  <UEmpty
                    variant="naked"
                    icon="i-carbon-document"
                    :title="t('dashboard.documents.emptyTitle')"
                    :description="t('dashboard.documents.emptyDescription')"
                  />
                </div>
              </template>
            </ResizableTable>
          </UCard>

          <UCard
            class="nx-lift nx-reveal rounded-sm"
            :style="{ '--nx-delay': '280ms' }"
            :ui="{ header: 'p-4 sm:px-4', body: 'p-4 sm:p-4' }"
          >
            <template #header>
              <div class="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 class="text-sm font-semibold text-highlighted">
                    {{ t('dashboard.activity.title') }}
                  </h3>
                  <p class="mt-0.5 text-xs text-muted">
                    {{ t('dashboard.activity.subtitle') }}
                  </p>
                </div>
                <USelect
                  v-model="activityFilter"
                  :items="activityOptions"
                  size="sm"
                  class="w-28"
                  data-testid="dashboard-activity-filter"
                />
              </div>
            </template>

            <div v-if="refreshing" class="space-y-3" data-testid="dashboard-timeline-skeleton">
              <USkeleton v-for="n in 4" :key="n" class="h-9 w-full" />
            </div>
            <div v-else-if="!activityEntries.length" class="py-6" data-testid="dashboard-empty-activity">
              <UEmpty
                variant="naked"
                icon="i-carbon-time"
                :title="t('dashboard.activity.emptyTitle')"
                :description="t('dashboard.activity.emptyDescription')"
              />
            </div>
            <div v-else class="nx-reveal" :style="{ '--nx-delay': '300ms' }">
              <UTimeline :items="activityItems" size="sm" color="primary" />
              <UButton
                to="/change-log"
                :label="t('dashboard.activity.viewAll')"
                color="neutral"
                variant="ghost"
                size="xs"
                trailing-icon="i-carbon-arrow-right"
                class="mt-2"
              />
            </div>
          </UCard>
        </div>

        <p class="text-[11px] text-dimmed">
          {{ t('dashboard.footer.dataBefore') }} <code class="font-mono">app/mocks/</code> {{
            t('dashboard.footer.dataAfter') }}
          {{ t('dashboard.footer.emptyBefore') }} <code class="font-mono">?empty=todos</code>{{
            t('dashboard.footer.emptySeparator') }}<code class="font-mono">?empty=documents</code> {{
            t('dashboard.footer.emptyOr') }} <code class="font-mono">?empty=activity</code>{{
            t('dashboard.footer.emptyAfter') }}
        </p>
        </template>
      </template>
    </UDashboardPanel>
  </div>
</template>

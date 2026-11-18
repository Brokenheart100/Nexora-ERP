<script setup lang="ts">
import type { ButtonProps, TableColumn, TimelineItem } from '@nuxt/ui'
import type { BadgeColor, ChangeEntityType, RecentDocument } from '~/mocks'
import {
  changeEntityLabels,
  changeLogEntries,
  invoiceStatusColors,
  invoiceStatusLabels,
  invoices,
  products,
  purchaseOrders,
  recentDocuments,
  salesOrders,
  salesStatusColors,
  salesStatusLabels,
  statusColors,
  statusLabels,
  todos
} from '~/mocks'

type TrendMetric = 'purchase' | 'sales' | 'receivable'
type TodoGroup = 'approval' | 'draft' | 'overdue'
type ActivityFilter = 'all' | ChangeEntityType

const toast = useToast()
const route = useRoute()
const { loading: refreshing, run: runRefresh } = useMockRefresh()
const { workspace } = useMockWorkspace()

const currency = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 1 })
const monthLabels = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月']

const lastUpdatedAt = ref(workspace.value.updatedAt)
watch(() => workspace.value.id, () => {
  lastUpdatedAt.value = workspace.value.updatedAt
})

function nowLabel() {
  const now = new Date()
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`
}

const overviewDescription = computed(() => `${workspace.value.plan} · ${workspace.value.members} 位成员 · 数据更新于 ${lastUpdatedAt.value}`)

// ---- 趋势指标切换 ----
const trendMetric = ref<TrendMetric>('purchase')
const trendOptions: Array<{ label: string, value: TrendMetric }> = [
  { label: '采购额', value: 'purchase' },
  { label: '销售额', value: 'sales' },
  { label: '应收余额', value: 'receivable' }
]
const trendMeta: Record<TrendMetric, { label: string, title: string }> = {
  purchase: { label: '采购额', title: '月度采购额' },
  sales: { label: '销售额', title: '月度销售额' },
  receivable: { label: '应收余额', title: '月末应收余额' }
}
const trendValues = computed(() => trendMetric.value === 'purchase'
  ? workspace.value.monthlyPurchase
  : trendMetric.value === 'sales'
    ? workspace.value.monthlySales
    : workspace.value.monthlyReceivables)
const chartData = computed(() => trendValues.value.map((value, index) => ({ month: monthLabels[index]!, amount: value })))

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
  label: '本月采购额',
  value: formatMoney(monthPurchase.value),
  hint: `演示口径 · 较上月 +${workspace.value.trendPct}%`,
  icon: 'i-carbon-growth',
  tone: 'success',
  iconClass: 'bg-success/10 text-success',
  to: '/purchase-orders'
}, {
  label: '本月销售额',
  value: formatMoney(monthSales.value),
  hint: `演示口径 · 较上月 +${salesTrendPct.value}%`,
  icon: 'i-carbon-chart-line',
  tone: 'info',
  iconClass: 'bg-info/10 text-info',
  to: '/sales'
}, {
  label: '应收 / 应付',
  value: formatWan(receivableTotal.value) + ' / ' + formatWan(payableTotal.value),
  hint: `演示口径 · ${receivableInvoices.value.length} 张待收 · ${payableOrders.value.length} 单待付`,
  icon: 'i-carbon-receipt',
  tone: 'primary',
  iconClass: 'bg-primary/10 text-primary',
  to: '/finance'
}, {
  label: '待处理采购订单',
  value: pendingOrders.value.length + ' 单',
  hint: pendingOrders.value.length ? '演示口径 · 需要审批或跟进' : '演示口径 · 当前无需处理',
  icon: 'i-carbon-purchase',
  tone: 'warning',
  iconClass: 'bg-warning/10 text-warning',
  to: '/purchase-orders'
}, {
  label: '库存预警',
  value: stockWarnings.value + ' 个',
  hint: `演示口径 · 占在售商品的 ${stockWarningRate.value}%`,
  icon: 'i-carbon-warning-alt',
  tone: 'error',
  iconClass: 'bg-error/10 text-error',
  progress: stockWarningRate.value,
  to: '/inventory'
}, {
  label: '在售商品',
  value: activeProducts.value.length + ' 个',
  hint: `演示口径 · 覆盖 ${activeCategories.value} 个品类`,
  icon: 'i-carbon-catalog',
  tone: 'primary',
  iconClass: 'bg-primary/10 text-primary',
  to: '/catalog'
}])

// ---- 待办 ----
const todoGroup = ref<TodoGroup>('approval')
const todoGroups: Array<{ key: TodoGroup, label: string }> = [
  { key: 'approval', label: '审批' },
  { key: 'draft', label: '草稿' },
  { key: 'overdue', label: '逾期' }
]
const workspaceTodos = computed(() => todos.filter(todo => todo.workspaceId === workspace.value.id))
const doneTodos = computed(() => workspaceTodos.value.filter(todo => todo.done).length)
const pendingTodos = computed(() => workspaceTodos.value.filter(todo => !todo.done).length)
const todoProgress = computed(() => Math.round(doneTodos.value / Math.max(1, workspaceTodos.value.length) * 100))
const allTodosDone = computed(() => workspaceTodos.value.length > 0 && workspaceTodos.value.every(todo => todo.done))
const groupCounts = computed(() => Object.fromEntries(todoGroups.map(group => [group.key, workspaceTodos.value.filter(todo => todo.group === group.key && !todo.done).length])) as Record<TodoGroup, number>)
const filteredTodos = computed(() => workspaceTodos.value.filter(todo => todo.group === todoGroup.value))
const activeTodoGroupLabel = computed(() => todoGroups.find(group => group.key === todoGroup.value)?.label ?? '')

function markAllDone() {
  const changed = workspaceTodos.value.filter(todo => !todo.done)
  if (!changed.length) return
  changed.forEach((todo) => {
    todo.done = true
  })
  toast.add({
    title: '待办已全部完成',
    description: '本地演示状态，可撤销。',
    color: 'success',
    icon: 'i-carbon-checkmark',
    actions: [{
      label: '撤销',
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

const documentColumns: TableColumn<RecentDocument>[] = [{
  accessorKey: 'id',
  header: '单号'
}, {
  accessorKey: 'type',
  header: '类型'
}, {
  accessorKey: 'title',
  header: '往来单位'
}, {
  accessorKey: 'status',
  header: '状态'
}, {
  accessorKey: 'amount',
  header: '金额',
  meta: { class: { th: 'text-right', td: 'text-right' } }
}, {
  accessorKey: 'at',
  header: '更新时间',
  meta: { class: { th: 'text-right', td: 'text-right whitespace-nowrap' } }
}]

function documentStatusLabel(document: RecentDocument) {
  if (document.type === '销售订单') {
    const order = salesOrders.find(item => item.id === document.id)
    return order ? salesStatusLabels[order.status] : document.status
  }
  if (document.type === '采购发票') {
    const invoice = invoices.find(item => item.id === document.id)
    return invoice ? invoiceStatusLabels[invoice.status] : document.status
  }
  if (document.type === '采购订单') {
    const order = purchaseOrders.find(item => item.id === document.id)
    return order ? statusLabels[order.status] : document.status
  }
  return document.status
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
const activityOptions: Array<{ label: string, value: ActivityFilter }> = [
  { label: '全部类型', value: 'all' },
  ...Object.entries(changeEntityLabels).map(([value, label]) => ({ label, value: value as ChangeEntityType }))
]
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
  title: changeEntityLabels[entry.entityType] + ' · ' + entry.action,
  description: entry.entityName + ' · ' + entry.actor + '：' + entry.summary,
  icon: activityIconMap[entry.entityType]
})))

function exportReport() {
  downloadCsv(
    '工作台单据-' + new Date().toISOString().slice(0, 10) + '.csv',
    ['单号', '类型', '往来单位', '状态', '金额', '更新时间'],
    workspaceDocuments.value.map(document => [
      document.id,
      document.type,
      document.title,
      documentStatusLabel(document),
      document.amount.toFixed(2),
      document.at
    ])
  )
  toast.add({
    title: '已导出 ' + workspaceDocuments.value.length + ' 条单据',
    description: 'CSV 由浏览器本地生成，未经过后端。',
    color: 'success',
    icon: 'i-carbon-document-export'
  })
}

function refreshData() {
  runRefresh(() => {
    lastUpdatedAt.value = nowLabel()
    toast.add({
      title: '数据已刷新',
      description: '演示数据已重新读取，刷新页面仍会恢复初始值。',
      color: 'neutral',
      icon: 'i-carbon-renew'
    })
  })
}

const overviewLinks = computed<ButtonProps[]>(() => [{
  label: '导出报表',
  icon: 'i-carbon-document-export',
  color: 'neutral',
  variant: 'outline',
  size: 'sm',
  onClick: exportReport
}, {
  label: '刷新',
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
        <UDashboardNavbar title="工作台" :ui="{ right: 'gap-2' }">
          <template #leading>
            <UDashboardSidebarCollapse />
          </template>

          <template #right>
            <NotificationButton />
            <UButton
              to="/purchase-orders"
              label="新建采购订单"
              icon="i-carbon-add"
              color="primary"
              size="sm"
            />
          </template>
        </UDashboardNavbar>
      </template>

      <template #body>
        <UPageHeader
          headline="工作区总览"
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
              :style="{ '--nx-delay': `${index * 50}ms` }"
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
                aria-label="库存预警占比"
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
                    2026 年 1–12 月 · 单位：万元 · 演示数据
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
              :format="value => `${currency.format(value)} 万`"
              :aria-label="trendMeta[trendMetric].title + '柱状图'"
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
                    我的待办
                  </h3>
                  <p class="mt-0.5 text-xs text-muted">
                    按审批、草稿与逾期分组
                  </p>
                </div>
                <UButton
                  label="全部完成"
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
                aria-label="待办完成度"
              />

              <div v-if="emptyTodos" class="py-2" data-testid="dashboard-empty-todos">
                <UEmpty
                  variant="naked"
                  icon="i-carbon-task"
                  title="暂无待办"
                  description="演示：当前工作区没有待办事项（?empty=todos）"
                />
              </div>
              <div v-else-if="allTodosDone" class="py-2" data-testid="dashboard-todo-all-done">
                <UEmpty
                  variant="naked"
                  icon="i-carbon-checkmark-filled"
                  title="全部完成"
                  description="当前工作区的待办已全部完成，可恢复到演示初始状态。"
                />
                <div class="mt-2 text-center">
                  <UButton
                    label="恢复全部待办"
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
                  title="该分组暂无待办"
                  :description="`${activeTodoGroupLabel}分组已清空，可切换到其他分组。`"
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
                        :label="todo.priority === 'high' ? '高' : todo.priority === 'medium' ? '中' : '低'"
                      />
                    </div>
                  </div>
                </li>
              </ul>
            </template>
          </UCard>
        </div>

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
                    最近单据
                  </h3>
                  <p class="mt-0.5 text-xs text-muted">
                    采购、入库、销售、发票与付款的最近动态
                  </p>
                </div>
                <UButton
                  to="/change-log"
                  label="查看全部"
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
                    title="暂无单据"
                    description="演示：当前工作区暂时没有单据（?empty=documents）"
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
                    最近动态
                  </h3>
                  <p class="mt-0.5 text-xs text-muted">
                    来自模拟审计记录
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
                title="暂无动态"
                description="演示：当前工作区没有变更记录（?empty=activity）"
              />
            </div>
            <div v-else class="nx-reveal" :style="{ '--nx-delay': '300ms' }">
              <UTimeline
                :items="activityItems"
                size="sm"
                color="primary"
              />
              <UButton
                to="/change-log"
                label="查看全部变更"
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
          所有数据来自 <code class="font-mono">app/mocks/</code> 的本地模拟数据，刷新页面后恢复初始值。
          空态演示：在地址后追加 <code class="font-mono">?empty=todos</code>、<code class="font-mono">?empty=documents</code> 或 <code class="font-mono">?empty=activity</code>。
        </p>
      </template>
    </UDashboardPanel>
  </div>
</template>

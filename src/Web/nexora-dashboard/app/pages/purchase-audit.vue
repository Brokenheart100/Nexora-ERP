<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { PurchaseAuditEntry } from '~/mocks'
import { approvalActionLabels, purchaseOrders } from '~/mocks'

interface AuditRow extends PurchaseAuditEntry {
  supplier: string
}

type ActionBadgeColor = 'neutral' | 'warning' | 'success' | 'error'

const route = useRoute()
const auth = useAuthSessionStore()
const toast = useToast()
const { isLoading: stateLoading, isEmpty, isError, isForbidden } = useMockState()

function buildRows(): AuditRow[] {
  return purchaseOrders
    .flatMap(order => (order.audit ?? []).map(entry => ({ ...entry, supplier: order.supplier })))
    .sort((a, b) => b.at.localeCompare(a.at))
}

const { data: auditData, loading, run } = useMockAsync(buildRows, { delay: 550, immediate: true })
const rows = computed(() => auditData.value ?? [])

const keywordInput = ref('')
const keyword = ref('')
const orderFilter = ref('all')
const actionFilter = ref('all')
const pageSize = 10

const applyKeyword = useDebounceFn((value: string) => {
  keyword.value = value.trim()
}, 220)

watch(keywordInput, value => applyKeyword(value))

const orderItems = computed(() => {
  const seen = new Set<string>()
  const items = [{ label: '全部单据', value: 'all' }]
  for (const row of rows.value) {
    if (seen.has(row.orderId)) continue
    seen.add(row.orderId)
    items.push({ label: row.orderId + ' · ' + row.supplier, value: row.orderId })
  }
  return items
})

const actionItems = computed(() => [
  { label: '全部操作', value: 'all' },
  ...[...new Set(rows.value.map(row => row.action))].map(action => ({ label: action, value: action }))
])

const hasFilters = computed(() => keyword.value.length > 0
  || orderFilter.value !== 'all'
  || actionFilter.value !== 'all')

const filteredRows = computed(() => rows.value.filter((row) => {
  if (orderFilter.value !== 'all' && row.orderId !== orderFilter.value) return false
  if (actionFilter.value !== 'all' && row.action !== actionFilter.value) return false
  if (keyword.value.length === 0) return true
  const text = [row.orderId, row.supplier, row.action, row.actor, row.detail].join(' ')
  return text.toLowerCase().includes(keyword.value.toLowerCase())
}))

const {
  page,
  pageRows,
  pageStart,
  pageEnd,
  resetPage
} = useClientPagination(filteredRows, pageSize)

watch([keyword, orderFilter, actionFilter], resetPage)

const showSkeleton = computed(() => stateLoading.value || loading.value)

const columns: TableColumn<AuditRow>[] = [
  { accessorKey: 'at', header: '时间' },
  { accessorKey: 'orderId', header: '单据' },
  { accessorKey: 'supplier', header: '供应商' },
  { accessorKey: 'action', header: '操作' },
  { accessorKey: 'actor', header: '操作人' },
  { accessorKey: 'detail', header: '详情' }
]

function actionColor(action: string): ActionBadgeColor {
  if (action === approvalActionLabels.submitted) return 'warning'
  if (action === approvalActionLabels.approved) return 'success'
  if (action === approvalActionLabels.rejected) return 'error'
  return 'neutral'
}

function resetFilters() {
  keywordInput.value = ''
  keyword.value = ''
  orderFilter.value = 'all'
  actionFilter.value = 'all'
  page.value = 1
}

async function refreshAudit() {
  await run()
  toast.add({
    title: '采购审计已刷新',
    description: '审计记录来自本地 mock 数据，刷新页面后恢复初始状态。',
    color: 'neutral',
    icon: 'i-carbon-renew'
  })
}

function exportAudit() {
  downloadCsv(
    '采购审计-' + new Date().toISOString().slice(0, 10) + '.csv',
    ['时间', '单据', '供应商', '操作', '操作人', '详情'],
    filteredRows.value.map(row => [row.at, row.orderId, row.supplier, row.action, row.actor, row.detail])
  )
  toast.add({
    title: '已导出采购审计',
    description: '共 ' + filteredRows.value.length + ' 条记录（CSV）。',
    color: 'success',
    icon: 'i-carbon-document-export'
  })
}

async function backToOrders() {
  await navigateTo('/purchase-orders')
}

async function reloadPage() {
  await navigateTo({ path: route.path, query: {} })
}
</script>

<template>
  <div class="contents">
    <UDashboardPanel id="purchase-audit">
      <template #header>
        <UDashboardNavbar title="采购审计">
          <template #leading>
            <UDashboardSidebarCollapse />
          </template>

          <template #right>
            <UButton
              label="返回采购订单"
              icon="i-carbon-arrow-left"
              color="neutral"
              variant="ghost"
              size="sm"
              data-testid="audit-back"
              @click="backToOrders"
            />
          </template>
        </UDashboardNavbar>

        <UDashboardToolbar v-if="!auth.connected" :ui="{ root: 'flex-wrap gap-3 py-2.5' }">
          <template #left>
            <UInput
              v-model="keywordInput"
              icon="i-carbon-search"
              placeholder="搜索单号、操作人或详情"
              size="sm"
              class="w-60 max-w-full"
              data-testid="audit-keyword"
            />
            <USelect
              v-model="orderFilter"
              :items="orderItems"
              size="sm"
              class="w-56"
              data-testid="audit-order"
            />
            <USelect
              v-model="actionFilter"
              :items="actionItems"
              size="sm"
              class="w-36"
              data-testid="audit-action"
            />
            <UButton
              v-if="hasFilters"
              label="重置筛选"
              icon="i-carbon-reset"
              color="neutral"
              variant="ghost"
              size="sm"
              data-testid="audit-reset"
              @click="resetFilters"
            />
          </template>

          <template #right>
            <UBadge
              v-if="hasFilters"
              color="primary"
              variant="subtle"
              size="sm"
              data-testid="audit-filter-count"
            >
              当前筛选 {{ filteredRows.length }} 条
            </UBadge>
            <p class="text-xs text-muted">
              共 {{ filteredRows.length }} 条审计记录
            </p>
            <UButton
              label="导出 CSV"
              icon="i-carbon-document-export"
              color="neutral"
              variant="ghost"
              size="sm"
              :disabled="filteredRows.length === 0"
              data-testid="audit-export"
              @click="exportAudit"
            />
            <UTooltip text="刷新审计记录">
              <UButton
                icon="i-carbon-renew"
                color="neutral"
                variant="ghost"
                size="sm"
                :loading="loading"
                aria-label="刷新采购审计"
                data-testid="audit-refresh"
                @click="refreshAudit"
              />
            </UTooltip>
          </template>
        </UDashboardToolbar>
      </template>

      <template #body>
        <SettingsLiveAudit v-if="auth.connected" view="audit" fixed-source="purchasing" />
        <template v-else>
          <AppBreadcrumb current="采购审计" class="mb-3" />
          <UCard class="nx-reveal rounded-sm" :ui="{ body: 'p-0 sm:p-0', footer: 'p-0 sm:p-0' }">
            <div v-if="showSkeleton" class="space-y-2 p-4" data-testid="audit-skeleton">
              <USkeleton v-for="n in 8" :key="n" class="h-9 w-full" />
            </div>
            <div v-else-if="isError" class="p-6" data-testid="audit-state-error">
              <UAlert
                color="error"
                variant="soft"
                icon="i-carbon-warning-alt"
                title="采购审计加载失败（演示）"
                description="?state=error 会模拟一次加载失败。本原型不会访问后端。"
                :actions="[{ label: '恢复正常', color: 'neutral', variant: 'outline', size: 'sm', onClick: reloadPage }]"
              />
            </div>
            <div v-else-if="isForbidden" class="py-6" data-testid="audit-state-forbidden">
              <UEmpty
                variant="naked"
                icon="i-carbon-view-off"
                title="没有采购审计读取权限（演示）"
                description="?state=forbidden 模拟演示身份缺少 purchase.view 权限。"
                :actions="[{ label: '恢复正常', color: 'neutral', variant: 'outline', size: 'sm', onClick: reloadPage }]"
              />
            </div>
            <div v-else-if="isEmpty" class="py-6" data-testid="audit-state-empty">
              <UEmpty
                variant="naked"
                icon="i-carbon-list-checked"
                title="空状态演示"
                description="?state=empty 让采购审计返回 0 条记录。"
                :actions="[{ label: '恢复正常', color: 'neutral', variant: 'outline', size: 'sm', onClick: reloadPage }]"
              />
            </div>
            <div v-else :key="'audit-page-' + page" class="nx-fade">
              <ResizableTable
                :data="pageRows"
                :columns="columns"
                class="nx-table"
                :ui="{ th: 'py-2.5', td: 'py-3' }"
                data-testid="audit-table"
              >
                <template #action-cell="{ row }">
                  <UBadge
                    :color="actionColor(row.original.action)"
                    variant="subtle"
                    size="sm"
                    :label="row.original.action"
                  />
                </template>
                <template #empty>
                  <UEmpty
                    variant="naked"
                    icon="i-carbon-list-checked"
                    title="当前筛选下没有审计记录"
                    description="清空筛选条件后重试"
                    data-testid="audit-empty"
                    :actions="[{ label: '清空筛选', color: 'neutral', variant: 'outline', size: 'sm', onClick: resetFilters }]"
                  />
                </template>
              </ResizableTable>
            </div>

            <template #footer>
              <div
                v-if="!showSkeleton && !isError && !isForbidden && !isEmpty"
                class="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5"
              >
                <p class="text-xs text-muted">
                  第 {{ pageStart }}–{{ pageEnd }} 条，共 {{ filteredRows.length }} 条
                  <span v-if="hasFilters" class="text-primary">
                    · 当前筛选 {{ filteredRows.length }} 条
                  </span>
                </p>
                <UPagination
                  v-model:page="page"
                  :total="filteredRows.length"
                  :items-per-page="pageSize"
                  size="sm"
                  data-testid="audit-pagination"
                />
              </div>
            </template>
          </UCard>
        </template>
      </template>
    </UDashboardPanel>
  </div>
</template>

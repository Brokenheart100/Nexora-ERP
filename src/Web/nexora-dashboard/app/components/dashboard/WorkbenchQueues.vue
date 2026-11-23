<script setup lang="ts">
import { compareDecimal } from '#shared/utils/decimal'
import { useWorkspaceQuery } from '~/composables/api/useWorkspaceQuery'
import { usePurchasingApi } from '~/composables/api/usePurchasingApi'
import { useSalesApi } from '~/composables/api/useSalesApi'
import { useInventoryApi } from '~/composables/api/useInventoryApi'
import { useMasterDataApi } from '~/composables/api/useMasterDataApi'
import { hasPermission } from '~/utils/api/access'

const session = useLiveSessionStore()
const purchasing = usePurchasingApi()
const sales = useSalesApi()
const inventory = useInventoryApi()
const catalog = useMasterDataApi()
const purchaseOrders = useWorkspaceQuery('workbench-purchase', '/purchase-orders', (id, signal) => purchasing.list(id, 1, signal))
const salesOrders = useWorkspaceQuery('workbench-sales', '/sales', (id, signal) => sales.list(id, false, 1, 20, signal))
const warehousing = useWorkspaceQuery('workbench-warehouses', '/inventory', inventory.warehouses)
const warehouse = ref('')
const stockPage = ref(1)
const positions = useWorkspaceQuery('workbench-stock', '/inventory', (id, signal) =>
  warehouse.value ? inventory.pools(id, warehouse.value, stockPage.value, signal) : Promise.resolve([]), () => [warehouse.value, stockPage.value])
const warehouses = computed(() => (warehousing.data?.warehouses ?? []).filter(row => row.canReadStock)
  .map(row => ({ label: row.code + ' · ' + row.name, value: row.id })))
const canReadInventory = computed(() => warehousing.enabled)
const flags = computed(() => (positions.data ?? []).filter(row => compareDecimal(row.available, '0') <= 0))
const names = useWorkspaceQuery('workbench-stock-catalog', '/catalog', async (id, signal) => (await catalog.catalog(id, 1, signal, 50)).data.page.items)
const items = computed(() => new Map((names.data ?? []).map(item => [item.id, item.code + ' · ' + item.name])))
const approvals = computed(() => {
  const workspace = session.activeWorkspaceId
  const to = (path: string, order: string) => ({ path, query: { workspace, order } })
  const reviewable = (permission: string, row: { state: string, on: string, departmentId?: string | null }) =>
    row.state.toLowerCase() === 'submitted' && hasPermission(session.access, permission, { on: row.on, departmentId: row.departmentId ?? undefined })
  return [
    ...(purchaseOrders.data?.orders ?? []).filter(row => reviewable('purchasing.order.approve', row))
      .map(row => ({ ...row, label: '采购', partner: row.supplierName, to: to('/purchase-orders', row.id) })),
    ...(salesOrders.data?.orders ?? []).filter(row => reviewable('sales.order.approve', row))
      .map(row => ({ ...row, label: '销售', partner: row.customerName, to: to('/sales', row.id) }))
  ].sort((a, b) => b.on.localeCompare(a.on))
})
const approvalError = computed(() => purchaseOrders.problem || salesOrders.problem)
watch(() => warehousing.owner, () => {
  warehouse.value = ''
  stockPage.value = 1
}, { flush: 'sync' })
watch(warehouses, (options) => {
  if (!options.some(option => option.value === warehouse.value)) warehouse.value = options[0]?.value ?? ''
}, { immediate: true })
watch(warehouse, () => {
  stockPage.value = 1
})

async function refresh() {
  await Promise.all([purchaseOrders.refresh(), salesOrders.refresh(), warehousing.refresh(), positions.refresh()])
}
defineExpose({ refresh })
</script>

<template>
  <div class="grid min-w-0 gap-4 xl:grid-cols-2">
    <UCard
      v-if="purchaseOrders.enabled || salesOrders.enabled"
      id="approval-inbox"
      class="rounded-sm"
      data-testid="live-approval-inbox"
    >
      <template #header>
        <h2 class="font-semibold">
          审批收件箱
        </h2>
        <p class="mt-1 text-xs text-muted">
          按各模块可见的最近 20 笔订单读取待复核单据。
        </p>
      </template>
      <UAlert
        v-if="approvalError"
        color="warning"
        :title="approvalError"
        class="mb-2"
      />
      <USkeleton v-if="(purchaseOrders.loading || salesOrders.loading) && !approvals.length" class="h-14 w-full" />
      <ul v-else-if="approvals.length" class="divide-y divide-default">
        <li v-for="row in approvals" :key="row.label + row.id" class="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
          <span>{{ row.label }} · {{ row.partner }}</span>
          <UButton
            :to="row.to"
            :label="row.number"
            variant="link"
            size="sm"
          />
        </li>
      </ul>
      <p v-else-if="!approvalError" class="text-sm text-muted">
        当前范围没有待复核订单。
      </p>
    </UCard>
    <UCard v-if="canReadInventory" class="rounded-sm" data-testid="live-stock-alerts">
      <template #header>
        <h2 class="font-semibold">
          库存预警
        </h2>
        <p class="mt-1 text-xs text-muted">
          筛选选定仓库当前页中可用量小于或等于零的库存位置。
        </p>
      </template>
      <UAlert v-if="warehousing.problem || positions.problem" color="warning" :title="warehousing.problem || positions.problem" />
      <USkeleton v-else-if="warehousing.loading && !warehousing.data" class="h-14 w-full" />
      <div v-else-if="warehouse" class="space-y-2">
        <UFormField label="仓库">
          <USelect v-model="warehouse" :items="warehouses" data-testid="stock-alert-warehouse" />
        </UFormField>
        <USkeleton v-if="positions.loading && !positions.data" class="h-12 w-full" />
        <ul v-else-if="flags.length" class="divide-y divide-default">
          <li v-for="row in flags" :key="row.itemId" class="flex flex-wrap justify-between gap-2 py-2 text-sm">
            <span class="break-all">{{ items.get(row.itemId) ?? row.itemId }}</span>
            <UBadge :label="'可用 ' + row.available" color="warning" variant="subtle" />
          </li>
        </ul>
        <p v-else class="text-sm text-muted">
          该页没有可用量不足的位置。
        </p>
        <div class="flex flex-wrap items-center gap-2">
          <UButton
            label="上一页"
            variant="ghost"
            size="xs"
            :disabled="stockPage === 1 || positions.loading"
            @click="stockPage--"
          />
          <span class="text-xs text-muted">第 {{ stockPage }} 页</span>
          <UButton
            label="下一页"
            variant="ghost"
            size="xs"
            :disabled="(positions.data?.length ?? 0) < 20 || positions.loading"
            @click="stockPage++"
          />
          <UButton
            label="查看库存"
            :to="{ path: '/inventory', query: { workspace: session.activeWorkspaceId, tab: 'positions', warehouse } }"
            variant="link"
            size="xs"
          />
        </div>
      </div>
      <p v-else class="text-sm text-muted">
        当前身份没有可读取的仓库库存。
      </p>
    </UCard>
  </div>
</template>

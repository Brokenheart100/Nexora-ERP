<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { SupplierBill } from '~/mocks'

defineProps<{ canPost: boolean }>()

const emit = defineEmits<{
  'open-bill': [billId: string]
  'pay-bill': [billId: string]
  'create': []
}>()

const store = useSupplierTradeStore()
const { activeWorkspaceId } = useMockWorkspace()
const workspaceBills = computed(() => store.bills.filter(bill => bill.workspaceId === activeWorkspaceId.value))

const keyword = ref('')
const billFilter = ref('all')
const billFilterItems = [
  { label: '全部账单', value: 'all' },
  { label: '待复核', value: 'pending' },
  { label: '未结', value: 'open' },
  { label: '已结清', value: 'settled' },
  { label: '已退回', value: 'cancelled' }
]
const filteredBills = computed(() => {
  const term = keyword.value.trim().toLowerCase()
  return workspaceBills.value.filter((bill) => {
    if (billFilter.value === 'pending' && bill.status !== 'pending') return false
    if (billFilter.value === 'cancelled' && bill.status !== 'cancelled') return false
    if (billFilter.value === 'open' && (bill.status !== 'posted' || store.outstandingOf(bill) <= 0.005)) return false
    if (billFilter.value === 'settled' && (bill.status !== 'posted' || store.outstandingOf(bill) > 0.005)) return false
    if (!term) return true
    return [bill.id, bill.supplier, bill.orderId].some(value => value.toLowerCase().includes(term))
  })
})

const billsColumns: TableColumn<SupplierBill>[] = [
  { accessorKey: 'id', header: '账单号', id: 'number' },
  { accessorKey: 'supplier', header: '供应商', id: 'supplier' },
  { accessorKey: 'date', header: '账单日期', id: 'date' },
  { accessorKey: 'dueAt', header: '到期日', id: 'dueAt' },
  { accessorKey: 'total', header: '价税合计', id: 'total' },
  { id: 'paid', header: '已付' },
  { id: 'outstanding', header: '未结' },
  { id: 'status', header: '状态' },
  { id: 'actions', header: '操作' }
]
</script>

<template>
  <UCard class="rounded-sm" :ui="{ body: 'p-0 sm:p-0' }">
    <template #header>
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 class="text-sm font-semibold text-highlighted">
            供应商账单
          </h3>
          <p class="mt-0.5 text-xs text-muted">
            收货暂估 → 账单匹配 → 复核过账 → 付款核销；所有写入仅作用于本地预览。
          </p>
        </div>
        <UButton
          icon="i-carbon-add"
          label="新建供应商账单"
          data-testid="payables-new-bill"
          :disabled="!canPost"
          @click="emit('create')"
        />
      </div>
    </template>
    <div class="flex flex-wrap items-center gap-2 border-b border-default px-4 py-3">
      <UInput
        v-model="keyword"
        icon="i-carbon-search"
        placeholder="搜索账单号、供应商或采购单"
        class="w-72"
        data-testid="payables-search"
      />
      <USelect
        v-model="billFilter"
        :items="billFilterItems"
        class="w-36"
        data-testid="payables-status-filter"
      />
      <span class="text-xs text-muted">共 {{ filteredBills.length }} 张账单</span>
    </div>
    <ResizableTable
      :data="filteredBills"
      :columns="billsColumns"
      :row-activate="(row: SupplierBill) => emit('open-bill', row.id)"
      data-testid="payables-bills"
    >
      <template #number-cell="{ row }">
        <UButton
          :label="row.original.id"
          variant="link"
          color="primary"
          size="sm"
          class="px-0"
          :data-testid="'bill-link-' + row.original.id"
          @click.stop="emit('open-bill', row.original.id)"
        />
      </template>
      <template #total-cell="{ row }">
        <span class="tabular-nums">{{ formatMoney(row.original.total) }}</span>
      </template>
      <template #paid-cell="{ row }">
        <span class="tabular-nums">{{ formatMoney(store.paidOf(row.original.id)) }}</span>
      </template>
      <template #outstanding-cell="{ row }">
        <span class="tabular-nums font-medium" :class="store.outstandingOf(row.original) > 0 ? 'text-warning' : 'text-muted'" :data-testid="'bill-outstanding-' + row.original.id">{{ formatMoney(store.outstandingOf(row.original)) }}</span>
      </template>
      <template #status-cell="{ row }">
        <UBadge
          :label="store.billStatus(row.original).label"
          :color="store.billStatus(row.original).color"
          variant="subtle"
          size="sm"
        />
      </template>
      <template #actions-cell="{ row }">
        <div class="flex justify-end gap-1">
          <UButton
            label="详情"
            color="neutral"
            variant="ghost"
            size="xs"
            :data-testid="'bill-open-' + row.original.id"
            @click.stop="emit('open-bill', row.original.id)"
          />
          <UButton
            v-if="row.original.status === 'posted' && store.outstandingOf(row.original) > 0"
            label="付款"
            color="primary"
            variant="ghost"
            size="xs"
            :data-testid="'bill-pay-' + row.original.id"
            @click.stop="emit('pay-bill', row.original.id)"
          />
        </div>
      </template>
    </ResizableTable>
    <UEmpty
      v-if="!filteredBills.length"
      variant="naked"
      icon="i-carbon-receipt"
      title="没有符合条件的账单"
      description="调整筛选条件，或新建一张供应商账单。"
      class="py-10"
    />
  </UCard>
</template>

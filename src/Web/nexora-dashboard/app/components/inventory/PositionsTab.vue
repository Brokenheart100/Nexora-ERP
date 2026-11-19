<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { InventoryPosition } from '~/mocks'
import { LOW_STOCK_THRESHOLD, warehouses } from '~/mocks'

const props = defineProps<{
  rows: InventoryPosition[]
}>()

const emit = defineEmits<{
  'open-movements': [position: InventoryPosition]
}>()

const toast = useToast()
const positionWarehouse = ref('all')
const positionSearchInput = ref('')
const positionSearch = ref('')
const applyPositionSearch = useDebounceFn((value: string) => {
  positionSearch.value = value
}, 220)
watch(positionSearchInput, value => applyPositionSearch(value))

const positionPage = ref(1)
const positionPageSize = 8

const positionWarehouseItems = computed(() => [
  { label: '全部仓库', value: 'all' },
  ...warehouses.map(warehouse => ({ label: warehouse.name, value: warehouse.id }))
])

function warehouseName(id: string) {
  return warehouses.find(warehouse => warehouse.id === id)?.name ?? id
}

const filteredPositions = computed(() => {
  const keyword = positionSearch.value.trim().toLowerCase()
  const list = props.rows.filter((position) => {
    if (positionWarehouse.value !== 'all' && position.warehouseId !== positionWarehouse.value) return false
    if (!keyword) return true
    const text = [position.sku, position.name, position.lotNo, warehouseName(position.warehouseId)].join(' ').toLowerCase()
    return text.includes(keyword)
  })
  return [...list].sort((a, b) => a.warehouseId.localeCompare(b.warehouseId) || a.sku.localeCompare(b.sku) || a.lotNo.localeCompare(b.lotNo))
})

const positionPageRows = computed(() => {
  const start = (positionPage.value - 1) * positionPageSize
  return filteredPositions.value.slice(start, start + positionPageSize)
})
const positionPageStart = computed(() => (filteredPositions.value.length ? (positionPage.value - 1) * positionPageSize + 1 : 0))
const positionPageEnd = computed(() => (positionPage.value - 1) * positionPageSize + positionPageRows.value.length)
const positionHasFilters = computed(() => positionWarehouse.value !== 'all' || Boolean(positionSearch.value))

watch([positionWarehouse, positionSearch], () => {
  positionPage.value = 1
})

const positionColumns: TableColumn<InventoryPosition>[] = [
  { accessorKey: 'name', header: '商品', meta: { class: { td: 'min-w-[220px] whitespace-normal' } } },
  { id: 'warehouse', header: '仓库', meta: { class: { td: 'whitespace-nowrap text-muted' } } },
  { accessorKey: 'lotNo', header: '批次', meta: { class: { td: 'font-mono text-[11px] text-muted' } } },
  { accessorKey: 'quantity', header: '数量', meta: { class: { th: 'text-right', td: 'text-right tabular-nums' } } },
  { accessorKey: 'reserved', header: '预留', meta: { class: { th: 'text-right', td: 'text-right tabular-nums text-muted' } } },
  { accessorKey: 'available', header: '可用量', meta: { class: { th: 'text-right', td: 'text-right tabular-nums' } } },
  { accessorKey: 'updatedAt', header: '更新时间', meta: { class: { td: 'whitespace-nowrap text-xs text-muted' } } },
  { id: 'actions', header: '操作', meta: { class: { th: 'w-28 text-right', td: 'w-28 text-right' } } }
]

function resetPositionFilters() {
  positionWarehouse.value = 'all'
  positionSearchInput.value = ''
  positionSearch.value = ''
  positionPage.value = 1
}

function filterByWarehouse(warehouseId: string) {
  positionWarehouse.value = warehouseId
  positionSearchInput.value = ''
  positionSearch.value = ''
  positionPage.value = 1
}

function filterBySku(sku: string) {
  positionWarehouse.value = 'all'
  positionSearchInput.value = sku
  positionSearch.value = sku
  positionPage.value = 1
}

function openMovements(position: InventoryPosition) {
  emit('open-movements', position)
}

function exportCsv() {
  downloadCsv(
    '库存位置-' + new Date().toISOString().slice(0, 10) + '.csv',
    ['商品', 'SKU', '仓库', '批次', '数量', '预留', '可用量', '更新时间'],
    filteredPositions.value.map(position => [
      position.name,
      position.sku,
      warehouseName(position.warehouseId),
      position.lotNo,
      position.quantity,
      position.reserved,
      position.available,
      position.updatedAt
    ])
  )
  toast.add({
    title: '已导出 ' + filteredPositions.value.length + ' 个库存位置',
    description: 'CSV 由浏览器本地生成，未经过后端。',
    color: 'success',
    icon: 'i-carbon-document-export'
  })
}

defineExpose({ filterByWarehouse, filterBySku, exportCsv })
</script>

<template>
  <div data-testid="inventory-positions">
    <div class="flex flex-wrap items-center gap-2 border-b border-default px-4 py-2.5">
      <USelect
        v-model="positionWarehouse"
        :items="positionWarehouseItems"
        size="sm"
        class="w-44"
        data-testid="inventory-position-warehouse"
      />
      <UInput
        v-model="positionSearchInput"
        icon="i-carbon-search"
        placeholder="搜索商品、SKU 或批次"
        size="sm"
        class="w-64 max-w-full"
        data-testid="inventory-position-search"
      />
      <UButton
        v-if="positionHasFilters"
        label="重置"
        icon="i-carbon-reset"
        color="neutral"
        variant="ghost"
        size="sm"
        data-testid="inventory-position-reset"
        @click="resetPositionFilters"
      />
      <div class="ml-auto flex items-center gap-2">
        <p class="text-xs text-muted">
          共 {{ filteredPositions.length }} 个位置
        </p>
        <UButton
          label="导出 CSV"
          icon="i-carbon-download"
          color="neutral"
          variant="ghost"
          size="sm"
          data-testid="inventory-position-export"
          @click="exportCsv"
        />
      </div>
    </div>
    <ResizableTable
      :data="positionPageRows"
      :columns="positionColumns"
      class="nx-table"
      :ui="{ th: 'py-2.5', td: 'py-3' }"
      :row-activate="openMovements"
      data-testid="inventory-position-table"
    >
      <template #name-cell="{ row }">
        <div class="min-w-0">
          <p class="truncate text-default">
            {{ row.original.name }}
          </p>
          <p class="mt-0.5 font-mono text-[11px] text-muted">
            {{ row.original.sku }}
          </p>
        </div>
      </template>
      <template #warehouse-cell="{ row }">
        {{ warehouseName(row.original.warehouseId) }}
      </template>
      <template #available-cell="{ row }">
        <span :class="row.original.available < LOW_STOCK_THRESHOLD ? 'text-warning' : ''">
          {{ formatNumber(row.original.available) }}
        </span>
      </template>
      <template #actions-cell="{ row }">
        <UButton
          label="流水"
          color="neutral"
          variant="ghost"
          size="xs"
          data-testid="inventory-position-movements"
          @click="openMovements(row.original)"
        />
      </template>
      <template #empty>
        <UEmpty
          variant="naked"
          icon="i-carbon-package"
          title="当前筛选下没有库存位置"
          description="切换仓库或清空搜索条件后重试"
          :actions="[{ label: '清空筛选', color: 'neutral', variant: 'outline', size: 'sm', onClick: resetPositionFilters }]"
        />
      </template>
    </ResizableTable>
    <div class="flex flex-wrap items-center justify-between gap-3 border-t border-default px-4 py-2.5">
      <p class="text-xs text-muted">
        第 {{ positionPageStart }}–{{ positionPageEnd }} 条，共 {{ filteredPositions.length }} 条
      </p>
      <UPagination
        v-model:page="positionPage"
        :total="filteredPositions.length"
        :items-per-page="positionPageSize"
        size="sm"
        data-testid="inventory-position-pagination"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { LowStockItem } from '~/mocks'
import { LOW_STOCK_THRESHOLD, warehouses } from '~/mocks'

const props = defineProps<{
  items: LowStockItem[]
}>()

const emit = defineEmits<{
  'open-item': [item: LowStockItem]
}>()

const toast = useToast()

const zeroStockItems = computed(() => props.items.filter(item => item.zeroWarehouseCount > 0).length)

function warehouseName(id: string) {
  return warehouses.find(warehouse => warehouse.id === id)?.name ?? id
}

const lowStockColumns: TableColumn<LowStockItem>[] = [
  { accessorKey: 'name', header: '商品', meta: { class: { td: 'min-w-[220px] whitespace-normal' } } },
  { accessorKey: 'unit', header: '单位', meta: { class: { td: 'text-muted' } } },
  { accessorKey: 'totalAvailable', header: '合计可用', meta: { class: { th: 'text-right', td: 'text-right tabular-nums' } } },
  { id: 'distribution', header: '各仓库可用量', meta: { class: { td: 'whitespace-nowrap' } } },
  { id: 'status', header: '状态', meta: { class: { th: 'w-24' } } },
  { id: 'actions', header: '操作', meta: { class: { th: 'w-28 text-right', td: 'w-28 text-right' } } }
]

function openItem(item: LowStockItem) {
  emit('open-item', item)
}

function exportCsv() {
  downloadCsv(
    '低库存-' + new Date().toISOString().slice(0, 10) + '.csv',
    ['商品', 'SKU', '单位', '合计可用', '阈值', '涉及仓库数', '零库存仓库数'],
    props.items.map(item => [
      item.name,
      item.sku,
      item.unit,
      item.totalAvailable,
      LOW_STOCK_THRESHOLD,
      item.warehouseIds.length,
      item.zeroWarehouseCount
    ])
  )
  toast.add({
    title: '已导出 ' + props.items.length + ' 个低库存 SKU',
    description: '阈值 ' + LOW_STOCK_THRESHOLD + ' 件，CSV 由浏览器本地生成。',
    color: 'success',
    icon: 'i-carbon-document-export'
  })
}

defineExpose({ exportCsv })
</script>

<template>
  <div class="p-4" data-testid="inventory-low-stock">
    <UAlert
      color="warning"
      variant="soft"
      icon="i-carbon-warning-alt"
      title="低库存演示阈值"
      :description="'按商品跨仓库汇总可用量，低于 ' + LOW_STOCK_THRESHOLD + ' 件（含 0）计入低库存；阈值常量定义在 app/mocks/inventory.ts 的 LOW_STOCK_THRESHOLD。'"
      data-testid="inventory-low-threshold"
    />
    <div class="mt-3 flex flex-wrap items-center justify-between gap-2">
      <div class="flex items-center gap-2">
        <p class="text-sm font-medium text-highlighted">
          低库存商品
        </p>
        <UBadge variant="subtle" color="warning" size="sm">
          {{ items.length }} 个 SKU
        </UBadge>
      </div>
      <div class="flex items-center gap-2">
        <p class="text-xs text-muted">
          至少一个仓库零库存：{{ zeroStockItems }} 个
        </p>
        <UButton
          label="导出 CSV"
          icon="i-carbon-download"
          color="neutral"
          variant="ghost"
          size="sm"
          data-testid="inventory-low-export"
          @click="exportCsv"
        />
      </div>
    </div>
    <ResizableTable
      :data="items"
      :columns="lowStockColumns"
      class="nx-table mt-3"
      :ui="{ th: 'py-2.5', td: 'py-3' }"
      :row-activate="openItem"
      data-testid="inventory-low-table"
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
      <template #totalAvailable-cell="{ row }">
        <span :class="row.original.totalAvailable === 0 ? 'text-error' : 'text-warning'">
          {{ formatNumber(row.original.totalAvailable) }}
        </span>
        <span class="ml-1 text-xs text-muted">{{ row.original.unit }}</span>
      </template>
      <template #distribution-cell="{ row }">
        <div class="flex flex-wrap items-center gap-1.5">
          <span
            v-for="warehouseId in row.original.warehouseIds"
            :key="warehouseId"
            class="inline-flex items-center gap-1 rounded-sm border border-default px-1.5 py-0.5 text-[11px]"
            :class="(row.original.byWarehouse[warehouseId] ?? 0) === 0 ? 'text-error' : 'text-muted'"
          >
            {{ warehouseName(warehouseId).slice(0, 2) }}
            <span class="font-mono tabular-nums text-default">{{ formatNumber(row.original.byWarehouse[warehouseId] ?? 0) }}</span>
          </span>
        </div>
      </template>
      <template #status-cell="{ row }">
        <UBadge
          :color="row.original.totalAvailable === 0 ? 'error' : 'warning'"
          variant="subtle"
          size="sm"
          data-testid="inventory-low-status"
        >
          {{ row.original.totalAvailable === 0 ? '零库存' : '低库存' }}
        </UBadge>
      </template>
      <template #actions-cell="{ row }">
        <UButton
          label="查看位置"
          color="neutral"
          variant="ghost"
          size="xs"
          data-testid="inventory-low-open"
          @click="openItem(row.original)"
        />
      </template>
      <template #empty>
        <UEmpty
          variant="naked"
          icon="i-carbon-checkmark-filled"
          title="当前没有低库存商品"
          description="所有商品跨仓库可用量均高于演示阈值"
        />
      </template>
    </ResizableTable>
  </div>
</template>

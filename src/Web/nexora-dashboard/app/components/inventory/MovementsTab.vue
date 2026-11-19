<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { InventoryMovement } from '~/mocks'
import { movementTypeColors, movementTypeLabels, warehouses } from '~/mocks'

const props = defineProps<{
  rows: InventoryMovement[]
}>()

const emit = defineEmits<{
  'open-reference': [movement: InventoryMovement]
}>()

const toast = useToast()
const movementSearchInput = ref('')
const movementSearch = ref('')
const applyMovementSearch = useDebounceFn((value: string) => {
  movementSearch.value = value
}, 220)
watch(movementSearchInput, value => applyMovementSearch(value))

const movementType = ref('all')
const movementFrom = ref('')
const movementTo = ref('')
const movementPage = ref(1)
const movementPageSize = 8

const movementTypeItems = [
  { label: '全部类型', value: 'all' },
  ...Object.entries(movementTypeLabels).map(([value, label]) => ({ label, value }))
]

function warehouseName(id: string) {
  return warehouses.find(warehouse => warehouse.id === id)?.name ?? id
}

const filteredMovements = computed(() => {
  const keyword = movementSearch.value.trim().toLowerCase()
  return props.rows
    .filter((movement) => {
      if (movementType.value !== 'all' && movement.type !== movementType.value) return false
      const date = movement.at.slice(0, 10)
      if (movementFrom.value && date < movementFrom.value) return false
      if (movementTo.value && date > movementTo.value) return false
      if (!keyword) return true
      const text = [movement.reference, movement.sku, movement.name, warehouseName(movement.warehouseId)].join(' ').toLowerCase()
      return text.includes(keyword)
    })
    .sort((a, b) => b.at.localeCompare(a.at))
})

const movementPageRows = computed(() => {
  const start = (movementPage.value - 1) * movementPageSize
  return filteredMovements.value.slice(start, start + movementPageSize)
})
const movementPageStart = computed(() => (filteredMovements.value.length ? (movementPage.value - 1) * movementPageSize + 1 : 0))
const movementPageEnd = computed(() => (movementPage.value - 1) * movementPageSize + movementPageRows.value.length)
const movementHasFilters = computed(() => Boolean(movementSearch.value) || movementType.value !== 'all' || Boolean(movementFrom.value) || Boolean(movementTo.value))

watch([movementSearch, movementType, movementFrom, movementTo], () => {
  movementPage.value = 1
})

const movementColumns: TableColumn<InventoryMovement>[] = [
  { accessorKey: 'at', header: '时间', meta: { class: { td: 'whitespace-nowrap text-xs tabular-nums text-muted' } } },
  { accessorKey: 'reference', header: '单据号', meta: { class: { td: 'w-44' } } },
  { accessorKey: 'type', header: '类型' },
  { accessorKey: 'name', header: '商品', meta: { class: { td: 'min-w-[200px] whitespace-normal' } } },
  { id: 'warehouse', header: '仓库', meta: { class: { td: 'whitespace-nowrap text-muted' } } },
  { accessorKey: 'quantity', header: '数量', meta: { class: { th: 'text-right', td: 'text-right tabular-nums' } } },
  { id: 'balance', header: '结存', meta: { class: { th: 'text-right', td: 'text-right tabular-nums text-muted' } } }
]

function movementQuantityLabel(movement: InventoryMovement) {
  if (movement.type === 'inbound') return '+' + formatNumber(movement.quantity)
  if (movement.type === 'outbound') return '-' + formatNumber(movement.quantity)
  if (movement.type === 'adjust') return '±' + formatNumber(movement.quantity)
  return formatNumber(movement.quantity)
}

function resetMovementFilters() {
  movementSearchInput.value = ''
  movementSearch.value = ''
  movementType.value = 'all'
  movementFrom.value = ''
  movementTo.value = ''
  movementPage.value = 1
}

function searchBySku(sku: string) {
  movementType.value = 'all'
  movementFrom.value = ''
  movementTo.value = ''
  movementSearchInput.value = sku
  movementSearch.value = sku
  movementPage.value = 1
}

function openReference(movement: InventoryMovement) {
  emit('open-reference', movement)
}

function exportCsv() {
  downloadCsv(
    '库存流水-' + new Date().toISOString().slice(0, 10) + '.csv',
    ['时间', '单据号', '类型', '商品', 'SKU', '仓库', '数量'],
    filteredMovements.value.map(movement => [
      movement.at,
      movement.reference,
      movementTypeLabels[movement.type],
      movement.name,
      movement.sku,
      warehouseName(movement.warehouseId),
      movement.quantity
    ])
  )
  toast.add({
    title: '已导出 ' + filteredMovements.value.length + ' 条库存流水',
    description: 'CSV 由浏览器本地生成，未经过后端。',
    color: 'success',
    icon: 'i-carbon-document-export'
  })
}

defineExpose({ searchBySku, exportCsv })
</script>

<template>
  <div data-testid="inventory-movements">
    <div class="flex flex-wrap items-center gap-2 border-b border-default px-4 py-2.5">
      <UInput
        v-model="movementSearchInput"
        icon="i-carbon-search"
        placeholder="搜索单据号、商品或 SKU"
        size="sm"
        class="w-64 max-w-full"
        data-testid="movement-search"
      />
      <USelect
        v-model="movementType"
        :items="movementTypeItems"
        size="sm"
        class="w-36"
        data-testid="movement-type"
      />
      <div class="flex items-center gap-1.5">
        <UInput
          v-model="movementFrom"
          type="date"
          size="sm"
          class="w-36"
          aria-label="流水开始日期"
          data-testid="movement-date-from"
        />
        <span class="text-xs text-muted">至</span>
        <UInput
          v-model="movementTo"
          type="date"
          size="sm"
          class="w-36"
          aria-label="流水结束日期"
          data-testid="movement-date-to"
        />
      </div>
      <UButton
        v-if="movementHasFilters"
        label="重置"
        icon="i-carbon-reset"
        color="neutral"
        variant="ghost"
        size="sm"
        data-testid="movement-reset"
        @click="resetMovementFilters"
      />
      <div class="ml-auto flex items-center gap-2">
        <p class="text-xs text-muted">
          共 {{ filteredMovements.length }} 条流水
        </p>
        <UButton
          label="导出 CSV"
          icon="i-carbon-download"
          color="neutral"
          variant="ghost"
          size="sm"
          data-testid="movement-export"
          @click="exportCsv"
        />
      </div>
    </div>
    <ResizableTable
      :data="movementPageRows"
      :columns="movementColumns"
      class="nx-table"
      :ui="{ th: 'py-2.5', td: 'py-3' }"
      :row-activate="openReference"
      data-testid="movement-table"
    >
      <template #reference-cell="{ row }">
        <UButton
          :label="row.original.reference"
          color="primary"
          variant="ghost"
          size="xs"
          class="px-0 font-mono text-[12px]"
          data-testid="movement-reference"
          @click="openReference(row.original)"
        />
      </template>
      <template #type-cell="{ row }">
        <UBadge
          :color="movementTypeColors[row.original.type]"
          variant="subtle"
          size="sm"
          :label="movementTypeLabels[row.original.type]"
        />
      </template>
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
      <template #quantity-cell="{ row }">
        {{ movementQuantityLabel(row.original) }}
      </template>
      <template #balance-cell="{ row }">
        <span v-if="typeof row.original.balanceAfter === 'number'">{{ formatNumber(row.original.balanceAfter) }}</span>
        <span v-else>—</span>
      </template>
      <template #empty>
        <UEmpty
          variant="naked"
          icon="i-carbon-flow"
          title="当前筛选下没有库存流水"
          description="调整商品、类型或时间范围后重试"
          :actions="[{ label: '清空筛选', color: 'neutral', variant: 'outline', size: 'sm', onClick: resetMovementFilters }]"
        />
      </template>
    </ResizableTable>
    <div class="flex flex-wrap items-center justify-between gap-3 border-t border-default px-4 py-2.5">
      <p class="text-xs text-muted">
        第 {{ movementPageStart }}–{{ movementPageEnd }} 条，共 {{ filteredMovements.length }} 条
      </p>
      <UPagination
        v-model:page="movementPage"
        :total="filteredMovements.length"
        :items-per-page="movementPageSize"
        size="sm"
        data-testid="movement-pagination"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import type { Warehouse, WarehouseSummary } from '~/mocks'
import { LOW_STOCK_THRESHOLD } from '~/mocks'
import InventoryWarehouseCard from '~/components/inventory/WarehouseCard.vue'

interface OverviewStat {
  label: string
  value: number
  unit: string
  hint: string
}

interface WarehouseRow {
  warehouse: Warehouse
  address: string
  summary: WarehouseSummary
}

defineProps<{
  stats: OverviewStat[]
  rows: WarehouseRow[]
}>()

const emit = defineEmits<{
  open: [warehouseId: string]
}>()
</script>

<template>
  <div data-testid="inventory-warehouses">
    <div class="grid gap-3 border-b border-default px-4 py-3 sm:grid-cols-2 xl:grid-cols-4">
      <div
        v-for="stat in stats"
        :key="stat.label"
        class="rounded-sm border border-default p-3"
        data-testid="inventory-overview"
      >
        <p class="text-xs text-muted">
          {{ stat.label }}
        </p>
        <p class="mt-1 text-xl font-semibold tabular-nums text-highlighted">
          {{ stat.value }}
          <span class="ml-1 text-xs font-normal text-muted">{{ stat.unit }}</span>
        </p>
        <p class="mt-0.5 text-[11px] text-muted">
          {{ stat.hint }}
        </p>
      </div>
    </div>
    <div class="grid gap-4 p-4 xl:grid-cols-3">
      <InventoryWarehouseCard
        v-for="entry in rows"
        :key="entry.warehouse.id"
        :warehouse="entry.warehouse"
        :address="entry.address"
        :summary="entry.summary"
        @open="emit('open', entry.warehouse.id)"
      />
    </div>
    <div class="border-t border-default px-4 py-2.5 text-xs text-muted" data-testid="inventory-threshold-hint">
      预警口径：单仓库存位置可用量低于 {{ LOW_STOCK_THRESHOLD }} 件计入预警；「低库存」页签按商品跨仓库汇总可用量。
    </div>
  </div>
</template>

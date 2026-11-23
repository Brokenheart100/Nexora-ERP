<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { TaxComponent } from '#shared/types/tax'
import { multiplyDecimals } from '#shared/utils/decimal'
import { displayDecimal } from '~/utils/api/decimal-display'

withDefaults(defineProps<{ components: TaxComponent[], minorUnits?: number }>(), { minorUnits: 0 })
const columns: TableColumn<TaxComponent>[] = [
  { accessorKey: 'code', header: '税码' },
  { accessorKey: 'effectiveOn', header: '税率生效日' },
  { accessorKey: 'rate', header: '税率' },
  { accessorKey: 'amount', header: '税额' }
]
</script>

<template>
  <UTable :columns="columns" :data="components" class="nx-table">
    <template #rate-cell="{ row }">
      {{ multiplyDecimals(row.original.rate, '100') }}%
    </template>
    <template #amount-cell="{ row }">
      <span class="tabular-nums">{{ displayDecimal(row.original.amount, minorUnits) }}</span>
    </template>
  </UTable>
</template>

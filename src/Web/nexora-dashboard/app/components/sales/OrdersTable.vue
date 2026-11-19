<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { SalesOrder } from '~/mocks'
import { salesStatusColors, salesStatusLabels } from '~/mocks'

defineProps<{ rows: SalesOrder[] }>()
const emit = defineEmits<{ open: [id: string], reset: [] }>()

const columns: TableColumn<SalesOrder>[] = [{
  accessorKey: 'id',
  header: '订单号',
  meta: { class: { td: 'font-mono text-[12px] whitespace-nowrap' } }
}, {
  accessorKey: 'customerName',
  header: '客户',
  meta: { class: { td: 'min-w-[180px] whitespace-normal' } }
}, {
  accessorKey: 'status',
  header: '状态'
}, {
  accessorKey: 'orderedAt',
  header: '下单日期',
  meta: { class: { td: 'tabular-nums whitespace-nowrap' } }
}, {
  accessorKey: 'promisedAt',
  header: '承诺交付',
  meta: { class: { td: 'tabular-nums whitespace-nowrap' } }
}, {
  accessorKey: 'owner',
  header: '负责人'
}, {
  id: 'amount',
  header: '未税金额',
  meta: { class: { th: 'text-right', td: 'text-right tabular-nums whitespace-nowrap' } }
}, {
  id: 'actions',
  header: '操作',
  meta: { class: { th: 'text-right', td: 'text-right' } }
}]
</script>

<template>
  <ResizableTable
    :data="rows"
    :columns="columns"
    class="nx-table"
    :ui="{ th: 'py-2.5', td: 'py-3' }"
    :row-activate="row => emit('open', row.id)"
    data-testid="sales-orders-table"
  >
    <template #status-cell="{ row }">
      <UBadge
        :color="salesStatusColors[row.original.status]"
        variant="subtle"
        size="sm"
        :label="salesStatusLabels[row.original.status]"
      />
    </template>
    <template #amount-cell="{ row }">
      {{ formatMoney(Number(row.original.totalAmount)) }}
    </template>
    <template #actions-cell="{ row }">
      <UButton
        label="查看"
        color="neutral"
        variant="ghost"
        size="xs"
        data-testid="sales-orders-open"
        @click="emit('open', row.original.id)"
      />
    </template>
    <template #empty>
      <div class="flex flex-col items-center gap-2 py-8">
        <UEmpty
          variant="naked"
          icon="i-carbon-search"
          title="没有符合条件的销售订单"
          description="调整状态、客户或日期筛选后再试。"
        />
        <UButton
          label="清空筛选"
          color="neutral"
          variant="outline"
          size="xs"
          @click="emit('reset')"
        />
      </div>
    </template>
  </ResizableTable>
</template>

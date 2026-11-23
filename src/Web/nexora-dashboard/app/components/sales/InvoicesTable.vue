<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { Invoice } from '~/mocks'
import { invoiceStatusColors, invoiceStatusLabels } from '~/mocks'
import { displayDecimal } from '~/utils/api/decimal-display'

defineProps<{ rows: Invoice[] }>()
const emit = defineEmits<{ open: [id: string], reset: [] }>()

const columns: TableColumn<Invoice>[] = [{
  accessorKey: 'id',
  header: '发票号',
  meta: { class: { td: 'font-mono text-[12px] whitespace-nowrap' } }
}, {
  accessorKey: 'customerName',
  header: '客户',
  meta: { class: { td: 'min-w-[180px] whitespace-normal' } }
}, {
  accessorKey: 'status',
  header: '状态'
}, {
  accessorKey: 'issuedAt',
  header: '开票日期',
  meta: { class: { td: 'tabular-nums whitespace-nowrap' } }
}, {
  accessorKey: 'dueAt',
  header: '到期日',
  meta: { class: { td: 'tabular-nums whitespace-nowrap' } }
}, {
  id: 'amount',
  header: '价税合计',
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
    data-testid="invoice-table"
  >
    <template #id-cell="{ row }">
      {{ row.original.documentNumber ?? row.original.id }}
    </template>
    <template #status-cell="{ row }">
      <UBadge
        :color="invoiceStatusColors[row.original.status]"
        variant="subtle"
        size="sm"
        :label="invoiceStatusLabels[row.original.status]"
      />
    </template>
    <template #amount-cell="{ row }">
      {{ row.original.documentNumber ? displayDecimal(row.original.amount) : formatMoney(Number(row.original.amount)) }}
    </template>
    <template #actions-cell="{ row }">
      <UButton
        label="查看"
        color="neutral"
        variant="ghost"
        size="xs"
        data-testid="invoice-open"
        @click="emit('open', row.original.id)"
      />
    </template>
    <template #empty>
      <div class="flex flex-col items-center gap-2 py-8">
        <UEmpty
          variant="naked"
          icon="i-carbon-document"
          title="没有符合条件的发票"
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

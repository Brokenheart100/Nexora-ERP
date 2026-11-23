<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import { recurringPlanStatusLabels } from '~/mocks'
import { recurringNet, type RecurringRow } from '~/utils/sales/recurring'

defineProps<{ rows: RecurringRow[], canCreate: boolean }>()
const emit = defineEmits<{
  open: [plan: RecurringRow]
  toggle: [plan: RecurringRow]
}>()

const columns: TableColumn<RecurringRow>[] = [{
  accessorKey: 'id',
  header: '计划编号',
  meta: { class: { td: 'font-mono text-[12px] whitespace-nowrap' } }
}, {
  accessorKey: 'customerName',
  header: '客户',
  meta: { class: { td: 'min-w-[160px] whitespace-normal' } }
}, {
  accessorKey: 'serviceName',
  header: '服务项目',
  meta: { class: { td: 'min-w-[150px] whitespace-normal' } }
}, {
  id: 'quantity',
  header: '数量',
  meta: { class: { th: 'text-right', td: 'text-right tabular-nums whitespace-nowrap' } }
}, {
  id: 'interval',
  header: '周期',
  meta: { class: { td: 'whitespace-nowrap' } }
}, {
  id: 'amount',
  header: '每期未税',
  meta: { class: { th: 'text-right', td: 'text-right tabular-nums whitespace-nowrap' } }
}, {
  accessorKey: 'nextRunAt',
  header: '下次执行',
  meta: { class: { td: 'tabular-nums whitespace-nowrap' } }
}, {
  accessorKey: 'status',
  header: '状态'
}, {
  id: 'actions',
  header: '操作',
  meta: { class: { th: 'text-right', td: 'text-right whitespace-nowrap' } }
}]
</script>

<template>
  <ResizableTable
    :data="rows"
    :columns="columns"
    class="nx-table"
    :ui="{ th: 'py-2.5', td: 'py-3' }"
    data-testid="recurring-table"
  >
    <template #quantity-cell="{ row }">
      {{ row.original.quantity }}
    </template>
    <template #interval-cell="{ row }">
      每 {{ row.original.intervalMonths }} 个月
    </template>
    <template #amount-cell="{ row }">
      {{ recurringNet(row.original) }}
    </template>
    <template #nextRunAt-cell="{ row }">
      <span v-if="row.original.nextRunAt">{{ row.original.nextRunAt }}</span>
      <span v-else class="text-muted">已结束</span>
    </template>
    <template #status-cell="{ row }">
      <UBadge
        :color="row.original.status === 'active' ? 'success' : 'neutral'"
        variant="subtle"
        size="sm"
        :label="row.original.timeZone && !row.original.nextRunAt ? '已结束' : recurringPlanStatusLabels[row.original.status]"
      />
    </template>
    <template #actions-cell="{ row }">
      <div class="flex justify-end gap-1">
        <UButton
          label="查看"
          color="neutral"
          variant="ghost"
          size="xs"
          :data-testid="'recurring-open-' + row.original.id"
          @click="emit('open', row.original)"
        />
        <UButton
          v-if="!row.original.timeZone || row.original.nextRunAt"
          :label="row.original.status === 'active' ? '暂停' : '恢复'"
          :icon="row.original.status === 'active' ? 'i-carbon-pause' : 'i-carbon-play'"
          color="neutral"
          variant="outline"
          size="xs"
          :disabled="!canCreate"
          :data-testid="row.original.status === 'active' ? 'recurring-pause' : 'recurring-resume'"
          @click="emit('toggle', row.original)"
        />
      </div>
    </template>
    <template #empty>
      <UEmpty
        variant="naked"
        icon="i-carbon-calendar"
        title="暂无定期开票计划"
        class="py-8"
      />
    </template>
  </ResizableTable>
</template>

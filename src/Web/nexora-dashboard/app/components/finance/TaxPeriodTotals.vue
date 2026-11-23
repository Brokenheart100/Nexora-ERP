<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { TaxTotals } from '#shared/types/tax'
import { displayDecimal } from '~/utils/api/decimal-display'

const props = defineProps<{ totals: TaxTotals, workspace: string }>()
const codeColumns: TableColumn<TaxTotals['codes'][number]>[] = [
  { accessorKey: 'code', header: '税码' }, { accessorKey: 'input', header: '进项' },
  { accessorKey: 'output', header: '销项' }, { accessorKey: 'netPayable', header: '应纳净额' }
]
const sourceColumns: TableColumn<TaxTotals['sources'][number]>[] = [
  { accessorKey: 'on', header: '入账日期' }, { accessorKey: 'documentNumber', header: '来源单据' },
  { accessorKey: 'code', header: '税码' }, { accessorKey: 'amount', header: '税额' }, { accessorKey: 'postingNumber', header: '凭证' }
]
function journal(id: string) {
  return { path: '/finance', query: { workspace: props.workspace, tab: 'journals', journal: id } }
}
</script>

<template>
  <div class="space-y-3">
    <p class="text-sm text-muted">
      {{ totals.period.from }} 至 {{ totals.period.through }}
      · {{ totals.basis === 'cash' ? '收付实现制' : '权责发生制' }} · {{ totals.currency }} · 过账序号 {{ totals.watermark }}
    </p>
    <dl class="grid grid-cols-3 gap-2 rounded-sm bg-elevated/50 p-3 text-sm tabular-nums">
      <div>
        <dt class="text-muted">
          累计进项
        </dt><dd>{{ displayDecimal(totals.input, 0) }}</dd>
      </div>
      <div>
        <dt class="text-muted">
          累计销项
        </dt><dd>{{ displayDecimal(totals.output, 0) }}</dd>
      </div>
      <div>
        <dt class="text-muted">
          应纳净额
        </dt><dd>{{ displayDecimal(totals.netPayable, 0) }}</dd>
      </div>
    </dl>
    <UTable
      v-if="totals.codes.length"
      :columns="codeColumns"
      :data="totals.codes"
      class="nx-table"
    />
    <UAccordion
      v-if="totals.sources.length"
      :items="[{ label: '过账来源（' + totals.sources.length + '）', icon: 'i-carbon-list' }]"
    >
      <template #body>
        <UTable
          :columns="sourceColumns"
          :data="totals.sources"
          class="nx-table"
          data-testid="tax-period-sources"
        >
          <template #documentNumber-cell="{ row }">
            <div>{{ row.original.documentNumber }}</div>
            <div v-if="row.original.taxDocumentNumber" class="text-xs text-muted">
              原税务单据 {{ row.original.taxDocumentNumber }}
            </div>
          </template>
          <template #amount-cell="{ row }">
            {{ row.original.direction === 'input' ? '进项' : '销项' }} {{ row.original.amount }}
          </template>
          <template #postingNumber-cell="{ row }">
            <UButton
              :to="journal(row.original.journalId)"
              :label="'#' + row.original.postingNumber"
              variant="link"
              size="xs"
            />
          </template>
        </UTable>
      </template>
    </UAccordion>
    <p v-else class="text-sm text-muted">
      该期间没有纳入汇总的税务过账。
    </p>
  </div>
</template>

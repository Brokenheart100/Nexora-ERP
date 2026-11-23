<script setup lang="ts">
import type { ReportRange } from '#shared/types/reporting'
import { useReportingApi } from '~/composables/api/useReportingApi'
import { useLedgerApi } from '~/composables/api/useLedgerApi'
import { useWorkspaceQuery } from '~/composables/api/useWorkspaceQuery'
import { currentReportRange, validReportRange } from '~/utils/finance/reporting'
import { displayDecimal } from '~/utils/api/decimal-display'

const api = useReportingApi()
const ledger = useLedgerApi()
const book = useWorkspaceQuery('report-book', '/finance', ledger.book)
const draft = reactive<ReportRange>({ from: '', through: '' })
const range = shallowRef<ReportRange | null>(null)
const start = computed(() => book.data?.settings?.startsOn ?? '')
const valid = computed(() => !!start.value && validReportRange(draft, start.value))
const summary = useWorkspaceQuery('finance-reporting-overview', '/finance', (id, signal) =>
  range.value ? api.overview(id, range.value, signal) : Promise.resolve(null), () => range.value)
const metrics = [
  { key: 'income', label: '收入', icon: 'i-carbon-growth' },
  { key: 'expense', label: '费用', icon: 'i-carbon-finance' },
  { key: 'profit', label: '净利润', icon: 'i-carbon-chart-line' },
  { key: 'cash', label: '期末资金', icon: 'i-carbon-wallet' },
  { key: 'receivable', label: '应收未结', icon: 'i-carbon-receipt' },
  { key: 'payable', label: '应付未结', icon: 'i-carbon-purchase' }
] as const

watch(() => book.owner, () => {
  range.value = null
}, { flush: 'sync' })
watch(start, (value) => {
  if (value && !range.value) {
    Object.assign(draft, currentReportRange(value))
    range.value = { ...draft }
  }
}, { immediate: true })

async function refresh() {
  await Promise.all([book.refresh(), summary.refresh()])
}
function apply() {
  if (!valid.value) return
  if (range.value?.from === draft.from && range.value?.through === draft.through) void summary.refresh()
  else range.value = { ...draft }
}
function link(tab: 'reporting' | 'aging', aging?: 'receivables' | 'payables') {
  if (!summary.data) return
  const workspace = book.session.activeWorkspaceId
  return { path: '/finance', query: { tab, workspace, ...summary.data.period, snapshotWorkspace: workspace,
    watermark: String(summary.data.watermark), ...(aging ? { aging } : { kind: 'profit-and-loss' }) } }
}
defineExpose({ refresh })
</script>

<template>
  <UCard class="rounded-sm" data-testid="live-finance-overview">
    <template #header>
      <h2 class="font-semibold">
        财务概览
      </h2>
    </template>
    <USkeleton v-if="book.loading && !book.data" class="h-20 w-full" />
    <UAlert v-else-if="book.problem" color="error" :title="book.problem" />
    <UAlert v-else-if="!start" color="warning" title="初始化账簿后可查看财务概览。">
      <template #actions>
        <UButton label="账簿设置" variant="outline" :to="{ path: '/finance', query: { workspace: book.session.activeWorkspaceId, tab: 'workbench' } }" />
      </template>
    </UAlert>
    <div v-else class="space-y-3">
      <form class="flex flex-wrap items-end gap-2" @submit.prevent="apply">
        <UFormField label="开始日期">
          <UInput
            v-model="draft.from"
            type="date"
            :min="start"
            data-testid="overview-from"
          />
        </UFormField>
        <UFormField label="结束日期">
          <UInput
            v-model="draft.through"
            type="date"
            :min="draft.from"
            data-testid="overview-through"
          />
        </UFormField>
        <UButton
          label="查询概览"
          type="submit"
          :disabled="!valid"
          :loading="summary.loading"
          data-testid="overview-apply"
        />
      </form>
      <USkeleton v-if="summary.loading && !summary.data" class="h-24 w-full" />
      <UAlert v-else-if="summary.problem" color="error" :title="summary.problem" />
      <template v-else-if="summary.data">
        <p class="text-xs text-muted" data-testid="overview-snapshot">
          {{ summary.data.period.from }} 至 {{ summary.data.period.through }} · {{ summary.data.currency }} · 过账水位 {{ summary.data.watermark }}
        </p>
        <dl class="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          <div
            v-for="metric in metrics"
            :key="metric.key"
            class="rounded-sm border border-default p-3"
            :data-testid="'overview-' + metric.key"
          >
            <dt class="flex items-center gap-2 text-sm text-muted">
              <UIcon :name="metric.icon" />{{ metric.label }}
            </dt>
            <dd class="mt-1 text-lg font-semibold tabular-nums">
              {{ displayDecimal(summary.data[metric.key], summary.data.minorUnits) }}
            </dd>
          </div>
        </dl>
        <div class="flex flex-wrap gap-2">
          <UButton
            :to="link('reporting')"
            label="查看利润表"
            variant="outline"
            size="sm"
            data-testid="overview-reports"
          />
          <UButton
            :to="link('aging', 'receivables')"
            label="应收账龄"
            variant="outline"
            size="sm"
          />
          <UButton
            :to="link('aging', 'payables')"
            label="应付账龄"
            variant="outline"
            size="sm"
          />
        </div>
      </template>
    </div>
  </UCard>
</template>

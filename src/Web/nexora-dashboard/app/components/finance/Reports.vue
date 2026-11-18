<script setup lang="ts">
import type { ReportRow } from '~/mocks'
import ReportPrintPreview from '~/components/finance/ReportPrintPreview.vue'
import ReportExports from '~/components/finance/ReportExports.vue'

const props = defineProps<{
  reportRows: ReportRow[]
  trend: { month: string, amount: number }[]
  canExport?: boolean
}>()

type ReportTab = 'trial-balance' | 'income-statement' | 'balance-sheet' | 'cash-flow'

const tab = ref<ReportTab>('trial-balance')
const period = ref('2026-11')

const tabItems = [
  { label: '试算平衡', value: 'trial-balance' },
  { label: '利润表', value: 'income-statement' },
  { label: '资产负债表', value: 'balance-sheet' },
  { label: '现金流量表', value: 'cash-flow' }
]

const periodOptions = [
  { label: '2026-09', value: '2026-09' },
  { label: '2026-10', value: '2026-10' },
  { label: '2026-11', value: '2026-11' }
]

const trialDebitIds = ['r-1', 'r-10']
const trialCreditIds = ['r-2', 'r-3', 'r-9']

function rowsOf(report: ReportTab) {
  return props.reportRows.filter(row => row.report === report)
}

const trialRows = computed(() =>
  rowsOf('trial-balance').map(row => ({
    id: row.id,
    label: row.label,
    level: row.level,
    debit: trialDebitIds.includes(row.id) ? Number(row.amount) : 0,
    credit: trialCreditIds.includes(row.id) ? Number(row.amount) : 0
  }))
)

const trialDebitTotal = computed(() => trialRows.value.reduce((sum, row) => sum + row.debit, 0))
const trialCreditTotal = computed(() => trialRows.value.reduce((sum, row) => sum + row.credit, 0))
const trialBalanced = computed(() => Math.abs(trialDebitTotal.value - trialCreditTotal.value) < 0.005)

const simpleRows = computed(() =>
  rowsOf(tab.value === 'trial-balance' ? 'income-statement' : tab.value).map(row => ({
    id: row.id,
    label: row.label,
    level: row.level,
    amount: Number(row.amount)
  }))
)

const trialTotalDebitLabel = computed(() => formatMoney(trialDebitTotal.value))
const trialTotalCreditLabel = computed(() => formatMoney(trialCreditTotal.value))

const chartType = computed(() => (tab.value === 'income-statement' ? 'line' : 'bar'))

const chartData = computed(() => {
  if (tab.value === 'trial-balance') {
    return [
      { name: '借方合计', amount: trialDebitTotal.value },
      { name: '贷方合计', amount: trialCreditTotal.value }
    ]
  }
  if (tab.value === 'income-statement') {
    return props.trend
      .filter(point => point.month <= period.value)
      .map(point => ({ name: point.month.slice(5) + ' 月', amount: point.amount }))
  }
  if (tab.value === 'balance-sheet') {
    const pick = (label: string) => Number(rowsOf('balance-sheet').find(row => row.label === label)?.amount ?? 0)
    return [
      { name: '流动资产', amount: pick('流动资产') },
      { name: '非流动资产', amount: pick('非流动资产') },
      { name: '负债合计', amount: pick('负债合计') },
      { name: '所有者权益', amount: pick('所有者权益合计') }
    ]
  }
  const pick = (label: string) => Number(rowsOf('cash-flow').find(row => row.label === label)?.amount ?? 0)
  return [
    { name: '经营活动', amount: pick('经营活动现金流') },
    { name: '投资活动', amount: pick('投资活动现金流') },
    { name: '筹资活动', amount: pick('筹资活动现金流') }
  ]
})

const chartAriaLabel = computed(() => (tabItems.find(item => item.value === tab.value)?.label ?? '报表') + '图表')

const currentPeriodLabel = computed(() => period.value)

const printOpen = ref(false)
const currentReportTitle = computed(() => tabItems.find(item => item.value === tab.value)?.label ?? '财务报表')
const reportPrintData = computed(() => {
  const trial = tab.value === 'trial-balance'
  return {
    title: currentReportTitle.value,
    period: period.value,
    trial,
    rows: trial ? trialRows.value : simpleRows.value,
    debitTotal: trialDebitTotal.value,
    creditTotal: trialCreditTotal.value,
    balanced: trialBalanced.value
  }
})
</script>

<template>
  <UCard class="nx-reveal rounded-sm" :ui="{ body: 'p-0 sm:p-0' }" data-testid="report-panel">
    <template #header>
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 class="text-sm font-semibold text-highlighted">
            财务报表
          </h2>
          <p class="mt-0.5 text-xs text-muted">
            试算平衡、利润表、资产负债表与现金流量表；金额取本地演示快照，期间切换会联动趋势图区间。
          </p>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <UBadge
            :label="'期间 ' + currentPeriodLabel"
            color="neutral"
            variant="subtle"
            size="sm"
          />
          <USelect
            v-model="period"
            :items="periodOptions"
            aria-label="报表期间"
            class="w-32"
            data-testid="report-period"
          />
          <UButton
            label="打印"
            icon="i-carbon-printer"
            color="neutral"
            variant="outline"
            size="sm"
            data-testid="report-print"
            @click="printOpen = true"
          />
        </div>
      </div>
    </template>

    <div class="flex flex-wrap items-center justify-between gap-3 border-b border-default px-3 py-2">
      <UTabs
        v-model="tab"
        :items="tabItems"
        :content="false"
        size="sm"
        data-testid="report-tabs"
      />

      <div class="flex items-center gap-2 text-xs">
        <span class="text-muted">试算平衡校验</span>
        <UBadge
          :label="trialBalanced ? '借贷平衡' : '借贷不平衡'"
          :color="trialBalanced ? 'success' : 'error'"
          variant="subtle"
          size="sm"
          data-testid="report-balance-check"
        />
      </div>
    </div>

    <div class="grid gap-4 p-3 lg:grid-cols-[minmax(0,1fr)_24rem]">
      <div class="rounded-sm border border-default" data-testid="report-table">
        <template v-if="tab === 'trial-balance'">
          <div class="grid grid-cols-[minmax(0,1fr)_9rem_9rem] items-center gap-2 border-b border-default bg-elevated/40 px-3 py-2 text-xs font-medium text-muted">
            <span>项目</span>
            <span class="text-right">借方余额</span>
            <span class="text-right">贷方余额</span>
          </div>
          <div
            v-for="row in trialRows"
            :key="row.id"
            class="grid grid-cols-[minmax(0,1fr)_9rem_9rem] items-center gap-2 border-b border-default/60 px-3 py-2"
            :data-testid="'report-row-' + row.id"
          >
            <span class="text-[13px] text-highlighted" :style="{ paddingLeft: (row.level - 1) * 12 + 'px' }">{{ row.label }}</span>
            <span class="text-right text-[13px] tabular-nums text-highlighted">{{ row.debit ? formatMoney(row.debit) : '—' }}</span>
            <span class="text-right text-[13px] tabular-nums text-highlighted">{{ row.credit ? formatMoney(row.credit) : '—' }}</span>
          </div>
          <div class="grid grid-cols-[minmax(0,1fr)_9rem_9rem] items-center gap-2 bg-elevated/40 px-3 py-2 text-[13px] font-semibold">
            <span class="text-highlighted">合计</span>
            <span class="text-right tabular-nums text-highlighted" data-testid="report-trial-total">{{ trialTotalDebitLabel }}</span>
            <span class="text-right tabular-nums text-highlighted">{{ trialTotalCreditLabel }}</span>
          </div>
        </template>

        <template v-else>
          <div class="grid grid-cols-[minmax(0,1fr)_10rem] items-center gap-2 border-b border-default bg-elevated/40 px-3 py-2 text-xs font-medium text-muted">
            <span>项目</span>
            <span class="text-right">本期金额</span>
          </div>
          <div
            v-for="row in simpleRows"
            :key="row.id"
            class="grid grid-cols-[minmax(0,1fr)_10rem] items-center gap-2 border-b border-default/60 px-3 py-2"
            :data-testid="'report-row-' + row.id"
          >
            <span class="text-[13px] text-highlighted" :style="{ paddingLeft: (row.level - 1) * 12 + 'px' }">{{ row.label }}</span>
            <span
              class="text-right text-[13px] tabular-nums"
              :class="row.amount < 0 ? 'text-error' : 'text-highlighted'"
            >{{ formatMoney(row.amount) }}</span>
          </div>
        </template>
      </div>

      <div class="rounded-sm border border-default p-3">
        <p class="mb-2 text-xs font-semibold text-highlighted">
          {{ tab === 'income-statement' ? '月度利润趋势' : '金额对比' }}
        </p>
        <UChart
          :type="chartType"
          :data="chartData"
          index="name"
          :categories="[{ key: 'amount', label: '金额' }]"
          :height="240"
          :format="value => formatMoney(value)"
          :aria-label="chartAriaLabel"
          data-testid="report-chart"
        />
      </div>
    </div>

    <div class="border-t border-default px-3 py-2 text-xs text-muted">
      纯 UI 演示：报表行数据来自 app/mocks/finance.ts；切换期间只调整本地展示区间，不发起任何网络请求。
    </div>
  </UCard>

  <ReportExports
    class="mt-4"
    :kind="tab"
    :period="period"
    :report-rows="reportRows"
    :can-export="canExport"
  />

  <ReportPrintPreview v-model:open="printOpen" :report="reportPrintData" />
</template>

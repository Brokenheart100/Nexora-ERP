<script setup lang="ts">
import type { AgingBucket, BankTransaction, FinanceAccount, FinancePeriod, JournalEntry, TaxFiling } from '~/mocks'
import { financePeriodStatusColors, financePeriodStatusLabels } from '~/mocks'
import type { AccountingBookConnection } from '~/composables/finance/useAccountingBook'

function money(value: string | number) {
  return formatMoney(Number(value))
}

const props = defineProps<{
  accounts: FinanceAccount[]
  journals: JournalEntry[]
  periods: FinancePeriod[]
  taxFilings: TaxFiling[]
  bankTransactions: BankTransaction[]
  aging: AgingBucket[]
  booksReady: boolean
  live?: AccountingBookConnection
}>()

const emit = defineEmits<{
  'navigate': [tab: string]
  'toggle-period': [period: FinancePeriod, closed: boolean, passed: number, total: number]
  'setup': []
  'complete-year-end': []
}>()

const yearEndOpen = ref(false)

const currentPeriod = computed(() => props.periods.find(period => period.status !== 'closed') ?? props.periods[0])

const draftJournals = computed(() => props.journals.filter(journal => journal.status === 'draft'))
const pendingFilings = computed(() => props.taxFilings.filter(filing => filing.status === 'pending'))
const unmatchedTransactions = computed(() => props.bankTransactions.filter(item => !item.matched))
const overdueReceivable = computed(() => {
  const buckets = props.aging.filter(bucket => bucket.bucket !== '未到期')
  return buckets.reduce((sum, bucket) => sum + Number(bucket.receivable), 0)
})

const revenueTotal = computed(() => sumBalance('revenue'))
const expenseTotal = computed(() => sumBalance('expense'))
const profitTotal = computed(() => revenueTotal.value - expenseTotal.value)

function sumBalance(type: FinanceAccount['type']) {
  return props.accounts.filter(account => account.type === type).reduce((sum, account) => sum + Number(account.balance), 0)
}

const checklist = computed(() => [
  {
    label: '本期凭证已全部过账',
    detail: draftJournals.value.length === 0 ? '全部凭证均已过账或冲销' : '还有 ' + draftJournals.value.length + ' 张草稿凭证待提交',
    passed: draftJournals.value.length === 0
  },
  {
    label: '凭证借贷平衡',
    detail: props.journals.every(journal => journal.debitTotal === journal.creditTotal) ? '全部凭证借贷相等' : '存在借贷不相等的凭证',
    passed: props.journals.every(journal => journal.debitTotal === journal.creditTotal)
  },
  {
    label: '银行流水完成对账',
    detail: unmatchedTransactions.value.length === 0 ? '全部流水已匹配或排除' : '还有 ' + unmatchedTransactions.value.length + ' 笔流水待处理',
    passed: unmatchedTransactions.value.length === 0
  },
  {
    label: '税期申报已完成',
    detail: pendingFilings.value.length === 0 ? '当期税期均已申报' : '还有 ' + pendingFilings.value.length + ' 个税期待申报',
    passed: pendingFilings.value.length === 0
  }
])
const checklistPassed = computed(() => checklist.value.filter(item => item.passed).length)

const todos = computed(() => [
  {
    id: 'journals',
    title: draftJournals.value.length > 0 ? '待提交凭证 ' + draftJournals.value.length + ' 张' : '本期凭证已全部过账',
    description: '凭证录入与提交审批在本地状态中演练，不调用后端。',
    icon: 'i-carbon-document',
    tab: 'journals',
    action: '查看凭证'
  },
  {
    id: 'bank',
    title: '待对账流水 ' + unmatchedTransactions.value.length + ' 笔',
    description: '匹配凭证、排除非账务流水后完成本月对账。',
    icon: 'i-carbon-wallet',
    tab: 'bank',
    action: '去对账'
  },
  {
    id: 'tax',
    title: '待申报税期 ' + pendingFilings.value.length + ' 个',
    description: '申报只更新本地状态，刷新页面后恢复「待申报」。',
    icon: 'i-carbon-receipt',
    tab: 'tax',
    action: '去申报'
  },
  {
    id: 'aging',
    title: '逾期应收 ' + money(overdueReceivable.value),
    description: '按账龄桶查看应收与应付，并可钻取到 mock 单据。',
    icon: 'i-carbon-currency-yen',
    tab: 'aging',
    action: '查看账龄'
  }
])

const quickLinks = [
  { label: '科目表', description: '维护会计科目与余额方向', icon: 'i-carbon-list-tree', tab: 'accounts' },
  { label: '凭证', description: '录入、审核与过账凭证', icon: 'i-carbon-document', tab: 'journals' },
  { label: '财务报表', description: '试算平衡与三大报表', icon: 'i-carbon-chart-line', tab: 'reports' },
  { label: '账龄与伙伴账', description: '应收应付账龄与明细账', icon: 'i-carbon-chart-bar', tab: 'aging' },
  { label: '税务申报', description: '税期日历与申报状态', icon: 'i-carbon-receipt', tab: 'tax' },
  { label: '银行与对账', description: '账户余额与流水匹配', icon: 'i-carbon-wallet', tab: 'bank' }
]

const yearEndRows = computed(() => [
  { label: '结转收入类科目', amount: revenueTotal.value, direction: '借' as const, account: '本年利润' },
  { label: '结转成本费用类科目', amount: expenseTotal.value, direction: '贷' as const, account: '本年利润' },
  { label: '本年利润结转', amount: profitTotal.value, direction: profitTotal.value >= 0 ? ('借' as const) : ('贷' as const), account: '利润分配—未分配利润' }
])

function togglePeriod(period: FinancePeriod, value: boolean) {
  emit('toggle-period', period, value, checklistPassed.value, checklist.value.length)
}

function go(tab: string) {
  emit('navigate', tab)
}

function openYearEnd() {
  if (!props.booksReady) return
  yearEndOpen.value = true
}
</script>

<template>
  <FinanceBookSettings v-if="live" :live="live" />
  <div v-else class="space-y-4" data-testid="finance-workbench">
    <UCard v-if="!booksReady" class="nx-reveal rounded-sm" data-testid="finance-setup-guide">
      <UEmpty
        icon="i-carbon-book"
        title="尚未建立账套"
        description="财务工作台需要在当前工作区初始化账套后才能记账。初始化只在本地完成，不调用后端。"
        :actions="[{ label: '初始化账套（本地演示）', icon: 'i-carbon-add', color: 'primary', size: 'sm', onClick: () => emit('setup') }]"
      />
      <div class="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <div
          v-for="(step, index) in ['初始化账套', '设置会计期间', '导入期初科目余额', '开始记账与对账']"
          :key="step"
          class="rounded-sm border border-default bg-elevated/40 p-3"
          data-testid="finance-setup-step"
        >
          <p class="text-xs text-muted">
            第 {{ index + 1 }} 步
          </p>
          <p class="mt-1 text-sm font-medium text-highlighted">
            {{ step }}
          </p>
        </div>
      </div>
    </UCard>

    <template v-else>
      <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <UCard class="nx-reveal rounded-sm" data-testid="finance-stat-books">
          <div class="flex items-start justify-between gap-2">
            <div>
              <p class="text-xs text-muted">
                建账状态
              </p>
              <p class="mt-1 text-lg font-semibold text-highlighted">
                已建账
              </p>
            </div>
            <UBadge
              label="启用中"
              color="success"
              variant="subtle"
              size="sm"
            />
          </div>
          <p class="mt-2 text-xs text-muted">
            2026 年度 · 本位币 CNY · 会计期间 12 期
          </p>
        </UCard>

        <UCard class="nx-reveal rounded-sm" data-testid="finance-stat-period">
          <div class="flex items-start justify-between gap-2">
            <div>
              <p class="text-xs text-muted">
                当前期间
              </p>
              <p class="mt-1 text-lg font-semibold text-highlighted">
                {{ currentPeriod?.period ?? '—' }}
              </p>
            </div>
            <UBadge
              v-if="currentPeriod"
              :label="financePeriodStatusLabels[currentPeriod.status]"
              :color="financePeriodStatusColors[currentPeriod.status]"
              variant="subtle"
              size="sm"
            />
          </div>
          <p class="mt-2 text-xs text-muted">
            {{ currentPeriod?.startDate }} 至 {{ currentPeriod?.endDate }} · 凭证 {{ journals.length }} 张
          </p>
        </UCard>

        <UCard class="nx-reveal rounded-sm" data-testid="finance-stat-todo">
          <p class="text-xs text-muted">
            待办
          </p>
          <p class="mt-1 text-lg font-semibold text-highlighted">
            {{ draftJournals.length + pendingFilings.length + unmatchedTransactions.length }} 项
          </p>
          <p class="mt-2 text-xs text-muted">
            凭证 {{ draftJournals.length }} · 税务 {{ pendingFilings.length }} · 流水 {{ unmatchedTransactions.length }}
          </p>
        </UCard>

        <UCard class="nx-reveal rounded-sm" data-testid="finance-stat-balance">
          <p class="text-xs text-muted">
            本期利润（演示）
          </p>
          <p class="mt-1 text-lg font-semibold tabular-nums text-highlighted">
            {{ money(profitTotal) }}
          </p>
          <p class="mt-2 text-xs text-muted">
            收入 {{ money(revenueTotal) }} · 费用 {{ money(expenseTotal) }}
          </p>
        </UCard>
      </div>

      <div class="grid gap-4 xl:grid-cols-3">
        <UCard class="nx-reveal rounded-sm xl:col-span-2" data-testid="finance-period-card">
          <template #header>
            <div class="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 class="text-sm font-semibold text-highlighted">
                  期间与年结
                </h2>
                <p class="mt-0.5 text-xs text-muted">
                  月份开关仅影响本地演示数据；年结预览基于当前科目余额汇总。
                </p>
              </div>
              <UButton
                label="年结预览"
                icon="i-carbon-calendar"
                color="neutral"
                variant="outline"
                size="sm"
                data-testid="finance-year-end-open"
                @click="openYearEnd"
              />
            </div>
          </template>

          <div class="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4" data-testid="finance-period-grid">
            <div
              v-for="period in periods"
              :key="period.id"
              class="rounded-sm border border-default px-2.5 py-2"
              :data-testid="'finance-period-' + period.period"
            >
              <div class="flex items-center justify-between gap-2">
                <p class="text-xs font-medium tabular-nums text-highlighted">
                  {{ period.period }}
                </p>
                <USwitch
                  :model-value="period.status === 'closed'"
                  size="sm"
                  :aria-label="'切换 ' + period.period + ' 关账状态'"
                  :data-testid="'finance-period-switch-' + period.period"
                  @update:model-value="value => togglePeriod(period, Boolean(value))"
                />
              </div>
              <div class="mt-1 flex items-center justify-between gap-1">
                <UBadge
                  :label="financePeriodStatusLabels[period.status]"
                  :color="financePeriodStatusColors[period.status]"
                  variant="subtle"
                  size="sm"
                />
                <span v-if="period.closedAt" class="text-[11px] text-dimmed">{{ period.closedAt.slice(0, 10) }}</span>
              </div>
            </div>
          </div>

          <div class="mt-4 rounded-sm border border-default" data-testid="finance-closing-checklist">
            <div class="flex items-center justify-between gap-2 border-b border-default px-3 py-2">
              <p class="text-xs font-semibold text-highlighted">
                关账检查清单
              </p>
              <UBadge
                :label="checklistPassed + ' / ' + checklist.length + ' 项通过'"
                :color="checklistPassed === checklist.length ? 'success' : 'warning'"
                variant="subtle"
                size="sm"
                data-testid="finance-checklist-summary"
              />
            </div>
            <ul class="divide-y divide-default">
              <li
                v-for="(item, index) in checklist"
                :key="item.label"
                class="flex items-start gap-2 px-3 py-2"
                :data-testid="'finance-checklist-item-' + index"
              >
                <UIcon
                  :name="item.passed ? 'i-carbon-checkmark-filled' : 'i-carbon-warning-alt'"
                  :class="item.passed ? 'text-success' : 'text-warning'"
                  class="mt-0.5 size-4 shrink-0"
                />
                <div class="min-w-0">
                  <p class="text-[13px] font-medium text-highlighted">
                    {{ item.label }}
                  </p>
                  <p class="mt-0.5 text-xs text-muted">
                    {{ item.detail }}
                  </p>
                </div>
              </li>
            </ul>
          </div>
        </UCard>

        <UCard class="nx-reveal rounded-sm" data-testid="finance-todo-list">
          <template #header>
            <div>
              <h2 class="text-sm font-semibold text-highlighted">
                财务待办
              </h2>
              <p class="mt-0.5 text-xs text-muted">
                点击跳转到对应页签处理。
              </p>
            </div>
          </template>

          <ul class="space-y-2">
            <li
              v-for="todo in todos"
              :key="todo.id"
              class="rounded-sm border border-default px-3 py-2.5"
              :data-testid="'finance-todo-' + todo.id"
            >
              <div class="flex items-start justify-between gap-2">
                <div class="flex min-w-0 items-start gap-2">
                  <UIcon :name="todo.icon" class="mt-0.5 size-4 shrink-0 text-primary" />
                  <div class="min-w-0">
                    <p class="text-[13px] font-medium text-highlighted">
                      {{ todo.title }}
                    </p>
                    <p class="mt-0.5 text-xs text-muted">
                      {{ todo.description }}
                    </p>
                  </div>
                </div>
                <UButton
                  :label="todo.action"
                  trailing-icon="i-carbon-arrow-right"
                  color="neutral"
                  variant="ghost"
                  size="xs"
                  :data-testid="'finance-todo-action-' + todo.id"
                  @click="go(todo.tab)"
                />
              </div>
            </li>
          </ul>

          <div class="mt-4">
            <p class="mb-2 text-xs font-semibold text-highlighted">
              快捷入口
            </p>
            <div class="grid grid-cols-2 gap-2">
              <UButton
                v-for="link in quickLinks"
                :key="link.tab"
                :label="link.label"
                :icon="link.icon"
                color="neutral"
                variant="soft"
                size="sm"
                class="justify-start"
                :data-testid="'finance-quick-' + link.tab"
                @click="go(link.tab)"
              />
            </div>
          </div>
        </UCard>
      </div>

      <USlideover
        v-model:open="yearEndOpen"
        :ui="{ content: 'w-full sm:max-w-xl' }"
        data-testid="finance-year-end-preview"
      >
        <template #header>
          <div>
            <p class="text-xs text-muted">
              年度结转
            </p>
            <h2 class="mt-1 text-base font-semibold text-highlighted">
              2026 年度年结预览
            </h2>
            <p class="mt-0.5 text-xs text-muted">
              预览基于科目余额汇总，执行动作只更新本地演示状态。
            </p>
          </div>
        </template>

        <template #body>
          <div class="space-y-4">
            <div class="grid gap-2 sm:grid-cols-3">
              <div class="rounded-sm bg-elevated/60 px-3 py-2">
                <p class="text-xs text-muted">
                  收入合计
                </p>
                <p class="mt-1 text-sm font-semibold tabular-nums text-highlighted">
                  {{ money(revenueTotal) }}
                </p>
              </div>
              <div class="rounded-sm bg-elevated/60 px-3 py-2">
                <p class="text-xs text-muted">
                  成本费用合计
                </p>
                <p class="mt-1 text-sm font-semibold tabular-nums text-highlighted">
                  {{ money(expenseTotal) }}
                </p>
              </div>
              <div class="rounded-sm bg-elevated/60 px-3 py-2">
                <p class="text-xs text-muted">
                  本年利润
                </p>
                <p class="mt-1 text-sm font-semibold tabular-nums text-highlighted">
                  {{ money(profitTotal) }}
                </p>
              </div>
            </div>

            <div class="rounded-sm border border-default">
              <div class="border-b border-default px-3 py-2 text-xs font-semibold text-highlighted">
                结转分录预览
              </div>
              <ul class="divide-y divide-default">
                <li
                  v-for="row in yearEndRows"
                  :key="row.label"
                  class="flex items-center justify-between gap-3 px-3 py-2"
                  data-testid="finance-year-end-row"
                >
                  <div class="min-w-0">
                    <p class="text-[13px] text-highlighted">
                      {{ row.label }}
                    </p>
                    <p class="mt-0.5 text-xs text-muted">
                      借/贷：{{ row.account }} · 方向 {{ row.direction }}
                    </p>
                  </div>
                  <span class="shrink-0 text-sm tabular-nums text-highlighted">{{ money(row.amount) }}</span>
                </li>
              </ul>
            </div>

            <div class="rounded-sm border border-default px-3 py-2" data-testid="finance-year-end-check">
              <p class="text-xs font-medium text-highlighted">
                关账检查：{{ checklistPassed }} / {{ checklist.length }} 项通过
              </p>
              <div class="mt-2 space-y-1">
                <div
                  v-for="item in checklist"
                  :key="'ye-' + item.label"
                  class="flex items-center justify-between gap-2 text-xs"
                >
                  <span class="text-muted">{{ item.label }}</span>
                  <span :class="item.passed ? 'text-success' : 'text-warning'">{{ item.passed ? '已通过' : '待处理' }}</span>
                </div>
              </div>
            </div>

            <UAlert
              v-if="checklistPassed < checklist.length"
              color="warning"
              variant="soft"
              icon="i-carbon-warning-alt"
              title="仍有检查项未通过"
              description="演示环境允许继续操作，真实系统会阻止未通过检查的年度结转。"
              data-testid="finance-year-end-warning"
            />
          </div>
        </template>

        <template #footer>
          <div class="flex w-full items-center justify-between gap-2">
            <UButton
              label="关闭"
              color="neutral"
              variant="ghost"
              data-testid="finance-year-end-cancel"
              @click="yearEndOpen = false"
            />
            <UButton
              label="执行年结（演示）"
              icon="i-carbon-checkmark"
              data-testid="finance-year-end-confirm"
              @click="emit('complete-year-end'), (yearEndOpen = false)"
            />
          </div>
        </template>
      </USlideover>
    </template>
  </div>
</template>

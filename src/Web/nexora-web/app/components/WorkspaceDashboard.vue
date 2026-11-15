<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { DateWindow, MonthWindow } from '~/utils/dashboard'

interface Overview {
  currency: string
  minorUnits: number
  watermark: number
  income: string
  expense: string
  profit: string
  cash: string
  receivable: string
  payable: string
}
interface AgingItem {
  id: string
  partnerId: string | null
  partnerName: string | null
  outstanding: string
}
interface Aging {
  kind: string
  currency: string
  minorUnits: number
  through: string
  watermark: number
  total: string
  buckets: { key: string; count: number; amount: string }[]
  items: AgingItem[]
}
interface StatementRow {
  key: string
  code: string
  name: string
  section: string
  amount: string
}
interface Report {
  currency: string
  minorUnits: number
  watermark: number
  lines: { row: StatementRow; previous: string | null; difference: string | null }[]
  totals: { key: string; amount: string }[]
}
interface Posting {
  journalId: string
  postingNumber: number
  on: string
  sourceNumber: string
  memo: string
  code: string
  name: string
  debit: string
  credit: string
}
interface JournalDetail {
  journal: { sourceNumber: string; memo: string; on: string }
}
interface Projection {
  version: number
  projectedAtUtc: string
}
interface WarehouseView {
  id: string
  code: string
  name: string
  canReadStock: boolean
}
interface PoolView {
  quantity: string
  value: string
}

const props = defineProps<{ workspaceId: string; workspaceName: string }>()
const emit = defineEmits<{ open: [id: 'aging' | 'reports'] }>()

const base = computed(() => '/bff/api/finance/workspaces/' + props.workspaceId)
const inventoryBase = computed(() => '/bff/api/inventory/workspaces/' + props.workspaceId)
const loading = ref(false)
const error = ref('')
const startsOn = ref('')
const currency = ref('CNY')
const minorUnits = ref(2)
const period = reactive({ from: '', through: '' })
const overview = shallowRef<Overview>()
const priorSummary = shallowRef<Overview>()
const receivables = shallowRef<Aging>()
const payables = shallowRef<Aging>()
const report = shallowRef<Report>()
const projection = shallowRef<Projection>()
const pendingProjection = ref(false)
const months = ref<(MonthWindow & { income: number; expense: number; profit: number })[]>([])
const inventory = reactive({ value: 0, quantity: 0, count: 0, warehouses: 0 })
const drill = shallowRef<{ key: string; postings: Posting[] }>()
const journal = shallowRef<JournalDetail>()
const drillBusy = ref(false)
const buckets: Record<string, string> = {
  current: '未逾期', '1-30': '逾期 1–30 天', '31-60': '逾期 31–60 天', '61-90': '逾期 61–90 天',
  'over-90': '逾期超过 90 天',
}

const money = (amount: string | number | null | undefined) => formatDecimal(String(amount ?? '0'), minorUnits.value)
const todayIso = () => {
  const now = new Date()
  return [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0')].join('-')
}
const fetchOverview = (window: DateWindow) =>
  $fetch<Overview>(base.value + '/reporting/overview', { retry: 0, query: { from: window.from, through: window.through } })

const trendMax = computed(() => Math.max(1, ...months.value.map(month => Math.max(month.income, month.expense))))
const topReceivablePartners = computed(() => topPartners(receivables.value?.items ?? [], 5))
const topPayablePartners = computed(() => topPartners(payables.value?.items ?? [], 5))
const comparisons = computed(() => {
  if (!overview.value) return []
  const previous = priorSummary.value
  return [
    { key: 'income', label: '本期收入', current: overview.value.income, previous: previous?.income ?? null },
    { key: 'expense', label: '本期费用', current: overview.value.expense, previous: previous?.expense ?? null },
    { key: 'profit', label: '本期净利润', current: overview.value.profit, previous: previous?.profit ?? null },
  ]
})
const profitRows = computed(() => {
  const lines = report.value?.lines ?? []
  return [...lines]
    .filter(line => line.row.section === 'income' || line.row.section === 'expense')
    .sort((left, right) => Math.abs(Number(right.row.amount)) - Math.abs(Number(left.row.amount)))
    .slice(0, 6)
})
const consistency = computed(() => {
  if (!overview.value || !report.value) return { ok: true, text: '待校验' }
  const ok = statementCheck(overview.value, report.value.totals)
  return { ok, text: ok ? '一致' : '不一致' }
})
const deltaText = (current: string, previous: string | null) => {
  const value = delta(current, previous).difference
  return value === null ? '—' : (value > 0 ? '+' : '') + money(value)
}
type TrendMonth = MonthWindow & { income: number; expense: number; profit: number }
interface ComparisonRow { key: string; label: string; current: string; previous: string | null }
const trendColumns: TableColumn<TrendMonth>[] = [
  { accessorKey: 'label', header: '月份' },
  { id: 'income', header: '收入' },
  { id: 'expense', header: '费用' },
  { id: 'profit', header: '净利润', accessorFn: month => money(month.profit) },
]
const comparisonColumns: TableColumn<ComparisonRow>[] = [
  { accessorKey: 'label', header: '指标' },
  { id: 'current', header: '本期', accessorFn: row => money(row.current) },
  { id: 'previous', header: '上期', accessorFn: row => (row.previous === null ? '—' : money(row.previous)) },
  { id: 'delta', header: '差异', accessorFn: row => deltaText(row.current, row.previous) },
]
const drillColumns: TableColumn<Posting>[] = [
  { accessorKey: 'postingNumber', header: '过账号' },
  { accessorKey: 'on', header: '日期' },
  { accessorKey: 'sourceNumber', header: '来源' },
  { accessorKey: 'memo', header: '摘要' },
  { id: 'account', header: '科目' },
  { id: 'debit', header: '借方', accessorFn: posting => money(posting.debit) },
  { id: 'credit', header: '贷方', accessorFn: posting => money(posting.credit) },
  { id: 'actions', header: '凭证' },
]

async function loadInventory() {
  try {
    const view = await $fetch<{ warehouses: WarehouseView[] }>(inventoryBase.value + '/warehouses', { retry: 0 })
    const readable = view.warehouses.filter(warehouse => warehouse.canReadStock)
    const pools = await Promise.all(readable.map(warehouse =>
      $fetch<PoolView[]>(inventoryBase.value + '/warehouses/' + warehouse.id + '/positions', { retry: 0 })))
    let value = 0
    let quantity = 0
    let count = 0
    for (const rows of pools) {
      for (const pool of rows) {
        value += Number(pool.value)
        quantity += Number(pool.quantity)
        count += 1
      }
    }
    inventory.value = value
    inventory.quantity = quantity
    inventory.count = count
    inventory.warehouses = readable.length
  } catch {
    inventory.value = 0
    inventory.quantity = 0
    inventory.count = 0
    inventory.warehouses = 0
  }
}

async function loadProjection() {
  try {
    const response = await $fetch<Projection & { status?: string }>(
      '/bff/api/reports/workspaces/' + props.workspaceId, { retry: 0 },
    )
    if (response && typeof response.projectedAtUtc === 'string') {
      projection.value = response
      pendingProjection.value = false
    } else {
      pendingProjection.value = true
    }
  } catch {
    pendingProjection.value = true
  }
}

async function load() {
  if (loading.value) return
  loading.value = true
  error.value = ''
  drill.value = undefined
  journal.value = undefined
  try {
    const book = await $fetch<{ startsOn: string }>(base.value + '/ledger', { retry: 0 })
    startsOn.value = book.startsOn
    const today = todayIso()
    const current: DateWindow = { from: book.startsOn, through: today < book.startsOn ? book.startsOn : today }
    period.from = current.from
    period.through = current.through
    const summary = await fetchOverview(current)
    overview.value = summary
    currency.value = summary.currency
    minorUnits.value = summary.minorUnits
    const prior = previousWindow(book.startsOn, current)
    const [previousSummary, receivableView, payableView, pnl] = await Promise.all([
      prior ? fetchOverview(prior) : Promise.resolve(undefined),
      $fetch<Aging>(base.value + '/reporting/aging/receivables',
        { retry: 0, query: { through: current.through, watermark: summary.watermark } }),
      $fetch<Aging>(base.value + '/reporting/aging/payables',
        { retry: 0, query: { through: current.through, watermark: summary.watermark } }),
      $fetch<Report>(base.value + '/reports/profit-and-loss',
        { retry: 0, query: { from: current.from, through: current.through, compare: true } }),
    ])
    priorSummary.value = previousSummary
    receivables.value = receivableView
    payables.value = payableView
    report.value = pnl
    const windows = monthWindows(book.startsOn, current.through, 6)
    months.value = await Promise.all(windows.map(async (window) => {
      const month = await fetchOverview(window)
      return {
        label: window.label, from: window.from, through: window.through,
        income: Number(month.income), expense: Number(month.expense), profit: Number(month.profit),
      }
    }))
    await Promise.all([loadInventory(), loadProjection()])
  } catch (cause) {
    error.value = (cause as { data?: { detail?: string } }).data?.detail ?? '无法读取经营仪表盘数据。'
  } finally {
    loading.value = false
  }
}

async function drillRow(key: string) {
  if (!overview.value || drillBusy.value) return
  drillBusy.value = true
  error.value = ''
  journal.value = undefined
  try {
    const result = await $fetch<{ postings: Posting[] }>(
      base.value + '/reports/profit-and-loss/rows/' + encodeURIComponent(key),
      { retry: 0, query: { from: period.from, through: period.through, watermark: overview.value.watermark } },
    )
    drill.value = { key, postings: result.postings }
  } catch (cause) {
    error.value = (cause as { data?: { detail?: string } }).data?.detail ?? '无法读取明细过账。'
  } finally {
    drillBusy.value = false
  }
}

async function openJournal(id: string) {
  try {
    journal.value = await $fetch<JournalDetail>(base.value + '/ledger/journals/' + id, { retry: 0 })
  } catch (cause) {
    error.value = (cause as { data?: { detail?: string } }).data?.detail ?? '无法读取凭证。'
  }
}

onMounted(() => { void load() })
</script>

<template>
  <section class="card dashboard" aria-labelledby="dashboard-title">
    <div class="card-head">
      <div>
        <h2 id="dashboard-title"><UIcon class="mr-2 inline-block size-[1.08em] align-[-0.16em] text-nx-primary" name="i-lucide-gauge" aria-hidden="true" />经营仪表盘</h2>
        <p class="card-sub">
          {{ workspaceName }} · {{ period.from || '—' }} 至 {{ period.through || '—' }} · {{ currency }} · 过账水位
          {{ overview ? overview.watermark : '—' }}
        </p>
      </div>
      <UButton variant="outline" color="neutral" size="sm" type="button" :loading="loading" :disabled="loading" @click="load">刷新仪表盘</UButton>
    </div>
    <UAlert v-if="error" role="alert" color="error" icon="i-lucide-circle-alert" :description="error" />
    <div v-if="loading && !overview" class="space-y-3 py-2" role="status" aria-label="正在读取经营仪表盘">
      <USkeleton class="h-8 w-56" />
      <div class="grid gap-3 sm:grid-cols-3">
        <USkeleton class="h-20 w-full" />
        <USkeleton class="h-20 w-full" />
        <USkeleton class="h-20 w-full" />
      </div>
      <USkeleton class="h-4 w-full" />
      <USkeleton class="h-4 w-5/6" />
    </div>
    <template v-if="overview">
      <dl class="dashboard-kpis">
        <div class="kpi"><dt>本期收入</dt><dd data-testid="kpi-income">{{ money(overview.income) }}</dd></div>
        <div class="kpi"><dt>本期费用</dt><dd data-testid="kpi-expense">{{ money(overview.expense) }}</dd></div>
        <div class="kpi"><dt>本期净利润</dt><dd data-testid="kpi-profit">{{ money(overview.profit) }}</dd></div>
        <div class="kpi"><dt>期末现金</dt><dd data-testid="kpi-cash">{{ money(overview.cash) }}</dd></div>
        <div class="kpi"><dt>应收未结</dt><dd data-testid="kpi-receivable">{{ money(overview.receivable) }}</dd></div>
        <div class="kpi"><dt>应付未结</dt><dd data-testid="kpi-payable">{{ money(overview.payable) }}</dd></div>
        <div class="kpi">
          <dt>库存估值</dt>
          <dd data-testid="kpi-inventory">{{ money(inventory.value.toFixed(minorUnits)) }}</dd>
        </div>
        <div class="kpi">
          <dt>经营投影</dt>
          <dd data-testid="kpi-projection">{{ projection ? '已同步 · 版本 ' + projection.version : '待同步' }}</dd>
        </div>
      </dl>
      <p class="dashboard-note" data-testid="dashboard-consistency">
        口径校验：本期收入、费用与净利润与利润表{{ consistency.text }}；库存 {{ inventory.warehouses }} 个仓库 ·
        {{ inventory.count }} 个库存池 · 数量合计 {{ inventory.quantity }}；经营投影{{ projection ? '已同步' : '待同步' }}。
      </p>

      <div class="dashboard-grid">
        <section class="dashboard-block" aria-labelledby="dashboard-trend-title">
          <h3 id="dashboard-trend-title">近 6 个月收入与费用</h3>
          <UTable
            data-testid="dashboard-trend"
            :data="months"
            :columns="trendColumns"
            :get-row-id="month => month.label"
            :ui="{ td: 'align-middle whitespace-normal', th: 'whitespace-nowrap' }"
          >
            <template #income-cell="{ row }">
              <span class="bar-track"><span class="bar-fill" :style="{ width: barWidth(row.original.income, trendMax) }" /></span>
              {{ money(row.original.income) }}
            </template>
            <template #expense-cell="{ row }">
              <span class="bar-track"><span class="bar-fill expense" :style="{ width: barWidth(row.original.expense, trendMax) }" /></span>
              {{ money(row.original.expense) }}
            </template>
          </UTable>
        </section>

        <section class="dashboard-block" aria-labelledby="dashboard-compare-title">
          <h3 id="dashboard-compare-title">期间对比</h3>
          <UTable
            :data="comparisons"
            :columns="comparisonColumns"
            :get-row-id="row => row.key"
            :ui="{ td: 'whitespace-normal', th: 'whitespace-nowrap' }"
          />
          <p class="mt-2 text-[12px] leading-[1.62] text-nx-ink-3">上期区间与本期等长；账簿起始日之前的区间不计入。</p>
        </section>
      </div>

      <div v-if="receivables && payables" class="dashboard-grid">
        <section class="dashboard-block" aria-labelledby="dashboard-receivable-title">
          <h3 id="dashboard-receivable-title">客户应收账龄</h3>
          <p>未结总额 {{ money(receivables.total) }}</p>
          <ul class="dashboard-buckets">
            <li v-for="bucket in receivables.buckets" :key="bucket.key">
              {{ buckets[bucket.key] }} · {{ bucket.count }} 单 · {{ money(bucket.amount) }}
            </li>
          </ul>
          <h4>Top 客户</h4>
          <ul data-testid="top-customers">
            <li v-for="partner in topReceivablePartners" :key="partner.key">
              {{ partner.name }} · {{ partner.count }} 单 · {{ money(partner.amount) }}
            </li>
          </ul>
          <p v-if="!topReceivablePartners.length" class="mt-2 text-[12px] leading-[1.62] text-nx-ink-3">暂无未结应收。</p>
        </section>
        <section class="dashboard-block" aria-labelledby="dashboard-payable-title">
          <h3 id="dashboard-payable-title">供应商应付账龄</h3>
          <p>未结总额 {{ money(payables.total) }}</p>
          <ul class="dashboard-buckets">
            <li v-for="bucket in payables.buckets" :key="bucket.key">
              {{ buckets[bucket.key] }} · {{ bucket.count }} 单 · {{ money(bucket.amount) }}
            </li>
          </ul>
          <h4>Top 供应商</h4>
          <ul data-testid="top-suppliers">
            <li v-for="partner in topPayablePartners" :key="partner.key">
              {{ partner.name }} · {{ partner.count }} 单 · {{ money(partner.amount) }}
            </li>
          </ul>
          <p v-if="!topPayablePartners.length" class="mt-2 text-[12px] leading-[1.62] text-nx-ink-3">暂无未结应付。</p>
        </section>
      </div>
      <UButton variant="outline" color="neutral" size="sm" type="button" @click="emit('open', 'aging')">查看账龄明细</UButton>

      <section class="dashboard-block" aria-labelledby="dashboard-drill-title">
        <h3 id="dashboard-drill-title">损益明细与钻取</h3>
        <p v-if="!profitRows.length" class="mt-2 text-[12px] leading-[1.62] text-nx-ink-3">本期暂无损益发生额；完成销售、采购或手工凭证后显示。</p>
        <ul v-else class="dashboard-drill">
          <li v-for="line in profitRows" :key="line.row.key">
            <UButton variant="outline" color="neutral" size="xs" type="button" :disabled="drillBusy" @click="drillRow(line.row.key)">
              {{ line.row.code }} · {{ line.row.name }} · {{ money(line.row.amount) }}
            </UButton>
          </li>
        </ul>
        <div v-if="drill">
          <p>明细过账 · {{ drill.postings.length }} 条</p>
          <UTable
            data-testid="dashboard-postings"
            :data="drill.postings"
            :columns="drillColumns"
            :get-row-id="posting => posting.journalId + ':' + posting.postingNumber"
            :ui="{ td: 'align-top whitespace-normal', th: 'whitespace-nowrap' }"
          >
            <template #account-cell="{ row }">{{ row.original.code }} · {{ row.original.name }}</template>
            <template #actions-cell="{ row }">
              <UButton variant="outline" color="neutral" size="xs" type="button" @click="openJournal(row.original.journalId)">查看凭证</UButton>
            </template>
          </UTable>
          <p v-if="!drill.postings.length" class="mt-2 text-[12px] leading-[1.62] text-nx-ink-3">该科目本期没有过账记录。</p>
        </div>
        <p v-if="journal" class="dashboard-journal">
          {{ journal.journal.sourceNumber }} · {{ journal.journal.on }} · {{ journal.journal.memo }}
        </p>
        <UButton variant="outline" color="neutral" size="sm" type="button" @click="emit('open', 'reports')">打开财务报表</UButton>
      </section>

      <p v-if="projection" class="mt-2 text-[12px] leading-[1.62] text-nx-ink-3">
        经营投影版本 {{ projection.version }} · 更新于 {{ new Date(projection.projectedAtUtc).toLocaleString() }}
      </p>
      <p v-else-if="pendingProjection" class="mt-2 text-[12px] leading-[1.62] text-nx-ink-3">
        经营投影尚未生成；报表数字以 Finance 过账水位 {{ overview.watermark }} 为准。
      </p>
    </template>
    <UButton v-else-if="!loading" color="primary" type="button" @click="load">打开经营仪表盘</UButton>
  </section>
</template>

<style scoped>
.dashboard { margin-top: 24px }
.dashboard-kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; margin: 16px 0 }
.kpi { border: 1px solid var(--nx-border, #e4e9f0); border-radius: 10px; padding: 10px 12px }
.kpi dt { font-size: 12px; color: var(--nx-muted, #667085) }
.kpi dd { margin: 4px 0 0; font-size: 18px; font-variant-numeric: tabular-nums }
.dashboard-note { color: var(--nx-muted, #667085); font-size: 13px }
.dashboard-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 16px; margin: 16px 0 }
.dashboard-block { margin: 16px 0 }
.dashboard-block h3 { margin-bottom: 8px }
.dashboard-block h4 { margin: 12px 0 4px }
.bar-track { display: inline-block; width: 90px; height: 6px; margin-right: 8px; background: #e4e9f0; border-radius: 3px; vertical-align: middle }
.bar-fill { display: block; height: 100%; background: var(--nx-accent, #274580); border-radius: 3px }
.bar-fill.expense { background: #b45309 }
.dashboard-buckets { padding-left: 18px }
.dashboard-drill { list-style: none; padding: 0; display: flex; flex-wrap: wrap; gap: 8px }
.dashboard-journal { font-weight: 600 }
</style>

import type { DateWindow, MonthWindow } from '~/utils/dashboard/dashboard'

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
export interface Posting {
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

export type TrendMonth = MonthWindow & { income: number; expense: number; profit: number }
export interface ComparisonRow { key: string; label: string; current: string; previous: string | null }

export function useWorkspaceDashboard(workspaceId: () => string) {
  const base = computed(() => '/bff/api/finance/workspaces/' + workspaceId())
  const inventoryBase = computed(() => '/bff/api/inventory/workspaces/' + workspaceId())
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
        '/bff/api/reports/workspaces/' + workspaceId(), { retry: 0 },
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

  return {
    loading, error, period, currency, minorUnits, overview, inventory, projection, pendingProjection,
    consistency, months, trendMax, comparisons, receivables, payables, topReceivablePartners,
    topPayablePartners, profitRows, drillBusy, drill, journal, money, load, drillRow, openJournal,
  }
}

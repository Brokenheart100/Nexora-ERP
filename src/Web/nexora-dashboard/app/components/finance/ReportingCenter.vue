<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type {
  ReportingAgingBucketKey,
  ReportingAgingItem,
  ReportingAgingKind,
  ReportingAgingSnapshot,
  ReportingBasis,
  ReportingEquityPartner,
  ReportingExportRecord,
  ReportingLedgerDocType,
  ReportingLedgerDocument,
  ReportingPeriodSeed,
  ReportingRowSeed,
  ReportingStatementKey,
  ReportingVoucher,
  ReportingVoucherLine
} from '~/mocks/reportingCenter'
import {
  reportingAgingBucketKeys,
  reportingAgingBucketLabels,
  reportingAgingItems,
  reportingAgingKindLabels,
  reportingAgingKindLongLabels,
  reportingAgingSnapshots,
  reportingBasisLabels,
  reportingDefaultEnd,
  reportingDefaultStart,
  reportingEquityPartners,
  reportingEquitySeed,
  reportingExportBasisLabels,
  reportingExportSeeds,
  reportingExportStatusColors,
  reportingExportStatusLabels,
  reportingLedgerDocTypeLabels,
  reportingLedgerDocuments,
  reportingLedgerEntries,
  reportingLedgerKindLabels,
  reportingLedgerOpenings,
  reportingMaxDate,
  reportingMinDate,
  reportingPeriods,
  reportingRowSeeds,
  reportingStatementHints,
  reportingStatementLabels,
  reportingVoucherStatusColors,
  reportingVoucherStatusLabels,
  reportingVouchers
} from '~/mocks/reportingCenter'

interface StatementRow {
  id: string
  label: string
  level: number
  measure: 'flow' | 'balance'
  periodAmount: number
  previousAmount: number | null
  budgetAmount: number | null
  delta: number | null
  deltaRate: number | null
  compareLabel: string
  voucherIds: string[]
  drillable: boolean
}

interface EquityStatementRow {
  id: string
  label: string
  paidIn: number
  capitalReserve: number
  retained: number
  total: number
  focusTotal: number
  voucherId: string
}

interface PreviewRow {
  label: string
  measure: string
  periodAmount: number
  compareAmount: number | null
  compareLabel: string
}

interface AgingDetailRow extends ReportingAgingItem {
  overdueDays: number
  bucketKey: ReportingAgingBucketKey
  bucketLabel: string
}

interface AgingBucketView {
  key: ReportingAgingBucketKey
  label: string
  amount: number
  count: number
}

interface LedgerRow {
  id: string
  type: 'opening' | 'entry' | 'closing'
  date: string
  docId: string
  docType: ReportingLedgerDocType | null
  summary: string
  increase: number
  decrease: number
  balance: number
}

interface PreviewResult {
  title: string
  subtitle: string
  basisLabel: string
  watermark: number
  rangeLabel: string
  rows: PreviewRow[]
  generatedAt: string
}

const demoClock = '2026-11-19 09:26'

const toast = useToast()
const { isError, isForbidden } = useMockState()
const { loading: refreshLoading, run: runRefresh } = useMockRefresh()

// 页签与报表参数
const activeTab = ref('statements')
const periodKey = ref(reportingPeriods[1]!.key)
const statement = ref('income-statement')
const basis = ref('accrual')
const rangeStart = ref(reportingDefaultStart)
const rangeEnd = ref(reportingDefaultEnd)
const compareEnabled = ref(true)
const compareMode = ref('previous')

// 账龄与明细账参数
const agingKind = ref('receivable')
const agingCutoff = ref(reportingDefaultEnd)
const snapshotVersions = ref<ReportingAgingSnapshot[]>(structuredClone(reportingAgingSnapshots))
const activeSnapshotId = ref(snapshotVersions.value[0]?.id ?? '')
const ledgerKind = ref('receivable')
const ledgerStart = ref(reportingDefaultStart)
const ledgerEnd = ref(reportingDefaultEnd)

// 权益与导出状态
const equityYear = ref('2026')
const equityPartnerKey = ref('all')
const exportSearch = ref('')
const exportRecords = ref<ReportingExportRecord[]>(structuredClone(reportingExportSeeds))
const exportBusy = ref(false)

// 弹层与钻取状态
const previewOpen = ref(false)
const previewResult = ref<PreviewResult | null>(null)
const drillOpen = ref(false)
const drillRowLabel = ref('')
const drillAmount = ref(0)
const drillBasisNote = ref('')
const drillVoucherId = ref('')
const ledgerDocOpen = ref(false)
const ledgerDoc = ref<ReportingLedgerDocument | null>(null)
const partnerOpen = ref(false)
const partnerId = ref('')

const tabItems = [
  { label: '四表与钻取', value: 'statements' },
  { label: '账龄与明细账', value: 'aging' },
  { label: '权益与导出', value: 'equity' }
]
const periodOptions = reportingPeriods.map(item => ({
  label: `${item.label}（W-${item.watermark}）`,
  value: item.key
}))
const statementOptions = [
  { label: reportingStatementLabels['balance-sheet'], value: 'balance-sheet' },
  { label: reportingStatementLabels['income-statement'], value: 'income-statement' },
  { label: reportingStatementLabels['cash-flow'], value: 'cash-flow' },
  { label: reportingStatementLabels['equity-changes'], value: 'equity-changes' }
]
const basisOptions = [
  { label: reportingBasisLabels.accrual, value: 'accrual' },
  { label: reportingBasisLabels.cash, value: 'cash' }
]
const compareModeOptions = [
  { label: '上一会计期间', value: 'previous' },
  { label: '同口径预算', value: 'budget' }
]
const agingKindItems = [
  { label: reportingAgingKindLabels.receivable, value: 'receivable' },
  { label: reportingAgingKindLabels.payable, value: 'payable' }
]
const ledgerKindItems = [
  { label: reportingLedgerKindLabels.receivable, value: 'receivable' },
  { label: reportingLedgerKindLabels.payable, value: 'payable' }
]
const equityYearOptions = [{ label: '2026 年度', value: '2026' }]
const equityPartnerOptions = computed(() => [
  { label: '全部合伙人', value: 'all' },
  ...reportingEquityPartners.map(item => ({ label: item.name, value: item.id }))
])

function sumValues(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0)
}

function parseDate(value: string): Date {
  return new Date(`${value}T00:00:00`)
}

function daysBetween(start: string, end: string): number {
  const diff = parseDate(end).getTime() - parseDate(start).getTime()
  return Math.max(0, Math.round(diff / 86400000))
}

function monthDays(key: string): number {
  const [yearText, monthText] = key.split('-')
  const year = Number(yearText ?? '2026')
  const month = Number(monthText ?? '1')
  return new Date(year, month, 0).getDate()
}

function shareOfTotal(amount: number): string {
  const total = sumValues(agingBucketRows.value.map(item => item.amount))
  if (total === 0) return '—'
  return `${((amount / total) * 100).toFixed(1)}%`
}

// 报表参数派生
const currentPeriod = computed<ReportingPeriodSeed>(
  () => reportingPeriods.find(item => item.key === periodKey.value) ?? reportingPeriods[1]!
)
const periodEndDate = computed(() =>
  currentPeriod.value.key === '2026-10' ? '2026-10-31' : reportingMaxDate
)
const rangeDays = computed(() =>
  rangeStart.value && rangeEnd.value ? daysBetween(rangeStart.value, rangeEnd.value) : 0
)
const dayRatio = computed(() => {
  const total = monthDays(currentPeriod.value.key)
  return total === 0 ? 0 : Math.min(1, rangeDays.value / total)
})
const rangeError = computed(() => {
  if (!rangeStart.value || !rangeEnd.value) return '请填写完整的报告日期区间。'
  if (rangeStart.value < currentPeriod.value.start) {
    return `开始日期不能早于所选期间起始日 ${currentPeriod.value.start}。`
  }
  if (rangeEnd.value > periodEndDate.value) {
    return `结束日期不能晚于过账水位日 ${periodEndDate.value}。`
  }
  if (rangeStart.value > rangeEnd.value) return '开始日期不能晚于结束日期。'
  return ''
})
const previousKey = computed(() => (currentPeriod.value.key === '2026-11' ? '2026-10' : ''))
const canCompare = computed(() => previousKey.value !== '')
const previousLabel = computed(() =>
  previousKey.value
    ? reportingPeriods.find(item => item.key === previousKey.value)?.label ?? '上一会计期间'
    : '上一会计期间'
)
const compareAvailable = computed(
  () => compareEnabled.value && (compareMode.value === 'budget' || canCompare.value)
)

const currentStatement = computed<ReportingStatementKey>(() => {
  const value = statement.value
  if (
    value === 'balance-sheet'
    || value === 'income-statement'
    || value === 'cash-flow'
    || value === 'equity-changes'
  ) {
    return value
  }
  return 'income-statement'
})
const statementKey = computed<Exclude<ReportingStatementKey, 'equity-changes'>>(() =>
  currentStatement.value === 'equity-changes' ? 'balance-sheet' : currentStatement.value
)
const basisValue = computed<ReportingBasis>(() => (basis.value === 'cash' ? 'cash' : 'accrual'))
const effectiveBasisLabel = computed(() =>
  currentStatement.value === 'income-statement' ? reportingBasisLabels[basisValue.value] : '账面口径'
)
const activeReportTitle = computed(
  () => `${reportingStatementLabels[currentStatement.value]} · ${currentPeriod.value.label}`
)
const activeReportSubtitle = computed(() => reportingStatementHints[currentStatement.value])

function amountForRow(seed: ReportingRowSeed, key: string): number {
  const cashBase = seed.cashMonthly?.[key]
  const base
    = basisValue.value === 'cash' && currentStatement.value === 'income-statement'
      ? cashBase ?? seed.monthly[key] ?? 0
      : seed.monthly[key] ?? 0
  if (seed.measure === 'flow') return Math.round(base * dayRatio.value)
  return base
}

function budgetForRow(seed: ReportingRowSeed, key: string): number {
  const base = seed.monthly[key] ?? 0
  const factor = seed.measure === 'flow' ? dayRatio.value : 1
  return Math.round(base * factor * 1.04)
}

const statementRows = computed<StatementRow[]>(() => {
  if (currentStatement.value === 'equity-changes') return []
  return reportingRowSeeds[statementKey.value].map((seed) => {
    const periodAmount = amountForRow(seed, currentPeriod.value.key)
    let previousAmount: number | null = null
    let budgetAmount: number | null = null
    let compareLabel = ''
    let delta: number | null = null
    let deltaRate: number | null = null
    if (compareAvailable.value) {
      if (compareMode.value === 'previous' && previousKey.value) {
        previousAmount = amountForRow(seed, previousKey.value)
        compareLabel = previousLabel.value
        delta = periodAmount - previousAmount
        deltaRate = previousAmount === 0 ? null : delta / Math.abs(previousAmount)
      } else if (compareMode.value === 'budget') {
        budgetAmount = budgetForRow(seed, currentPeriod.value.key)
        compareLabel = '预算'
        delta = periodAmount - budgetAmount
        deltaRate = budgetAmount === 0 ? null : delta / Math.abs(budgetAmount)
      }
    }
    return {
      id: seed.id,
      label: seed.label,
      level: seed.level,
      measure: seed.measure,
      periodAmount,
      previousAmount,
      budgetAmount,
      delta,
      deltaRate,
      compareLabel,
      voucherIds: seed.voucherIds,
      drillable: seed.voucherIds.length > 0
    }
  })
})

const statementColumns = computed<TableColumn<StatementRow>[]>(() => {
  const columns: TableColumn<StatementRow>[] = [
    { accessorKey: 'label', header: '报表项目', size: 280 },
    { accessorKey: 'periodAmount', header: '本期金额', size: 160 }
  ]
  if (compareAvailable.value) {
    columns.push({
      accessorKey: 'previousAmount',
      header: compareMode.value === 'budget' ? '预算金额' : `上期金额（${previousLabel.value}）`,
      size: 180
    })
    columns.push({ id: 'delta', header: '变动额', size: 150 })
    columns.push({ id: 'deltaRate', header: '变动率', size: 110 })
  }
  columns.push({ id: 'voucherIds', header: '凭证钻取', size: 130 })
  return columns
})

// 权益变动表（报表页签与权益页签共用）
const equityMonth = computed(
  () =>
    reportingEquitySeed.monthly[currentPeriod.value.key] ?? {
      openingRetained: 0,
      netProfit: 0,
      distribution: 0,
      paidInAdd: 0
    }
)
const equityRows = computed<EquityStatementRow[]>(() => {
  const month = equityMonth.value
  const openingTotal
    = reportingEquitySeed.paidIn + reportingEquitySeed.capitalReserve + month.openingRetained
  const paidIn = reportingEquitySeed.paidIn + month.paidInAdd
  const retained = month.openingRetained + month.netProfit - month.distribution
  const closingTotal = paidIn + reportingEquitySeed.capitalReserve + retained
  return [
    {
      id: 'equity-opening',
      label: '一、本期期初权益余额',
      paidIn: reportingEquitySeed.paidIn,
      capitalReserve: reportingEquitySeed.capitalReserve,
      retained: month.openingRetained,
      total: openingTotal,
      focusTotal: openingTotal,
      voucherId: 'equity-opening'
    },
    {
      id: 'equity-paid-in',
      label: '二、本期实收资本增加',
      paidIn: month.paidInAdd,
      capitalReserve: 0,
      retained: 0,
      total: month.paidInAdd,
      focusTotal: month.paidInAdd,
      voucherId: 'equity-contribution'
    },
    {
      id: 'equity-net-profit',
      label: '三、本期净利润',
      paidIn: 0,
      capitalReserve: 0,
      retained: month.netProfit,
      total: month.netProfit,
      focusTotal: month.netProfit,
      voucherId: 'equity-net-profit'
    },
    {
      id: 'equity-distribution',
      label: '四、本期利润分配',
      paidIn: 0,
      capitalReserve: 0,
      retained: -month.distribution,
      total: -month.distribution,
      focusTotal: -month.distribution,
      voucherId: 'equity-distribution'
    },
    {
      id: 'equity-closing',
      label: '五、本期期末权益余额',
      paidIn,
      capitalReserve: reportingEquitySeed.capitalReserve,
      retained,
      total: closingTotal,
      focusTotal: closingTotal,
      voucherId: 'equity-closing'
    }
  ]
})
const equityColumns: TableColumn<EquityStatementRow>[] = [
  { accessorKey: 'label', header: '权益项目', size: 280 },
  { accessorKey: 'paidIn', header: '实收资本', size: 150 },
  { accessorKey: 'capitalReserve', header: '资本公积', size: 150 },
  { accessorKey: 'retained', header: '未分配利润', size: 160 },
  { accessorKey: 'total', header: '合计', size: 160 },
  { id: 'equityVoucher', header: '凭证钻取', size: 130 }
]

// 凭证钻取
const activeDrillVoucher = computed<ReportingVoucher | null>(
  () => reportingVouchers.find(voucher => voucher.id === drillVoucherId.value) ?? null
)
const drillVouchers = computed(() => {
  const statementRow = statementRows.value.find(item => item.label === drillRowLabel.value)
  const equityRow = equityRows.value.find(item => item.label === drillRowLabel.value)
  const ids = statementRow?.voucherIds ?? (equityRow ? [equityRow.voucherId] : [])
  return reportingVouchers.filter(voucher => ids.includes(voucher.id))
})
const drillDebitTotal = computed(() => {
  const voucher = activeDrillVoucher.value
  return voucher ? sumValues(voucher.lines.map(line => line.debit)) : 0
})
const drillCreditTotal = computed(() => {
  const voucher = activeDrillVoucher.value
  return voucher ? sumValues(voucher.lines.map(line => line.credit)) : 0
})
const voucherLineColumns: TableColumn<ReportingVoucherLine>[] = [
  { accessorKey: 'accountCode', header: '科目编码', size: 120 },
  { accessorKey: 'accountName', header: '科目名称', size: 220 },
  { accessorKey: 'debit', header: '借方金额', size: 150 },
  { accessorKey: 'credit', header: '贷方金额', size: 150 }
]

// 报告预览
const previewColumns: TableColumn<PreviewRow>[] = [
  { accessorKey: 'label', header: '项目', size: 240 },
  { accessorKey: 'measure', header: '金额类型', size: 110 },
  { accessorKey: 'periodAmount', header: '本期金额', size: 160 },
  { id: 'compareAmount', header: '对比金额', size: 160 },
  { id: 'compareLabel', header: '对比口径', size: 140 }
]

// 账龄
const agingKindValue = computed<ReportingAgingKind>(() =>
  agingKind.value === 'payable' ? 'payable' : 'receivable'
)
const agingKindLongLabel = computed(() => reportingAgingKindLongLabels[agingKindValue.value])
const agingCutoffError = computed(() => {
  if (!agingCutoff.value) return '请选择账龄截止日。'
  if (agingCutoff.value < reportingMinDate) return `账龄截止日不能早于 ${reportingMinDate}。`
  if (agingCutoff.value > reportingMaxDate) {
    return `账龄截止日不能晚于过账水位日 ${reportingMaxDate}。`
  }
  return ''
})
const activeSnapshot = computed<ReportingAgingSnapshot | null>(
  () =>
    snapshotVersions.value.find(snapshot => snapshot.id === activeSnapshotId.value)
    ?? snapshotVersions.value[0]
    ?? null
)
const activeSnapshotLabel = computed(() => {
  const snapshot = activeSnapshot.value
  return snapshot ? `${snapshot.id} · v${snapshot.version}` : '暂无快照'
})
const snapshotOptions = computed(() =>
  snapshotVersions.value.map(snapshot => ({
    label: `${snapshot.id}（v${snapshot.version} · ${snapshot.cutoff}）`,
    value: snapshot.id
  }))
)
const liveAgingTotals = computed(() => {
  if (agingCutoffError.value) return { receivable: 0, payable: 0 }
  const within = reportingAgingItems.filter(item => item.postedAt <= agingCutoff.value)
  return {
    receivable: sumValues(within.filter(item => item.kind === 'receivable').map(item => item.amount)),
    payable: sumValues(within.filter(item => item.kind === 'payable').map(item => item.amount))
  }
})
const snapshotDiff = computed(() => {
  const snapshot = activeSnapshot.value
  if (!snapshot) return null
  const receivable = liveAgingTotals.value.receivable - snapshot.receivableTotal
  const payable = liveAgingTotals.value.payable - snapshot.payableTotal
  return { receivable, payable, mismatch: receivable !== 0 || payable !== 0 }
})
const snapshotDiffText = computed(() => {
  const diff = snapshotDiff.value
  if (!diff) return ''
  return `按截止日重算与快照存照差异：应收 ${formatMoney(diff.receivable)}，应付 ${formatMoney(diff.payable)}。历史快照保留原生成时点金额。`
})
const agingDetailRows = computed<AgingDetailRow[]>(() => {
  if (agingCutoffError.value) return []
  const cutoff = agingCutoff.value
  return reportingAgingItems
    .filter(item => item.kind === agingKind.value && item.postedAt <= cutoff)
    .map((item) => {
      const overdueDays
        = item.dueAt < cutoff ? daysBetween(item.dueAt, cutoff) : -daysBetween(cutoff, item.dueAt)
      const bucketKey: ReportingAgingBucketKey
        = overdueDays <= 0
          ? 'current'
          : overdueDays <= 30
            ? 'd1-30'
            : overdueDays <= 60
              ? 'd31-60'
              : overdueDays <= 90
                ? 'd61-90'
                : 'd90-plus'
      return {
        ...item,
        overdueDays,
        bucketKey,
        bucketLabel: reportingAgingBucketLabels[bucketKey]
      }
    })
    .sort((a, b) => b.overdueDays - a.overdueDays)
})
const agingBucketRows = computed<AgingBucketView[]>(() =>
  reportingAgingBucketKeys.map((key) => {
    const rows = agingDetailRows.value.filter(item => item.bucketKey === key)
    return {
      key,
      label: reportingAgingBucketLabels[key],
      amount: sumValues(rows.map(item => item.amount)),
      count: rows.length
    }
  })
)
const agingBucketTotal = computed(() => sumValues(agingBucketRows.value.map(item => item.amount)))
const agingColumns: TableColumn<AgingBucketView>[] = [
  { accessorKey: 'label', header: '账龄区间', size: 220 },
  { accessorKey: 'count', header: '单据笔数', size: 120 },
  { id: 'amount', header: '余额金额', size: 180 },
  { id: 'share', header: '占比', size: 120 }
]
const agingDetailColumns: TableColumn<AgingDetailRow>[] = [
  { accessorKey: 'partnerName', header: '往来单位', size: 200 },
  { accessorKey: 'docId', header: '单据号', size: 150 },
  { accessorKey: 'docType', header: '单据类型', size: 120 },
  { accessorKey: 'postedAt', header: '挂账日期', size: 120 },
  { accessorKey: 'dueAt', header: '到期日', size: 120 },
  { id: 'overdueDays', header: '逾期天数', size: 110 },
  { id: 'bucketLabel', header: '账龄区间', size: 130 },
  { id: 'amount', header: '余额金额', size: 160 }
]

// 明细账
const ledgerRangeError = computed(() => {
  if (!ledgerStart.value || !ledgerEnd.value) return '请填写完整的明细账日期区间。'
  if (ledgerStart.value < currentPeriod.value.start) {
    return `开始日期不能早于 ${currentPeriod.value.start}。`
  }
  if (ledgerEnd.value > periodEndDate.value) {
    return `结束日期不能晚于过账水位日 ${periodEndDate.value}。`
  }
  if (ledgerStart.value > ledgerEnd.value) return '开始日期不能晚于结束日期。'
  return ''
})
const ledgerRows = computed<LedgerRow[]>(() => {
  if (ledgerRangeError.value) return []
  const entries = reportingLedgerEntries
    .filter(entry => entry.kind === ledgerKind.value)
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date))
  const partnerNames = Array.from(new Set(entries.map(entry => entry.partnerName)))
  const rows: LedgerRow[] = []
  for (const partnerName of partnerNames) {
    const opening = reportingLedgerOpenings.find(
      item => item.kind === ledgerKind.value && item.partnerName === partnerName
    )
    const partnerEntries = entries.filter(entry => entry.partnerName === partnerName)
    const openingBase = opening?.openingAmount ?? 0
    const prior = partnerEntries.filter(entry => entry.date < ledgerStart.value)
    const openingBalance
      = openingBase + sumValues(prior.map(entry => entry.increase - entry.decrease))
    const rangeEntries = partnerEntries.filter(
      entry => entry.date >= ledgerStart.value && entry.date <= ledgerEnd.value
    )
    let balance = openingBalance
    rows.push({
      id: `opening-${partnerName}`,
      type: 'opening',
      date: ledgerStart.value,
      docId: '—',
      docType: null,
      summary: `${partnerName} 期初余额`,
      increase: 0,
      decrease: 0,
      balance
    })
    for (const entry of rangeEntries) {
      balance += entry.increase - entry.decrease
      rows.push({
        id: entry.id,
        type: 'entry',
        date: entry.date,
        docId: entry.docId,
        docType: entry.docType,
        summary: entry.summary,
        increase: entry.increase,
        decrease: entry.decrease,
        balance
      })
    }
    rows.push({
      id: `closing-${partnerName}`,
      type: 'closing',
      date: ledgerEnd.value,
      docId: '—',
      docType: null,
      summary: `${partnerName} 期末余额`,
      increase: 0,
      decrease: 0,
      balance
    })
  }
  return rows
})
const ledgerTotals = computed(() => ({
  opening: sumValues(ledgerRows.value.filter(row => row.type === 'opening').map(row => row.balance)),
  increase: sumValues(ledgerRows.value.filter(row => row.type === 'entry').map(row => row.increase)),
  decrease: sumValues(ledgerRows.value.filter(row => row.type === 'entry').map(row => row.decrease)),
  closing: sumValues(ledgerRows.value.filter(row => row.type === 'closing').map(row => row.balance))
}))
const ledgerColumns: TableColumn<LedgerRow>[] = [
  { accessorKey: 'date', header: '日期', size: 120 },
  { accessorKey: 'docId', header: '单据号', size: 160 },
  { accessorKey: 'docType', header: '单据类型', size: 120 },
  { accessorKey: 'summary', header: '摘要', size: 260 },
  { accessorKey: 'increase', header: '增加', size: 150 },
  { accessorKey: 'decrease', header: '减少', size: 150 },
  { accessorKey: 'balance', header: '余额', size: 150 },
  { id: 'docActions', header: '单据操作', size: 130 }
]

// 权益与导出
const equityPartnerRows = computed<ReportingEquityPartner[]>(() =>
  equityPartnerKey.value === 'all'
    ? reportingEquityPartners
    : reportingEquityPartners.filter(item => item.id === equityPartnerKey.value)
)
const equityPartnerTotals = computed(() =>
  reportingEquityPartners.reduce(
    (acc, item) => ({
      capital: acc.capital + item.capital,
      openingEquity: acc.openingEquity + item.openingEquity,
      netProfitShare: acc.netProfitShare + item.netProfitShare,
      distribution: acc.distribution + item.distribution,
      closingEquity: acc.closingEquity + item.closingEquity
    }),
    {
      capital: 0,
      openingEquity: 0,
      netProfitShare: 0,
      distribution: 0,
      closingEquity: 0
    }
  )
)
const equityPartnerColumns: TableColumn<ReportingEquityPartner>[] = [
  { accessorKey: 'name', header: '合伙人', size: 240 },
  { accessorKey: 'role', header: '身份', size: 140 },
  { accessorKey: 'sharePct', header: '权益份额', size: 110 },
  { accessorKey: 'capital', header: '认缴出资', size: 150 },
  { accessorKey: 'openingEquity', header: '期初权益', size: 150 },
  { accessorKey: 'netProfitShare', header: '净利润分配', size: 150 },
  { accessorKey: 'distribution', header: '利润分配', size: 150 },
  { accessorKey: 'closingEquity', header: '期末权益', size: 150 }
]
const equityPartnerDetail = computed(
  () => reportingEquityPartners.find(item => item.id === partnerId.value) ?? null
)
const filteredExports = computed(() => {
  const keyword = exportSearch.value.trim()
  if (!keyword) return exportRecords.value
  return exportRecords.value.filter(record =>
    [
      record.id,
      record.workspaceName,
      reportingStatementLabels[record.statement],
      record.periodKey,
      reportingExportStatusLabels[record.status],
      record.snapshotId
    ].some(value => value.includes(keyword))
  )
})
const exportColumns: TableColumn<ReportingExportRecord>[] = [
  { accessorKey: 'id', header: '记录号', size: 160 },
  { id: 'statement', header: '报表', size: 170 },
  { accessorKey: 'periodKey', header: '期间', size: 110 },
  { accessorKey: 'rangeStart', header: '开始日期', size: 120 },
  { accessorKey: 'rangeEnd', header: '结束日期', size: 120 },
  { id: 'basis', header: '口径', size: 130 },
  { id: 'status', header: '状态', size: 200 },
  { accessorKey: 'watermark', header: '过账水位', size: 100 },
  { accessorKey: 'snapshotId', header: '快照', size: 210 },
  { accessorKey: 'requestedAt', header: '请求时间', size: 160 },
  { id: 'exportActions', header: '操作', size: 130 }
]

// 交互
function reloadSeeds() {
  runRefresh(() => {
    exportRecords.value = structuredClone(reportingExportSeeds)
    snapshotVersions.value = structuredClone(reportingAgingSnapshots)
    activeSnapshotId.value = snapshotVersions.value[0]?.id ?? ''
    rangeStart.value = reportingDefaultStart
    rangeEnd.value = reportingDefaultEnd
    ledgerStart.value = reportingDefaultStart
    ledgerEnd.value = reportingDefaultEnd
    agingCutoff.value = reportingDefaultEnd
    toast.add({
      title: '已恢复演示种子数据',
      description: '报表参数、账龄快照与导出记录已恢复到固定的 2026-10 / 2026-11 种子。',
      color: 'success',
      icon: 'i-carbon-renew'
    })
  })
}

async function backToWorkbench() {
  await navigateTo({ path: '/finance', query: { tab: 'workbench' } })
}

function resetRange() {
  rangeStart.value = currentPeriod.value.start
  rangeEnd.value = periodEndDate.value
  toast.add({
    title: '日期区间已重置',
    description: `已恢复为 ${rangeStart.value} 至 ${rangeEnd.value}（${currentPeriod.value.label}，水位 W-${currentPeriod.value.watermark}）。`,
    color: 'neutral',
    icon: 'i-carbon-renew'
  })
}

function openStatementDrill(row: StatementRow) {
  if (!row.drillable || row.voucherIds.length === 0) {
    toast.add({
      title: '该报表行没有可钻取的凭证',
      description: '汇总行或计算行不直接挂凭证，请选择带凭证来源的明细行。',
      color: 'neutral',
      icon: 'i-carbon-information'
    })
    return
  }
  drillRowLabel.value = row.label
  drillAmount.value = row.periodAmount
  drillBasisNote.value
    = currentStatement.value === 'income-statement' && basisValue.value === 'cash'
      ? '收付实现制口径：报表金额为折算值，凭证分录仍为权责发生制原值。'
      : '报表金额与凭证分录读取同一过账水位，已过账凭证保持原值。'
  drillVoucherId.value = row.voucherIds[0] ?? ''
  drillOpen.value = true
}

function openEquityDrill(row: EquityStatementRow) {
  drillRowLabel.value = row.label
  drillAmount.value = row.focusTotal
  drillBasisNote.value = '权益变动表按所选期间汇总；凭证分录与已过账金额保持原值。'
  drillVoucherId.value = reportingEquitySeed.voucherIds[row.id]?.[0] ?? ''
  drillOpen.value = true
}

function selectDrillVoucher(id: string) {
  drillVoucherId.value = id
}

function openEquityStatement() {
  activeTab.value = 'statements'
  statement.value = 'equity-changes'
  toast.add({
    title: '已切换到权益变动表',
    description: '报表页签已按当前期间生成所有者权益变动表，可继续钻取权益凭证。',
    color: 'neutral',
    icon: 'i-carbon-table'
  })
}

function openPreview() {
  if (rangeError.value) {
    toast.add({
      title: '日期区间无效，无法预览',
      description: rangeError.value,
      color: 'error',
      icon: 'i-carbon-warning-alt'
    })
    return
  }
  const compareLabel = compareMode.value === 'budget' ? '预算' : previousLabel.value
  const rows: PreviewRow[]
    = currentStatement.value === 'equity-changes'
      ? equityRows.value.map(row => ({
          label: row.label,
          measure: '权益余额',
          periodAmount: row.focusTotal,
          compareAmount: null,
          compareLabel: '—'
        }))
      : statementRows.value.map(row => ({
          label: row.label,
          measure: row.measure === 'flow' ? '发生额' : '余额',
          periodAmount: row.periodAmount,
          compareAmount: compareAvailable.value
            ? compareMode.value === 'budget'
              ? row.budgetAmount
              : row.previousAmount
            : null,
          compareLabel: compareAvailable.value ? compareLabel : '—'
        }))
  previewResult.value = {
    title: reportingStatementLabels[currentStatement.value],
    subtitle: reportingStatementHints[currentStatement.value],
    basisLabel: effectiveBasisLabel.value,
    watermark: currentPeriod.value.watermark,
    rangeLabel: `${rangeStart.value} 至 ${rangeEnd.value}`,
    rows,
    generatedAt: demoClock
  }
  previewOpen.value = true
}

function previewCsvRows(rows: PreviewRow[]): (string | number)[][] {
  return rows.map(row => [
    row.label,
    row.measure,
    formatMoney(row.periodAmount),
    row.compareAmount == null ? '' : formatMoney(row.compareAmount),
    row.compareLabel
  ])
}

function downloadPreview() {
  const preview = previewResult.value
  if (!preview) return
  const fileName = `preview-${currentStatement.value}-${currentPeriod.value.key}.csv`
  downloadCsv(
    fileName,
    ['报表项目', '金额类型', '本期金额', '对比金额', '对比口径'],
    previewCsvRows(preview.rows)
  )
  toast.add({
    title: '预览 CSV 已下载',
    description: `${fileName} 使用期间水位 W-${preview.watermark} 与口径「${preview.basisLabel}」。`,
    color: 'success',
    icon: 'i-carbon-download'
  })
}

function exportCsvRows(): { headers: string[], rows: (string | number)[][] } {
  if (currentStatement.value === 'equity-changes') {
    return {
      headers: ['权益项目', '实收资本', '资本公积', '未分配利润', '合计'],
      rows: equityRows.value.map(row => [
        row.label,
        formatMoney(row.paidIn),
        formatMoney(row.capitalReserve),
        formatMoney(row.retained),
        formatMoney(row.total)
      ])
    }
  }
  const headers
    = compareAvailable.value && compareMode.value === 'budget'
      ? ['报表项目', '本期金额', '预算金额', '凭证']
      : compareAvailable.value
        ? ['报表项目', '本期金额', '上期金额', '凭证']
        : ['报表项目', '本期金额', '凭证']
  const rows = statementRows.value.map((row) => {
    const base: (string | number)[] = [row.label, formatMoney(row.periodAmount)]
    if (compareAvailable.value) {
      const compareAmount = compareMode.value === 'budget' ? row.budgetAmount : row.previousAmount
      base.push(compareAmount == null ? '' : formatMoney(compareAmount))
    }
    base.push(row.voucherIds.length ? row.voucherIds.join(' ') : '—')
    return base
  })
  return { headers, rows }
}

function createExport() {
  if (rangeError.value) {
    toast.add({
      title: '日期区间无效，无法导出',
      description: rangeError.value,
      color: 'error',
      icon: 'i-carbon-warning-alt'
    })
    return
  }
  if (exportBusy.value) return
  const statementValue = currentStatement.value
  const period = currentPeriod.value
  const { headers, rows } = exportCsvRows()
  const record: ReportingExportRecord = {
    id: `EXP-2026-${String(exportRecords.value.length + 5).padStart(4, '0')}`,
    workspaceId: 'ws-hq',
    workspaceName: '华东总部贸易有限公司',
    statement: statementValue,
    periodKey: period.key,
    rangeStart: rangeStart.value,
    rangeEnd: rangeEnd.value,
    basis: basisValue.value,
    status: 'generating',
    watermark: period.watermark,
    snapshotId: `snap-${rangeEnd.value}-local`,
    requestedAt: demoClock,
    rowCount: rows.length,
    fileName: `${statementValue}-${period.key}.csv`,
    fileSizeKb: 0
  }
  exportRecords.value = [record, ...exportRecords.value]
  exportBusy.value = true
  toast.add({
    title: '已提交报告导出',
    description: `${reportingStatementLabels[statementValue]}（${period.label}，水位 W-${period.watermark}）正在生成 CSV。`,
    color: 'neutral',
    icon: 'i-carbon-task'
  })
  setTimeout(() => {
    record.status = 'ready'
    record.completedAt = demoClock
    record.fileSizeKb = Math.max(1, Math.round(JSON.stringify(rows).length / 1024))
    downloadCsv(record.fileName, headers, rows)
    exportBusy.value = false
    toast.add({
      title: '导出文件已生成',
      description: `${record.fileName} 已按 ${rangeStart.value} 至 ${rangeEnd.value} 与水位 W-${record.watermark} 下载。`,
      color: 'success',
      icon: 'i-carbon-download'
    })
  }, 600)
}

function downloadExportRecord(record: ReportingExportRecord) {
  if (record.status !== 'ready') {
    toast.add({
      title: '该导出记录尚未就绪',
      description: '只有已就绪的导出记录可以下载，生成中或失败的记录请稍后重试。',
      color: 'neutral',
      icon: 'i-carbon-information'
    })
    return
  }
  downloadCsv(record.fileName, ['记录号', '报表', '期间', '水位', '生成时间'], [
    [
      record.id,
      reportingStatementLabels[record.statement],
      record.periodKey,
      `W-${record.watermark}`,
      record.completedAt ?? record.requestedAt
    ]
  ])
  toast.add({
    title: '导出文件已下载',
    description: `${record.fileName}（期间 ${record.periodKey}，水位 W-${record.watermark}）。`,
    color: 'success',
    icon: 'i-carbon-download'
  })
}

function rebuildExport(record: ReportingExportRecord) {
  if (record.status !== 'failed') {
    toast.add({
      title: '该记录无需重建',
      description: '仅生成失败的导出记录支持按原快照重建。',
      color: 'neutral',
      icon: 'i-carbon-information'
    })
    return
  }
  record.status = 'generating'
  record.failureReason = undefined
  toast.add({
    title: '已按原快照重建导出',
    description: `${record.id} 正在使用快照 ${record.snapshotId} 与水位 W-${record.watermark} 重新生成。`,
    color: 'neutral',
    icon: 'i-carbon-renew'
  })
  setTimeout(() => {
    record.status = 'ready'
    record.completedAt = demoClock
    record.rebuiltFrom = record.snapshotId
    record.fileSizeKb = record.fileSizeKb || 2.4
    toast.add({
      title: '导出记录已重建',
      description: `${record.id} 已按同一期间、同一水位重新生成，可下载。`,
      color: 'success',
      icon: 'i-carbon-checkmark'
    })
  }, 600)
}

function recalculateAgingSnapshot() {
  if (agingCutoffError.value) {
    toast.add({
      title: '无法重算账龄快照',
      description: agingCutoffError.value,
      color: 'error',
      icon: 'i-carbon-warning-alt'
    })
    return
  }
  const cutoff = agingCutoff.value
  const within = reportingAgingItems.filter(item => item.postedAt <= cutoff)
  const receivable = sumValues(
    within.filter(item => item.kind === 'receivable').map(item => item.amount)
  )
  const payable = sumValues(within.filter(item => item.kind === 'payable').map(item => item.amount))
  const version = snapshotVersions.value.length + 1
  const snapshot: ReportingAgingSnapshot = {
    id: `AS-${cutoff}-v${version}`,
    cutoff,
    generatedAt: demoClock,
    version,
    receivableTotal: receivable,
    payableTotal: payable,
    note: '按当前截止日重算的本地演示快照；历史快照保留生成时点的金额。'
  }
  snapshotVersions.value = [snapshot, ...snapshotVersions.value]
  activeSnapshotId.value = snapshot.id
  toast.add({
    title: '账龄快照已重算',
    description: `截止 ${cutoff}：应收 ${formatMoney(receivable)}，应付 ${formatMoney(payable)}；历史快照保持不变。`,
    color: 'success',
    icon: 'i-carbon-checkmark'
  })
}

function jumpToDocument(row: LedgerRow) {
  if (!row.docId || row.docId === '—') {
    toast.add({
      title: '该行没有可回跳的单据',
      description: '期初 / 期末行仅用于展示余额口径，请选择逐笔发生记录。',
      color: 'neutral',
      icon: 'i-carbon-information'
    })
    return
  }
  const document = reportingLedgerDocuments.find(item => item.id === row.docId)
  if (!document) {
    toast.add({
      title: '未找到关联单据',
      description: `单据 ${row.docId} 不在演示数据中，可能已作废或被冲销。`,
      color: 'warning',
      icon: 'i-carbon-warning-alt'
    })
    return
  }
  toast.add({
    title: `正在跳转 ${document.label}`,
    description: `${document.partnerName} · ${document.date} · ${formatMoney(document.amount)}；回跳前后保持同一期间与余额口径。`,
    color: 'neutral',
    icon: 'i-carbon-arrow-up-right'
  })
  void navigateTo(document.jumpPath)
}

function openLedgerDocument(row: LedgerRow) {
  if (!row.docId || row.docId === '—') {
    toast.add({
      title: '该行没有单据详情',
      description: '期初 / 期末行不关联业务单据。',
      color: 'neutral',
      icon: 'i-carbon-information'
    })
    return
  }
  const document = reportingLedgerDocuments.find(item => item.id === row.docId)
  if (!document) {
    toast.add({
      title: '未找到单据详情',
      description: `单据 ${row.docId} 不在演示数据中。`,
      color: 'warning',
      icon: 'i-carbon-warning-alt'
    })
    return
  }
  ledgerDoc.value = document
  ledgerDocOpen.value = true
}

function navigateLedgerDoc(document: ReportingLedgerDocument) {
  toast.add({
    title: `跳转 ${document.label}`,
    description: `${document.jumpLabel}；返回后可使用相同期间与截止日核对余额。`,
    color: 'neutral',
    icon: 'i-carbon-arrow-up-right'
  })
  void navigateTo(document.jumpPath)
}

function openPartner(partner: ReportingEquityPartner) {
  partnerId.value = partner.id
  partnerOpen.value = true
}

watch(periodKey, () => {
  rangeStart.value = currentPeriod.value.start
  rangeEnd.value = periodEndDate.value
})

watch(agingCutoff, () => {
  if (agingCutoffError.value) return
  const matched = snapshotVersions.value.find(snapshot => snapshot.cutoff === agingCutoff.value)
  if (matched) activeSnapshotId.value = matched.id
})
</script>

<template>
  <div class="space-y-3" data-testid="reporting-center">
    <UAlert
      v-if="isError"
      color="error"
      variant="soft"
      icon="i-carbon-warning-alt"
      title="财务报表数据加载失败"
      description="投影服务返回错误，已保留固定的 2026-10 / 2026-11 种子数据；请恢复种子或稍后重试。"
      data-testid="reporting-error"
    />
    <UAlert
      v-else-if="isForbidden"
      color="warning"
      variant="soft"
      icon="i-carbon-locked"
      title="没有财务报表查看权限"
      description="当前账号无权查看该工作区的财务报表与账龄数据，请联系财务管理员授权。"
      data-testid="reporting-forbidden"
    />

    <UCard class="nx-reveal rounded-sm">
      <template #header>
        <div class="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 class="text-base font-semibold text-highlighted">
              财务报表中心
            </h2>
            <p class="mt-0.5 text-xs text-muted">
              四张财务报表、账龄快照与明细账共用同一过账水位；切换核算口径不改变已过账凭证原值。
            </p>
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <UBadge
              :label="'过账水位 W-' + currentPeriod.watermark"
              color="info"
              variant="subtle"
              size="sm"
              data-testid="reporting-watermark-badge"
            />
            <UButton
              label="恢复种子"
              icon="i-carbon-renew"
              color="neutral"
              variant="outline"
              size="sm"
              :loading="refreshLoading"
              data-testid="reporting-refresh"
              @click="reloadSeeds"
            />
            <UButton
              label="返回工作台"
              icon="i-carbon-arrow-left"
              color="neutral"
              variant="ghost"
              size="sm"
              data-testid="reporting-back-workbench"
              @click="backToWorkbench"
            />
          </div>
        </div>
      </template>
      <div class="space-y-3 p-3">
        <UTabs
          v-model="activeTab"
          :items="tabItems"
          :content="false"
          size="sm"
          data-testid="reporting-tabs"
        />

        <div v-if="activeTab === 'statements'" class="space-y-3" data-testid="reporting-panel-statements">
          <UCard class="rounded-sm" :ui="{ body: 'p-3 sm:p-3' }">
            <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <div class="space-y-1">
                <p class="text-xs text-muted">
                  报告期间
                </p>
                <USelect
                  v-model="periodKey"
                  :items="periodOptions"
                  size="sm"
                  data-testid="reporting-period-select"
                />
              </div>
              <div class="space-y-1">
                <p class="text-xs text-muted">
                  财务报表
                </p>
                <USelect
                  v-model="statement"
                  :items="statementOptions"
                  size="sm"
                  data-testid="reporting-statement-select"
                />
              </div>
              <div class="space-y-1">
                <p class="text-xs text-muted">
                  利润表核算口径
                </p>
                <USelect
                  v-model="basis"
                  :items="basisOptions"
                  size="sm"
                  :disabled="currentStatement !== 'income-statement'"
                  data-testid="reporting-basis-select"
                />
                <p class="text-[11px] text-muted">
                  仅利润表支持口径切换，其余报表固定账面口径。
                </p>
              </div>
              <div class="space-y-1">
                <p class="text-xs text-muted">
                  报告日期区间
                </p>
                <div class="flex items-center gap-2">
                  <UInput
                    v-model="rangeStart"
                    type="date"
                    size="sm"
                    class="w-full"
                    :min="currentPeriod.start"
                    :max="periodEndDate"
                    aria-label="报告开始日期"
                    data-testid="reporting-range-start"
                  />
                  <span class="text-xs text-muted">至</span>
                  <UInput
                    v-model="rangeEnd"
                    type="date"
                    size="sm"
                    class="w-full"
                    :min="currentPeriod.start"
                    :max="periodEndDate"
                    aria-label="报告结束日期"
                    data-testid="reporting-range-end"
                  />
                </div>
              </div>
              <div class="space-y-1">
                <p class="text-xs text-muted">
                  上期对比
                </p>
                <div class="flex items-center gap-2">
                  <USwitch v-model="compareEnabled" size="sm" data-testid="reporting-compare-switch" />
                  <USelect
                    v-model="compareMode"
                    :items="compareModeOptions"
                    size="sm"
                    class="w-full"
                    :disabled="!compareEnabled"
                    data-testid="reporting-compare-mode"
                  />
                </div>
                <p class="text-[11px] text-muted">
                  对比口径：{{ compareMode === 'budget' ? '同口径预算' : previousLabel }}
                </p>
              </div>
              <div class="flex items-end gap-2">
                <UButton
                  label="重置区间"
                  color="neutral"
                  variant="outline"
                  size="sm"
                  data-testid="reporting-range-reset"
                  @click="resetRange"
                />
                <UButton
                  label="刷新预览"
                  color="primary"
                  variant="soft"
                  size="sm"
                  icon="i-carbon-view"
                  data-testid="reporting-preview-refresh"
                  @click="openPreview"
                />
              </div>
            </div>
            <div class="mt-3 space-y-2">
              <UAlert
                v-if="rangeError"
                color="error"
                variant="soft"
                icon="i-carbon-warning-alt"
                :title="rangeError"
                description="请修正日期区间后再预览或导出，报表期间与水位保持不变。"
                data-testid="reporting-range-error"
              />
              <UAlert
                v-if="compareEnabled && compareMode === 'previous' && !canCompare"
                color="warning"
                variant="soft"
                icon="i-carbon-information"
                title="当前期间没有可用的上期对比数据"
                description="2026-10 是演示数据的首个期间；切换到 2026-11 后可对比 2026-10，或改用同口径预算对比。"
                data-testid="reporting-compare-alert"
              />
              <UAlert
                v-if="currentStatement === 'income-statement' && basisValue === 'cash'"
                color="info"
                variant="soft"
                icon="i-carbon-information"
                title="当前为收付实现制口径"
                description="利润表金额按收付实现制折算展示，凭证分录与已过账金额仍保持权责发生制原值。"
                data-testid="reporting-basis-alert"
              />
            </div>
          </UCard>

          <UCard class="rounded-sm" :ui="{ body: 'p-3 sm:p-3' }">
            <template #header>
              <div class="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 class="text-sm font-semibold text-highlighted">
                    {{ activeReportTitle }}
                  </h3>
                  <p class="mt-0.5 text-xs text-muted">
                    {{ activeReportSubtitle }}
                  </p>
                </div>
                <div class="flex flex-wrap items-center gap-2">
                  <UBadge
                    :label="'口径：' + effectiveBasisLabel"
                    color="neutral"
                    variant="subtle"
                    size="sm"
                    data-testid="reporting-effective-basis"
                  />
                  <UBadge
                    :label="'水位 W-' + currentPeriod.watermark"
                    color="info"
                    variant="subtle"
                    size="sm"
                    data-testid="reporting-report-watermark"
                  />
                  <UButton
                    label="报告预览"
                    icon="i-carbon-view"
                    color="primary"
                    variant="soft"
                    size="sm"
                    data-testid="reporting-preview-open"
                    @click="openPreview"
                  />
                </div>
              </div>
            </template>
            <div class="space-y-3 p-3">
              <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <div class="rounded-sm border border-default px-3 py-2" data-testid="reporting-summary-items">
                  <p class="text-xs text-muted">
                    报表项目数
                  </p>
                  <p class="mt-1 text-lg font-semibold text-highlighted">
                    {{ currentStatement === 'equity-changes' ? equityRows.length : statementRows.length }}
                  </p>
                </div>
                <div class="rounded-sm border border-default px-3 py-2" data-testid="reporting-summary-flow">
                  <p class="text-xs text-muted">
                    本期发生额合计
                  </p>
                  <p class="mt-1 text-lg font-semibold text-highlighted">
                    {{ formatMoney(sumValues(statementRows.filter(row => row.measure === 'flow').map(row => row.periodAmount))) }}
                  </p>
                </div>
                <div class="rounded-sm border border-default px-3 py-2" data-testid="reporting-summary-balance">
                  <p class="text-xs text-muted">
                    期末余额合计
                  </p>
                  <p class="mt-1 text-lg font-semibold text-highlighted">
                    {{ formatMoney(sumValues(statementRows.filter(row => row.measure === 'balance').map(row => row.periodAmount))) }}
                  </p>
                </div>
                <div class="rounded-sm border border-default px-3 py-2" data-testid="reporting-summary-compare">
                  <p class="text-xs text-muted">
                    对比口径
                  </p>
                  <p class="mt-1 text-lg font-semibold text-highlighted">
                    {{ compareAvailable ? (compareMode === 'budget' ? '同口径预算' : previousLabel) : '未启用' }}
                  </p>
                </div>
              </div>

              <template v-if="currentStatement === 'equity-changes'">
                <ResizableTable
                  :data="equityRows"
                  :columns="equityColumns"
                  class="nx-table"
                  data-testid="reporting-equity-statement-table"
                >
                  <template #label-cell="{ row }">
                    <span class="font-medium text-highlighted">{{ row.original.label }}</span>
                  </template>
                  <template #paidIn-cell="{ row }">
                    {{ formatMoney(row.original.paidIn) }}
                  </template>
                  <template #capitalReserve-cell="{ row }">
                    {{ formatMoney(row.original.capitalReserve) }}
                  </template>
                  <template #retained-cell="{ row }">
                    {{ formatMoney(row.original.retained) }}
                  </template>
                  <template #total-cell="{ row }">
                    <span class="font-semibold text-highlighted">{{ formatMoney(row.original.total) }}</span>
                  </template>
                  <template #equityVoucher-cell="{ row }">
                    <UButton
                      label="查看凭证"
                      color="primary"
                      variant="link"
                      size="xs"
                      :data-testid="'reporting-equity-drill-' + row.original.id"
                      @click.stop="openEquityDrill(row.original)"
                    />
                  </template>
                </ResizableTable>
                <div class="flex flex-wrap items-center justify-between gap-2 rounded-sm border border-default px-3 py-2">
                  <span class="text-xs text-muted">
                    权益变动表沿用当前期间 {{ currentPeriod.label }} 与过账水位 W-{{ currentPeriod.watermark }}；已过账凭证保持原值。
                  </span>
                  <UButton
                    label="进入权益与导出"
                    icon="i-carbon-arrow-right"
                    color="neutral"
                    variant="outline"
                    size="sm"
                    data-testid="reporting-go-equity"
                    @click="activeTab = 'equity'"
                  />
                </div>
              </template>
              <template v-else>
                <ResizableTable
                  :data="statementRows"
                  :columns="statementColumns"
                  class="nx-table"
                  data-testid="reporting-statement-table"
                  :row-activate="openStatementDrill"
                >
                  <template #label-cell="{ row }">
                    <span
                      :class="row.original.level === 0 ? 'font-semibold text-highlighted' : 'pl-3 text-default'"
                    >
                      {{ row.original.label }}
                    </span>
                  </template>
                  <template #periodAmount-cell="{ row }">
                    {{ formatMoney(row.original.periodAmount) }}
                  </template>
                  <template #previousAmount-cell="{ row }">
                    {{ formatMoney(compareMode === 'budget' ? (row.original.budgetAmount ?? 0) : (row.original.previousAmount ?? 0)) }}
                  </template>
                  <template #delta-cell="{ row }">
                    <span v-if="row.original.delta == null" class="text-muted">—</span>
                    <span
                      v-else
                      :class="row.original.delta >= 0 ? 'text-success' : 'text-error'"
                    >
                      {{ (row.original.delta >= 0 ? '+' : '') + formatMoney(row.original.delta) }}
                    </span>
                  </template>
                  <template #deltaRate-cell="{ row }">
                    <span v-if="row.original.deltaRate == null" class="text-muted">—</span>
                    <span v-else>{{ (row.original.deltaRate * 100).toFixed(1) }}%</span>
                  </template>
                  <template #voucherIds-cell="{ row }">
                    <UButton
                      v-if="row.original.drillable"
                      :label="'钻取 ' + row.original.voucherIds.length + ' 张凭证'"
                      color="primary"
                      variant="link"
                      size="xs"
                      :data-testid="'reporting-drill-open-' + row.original.id"
                      @click.stop="openStatementDrill(row.original)"
                    />
                    <span v-else class="text-xs text-muted">汇总行不可钻取</span>
                  </template>
                </ResizableTable>
                <UEmpty
                  v-if="statementRows.length === 0"
                  icon="i-carbon-table"
                  title="当前条件下没有报表行"
                  description="请调整报告期间或日期区间后重试。"
                  data-testid="reporting-empty"
                />
              </template>
            </div>
          </UCard>
        </div>

        <div v-else-if="activeTab === 'aging'" class="space-y-3" data-testid="reporting-panel-aging">
          <UCard class="rounded-sm" :ui="{ body: 'p-3 sm:p-3' }">
            <template #header>
              <div class="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 class="text-sm font-semibold text-highlighted">
                    账龄与账龄快照
                  </h3>
                  <p class="mt-0.5 text-xs text-muted">
                    截止日变化会重算账龄快照；历史快照保留生成时点金额，便于前后核对同一余额口径。
                  </p>
                </div>
                <UBadge
                  :label="'截止日 ' + (agingCutoff || '未选择')"
                  color="neutral"
                  variant="subtle"
                  size="sm"
                  data-testid="aging-cutoff-badge"
                />
              </div>
            </template>
            <div class="space-y-3 p-3">
              <div class="flex flex-wrap items-end gap-3">
                <UTabs
                  v-model="agingKind"
                  :items="agingKindItems"
                  :content="false"
                  size="sm"
                  data-testid="aging-kind-tabs"
                />
                <div class="space-y-1">
                  <p class="text-xs text-muted">
                    账龄截止日
                  </p>
                  <UInput
                    v-model="agingCutoff"
                    type="date"
                    size="sm"
                    class="w-40"
                    :min="reportingMinDate"
                    :max="reportingMaxDate"
                    aria-label="账龄截止日"
                    data-testid="aging-cutoff"
                  />
                </div>
                <div class="space-y-1">
                  <p class="text-xs text-muted">
                    账龄快照
                  </p>
                  <USelect
                    v-model="activeSnapshotId"
                    :items="snapshotOptions"
                    size="sm"
                    class="w-72"
                    data-testid="aging-snapshot-select"
                  />
                </div>
                <UButton
                  label="重算快照"
                  icon="i-carbon-calculator"
                  color="primary"
                  variant="soft"
                  size="sm"
                  data-testid="aging-recalculate"
                  @click="recalculateAgingSnapshot"
                />
              </div>

              <div
                v-if="activeSnapshot"
                class="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-sm border border-default px-3 py-2"
                data-testid="aging-snapshot-meta"
              >
                <span class="text-xs text-muted">快照：{{ activeSnapshotLabel }}</span>
                <span class="text-xs text-muted">生成时间：{{ activeSnapshot.generatedAt }}</span>
                <span class="text-xs text-muted">截止日：{{ activeSnapshot.cutoff }}</span>
                <span v-if="activeSnapshot.note" class="text-xs text-muted">{{ activeSnapshot.note }}</span>
              </div>
              <UAlert
                v-if="agingCutoffError"
                color="error"
                variant="soft"
                icon="i-carbon-warning-alt"
                :title="agingCutoffError"
                description="请选择水位日之前的有效截止日，快照与明细账均按该截止日重算。"
                data-testid="aging-cutoff-error"
              />
              <UAlert
                v-else-if="snapshotDiff?.mismatch"
                color="warning"
                variant="soft"
                icon="i-carbon-information"
                title="快照存照与按截止日重算存在差异"
                :description="snapshotDiffText"
                data-testid="aging-diff-alert"
              />
              <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <div class="rounded-sm border border-default px-3 py-2" data-testid="aging-snapshot-receivable">
                  <p class="text-xs text-muted">
                    快照应收余额
                  </p>
                  <p class="mt-1 text-lg font-semibold text-highlighted">
                    {{ formatMoney(activeSnapshot?.receivableTotal ?? 0) }}
                  </p>
                </div>
                <div class="rounded-sm border border-default px-3 py-2" data-testid="aging-snapshot-payable">
                  <p class="text-xs text-muted">
                    快照应付余额
                  </p>
                  <p class="mt-1 text-lg font-semibold text-highlighted">
                    {{ formatMoney(activeSnapshot?.payableTotal ?? 0) }}
                  </p>
                </div>
                <div class="rounded-sm border border-default px-3 py-2" data-testid="aging-live-receivable">
                  <p class="text-xs text-muted">
                    按截止日重算应收
                  </p>
                  <p class="mt-1 text-lg font-semibold text-highlighted">
                    {{ formatMoney(liveAgingTotals.receivable) }}
                  </p>
                </div>
                <div class="rounded-sm border border-default px-3 py-2" data-testid="aging-live-payable">
                  <p class="text-xs text-muted">
                    按截止日重算应付
                  </p>
                  <p class="mt-1 text-lg font-semibold text-highlighted">
                    {{ formatMoney(liveAgingTotals.payable) }}
                  </p>
                </div>
              </div>
            </div>
          </UCard>

          <UCard class="rounded-sm" :ui="{ body: 'p-0 sm:p-0' }">
            <template #header>
              <div class="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 class="text-sm font-semibold text-highlighted">
                    {{ agingKindLongLabel }}分档
                  </h3>
                  <p class="mt-0.5 text-xs text-muted">
                    未到期与 1-30 / 31-60 / 61-90 / 90 天以上五档，金额按截止日重算。
                  </p>
                </div>
                <UBadge
                  :label="'共 ' + agingBucketRows.reduce((sum, row) => sum + row.count, 0) + ' 笔'"
                  color="neutral"
                  variant="subtle"
                  size="sm"
                  data-testid="aging-bucket-count"
                />
              </div>
            </template>
            <div class="p-3">
              <ResizableTable
                :data="agingBucketRows"
                :columns="agingColumns"
                class="nx-table"
                data-testid="aging-bucket-table"
              >
                <template #label-cell="{ row }">
                  <span class="font-medium text-highlighted">{{ row.original.label }}</span>
                </template>
                <template #count-cell="{ row }">
                  {{ row.original.count }}
                </template>
                <template #amount-cell="{ row }">
                  {{ formatMoney(row.original.amount) }}
                </template>
                <template #share-cell="{ row }">
                  {{ shareOfTotal(row.original.amount) }}
                </template>
              </ResizableTable>
              <div
                class="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-sm border border-default px-3 py-2"
                data-testid="aging-bucket-total"
              >
                <span class="text-sm font-semibold text-highlighted">合计</span>
                <span class="text-sm font-semibold text-highlighted">
                  {{ formatMoney(agingBucketTotal) }}
                </span>
              </div>
            </div>
          </UCard>

          <UCard class="rounded-sm" :ui="{ body: 'p-0 sm:p-0' }">
            <template #header>
              <div class="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 class="text-sm font-semibold text-highlighted">
                    账龄明细
                  </h3>
                  <p class="mt-0.5 text-xs text-muted">
                    按挂账日期不晚于截止日的单据逐笔列示，逾期天数按到期日与截止日计算。
                  </p>
                </div>
                <UBadge
                  :label="agingKindLongLabel"
                  color="info"
                  variant="subtle"
                  size="sm"
                  data-testid="aging-detail-kind"
                />
              </div>
            </template>
            <div class="p-3">
              <ResizableTable
                :data="agingDetailRows"
                :columns="agingDetailColumns"
                class="nx-table"
                data-testid="aging-detail-table"
              >
                <template #partnerName-cell="{ row }">
                  <span class="font-medium text-highlighted">{{ row.original.partnerName }}</span>
                </template>
                <template #overdueDays-cell="{ row }">
                  <UBadge
                    :label="row.original.overdueDays > 0 ? row.original.overdueDays + ' 天' : '未逾期'"
                    :color="row.original.overdueDays > 0 ? 'warning' : 'success'"
                    variant="subtle"
                    size="sm"
                  />
                </template>
                <template #bucketLabel-cell="{ row }">
                  {{ row.original.bucketLabel }}
                </template>
                <template #amount-cell="{ row }">
                  {{ formatMoney(row.original.amount) }}
                </template>
              </ResizableTable>
              <UEmpty
                v-if="agingDetailRows.length === 0"
                icon="i-carbon-document"
                title="截至当前截止日没有账龄明细"
                description="请调整账龄截止日或切换应收 / 应付类型后重试。"
                data-testid="aging-empty"
              />
            </div>
          </UCard>

          <UCard class="rounded-sm" :ui="{ body: 'p-3 sm:p-3' }">
            <template #header>
              <div class="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 class="text-sm font-semibold text-highlighted">
                    客户 / 供应商明细账
                  </h3>
                  <p class="mt-0.5 text-xs text-muted">
                    支持日期区间、期初 / 期末余额、逐笔增加减少与单据回跳；固定算例回跳前后使用同一期间与余额口径。
                  </p>
                </div>
                <div class="flex flex-wrap items-center gap-2">
                  <UTabs
                    v-model="ledgerKind"
                    :items="ledgerKindItems"
                    :content="false"
                    size="sm"
                    data-testid="ledger-kind-tabs"
                  />
                  <UInput
                    v-model="ledgerStart"
                    type="date"
                    size="sm"
                    class="w-36"
                    :min="currentPeriod.start"
                    :max="periodEndDate"
                    aria-label="明细账开始日期"
                    data-testid="ledger-start"
                  />
                  <span class="text-xs text-muted">至</span>
                  <UInput
                    v-model="ledgerEnd"
                    type="date"
                    size="sm"
                    class="w-36"
                    :min="currentPeriod.start"
                    :max="periodEndDate"
                    aria-label="明细账结束日期"
                    data-testid="ledger-end"
                  />
                </div>
              </div>
            </template>
            <div class="space-y-3 p-3">
              <UAlert
                v-if="ledgerRangeError"
                color="error"
                variant="soft"
                icon="i-carbon-warning-alt"
                :title="ledgerRangeError"
                description="请修正日期区间后再核对期初 / 期末余额。"
                data-testid="ledger-range-error"
              />
              <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <div class="rounded-sm border border-default px-3 py-2" data-testid="ledger-totals-opening">
                  <p class="text-xs text-muted">
                    期初余额
                  </p>
                  <p class="mt-1 text-lg font-semibold text-highlighted">
                    {{ formatMoney(ledgerTotals.opening) }}
                  </p>
                </div>
                <div class="rounded-sm border border-default px-3 py-2" data-testid="ledger-totals-increase">
                  <p class="text-xs text-muted">
                    本期增加
                  </p>
                  <p class="mt-1 text-lg font-semibold text-success">
                    {{ formatMoney(ledgerTotals.increase) }}
                  </p>
                </div>
                <div class="rounded-sm border border-default px-3 py-2" data-testid="ledger-totals-decrease">
                  <p class="text-xs text-muted">
                    本期减少
                  </p>
                  <p class="mt-1 text-lg font-semibold text-error">
                    {{ formatMoney(ledgerTotals.decrease) }}
                  </p>
                </div>
                <div class="rounded-sm border border-default px-3 py-2" data-testid="ledger-totals-closing">
                  <p class="text-xs text-muted">
                    期末余额
                  </p>
                  <p class="mt-1 text-lg font-semibold text-highlighted">
                    {{ formatMoney(ledgerTotals.closing) }}
                  </p>
                </div>
              </div>
              <ResizableTable
                :data="ledgerRows"
                :columns="ledgerColumns"
                class="nx-table"
                data-testid="ledger-table"
              >
                <template #date-cell="{ row }">
                  <span :class="row.original.type === 'entry' ? 'text-default' : 'font-medium text-highlighted'">
                    {{ row.original.date }}
                  </span>
                </template>
                <template #docId-cell="{ row }">
                  <UButton
                    v-if="row.original.type === 'entry'"
                    :label="row.original.docId"
                    color="primary"
                    variant="link"
                    size="xs"
                    :data-testid="'ledger-doc-link-' + row.original.id"
                    @click.stop="jumpToDocument(row.original)"
                  />
                  <span v-else class="text-xs text-muted">—</span>
                </template>
                <template #docType-cell="{ row }">
                  <UBadge
                    v-if="row.original.docType"
                    :label="reportingLedgerDocTypeLabels[row.original.docType]"
                    color="neutral"
                    variant="subtle"
                    size="sm"
                  />
                  <span v-else class="text-xs text-muted">期初 / 期末</span>
                </template>
                <template #summary-cell="{ row }">
                  <span :class="row.original.type === 'entry' ? 'text-default' : 'font-medium text-highlighted'">
                    {{ row.original.summary }}
                  </span>
                </template>
                <template #increase-cell="{ row }">
                  <span :class="row.original.increase > 0 ? 'text-success' : 'text-muted'">
                    {{ row.original.increase > 0 ? formatMoney(row.original.increase) : '—' }}
                  </span>
                </template>
                <template #decrease-cell="{ row }">
                  <span :class="row.original.decrease > 0 ? 'text-error' : 'text-muted'">
                    {{ row.original.decrease > 0 ? formatMoney(row.original.decrease) : '—' }}
                  </span>
                </template>
                <template #balance-cell="{ row }">
                  <span class="font-medium text-highlighted">{{ formatMoney(row.original.balance) }}</span>
                </template>
                <template #docActions-cell="{ row }">
                  <UButton
                    v-if="row.original.type === 'entry'"
                    label="单据详情"
                    color="neutral"
                    variant="outline"
                    size="xs"
                    :data-testid="'ledger-doc-detail-' + row.original.id"
                    @click.stop="openLedgerDocument(row.original)"
                  />
                  <span v-else class="text-xs text-muted">—</span>
                </template>
              </ResizableTable>
              <UEmpty
                v-if="ledgerRows.length === 0"
                icon="i-carbon-notebook"
                title="当前区间没有明细账记录"
                description="请调整明细账类型或日期区间，期初 / 期末余额会按同一口径重新计算。"
                data-testid="ledger-empty"
              />
            </div>
          </UCard>
        </div>

        <div v-else class="space-y-3" data-testid="reporting-panel-equity">
          <UCard class="rounded-sm" :ui="{ body: 'p-3 sm:p-3' }">
            <template #header>
              <div class="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 class="text-sm font-semibold text-highlighted">
                    所有者权益变动与单年度合伙权益
                  </h3>
                  <p class="mt-0.5 text-xs text-muted">
                    权益变动表沿用当前期间 {{ currentPeriod.label }} 与过账水位 W-{{ currentPeriod.watermark }}；合伙人明细按 2026 年度汇总。
                  </p>
                </div>
                <div class="flex flex-wrap items-center gap-2">
                  <USelect
                    v-model="equityYear"
                    :items="equityYearOptions"
                    size="sm"
                    class="w-32"
                    data-testid="reporting-equity-year"
                  />
                  <UButton
                    label="查看权益变动表"
                    icon="i-carbon-table"
                    color="primary"
                    variant="soft"
                    size="sm"
                    data-testid="reporting-open-equity-statement"
                    @click="openEquityStatement"
                  />
                </div>
              </div>
            </template>
            <div class="grid gap-3 p-3 sm:grid-cols-2 xl:grid-cols-4">
              <div class="rounded-sm border border-default px-3 py-2" data-testid="reporting-equity-opening">
                <p class="text-xs text-muted">
                  期初未分配利润
                </p>
                <p class="mt-1 text-lg font-semibold text-highlighted">
                  {{ formatMoney(equityMonth.openingRetained) }}
                </p>
              </div>
              <div class="rounded-sm border border-default px-3 py-2" data-testid="reporting-equity-net-profit">
                <p class="text-xs text-muted">
                  本期净利润
                </p>
                <p class="mt-1 text-lg font-semibold text-success">
                  {{ formatMoney(equityMonth.netProfit) }}
                </p>
              </div>
              <div class="rounded-sm border border-default px-3 py-2" data-testid="reporting-equity-distribution">
                <p class="text-xs text-muted">
                  本期利润分配
                </p>
                <p class="mt-1 text-lg font-semibold text-error">
                  {{ formatMoney(equityMonth.distribution) }}
                </p>
              </div>
              <div class="rounded-sm border border-default px-3 py-2" data-testid="reporting-equity-closing">
                <p class="text-xs text-muted">
                  期末未分配利润
                </p>
                <p class="mt-1 text-lg font-semibold text-highlighted">
                  {{ formatMoney(equityMonth.openingRetained + equityMonth.netProfit - equityMonth.distribution) }}
                </p>
              </div>
            </div>
          </UCard>

          <UCard class="rounded-sm" :ui="{ body: 'p-0 sm:p-0' }">
            <template #header>
              <div class="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 class="text-sm font-semibold text-highlighted">
                    单年度合伙权益明细
                  </h3>
                  <p class="mt-0.5 text-xs text-muted">
                    按合伙人列示认缴出资、期初权益、净利润分配、利润分配与期末权益。
                  </p>
                </div>
                <USelect
                  v-model="equityPartnerKey"
                  :items="equityPartnerOptions"
                  size="sm"
                  class="w-52"
                  data-testid="reporting-equity-partner-filter"
                />
              </div>
            </template>
            <div class="p-3">
              <ResizableTable
                :data="equityPartnerRows"
                :columns="equityPartnerColumns"
                class="nx-table"
                data-testid="reporting-equity-partner-table"
                :row-activate="openPartner"
              >
                <template #name-cell="{ row }">
                  <UButton
                    :label="row.original.name"
                    color="primary"
                    variant="link"
                    size="xs"
                    :data-testid="'reporting-partner-open-' + row.original.id"
                    @click.stop="openPartner(row.original)"
                  />
                </template>
                <template #role-cell="{ row }">
                  <UBadge
                    :label="row.original.role"
                    color="neutral"
                    variant="subtle"
                    size="sm"
                  />
                </template>
                <template #sharePct-cell="{ row }">
                  {{ row.original.sharePct }}%
                </template>
                <template #capital-cell="{ row }">
                  {{ formatMoney(row.original.capital) }}
                </template>
                <template #openingEquity-cell="{ row }">
                  {{ formatMoney(row.original.openingEquity) }}
                </template>
                <template #netProfitShare-cell="{ row }">
                  {{ formatMoney(row.original.netProfitShare) }}
                </template>
                <template #distribution-cell="{ row }">
                  {{ formatMoney(row.original.distribution) }}
                </template>
                <template #closingEquity-cell="{ row }">
                  <span class="font-semibold text-highlighted">{{ formatMoney(row.original.closingEquity) }}</span>
                </template>
              </ResizableTable>
              <div
                class="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-sm border border-default px-3 py-2"
                data-testid="reporting-equity-partner-totals"
              >
                <span class="text-sm font-semibold text-highlighted">合计</span>
                <span class="text-xs text-muted">
                  认缴出资 {{ formatMoney(equityPartnerTotals.capital) }} · 期初权益 {{ formatMoney(equityPartnerTotals.openingEquity) }}
                  · 净利润分配 {{ formatMoney(equityPartnerTotals.netProfitShare) }} · 利润分配 {{ formatMoney(equityPartnerTotals.distribution) }}
                  · 期末权益 {{ formatMoney(equityPartnerTotals.closingEquity) }}
                </span>
              </div>
            </div>
          </UCard>

          <UCard class="rounded-sm" :ui="{ body: 'p-0 sm:p-0' }">
            <template #header>
              <div class="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 class="text-sm font-semibold text-highlighted">
                    报告导出记录
                  </h3>
                  <p class="mt-0.5 text-xs text-muted">
                    导出记录保留报表期间、过账水位与生成时间；重建时沿用原快照与水位。
                  </p>
                </div>
                <div class="flex flex-wrap items-center gap-2">
                  <UInput
                    v-model="exportSearch"
                    icon="i-carbon-search"
                    size="sm"
                    class="w-52"
                    placeholder="搜索记录 / 报表 / 快照"
                    aria-label="搜索导出记录"
                    data-testid="reporting-export-search"
                  />
                  <UButton
                    label="按当前条件导出"
                    icon="i-carbon-download"
                    color="primary"
                    size="sm"
                    :loading="exportBusy"
                    :disabled="Boolean(rangeError)"
                    data-testid="reporting-export-create"
                    @click="createExport"
                  />
                </div>
              </div>
            </template>
            <div class="p-3">
              <ResizableTable
                :data="filteredExports"
                :columns="exportColumns"
                class="nx-table"
                data-testid="reporting-export-table"
              >
                <template #statement-cell="{ row }">
                  {{ reportingStatementLabels[row.original.statement] }}
                </template>
                <template #basis-cell="{ row }">
                  {{ reportingExportBasisLabels[row.original.basis] }}
                </template>
                <template #status-cell="{ row }">
                  <div class="space-y-1">
                    <UBadge
                      :label="reportingExportStatusLabels[row.original.status]"
                      :color="reportingExportStatusColors[row.original.status]"
                      variant="subtle"
                      size="sm"
                    />
                    <p v-if="row.original.failureReason" class="text-[11px] text-error">
                      {{ row.original.failureReason }}
                    </p>
                    <p v-else-if="row.original.rebuiltFrom" class="text-[11px] text-muted">
                      已按快照 {{ row.original.rebuiltFrom }} 重建
                    </p>
                  </div>
                </template>
                <template #exportActions-cell="{ row }">
                  <div class="flex items-center gap-1">
                    <UButton
                      label="下载"
                      color="neutral"
                      variant="outline"
                      size="xs"
                      :disabled="row.original.status !== 'ready'"
                      :data-testid="'reporting-export-download-' + row.original.id"
                      @click.stop="downloadExportRecord(row.original)"
                    />
                    <UButton
                      v-if="row.original.status === 'failed'"
                      label="重建"
                      color="warning"
                      variant="soft"
                      size="xs"
                      :data-testid="'reporting-export-rebuild-' + row.original.id"
                      @click.stop="rebuildExport(row.original)"
                    />
                  </div>
                </template>
              </ResizableTable>
              <UEmpty
                v-if="filteredExports.length === 0"
                icon="i-carbon-document-blank"
                title="没有匹配的导出记录"
                description="请调整搜索关键字，或按当前报表条件创建新的导出记录。"
                data-testid="reporting-export-empty"
              />
            </div>
          </UCard>
        </div>
      </div>
    </UCard>

    <UModal v-model:open="previewOpen" :ui="{ content: 'w-full sm:max-w-3xl' }">
      <template #header>
        <div>
          <h3 class="text-sm font-semibold text-highlighted">
            报告预览
          </h3>
          <p class="mt-0.5 text-xs text-muted">
            预览与导出沿用同一报表期间、日期区间与过账水位。
          </p>
        </div>
      </template>
      <template #body>
        <div v-if="previewResult" class="space-y-3">
          <div class="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <div class="rounded-sm border border-default px-3 py-2" data-testid="reporting-preview-period">
              <p class="text-xs text-muted">
                报表期间
              </p>
              <p class="mt-1 text-sm font-semibold text-highlighted">
                {{ currentPeriod.label }}
              </p>
            </div>
            <div class="rounded-sm border border-default px-3 py-2" data-testid="reporting-preview-watermark">
              <p class="text-xs text-muted">
                过账水位
              </p>
              <p class="mt-1 text-sm font-semibold text-highlighted">
                W-{{ previewResult.watermark }}
              </p>
            </div>
            <div class="rounded-sm border border-default px-3 py-2" data-testid="reporting-preview-basis">
              <p class="text-xs text-muted">
                核算口径
              </p>
              <p class="mt-1 text-sm font-semibold text-highlighted">
                {{ previewResult.basisLabel }}
              </p>
            </div>
            <div class="rounded-sm border border-default px-3 py-2" data-testid="reporting-preview-range">
              <p class="text-xs text-muted">
                日期区间
              </p>
              <p class="mt-1 text-sm font-semibold text-highlighted">
                {{ previewResult.rangeLabel }}
              </p>
            </div>
          </div>
          <p class="text-xs text-muted">
            {{ previewResult.title }} · {{ previewResult.subtitle }} · 生成时间 {{ previewResult.generatedAt }}
          </p>
          <ResizableTable
            :data="previewResult.rows"
            :columns="previewColumns"
            class="nx-table"
            data-testid="reporting-preview-table"
          >
            <template #periodAmount-cell="{ row }">
              {{ formatMoney(row.original.periodAmount) }}
            </template>
            <template #compareAmount-cell="{ row }">
              {{ row.original.compareAmount == null ? '—' : formatMoney(row.original.compareAmount) }}
            </template>
          </ResizableTable>
          <UEmpty
            v-if="previewResult.rows.length === 0"
            icon="i-carbon-table"
            title="预览没有报表行"
            description="当前报表与日期区间下没有可预览数据，请回到报表参数调整后重试。"
            data-testid="reporting-preview-empty"
          />
        </div>
      </template>
      <template #footer>
        <div class="flex w-full items-center justify-end gap-2">
          <UButton
            label="关闭"
            color="neutral"
            variant="ghost"
            size="sm"
            data-testid="reporting-preview-close"
            @click="previewOpen = false"
          />
          <UButton
            label="下载 CSV"
            icon="i-carbon-download"
            color="primary"
            size="sm"
            :disabled="!previewResult"
            data-testid="reporting-preview-download"
            @click="downloadPreview"
          />
        </div>
      </template>
    </UModal>

    <USlideover v-model:open="drillOpen" :ui="{ content: 'w-full sm:max-w-2xl' }">
      <template #header>
        <div>
          <h3 class="text-sm font-semibold text-highlighted">
            报表行钻取 · 凭证与分录
          </h3>
          <p class="mt-0.5 text-xs text-muted">
            {{ drillRowLabel }} · 报表金额 {{ formatMoney(drillAmount) }}
          </p>
        </div>
      </template>
      <template #body>
        <div class="space-y-3">
          <UAlert
            color="info"
            variant="soft"
            icon="i-carbon-information"
            title="口径说明"
            :description="drillBasisNote"
            data-testid="reporting-drill-basis-note"
          />
          <template v-if="drillVouchers.length > 0">
            <div class="flex flex-wrap items-center gap-2">
              <span class="text-xs text-muted">关联凭证：</span>
              <UButton
                v-for="voucher in drillVouchers"
                :key="voucher.id"
                :label="voucher.id"
                :color="voucher.id === drillVoucherId ? 'primary' : 'neutral'"
                :variant="voucher.id === drillVoucherId ? 'soft' : 'outline'"
                size="xs"
                :data-testid="'reporting-drill-voucher-' + voucher.id"
                @click="selectDrillVoucher(voucher.id)"
              />
            </div>
            <div v-if="activeDrillVoucher" class="space-y-2">
              <div class="grid gap-2 sm:grid-cols-2">
                <div class="rounded-sm border border-default px-3 py-2" data-testid="reporting-drill-voucher-id">
                  <p class="text-xs text-muted">
                    凭证号
                  </p>
                  <p class="mt-1 text-sm font-semibold text-highlighted">
                    {{ activeDrillVoucher.id }}
                  </p>
                </div>
                <div class="rounded-sm border border-default px-3 py-2" data-testid="reporting-drill-date">
                  <p class="text-xs text-muted">
                    凭证日期
                  </p>
                  <p class="mt-1 text-sm font-semibold text-highlighted">
                    {{ activeDrillVoucher.date }}
                  </p>
                </div>
                <div class="rounded-sm border border-default px-3 py-2" data-testid="reporting-drill-period">
                  <p class="text-xs text-muted">
                    会计期间
                  </p>
                  <p class="mt-1 text-sm font-semibold text-highlighted">
                    {{ activeDrillVoucher.period }}
                  </p>
                </div>
                <div class="rounded-sm border border-default px-3 py-2" data-testid="reporting-drill-status">
                  <p class="text-xs text-muted">
                    凭证状态
                  </p>
                  <UBadge
                    class="mt-1"
                    :label="reportingVoucherStatusLabels[activeDrillVoucher.status]"
                    :color="reportingVoucherStatusColors[activeDrillVoucher.status]"
                    variant="subtle"
                    size="sm"
                  />
                </div>
              </div>
              <div class="rounded-sm border border-default px-3 py-2" data-testid="reporting-drill-summary">
                <p class="text-xs text-muted">
                  摘要
                </p>
                <p class="mt-1 text-sm text-default">
                  {{ activeDrillVoucher.description }}
                </p>
                <p class="mt-1 text-[11px] text-muted">
                  制单 {{ activeDrillVoucher.preparedBy }} · 过账 {{ activeDrillVoucher.postedAt }} · 已过账凭证保持原值
                </p>
              </div>
              <ResizableTable
                :data="activeDrillVoucher.lines"
                :columns="voucherLineColumns"
                class="nx-table"
                data-testid="reporting-drill-lines"
              >
                <template #debit-cell="{ row }">
                  {{ row.original.debit > 0 ? formatMoney(row.original.debit) : '—' }}
                </template>
                <template #credit-cell="{ row }">
                  {{ row.original.credit > 0 ? formatMoney(row.original.credit) : '—' }}
                </template>
              </ResizableTable>
              <div class="flex flex-wrap items-center justify-end gap-4 rounded-sm border border-default px-3 py-2">
                <span class="text-xs text-muted" data-testid="reporting-drill-debit-total">
                  借方合计 {{ formatMoney(drillDebitTotal) }}
                </span>
                <span class="text-xs text-muted" data-testid="reporting-drill-credit-total">
                  贷方合计 {{ formatMoney(drillCreditTotal) }}
                </span>
              </div>
            </div>
          </template>
          <UEmpty
            v-else
            icon="i-carbon-document"
            title="该报表行没有可直接钻取的凭证"
            description="汇总行或计算行不直接挂凭证，请关闭后选择带凭证来源的明细行。"
            data-testid="reporting-drill-empty"
          />
        </div>
      </template>
    </USlideover>

    <USlideover v-model:open="ledgerDocOpen" :ui="{ content: 'w-full sm:max-w-lg' }">
      <template #header>
        <div>
          <h3 class="text-sm font-semibold text-highlighted">
            单据详情
          </h3>
          <p class="mt-0.5 text-xs text-muted">
            回跳前确认单据信息，返回后继续用同一期间与截止日核对余额。
          </p>
        </div>
      </template>
      <template #body>
        <div v-if="ledgerDoc" class="space-y-1" data-testid="ledger-document-slideover">
          <div class="flex items-center justify-between border-b border-default py-2">
            <span class="text-xs text-muted">单据编号</span>
            <span class="text-sm font-semibold text-highlighted">{{ ledgerDoc.id }}</span>
          </div>
          <div class="flex items-center justify-between border-b border-default py-2">
            <span class="text-xs text-muted">单据类型</span>
            <UBadge
              :label="reportingLedgerDocTypeLabels[ledgerDoc.docType]"
              color="neutral"
              variant="subtle"
              size="sm"
            />
          </div>
          <div class="flex items-center justify-between border-b border-default py-2">
            <span class="text-xs text-muted">往来单位</span>
            <span class="text-sm text-default">{{ ledgerDoc.partnerName }}</span>
          </div>
          <div class="flex items-center justify-between border-b border-default py-2">
            <span class="text-xs text-muted">单据日期</span>
            <span class="text-sm text-default">{{ ledgerDoc.date }}</span>
          </div>
          <div class="flex items-center justify-between border-b border-default py-2">
            <span class="text-xs text-muted">单据金额</span>
            <span class="text-sm font-semibold text-highlighted">{{ formatMoney(ledgerDoc.amount) }}</span>
          </div>
          <div class="flex items-center justify-between py-2">
            <span class="text-xs text-muted">状态</span>
            <UBadge
              :label="ledgerDoc.statusLabel"
              color="success"
              variant="subtle"
              size="sm"
            />
          </div>
          <UButton
            block
            :label="ledgerDoc.jumpLabel"
            icon="i-carbon-arrow-up-right"
            color="primary"
            size="sm"
            class="mt-2"
            data-testid="ledger-document-jump"
            @click="navigateLedgerDoc(ledgerDoc)"
          />
        </div>
      </template>
    </USlideover>

    <USlideover v-model:open="partnerOpen" :ui="{ content: 'w-full sm:max-w-lg' }">
      <template #header>
        <div>
          <h3 class="text-sm font-semibold text-highlighted">
            合伙人权益明细
          </h3>
          <p class="mt-0.5 text-xs text-muted">
            按 2026 年度列示出资与权益分配，金额保持同一期间口径。
          </p>
        </div>
      </template>
      <template #body>
        <div v-if="equityPartnerDetail" class="space-y-1" data-testid="reporting-partner-detail">
          <div class="flex items-center justify-between border-b border-default py-2">
            <span class="text-xs text-muted">合伙人</span>
            <span class="text-sm font-semibold text-highlighted">{{ equityPartnerDetail.name }}</span>
          </div>
          <div class="flex items-center justify-between border-b border-default py-2">
            <span class="text-xs text-muted">身份</span>
            <UBadge
              :label="equityPartnerDetail.role"
              color="neutral"
              variant="subtle"
              size="sm"
            />
          </div>
          <div class="flex items-center justify-between border-b border-default py-2">
            <span class="text-xs text-muted">权益份额</span>
            <span class="text-sm text-default">{{ equityPartnerDetail.sharePct }}%</span>
          </div>
          <div class="flex items-center justify-between border-b border-default py-2">
            <span class="text-xs text-muted">认缴出资</span>
            <span class="text-sm text-default">{{ formatMoney(equityPartnerDetail.capital) }}</span>
          </div>
          <div class="flex items-center justify-between border-b border-default py-2">
            <span class="text-xs text-muted">期初权益</span>
            <span class="text-sm text-default">{{ formatMoney(equityPartnerDetail.openingEquity) }}</span>
          </div>
          <div class="flex items-center justify-between border-b border-default py-2">
            <span class="text-xs text-muted">净利润分配</span>
            <span class="text-sm text-success">{{ formatMoney(equityPartnerDetail.netProfitShare) }}</span>
          </div>
          <div class="flex items-center justify-between border-b border-default py-2">
            <span class="text-xs text-muted">利润分配</span>
            <span class="text-sm text-error">{{ formatMoney(equityPartnerDetail.distribution) }}</span>
          </div>
          <div class="flex items-center justify-between py-2">
            <span class="text-xs text-muted">期末权益</span>
            <span class="text-sm font-semibold text-highlighted">{{ formatMoney(equityPartnerDetail.closingEquity) }}</span>
          </div>
        </div>
      </template>
    </USlideover>
  </div>
</template>

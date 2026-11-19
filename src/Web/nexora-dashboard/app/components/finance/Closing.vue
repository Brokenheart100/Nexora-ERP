<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { FinanceAccount, FinancePeriod, JournalEntry, JournalLine } from '~/mocks'
import { accountTypeLabels, financePeriodStatusColors, financePeriodStatusLabels } from '~/mocks'
import type {
  ChartAccountMeta,
  ClosingJournal,
  ClosingYearState,
  CostRecordSeed,
  PartnerShareSeed,
  PeriodHistoryEvent,
  ReadinessKey,
  ReadinessMeta,
  ReadinessStatus
} from '~/mocks/closing'
import {
  businessLinkOptions,
  chartAccountMeta,
  chartExtraAccounts,
  chartImportSample,
  chartTemplateAccounts,
  closingJournalSeeds,
  closingYearSeeds,
  costRecordSeeds,
  ledgerSeed,
  NEWLINE,
  openingBatchSeed,
  partnerShareByYear,
  partnerYearOptions,
  period2025Seeds,
  periodCheckMeta,
  periodHistorySeeds,
  pendingInventoryCost,
  readinessMeta,
  yearCarryoverLines
} from '~/mocks/closing'

const props = defineProps<{
  accounts: FinanceAccount[]
  periods: FinancePeriod[]
  journals: JournalEntry[]
  canPost: boolean
}>()

const toast = useToast()
const { actorRole, actor, isMaker, isApprover, setActorRole } = useDemoActor()

function money(value: string | number) {
  return formatMoney(Number(value))
}

function nowStamp() {
  const now = new Date()
  const pad = (value: number) => String(value).padStart(2, '0')
  return now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate()) + ' ' + pad(now.getHours()) + ':' + pad(now.getMinutes())
}

function today() {
  return new Date().toISOString().slice(0, 10)
}

function notify(title: string, description: string, color: 'success' | 'neutral' | 'warning' | 'error' = 'success', icon = 'i-carbon-checkmark') {
  toast.add({ title, description, color, icon })
}

function metaOf(key: ReadinessKey): ReadinessMeta {
  return readinessMeta.find(item => item.key === key) ?? readinessMeta[0]!
}

const tab = ref('readiness')
const tabItems = [
  { label: '工作台就绪', value: 'readiness', icon: 'i-carbon-task-complete' },
  { label: '凭证生命周期', value: 'journals', icon: 'i-carbon-document' },
  { label: '科目树治理', value: 'chart', icon: 'i-carbon-tree-view' },
  { label: '期间与年结', value: 'periods', icon: 'i-carbon-calendar' },
  { label: '合伙人', value: 'partners', icon: 'i-carbon-user-multiple' }
]

/* ---------------- 工作台就绪 ---------------- */

interface ReadinessRow {
  key: ReadinessKey
  label: string
  description: string
  status: ReadinessStatus
  detail: string
  meta: ReadinessMeta
}

const costRecords = ref<CostRecordSeed[]>(costRecordSeeds.map(record => ({ ...record })))
const costOpen = ref(false)
const costCutoff = ref(pendingInventoryCost.cutoffDate)
const costAmount = ref('42800')
const costSummary = ref('补记 2026-11 销售出库库存成本')
const costError = ref('')
const { loading: costSaving, run: runCostSave } = useMockAsync(async () => undefined, { delay: 420 })

const sourceOpen = ref(false)
const sourceKey = ref<ReadinessKey>('ledger')
const sourceMeta = computed(() => metaOf(sourceKey.value))

const journalRows = ref<ClosingJournal[]>([])

const postedUnlinked = computed(() => journalRows.value.filter(row => row.stage === 'posted' && !row.businessRef))
const pendingInventoryAmount = computed(() => estimatedInventoryCost())

function estimatedInventoryCost() {
  const total = costRecords.value.reduce((sum, record) => sum + Number(record.amount), 0)
  return Math.max(Number(pendingInventoryCost.amount) - total, 0).toFixed(2)
}

const readinessRows = computed<ReadinessRow[]>(() => {
  const ledgerStatus: ReadinessStatus = props.accounts.length > 0 ? 'pass' : 'blocked'
  return [
    {
      key: 'ledger',
      label: metaOf('ledger').label,
      description: metaOf('ledger').description,
      status: ledgerStatus,
      detail: ledgerStatus === 'pass'
        ? ledgerSeed.id + ' · ' + ledgerSeed.fiscalYear + ' 年度 · 科目版本 r' + ledgerSeed.chartRevision
        : '等待财务账套加载',
      meta: metaOf('ledger')
    },
    {
      key: 'opening',
      label: metaOf('opening').label,
      description: metaOf('opening').description,
      status: 'pass',
      detail: openingBatchSeed.id + ' · ' + openingBatchSeed.importedAt + ' 复核通过 · 借贷平衡',
      meta: metaOf('opening')
    },
    {
      key: 'vouchers',
      label: metaOf('vouchers').label,
      description: metaOf('vouchers').description,
      status: postedUnlinked.value.length > 0 ? 'blocked' : 'pass',
      detail: postedUnlinked.value.length > 0
        ? '已过账未关联业务凭证 ' + postedUnlinked.value.length + ' 张'
        : '全部已过账凭证均已关联业务来源',
      meta: metaOf('vouchers')
    },
    {
      key: 'inventory-cost',
      label: metaOf('inventory-cost').label,
      description: metaOf('inventory-cost').description,
      status: Number(estimatedInventoryCost()) > 0 ? 'blocked' : 'pass',
      detail: Number(estimatedInventoryCost()) > 0
        ? '待入账 ' + money(estimatedInventoryCost()) + ' · 截止 ' + pendingInventoryCost.cutoffDate
        : '本期库存成本已全部入账',
      meta: metaOf('inventory-cost')
    }
  ]
})

const readinessPassed = computed(() => readinessRows.value.filter(row => row.status === 'pass').length)

function openReadinessSource(key: ReadinessKey) {
  sourceKey.value = key
  sourceOpen.value = true
}

function openCostForm() {
  costError.value = ''
  costAmount.value = estimatedInventoryCost() === '0.00' ? '0' : estimatedInventoryCost()
  costOpen.value = true
}

async function saveCost() {
  costError.value = ''
  if (!props.canPost) {
    costError.value = '当前演示身份没有 finance.post 权限，无法补记库存成本。'
    return
  }
  if (!costCutoff.value) {
    costError.value = '请选择成本截止日期。'
    return
  }
  const amount = Number(costAmount.value)
  if (!Number.isFinite(amount) || amount <= 0) {
    costError.value = '请输入大于 0 的成本金额。'
    return
  }
  if (costSummary.value.trim().length === 0) {
    costError.value = '请填写补记摘要。'
    return
  }
  await runCostSave()
  costRecords.value = [
    {
      id: 'COST-2026-' + String(costRecords.value.length + 1).padStart(3, '0'),
      cutoffDate: costCutoff.value,
      amount: amount.toFixed(2),
      summary: costSummary.value.trim(),
      source: pendingInventoryCost.entries.map(entry => entry.ref).join(' / '),
      createdAt: nowStamp(),
      by: actor.value.name
    },
    ...costRecords.value
  ]
  costOpen.value = false
  notify('库存成本已补记', money(amount) + ' · 截止 ' + costCutoff.value + '；仅本次预览，刷新后恢复初始数据。', 'success', 'i-carbon-inventory-management')
}

/* ---------------- 凭证生命周期 ---------------- */

const journalDetailOpen = ref(false)
const selectedJournalId = ref('')
const journalError = ref('')
const scanDone = ref(false)
const linkDrafts = ref<Record<string, string>>({})

const selectedJournal = computed(() => journalRows.value.find(row => row.id === selectedJournalId.value) ?? null)

function mapPropJournal(entry: JournalEntry): ClosingJournal {
  const stage = entry.status as ClosingJournal['stage']
  const external = entry.source === 'external'
  return {
    id: entry.id,
    date: entry.date,
    period: entry.period,
    description: entry.description,
    stage,
    debitTotal: entry.debitTotal,
    creditTotal: entry.creditTotal,
    lines: entry.lines.map(line => ({ ...line })),
    preparedBy: '张明远',
    preparedById: 'u-1001',
    reviewer: stage === 'posted' || stage === 'reversed' ? '陈立' : undefined,
    postedAt: stage === 'posted' || stage === 'reversed' ? entry.date + ' 10:00' : undefined,
    sourceKind: external ? 'external' : 'manual',
    sourceLabel: external ? '外部导入 · ' + (entry.provider ?? '') + ' / ' + (entry.externalId ?? '') : '历史凭证 · ' + entry.id,
    businessRef: external ? 'EXT-' + (entry.externalId ?? entry.id) : 'HIST-' + entry.id
  }
}

function seedJournalRows() {
  const seedRows = closingJournalSeeds.map(seed => ({
    ...seed,
    lines: seed.lines.map(line => ({ ...line }))
  })) as ClosingJournal[]
  journalRows.value = seedRows
}

seedJournalRows()

watch(() => props.journals, (list) => {
  if (!list || list.length === 0) return
  const existing = new Set(journalRows.value.map(row => row.id))
  const additions = list.filter(entry => !existing.has(entry.id)).map(mapPropJournal)
  if (additions.length > 0) {
    journalRows.value = [...additions, ...journalRows.value]
  }
}, { immediate: true })

const journalColumns: TableColumn<ClosingJournal>[] = [
  { accessorKey: 'id', header: '凭证号', meta: { class: { td: 'whitespace-nowrap font-mono text-[12px]' } } },
  { accessorKey: 'date', header: '日期', meta: { class: { td: 'whitespace-nowrap text-xs' } } },
  { accessorKey: 'period', header: '期间', meta: { class: { td: 'whitespace-nowrap text-xs' } } },
  { accessorKey: 'description', header: '摘要' },
  { accessorKey: 'debitTotal', header: '借方合计', meta: { class: { th: 'text-right', td: 'text-right whitespace-nowrap tabular-nums' } } },
  { accessorKey: 'creditTotal', header: '贷方合计', meta: { class: { th: 'text-right', td: 'text-right whitespace-nowrap tabular-nums' } } },
  { accessorKey: 'stage', header: '状态', meta: { class: { th: 'w-24' } } },
  { accessorKey: 'businessRef', header: '业务关联', meta: { class: { th: 'w-24' } } },
  { id: 'actions', header: '操作', meta: { class: { th: 'w-56 text-right', td: 'text-right' } } }
]

const stageLabels: Record<ClosingJournal['stage'], string> = {
  draft: '草稿',
  submitted: '待复核',
  posted: '已过账',
  reversed: '已冲销'
}

const stageColors: Record<ClosingJournal['stage'], 'neutral' | 'info' | 'success' | 'warning' | 'error'> = {
  draft: 'neutral',
  submitted: 'warning',
  posted: 'success',
  reversed: 'warning'
}

function openJournalDetail(row: ClosingJournal) {
  selectedJournalId.value = row.id
  journalDetailOpen.value = true
}

function businessLabelOf(value: string) {
  return businessLinkOptions.find(option => option.value === value)?.label ?? value
}

function submitJournal(row: ClosingJournal) {
  journalError.value = ''
  if (!props.canPost) {
    journalError.value = '当前演示身份没有 finance.post 权限，无法提交复核。'
    return
  }
  if (row.stage !== 'draft') return
  journalRows.value = journalRows.value.map(item => item.id === row.id
    ? { ...item, stage: 'submitted', submittedAt: nowStamp(), preparedBy: actor.value.name, preparedById: actor.value.id }
    : item)
  notify('已提交复核', row.id + ' 等待独立复核人过账；仅本次预览，刷新后恢复初始数据。', 'success', 'i-carbon-send')
}

function cancelSubmit(row: ClosingJournal) {
  if (row.stage !== 'submitted') return
  journalRows.value = journalRows.value.map(item => item.id === row.id
    ? { ...item, stage: 'draft', submittedAt: undefined, reviewer: undefined }
    : item)
  notify('已撤回复核', row.id + ' 已回到草稿状态。', 'neutral', 'i-carbon-undo')
}

function postJournal(row: ClosingJournal) {
  journalError.value = ''
  if (!props.canPost) {
    journalError.value = '当前演示身份没有 finance.post 权限，无法过账。'
    return
  }
  if (row.stage !== 'submitted') {
    journalError.value = '只有待复核凭证可以过账。'
    return
  }
  if (!isApprover.value) {
    journalError.value = '复核人独立过账：请切换为业务主管身份后再过账。'
    notify('需要复核人身份', journalError.value, 'warning', 'i-carbon-user-role')
    return
  }
  if (row.preparedById === actor.value.id) {
    journalError.value = '制单人不能过账自己的凭证，请由独立复核人操作。'
    return
  }
  journalRows.value = journalRows.value.map(item => item.id === row.id
    ? { ...item, stage: 'posted', reviewer: actor.value.name, postedAt: nowStamp() }
    : item)
  notify('凭证已过账', row.id + ' · 复核人 ' + actor.value.name + '；仅本次预览。', 'success', 'i-carbon-checkmark-outline')
}

const editOpen = ref(false)
const editingId = ref('')
const editDate = ref('')
const editDescription = ref('')
const editLines = ref<JournalLine[]>([])
const editError = ref('')

function openEdit(row: ClosingJournal) {
  if (row.stage !== 'draft') return
  editingId.value = row.id
  editDate.value = row.date
  editDescription.value = row.description
  editLines.value = row.lines.map(line => ({ ...line }))
  editError.value = ''
  editOpen.value = true
}

function saveEdit() {
  editError.value = ''
  const editable = journalRows.value.find(row => row.id === editingId.value)
  if (!editable) return
  if (!props.canPost) {
    editError.value = '当前演示身份没有 finance.post 权限，无法编辑草稿。'
    return
  }
  if (!editDate.value) {
    editError.value = '请选择凭证日期。'
    return
  }
  if (editDescription.value.trim().length === 0) {
    editError.value = '请填写凭证摘要。'
    return
  }
  const debitTotal = editLines.value.reduce((sum, line) => sum + (Number(line.debit) || 0), 0)
  const creditTotal = editLines.value.reduce((sum, line) => sum + (Number(line.credit) || 0), 0)
  if (Math.abs(debitTotal - creditTotal) > 0.005) {
    editError.value = '借贷不平衡：借方 ' + money(debitTotal) + '，贷方 ' + money(creditTotal) + '。'
    return
  }
  journalRows.value = journalRows.value.map(item => item.id === editable.id
    ? {
        ...item,
        date: editDate.value,
        period: editDate.value.slice(0, 7),
        description: editDescription.value.trim(),
        debitTotal: debitTotal.toFixed(2),
        creditTotal: creditTotal.toFixed(2),
        lines: editLines.value.map(line => ({ ...line }))
      }
    : item)
  editOpen.value = false
  notify('草稿已保存', editable.id + ' 已更新；仅本次预览。', 'success', 'i-carbon-save')
}

const reverseOpen = ref(false)
const reversingId = ref('')
const reverseDate = ref('')
const reverseReason = ref('')
const reverseError = ref('')

function openReverse(row: ClosingJournal) {
  if (row.stage !== 'posted') return
  reversingId.value = row.id
  reverseDate.value = today()
  reverseReason.value = ''
  reverseError.value = ''
  reverseOpen.value = true
}

function saveReverse() {
  reverseError.value = ''
  const original = journalRows.value.find(row => row.id === reversingId.value)
  if (!original) return
  if (!props.canPost) {
    reverseError.value = '当前演示身份没有 finance.post 权限，无法冲销。'
    return
  }
  if (!isApprover.value) {
    reverseError.value = '冲销已过账凭证需要复核人身份，请切换为业务主管。'
    return
  }
  if (!reverseDate.value) {
    reverseError.value = '请选择冲销过账日期。'
    return
  }
  if (reverseReason.value.trim().length < 2) {
    reverseError.value = '请填写冲销原因（至少 2 个字）。'
    return
  }
  const reversalId = 'JE-RV-' + original.id.slice(3)
  const reversal: ClosingJournal = {
    id: reversalId,
    date: reverseDate.value,
    period: reverseDate.value.slice(0, 7),
    description: '冲销 ' + original.id + '：' + reverseReason.value.trim(),
    stage: 'posted',
    debitTotal: original.creditTotal,
    creditTotal: original.debitTotal,
    lines: original.lines.map(line => ({
      accountCode: line.accountCode,
      accountName: line.accountName,
      debit: line.credit,
      credit: line.debit
    })),
    preparedBy: actor.value.name,
    preparedById: actor.value.id,
    reviewer: actor.value.name,
    postedAt: nowStamp(),
    sourceKind: 'manual',
    sourceLabel: '冲销凭证 · 原凭证 ' + original.id,
    businessRef: original.businessRef,
    originalId: original.id,
    local: true
  }
  journalRows.value = [
    reversal,
    ...journalRows.value.map(item => item.id === original.id
      ? { ...item, stage: 'reversed', reversedAt: reverseDate.value, reversalId } as ClosingJournal
      : item)
  ]
  reverseOpen.value = false
  notify('已生成冲销凭证', reversalId + ' 已回链原凭证 ' + original.id + '；仅本次预览。', 'success', 'i-carbon-undo')
}

function openReversalOf(row: ClosingJournal) {
  const target = journalRows.value.find(item => item.id === row.reversalId)
  if (target) openJournalDetail(target)
}

function openOriginalOf(row: ClosingJournal) {
  const target = journalRows.value.find(item => item.id === row.originalId)
  if (target) openJournalDetail(target)
}

function runScan() {
  scanDone.value = true
  const count = journalRows.value.filter(row => row.stage === 'posted' && !row.businessRef).length
  notify('扫描完成', '已过账未关联业务凭证 ' + count + ' 张；请补齐业务关联。', count > 0 ? 'warning' : 'success', 'i-carbon-search')
}

const anomalies = computed(() => journalRows.value.filter(row => row.stage === 'posted' && !row.businessRef))

function linkBusiness(row: ClosingJournal) {
  journalError.value = ''
  const value = linkDrafts.value[row.id] ?? ''
  if (!value) {
    journalError.value = '请先选择要关联的业务单据。'
    return
  }
  const alreadyLinked = journalRows.value.find(item => item.id !== row.id && item.businessRef === value)
  if (alreadyLinked) {
    journalError.value = '业务单据 ' + businessLabelOf(value) + ' 已关联凭证 ' + alreadyLinked.id + '，不能重复关联。'
    return
  }
  journalRows.value = journalRows.value.map(item => item.id === row.id
    ? { ...item, businessRef: value, sourceLabel: '业务关联 · ' + businessLabelOf(value) }
    : item)
  linkDrafts.value = { ...linkDrafts.value, [row.id]: '' }
  notify('业务关联已补齐', row.id + ' → ' + businessLabelOf(value), 'success', 'i-carbon-link')
}

function unlinkBusiness(row: ClosingJournal) {
  journalRows.value = journalRows.value.map(item => item.id === row.id
    ? { ...item, businessRef: undefined }
    : item)
  scanDone.value = true
  notify('已移除业务关联', row.id + ' 重新进入异常扫描列表。', 'warning', 'i-carbon-unlink')
}

/* ---------------- 期间与年结 ---------------- */

const periodRows = ref<FinancePeriod[]>(period2025Seeds.map(period => ({ ...period })))
const periodHistory = ref<Record<string, PeriodHistoryEvent[]>>({ ...periodHistorySeeds })

watch(() => props.periods, (list) => {
  if (!list || list.length === 0) return
  const existing = new Set(periodRows.value.map(period => period.period))
  const additions = list.filter(period => !existing.has(period.period)).map(period => ({ ...period }))
  if (additions.length > 0) {
    periodRows.value = [...periodRows.value, ...additions]
  }
}, { immediate: true })

const periodRowsSorted = computed(() => periodRows.value.slice().sort((a, b) => b.period.localeCompare(a.period)))

const selectedPeriod = ref('')
const periodDrawerOpen = ref(false)
const periodError = ref('')
const selectedPeriodRow = computed(() => periodRows.value.find(period => period.period === selectedPeriod.value) ?? null)

function yearOf(period: string) {
  return Number(period.slice(0, 4))
}

const yearStates = ref<Record<number, ClosingYearState>>({
  2025: { ...(closingYearSeeds.find(item => item.year === 2025) ?? closingYearSeeds[0]!) },
  2026: { ...(closingYearSeeds.find(item => item.year === 2026) ?? closingYearSeeds[1]!) }
})

function yearStateOf(year: number) {
  return yearStates.value[year]
}

function isYearClosed(year: number) {
  return yearStateOf(year)?.status === 'closed'
}

function historyOf(period: string) {
  return periodHistory.value[period] ?? []
}

function periodJournals(period: string) {
  return journalRows.value.filter(row => row.period === period)
}

interface PeriodCheckRow {
  key: string
  label: string
  passed: boolean
  detail: string
}

function periodChecks(period: string): PeriodCheckRow[] {
  const rows = periodJournals(period)
  const pending = rows.filter(row => row.stage === 'draft' || row.stage === 'submitted')
  const unlinked = rows.filter(row => row.stage === 'posted' && !row.businessRef)
  const costMonth = pendingInventoryCost.cutoffDate.slice(0, 7)
  const costPosted = costRecords.value.some(record => record.cutoffDate.slice(0, 7) === costMonth)
  const year = yearOf(period)
  const month = Number(period.slice(5, 7))
  const priorPeriod = month > 1 ? String(year) + '-' + String(month - 1).padStart(2, '0') : ''
  const prior = priorPeriod.length > 0 ? periodRows.value.find(item => item.period === priorPeriod) : null
  return [
    {
      key: 'journal',
      label: periodCheckMeta[0]!.label,
      passed: pending.length === 0,
      detail: pending.length > 0 ? '仍有 ' + pending.length + ' 张草稿或待复核凭证' : '期间内凭证均已过账'
    },
    {
      key: 'business',
      label: periodCheckMeta[1]!.label,
      passed: unlinked.length === 0,
      detail: unlinked.length > 0 ? '已过账未关联业务 ' + unlinked.length + ' 张' : '业务关联完整'
    },
    {
      key: 'inventory',
      label: periodCheckMeta[2]!.label,
      passed: period !== costMonth || costPosted,
      detail: period === costMonth && !costPosted ? '待补记库存成本 ' + money(estimatedInventoryCost()) : '库存成本已入账'
    },
    {
      key: 'prior',
      label: periodCheckMeta[3]!.label,
      passed: !prior || prior.status === 'closed',
      detail: !prior
        ? '首个期间无需上期'
        : prior.status === 'closed'
          ? priorPeriod + ' 已关账'
          : priorPeriod + ' 尚未关账（' + financePeriodStatusLabels[prior.status] + '）'
    }
  ]
}

function addPeriodHistory(period: string, action: string, reason?: string) {
  const event: PeriodHistoryEvent = {
    id: 'ph-' + period + '-' + String(historyOf(period).length + 1),
    at: nowStamp(),
    action,
    actor: actor.value.name,
    reason
  }
  periodHistory.value = { ...periodHistory.value, [period]: [event, ...historyOf(period)] }
}

function updatePeriod(period: string, patch: Partial<FinancePeriod>) {
  periodRows.value = periodRows.value.map(item => item.period === period ? { ...item, ...patch } : item)
}

function openPeriod(period: string) {
  selectedPeriod.value = period
  periodError.value = ''
  periodDrawerOpen.value = true
}

function guardPeriodYear(period: string) {
  const year = yearOf(period)
  if (isYearClosed(year)) {
    periodError.value = year + ' 年度已年结，重开月份前请先在「期间与年结」重开 ' + year + ' 年度。'
    notify('需要先重开年度', periodError.value, 'error', 'i-carbon-locked')
    return false
  }
  return true
}

function startPeriodClosing(row: FinancePeriod) {
  periodError.value = ''
  if (!props.canPost) {
    periodError.value = '当前演示身份没有 finance.post 权限，无法开始关账。'
    return
  }
  if (row.status !== 'open') return
  updatePeriod(row.period, { status: 'closing' })
  addPeriodHistory(row.period, '开始关账')
  notify('已开始关账', row.period + ' 进入关账中，系统正在执行关账检查。', 'success', 'i-carbon-play')
}

function closePeriod(row: FinancePeriod) {
  periodError.value = ''
  if (!props.canPost) {
    periodError.value = '当前演示身份没有 finance.post 权限，无法关闭期间。'
    return
  }
  if (row.status !== 'closing') return
  if (!guardPeriodYear(row.period)) return
  const failed = periodChecks(row.period).filter(check => !check.passed)
  if (failed.length > 0) {
    periodError.value = '关账检查未通过：' + failed.map(check => check.label).join('、') + '。'
    notify('关账检查阻断', periodError.value, 'error', 'i-carbon-warning-alt')
    return
  }
  updatePeriod(row.period, { status: 'closed', closedAt: nowStamp() })
  addPeriodHistory(row.period, '清零关闭', '损益类科目余额已结转至本年利润')
  notify('期间已清零关闭', row.period + ' 已关账；仅本次预览，刷新后恢复初始数据。', 'success', 'i-carbon-locked')
}

function reopenClosingPeriod(row: FinancePeriod) {
  periodError.value = ''
  if (row.status !== 'closing') return
  updatePeriod(row.period, { status: 'open' })
  addPeriodHistory(row.period, '开启', '撤回关账中状态')
  notify('期间已开启', row.period + ' 已回到未关账状态。', 'neutral', 'i-carbon-unlocked')
}

const periodReopenOpen = ref(false)
const periodReopenReason = ref('')
const periodReopenError = ref('')
const reopeningPeriod = ref('')

function openPeriodReopen(row: FinancePeriod) {
  periodError.value = ''
  if (row.status !== 'closed') return
  reopeningPeriod.value = row.period
  periodReopenReason.value = ''
  periodReopenError.value = ''
  if (isYearClosed(yearOf(row.period))) {
    periodError.value = yearOf(row.period) + ' 年度已年结，重开月份前请先重开年度。'
    notify('需要先重开年度', periodError.value, 'error', 'i-carbon-locked')
    return
  }
  periodReopenOpen.value = true
}

function confirmPeriodReopen() {
  periodReopenError.value = ''
  if (isYearClosed(yearOf(reopeningPeriod.value))) {
    periodReopenError.value = yearOf(reopeningPeriod.value) + ' 年度已年结，请先重开年度后再重开月份。'
    return
  }
  if (periodReopenReason.value.trim().length < 2) {
    periodReopenError.value = '请填写重开原因（至少 2 个字）。'
    return
  }
  updatePeriod(reopeningPeriod.value, { status: 'open', closedAt: undefined })
  addPeriodHistory(reopeningPeriod.value, '原因重开', periodReopenReason.value.trim())
  periodReopenOpen.value = false
  notify('期间已重开', reopeningPeriod.value + ' 已恢复未关账；原因已记录到状态历史。', 'success', 'i-carbon-unlocked')
}

const selectedYear = ref(2026)
const yearSelectItems = [
  { label: '2026 年度', value: '2026' },
  { label: '2025 年度', value: '2025' }
]
const selectedYearModel = computed({
  get: () => String(selectedYear.value),
  set: (value: string) => {
    selectedYear.value = Number(value)
  }
})
const yearError = ref('')
const yearPreviewOpen = ref(false)
const yearJournalOpen = ref(false)
const yearJournalTitle = ref('')
const yearJournalId = ref('')
const yearJournalLines = ref<JournalLine[]>([])

const selectedYearState = computed(() => yearStateOf(selectedYear.value))
const yearPeriodRows = computed(() => periodRows.value.filter(period => yearOf(period.period) === selectedYear.value))
const yearClosedPeriods = computed(() => yearPeriodRows.value.filter(period => period.status === 'closed').length)
const yearPartnerShares = computed(() => partnerDrafts.value[selectedYear.value] ?? [])
const yearPartnerTotal = computed(() => yearPartnerShares.value.reduce((sum, row) => sum + Number(row.share || 0), 0))

const yearChecks = computed(() => [
  {
    key: 'periods',
    label: '期间已全部关账',
    passed: yearPeriodRows.value.length > 0 && yearClosedPeriods.value === yearPeriodRows.value.length,
    detail: yearClosedPeriods.value + ' / ' + yearPeriodRows.value.length + ' 个期间已关账'
  },
  {
    key: 'partner',
    label: '合伙人份额合计 100%',
    passed: yearPartnerTotal.value === 100,
    detail: '当前合计 ' + yearPartnerTotal.value + '%'
  },
  {
    key: 'request',
    label: '年结申请状态',
    passed: selectedYearState.value?.status !== 'open',
    detail: selectedYearState.value?.status === 'open' ? '尚未提交年结申请' : '已提交年结申请'
  },
  {
    key: 'separation',
    label: '申请人与确认人职责分离',
    passed: !selectedYearState.value?.requestedBy || selectedYearState.value.requestedBy !== actor.value.name,
    detail: selectedYearState.value?.requestedBy ? '申请人 ' + selectedYearState.value.requestedBy : '等待申请'
  }
])

function yearStatusLabel(status: ClosingYearState['status']) {
  return status === 'open' ? '未年结' : status === 'requested' ? '待确认' : '已年结'
}

function yearStatusColor(status: ClosingYearState['status']): 'neutral' | 'warning' | 'success' {
  return status === 'open' ? 'neutral' : status === 'requested' ? 'warning' : 'success'
}

function requestYearClose() {
  yearError.value = ''
  const state = selectedYearState.value
  if (!state) return
  if (!props.canPost) {
    yearError.value = '当前演示身份没有 finance.post 权限，无法申请年结。'
    return
  }
  if (state.status !== 'open') {
    yearError.value = '当前年度状态为「' + yearStatusLabel(state.status) + '」，不能重复申请。'
    return
  }
  if (!isMaker.value) {
    yearError.value = '年结申请需由业务经办身份发起，请切换为业务经办。'
    return
  }
  yearStates.value = {
    ...yearStates.value,
    [selectedYear.value]: { ...state, status: 'requested', requestedBy: actor.value.name, requestedAt: nowStamp() }
  }
  notify('年结申请已提交', selectedYear.value + ' 年度年结申请已提交，等待业务主管独立确认。', 'success', 'i-carbon-send')
}

function cancelYearRequest() {
  yearError.value = ''
  const state = selectedYearState.value
  if (!state || state.status !== 'requested') {
    yearError.value = '当前没有待确认的年结申请。'
    return
  }
  yearStates.value = {
    ...yearStates.value,
    [selectedYear.value]: { ...state, status: 'open', requestedBy: undefined, requestedAt: undefined }
  }
  notify('年结申请已取消', selectedYear.value + ' 年度恢复为未年结状态。', 'neutral', 'i-carbon-undo')
}

function confirmYearClose() {
  yearError.value = ''
  const state = selectedYearState.value
  if (!state) return
  if (!props.canPost) {
    yearError.value = '当前演示身份没有 finance.post 权限，无法确认年结。'
    return
  }
  if (state.status !== 'requested') {
    yearError.value = '请先由业务经办提交年结申请。'
    return
  }
  if (!isApprover.value) {
    yearError.value = '独立确认需要业务主管身份，请切换为业务主管后再确认。'
    notify('需要独立确认人', yearError.value, 'warning', 'i-carbon-user-role')
    return
  }
  if (state.requestedBy === actor.value.name) {
    yearError.value = '年结申请人与确认人不能为同一人。'
    return
  }
  const carryoverId = 'JE-CLOSE-' + selectedYear.value
  const lines = yearCarryoverLines[selectedYear.value] ?? []
  const amount = state.profit
  const carryover: ClosingJournal = {
    id: carryoverId,
    date: String(selectedYear.value) + '-12-31',
    period: String(selectedYear.value) + '-12',
    description: selectedYear.value + ' 年度结转本年利润',
    stage: 'posted',
    debitTotal: amount,
    creditTotal: amount,
    lines: lines.length > 0
      ? lines.map(line => ({ ...line }))
      : [
          { accountCode: '3103', accountName: '本年利润', debit: amount, credit: '0.00' },
          { accountCode: '3104', accountName: '利润分配', debit: '0.00', credit: amount }
        ],
    preparedBy: state.requestedBy ?? actor.value.name,
    preparedById: 'u-1001',
    reviewer: actor.value.name,
    postedAt: nowStamp(),
    sourceKind: 'carryover',
    sourceLabel: '年度结转 · ' + selectedYear.value,
    businessRef: 'YEAR-CLOSE-' + selectedYear.value,
    local: true
  }
  journalRows.value = [carryover, ...journalRows.value]
  yearStates.value = {
    ...yearStates.value,
    [selectedYear.value]: {
      ...state,
      status: 'closed',
      approvedBy: actor.value.name,
      closedAt: nowStamp(),
      carryoverJournalId: carryoverId,
      closedProfit: amount
    }
  }
  notify('年度已年结', selectedYear.value + ' 年度已年结，已生成结转凭证 ' + carryoverId + '。', 'success', 'i-carbon-checkmark-outline')
}

function reopenYear() {
  yearError.value = ''
  const state = selectedYearState.value
  if (!state || state.status === 'open') {
    yearError.value = '当前年度尚未年结，无需重开。'
    return
  }
  if (!props.canPost) {
    yearError.value = '当前演示身份没有 finance.post 权限，无法重开年度。'
    return
  }
  if (!isApprover.value) {
    yearError.value = '重开年度需要业务主管身份，请切换身份后再操作。'
    return
  }
  const reversalId = state.carryoverJournalId ? state.carryoverJournalId + '-R' : 'JE-CLOSE-' + selectedYear.value + '-R'
  yearStates.value = {
    ...yearStates.value,
    [selectedYear.value]: {
      ...state,
      status: 'open',
      approvedBy: undefined,
      closedAt: undefined,
      reversalJournalId: reversalId
    }
  }
  notify('年度已重开', selectedYear.value + ' 年度已恢复未年结，可重开月份；仅本次预览。', 'warning', 'i-carbon-unlocked')
}

function openYearPreview() {
  yearError.value = ''
  yearPreviewOpen.value = true
}

function openYearJournal(kind: 'carryover' | 'reversal') {
  const state = selectedYearState.value
  if (!state) return
  const id = kind === 'carryover' ? state.carryoverJournalId : state.reversalJournalId
  if (!id) return
  yearJournalTitle.value = (kind === 'carryover' ? '年结结转凭证' : '年结冲销凭证') + ' · ' + id
  yearJournalId.value = id
  const baseLines = yearCarryoverLines[selectedYear.value] ?? []
  yearJournalLines.value = kind === 'carryover'
    ? baseLines.map(line => ({ ...line }))
    : baseLines.map(line => ({
        accountCode: line.accountCode,
        accountName: line.accountName,
        debit: line.credit,
        credit: line.debit
      }))
  yearJournalOpen.value = true
}

/* ---------------- 科目树治理 ---------------- */

interface ChartRow extends FinanceAccount {
  purpose: string
  archived: boolean
  template: boolean
}

function toChartRow(account: FinanceAccount, existing?: ChartRow): ChartRow {
  const meta: ChartAccountMeta | undefined = chartAccountMeta[account.code]
  return {
    ...account,
    purpose: existing?.purpose ?? meta?.purpose ?? (accountTypeLabels[account.type] + '类科目'),
    archived: existing?.archived ?? false,
    template: meta?.template ?? false
  }
}

const chartRows = ref<ChartRow[]>(chartExtraAccounts.map(account => toChartRow(account)))
const chartError = ref('')

watch(() => props.accounts, (list) => {
  if (!list || list.length === 0) return
  const current = new Map(chartRows.value.map(row => [row.code, row]))
  const merged = list.map((account) => {
    const existing = current.get(account.code)
    return toChartRow(account, existing)
  })
  const extras = chartRows.value.filter(row => !list.some(account => account.code === row.code))
  chartRows.value = [...merged, ...extras]
}, { immediate: true })

const chartSorted = computed(() => chartRows.value.slice().sort((a, b) => a.code.localeCompare(b.code)))

function usageCount(code: string) {
  return journalRows.value.reduce((sum, row) => sum + row.lines.filter(line => line.accountCode === code).length, 0)
}

function isAccountUsed(code: string) {
  return usageCount(code) > 0
}

const chartColumns: TableColumn<ChartRow>[] = [
  { accessorKey: 'code', header: '科目编码', meta: { class: { td: 'whitespace-nowrap font-mono text-[12px]' } } },
  { accessorKey: 'name', header: '科目名称' },
  { accessorKey: 'type', header: '类型', meta: { class: { th: 'w-20' } } },
  { accessorKey: 'purpose', header: '用途' },
  { accessorKey: 'balance', header: '余额', meta: { class: { th: 'text-right', td: 'text-right whitespace-nowrap tabular-nums' } } },
  { id: 'usage', header: '使用情况', meta: { class: { th: 'w-24' } } },
  { accessorKey: 'archived', header: '状态', meta: { class: { th: 'w-24' } } },
  { id: 'actions', header: '操作', meta: { class: { th: 'w-40 text-right', td: 'text-right' } } }
]

function archiveAccount(row: ChartRow) {
  chartError.value = ''
  if (row.archived) return
  const balance = Number(row.balance) || 0
  if (balance !== 0) {
    chartError.value = '科目 ' + row.code + ' 仍有余额 ' + money(balance) + '，不能归档；请先清零余额。'
    notify('不能归档', chartError.value, 'warning', 'i-carbon-warning-alt')
    return
  }
  if (isAccountUsed(row.code)) {
    chartError.value = '科目 ' + row.code + ' 已有凭证使用记录，不能归档。'
    notify('不能归档', chartError.value, 'warning', 'i-carbon-warning-alt')
    return
  }
  chartRows.value = chartRows.value.map(item => item.code === row.code ? { ...item, archived: true } : item)
  notify('科目已归档', row.code + ' ' + row.name + ' 已归档，可随时恢复。', 'success', 'i-carbon-archive')
}

function restoreAccount(row: ChartRow) {
  chartRows.value = chartRows.value.map(item => item.code === row.code ? { ...item, archived: false } : item)
  notify('科目已恢复', row.code + ' ' + row.name + ' 已恢复为启用状态。', 'success', 'i-carbon-renew')
}

function exportChart(kind: 'template' | 'structure' | 'snapshot') {
  if (kind === 'template') {
    downloadCsv('chart-template.csv', ['科目编码', '科目名称', '科目类型', '方向'], chartTemplateAccounts.map(account => [account.code, account.name, accountTypeLabels[account.type], account.type === 'asset' || account.type === 'expense' ? '借' : '贷']))
    notify('模板已导出', '标准科目模板 chart-template.csv 已开始下载。')
    return
  }
  if (kind === 'structure') {
    downloadCsv('chart-structure.csv', ['科目编码', '科目名称', '科目类型', '用途'], chartSorted.value.map(row => [row.code, row.name, accountTypeLabels[row.type], row.purpose]))
    notify('结构已导出', '科目结构 chart-structure.csv 已开始下载。')
    return
  }
  downloadCsv('chart-snapshot.csv', ['科目编码', '科目名称', '科目类型', '余额', '使用次数', '状态', '是否模板'], chartSorted.value.map(row => [row.code, row.name, accountTypeLabels[row.type], row.balance, usageCount(row.code), row.archived ? '已归档' : '启用', row.template ? '是' : '否']))
  notify('快照已导出', '科目快照 chart-snapshot.csv 已开始下载。')
}

interface ImportRowSeed {
  line: number
  code: string
  name: string
  type: string
  balance: string
  errors: string[]
}

const importOpen = ref(false)
const importText = ref(chartImportSample)
const importRows = ref<ImportRowSeed[]>([])
const importResult = ref('')
const importError = ref('')

function openChartImport() {
  importRows.value = []
  importResult.value = ''
  importError.value = ''
  importOpen.value = true
}

function parseImport() {
  importError.value = ''
  importResult.value = ''
  const lines = importText.value.split(NEWLINE).map(line => line.trim()).filter(line => line.length > 0)
  if (lines.length <= 1) {
    importRows.value = []
    importError.value = '请粘贴表头与至少一行科目数据。'
    return
  }
  const validTypes = ['asset', 'liability', 'equity', 'revenue', 'expense']
  const seen = new Set(chartRows.value.map(row => row.code))
  const parsed: ImportRowSeed[] = []
  for (let index = 1; index < lines.length; index += 1) {
    const cells = lines[index]!.split(',').map(cell => cell.trim())
    const code = cells[0] ?? ''
    const name = cells[1] ?? ''
    const type = cells[2] ?? ''
    const balance = cells[3] ?? '0'
    const errors: string[] = []
    if (code.length === 0) errors.push('缺少科目编码')
    else if (seen.has(code)) errors.push('科目编码已存在')
    if (name.length === 0) errors.push('缺少科目名称')
    if (!validTypes.includes(type)) errors.push('科目类型无效')
    if (Number.isNaN(Number(balance))) errors.push('期初余额不是数字')
    if (code.length > 0) seen.add(code)
    parsed.push({ line: index + 1, code, name, type, balance, errors })
  }
  importRows.value = parsed
}

function commitImport() {
  importError.value = ''
  if (importRows.value.length === 0) {
    parseImport()
  }
  const rows = importRows.value
  if (rows.length === 0) return
  const valid = rows.filter(row => row.errors.length === 0)
  const skipped = rows.length - valid.length
  if (valid.length === 0) {
    importError.value = '没有可导入的行，请修正逐行错误后重试。'
    return
  }
  const additions: ChartRow[] = valid.map(row => ({
    id: 'acc-import-' + row.code,
    code: row.code,
    name: row.name,
    type: row.type as FinanceAccount['type'],
    balance: (Number(row.balance) || 0).toFixed(2),
    purpose: '导入新增科目',
    archived: false,
    template: false
  }))
  chartRows.value = [...chartRows.value, ...additions]
  importRows.value = []
  importResult.value = '成功导入 ' + valid.length + ' 个科目，跳过 ' + skipped + ' 行错误数据；仅本次预览。'
  notify('科目导入完成', importResult.value, 'success', 'i-carbon-upload')
}

const mergeOpen = ref(false)
const mergeSource = ref('')
const mergeTarget = ref('')
const mergeError = ref('')

const mergeOptions = computed(() => chartSorted.value.map(row => ({
  label: row.code + ' ' + row.name + ' · 余额 ' + money(row.balance),
  value: row.code
})))

const mergeSourceRow = computed(() => chartRows.value.find(row => row.code === mergeSource.value) ?? null)
const mergeTargetRow = computed(() => chartRows.value.find(row => row.code === mergeTarget.value) ?? null)

function openMerge() {
  mergeError.value = ''
  mergeSource.value = ''
  mergeTarget.value = ''
  mergeOpen.value = true
}

function saveMerge() {
  mergeError.value = ''
  const source = mergeSourceRow.value
  const target = mergeTargetRow.value
  if (!source || !target) {
    mergeError.value = '请选择要合并的两个科目。'
    return
  }
  if (source.code === target.code) {
    mergeError.value = '源科目与目标科目不能相同。'
    return
  }
  if (Number(source.balance) !== 0 && Number(target.balance) !== 0) {
    mergeError.value = '两个科目均有余额，至少需要一个为空或无余额的科目才能合并。'
    return
  }
  const mergedBalance = (Number(source.balance) + Number(target.balance)).toFixed(2)
  chartRows.value = chartRows.value
    .filter(row => row.code !== source.code)
    .map(row => row.code === target.code ? { ...row, balance: mergedBalance } : row)
  mergeOpen.value = false
  notify('科目已合并', source.code + ' ' + source.name + ' 并入 ' + target.code + ' ' + target.name + '，余额 ' + money(mergedBalance) + '。', 'success', 'i-carbon-merge')
}

const resetOpen = ref(false)
const resetAck = ref(false)

function openReset() {
  resetAck.value = false
  resetOpen.value = true
}

function confirmReset() {
  if (!resetAck.value) return
  chartRows.value = chartTemplateAccounts.map(account => ({
    id: 'acc-template-' + account.code,
    code: account.code,
    name: account.name,
    type: account.type,
    balance: '0.00',
    purpose: chartAccountMeta[account.code]?.purpose ?? (accountTypeLabels[account.type] + '类科目'),
    archived: false,
    template: true
  }))
  resetOpen.value = false
  notify('空账簿已替换', '科目表已重置为 ' + chartRows.value.length + ' 个模板科目；仅本次预览。', 'success', 'i-carbon-reset')
}

/* ---------------- 合伙人 ---------------- */

function clonePartnerShares(year: number): PartnerShareSeed[] {
  return (partnerShareByYear[year] ?? []).map(share => ({ ...share }))
}

const partnerDrafts = ref<Record<number, PartnerShareSeed[]>>({
  2026: clonePartnerShares(2026),
  2025: clonePartnerShares(2025)
})
const partnerYear = ref(2026)
const partnerYearModel = computed({
  get: () => String(partnerYear.value),
  set: (value: string) => {
    partnerYear.value = Number(value)
  }
})
const partnerError = ref('')
const partnerPreviewOpen = ref(false)

const partnerRows = computed(() => partnerDrafts.value[partnerYear.value] ?? [])
const partnerTotal = computed(() => partnerRows.value.reduce((sum, row) => sum + Number(row.share || 0), 0))
const partnerTotalValid = computed(() => partnerTotal.value === 100)
const partnerYearProfit = computed(() => Number(yearStateOf(partnerYear.value)?.profit ?? 0))

const partnerYearItems = computed(() => partnerYearOptions.map(year => ({
  label: year + ' 年度',
  value: String(year)
})))

const capitalAccountOptions = computed(() => chartRows.value
  .filter(row => row.type === 'equity')
  .map(row => ({ label: row.code + ' ' + row.name, value: row.code })))

const drawingAccountOptions = computed(() => chartRows.value
  .filter(row => row.type === 'equity' || row.code === '1221')
  .map(row => ({ label: row.code + ' ' + row.name, value: row.code })))

function updatePartnerShare(id: string, value: string | number) {
  const share = Number(value)
  partnerDrafts.value = {
    ...partnerDrafts.value,
    [partnerYear.value]: partnerRows.value.map(row => row.id === id ? { ...row, share: Number.isFinite(share) ? share : 0 } : row)
  }
  partnerError.value = ''
}

function updatePartnerAccount(id: string, field: 'capitalAccountCode' | 'drawingAccountCode', value: string) {
  partnerDrafts.value = {
    ...partnerDrafts.value,
    [partnerYear.value]: partnerRows.value.map(row => row.id === id ? { ...row, [field]: value } : row)
  }
  partnerError.value = ''
}

function savePartnerConfig() {
  partnerError.value = ''
  if (!partnerTotalValid.value) {
    partnerError.value = '合伙人份额合计必须等于 100%，当前为 ' + partnerTotal.value + '%。'
    notify('份额配置无效', partnerError.value, 'error', 'i-carbon-warning-alt')
    return
  }
  const missing = partnerRows.value.find(row => !row.capitalAccountCode || !row.drawingAccountCode)
  if (missing) {
    partnerError.value = '请为合伙人「' + missing.name + '」选择资本科目与提款科目。'
    return
  }
  notify('合伙人配置已保存', partnerYear.value + ' 年度份额与科目配置已保存；仅本次预览，刷新后恢复初始数据。', 'success', 'i-carbon-save')
}

function openPartnerPreview() {
  partnerError.value = ''
  partnerPreviewOpen.value = true
}

const partnerAllocation = computed(() => partnerRows.value.map(row => ({
  ...row,
  amount: (partnerYearProfit.value * Number(row.share || 0) / 100).toFixed(2)
})))

function accountNameOf(code: string) {
  const row = chartRows.value.find(item => item.code === code)
  return row ? row.code + ' ' + row.name : code
}
</script>

<template>
  <div class="space-y-4" data-testid="finance-closing">
    <UCard :ui="{ body: 'p-0' }">
      <template #header>
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 class="text-lg font-semibold text-[var(--ui-text-highlighted)]">
              月结与年结
            </h2>
            <p class="mt-1 text-sm text-[var(--ui-text-muted)]">
              工作台就绪、凭证生命周期、科目树治理、期间与年结、合伙人份额。所有动作仅本地演示，刷新后恢复初始数据。
            </p>
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <UBadge :color="props.canPost ? 'success' : 'warning'" variant="subtle" :label="props.canPost ? '可过账' : '只读演示'" />
            <UBadge color="neutral" variant="subtle" :label="'当前身份：' + actor.name + ' / ' + actorRole" />
          </div>
        </div>
      </template>
      <div class="border-b border-[var(--ui-border)] px-4 pt-3">
        <UTabs
          v-model="tab"
          :items="tabItems"
          :content="false"
          size="sm"
        />
      </div>
    </UCard>

    <div v-if="tab === 'readiness'" class="space-y-4">
      <UCard>
        <template #header>
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 class="text-base font-semibold text-[var(--ui-text-highlighted)]">
                工作台就绪
              </h3>
              <p class="mt-1 text-sm text-[var(--ui-text-muted)]">
                四项关账前置检查；阻断项可打开来源处理。
              </p>
            </div>
            <UBadge color="success" variant="subtle" :label="'通过 ' + readinessPassed + ' / ' + readinessRows.length" />
          </div>
        </template>
        <div class="grid gap-3 lg:grid-cols-2">
          <div
            v-for="row in readinessRows"
            :key="row.key"
            class="space-y-2 rounded-lg border border-[var(--ui-border)] p-4"
            :data-testid="'readiness-check-' + row.key"
          >
            <div class="flex items-start justify-between gap-2">
              <div class="min-w-0">
                <div class="flex items-center gap-2">
                  <UIcon :name="row.status === 'pass' ? 'i-carbon-checkmark-filled' : 'i-carbon-warning-alt'" :class="row.status === 'pass' ? 'text-[var(--ui-success)]' : 'text-[var(--ui-error)]'" />
                  <span class="text-sm font-medium">{{ row.label }}</span>
                </div>
                <p class="mt-1 text-xs text-[var(--ui-text-muted)]">
                  {{ row.description }}
                </p>
              </div>
              <UBadge :color="row.status === 'pass' ? 'success' : 'error'" variant="subtle" :label="row.status === 'pass' ? '通过' : '阻断'" />
            </div>
            <p class="text-xs text-[var(--ui-text-toned)]">
              {{ row.detail }}
            </p>
            <div class="flex flex-wrap gap-2">
              <UButton
                size="xs"
                variant="soft"
                icon="i-carbon-launch"
                label="打开来源"
                :data-testid="'readiness-source-' + row.key"
                @click="openReadinessSource(row.key)"
              />
              <UButton
                v-if="row.key === 'inventory-cost' && Number(estimatedInventoryCost()) > 0"
                size="xs"
                icon="i-carbon-add"
                label="补记库存成本"
                data-testid="readiness-cost-entry"
                @click="openCostForm"
              />
            </div>
          </div>
        </div>
      </UCard>

      <UCard data-testid="readiness-cost-history">
        <template #header>
          <div class="flex flex-wrap items-center justify-between gap-2">
            <h3 class="text-base font-semibold text-[var(--ui-text-highlighted)]">
              库存成本补记记录
            </h3>
            <UButton
              v-if="Number(estimatedInventoryCost()) > 0"
              size="xs"
              icon="i-carbon-add"
              label="补记库存成本"
              @click="openCostForm"
            />
          </div>
        </template>
        <div v-if="costRecords.length === 0" class="py-6 text-center text-sm text-[var(--ui-text-muted)]">
          暂无补记记录，待入账 {{ money(pendingInventoryAmount) }}。
        </div>
        <div v-else class="divide-y divide-[var(--ui-border)]">
          <div
            v-for="record in costRecords"
            :key="record.id"
            class="flex flex-wrap items-center justify-between gap-3 py-3 text-sm"
            :data-testid="'readiness-cost-record-' + record.id"
          >
            <div class="min-w-0">
              <p class="font-medium">
                {{ record.id }} · {{ record.summary }}
              </p>
              <p class="mt-1 text-xs text-[var(--ui-text-muted)]">
                截止 {{ record.cutoffDate }} · {{ record.createdAt }} · {{ record.by }} · 来源 {{ record.source }}
              </p>
            </div>
            <div class="flex items-center gap-3">
              <span class="font-medium tabular-nums">{{ money(record.amount) }}</span>
              <UButton
                size="xs"
                variant="ghost"
                icon="i-carbon-launch"
                label="来源"
                :data-testid="'readiness-cost-source-' + record.id"
                @click="openReadinessSource('inventory-cost')"
              />
            </div>
          </div>
        </div>
      </UCard>
    </div>

    <div v-if="tab === 'journals'" class="space-y-4">
      <UCard>
        <template #header>
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 class="text-base font-semibold text-[var(--ui-text-highlighted)]">
                凭证生命周期
              </h3>
              <p class="mt-1 text-sm text-[var(--ui-text-muted)]">
                草稿编辑 → 提交复核 → 复核人独立过账 → 冲销生成红字凭证；所有变更仅本地演示。
              </p>
            </div>
            <div class="flex flex-wrap items-center gap-2">
              <UButton
                size="xs"
                :variant="isMaker ? 'solid' : 'outline'"
                label="业务经办"
                data-testid="closing-journal-actor-maker"
                @click="setActorRole('maker')"
              />
              <UButton
                size="xs"
                :variant="isApprover ? 'solid' : 'outline'"
                label="业务主管"
                data-testid="closing-journal-actor-approver"
                @click="setActorRole('approver')"
              />
              <UButton
                size="xs"
                color="neutral"
                variant="soft"
                icon="i-carbon-search"
                label="扫描异常凭证"
                data-testid="closing-journal-scan"
                @click="runScan"
              />
            </div>
          </div>
        </template>
        <ResizableTable
          :columns="journalColumns"
          :data="journalRows"
          data-testid="closing-journal-table"
          :row-activate="openJournalDetail"
        >
          <template #id-cell="{ row }">
            <span class="font-mono text-[12px]">{{ row.original.id }}</span>
          </template>
          <template #description-cell="{ row }">
            <div class="min-w-0">
              <p class="truncate">
                {{ row.original.description }}
              </p>
              <p class="mt-0.5 text-[11px] text-[var(--ui-text-muted)]">
                制单 {{ row.original.preparedBy }}<span v-if="row.original.reviewer"> · 复核 {{ row.original.reviewer }}</span>
              </p>
            </div>
          </template>
          <template #debitTotal-cell="{ row }">
            {{ money(row.original.debitTotal) }}
          </template>
          <template #creditTotal-cell="{ row }">
            {{ money(row.original.creditTotal) }}
          </template>
          <template #stage-cell="{ row }">
            <UBadge :color="stageColors[row.original.stage]" variant="subtle" :label="stageLabels[row.original.stage]" />
          </template>
          <template #businessRef-cell="{ row }">
            <UBadge
              v-if="row.original.businessRef"
              color="success"
              variant="subtle"
              :label="businessLabelOf(row.original.businessRef)"
            />
            <UBadge
              v-else
              color="warning"
              variant="subtle"
              label="未关联"
            />
          </template>
          <template #actions-cell="{ row }">
            <div class="flex flex-wrap justify-end gap-1">
              <UButton
                size="xs"
                variant="ghost"
                label="详情"
                :data-testid="'closing-journal-detail-' + row.original.id"
                @click="openJournalDetail(row.original)"
              />
              <UButton
                v-if="row.original.stage === 'draft'"
                size="xs"
                variant="soft"
                label="编辑"
                :data-testid="'closing-journal-edit-' + row.original.id"
                @click="openEdit(row.original)"
              />
              <UButton
                v-if="row.original.stage === 'draft'"
                size="xs"
                label="提交复核"
                :data-testid="'closing-journal-submit-' + row.original.id"
                @click="submitJournal(row.original)"
              />
              <UButton
                v-if="row.original.stage === 'submitted'"
                size="xs"
                variant="soft"
                color="neutral"
                label="撤回复核"
                :data-testid="'closing-journal-cancel-' + row.original.id"
                @click="cancelSubmit(row.original)"
              />
              <UButton
                v-if="row.original.stage === 'submitted'"
                size="xs"
                label="复核过账"
                :data-testid="'closing-journal-post-' + row.original.id"
                @click="postJournal(row.original)"
              />
              <UButton
                v-if="row.original.stage === 'posted'"
                size="xs"
                color="error"
                variant="soft"
                label="冲销"
                :data-testid="'closing-journal-reverse-' + row.original.id"
                @click="openReverse(row.original)"
              />
            </div>
          </template>
        </ResizableTable>
        <div v-if="journalError" class="mt-3 rounded-md border border-[var(--ui-error)]/40 bg-[var(--ui-error)]/10 px-3 py-2 text-sm text-[var(--ui-error)]" data-testid="closing-journal-error">
          {{ journalError }}
        </div>
      </UCard>

      <UCard v-if="scanDone" data-testid="closing-journal-anomalies">
        <template #header>
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 class="text-base font-semibold text-[var(--ui-text-highlighted)]">
                已过账未关联业务凭证
              </h3>
              <p class="mt-1 text-sm text-[var(--ui-text-muted)]">
                共 {{ anomalies.length }} 张；补齐业务关联后，关账检查「业务关联完整」通过。
              </p>
            </div>
            <UBadge :color="anomalies.length ? 'warning' : 'success'" variant="subtle" :label="'异常 ' + anomalies.length + ' 张'" />
          </div>
        </template>
        <div v-if="anomalies.length === 0" class="py-6 text-center text-sm text-[var(--ui-text-muted)]" data-testid="closing-journal-scan-empty">
          扫描完成，未发现未关联业务的已过账凭证。
        </div>
        <div v-else class="divide-y divide-[var(--ui-border)]">
          <div
            v-for="anomaly in anomalies"
            :key="anomaly.id"
            class="flex flex-wrap items-center justify-between gap-3 py-3"
            :data-testid="'closing-journal-anomaly-' + anomaly.id"
          >
            <div class="min-w-0">
              <p class="text-sm font-medium">
                {{ anomaly.id }} · {{ anomaly.description }}
              </p>
              <p class="mt-1 text-xs text-[var(--ui-text-muted)]">
                {{ anomaly.date }} · {{ money(anomaly.debitTotal) }} · 来源 {{ anomaly.sourceLabel }}
              </p>
            </div>
            <div class="flex flex-wrap items-center gap-2">
              <USelect
                v-model="linkDrafts[anomaly.id]"
                :items="businessLinkOptions"
                placeholder="选择业务单据"
                size="xs"
                class="w-52"
                :data-testid="'closing-journal-link-select-' + anomaly.id"
              />
              <UButton
                size="xs"
                icon="i-carbon-link"
                label="关联"
                :data-testid="'closing-journal-link-' + anomaly.id"
                @click="linkBusiness(anomaly)"
              />
              <UButton
                size="xs"
                variant="ghost"
                label="详情"
                :data-testid="'closing-journal-anomaly-detail-' + anomaly.id"
                @click="openJournalDetail(anomaly)"
              />
            </div>
          </div>
        </div>
      </UCard>
    </div>

    <div v-if="tab === 'periods'" class="space-y-4">
      <UCard>
        <template #header>
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 class="text-base font-semibold text-[var(--ui-text-highlighted)]">
                期间关账
              </h3>
              <p class="mt-1 text-sm text-[var(--ui-text-muted)]">
                打开期间查看关账检查与状态历史；开始关账 → 清零关闭 → 原因重开。已年结年度需先重开年度。
              </p>
            </div>
            <UBadge color="neutral" variant="subtle" :label="periodRowsSorted.length + ' 个期间'" />
          </div>
        </template>
        <div class="divide-y divide-[var(--ui-border)]">
          <div
            v-for="period in periodRowsSorted"
            :key="period.period"
            class="flex flex-wrap items-center justify-between gap-3 py-3"
            :data-testid="'closing-period-' + period.period"
          >
            <div class="min-w-0">
              <p class="text-sm font-medium">
                {{ period.period }} <span class="text-xs font-normal text-[var(--ui-text-muted)]">· {{ yearOf(period.period) }} 年度</span>
              </p>
              <p class="mt-1 text-xs text-[var(--ui-text-muted)]">
                关账时间 {{ period.closedAt ?? '未关账' }}
              </p>
            </div>
            <div class="flex flex-wrap items-center gap-2">
              <UBadge :color="financePeriodStatusColors[period.status]" variant="subtle" :label="financePeriodStatusLabels[period.status]" />
              <UButton
                size="xs"
                variant="ghost"
                label="详情"
                :data-testid="'closing-period-detail-' + period.period"
                @click="openPeriod(period.period)"
              />
              <UButton
                v-if="period.status === 'open'"
                size="xs"
                variant="soft"
                label="开始关账"
                :data-testid="'closing-period-start-' + period.period"
                @click="startPeriodClosing(period)"
              />
              <UButton
                v-if="period.status === 'closing'"
                size="xs"
                label="清零关闭"
                :data-testid="'closing-period-close-' + period.period"
                @click="closePeriod(period)"
              />
              <UButton
                v-if="period.status === 'closed'"
                size="xs"
                color="warning"
                variant="soft"
                label="原因重开"
                :data-testid="'closing-period-reopen-' + period.period"
                @click="openPeriodReopen(period)"
              />
            </div>
          </div>
        </div>
        <div v-if="periodError" class="mt-3 rounded-md border border-[var(--ui-error)]/40 bg-[var(--ui-error)]/10 px-3 py-2 text-sm text-[var(--ui-error)]" data-testid="closing-period-error">
          {{ periodError }}
        </div>
      </UCard>

      <UCard data-testid="closing-year-panel">
        <template #header>
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 class="text-base font-semibold text-[var(--ui-text-highlighted)]">
                年度年结
              </h3>
              <p class="mt-1 text-sm text-[var(--ui-text-muted)]">
                年结申请与独立确认必须由不同身份完成；已年结年度重开月份前必须先重开年度。
              </p>
            </div>
            <div class="flex flex-wrap items-center gap-2">
              <USelect
                v-model="selectedYearModel"
                :items="yearSelectItems"
                size="xs"
                class="w-32"
                data-testid="closing-year-select"
              />
              <UButton
                size="xs"
                :variant="isMaker ? 'solid' : 'outline'"
                label="业务经办"
                data-testid="closing-year-actor-maker"
                @click="setActorRole('maker')"
              />
              <UButton
                size="xs"
                :variant="isApprover ? 'solid' : 'outline'"
                label="业务主管"
                data-testid="closing-year-actor-approver"
                @click="setActorRole('approver')"
              />
            </div>
          </div>
        </template>
        <div class="space-y-4">
          <div class="flex flex-wrap items-center gap-4 rounded-lg border border-[var(--ui-border)] p-3 text-sm">
            <div class="flex items-center gap-2">
              <span class="text-[var(--ui-text-muted)]">年度状态</span>
              <UBadge
                v-if="selectedYearState"
                :color="yearStatusColor(selectedYearState.status)"
                variant="subtle"
                :label="yearStatusLabel(selectedYearState.status)"
              />
            </div>
            <div class="flex items-center gap-2">
              <span class="text-[var(--ui-text-muted)]">本年利润</span>
              <span class="font-medium tabular-nums">{{ money(selectedYearState?.profit ?? 0) }}</span>
            </div>
            <div class="flex items-center gap-2">
              <span class="text-[var(--ui-text-muted)]">申请人</span>
              <span>{{ selectedYearState?.requestedBy ?? '—' }}</span>
            </div>
            <div class="flex items-center gap-2">
              <span class="text-[var(--ui-text-muted)]">确认人</span>
              <span>{{ selectedYearState?.approvedBy ?? '—' }}</span>
            </div>
          </div>

          <div class="grid gap-2 md:grid-cols-2">
            <div
              v-for="check in yearChecks"
              :key="check.key"
              class="flex items-start gap-2 rounded-md border border-[var(--ui-border)] px-3 py-2 text-sm"
              :data-testid="'closing-year-check-' + check.key"
            >
              <UIcon :name="check.passed ? 'i-carbon-checkmark-filled' : 'i-carbon-warning-alt'" :class="check.passed ? 'mt-0.5 text-[var(--ui-success)]' : 'mt-0.5 text-[var(--ui-warning)]'" />
              <div>
                <p class="font-medium">
                  {{ check.label }}
                </p>
                <p class="text-xs text-[var(--ui-text-muted)]">
                  {{ check.detail }}
                </p>
              </div>
            </div>
          </div>

          <div class="flex flex-wrap items-center gap-2">
            <UButton
              size="sm"
              variant="soft"
              icon="i-carbon-document"
              label="年结预览"
              data-testid="closing-year-preview"
              @click="openYearPreview"
            />
            <UButton
              v-if="selectedYearState?.status === 'open'"
              size="sm"
              icon="i-carbon-send"
              label="提交年结申请"
              data-testid="closing-year-request"
              @click="requestYearClose"
            />
            <UButton
              v-if="selectedYearState?.status === 'requested'"
              size="sm"
              icon="i-carbon-checkmark-outline"
              label="独立确认年结"
              data-testid="closing-year-confirm"
              @click="confirmYearClose"
            />
            <UButton
              v-if="selectedYearState?.status === 'requested'"
              size="sm"
              color="neutral"
              variant="soft"
              icon="i-carbon-undo"
              label="取消申请"
              data-testid="closing-year-cancel"
              @click="cancelYearRequest"
            />
            <UButton
              v-if="selectedYearState?.status === 'closed'"
              size="sm"
              color="warning"
              variant="soft"
              icon="i-carbon-unlocked"
              label="重开年度"
              data-testid="closing-year-reopen"
              @click="reopenYear"
            />
            <UButton
              v-if="selectedYearState?.carryoverJournalId"
              size="sm"
              variant="ghost"
              icon="i-carbon-link"
              label="年结结转凭证"
              data-testid="closing-year-carryover"
              @click="openYearJournal('carryover')"
            />
            <UButton
              v-if="selectedYearState?.reversalJournalId"
              size="sm"
              variant="ghost"
              icon="i-carbon-link"
              label="年结冲销凭证"
              data-testid="closing-year-reversal"
              @click="openYearJournal('reversal')"
            />
          </div>
          <div v-if="yearError" class="rounded-md border border-[var(--ui-error)]/40 bg-[var(--ui-error)]/10 px-3 py-2 text-sm text-[var(--ui-error)]" data-testid="closing-year-error">
            {{ yearError }}
          </div>
          <p class="text-xs text-[var(--ui-text-muted)]">
            演示顺序：业务经办提交申请 → 切换业务主管 → 独立确认。已年结年度在「期间关账」中重开月份会被拦截，需先在此重开年度。
          </p>
        </div>
      </UCard>
    </div>

    <div v-if="tab === 'chart'" class="space-y-4">
      <UCard>
        <template #header>
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 class="text-base font-semibold text-[var(--ui-text-highlighted)]">
                科目树治理
              </h3>
              <p class="mt-1 text-sm text-[var(--ui-text-muted)]">
                用途、归档与恢复、导入、合并与空账簿替换；有余额或已使用的科目不可归档。导出立即下载 CSV。
              </p>
            </div>
            <div class="flex flex-wrap items-center gap-2">
              <UButton
                size="xs"
                variant="soft"
                icon="i-carbon-download"
                label="模板导出"
                data-testid="chart-template-export"
                @click="exportChart('template')"
              />
              <UButton
                size="xs"
                variant="soft"
                icon="i-carbon-download"
                label="结构导出"
                data-testid="chart-structure-export"
                @click="exportChart('structure')"
              />
              <UButton
                size="xs"
                variant="soft"
                icon="i-carbon-download"
                label="快照导出"
                data-testid="chart-snapshot-export"
                @click="exportChart('snapshot')"
              />
              <UButton
                size="xs"
                icon="i-carbon-upload"
                label="科目导入"
                data-testid="chart-import"
                @click="openChartImport"
              />
              <UButton
                size="xs"
                color="neutral"
                variant="soft"
                icon="i-carbon-merge"
                label="科目合并"
                data-testid="chart-merge"
                @click="openMerge"
              />
              <UButton
                size="xs"
                color="error"
                variant="soft"
                icon="i-carbon-reset"
                label="空账簿替换"
                data-testid="chart-reset"
                @click="openReset"
              />
            </div>
          </div>
        </template>
        <ResizableTable :columns="chartColumns" :data="chartSorted" data-testid="chart-table">
          <template #code-cell="{ row }">
            <span class="font-mono text-[12px]">{{ row.original.code }}</span>
          </template>
          <template #name-cell="{ row }">
            <span>{{ row.original.name }}</span>
            <UBadge
              v-if="row.original.template"
              class="ml-2"
              color="info"
              variant="subtle"
              label="模板"
            />
          </template>
          <template #type-cell="{ row }">
            {{ accountTypeLabels[row.original.type] }}
          </template>
          <template #purpose-cell="{ row }">
            <span class="text-xs">{{ row.original.purpose }}</span>
          </template>
          <template #balance-cell="{ row }">
            {{ money(row.original.balance) }}
          </template>
          <template #usage-cell="{ row }">
            <UBadge :color="usageCount(row.original.code) > 0 ? 'info' : 'neutral'" variant="subtle" :label="usageCount(row.original.code) + ' 次'" />
          </template>
          <template #archived-cell="{ row }">
            <UBadge :color="row.original.archived ? 'warning' : 'success'" variant="subtle" :label="row.original.archived ? '已归档' : '启用'" />
          </template>
          <template #actions-cell="{ row }">
            <div class="flex justify-end gap-1">
              <UButton
                v-if="!row.original.archived"
                size="xs"
                variant="soft"
                label="归档"
                :data-testid="'chart-archive-' + row.original.code"
                @click="archiveAccount(row.original)"
              />
              <UButton
                v-else
                size="xs"
                variant="soft"
                label="恢复"
                :data-testid="'chart-restore-' + row.original.code"
                @click="restoreAccount(row.original)"
              />
            </div>
          </template>
        </ResizableTable>
        <div v-if="chartError" class="mt-3 rounded-md border border-[var(--ui-error)]/40 bg-[var(--ui-error)]/10 px-3 py-2 text-sm text-[var(--ui-error)]" data-testid="chart-error">
          {{ chartError }}
        </div>
      </UCard>
    </div>

    <div v-if="tab === 'partners'" class="space-y-4">
      <UCard data-testid="closing-partner-config">
        <template #header>
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 class="text-base font-semibold text-[var(--ui-text-highlighted)]">
                合伙人份额配置
              </h3>
              <p class="mt-1 text-sm text-[var(--ui-text-muted)]">
                按年度维护份额、资本科目与提款科目；份额合计必须为 100%，年结预览将按份额分摊本年利润。
              </p>
            </div>
            <div class="flex flex-wrap items-center gap-2">
              <USelect
                v-model="partnerYearModel"
                :items="partnerYearItems"
                size="xs"
                class="w-32"
                data-testid="closing-partner-year"
              />
              <UBadge :color="partnerTotalValid ? 'success' : 'error'" variant="subtle" :label="'合计 ' + partnerTotal + '%'" />
            </div>
          </div>
        </template>
        <div class="space-y-3">
          <div
            v-for="row in partnerRows"
            :key="row.id"
            class="grid gap-3 rounded-lg border border-[var(--ui-border)] p-3 md:grid-cols-12"
            :data-testid="'closing-partner-row-' + row.id"
          >
            <div class="md:col-span-2">
              <p class="text-sm font-medium">
                {{ row.name }}
              </p>
              <p class="text-xs text-[var(--ui-text-muted)]">
                {{ row.role }}
              </p>
            </div>
            <div class="md:col-span-2">
              <p class="mb-1 text-xs text-[var(--ui-text-muted)]">
                份额（%）
              </p>
              <UInput
                type="number"
                size="xs"
                :model-value="row.share"
                :data-testid="'closing-partner-share-' + row.id"
                @update:model-value="(value) => updatePartnerShare(row.id, value)"
              />
            </div>
            <div class="md:col-span-3">
              <p class="mb-1 text-xs text-[var(--ui-text-muted)]">
                资本科目
              </p>
              <USelect
                size="xs"
                :items="capitalAccountOptions"
                :model-value="row.capitalAccountCode"
                :data-testid="'closing-partner-capital-' + row.id"
                @update:model-value="(value) => updatePartnerAccount(row.id, 'capitalAccountCode', String(value ?? ''))"
              />
            </div>
            <div class="md:col-span-3">
              <p class="mb-1 text-xs text-[var(--ui-text-muted)]">
                提款科目
              </p>
              <USelect
                size="xs"
                :items="drawingAccountOptions"
                :model-value="row.drawingAccountCode"
                :data-testid="'closing-partner-drawing-' + row.id"
                @update:model-value="(value) => updatePartnerAccount(row.id, 'drawingAccountCode', String(value ?? ''))"
              />
            </div>
            <div class="md:col-span-2 text-right">
              <p class="mb-1 text-xs text-[var(--ui-text-muted)]">
                测算分摊
              </p>
              <p class="text-sm font-medium tabular-nums">
                {{ money(partnerYearProfit * Number(row.share || 0) / 100) }}
              </p>
            </div>
          </div>

          <div class="flex flex-wrap items-center justify-between gap-2 rounded-md bg-[var(--ui-bg-elevated)] px-3 py-2 text-sm">
            <span class="text-[var(--ui-text-muted)]">合伙人份额合计</span>
            <span class="flex items-center gap-2">
              <span class="font-semibold tabular-nums">{{ partnerTotal }}%</span>
              <UBadge :color="partnerTotalValid ? 'success' : 'error'" variant="subtle" :label="partnerTotalValid ? '有效' : '必须为 100%'" />
            </span>
          </div>

          <div v-if="partnerError" class="rounded-md border border-[var(--ui-error)]/40 bg-[var(--ui-error)]/10 px-3 py-2 text-sm text-[var(--ui-error)]" data-testid="closing-partner-error">
            {{ partnerError }}
          </div>
        </div>
        <template #footer>
          <div class="flex flex-wrap items-center justify-end gap-2">
            <UButton
              size="sm"
              variant="soft"
              icon="i-carbon-document"
              label="年结预览核对"
              data-testid="closing-partner-preview"
              @click="openPartnerPreview"
            />
            <UButton
              size="sm"
              icon="i-carbon-save"
              label="保存合伙人配置"
              data-testid="closing-partner-save"
              @click="savePartnerConfig"
            />
          </div>
        </template>
      </UCard>
    </div>

    <USlideover
      v-model:open="sourceOpen"
      :title="sourceMeta.label"
      :description="sourceMeta.description"
      :ui="{ content: 'w-full sm:max-w-xl' }"
      data-testid="readiness-source-panel"
    >
      <template #body>
        <div class="space-y-4 text-sm">
          <template v-if="sourceKey === 'ledger'">
            <div class="grid grid-cols-2 gap-2">
              <span class="text-[var(--ui-text-muted)]">账套</span><span>{{ ledgerSeed.id }}</span>
              <span class="text-[var(--ui-text-muted)]">会计年度</span><span>{{ ledgerSeed.fiscalYear }}</span>
              <span class="text-[var(--ui-text-muted)]">科目版本</span><span>r{{ ledgerSeed.chartRevision }}</span>
              <span class="text-[var(--ui-text-muted)]">本位币</span><span>{{ ledgerSeed.currency }}</span>
              <span class="text-[var(--ui-text-muted)]">期间数</span><span>{{ ledgerSeed.periodCount }}</span>
            </div>
            <p class="text-xs text-[var(--ui-text-muted)]">
              账簿已建立，可直接进行期初与凭证检查。
            </p>
          </template>
          <template v-else-if="sourceKey === 'opening'">
            <div class="grid grid-cols-2 gap-2">
              <span class="text-[var(--ui-text-muted)]">批次</span><span>{{ openingBatchSeed.id }}</span>
              <span class="text-[var(--ui-text-muted)]">文件</span><span>{{ openingBatchSeed.fileName }}</span>
              <span class="text-[var(--ui-text-muted)]">导入时间</span><span>{{ openingBatchSeed.importedAt }}</span>
              <span class="text-[var(--ui-text-muted)]">科目数</span><span>{{ openingBatchSeed.accountCount }}</span>
              <span class="text-[var(--ui-text-muted)]">借方合计</span><span>{{ money(openingBatchSeed.debit) }}</span>
              <span class="text-[var(--ui-text-muted)]">贷方合计</span><span>{{ money(openingBatchSeed.credit) }}</span>
              <span class="text-[var(--ui-text-muted)]">状态</span><span>{{ openingBatchSeed.status }} · {{ openingBatchSeed.reviewer }}</span>
            </div>
          </template>
          <template v-else-if="sourceKey === 'vouchers'">
            <div v-if="postedUnlinked.length === 0" class="text-[var(--ui-text-muted)]">
              未发现已过账未关联业务的凭证。
            </div>
            <div v-else class="space-y-2">
              <div v-for="anomaly in postedUnlinked" :key="anomaly.id" class="rounded-md border border-[var(--ui-border)] p-2">
                <p class="font-medium">
                  {{ anomaly.id }} · {{ money(anomaly.debitTotal) }}
                </p>
                <p class="text-xs text-[var(--ui-text-muted)]">
                  {{ anomaly.date }} · {{ anomaly.description }}
                </p>
                <div class="mt-1 flex gap-2">
                  <UButton
                    size="xs"
                    variant="ghost"
                    label="查看凭证"
                    :data-testid="'readiness-source-open-' + anomaly.id"
                    @click="openJournalDetail(anomaly)"
                  />
                  <UButton
                    size="xs"
                    variant="ghost"
                    color="neutral"
                    label="去凭证扫描"
                    @click="sourceOpen = false; tab = 'journals'; runScan()"
                  />
                </div>
              </div>
            </div>
          </template>
          <template v-else>
            <div class="space-y-2">
              <div class="flex items-center justify-between">
                <span>待入账库存成本</span>
                <span class="font-medium tabular-nums">{{ money(pendingInventoryAmount) }}</span>
              </div>
              <p class="text-xs text-[var(--ui-text-muted)]">
                截止日 {{ pendingInventoryCost.cutoffDate }} · 成本科目 {{ pendingInventoryCost.accountCode }} · 对方科目 {{ pendingInventoryCost.offsetAccountCode }}
              </p>
              <div v-for="entry in pendingInventoryCost.entries" :key="entry.ref" class="rounded-md border border-[var(--ui-border)] p-2">
                <p class="font-medium">
                  {{ entry.ref }} · {{ money(entry.amount) }}
                </p>
                <p class="text-xs text-[var(--ui-text-muted)]">
                  {{ entry.warehouse }} · {{ entry.note }}
                </p>
              </div>
              <UButton
                size="xs"
                icon="i-carbon-add"
                label="打开补记表单"
                :data-testid="'readiness-source-cost-entry'"
                @click="sourceOpen = false; openCostForm()"
              />
            </div>
          </template>
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-end">
          <UButton
            size="sm"
            color="neutral"
            variant="soft"
            label="关闭"
            @click="sourceOpen = false"
          />
        </div>
      </template>
    </USlideover>

    <UModal v-model:open="costOpen" title="补记库存成本" description="补记后「待入账库存成本」检查自动通过；仅本地演示。">
      <template #body>
        <div class="space-y-3" data-testid="readiness-cost-form">
          <div>
            <p class="mb-1 text-xs text-[var(--ui-text-muted)]">
              成本截止日
            </p>
            <UInput
              v-model="costCutoff"
              type="date"
              size="sm"
              data-testid="readiness-cost-form-cutoff"
            />
          </div>
          <div>
            <p class="mb-1 text-xs text-[var(--ui-text-muted)]">
              金额
            </p>
            <UInput
              v-model="costAmount"
              type="number"
              size="sm"
              data-testid="readiness-cost-form-amount"
            />
          </div>
          <div>
            <p class="mb-1 text-xs text-[var(--ui-text-muted)]">
              摘要
            </p>
            <UTextarea
              v-model="costSummary"
              :rows="2"
              size="sm"
              data-testid="readiness-cost-form-summary"
            />
          </div>
          <div v-if="costError" class="rounded-md border border-[var(--ui-error)]/40 bg-[var(--ui-error)]/10 px-3 py-2 text-sm text-[var(--ui-error)]" data-testid="readiness-cost-error">
            {{ costError }}
          </div>
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton
            size="sm"
            color="neutral"
            variant="soft"
            label="取消"
            @click="costOpen = false"
          />
          <UButton
            size="sm"
            icon="i-carbon-save"
            label="保存补记"
            :loading="costSaving"
            data-testid="readiness-cost-save"
            @click="saveCost"
          />
        </div>
      </template>
    </UModal>

    <USlideover
      v-model:open="journalDetailOpen"
      title="凭证详情"
      :ui="{ content: 'w-full sm:max-w-2xl' }"
      data-testid="closing-journal-detail"
    >
      <template #body>
        <div v-if="selectedJournal" class="space-y-4 text-sm">
          <div class="flex flex-wrap items-center gap-2">
            <span class="font-mono text-xs">{{ selectedJournal.id }}</span>
            <UBadge :color="stageColors[selectedJournal.stage]" variant="subtle" :label="stageLabels[selectedJournal.stage]" />
            <span class="text-xs text-[var(--ui-text-muted)]">{{ selectedJournal.date }} · {{ selectedJournal.period }}</span>
          </div>
          <p class="font-medium">
            {{ selectedJournal.description }}
          </p>
          <div class="grid grid-cols-2 gap-2 text-xs">
            <span class="text-[var(--ui-text-muted)]">来源</span><span>{{ selectedJournal.sourceLabel }}</span>
            <span class="text-[var(--ui-text-muted)]">业务关联</span><span>{{ selectedJournal.businessRef ? businessLabelOf(selectedJournal.businessRef) : '未关联' }}</span>
            <span class="text-[var(--ui-text-muted)]">制单人</span><span>{{ selectedJournal.preparedBy }}</span>
            <span class="text-[var(--ui-text-muted)]">复核人</span><span>{{ selectedJournal.reviewer ?? '—' }}</span>
            <span class="text-[var(--ui-text-muted)]">过账时间</span><span>{{ selectedJournal.postedAt ?? '—' }}</span>
            <span class="text-[var(--ui-text-muted)]">原凭证</span>
            <span>
              <UButton
                v-if="selectedJournal.originalId"
                size="xs"
                variant="ghost"
                :label="selectedJournal.originalId"
                data-testid="closing-journal-detail-original"
                @click="openOriginalOf(selectedJournal)"
              />
              <span v-else>—</span>
            </span>
            <span class="text-[var(--ui-text-muted)]">冲销凭证</span>
            <span>
              <UButton
                v-if="selectedJournal.reversalId"
                size="xs"
                variant="ghost"
                :label="selectedJournal.reversalId"
                data-testid="closing-journal-detail-reversal"
                @click="openReversalOf(selectedJournal)"
              />
              <span v-else>—</span>
            </span>
          </div>
          <div class="overflow-hidden rounded-md border border-[var(--ui-border)]">
            <table class="w-full text-xs">
              <thead class="bg-[var(--ui-bg-elevated)]">
                <tr>
                  <th class="px-2 py-1 text-left font-medium">
                    科目
                  </th>
                  <th class="px-2 py-1 text-right font-medium">
                    借方
                  </th>
                  <th class="px-2 py-1 text-right font-medium">
                    贷方
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="line in selectedJournal.lines" :key="line.accountCode + line.accountName" class="border-t border-[var(--ui-border)]">
                  <td class="px-2 py-1">
                    {{ line.accountCode }} {{ line.accountName }}
                  </td>
                  <td class="px-2 py-1 text-right tabular-nums">
                    {{ Number(line.debit) ? money(line.debit) : '—' }}
                  </td>
                  <td class="px-2 py-1 text-right tabular-nums">
                    {{ Number(line.credit) ? money(line.credit) : '—' }}
                  </td>
                </tr>
              </tbody>
              <tfoot class="bg-[var(--ui-bg-elevated)]">
                <tr>
                  <td class="px-2 py-1 font-medium">
                    合计
                  </td>
                  <td class="px-2 py-1 text-right font-medium tabular-nums">
                    {{ money(selectedJournal.debitTotal) }}
                  </td>
                  <td class="px-2 py-1 text-right font-medium tabular-nums">
                    {{ money(selectedJournal.creditTotal) }}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-between gap-2">
          <UButton
            v-if="selectedJournal?.businessRef"
            size="sm"
            color="warning"
            variant="soft"
            icon="i-carbon-unlink"
            label="移除业务关联"
            data-testid="closing-journal-unlink"
            @click="selectedJournal && unlinkBusiness(selectedJournal)"
          />
          <span v-else />
          <div class="flex gap-2">
            <UButton
              v-if="selectedJournal?.stage === 'posted'"
              size="sm"
              color="error"
              variant="soft"
              label="冲销凭证"
              @click="selectedJournal && openReverse(selectedJournal)"
            />
            <UButton
              size="sm"
              color="neutral"
              variant="soft"
              label="关闭"
              @click="journalDetailOpen = false"
            />
          </div>
        </div>
      </template>
    </USlideover>

    <UModal v-model:open="editOpen" title="编辑草稿凭证" description="保存后仍在草稿状态，需提交复核并由独立复核人过账。">
      <template #body>
        <div class="space-y-3">
          <div class="grid gap-3 md:grid-cols-2">
            <div>
              <p class="mb-1 text-xs text-[var(--ui-text-muted)]">
                凭证日期
              </p>
              <UInput
                v-model="editDate"
                type="date"
                size="sm"
                data-testid="closing-journal-edit-date"
              />
            </div>
            <div>
              <p class="mb-1 text-xs text-[var(--ui-text-muted)]">
                摘要
              </p>
              <UInput v-model="editDescription" size="sm" data-testid="closing-journal-edit-description" />
            </div>
          </div>
          <div class="space-y-2">
            <div v-for="(line, index) in editLines" :key="index" class="grid grid-cols-12 items-center gap-2">
              <div class="col-span-6 text-xs">
                {{ line.accountCode }} {{ line.accountName }}
              </div>
              <UInput
                v-model="line.debit"
                type="number"
                size="xs"
                class="col-span-3"
                :data-testid="'closing-journal-edit-debit-' + index"
              />
              <UInput
                v-model="line.credit"
                type="number"
                size="xs"
                class="col-span-3"
                :data-testid="'closing-journal-edit-credit-' + index"
              />
            </div>
          </div>
          <div v-if="editError" class="rounded-md border border-[var(--ui-error)]/40 bg-[var(--ui-error)]/10 px-3 py-2 text-sm text-[var(--ui-error)]" data-testid="closing-journal-edit-error">
            {{ editError }}
          </div>
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton
            size="sm"
            color="neutral"
            variant="soft"
            label="取消"
            @click="editOpen = false"
          />
          <UButton
            size="sm"
            icon="i-carbon-save"
            label="保存草稿"
            data-testid="closing-journal-edit-save"
            @click="saveEdit"
          />
        </div>
      </template>
    </UModal>

    <UModal v-model:open="reverseOpen" title="冲销已过账凭证" description="填写过账日期与原因，系统生成借贷方向相反的冲销凭证并回链原凭证。">
      <template #body>
        <div class="space-y-3">
          <div>
            <p class="mb-1 text-xs text-[var(--ui-text-muted)]">
              过账日期
            </p>
            <UInput
              v-model="reverseDate"
              type="date"
              size="sm"
              data-testid="closing-journal-reverse-date"
            />
          </div>
          <div>
            <p class="mb-1 text-xs text-[var(--ui-text-muted)]">
              冲销原因
            </p>
            <UTextarea
              v-model="reverseReason"
              :rows="2"
              size="sm"
              data-testid="closing-journal-reverse-reason"
            />
          </div>
          <div v-if="reverseError" class="rounded-md border border-[var(--ui-error)]/40 bg-[var(--ui-error)]/10 px-3 py-2 text-sm text-[var(--ui-error)]" data-testid="closing-journal-reverse-error">
            {{ reverseError }}
          </div>
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton
            size="sm"
            color="neutral"
            variant="soft"
            label="取消"
            @click="reverseOpen = false"
          />
          <UButton
            size="sm"
            color="error"
            icon="i-carbon-undo"
            label="生成冲销凭证"
            data-testid="closing-journal-reverse-save"
            @click="saveReverse"
          />
        </div>
      </template>
    </UModal>

    <USlideover
      v-model:open="periodDrawerOpen"
      title="期间详情"
      :ui="{ content: 'w-full sm:max-w-xl' }"
      data-testid="closing-period-detail"
    >
      <template #body>
        <div v-if="selectedPeriodRow" class="space-y-4">
          <div class="flex flex-wrap items-center gap-2">
            <span class="text-base font-semibold">{{ selectedPeriodRow.period }}</span>
            <UBadge :color="financePeriodStatusColors[selectedPeriodRow.status]" variant="subtle" :label="financePeriodStatusLabels[selectedPeriodRow.status]" />
            <span class="text-xs text-[var(--ui-text-muted)]">{{ yearOf(selectedPeriodRow.period) }} 年度 · 关账时间 {{ selectedPeriodRow.closedAt ?? '未关账' }}</span>
          </div>

          <div class="flex flex-wrap gap-2">
            <UButton
              v-if="selectedPeriodRow.status === 'open'"
              size="xs"
              icon="i-carbon-play"
              label="开始关账"
              data-testid="closing-period-detail-start"
              @click="startPeriodClosing(selectedPeriodRow)"
            />
            <UButton
              v-if="selectedPeriodRow.status === 'closing'"
              size="xs"
              variant="ghost"
              color="neutral"
              label="开启（撤回关账中）"
              data-testid="closing-period-detail-open"
              @click="reopenClosingPeriod(selectedPeriodRow)"
            />
            <UButton
              v-if="selectedPeriodRow.status === 'closing'"
              size="xs"
              icon="i-carbon-locked"
              label="清零关闭"
              data-testid="closing-period-detail-close"
              @click="closePeriod(selectedPeriodRow)"
            />
            <UButton
              v-if="selectedPeriodRow.status === 'closed'"
              size="xs"
              color="warning"
              variant="soft"
              icon="i-carbon-unlocked"
              label="原因重开"
              data-testid="closing-period-detail-reopen"
              @click="openPeriodReopen(selectedPeriodRow)"
            />
          </div>

          <div class="space-y-2">
            <p class="text-xs font-medium text-[var(--ui-text-muted)]">
              关账检查
            </p>
            <div
              v-for="check in periodChecks(selectedPeriodRow.period)"
              :key="check.key"
              class="flex items-start justify-between gap-2 rounded-md border border-[var(--ui-border)] px-3 py-2 text-sm"
              :data-testid="'closing-period-check-' + check.key"
            >
              <div>
                <p class="font-medium">
                  {{ check.label }}
                </p>
                <p class="text-xs text-[var(--ui-text-muted)]">
                  {{ check.detail }}
                </p>
              </div>
              <UBadge :color="check.passed ? 'success' : 'error'" variant="subtle" :label="check.passed ? '通过' : '阻断'" />
            </div>
          </div>

          <div class="space-y-2">
            <p class="text-xs font-medium text-[var(--ui-text-muted)]">
              状态历史
            </p>
            <div v-if="historyOf(selectedPeriodRow.period).length === 0" class="text-xs text-[var(--ui-text-muted)]">
              暂无状态变更记录。
            </div>
            <div v-for="event in historyOf(selectedPeriodRow.period)" :key="event.id" class="rounded-md border border-[var(--ui-border)] px-3 py-2 text-xs">
              <p class="font-medium">
                {{ event.action }} · {{ event.actor }} · {{ event.at }}
              </p>
              <p v-if="event.reason" class="mt-1 text-[var(--ui-text-muted)]">
                原因：{{ event.reason }}
              </p>
            </div>
          </div>

          <div v-if="periodError" class="rounded-md border border-[var(--ui-error)]/40 bg-[var(--ui-error)]/10 px-3 py-2 text-sm text-[var(--ui-error)]">
            {{ periodError }}
          </div>
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-end">
          <UButton
            size="sm"
            color="neutral"
            variant="soft"
            label="关闭"
            @click="periodDrawerOpen = false"
          />
        </div>
      </template>
    </USlideover>

    <UModal v-model:open="periodReopenOpen" title="原因重开期间" description="重开原因将记录到期间状态历史；已年结年度需先重开年度。">
      <template #body>
        <div class="space-y-3">
          <p class="text-sm">
            期间：<span class="font-medium">{{ reopeningPeriod }}</span>
          </p>
          <div>
            <p class="mb-1 text-xs text-[var(--ui-text-muted)]">
              重开原因
            </p>
            <UTextarea
              v-model="periodReopenReason"
              :rows="3"
              size="sm"
              placeholder="例如：补录 10 月银行手续费凭证"
              data-testid="closing-period-reopen-reason"
            />
          </div>
          <div v-if="periodReopenError" class="rounded-md border border-[var(--ui-error)]/40 bg-[var(--ui-error)]/10 px-3 py-2 text-sm text-[var(--ui-error)]" data-testid="closing-period-reopen-error">
            {{ periodReopenError }}
          </div>
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton
            size="sm"
            color="neutral"
            variant="soft"
            label="取消"
            @click="periodReopenOpen = false"
          />
          <UButton
            size="sm"
            color="warning"
            icon="i-carbon-unlocked"
            label="确认重开"
            data-testid="closing-period-reopen-save"
            @click="confirmPeriodReopen"
          />
        </div>
      </template>
    </UModal>

    <UModal
      v-model:open="yearPreviewOpen"
      :title="selectedYear + ' 年度年结预览'"
      :ui="{ content: 'w-full sm:max-w-2xl' }"
      data-testid="closing-year-preview-panel"
    >
      <template #body>
        <div class="space-y-4 text-sm">
          <div class="grid grid-cols-2 gap-2">
            <span class="text-[var(--ui-text-muted)]">年度</span><span>{{ selectedYear }}</span>
            <span class="text-[var(--ui-text-muted)]">本年利润</span><span class="font-medium tabular-nums">{{ money(selectedYearState?.profit ?? 0) }}</span>
            <span class="text-[var(--ui-text-muted)]">期间关账</span><span>{{ yearClosedPeriods }} / {{ yearPeriodRows.length }}</span>
            <span class="text-[var(--ui-text-muted)]">合伙人份额合计</span><span>{{ yearPartnerTotal }}%</span>
          </div>
          <div>
            <p class="mb-1 text-xs font-medium text-[var(--ui-text-muted)]">
              年结结转分录
            </p>
            <div class="overflow-hidden rounded-md border border-[var(--ui-border)]">
              <table class="w-full text-xs">
                <thead class="bg-[var(--ui-bg-elevated)]">
                  <tr>
                    <th class="px-2 py-1 text-left font-medium">
                      科目
                    </th>
                    <th class="px-2 py-1 text-right font-medium">
                      借方
                    </th>
                    <th class="px-2 py-1 text-right font-medium">
                      贷方
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="line in (yearCarryoverLines[selectedYear] ?? [])" :key="line.accountCode" class="border-t border-[var(--ui-border)]">
                    <td class="px-2 py-1">
                      {{ line.accountCode }} {{ line.accountName }}
                    </td>
                    <td class="px-2 py-1 text-right tabular-nums">
                      {{ Number(line.debit) ? money(line.debit) : '—' }}
                    </td>
                    <td class="px-2 py-1 text-right tabular-nums">
                      {{ Number(line.credit) ? money(line.credit) : '—' }}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
          <div>
            <p class="mb-1 text-xs font-medium text-[var(--ui-text-muted)]">
              合伙人份额分摊
            </p>
            <div class="overflow-hidden rounded-md border border-[var(--ui-border)]">
              <table class="w-full text-xs">
                <thead class="bg-[var(--ui-bg-elevated)]">
                  <tr>
                    <th class="px-2 py-1 text-left font-medium">
                      合伙人
                    </th>
                    <th class="px-2 py-1 text-right font-medium">
                      份额
                    </th>
                    <th class="px-2 py-1 text-right font-medium">
                      分摊金额
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="share in yearPartnerShares" :key="share.id" class="border-t border-[var(--ui-border)]">
                    <td class="px-2 py-1">
                      {{ share.name }}
                    </td>
                    <td class="px-2 py-1 text-right">
                      {{ share.share }}%
                    </td>
                    <td class="px-2 py-1 text-right tabular-nums">
                      {{ money(Number(selectedYearState?.profit ?? 0) * Number(share.share || 0) / 100) }}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-end">
          <UButton
            size="sm"
            color="neutral"
            variant="soft"
            label="关闭"
            @click="yearPreviewOpen = false"
          />
        </div>
      </template>
    </UModal>

    <UModal
      v-model:open="yearJournalOpen"
      :title="yearJournalTitle"
      :ui="{ content: 'w-full sm:max-w-xl' }"
      data-testid="closing-year-journal"
    >
      <template #body>
        <div class="space-y-3 text-sm">
          <p class="font-mono text-xs">
            {{ yearJournalId }}
          </p>
          <div class="overflow-hidden rounded-md border border-[var(--ui-border)]">
            <table class="w-full text-xs">
              <thead class="bg-[var(--ui-bg-elevated)]">
                <tr>
                  <th class="px-2 py-1 text-left font-medium">
                    科目
                  </th>
                  <th class="px-2 py-1 text-right font-medium">
                    借方
                  </th>
                  <th class="px-2 py-1 text-right font-medium">
                    贷方
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="line in yearJournalLines" :key="line.accountCode" class="border-t border-[var(--ui-border)]">
                  <td class="px-2 py-1">
                    {{ line.accountCode }} {{ line.accountName }}
                  </td>
                  <td class="px-2 py-1 text-right tabular-nums">
                    {{ Number(line.debit) ? money(line.debit) : '—' }}
                  </td>
                  <td class="px-2 py-1 text-right tabular-nums">
                    {{ Number(line.credit) ? money(line.credit) : '—' }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-end">
          <UButton
            size="sm"
            color="neutral"
            variant="soft"
            label="关闭"
            @click="yearJournalOpen = false"
          />
        </div>
      </template>
    </UModal>

    <UModal
      v-model:open="importOpen"
      title="科目文件导入"
      description="粘贴 CSV（编码,名称,类型,期初余额）；先预览逐行校验，再提交导入。"
      :ui="{ content: 'w-full sm:max-w-2xl' }"
      data-testid="chart-import-modal"
    >
      <template #body>
        <div class="space-y-3">
          <UTextarea
            v-model="importText"
            :rows="7"
            size="sm"
            class="font-mono"
            data-testid="chart-import-text"
          />
          <div class="flex flex-wrap gap-2">
            <UButton
              size="xs"
              variant="soft"
              icon="i-carbon-view"
              label="预览校验"
              data-testid="chart-import-preview"
              @click="parseImport"
            />
            <UButton
              size="xs"
              icon="i-carbon-upload"
              label="提交导入"
              data-testid="chart-import-commit"
              @click="commitImport"
            />
          </div>
          <div v-if="importRows.length > 0" class="overflow-hidden rounded-md border border-[var(--ui-border)]" data-testid="chart-import-rows">
            <table class="w-full text-xs">
              <thead class="bg-[var(--ui-bg-elevated)]">
                <tr>
                  <th class="px-2 py-1 text-left font-medium">
                    行
                  </th>
                  <th class="px-2 py-1 text-left font-medium">
                    编码
                  </th>
                  <th class="px-2 py-1 text-left font-medium">
                    名称
                  </th>
                  <th class="px-2 py-1 text-left font-medium">
                    类型
                  </th>
                  <th class="px-2 py-1 text-left font-medium">
                    校验
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in importRows" :key="row.line" class="border-t border-[var(--ui-border)]">
                  <td class="px-2 py-1">
                    {{ row.line }}
                  </td>
                  <td class="px-2 py-1 font-mono">
                    {{ row.code || '—' }}
                  </td>
                  <td class="px-2 py-1">
                    {{ row.name || '—' }}
                  </td>
                  <td class="px-2 py-1">
                    {{ row.type || '—' }}
                  </td>
                  <td class="px-2 py-1">
                    <span v-if="row.errors.length === 0" class="text-[var(--ui-success)]">可导入</span>
                    <span v-else class="text-[var(--ui-error)]">{{ row.errors.join('；') }}</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div v-if="importResult" class="rounded-md border border-[var(--ui-success)]/40 bg-[var(--ui-success)]/10 px-3 py-2 text-sm text-[var(--ui-success)]" data-testid="chart-import-result">
            {{ importResult }}
          </div>
          <div v-if="importError" class="rounded-md border border-[var(--ui-error)]/40 bg-[var(--ui-error)]/10 px-3 py-2 text-sm text-[var(--ui-error)]" data-testid="chart-import-error">
            {{ importError }}
          </div>
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-end">
          <UButton
            size="sm"
            color="neutral"
            variant="soft"
            label="关闭"
            @click="importOpen = false"
          />
        </div>
      </template>
    </UModal>

    <UModal v-model:open="mergeOpen" title="科目合并" description="选择源科目与目标科目；至少一个为空或无余额才允许合并。">
      <template #body>
        <div class="space-y-3">
          <div>
            <p class="mb-1 text-xs text-[var(--ui-text-muted)]">
              源科目（合并后归档）
            </p>
            <USelect
              v-model="mergeSource"
              :items="mergeOptions"
              size="sm"
              placeholder="选择源科目"
              data-testid="chart-merge-source"
            />
          </div>
          <div>
            <p class="mb-1 text-xs text-[var(--ui-text-muted)]">
              目标科目（承接余额）
            </p>
            <USelect
              v-model="mergeTarget"
              :items="mergeOptions"
              size="sm"
              placeholder="选择目标科目"
              data-testid="chart-merge-target"
            />
          </div>
          <div v-if="mergeSourceRow && mergeTargetRow" class="rounded-md bg-[var(--ui-bg-elevated)] px-3 py-2 text-xs">
            {{ mergeSourceRow.code }} 余额 {{ money(mergeSourceRow.balance) }} + {{ mergeTargetRow.code }} 余额 {{ money(mergeTargetRow.balance) }}
          </div>
          <div v-if="mergeError" class="rounded-md border border-[var(--ui-error)]/40 bg-[var(--ui-error)]/10 px-3 py-2 text-sm text-[var(--ui-error)]" data-testid="chart-merge-error">
            {{ mergeError }}
          </div>
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton
            size="sm"
            color="neutral"
            variant="soft"
            label="取消"
            @click="mergeOpen = false"
          />
          <UButton
            size="sm"
            color="neutral"
            icon="i-carbon-merge"
            label="确认合并"
            data-testid="chart-merge-save"
            @click="saveMerge"
          />
        </div>
      </template>
    </UModal>

    <UModal v-model:open="resetOpen" title="空账簿替换" description="将所有科目替换为 12 个标准模板科目；此操作仅本地演示。">
      <template #body>
        <div class="space-y-3 text-sm">
          <p class="text-[var(--ui-text-muted)]">
            替换后将删除当前全部科目与余额，只保留标准模板科目。请确认已完成备份。
          </p>
          <UCheckbox v-model="resetAck" label="我确认替换当前空账簿科目表" data-testid="chart-reset-ack" />
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton
            size="sm"
            color="neutral"
            variant="soft"
            label="取消"
            @click="resetOpen = false"
          />
          <UButton
            size="sm"
            color="error"
            icon="i-carbon-reset"
            label="二次确认替换"
            :disabled="!resetAck"
            data-testid="chart-reset-confirm"
            @click="confirmReset"
          />
        </div>
      </template>
    </UModal>

    <UModal
      v-model:open="partnerPreviewOpen"
      :title="partnerYear + ' 年度合伙人份额核对'"
      :ui="{ content: 'w-full sm:max-w-2xl' }"
      data-testid="closing-partner-preview-panel"
    >
      <template #body>
        <div class="space-y-4 text-sm">
          <div class="flex flex-wrap items-center gap-4">
            <span>本年利润 <span class="font-medium tabular-nums">{{ money(partnerYearProfit) }}</span></span>
            <UBadge :color="partnerTotalValid ? 'success' : 'error'" variant="subtle" :label="'份额合计 ' + partnerTotal + '%'" />
          </div>
          <div class="overflow-hidden rounded-md border border-[var(--ui-border)]">
            <table class="w-full text-xs">
              <thead class="bg-[var(--ui-bg-elevated)]">
                <tr>
                  <th class="px-2 py-1 text-left font-medium">
                    合伙人
                  </th>
                  <th class="px-2 py-1 text-right font-medium">
                    份额
                  </th>
                  <th class="px-2 py-1 text-right font-medium">
                    分摊金额
                  </th>
                  <th class="px-2 py-1 text-left font-medium">
                    资本科目
                  </th>
                  <th class="px-2 py-1 text-left font-medium">
                    提款科目
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in partnerAllocation" :key="row.id" class="border-t border-[var(--ui-border)]">
                  <td class="px-2 py-1">
                    {{ row.name }}
                  </td>
                  <td class="px-2 py-1 text-right">
                    {{ row.share }}%
                  </td>
                  <td class="px-2 py-1 text-right tabular-nums">
                    {{ money(row.amount) }}
                  </td>
                  <td class="px-2 py-1">
                    {{ accountNameOf(row.capitalAccountCode) }}
                  </td>
                  <td class="px-2 py-1">
                    {{ accountNameOf(row.drawingAccountCode) }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <p v-if="!partnerTotalValid" class="text-xs text-[var(--ui-error)]">
            份额合计不是 100%，请返回合伙人配置调整后再核对。
          </p>
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-end">
          <UButton
            size="sm"
            color="neutral"
            variant="soft"
            label="关闭"
            @click="partnerPreviewOpen = false"
          />
        </div>
      </template>
    </UModal>
  </div>
</template>

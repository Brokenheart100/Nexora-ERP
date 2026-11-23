<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import { reportKindSchema, type FinancialReport, type ReportBasis, type ReportKind, type ReportOptions } from '#shared/types/reporting'
import { useReportingApi } from '~/composables/api/useReportingApi'
import { useWorkspaceQuery } from '~/composables/api/useWorkspaceQuery'
import { useLedgerApi } from '~/composables/api/useLedgerApi'
import { bookmarkedReportWatermark, currentReportRange, reportNames, saveReportBlob, validReportRange } from '~/utils/finance/reporting'
import { displayDecimal } from '~/utils/api/decimal-display'

const props = defineProps<{ initialKind: ReportKind, tab: 'reports' | 'reporting' }>()
const route = useRoute()
const router = useRouter()
const api = useReportingApi()
const ledger = useLedgerApi()
const book = useWorkspaceQuery('report-book', '/finance', ledger.book)
const startsOn = computed(() => book.data?.settings?.startsOn ?? '')
const initialKind = () => reportKindSchema.safeParse(route.query.kind).data ?? props.initialKind
const kind = ref<ReportKind>(initialKind())
const draft = reactive({ from: '', through: '', compare: false, basis: 'accrual' as ReportBasis })
const selected = shallowRef<{ kind: ReportKind, options: ReportOptions, watermark?: string } | null>(null)
const rangeError = ref('')
const report = useWorkspaceQuery('financial-report', '/finance', (id, signal) => {
  const request = selected.value
  return request ? api.report(id, request.kind, request.options, signal, request.watermark) : Promise.resolve(null)
}, () => selected.value)
const workspace = computed(() => book.session.activeWorkspaceId)
const jobs = ref<{ refresh: () => Promise<void> } | null>(null)
const exportSection = ref<HTMLElement | null>(null)
const drillRow = shallowRef<{ key: string, name: string } | null>(null)
const drillOpen = ref(false)
const drillPage = ref(1)
const drill = useWorkspaceQuery('financial-report-drill', '/finance', (id, signal) => {
  const current = report.data
  if (!drillOpen.value || !drillRow.value || !current || !selected.value) return Promise.resolve(null)
  return api.drill(id, current.kind, drillRow.value.key, selected.value.options, current.watermark, drillPage.value, signal)
}, () => [selected.value, report.data?.watermark, drillOpen.value ? drillRow.value?.key : '', drillPage.value])

const pdfOpen = ref(false)
const pdfLoading = ref(false)
const pdfError = ref('')
const pdfUrl = ref('')
const pdfBlob = shallowRef<Blob | null>(null)
const pdfFilename = ref('')
let pdfRequest = 0

const kinds = Object.entries(reportNames).map(([value, label]) => ({ value, label }))
const bases = [{ value: 'accrual', label: '权责发生制' }, { value: 'cash', label: '收付实现制' }]
const sections: Record<string, string> = {
  asset: '资产', liability: '负债', equity: '权益', income: '收入', expense: '费用',
  operating: '经营活动', investing: '投资活动', financing: '筹资活动'
}
const totalLabels: Record<string, string> = {
  'debit': '借方合计', 'credit': '贷方合计', 'trial-debit': '借方合计', 'trial-credit': '贷方合计',
  'income': '收入合计', 'expense': '费用合计', 'profit': '净利润', 'assets': '资产合计',
  'liabilities': '负债合计', 'equity': '权益合计', 'balance-difference': '平衡差额',
  'cash-opening': '期初资金', 'cash-closing': '期末资金', 'cash-change': '资金净变动',
  'operating': '经营活动净额', 'investing': '投资活动净额', 'financing': '筹资活动净额',
  'equity-opening': '期初权益', 'owner-contribution': '业主投入', 'owner-drawing': '业主提款',
  'other-equity-adjustments': '其他权益变动', 'equity-closing': '期末权益'
}
type Line = FinancialReport['lines'][number]
const lineColumns = computed<TableColumn<Line>[]>(() => [
  { id: 'account', header: '科目及项目' },
  ...(report.data?.kind === 'trial-balance'
    ? [{ id: 'opening', header: '期初余额' }, { id: 'debit', header: '借方发生' }, { id: 'credit', header: '贷方发生' }]
    : []),
  { id: 'amount', header: '本期' },
  ...(report.data?.previousPeriod ? [{ id: 'previous', header: '上期' }, { id: 'difference', header: '变动' }] : []),
  { id: 'actions', header: '明细' }
])
const totalColumns = computed<TableColumn<FinancialReport['totals'][number]>[]>(() => [
  { accessorKey: 'key', header: '汇总项目' }, { accessorKey: 'amount', header: '本期' },
  ...(report.data?.previousPeriod ? [{ accessorKey: 'previous', header: '上期' }, { accessorKey: 'difference', header: '变动' }] : [])
])
const partnerColumns: TableColumn<NonNullable<FinancialReport['partners']>[number]>[] = [
  { accessorKey: 'code', header: '编码' }, { accessorKey: 'name', header: '合伙人' }, { accessorKey: 'share', header: '份额' },
  { accessorKey: 'opening', header: '期初' }, { accessorKey: 'contributions', header: '投入' },
  { accessorKey: 'drawings', header: '提款' }, { accessorKey: 'profitShare', header: '损益分配' }, { accessorKey: 'closing', header: '期末' }
]
const postingColumns = [
  { accessorKey: 'on', header: '过账日期' }, { accessorKey: 'sourceNumber', header: '凭证' },
  { accessorKey: 'memo', header: '摘要' }, { accessorKey: 'debit', header: '借方' }, { accessorKey: 'credit', header: '贷方' },
  { accessorKey: 'reportAmount', header: '计入报表' }
]
const money = (value: string | null | undefined) => value == null ? '—' : displayDecimal(value, report.data?.minorUnits ?? 0)

function clearPdf() {
  pdfRequest++
  if (pdfUrl.value) URL.revokeObjectURL(pdfUrl.value)
  pdfUrl.value = ''
  pdfBlob.value = null
  pdfLoading.value = false
  pdfError.value = ''
}
watch(pdfOpen, (value) => {
  if (!value) clearPdf()
})
onScopeDispose(clearPdf)

watch(() => book.owner, () => {
  kind.value = initialKind()
  draft.compare = false
  draft.basis = 'accrual'
  draft.from = ''
  draft.through = ''
  selected.value = null
  rangeError.value = ''
  drillOpen.value = false
  pdfOpen.value = false
  clearPdf()
}, { flush: 'sync' })

function apply(watermark?: string) {
  if (!startsOn.value || !validReportRange(draft, startsOn.value)) {
    rangeError.value = '请选择有效区间，起始日期须在账簿启用日或之后。'
    return
  }
  rangeError.value = ''
  const basis = kind.value === 'cash-flow' ? 'cash' : kind.value === 'profit-and-loss' ? draft.basis : 'accrual'
  drillOpen.value = false
  pdfOpen.value = false
  const next = { kind: kind.value, options: { from: draft.from, through: draft.through, compare: draft.compare, basis }, watermark }
  if (JSON.stringify(next) === JSON.stringify(selected.value)) void report.refresh()
  else selected.value = next
}

watch(startsOn, (start) => {
  if (!start || selected.value) return
  const requested = { from: String(route.query.from ?? ''), through: String(route.query.through ?? '') }
  const useRequested = validReportRange(requested, start)
  Object.assign(draft, useRequested ? requested : currentReportRange(start))
  if (useRequested) {
    draft.basis = route.query.basis === 'cash' ? 'cash' : 'accrual'
    draft.compare = route.query.compare === 'true'
  }
  const watermark = bookmarkedReportWatermark(route.query, workspace.value)
  apply(useRequested ? watermark : undefined)
}, { immediate: true })

watch(() => report.data, (snapshot) => {
  if (!snapshot || route.path !== '/finance' || !selected.value) return
  void router.replace({ query: { ...route.query, ...snapshot.period, tab: props.tab, kind: snapshot.kind, basis: snapshot.basis,
    workspace: workspace.value, snapshotWorkspace: workspace.value,
    compare: String(selected.value.options.compare), watermark: String(snapshot.watermark) } })
})

function openDrill(line: Line) {
  drillRow.value = { key: line.row.key, name: line.row.name }
  drillPage.value = 1
  drillOpen.value = true
}

function journal(id: string) {
  return { path: '/finance', query: { workspace: workspace.value, tab: 'journals', journal: id } }
}

async function previewPdf() {
  if (!report.data || !selected.value) return
  clearPdf()
  const request = pdfRequest
  const snapshot = report.data
  const options = selected.value.options
  pdfOpen.value = true
  pdfLoading.value = true
  try {
    const blob = await api.pdf(workspace.value, snapshot.kind, options, snapshot.watermark)
    if (await blob.slice(0, 5).text() !== '%PDF-') throw new Error('文件不是有效的报表 PDF。')
    if (request !== pdfRequest) return
    pdfBlob.value = blob
    pdfUrl.value = URL.createObjectURL(blob)
    pdfFilename.value = snapshot.kind + '-' + snapshot.watermark + '.pdf'
  } catch (error) {
    if (request === pdfRequest) pdfError.value = error instanceof Error ? error.message : '无法生成报表 PDF。'
  } finally {
    if (request === pdfRequest) pdfLoading.value = false
  }
}

async function refresh() {
  await Promise.all([book.refresh(), report.refresh(), jobs.value?.refresh()])
}
defineExpose({ refresh })
</script>

<template>
  <section class="space-y-4" data-testid="live-financial-reports">
    <UCard class="rounded-sm">
      <template #header>
        <div class="flex flex-wrap items-center justify-between gap-2">
          <h2 class="font-semibold">
            财务报表
          </h2>
          <UButton
            label="查看导出任务"
            variant="ghost"
            color="neutral"
            @click="exportSection?.scrollIntoView({ block: 'start' })"
          />
        </div>
      </template>
      <USkeleton v-if="book.loading && !book.data" class="h-20 w-full" />
      <UAlert v-else-if="book.problem" color="error" :title="book.problem" />
      <UAlert v-else-if="!startsOn" color="warning" title="请先初始化账簿。">
        <template #actions>
          <UButton label="打开账簿设置" variant="outline" :to="{ query: { workspace, tab: 'workbench' } }" />
        </template>
      </UAlert>
      <template v-else>
        <form class="flex flex-wrap items-end gap-3" @submit.prevent="apply()">
          <UFormField label="报表">
            <USelect
              v-model="kind"
              :items="kinds"
              class="w-40"
              data-testid="report-kind"
            />
          </UFormField>
          <UFormField label="起始日期" :error="rangeError || undefined">
            <UInput
              v-model="draft.from"
              type="date"
              :min="startsOn"
              data-testid="report-from"
            />
          </UFormField>
          <UFormField label="截止日期">
            <UInput
              v-model="draft.through"
              type="date"
              :min="draft.from"
              data-testid="report-through"
            />
          </UFormField>
          <UFormField v-if="kind === 'profit-and-loss'" label="确认口径">
            <USelect v-model="draft.basis" :items="bases" data-testid="report-basis" />
          </UFormField>
          <UCheckbox
            v-model="draft.compare"
            label="上期比较"
            class="mb-2"
            data-testid="report-compare"
          />
          <UButton
            label="查询"
            type="submit"
            :loading="report.loading"
            data-testid="report-apply"
          />
        </form>
        <USkeleton v-if="report.loading && !report.data" class="mt-4 h-28 w-full" />
        <UAlert
          v-else-if="report.problem"
          class="mt-4"
          color="error"
          :title="report.problem"
        />
        <div v-else-if="report.data" class="mt-4 space-y-4">
          <div class="flex flex-wrap items-center justify-between gap-2 border-y border-default py-3">
            <div class="text-sm" data-testid="report-snapshot">
              <p class="font-medium">
                {{ reportNames[report.data.kind] }}
              </p>
              <p class="text-muted">
                {{ report.data.period.from }} 至 {{ report.data.period.through }} · {{ report.data.currency }}
                · {{ report.data.basis === 'cash' ? '收付实现制' : '权责发生制' }} · 过账水位 {{ report.data.watermark }}
              </p>
              <p v-if="report.data.previousPeriod" class="text-muted">
                上期 {{ report.data.previousPeriod.from }} 至 {{ report.data.previousPeriod.through }}
              </p>
              <p v-else-if="selected?.options.compare" class="text-muted">
                账簿内没有可比较的上一期间。
              </p>
            </div>
            <UButton
              label="预览 PDF"
              icon="i-carbon-document-pdf"
              variant="outline"
              data-testid="report-pdf-preview"
              @click="previewPdf"
            />
          </div>
          <UTable
            v-if="report.data.lines.length"
            :columns="lineColumns"
            :data="report.data.lines"
            class="nx-table"
            data-testid="report-lines"
          >
            <template #account-cell="{ row }">
              <span>{{ row.original.row.code }} {{ row.original.row.name }}</span>
              <span class="ml-1 text-xs text-muted">{{ sections[row.original.row.section] ?? row.original.row.section }}</span>
            </template>
            <template #opening-cell="{ row }">
              {{ money(row.original.row.opening) }}
            </template>
            <template #debit-cell="{ row }">
              {{ money(row.original.row.debit) }}
            </template>
            <template #credit-cell="{ row }">
              {{ money(row.original.row.credit) }}
            </template>
            <template #amount-cell="{ row }">
              {{ money(row.original.row.amount) }}
            </template>
            <template #previous-cell="{ row }">
              {{ money(row.original.previous) }}
            </template>
            <template #difference-cell="{ row }">
              {{ money(row.original.difference) }}
            </template>
            <template #actions-cell="{ row }">
              <UButton
                label="过账明细"
                color="neutral"
                variant="ghost"
                size="xs"
                :data-testid="'report-row-' + row.original.row.key"
                @click="openDrill(row.original)"
              />
            </template>
          </UTable>
          <UTable
            :columns="totalColumns"
            :data="report.data.totals"
            class="nx-table"
            data-testid="report-totals"
          >
            <template #key-cell="{ row }">
              {{ totalLabels[row.original.key] ?? row.original.key }}
            </template>
            <template #amount-cell="{ row }">
              {{ money(row.original.amount) }}
            </template>
            <template #previous-cell="{ row }">
              {{ money(row.original.previous) }}
            </template>
            <template #difference-cell="{ row }">
              {{ money(row.original.difference) }}
            </template>
          </UTable>
          <section v-if="report.data.partners?.length" data-testid="report-partners">
            <h3 class="mb-2 text-sm font-medium">
              合伙权益
            </h3>
            <UTable :columns="partnerColumns" :data="report.data.partners" class="nx-table" />
          </section>
        </div>
      </template>
    </UCard>
    <div ref="exportSection">
      <FinanceReportJobs ref="jobs" :report="report.data" :compare="selected?.options.compare === true" />
    </div>
    <USlideover v-model:open="drillOpen" :title="drillRow?.name || '过账明细'" :ui="{ content: 'sm:max-w-3xl' }">
      <template #body>
        <USkeleton v-if="drill.loading && !drill.data" class="h-24 w-full" />
        <UAlert v-else-if="drill.problem" color="error" :title="drill.problem" />
        <div v-else-if="drill.data" class="space-y-3" data-testid="report-drill">
          <p class="text-xs text-muted">
            {{ drill.data.period.from }} 至 {{ drill.data.period.through }} · 过账水位 {{ drill.data.watermark }}
          </p>
          <UTable :data="drill.data.postings" :columns="postingColumns" class="nx-table">
            <template #sourceNumber-cell="{ row }">
              <UButton
                :to="journal(row.original.journalId)"
                :label="row.original.sourceNumber"
                size="xs"
                variant="link"
              />
            </template>
            <template #empty>
              该行在这一快照中没有过账明细。
            </template>
          </UTable>
          <div class="flex items-center gap-2">
            <UButton
              label="上一页"
              variant="ghost"
              :disabled="drillPage === 1"
              @click="drillPage--"
            />
            <span class="text-xs text-muted">第 {{ drillPage }} 页</span>
            <UButton
              label="下一页"
              variant="ghost"
              :disabled="!drill.data.hasMore"
              @click="drillPage++"
            />
          </div>
        </div>
      </template>
    </USlideover>
    <USlideover v-model:open="pdfOpen" title="报表 PDF" :ui="{ content: 'sm:max-w-4xl' }">
      <template #body>
        <p v-if="pdfLoading" class="text-sm text-muted">
          正在生成当前快照的 PDF。
        </p>
        <UAlert v-else-if="pdfError" color="error" :title="pdfError" />
        <div v-else-if="pdfUrl && pdfBlob" class="space-y-3">
          <UButton
            label="下载 PDF"
            icon="i-carbon-download"
            data-testid="report-pdf-download"
            @click="saveReportBlob(pdfBlob, pdfFilename)"
          />
          <iframe
            :src="pdfUrl"
            title="当前报表 PDF"
            class="h-[68vh] w-full rounded-sm border border-default"
            data-testid="report-pdf-frame"
          />
        </div>
      </template>
    </USlideover>
  </section>
</template>

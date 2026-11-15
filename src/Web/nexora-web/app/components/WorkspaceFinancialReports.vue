<script setup lang="ts">
const kinds = {
  'trial-balance': '试算平衡表',
  'profit-and-loss': '利润表',
  'balance-sheet': '资产负债表',
  'cash-flow': '现金流量表',
} as const
type Kind = keyof typeof kinds
interface Period { from: string; through: string }
interface MoneyComparison { previous: string | null; difference: string | null }
interface ReportLine extends MoneyComparison {
  row: { key: string; code: string; name: string; section: string; amount: string; opening: string | null; debit: string | null; credit: string | null }
}
interface ReportTotal extends MoneyComparison { key: string; amount: string }
interface Report {
  kind: Kind; basis: 'accrual' | 'cash'; currency: string; minorUnits: number; period: Period; previousPeriod: Period | null
  watermark: number; lines: ReportLine[]; totals: ReportTotal[]
}
interface Posting {
  journalId: string; postingNumber: number; on: string; sourceNumber: string; memo: string
  accountId: string; code: string; name: string; debit: string; credit: string; reportAmount?: string | null
}
interface Drill { period: Period; watermark: number; hasMore: boolean; postings: Posting[] }
interface ExportJob { id: string; kind: Kind; watermark: number; completedAtUtc: string | null }
interface JournalDetail {
  journal: { sourceNumber: string; memo: string; on: string }
  lines: { accountId: string; code: string; name: string; debit: string; credit: string; reportAmount?: string | null }[]
}
const props = defineProps<{ workspaceId: string; workspaceName: string }>()
const base = computed(() => '/bff/api/finance/workspaces/' + props.workspaceId)
const startedOn = ref('')
const input = reactive({ kind: 'trial-balance' as Kind, basis: 'accrual', from: '', through: '', compare: true })
const result = shallowRef<Report>()
const drill = shallowRef<{ label: string; key: string; period: Period; page: number; detail: Drill }>()
const journal = shallowRef<JournalDetail>()
const busy = ref(false)
const notice = ref('')
const jobs = shallowRef<ExportJob[]>()
const mutate = useWorkspaceMutation()
const exportPath = computed(() => base.value + '/report-exports')
const sections: Record<string, string> = { asset: '资产', liability: '负债', equity: '权益', income: '收入', expense: '费用', operating: '经营活动', investing: '投资活动', financing: '筹资活动', unclassified: '待分类' }
const totalLabels: Record<string, string> = { 'opening-net': '期初借贷差', 'period-debit': '本期借方合计', 'period-credit': '本期贷方合计',
  'closing-net': '期末借贷差', income: '收入合计', expense: '费用合计', profit: '净利润',
  assets: '资产合计', liabilities: '负债合计', equity: '权益合计', 'balance-difference': '资产负债表平衡差',
  'cash-opening': '期初现金', operating: '经营活动净额', investing: '投资活动净额', financing: '筹资活动净额',
  unclassified: '待分类净额', 'cash-change': '现金净增加额', 'cash-closing': '期末现金' }
const amount = (value: string | null) => value === null ? '—' : formatDecimal(value, result.value?.minorUnits ?? 2)
const basisLabel = (report: Report) => report.kind === 'cash-flow' ? '实际现金流' : report.basis === 'cash' ? '收付实现制' : '权责发生制'
const dates = (period: Period) => period.from + ' 至 ' + period.through

async function run(action: () => Promise<void>) {
  if (busy.value) return
  busy.value = true
  notice.value = ''
  try { await action() }
  catch (error) {
    const failure = error as { statusCode?: number; data?: { detail?: string } }
    notice.value = failure.data?.detail ?? (failure.statusCode === 403 ? '当前成员无财务报表读取权限。' : '无法读取财务报表，请检查账簿和期间。')
  } finally { busy.value = false }
}
async function open() {
  const home = await $fetch<{ startsOn: string }>(base.value + '/ledger', { retry: 0 })
  startedOn.value = home.startsOn
  const local = new Date()
  const month = [local.getFullYear(), String(local.getMonth() + 1).padStart(2, '0')].join('-')
  const today = month + '-' + String(local.getDate()).padStart(2, '0')
  input.from = month + '-01' < home.startsOn ? home.startsOn : month + '-01'
  input.through = today < input.from ? input.from : today
  await query()
}
async function query() {
  drill.value = undefined
  journal.value = undefined
  result.value = undefined
  result.value = await $fetch<Report>(base.value + '/reports/' + input.kind, {
    query: { from: input.from, through: input.through, compare: input.compare,
      basis: input.kind === 'cash-flow' ? 'cash' : input.kind === 'profit-and-loss' ? input.basis : 'accrual' }, retry: 0,
  })
}
async function readDrill(key: string, label: string, period: Period, page = 1) {
  const snapshot = result.value
  if (!snapshot) return
  journal.value = undefined
  const detail = await $fetch<Drill>(base.value + '/reports/' + snapshot.kind + '/rows/' + key,
    { query: { ...period, watermark: snapshot.watermark, basis: snapshot.basis, page }, retry: 0 })
  drill.value = { key, label, period, page, detail }
}
async function readJournal(id: string) {
  journal.value = await $fetch<JournalDetail>(base.value + '/ledger/journals/' + id, { retry: 0 })
}
function csvText(value: string) {
  const safe = /^\s*[=+\-@]|^[\t\r\n]/.test(value) ? "'" + value : value
  return '"' + safe.replaceAll('"', '""') + '"'
}
function exportCsv() {
  const report = result.value
  if (!report) return
  const trial = report.kind === 'trial-balance'
  const metadata = [
    ['工作区', props.workspaceName], ['报表', kinds[report.kind]], ['口径', basisLabel(report)],
    ['本期', dates(report.period)], ['上期', report.previousPeriod ? dates(report.previousPeriod) : ''],
    ['币种', report.currency], ['过账水位', String(report.watermark)],
  ].map(row => row.map(csvText))
  const header = ['科目编码', '科目名称', '类别', ...(trial ? ['期初', '本期借方', '本期贷方'] : []),
    trial ? '期末余额' : '本期金额', '上期金额', '变动'].map(csvText)
  const rows = report.lines.map(({ row, previous, difference }) =>
    [csvText(row.code), csvText(row.name), csvText(sections[row.section] ?? row.section),
      ...(trial ? [row.opening, row.debit, row.credit] : []), row.amount, previous, difference])
  const totals = report.totals.map(row => ['', csvText(totalLabels[row.key] ?? row.key), '', ...(trial ? ['', '', ''] : []),
    row.amount, row.previous, row.difference])
  const text = [...metadata, [], header, ...rows, ...totals].map(row => row.join(',')).join('\r\n')
  const url = URL.createObjectURL(new Blob(['\uFEFF', text], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = report.kind + '-' + report.period.from + '-' + report.period.through + '.csv'
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
async function listExports() {
  jobs.value = await $fetch<ExportJob[]>(exportPath.value, { retry: 0 })
}
async function queueExport() {
  const report = result.value
  if (!report) return
  await mutate('report-export', exportPath.value, 'POST', {
    ...report.period, kind: report.kind, basis: report.basis, watermark: report.watermark, compare: report.previousPeriod !== null,
  })
  await listExports()
}
async function rebuildExport(id: string) {
  await mutate('report-export-rebuild', exportPath.value + '/' + id + '/rebuild', 'POST', {})
  await listExports()
}
function printReport() {
  const root = document.documentElement
  root.setAttribute('data-print-financial', '')
  const clear = () => root.removeAttribute('data-print-financial')
  window.addEventListener('afterprint', clear, { once: true })
  try { window.print() }
  catch { clear() }
}

onMounted(() => { void open().catch(() => { /* 首屏加载失败时保留空状态，可用模块内按钮重试 */ }) })
</script>

<template>
  <section class="card financial-reports" data-testid="financial-reports" aria-labelledby="financial-reports-heading">
    <h2 id="financial-reports-heading" class="report-screen"><UIcon class="mr-2 inline-block size-[1.08em] align-[-0.16em] text-nx-primary" name="i-lucide-file-spreadsheet" aria-hidden="true" />财务报表</h2>
    <UButton v-if="!startedOn" class="report-screen" variant="outline" color="neutral" size="sm" type="button" :disabled="busy" @click="run(open)">打开财务报表</UButton>
    <form v-else class="report-screen" @submit.prevent="run(query)">
      <fieldset :disabled="busy">
        <legend>财务报表查询</legend>
        <label>报表类型<select v-model="input.kind"><option v-for="(label, key) in kinds" :key="key" :value="key">{{ label }}</option></select></label>
        <label v-if="input.kind === 'profit-and-loss'">报表口径<select v-model="input.basis">
          <option value="accrual">权责发生制</option><option value="cash">收付实现制</option>
        </select></label>
        <label>报表开始日期<input v-model="input.from" type="date" :min="startedOn" required></label>
        <label>报表截止日期<input v-model="input.through" type="date" :min="input.from || startedOn" required></label>
        <label class="comparison"><input v-model="input.compare" type="checkbox"> 对比上一等长期间</label>
        <UButton type="submit" color="primary">查询财务报表</UButton>
      </fieldset>
    </form>
    <UAlert v-if="notice" role="status" class="report-screen" :description="notice" />
    <div v-if="result" class="report-result">
      <h3>{{ kinds[result.kind] }}</h3>
      <p>{{ workspaceName }} · {{ basisLabel(result) }} · {{ result.currency }} · 过账水位 {{ result.watermark }}</p>
      <p>本期 {{ dates(result.period) }}<template v-if="result.previousPeriod"> · 上期 {{ dates(result.previousPeriod) }}</template></p>
      <div class="mb-3 mt-2 flex flex-wrap gap-2 report-screen">
        <UButton variant="outline" color="neutral" size="sm" type="button" @click="exportCsv">导出报表 CSV</UButton>
        <UButton variant="outline" color="neutral" size="sm" type="button" :disabled="busy" @click="run(queueExport)">创建导出任务</UButton>
        <UButton variant="outline" color="neutral" size="sm" type="button" :disabled="busy" @click="run(listExports)">刷新导出任务</UButton>
        <UButton variant="outline" color="neutral" size="sm" type="button" @click="printReport">打印财务报表</UButton>
      </div>
      <section v-if="jobs" class="report-screen" aria-label="报表导出任务">
        <p v-if="!jobs.length">当前没有导出任务。</p>
        <p>导出任务按申请人隔离，最多保留最近 20 个；排队中的任务可重新生成。</p>
        <ul><li v-for="job in jobs" :key="job.id">
          {{ kinds[job.kind] }} · 过账水位 {{ job.watermark }} · {{ job.completedAtUtc ? '已完成' : '排队中' }}
          <a v-if="job.completedAtUtc" :href="exportPath + '/' + job.id + '/file'">下载 CSV</a>
          <UButton variant="outline" color="neutral" size="xs" type="button" :disabled="busy" @click="run(() => rebuildExport(job.id))">{{ job.completedAtUtc ? '重建文件' : '重新生成' }}</UButton>
        </li></ul>
      </section>
      <dl class="totals">
        <template v-for="total in result.totals" :key="total.key">
          <dt>{{ totalLabels[total.key] }}</dt>
          <dd>{{ amount(total.amount) }}<template v-if="result.previousPeriod"> · 上期 {{ amount(total.previous) }} · 变动 {{ amount(total.difference) }}</template></dd>
        </template>
      </dl>
      <div class="table-scroll">
        <table>
          <thead><tr>
            <th scope="col">科目</th><th scope="col">类别</th>
            <template v-if="result.kind === 'trial-balance'">
              <th scope="col">期初</th><th scope="col">本期借方</th><th scope="col">本期贷方</th>
            </template>
            <th scope="col">{{ result.kind === 'trial-balance' ? '期末余额' : '本期金额' }}</th>
            <template v-if="result.previousPeriod"><th scope="col">上期金额</th><th scope="col">变动</th></template>
            <th scope="col" class="report-screen">钻取</th>
          </tr></thead>
          <tbody><tr v-for="line in result.lines" :key="line.row.key">
            <th scope="row">{{ [line.row.code, line.row.name].filter(Boolean).join(' · ') }}</th>
            <td>{{ sections[line.row.section] }}</td>
            <template v-if="result.kind === 'trial-balance'"><td>{{ amount(line.row.opening) }}</td>
              <td>{{ amount(line.row.debit) }}</td><td>{{ amount(line.row.credit) }}</td></template>
            <td>{{ amount(line.row.amount) }}</td>
            <template v-if="result.previousPeriod"><td>{{ amount(line.previous) }}</td><td>{{ amount(line.difference) }}</td></template>
            <td class="report-screen">
              <UButton variant="outline" color="neutral" size="xs" type="button" :disabled="busy" :aria-label="'钻取本期 ' + line.row.name"
                @click="run(() => readDrill(line.row.key, line.row.name, result!.period))">本期</UButton>
              <UButton
v-if="result.previousPeriod" variant="outline" color="neutral" size="xs" type="button" :disabled="busy" :aria-label="'钻取上期 ' + line.row.name"
                @click="run(() => readDrill(line.row.key, line.row.name, result!.previousPeriod!))">上期</UButton>
            </td>
          </tr></tbody>
        </table>
        <p v-if="!result.lines.length">该期间暂无符合条件的过账科目。</p>
      </div>
    </div>
    <section v-if="drill" class="report-screen" aria-label="报表凭证明细">
      <h3>{{ drill.label }} · 过账明细</h3>
      <p>{{ dates(drill.detail.period) }} · 过账水位 {{ drill.detail.watermark }}</p>
      <ul><li v-for="(entry, index) in drill.detail.postings" :key="index">
        {{ entry.on }} · {{ entry.code }} {{ entry.name }}
        <template v-if="entry.reportAmount != null"> · 计入报表 {{ amount(entry.reportAmount) }}</template>
        <template v-else> · 借 {{ amount(entry.debit) }} · 贷 {{ amount(entry.credit) }}</template>
        <UButton variant="outline" color="neutral" size="xs" type="button" :disabled="busy" @click="run(() => readJournal(entry.journalId))">查看凭证 {{ entry.sourceNumber }}</UButton>
      </li></ul>
      <p v-if="!drill.detail.postings.length">该期间无对应凭证。</p>
      <UButton
v-if="drill.page > 1" variant="outline" color="neutral" size="sm" type="button" :disabled="busy"
        @click="run(() => readDrill(drill!.key, drill!.label, drill!.period, drill!.page - 1))">上一页明细</UButton>
      <UButton
v-if="drill.detail.hasMore" variant="outline" color="neutral" size="sm" type="button" :disabled="busy"
        @click="run(() => readDrill(drill!.key, drill!.label, drill!.period, drill!.page + 1))">下一页明细</UButton>
    </section>
    <section v-if="journal" class="report-screen" aria-label="报表来源凭证">
      <h3>{{ journal.journal.sourceNumber }} · {{ journal.journal.on }}</h3>
      <p>{{ journal.journal.memo }}</p>
      <ul><li v-for="(line, index) in journal.lines" :key="index">{{ line.code }} {{ line.name }} · 借 {{ amount(line.debit) }} · 贷 {{ amount(line.credit) }}</li></ul>
    </section>
  </section>
</template>

<style scoped>
.financial-reports { margin-top: 24px }
fieldset { display: flex; flex-wrap: wrap; gap: 10px; align-items: end; min-width: 0 }
fieldset { margin: 12px 0; border: 1px solid #d1d9e6; border-radius: 8px }
label { display: grid; gap: 4px }
.comparison { display: flex; align-items: center }
.comparison input { width: auto }
.table-scroll { overflow-x: auto }
table { width: 100%; border-collapse: collapse; font-size: 14px }
th, td { border-bottom: 1px solid #e4e9f0; padding: 8px; text-align: right }
th:first-child { text-align: left; overflow-wrap: anywhere }
td { white-space: nowrap }
.report-result { padding: 18px; margin-top: 8px; background: #fbfcff; border: 1px solid #e8edf5; border-radius: 14px }
.report-result > h3 { margin-top: 0 }
.report-result > p { font-size: 12.5px; color: var(--nx-ink-3) }
.report-result .totals { display: grid; grid-template-columns: max-content 1fr; gap: 2px 16px; padding: 10px 14px; margin: 14px 0; background: #fff; border: 1px solid var(--nx-border); border-radius: 10px }
.report-result .totals dt { padding: 4px 0; font-size: 12px; color: var(--nx-ink-3) }
.report-result .totals dd { margin: 0; padding: 4px 0; font-size: 12.5px; font-weight: 650; color: var(--nx-ink-2) }
html.dark .report-result { background: var(--nx-surface-muted); border-color: var(--nx-border) }
html.dark .report-result .totals { background: var(--nx-surface-muted); border-color: var(--nx-border) }
@media (max-width: 700px) {
  .report-result { padding: 13px }
}
li { margin: 6px 0; overflow-wrap: anywhere }
</style>

<style>
@media print {
  html[data-print-financial] .shell { display: block }
  html[data-print-financial] .shell > aside,
  html[data-print-financial] .shell > main > :not(.console),
  html[data-print-financial] .console > :not(#console-panel),
  html[data-print-financial] #console-panel > :not(.financial-reports),
  html[data-print-financial] .financial-reports .report-screen { display: none !important }
  html[data-print-financial] .shell > main,
  html[data-print-financial] .financial-reports { margin: 0; padding: 0; box-shadow: none; width: 100%; max-width: none }
  html[data-print-financial] .table-scroll { overflow: visible }
  html[data-print-financial] .financial-reports tr { break-inside: avoid }
}
</style>

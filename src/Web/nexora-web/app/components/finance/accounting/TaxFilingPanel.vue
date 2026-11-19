<script setup lang="ts">
type Cycle = 'monthly' | 'quarterly'
type Basis = 'accrual' | 'cash'
interface Calendar {
  cycle: Cycle; basis: Basis; version: number; lockedThrough: string | null
  canManage: boolean; canLock: boolean; canChangeCalendar: boolean
}
interface Filing { id: string; reference: string; version: number; lockBooks: boolean; reason: string | null }
interface CodeTotal { code: string; input: string; output: string; netPayable: string }
interface Source {
  on: string; journalId: string; documentNumber: string; kind: string; direction: string; code: string; amount: string
  taxDocumentNumber?: string
}
interface Totals {
  period: { from: string; through: string }; currency: string; fingerprint: string
  basis: Basis; input: string; output: string; netPayable: string; codes: CodeTotal[]; sources: Source[]
}
interface Period { current: Totals; filings: Filing[]; changedSinceFiling: boolean; lockedThrough: string | null }
interface Filed { filing: Filing; snapshot: Totals }

const props = defineProps<{ workspaceId: string }>()
const path = computed(() => `/bff/api/finance/workspaces/${props.workspaceId}/tax`)
const calendar = shallowRef<Calendar>()
const report = shallowRef<Period>()
const selectedFiling = shallowRef<Filed>()
const month = ref(new Date().toISOString().slice(0, 7))
const cycle = ref<Cycle>('monthly')
const basis = ref<Basis>('accrual')
const options = [{ value: 'monthly', label: '按月' }, { value: 'quarterly', label: '按季' }]
const basisLabels: Record<Basis, string> = { accrual: '权责发生制', cash: '收付实现制' }
const basisOptions = [{ value: 'accrual', label: basisLabels.accrual }, { value: 'cash', label: basisLabels.cash }]
const reference = ref('')
const reason = ref('')
const lockBooks = ref(false)
const busy = ref(false)
const error = ref('')
const { exporting, error: exportError, exportCsv } = useCsvExport()
const submit = useWorkspaceMutation()
const periodPath = computed(() => `${path.value}/periods/${month.value}-01`)
const latest = computed(() => report.value?.filings[0])
const display = computed(() => selectedFiling.value?.snapshot ?? report.value?.current)
const columns = [
  { header: '业务日期', value: (row: Source) => row.on },
  { header: '单据编号', value: (row: Source) => row.documentNumber },
  { header: '关联税务单据', value: (row: Source) => row.taxDocumentNumber ?? '' },
  { header: '单据类型', value: (row: Source) => row.kind },
  { header: '凭证 ID', value: (row: Source) => row.journalId },
  { header: '进销项', value: (row: Source) => row.direction === 'input' ? '进项' : '销项' },
  { header: '税项', value: (row: Source) => row.code },
  { header: '税额', value: (row: Source) => row.amount },
]

watch(month, () => { report.value = undefined; selectedFiling.value = undefined })

async function run(action: () => Promise<void>) {
  if (busy.value) return
  busy.value = true
  error.value = ''
  try { await action() }
  catch (failure) {
    error.value = (failure as { data?: { detail?: string } }).data?.detail ?? '未能读取或保存纳税申报。'
  } finally { busy.value = false }
}

async function readCalendar() {
  calendar.value = await $fetch<Calendar>(`${path.value}/calendar`, { retry: 0 })
  cycle.value = calendar.value.cycle
  basis.value = calendar.value.basis
}

async function readPeriod() {
  report.value = await $fetch<Period>(periodPath.value, { retry: 0 })
  selectedFiling.value = undefined
}

function saveCycle() {
  return run(async () => {
    if (!calendar.value) return
    calendar.value = await submit<Calendar>('tax-calendar', `${path.value}/calendar`, 'PUT',
      { expectedVersion: calendar.value.version, cycle: cycle.value, basis: basis.value })
    report.value = undefined
    selectedFiling.value = undefined
  })
}

function saveFiling() {
  return run(async () => {
    if (!report.value) return
    await submit<Filed>('tax-filing', `${periodPath.value}/filings`, 'POST', {
      expectedVersion: latest.value?.version ?? 0,
      expectedFingerprint: report.value.current.fingerprint,
      reference: reference.value.trim(),
      reason: reason.value.trim() || null,
      lockBooks: calendar.value?.canLock === true && lockBooks.value,
    })
    reference.value = ''
    reason.value = ''
    lockBooks.value = false
    await Promise.all([readPeriod(), readCalendar()])
  })
}

function showFiling(id: string) {
  return run(async () => {
    selectedFiling.value = await $fetch<Filed>(`${path.value}/filings/${id}`, { retry: 0 })
  })
}

async function downloadSources() {
  const totals = display.value
  if (!totals) return
  await exportCsv({
    name: '纳税期间-' + totals.period.from, columns,
    fetchPage: async () => ({ rows: totals.sources, hasMore: false }),
  })
}
</script>

<template>
  <section class="mt-6" aria-labelledby="tax-filing-heading">
    <h3 id="tax-filing-heading">纳税期间与申报</h3>
    <UButton v-if="!calendar" type="button" variant="outline" :loading="busy" @click="run(readCalendar)">打开纳税申报</UButton>
    <UAlert v-if="error || exportError" color="error" role="alert" :description="error || exportError" />
    <template v-if="calendar">
      <form v-if="calendar.canChangeCalendar" class="mb-4 flex flex-wrap items-end gap-3" @submit.prevent="saveCycle">
        <UFormField label="纳税周期"><USelect v-model="cycle" :items="options" :disabled="busy" /></UFormField>
        <UFormField label="税额确认口径"><USelect v-model="basis" :items="basisOptions" :disabled="busy" /></UFormField>
        <UButton type="submit" variant="outline" :disabled="busy || (cycle === calendar.cycle && basis === calendar.basis)">保存纳税设置</UButton>
      </form>
      <p v-else class="mb-4">{{ calendar.cycle === 'monthly' ? '按月' : '按季' }} · {{ basisLabels[calendar.basis] }}</p>
      <form class="mb-4 flex flex-wrap items-end gap-3" @submit.prevent="run(readPeriod)">
        <UFormField label="纳税期间月份" required><UInput v-model="month" type="month" required :disabled="busy" /></UFormField>
        <UButton type="submit" :disabled="busy || !month">查看进销项汇总</UButton>
      </form>
      <template v-if="display && report">
        <p v-if="report.lockedThrough" data-testid="tax-locked-through">账簿已锁定至 {{ report.lockedThrough }}</p>
        <UAlert v-if="report.changedSinceFiling" color="warning" role="status" description="当前汇总与最新申报快照有差异，请复核并记录更正。" />
        <h4 class="mt-4">
          {{ selectedFiling ? '申报快照 v' + selectedFiling.filing.version : '当前汇总' }}
          · {{ display.period.from }} 至 {{ display.period.through }} · {{ basisLabels[display.basis] }}
        </h4>
        <p data-testid="tax-filing-totals">
          进项 {{ display.input }} · 销项 {{ display.output }} · 净额 {{ display.netPayable }} {{ display.currency }}
        </p>
        <ul>
          <li v-for="row in display.codes" :key="row.code">{{ row.code }} · 进项 {{ row.input }} · 销项 {{ row.output }} · 净额 {{ row.netPayable }}</li>
        </ul>
        <details class="my-3">
          <summary>来源单据（{{ display.sources.length }}）</summary>
          <ul>
            <li v-for="source in display.sources" :key="source.journalId + ':' + source.kind + ':' + source.code">
              {{ source.on }} · {{ source.documentNumber }} · {{ source.code }} · {{ source.direction === 'input' ? '进项' : '销项' }} {{ source.amount }}
              <span v-if="source.taxDocumentNumber"> · 关联 {{ source.taxDocumentNumber }}</span>
            </li>
          </ul>
          <UButton type="button" variant="outline" :disabled="exporting" @click="downloadSources">导出税额来源 CSV</UButton>
        </details>
        <div class="flex flex-wrap gap-2">
          <UButton
            v-for="filing in report.filings" :key="filing.id" type="button" variant="outline" :disabled="busy"
            @click="showFiling(filing.id)"
          >查看 {{ filing.reference }} · v{{ filing.version }}</UButton>
          <UButton v-if="selectedFiling" type="button" variant="outline" @click="selectedFiling = undefined">返回当前汇总</UButton>
        </div>
        <form v-if="calendar.canManage && !selectedFiling" class="mt-4 space-y-3" @submit.prevent="saveFiling">
          <UFormField label="申报参考号" required><UInput v-model="reference" maxlength="100" required :disabled="busy" /></UFormField>
          <UFormField v-if="latest" label="更正原因" required><UInput v-model="reason" maxlength="300" required :disabled="busy" /></UFormField>
          <UCheckbox v-if="calendar.canLock" v-model="lockBooks" label="锁账至该纳税期间期末" :disabled="busy" />
          <UButton type="submit" :disabled="busy || !reference.trim() || (!!latest && !reason.trim())">
            {{ latest ? '保存更正申报' : '记录申报快照' }}
          </UButton>
        </form>
      </template>
    </template>
  </section>
</template>

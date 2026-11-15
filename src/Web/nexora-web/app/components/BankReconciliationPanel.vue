<script setup lang="ts">
interface Item { id: string; on: string; reference: string; amount: string; journalId: string | null }
interface Report {
  through: string; statementBalance: string; bookBalance: string; outstandingBooks: string; outstandingStatement: string
  adjustedStatement: string; difference: string; ledgerDifference: string; books: Item[]; statement: Item[]
}
interface Entry { id: string; version: number; state: string; report: Report; undoReason: string | null }
const props = defineProps<{ tradePath: string; banks: { id: string; name: string }[]; canPrepare: boolean; canReview: boolean; minorUnits: number }>()
const bankId = ref('')
const through = ref('')
const statementBalance = ref('')
const reason = ref('')
const preview = shallowRef<Report>()
const rows = shallowRef<Entry[]>([])
const selected = shallowRef<Entry>()
const report = computed(() => selected.value?.report ?? preview.value)
const busy = ref(false)
const notice = ref('')
const base = computed(() => props.tradePath + '/banks/' + bankId.value + '/reconciliations')
const submit = useWorkspaceMutation()
const labels: Record<string, string> = { pending: '待复核', completed: '已完成', undone: '已撤销', cancelled: '已取消' }
const bankOptions = computed(() => props.banks.map(entry => ({ label: entry.name, value: entry.id })))
const fields = [['statementBalance', '银行期末余额'], ['bookBalance', '账面期末余额'], ['outstandingBooks', '账面未达净额'],
  ['outstandingStatement', '银行未达净额'], ['adjustedStatement', '调整后银行余额'],
  ['difference', '对账差额'], ['ledgerDifference', '资金流水与总账差额']] as const
const money = (value: string) => formatDecimal(value, props.minorUnits)
async function run(action: () => Promise<void>) {
  if (busy.value) return
  busy.value = true; notice.value = ''
  try { await action() }
  catch (error) { notice.value = (error as { data?: { detail?: string } }).data?.detail ?? '请核对对账日期、权限或报告状态。' }
  finally { busy.value = false }
}
async function read() { rows.value = await $fetch<Entry[]>(base.value, { retry: 0 }) }
function bankChanged() {
  selected.value = undefined; preview.value = undefined; rows.value = []
  if (bankId.value) return run(read)
}
function prepare(save: boolean) {
  return run(async () => {
    const body = { through: through.value, statementBalance: statementBalance.value }
    if (save) {
      selected.value = await submit<Entry>('prepare-bank-close', base.value, 'POST', body)
      await read()
    } else {
      selected.value = undefined
      preview.value = await submit<Report>('preview-bank-close', base.value + '/preview', 'POST', body)
    }
  })
}
function decide(decision: string) {
  const entry = selected.value
  if (!entry) return
  return run(async () => {
    selected.value = await submit<Entry>('decide-bank-close', props.tradePath + '/reconciliations/' + entry.id + '/decision', 'POST',
      { expectedVersion: entry.version, decision, reason: reason.value })
    reason.value = ''
    await read()
  })
}
function exportReport() {
  if (!report.value) return
  const body = JSON.stringify({ account: bankId.value, reconciliation: selected.value?.id ?? null,
    state: selected.value?.state ?? 'preview', report: report.value }, null, 2)
  const url = URL.createObjectURL(new Blob([body], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = 'bank-reconciliation-' + report.value.through + '.json'
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
</script>

<template>
  <section aria-label="银行对账">
    <h3>银行对账</h3>
    <UFormField label="对账账户" name="bankId">
      <USelect :model-value="bankId" :items="bankOptions" :disabled="busy" placeholder="选择账户" @update:model-value="value => { bankId = String(value); bankChanged() }" />
    </UFormField>
    <template v-if="bankId">
      <form @submit.prevent="prepare(false)">
        <fieldset :disabled="busy"><legend>对账范围与期末余额</legend>
          <UFormField label="对账截止日期" name="through">
            <UInput :model-value="through" type="date" required @update:model-value="value => through = String(value)" />
          </UFormField>
          <UFormField label="对账单期末余额" name="statementBalance">
            <UInput :model-value="statementBalance" inputmode="decimal" required @update:model-value="value => statementBalance = String(value).trim()" />
          </UFormField>
          <button class="quiet">预览银行对账</button>
          <button v-if="canPrepare && through && statementBalance" type="button" class="primary" @click="prepare(true)">提交对账复核</button>
        </fieldset>
      </form>
      <ul><li v-for="row in rows" :key="row.id">
        <button type="button" class="quiet" @click="selected = row">{{ row.report.through }} · {{ labels[row.state] }} · {{ money(row.report.difference) }}</button>
      </li></ul>
      <template v-if="report">
        <dl><template v-for="[key, label] in fields" :key="key"><dt>{{ label }}</dt><dd>{{ money(report[key]) }}</dd></template></dl>
        <ul><li v-for="item in report.books" :key="item.id">账面未达 {{ item.on }} · {{ money(item.amount) }} · {{ item.journalId }}</li></ul>
        <ul><li v-for="item in report.statement" :key="item.id">银行未达 {{ item.on }} · {{ money(item.amount) }} · {{ item.reference }}</li></ul>
        <button class="quiet" type="button" @click="exportReport">导出对账报告 JSON</button>
        <a
v-if="selected && ['completed', 'undone'].includes(selected.state)" class="quiet"
          :href="tradePath + '/reconciliations/' + selected.id + '/pdf'">下载银行对账 PDF</a>
        <button
v-if="selected?.state === 'pending' && canReview" class="primary" type="button" :disabled="busy"
          @click="decide('finish')">完成银行对账</button>
        <button
v-if="selected?.state === 'pending' && canPrepare" class="quiet" type="button" :disabled="busy"
          @click="decide('cancel')">取消待审对账</button>
        <form v-if="selected?.state === 'completed' && canReview" @submit.prevent="decide('undo')">
          <UFormField label="撤销对账原因" name="reason">
            <UInput :model-value="reason" maxlength="300" required @update:model-value="value => reason = String(value).trim()" />
          </UFormField>
          <button class="quiet" :disabled="busy">撤销银行对账</button>
        </form>
        <p v-if="selected?.undoReason">撤销原因 {{ selected.undoReason }}</p>
      </template>
    </template>
    <UAlert v-if="notice" role="status" :description="notice" />
  </section>
</template>

<style scoped>
fieldset { display: grid; gap: 8px; min-width: 0; margin: 12px 0 }
label { display: grid; gap: 4px }
dl { grid-template-columns: max-content 1fr }
li { overflow-wrap: anywhere }
</style>

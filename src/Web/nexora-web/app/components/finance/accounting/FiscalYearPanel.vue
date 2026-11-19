<script setup lang="ts">
interface Preview {
  period: { from: string; through: string }; netProfit: string; openMonths: string[]; pendingDocuments?: number
  lines: { accountId: string; code: string; name: string; balance: string }[]
  partnerAllocations?: { code: string; name: string; capital: { balance: string }; drawings: { balance: string } }[]
}
interface Entry { id: string; version: number; state: string; report: Preview; closingJournals: string[]; reopeningJournals: string[]; reopenReason: string | null }
const props = defineProps<{ ledgerPath: string; equity: { id: string; code: string; name: string }[]; startsOn: string;
  canPrepare: boolean; canReview: boolean; minorUnits: number }>()
const base = computed(() => props.ledgerPath + '/fiscal-years')
const opened = ref(false)
const year = ref(Number(props.startsOn.slice(0, 4)))
const equityId = ref('')
const reason = ref('')
const preview = shallowRef<Preview>()
const selected = shallowRef<Entry>()
const report = computed(() => selected.value?.report ?? preview.value)
const history = shallowRef<Entry[]>([])
const busy = ref(false)
const notice = ref('')
const submit = useWorkspaceMutation()
const labels: Record<string, string> = { pending: '待复核', closed: '已年结', reopened: '已重开', cancelled: '已取消' }
const money = (value: string) => formatDecimal(value, props.minorUnits)
const equityOptions = computed(() => props.equity.map(account => ({ label: `${account.code} · ${account.name}`, value: account.id })))
async function run(action: () => Promise<void>) {
  if (busy.value) return
  busy.value = true; notice.value = ''
  try { await action() }
  catch (error) { notice.value = (error as { data?: { detail?: string } }).data?.detail ?? '请核对会计期间、权限或年结状态。' }
  finally { busy.value = false }
}
async function read() { history.value = await $fetch<Entry[]>(base.value, { retry: 0 }); opened.value = true }
function loadPreview() {
  return run(async () => {
    selected.value = undefined
    preview.value = await $fetch<Preview>(base.value + '/preview', { retry: 0, query: { year: year.value, equityAccountId: equityId.value } })
  })
}
function prepare() {
  return run(async () => {
    selected.value = await submit<Entry>('prepare-fiscal-close', base.value, 'POST', { year: year.value, equityAccountId: equityId.value })
    await read()
  })
}
function decide(decision: string) {
  const row = selected.value
  if (!row) return
  return run(async () => {
    selected.value = await submit<Entry>('decide-fiscal-close', base.value + '/' + row.id + '/decision', 'POST',
      { expectedVersion: row.version, decision, reason: reason.value })
    await read()
  })
}
</script>

<template>
  <section aria-label="会计年度关账">
    <h3>会计年度关账</h3>
    <UButton v-if="!opened" variant="outline" color="neutral" size="sm" type="button" :disabled="busy" @click="run(read)">打开年结工作台</UButton>
    <template v-else>
      <form @submit.prevent="loadPreview">
        <fieldset :disabled="busy"><legend>年结预览</legend>
          <UFormField label="财政年度起始年份" name="fiscalYear">
            <UInput :model-value="year" type="number" min="1899" max="9997" required @update:model-value="value => year = Number(value) || 0" />
          </UFormField>
          <UFormField label="未分配利润科目" name="equityAccountId">
            <USelect :model-value="equityId" :items="equityOptions" placeholder="选择权益科目" @update:model-value="value => equityId = String(value)" />
          </UFormField>
          <UButton variant="outline" color="neutral" size="sm" type="submit">预览年结分录</UButton>
          <UButton v-if="canPrepare && equityId && year" color="primary" type="button" @click="prepare">提交年结复核</UButton>
        </fieldset>
      </form>
      <ul><li v-for="row in history" :key="row.id">
        <UButton type="button" variant="outline" color="neutral" size="xs" @click="selected = row">{{ row.report.period.from }} 至 {{ row.report.period.through }} · {{ labels[row.state] }}</UButton>
      </li></ul>
      <template v-if="report">
        <p>{{ report.period.from }} 至 {{ report.period.through }} · 结转净利润 {{ money(report.netProfit) }}</p>
        <p v-if="report.openMonths.length">待关账月份 {{ report.openMonths.join('、') }}</p>
        <p v-if="report.pendingDocuments">待处理单据及库存成本 {{ report.pendingDocuments }} 项</p>
        <ul><li v-for="line in report.lines" :key="line.accountId">{{ line.code }} {{ line.name }} · 余额 {{ money(line.balance) }}</li></ul>
        <ul v-if="report.partnerAllocations"><li v-for="partner in report.partnerAllocations" :key="partner.code">
          {{ partner.name }} · 分配损益 {{ money(partner.capital.balance) }} · 结转提款 {{ money(partner.drawings.balance) }}
        </li></ul>
      </template>
      <template v-if="selected">
        <p v-if="selected.closingJournals.length">结转凭证 {{ selected.closingJournals.join('、') }}</p>
        <p v-if="selected.reopeningJournals.length">重开冲销凭证 {{ selected.reopeningJournals.join('、') }}</p>
        <UButton v-if="selected.state === 'pending' && canReview" color="primary" type="button" :disabled="busy" @click="decide('close')">批准年结</UButton>
        <UButton v-if="selected.state === 'pending' && canPrepare" variant="outline" color="neutral" size="sm" type="button" :disabled="busy" @click="decide('cancel')">取消待审年结</UButton>
        <form v-if="selected.state === 'closed' && canReview" @submit.prevent="decide('reopen')">
          <UFormField label="重开年度原因" name="reopenReason">
            <UInput :model-value="reason" maxlength="300" required @update:model-value="value => reason = String(value).trim()" />
          </UFormField>
          <UButton variant="outline" color="neutral" size="sm" type="submit" :disabled="busy">重开会计年度</UButton>
        </form>
      </template>
    </template>
    <UAlert v-if="notice" role="status" :description="notice" />
  </section>
</template>

<style scoped>
fieldset { display: grid; gap: 8px; min-width: 0; margin: 12px 0 }
li, p { overflow-wrap: anywhere }
</style>

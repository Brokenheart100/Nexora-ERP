<script setup lang="ts">
import type { CsvColumn } from '../utils/export'

interface Accounts { receivableAccountId: string; advanceAccountId: string; revenueAccountId: string; outputTaxAccountId: string; costOfGoodsAccountId: string }
interface Home { accounts: Accounts | null; canConfigure: boolean; canDraft: boolean; canPost: boolean; currency: string }
interface ChartAccount { id: string; code: string; name: string; category: string; purpose: string; isArchived: boolean }
interface Choice { id: string; code: string; name: string }
interface Shipment { id: string; customerName: string; itemName: string; quantity: string; available: string; on: string;
  returnOf: string | null; creditable: string; posted: boolean; pendingReason: string | null }
interface InvoiceLine { shipmentId: string | null; name: string; quantity: string; net: string; tax: string }
interface Doc { id: string; state: string; version: number; openBalance: string; isMaker: boolean; journalId: string | null
  terms: { kind: number; number: string; on: string; dueOn: string | null; customerName: string; currency: string; total: string;
    lines: InvoiceLine[] | null; invoiceId: string | null; fundsId: string | null; returnId: string | null }
}
const props = defineProps<{ workspaceId: string }>()
const base = computed(() => '/bff/api/finance/workspaces/' + props.workspaceId + '/receivables')
const master = computed(() => '/bff/api/masterdata/workspaces/' + props.workspaceId)
const home = shallowRef<Home>()
const shipments = shallowRef<Shipment[]>([])
const docs = shallowRef<Doc[]>([])
const customers = shallowRef<Choice[]>([])
const services = shallowRef<Choice[]>([])
const banks = shallowRef<Choice[]>([])
const chart = shallowRef<ChartAccount[]>([])
const active = ref('')
const page = ref(1)
const busy = ref(false)
const notice = ref('')
const submit = useWorkspaceMutation()
const accounts = reactive<Accounts>({ receivableAccountId: '', advanceAccountId: '', revenueAccountId: '', outputTaxAccountId: '', costOfGoodsAccountId: '' })
const accountFields = [
  { key: 'receivableAccountId', label: '应收控制科目', category: 'asset', purpose: 'control' },
  { key: 'advanceAccountId', label: '客户预收控制科目', category: 'liability', purpose: 'control' },
  { key: 'revenueAccountId', label: '销售收入科目', category: 'income', purpose: 'posting' },
  { key: 'outputTaxAccountId', label: '销项税控制科目', category: 'liability', purpose: 'control' },
  { key: 'costOfGoodsAccountId', label: '销售成本科目', category: 'expense', purpose: 'posting' },
] as const
const blank = () => ({ kind: 'invoice', number: '', on: '', dueOn: '', customerId: '', bankId: '', fundsId: '', invoiceId: '',
  returnId: '', returnQuantity: '', amount: '', lines: [{ shipmentId: '', quantity: '1' }] })
const form = reactive(blank())
const editing = shallowRef<Doc>()
const kindLabels: Record<number, string> = { 1: '客户发票', 2: '客户收款', 3: '应收核销', 4: '退货贷项', 5: '客户退款' }
const stateLabels: Record<string, string> = { submitted: '待审批', posted: '已过账', cancelled: '已撤销' }
const invoices = computed(() => docs.value.filter(x => x.state === 'posted' && x.terms.kind === 1))
const funds = computed(() => docs.value.filter(x => x.state === 'posted' && [2, 4].includes(x.terms.kind) && x.openBalance !== '0'))
const selected = computed(() => docs.value.find(x => x.id === active.value))
const accountFormFields = computed(() => accountFields.map(field => ({
  key: field.key,
  label: field.label,
  items: chart.value
    .filter(account => !account.isArchived && account.category === field.category && account.purpose === field.purpose)
    .map(account => ({ label: account.code + ' · ' + account.name, value: account.id })),
})))
const kindOptions = [
  { label: '发票', value: 'invoice' },
  { label: '收款', value: 'receipt' },
  { label: '核销', value: 'allocation' },
  { label: '退货贷项', value: 'credit' },
  { label: '退款', value: 'refund' },
]
const customerOptions = computed(() => customers.value.map(entry => ({ label: entry.code + ' · ' + entry.name, value: entry.id })))
const bankOptions = computed(() => banks.value.map(entry => ({ label: entry.code + ' · ' + entry.name, value: entry.id })))
const invoiceOptions = computed(() => invoices.value.map(entry => ({ label: entry.terms.number + ' · 未结 ' + entry.openBalance, value: entry.id })))
const fundsOptions = computed(() => funds.value.map(entry => ({ label: entry.terms.number + ' · ' + entry.openBalance, value: entry.id })))
const billableShipmentOptions = computed(() => shipments.value
  .filter(entry => entry.posted && !entry.returnOf)
  .map(entry => ({ label: entry.customerName + ' · ' + entry.itemName + ' · ' + entry.on + ' · 可用 ' + entry.available, value: entry.id })))
const returnShipmentOptions = computed(() => shipments.value
  .filter(entry => entry.returnOf && entry.posted && entry.creditable !== '0')
  .map(entry => ({ label: entry.customerName + ' · ' + entry.itemName + ' · ' + entry.on + ' · ' + entry.creditable, value: entry.id })))
function setAccount(key: keyof Accounts, value: string | number) { accounts[key] = String(value) }
const options = { retry: 0 as const }
async function run(task: () => Promise<void>) {
  if (busy.value) return
  busy.value = true; notice.value = ''
  try { await task() }
  catch (error) {
    const failure = error as { statusCode?: number; data?: { detail?: string } }
    notice.value = failure.statusCode === 403 ? '当前成员无应收操作权限。' : failure.data?.detail ?? '请刷新核对应收状态。'
  } finally { busy.value = false }
}
async function read() {
  const [current, rows, goods] = await Promise.all([
    $fetch<Home>(base.value, options),
    $fetch<Doc[]>(base.value + '/documents', { ...options, query: { page: page.value } }),
    $fetch<Shipment[]>(base.value + '/shipments', { ...options, query: { page: page.value } }),
  ])
  home.value = current; docs.value = rows; shipments.value = goods
  const finance = '/bff/api/finance/workspaces/' + props.workspaceId
  if (!current.accounts && current.canConfigure) chart.value = (await $fetch<{ accounts: ChartAccount[] }>(finance + '/chart', options)).accounts
  if (current.canDraft && !banks.value.length) banks.value = (await $fetch<{ banks: Choice[] }>(finance + '/trade', options)).banks
  if (current.canDraft && !customers.value.length) {
    const [parties, catalog] = await Promise.all([
      $fetch<{ items: (Choice & { roles: string[]; isActive: boolean })[] }>(master.value + '/partners', options),
      $fetch<{ page: { items: (Choice & { kind: string; isActive: boolean })[] } }>(master.value + '/catalog', options),
    ])
    customers.value = parties.items.filter(x => x.isActive && x.roles.includes('customer'))
    services.value = catalog.page.items.filter(x => x.isActive && x.kind === 'service')
  }
}
function configure() {
  return run(async () => { await submit('receivable-setup', base.value + '/setup', 'POST', { accounts }); await read() })
}
function reset() { editing.value = undefined; Object.assign(form, blank()) }
function edit(doc: Doc) {
  reset()
  editing.value = doc
  Object.assign(form, { number: doc.terms.number, on: doc.terms.on, dueOn: doc.terms.dueOn ?? '',
    lines: doc.terms.lines?.map(x => ({ shipmentId: x.shipmentId ?? '', quantity: x.quantity })) ?? [] })
}
function save() {
  return run(async () => {
    const { kind, number, on, dueOn, customerId, bankId, fundsId, invoiceId, returnId, returnQuantity, amount, lines } = form
    const draft = { kind, number, on, dueOn: dueOn || null, customerId: customerId || null, bankId: bankId || null,
      fundsId: fundsId || null, invoiceId: invoiceId || null, returnId: returnId || null, returnQuantity: returnQuantity || '0',
      amount: amount || '0', lines: kind === 'invoice' ? lines : null }
    const result = editing.value
      ? await submit<{ id: string }>('revise-invoice', base.value + '/documents/' + editing.value.id, 'PUT', { draft, expectedVersion: editing.value.version })
      : await submit<{ id: string }>('submit-receivable', base.value + '/documents', 'POST', { draft })
    active.value = result.id
    reset()
    page.value = 1
    await read()
  })
}
function decide(doc: Doc, approve: boolean) {
  return run(async () => {
    await submit('approve-receivable', base.value + '/documents/' + doc.id + '/decision', 'POST', { expectedVersion: doc.version, approve })
    await read()
  })
}

const { exporting, notice: exportNotice, error: exportError, exportCsv } = useCsvExport()
const card = ref<HTMLElement>()
const exportColumns: CsvColumn<Doc>[] = [
  { header: '单号', value: doc => doc.terms.number },
  { header: '类型', value: doc => kindLabels[doc.terms.kind] ?? String(doc.terms.kind) },
  { header: '状态', value: doc => stateLabels[doc.state] ?? doc.state },
  { header: '日期', value: doc => doc.terms.on },
  { header: '到期日', value: doc => doc.terms.dueOn ?? '' },
  { header: '客户', value: doc => doc.terms.customerName },
  { header: '含税总额', value: doc => doc.terms.total },
  { header: '币种', value: doc => doc.terms.currency },
  { header: '未结余额', value: doc => doc.openBalance },
]
async function exportDocuments() {
  await exportCsv({
    name: '客户单据',
    columns: exportColumns,
    fetchPage: async (pageNumber) => {
      const rows = await $fetch<Doc[]>(base.value + '/documents', { retry: 0, query: { page: pageNumber } })
      return { rows, hasMore: rows.length === 50 }
    },
  })
}
function printView() {
  printSection(card.value)
}

onMounted(() => { void read().catch(() => { /* 首屏加载失败时保留空状态，可用模块内按钮重试 */ }) })
</script>

<template>
  <section ref="card" class="receivables rounded-nx border border-nx-border bg-nx-surface p-6 shadow-nx-sm" aria-labelledby="receivable-heading">
    <h2 id="receivable-heading"><UIcon class="mr-2 inline-block size-[1.08em] align-[-0.16em] text-nx-primary" name="i-lucide-receipt-text" aria-hidden="true" />客户开票与应收</h2>
    <UButton type="button" variant="outline" color="neutral" size="sm" :disabled="busy" @click="run(read)">{{ home ? '刷新应收工作台' : '打开应收工作台' }}</UButton>
    <div class="mb-3 mt-2 flex flex-wrap gap-2">
      <UButton variant="outline" color="neutral" size="sm" type="button" :disabled="busy || exporting" @click="run(exportDocuments)">导出客户单据 CSV</UButton>
      <UButton variant="outline" color="neutral" size="sm" type="button" @click="printView">打印当前视图</UButton>
    </div>
    <UAlert v-if="notice" role="status" :description="notice" />
    <UAlert v-if="exportNotice" role="status" :description="exportNotice" />
    <UAlert v-if="exportError" role="alert" color="error" icon="i-lucide-circle-alert" :description="exportError" />
    <template v-if="home">
      <form v-if="!home.accounts && home.canConfigure" @submit.prevent="configure">
        <fieldset :disabled="busy"><legend>应收过账科目</legend>
          <UFormField v-for="field in accountFormFields" :key="field.key" :label="field.label" :name="field.key">
            <USelect :model-value="accounts[field.key]" :items="field.items" placeholder="选择科目" required @update:model-value="value => setAccount(field.key, value)" />
          </UFormField>
          <UButton type="submit" color="primary">保存应收科目</UButton>
        </fieldset>
      </form>
      <h3>已计价发货与退货</h3>
      <ul><li v-for="row in shipments" :key="row.id">
        {{ row.on }} · {{ row.customerName }} · {{ row.itemName }} · {{ row.quantity }}
        · {{ row.returnOf ? '退货可供贷项 ' + row.creditable : '可开票 ' + row.available }}{{ row.pendingReason ? ' · ' + row.pendingReason : '' }}
      </li></ul>
      <form v-if="home.canDraft && home.accounts" @submit.prevent="save">
        <fieldset :disabled="busy"><legend>{{ editing ? '修改待审批发票' : '新建客户单据' }}</legend>
          <UFormField label="客户单据类型" name="kind">
            <USelect :model-value="form.kind" :items="kindOptions" :disabled="!!editing" @update:model-value="value => form.kind = String(value)" />
          </UFormField>
          <UFormField label="客户单据编号" name="number">
            <UInput :model-value="form.number" :readonly="!!editing" maxlength="60" required @update:model-value="value => form.number = String(value).trim()" />
          </UFormField>
          <UFormField label="客户单据日期" name="on">
            <UInput :model-value="form.on" type="date" required @update:model-value="value => form.on = String(value)" />
          </UFormField>
          <template v-if="form.kind === 'invoice'">
            <UFormField label="发票到期日" name="dueOn">
              <UInput :model-value="form.dueOn" type="date" @update:model-value="value => form.dueOn = String(value)" />
            </UFormField>
            <div v-for="(line, index) in form.lines" :key="index" class="row">
              <UFormField :label="'开票来源 ' + (index + 1)" name="lineShipmentId">
                <USelect :model-value="line.shipmentId" :items="billableShipmentOptions" placeholder="选择发货" required @update:model-value="value => line.shipmentId = String(value)" />
              </UFormField>
              <UFormField :label="'开票数量 ' + (index + 1)" name="lineQuantity">
                <UInput :model-value="line.quantity" inputmode="decimal" required @update:model-value="value => line.quantity = String(value).trim()" />
              </UFormField>
              <UButton type="button" variant="outline" color="neutral" size="sm" :disabled="form.lines.length <= 1" @click="form.lines.splice(index, 1)">移除开票行</UButton>
            </div>
            <UButton type="button" variant="outline" color="neutral" size="sm" :disabled="form.lines.length >= 50" @click="form.lines.push({ shipmentId: '', quantity: '1' })">新增开票行</UButton>
          </template>
          <UFormField v-if="form.kind === 'receipt'" label="收款客户" name="customerId">
            <USelect :model-value="form.customerId" :items="customerOptions" placeholder="选择客户" required @update:model-value="value => form.customerId = String(value)" />
          </UFormField>
          <UFormField v-if="['receipt', 'refund'].includes(form.kind)" label="资金账户" name="bankId">
            <USelect :model-value="form.bankId" :items="bankOptions" placeholder="选择资金账户" required @update:model-value="value => form.bankId = String(value)" />
          </UFormField>
          <UFormField v-if="['allocation', 'credit'].includes(form.kind)" label="关联发票" name="invoiceId">
            <USelect :model-value="form.invoiceId" :items="invoiceOptions" placeholder="选择发票" required @update:model-value="value => form.invoiceId = String(value)" />
          </UFormField>
          <UFormField v-if="['allocation', 'refund'].includes(form.kind)" label="可用客户款项" name="fundsId">
            <USelect :model-value="form.fundsId" :items="fundsOptions" placeholder="选择款项" required @update:model-value="value => form.fundsId = String(value)" />
          </UFormField>
          <template v-if="form.kind === 'credit'">
            <UFormField label="关联库存退货" name="returnId">
              <USelect :model-value="form.returnId" :items="returnShipmentOptions" placeholder="选择退货" required @update:model-value="value => form.returnId = String(value)" />
            </UFormField>
            <UFormField label="贷项数量" name="returnQuantity">
              <UInput :model-value="form.returnQuantity" inputmode="decimal" required @update:model-value="value => form.returnQuantity = String(value).trim()" />
            </UFormField>
          </template>
          <UFormField v-if="['receipt', 'allocation', 'refund'].includes(form.kind)" label="客户单据金额" name="amount">
            <UInput :model-value="form.amount" inputmode="decimal" required @update:model-value="value => form.amount = String(value).trim()" />
          </UFormField>
          <div class="row"><UButton type="submit" color="primary">提交客户单据</UButton>
            <UButton v-if="editing" variant="outline" color="neutral" size="sm" type="button" @click="reset">退出发票编辑</UButton></div>
        </fieldset>
      </form>
      <h3>客户单据</h3>
      <ul><li v-for="doc in docs" :key="doc.id"><UButton variant="outline" color="neutral" size="xs" type="button" @click="active = doc.id">
        {{ doc.terms.number }} · {{ kindLabels[doc.terms.kind] }} · {{ stateLabels[doc.state] }}
        · {{ doc.terms.total }} {{ doc.terms.currency }} · 余额 {{ doc.openBalance }}
      </UButton></li></ul>
      <div class="row">
        <UButton variant="outline" color="neutral" size="sm" type="button" :disabled="busy || page === 1" @click="run(async () => { page--; await read() })">上一页客户单据</UButton>
        <UButton variant="outline" color="neutral" size="sm" type="button" :disabled="busy || (docs.length < 50 && shipments.length < 50)"
          @click="run(async () => { page++; await read() })">下一页客户单据</UButton>
      </div>
      <section v-if="selected" aria-label="客户单据详情">
        <h3>{{ selected.terms.number }} · {{ selected.terms.customerName }}</h3>
        <p>{{ selected.terms.on }} · {{ stateLabels[selected.state] }} · v{{ selected.version }} · 余额 {{ selected.openBalance }}</p>
        <p v-if="selected.journalId">总账凭证 {{ selected.journalId }}</p>
        <ul v-if="selected.terms.lines"><li v-for="(line, index) in selected.terms.lines" :key="index">
          {{ line.name }} · {{ line.quantity }} · 未税 {{ line.net }} · 税 {{ line.tax }}
        </li></ul>
        <div class="row">
          <UButton
v-if="selected.state === 'submitted' && home.canPost && !selected.isMaker" color="primary" type="button"
            :disabled="busy" @click="decide(selected, true)">批准客户单据</UButton>
          <UButton
v-if="selected.state === 'submitted' && home.canDraft && selected.isMaker" variant="outline" color="neutral" size="sm" type="button"
            :disabled="busy" @click="decide(selected, false)">撤销客户单据</UButton>
          <UButton
v-if="selected.terms.kind === 1 && selected.state === 'submitted' && home.canDraft && selected.isMaker
              && selected.terms.lines?.every(x => x.shipmentId)" variant="outline" color="neutral" size="sm" type="button" @click="edit(selected)">编辑待审批发票</UButton>
        </div>
        <InvoiceCommunication
v-if="selected.terms.kind === 1 && selected.state !== 'cancelled'" :key="selected.id"
          :base="base" :invoice-id="selected.id" :posted="selected.state === 'posted'" :can-send="home.canPost" />
      </section>
      <InvoiceSchedules v-if="home.accounts" :base="base" :can-draft="home.canDraft" :customers="customers" :services="services" @changed="run(read)" />
    </template>
  </section>
</template>

<style scoped>
.receivables { margin-top: 24px }
fieldset { display: grid; gap: 10px; min-width: 0; margin: 12px 0; border: 1px solid #d1d9e6; border-radius: 8px }
label { display: grid; gap: 4px }
.row { display: flex; flex-wrap: wrap; align-items: end; gap: 8px }
li { margin: 6px 0; overflow-wrap: anywhere }
</style>

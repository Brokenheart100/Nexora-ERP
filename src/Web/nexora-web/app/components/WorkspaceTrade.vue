<script setup lang="ts">
interface ChartAccount { id: string; code: string; name: string; category: string; purpose: string; isArchived: boolean; isUsed: boolean }
interface Bank { id: string; code: string; name: string; kind: string; balance: string; version: number; isDefault: boolean }
interface Home { currency: string; minorUnits: number; canConfigure: boolean; canSubmit: boolean; canApprove: boolean; setup: object | null; banks: Bank[] }
interface Accrual { fact: { id: string; supplierId: string; on: string; quantity: string; cost: string; reversesId: string | null; stock?: { transfer: boolean } | null }; posted: boolean; pendingReason: string | null; matchedQuantity: string; journalId: string | null }
interface Document { id: string; terms: { kind: number; number: string; on: string; memo: string }; state: string; version: number; isMaker: boolean; total: string; outstanding: string; recoverable: string; journalId: string | null; reversedById: string | null }
interface Donor { id: string; code: string; name: string; roles: string[]; isActive: boolean }
interface StatementSelection { id: string; bankId: string; on: string; amount: string; description: string }

const props = defineProps<{ workspaceId: string }>()
const finance = computed(() => `/bff/api/finance/workspaces/${props.workspaceId}`)
const path = computed(() => `${finance.value}/trade`)
const submit = useWorkspaceMutation()
const home = shallowRef<Home>()
const chart = shallowRef<ChartAccount[]>([])
const documents = shallowRef<Document[]>([])
const receipts = shallowRef<Accrual[]>([])
const donors = shallowRef<Donor[]>([])
const donorPage = ref(0)
const moreDonors = ref(true)
const busy = ref(false)
const notice = ref('')
const bank = reactive({ code: '', name: '', kind: 'bank', accountId: '' })
const statementBank = ref('')
const sourceFields = [
  { key: 'inventoryAccountId', label: '库存统驭科目', category: 'asset', purpose: 'control' },
  { key: 'accrualAccountId', label: '暂估应付统驭科目', category: 'liability', purpose: 'control' },
  { key: 'payableAccountId', label: '应付账款统驭科目', category: 'liability', purpose: 'control' },
  { key: 'inputTaxAccountId', label: '示例进项税科目', category: 'asset', purpose: 'posting' },
  { key: 'varianceAccountId', label: '采购价差科目', category: 'expense', purpose: 'posting' },
  { key: 'donationIncomeAccountId', label: '捐赠收入科目', category: 'income', purpose: 'posting' },
  { key: 'supplierRecoveryAccountId', label: '应收供应商退款统驭科目', category: 'asset', purpose: 'control' },
]
const mappings = reactive<Record<string, string>>({})
const kinds = [
  { id: 1, label: '供应商账单' }, { id: 2, label: '供应商付款' }, { id: 3, label: '资金支出' },
  { id: 4, label: '其他收入' }, { id: 5, label: '账户转账' }, { id: 6, label: '捐赠收款' },
  { id: 7, label: '作废更正' }, { id: 8, label: '资金账户期初' }, { id: 9, label: '供应商贷项' }, { id: 10, label: '供应商退款' },
]
const labels: Record<string, string> = { submitted: '待复核', posted: '已过账', cancelled: '已撤销' }
const defaultDraft = () => ({ kind: 1, number: '', on: '', dueOn: '', memo: '', amount: '', bankId: '', otherBankId: '',
  counterAccountId: '', sourceId: '', partnerId: '', quantity: '1', taxAssessmentId: '', statementLineId: '', method: '',
  returnReceiptId: '', allowVariance: false })
const draft = reactive(defaultDraft())
const blankBillLine = () => ({ receiptId: '', quantity: '1', net: '', taxAssessmentId: '' })
const multiReceipt = ref(false)
const billLines = ref([blankBillLine(), blankBillLine()])
const billReceipts = computed(() => receipts.value.filter(x => x.posted && x.fact.quantity !== '0' && !x.fact.reversesId && !x.fact.stock))
const needsBank = computed(() => ![1, 7, 9].includes(draft.kind))
const counterCategory = computed(() => ({ 3: 'expense', 4: 'income', 8: 'equity' } as Record<number, string>)[draft.kind])
const docSource = computed(() => documents.value.filter(x => {
  if (x.state !== 'posted' || x.reversedById) return false
  if (draft.kind === 2) return x.terms.kind === 1 && x.outstanding !== '0'
  if (draft.kind === 9) return x.terms.kind === 1
  if (draft.kind === 10) return x.terms.kind === 9 && x.recoverable !== '0'
  return [2, 3, 4, 5, 6, 10].includes(x.terms.kind)
}))
const needsDocSource = computed(() => [2, 7, 9, 10].includes(draft.kind))
const money = (value: string) => formatDecimal(value, home.value?.minorUnits ?? 2)
const kindOptions = kinds.map(type => ({ label: type.label, value: type.id }))
const bankKindOptions = [{ label: '银行', value: 'bank' }, { label: '现金', value: 'cash' }]
const methodOptions = [{ label: '现金', value: 'cash' }, { label: '支票', value: 'cheque' }, { label: '卡', value: 'card' }, { label: '转账', value: 'transfer' }]
const bankItems = computed(() => (home.value?.banks ?? []).map(entry => ({ label: entry.name, value: entry.id })))
const transferBankItems = computed(() => (home.value?.banks ?? []).filter(entry => entry.id !== draft.bankId).map(entry => ({ label: entry.name, value: entry.id })))
const unusedControlAccounts = computed(() => chart.value
  .filter(account => account.category === 'asset' && account.purpose === 'control' && !account.isArchived && !account.isUsed)
  .map(account => ({ label: `${account.code} · ${account.name}`, value: account.id })))
const billReceiptItems = computed(() => billReceipts.value.map(entry => ({ label: `${entry.fact.on} · ${entry.fact.id}`, value: entry.fact.id })))
const billReceiptDetailItems = computed(() => billReceipts.value.map(entry => ({ label: `${entry.fact.on} · ${entry.fact.id} · 已匹配 ${entry.matchedQuantity} / ${entry.fact.quantity}`, value: entry.fact.id })))
const documentSourceItems = computed(() => docSource.value.map(doc => ({ label: `${doc.terms.number} · 未结 ${doc.outstanding} · 待退款 ${doc.recoverable}`, value: doc.id })))
const returnReceiptItems = computed(() => receipts.value
  .filter(entry => entry.fact.reversesId && !entry.posted)
  .map(entry => ({ label: `${entry.fact.on} · ${entry.fact.id} · ${entry.fact.quantity}`, value: entry.fact.id })))
const donorItems = computed(() => donors.value.map(donor => ({ label: `${donor.code} · ${donor.name}`, value: donor.id })))

function accountItems(category: string, purpose: string) {
  return choices(category, purpose).map(account => ({ label: `${account.code} · ${account.name}`, value: account.id }))
}
function choices(category: string, purpose: string) {
  return chart.value.filter(x => x.category === category && x.purpose === purpose && !x.isArchived)
}
async function run(action: () => Promise<void>) {
  if (busy.value) return
  busy.value = true; notice.value = ''
  try { await action() }
  catch (error) {
    notice.value = (error as { data?: { detail?: string } }).data?.detail || '请求未完成。请刷新核对状态，或保留原输入手动重试。'
  } finally { busy.value = false }
}
async function load() {
  const options = { retry: 0 as const }
  const [summary, accountList, docs, accruals] = await Promise.all([
    $fetch<Home>(path.value, options), $fetch<{ accounts: ChartAccount[] }>(`${finance.value}/chart`, options),
    $fetch<Document[]>(`${path.value}/documents`, options), $fetch<Accrual[]>(`${path.value}/receipts`, options),
  ])
  home.value = summary; chart.value = accountList.accounts; documents.value = docs; receipts.value = accruals
  statementBank.value ||= summary.banks.find(x => x.isDefault)?.id ?? ''
}
async function loadDonors() {
  const result = await $fetch<{ items: Donor[]; hasMore: boolean }>(`/bff/api/masterdata/workspaces/${props.workspaceId}/partners`,
    { retry: 0, query: { page: donorPage.value + 1 } })
  donors.value = [...donors.value, ...result.items.filter(x => x.isActive && x.roles.includes('donor'))]
  donorPage.value++; moreDonors.value = result.hasMore
}
function save(key: string, target: string, body: object, message: string) {
  return run(async () => {
    await submit(key, `${path.value}${target}`, 'POST', body)
    await load()
    notice.value = message
  })
}
function saveDraft() {
  return run(async () => {
    const isBill = draft.kind === 1
    const isCredit = draft.kind === 9
    const multiple = isBill && multiReceipt.value
    const receiptId = multiple ? billLines.value[0]?.receiptId : draft.sourceId
    const receipt = isBill ? receipts.value.find(x => x.fact.id === receiptId) : undefined
    const terms = { kind: draft.kind, number: draft.number, on: draft.on, dueOn: isBill ? draft.dueOn || null : null, memo: draft.memo,
      amount: [7, 9].includes(draft.kind) ? '0' : draft.amount,
      bankId: needsBank.value ? draft.bankId : null, otherBankId: draft.kind === 5 ? draft.otherBankId : null,
      counterAccountId: counterCategory.value ? draft.counterAccountId : null,
      sourceId: isBill && !multiple || needsDocSource.value ? draft.sourceId : null,
      partnerId: isBill ? receipt?.fact.supplierId : draft.kind === 6 ? draft.partnerId : null,
      quantity: isBill && !multiple ? draft.quantity : '0', taxAssessmentId: isBill && !multiple ? draft.taxAssessmentId || null : null,
      billReceipts: multiple ? billLines.value.map(x => ({ ...x, taxAssessmentId: x.taxAssessmentId || null })) : null,
      statementLineId: [2, 3, 4, 6, 10].includes(draft.kind) ? draft.statementLineId || null : null,
      method: isBill && draft.allowVariance ? 'approve-cost-variance' : draft.kind === 6 ? draft.method : null,
      returnReceiptId: isCredit ? draft.returnReceiptId : null,
    }
    await submit('submit-trade', `${path.value}/documents`, 'POST', { terms })
    Object.assign(draft, defaultDraft())
    multiReceipt.value = false
    billLines.value = [blankBillLine(), blankBillLine()]
    await load()
    notice.value = '单据已提交复核。'
  })
}
function fromStatement(line: StatementSelection) {
  Object.assign(draft, defaultDraft(), { kind: line.amount.startsWith('-') ? 3 : 4, bankId: line.bankId,
    on: line.on, amount: line.amount.replace(/^-/, ''), statementLineId: line.id, memo: line.description })
}
function kindChanged() {
  const { kind, statementLineId, bankId, on, amount, memo } = draft
  Object.assign(draft, defaultDraft(), statementLineId && [2, 3, 4, 6, 10].includes(kind)
    ? { kind, statementLineId, bankId, on, amount, memo } : { kind })
  if (kind === 6 && donorPage.value === 0) void run(loadDonors)
}
</script>

<template>
  <section class="trade" aria-labelledby="trade-heading">
    <h3 id="trade-heading">采购应付、银行与捐赠</h3>
    <button type="button" class="quiet" :disabled="busy" @click="run(load)">{{ home ? '刷新资金工作台' : '打开资金工作台' }}</button>
    <UAlert v-if="notice" role="status" :description="notice" />
    <template v-if="home">
      <form v-if="home.canConfigure && !home.setup" @submit.prevent="save('trade-setup', '/setup', { accounts: mappings }, '过账映射已保存。')">
        <fieldset :disabled="busy">
          <legend>首次设置采购与资金科目映射</legend>
          <UFormField v-for="field in sourceFields" :key="field.key" :label="field.label" :name="field.key">
            <USelect :model-value="mappings[field.key]" :items="accountItems(field.category, field.purpose)" placeholder="选择科目" required @update:model-value="value => mappings[field.key] = String(value)" />
          </UFormField>
          <button class="primary">保存采购过账映射</button>
        </fieldset>
      </form>
      <form v-if="home.canConfigure" @submit.prevent="save('open-bank', '/banks', bank, '资金账户已建立。')">
        <fieldset :disabled="busy">
          <legend>新增银行或现金账户</legend>
          <UFormField label="资金账户编码" name="bankCode">
            <UInput :model-value="bank.code" maxlength="40" required @update:model-value="value => bank.code = String(value).trim()" />
          </UFormField>
          <UFormField label="资金账户名称" name="bankName">
            <UInput :model-value="bank.name" maxlength="160" required @update:model-value="value => bank.name = String(value).trim()" />
          </UFormField>
          <UFormField label="资金账户类型" name="bankKind">
            <USelect :model-value="bank.kind" :items="bankKindOptions" @update:model-value="value => bank.kind = String(value)" />
          </UFormField>
          <UFormField label="资金统驭科目" name="bankAccountId">
            <USelect :model-value="bank.accountId" :items="unusedControlAccounts" placeholder="选择科目" required @update:model-value="value => bank.accountId = String(value)" />
          </UFormField>
          <button class="primary">保存资金账户</button>
        </fieldset>
      </form>
      <ul><li v-for="entry in home.banks" :key="entry.id">
        {{ entry.code }} · {{ entry.name }} · {{ money(entry.balance) }} {{ home.currency }}{{ entry.isDefault ? ' · 默认账户' : '' }}
        <button
v-if="home.canConfigure && !entry.isDefault" type="button" class="quiet" :disabled="busy"
          @click="save('default-bank', `/banks/${entry.id}/default`, { expectedVersion: entry.version }, '默认账户已更新。')">设为默认</button>
      </li></ul>
      <h4>收货暂估与成本事实</h4>
      <ul><li v-for="entry in receipts" :key="entry.fact.id">
        {{ entry.fact.on }} · {{ entry.fact.id }} · 数量 {{ entry.fact.quantity }} · 成本 {{ money(entry.fact.cost) }}
        · {{ entry.posted ? '已过账' : entry.pendingReason }}
        <button
v-if="!entry.posted && home.canApprove" type="button" class="quiet" :disabled="busy"
          @click="save('post-receipt', `/receipts/${entry.fact.id}/accrue`, {}, '收货事实已处理。')">重试收货过账</button>
      </li></ul>

      <form v-if="home.canSubmit" @submit.prevent="saveDraft">
        <fieldset :disabled="busy">
          <legend>财务制单</legend>
          <UFormField label="财务单据类型" name="kind">
            <USelect :model-value="draft.kind" :items="kindOptions" @update:model-value="value => { draft.kind = Number(value); kindChanged() }" />
          </UFormField>
          <UFormField label="财务单号" name="number">
            <UInput :model-value="draft.number" maxlength="60" required @update:model-value="value => draft.number = String(value).trim()" />
          </UFormField>
          <UFormField label="财务业务日期" name="on">
            <UInput :model-value="draft.on" type="date" required @update:model-value="value => draft.on = String(value)" />
          </UFormField>
          <UFormField v-if="draft.kind === 1" label="应付到期日" name="dueOn">
            <UInput :model-value="draft.dueOn" type="date" :min="draft.on" @update:model-value="value => draft.dueOn = String(value)" />
          </UFormField>
          <UFormField label="财务摘要" name="memo">
            <UInput :model-value="draft.memo" maxlength="300" required @update:model-value="value => draft.memo = String(value).trim()" />
          </UFormField>
          <UFormField v-if="![7, 9].includes(draft.kind)" label="单据金额（账单填未税）" name="amount">
            <UInput :model-value="draft.amount" inputmode="decimal" required @update:model-value="value => draft.amount = String(value).trim()" />
          </UFormField>
          <UFormField v-if="needsBank" label="业务资金账户" name="bankId">
            <USelect :model-value="draft.bankId" :items="bankItems" placeholder="选择资金账户" required @update:model-value="value => draft.bankId = String(value)" />
          </UFormField>
          <UFormField v-if="draft.kind === 5" label="转入账户" name="otherBankId">
            <USelect :model-value="draft.otherBankId" :items="transferBankItems" placeholder="选择转入账户" required @update:model-value="value => draft.otherBankId = String(value)" />
          </UFormField>
          <UFormField v-if="counterCategory" label="对方科目" name="counterAccountId">
            <USelect :model-value="draft.counterAccountId" :items="accountItems(counterCategory, 'posting')" placeholder="选择对方科目" required @update:model-value="value => draft.counterAccountId = String(value)" />
          </UFormField>
          <template v-if="draft.kind === 1">
            <UCheckbox v-model="multiReceipt" label="一张账单匹配多个收货事实" />
            <template v-if="multiReceipt">
              <div v-for="(line, index) in billLines" :key="index" class="bill-line">
                <UFormField :label="`匹配收货 ${index + 1}`" name="billReceiptId">
                  <USelect :model-value="line.receiptId" :items="billReceiptItems" placeholder="选择收货事实" required @update:model-value="value => line.receiptId = String(value)" />
                </UFormField>
                <UFormField label="匹配数量" name="billQuantity">
                  <UInput :model-value="line.quantity" required inputmode="decimal" @update:model-value="value => line.quantity = String(value).trim()" />
                </UFormField>
                <UFormField label="本行未税金额" name="billNet">
                  <UInput :model-value="line.net" required inputmode="decimal" @update:model-value="value => line.net = String(value).trim()" />
                </UFormField>
                <UFormField label="本行税额快照（可选）" name="billTaxAssessmentId">
                  <UInput :model-value="line.taxAssessmentId" maxlength="36" @update:model-value="value => line.taxAssessmentId = String(value).trim()" />
                </UFormField>
                <button class="quiet" type="button" :disabled="billLines.length <= 2" @click="billLines.splice(index, 1)">移除此行</button>
              </div>
              <button class="quiet" type="button" :disabled="billLines.length >= 50" @click="billLines.push(blankBillLine())">增加收货匹配行</button>
            </template>
            <template v-else>
              <UFormField label="账单对应收货" name="sourceId">
                <USelect :model-value="draft.sourceId" :items="billReceiptDetailItems" placeholder="选择收货事实" required @update:model-value="value => draft.sourceId = String(value)" />
              </UFormField>
              <UFormField label="本次匹配数量" name="billMatchQuantity">
                <UInput :model-value="draft.quantity" inputmode="decimal" required @update:model-value="value => draft.quantity = String(value).trim()" />
              </UFormField>
              <UFormField label="账单税额快照 ID（可选）" name="taxAssessmentId">
                <UInput :model-value="draft.taxAssessmentId" maxlength="36" @update:model-value="value => draft.taxAssessmentId = String(value).trim()" />
              </UFormField>
            </template>
            <UCheckbox v-model="draft.allowVariance" label="申请复核采购价差" />
          </template>
          <UFormField v-if="needsDocSource" label="原财务单据" name="documentId">
            <USelect :model-value="draft.sourceId" :items="documentSourceItems" placeholder="选择来源单据" required @update:model-value="value => draft.sourceId = String(value)" />
          </UFormField>
          <UFormField v-if="draft.kind === 9" label="采购退货事实" name="returnReceiptId">
            <USelect :model-value="draft.returnReceiptId" :items="returnReceiptItems" placeholder="选择待处理退货" required @update:model-value="value => draft.returnReceiptId = String(value)" />
          </UFormField>
          <template v-if="draft.kind === 6">
            <UFormField label="捐赠人" name="partnerId">
              <USelect :model-value="draft.partnerId" :items="donorItems" placeholder="选择捐赠人" required @update:model-value="value => draft.partnerId = String(value)" />
            </UFormField>
            <button v-if="moreDonors" class="quiet" type="button" @click="run(loadDonors)">加载更多捐赠人</button>
            <UFormField label="捐赠方式" name="method">
              <USelect :model-value="draft.method" :items="methodOptions" placeholder="选择方式" required @update:model-value="value => draft.method = String(value)" />
            </UFormField>
          </template>
          <UFormField v-if="draft.statementLineId" label="关联对账单行" name="statementLineId">
            <UInput :model-value="draft.statementLineId" readonly />
          </UFormField>
          <button class="primary">提交财务复核</button>
        </fieldset>
      </form>
      <h4>财务单据与未结项</h4>
      <ul><li v-for="doc in documents" :key="doc.id">
        {{ doc.terms.number }} · {{ kinds.find(x => x.id === doc.terms.kind)?.label }} · {{ labels[doc.state] }}
        · 合计 {{ money(doc.total) }}<span v-if="doc.terms.kind === 1"> · 未结 {{ money(doc.outstanding) }}</span>
        <span v-if="doc.terms.kind === 9"> · 待退款 {{ money(doc.recoverable) }}</span>
        <a
v-if="doc.terms.kind === 6 && doc.state === 'posted'" class="quiet"
          :href="path + '/documents/' + doc.id + '/donation-receipt/pdf'">下载捐赠收款确认单</a>
        <span v-if="doc.reversedById"> · 已关联作废</span><span v-if="doc.journalId"> · 凭证 {{ doc.journalId }}</span>
        <button
v-if="home.canApprove && !doc.isMaker && doc.state === 'submitted'" type="button" class="primary" :disabled="busy"
          @click="save('approve-trade', `/documents/${doc.id}/decision`, { expectedVersion: doc.version, decision: 'approve' }, '单据已复核过账。')">复核财务单据</button>
        <button
v-if="home.canSubmit && doc.isMaker && doc.state === 'submitted'" type="button" class="quiet" :disabled="busy"
          @click="save('cancel-trade', `/documents/${doc.id}/decision`, { expectedVersion: doc.version, decision: 'cancel' }, '单据已撤销。')">撤销财务单据</button>
      </li></ul>
      <BankReconciliationPanel
v-if="home.banks.length" :trade-path="path" :banks="home.banks" :can-prepare="home.canSubmit"
        :can-review="home.canApprove" :minor-units="home.minorUnits" />
      <UFormField label="查看银行流水和对账单" name="statementBank">
        <USelect :model-value="statementBank" :items="bankItems" :disabled="busy" placeholder="选择资金账户" @update:model-value="value => statementBank = String(value)" />
      </UFormField>
      <WorkspaceBankImport
v-if="statementBank" :key="statementBank" :path="path" :bank-id="statementBank"
        :can-submit="home.canSubmit" :can-approve="home.canApprove" @use-line="fromStatement" />
    </template>
  </section>
</template>

<style scoped>
.trade { margin-top: 24px }
fieldset { display: grid; gap: 6px; min-width: 0; margin: 12px 0; border: 1px solid #d1d9e6; border-radius: 8px }
li { overflow-wrap: anywhere; margin: 6px 0 }
.bill-line { display: grid; gap: 6px; padding: 10px; border: 1px solid #d1d9e6; border-radius: 6px }
</style>

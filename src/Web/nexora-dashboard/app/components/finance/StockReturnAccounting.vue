<script setup lang="ts">
import { z } from 'zod'
import { useWorkspaceQuery } from '~/composables/api/useWorkspaceQuery'
import { useScopedSubmission } from '~/composables/api/useScopedSubmission'
import { useReceivablesApi } from '~/composables/api/useReceivablesApi'
import { useTradeApi } from '~/composables/api/useTradeApi'
import { quantityInput } from '#shared/types/purchasing'
import { compareDecimal, subtractDecimal } from '#shared/utils/decimal'
import type { AccrualReceipt, TradeDocument } from '#shared/types/trade'
import type { CustomerDocument, ShipmentAllowance } from '#shared/types/receivables'

const props = defineProps<{ direction: 'purchase' | 'sale' }>()
const route = useRoute()
const target = computed(() => typeof route.query.stockReturn === 'string' ? route.query.stockReturn : '')
const active = ref(!!target.value)
watch(target, (value) => {
  if (value) active.value = true
})
const page = ref(1)
const documentsPage = ref(1)
const ar = useReceivablesApi(), ap = useTradeApi()
const sale = computed(() => props.direction === 'sale')
const query = useWorkspaceQuery('accounting-returns-' + props.direction, sale.value ? '/sales' : '/finance', async (workspace, signal) => {
  if (!active.value) return null
  if (sale.value) {
    const [home, shipments, invoices, documents, banks] = await Promise.all([
      ar.home(workspace, signal), ar.shipments(workspace, page.value, signal), ar.invoices(workspace, documentsPage.value, signal),
      ar.documents(workspace, documentsPage.value, signal), ar.banks(workspace, signal)
    ])
    return { home, drafts: home.canDraft, posts: home.canPost, shipments, invoices, documents, banks,
      receipts: [] as AccrualReceipt[], bills: [] as TradeDocument[], trade: [] as TradeDocument[] }
  }
  const [home, receipts, bills, trade] = await Promise.all([
    ap.home(workspace, signal), ap.receipts(workspace, page.value, signal), ap.bills(workspace, documentsPage.value, signal), ap.documents(workspace, documentsPage.value, signal)
  ])
  return { home, drafts: home.canSubmit, posts: home.canApprove, receipts, bills, trade, banks: home.banks,
    shipments: [] as ShipmentAllowance[], invoices: [] as CustomerDocument[], documents: [] as CustomerDocument[] }
}, () => [active.value, page.value, documentsPage.value])

const workspace = () => query.session.activeWorkspaceId
const root = () => `/bff/api/finance/workspaces/${workspace()}/` + (sale.value ? 'receivables' : 'trade')
const submission = useScopedSubmission(sale.value ? 'customer-returns' : 'supplier-returns', () => query.enabled)
const error = ref('')
const open = ref(false)
const form = reactive({ kind: 'credit', source: '', settlement: '', on: '', number: '', quantity: '', amount: '', bankId: '' })
const frozen = computed(() => !!submission.record || submission.mutation.busy)
const returns = computed(() => sale.value
  ? (query.data?.shipments ?? []).flatMap(row => row.returnOf
      ? [{ id: row.id, original: row.returnOf, on: row.on,
          quantity: row.quantity, posted: row.posted, creditable: row.creditable, note: row.pendingReason }]
      : [])
  : (query.data?.receipts ?? []).flatMap(row => row.fact.reversesId && compareDecimal(row.fact.quantity, '0') < 0
      ? [{
          id: row.fact.id, original: row.fact.reversesId, on: row.fact.on, quantity: subtractDecimal('0', row.fact.quantity),
          posted: row.posted, creditable: null, note: row.pendingReason }]
      : []))
const currentReturn = computed(() => returns.value.find(row => row.id === form.source))
const invoicesFor = (original: string) => (query.data?.invoices ?? []).filter(row => row.state === 'posted' && row.terms.lines?.some(line => line.shipmentId === original))
const billsFor = (original: string) => (query.data?.bills ?? []).filter(row => row.state === 'posted' && row.billMatches?.some(line =>
  line.receiptId === original && compareDecimal(line.quantity, line.creditedQuantity) > 0))
const related = computed(() => {
  const original = currentReturn.value?.original ?? ''
  return sale.value ? invoicesFor(original) : billsFor(original)
})
const documents = computed(() => sale.value
  ? (query.data?.documents ?? []).filter(row => [4, 5].includes(row.terms.kind)).map(row => ({
      id: row.id, number: row.terms.number, state: row.state, version: row.version, maker: row.isMaker, journal: row.journalId,
      credit: row.terms.kind === 4, available: row.openBalance, total: row.terms.total, source: row.terms.returnId ?? row.terms.fundsId, on: row.terms.on }))
  : (query.data?.trade ?? []).filter(row => [9, 10].includes(row.terms.kind)).map(row => ({
      id: row.id, number: row.terms.number, state: row.state, version: row.version, maker: row.isMaker, journal: row.journalId,
      credit: row.terms.kind === 9, available: row.recoverable, total: row.total, source: row.terms.returnReceiptId ?? row.terms.sourceId, on: row.terms.on })))
type DocumentRow = typeof documents.value[number]

function requiresSupplierCredit(row: { original: string, quantity: string }) {
  const original = query.data?.receipts.find(receipt => receipt.fact.id === row.original)
  return !!original && compareDecimal(row.quantity, subtractDecimal(original.fact.quantity, original.matchedQuantity)) > 0
}

function begin(kind: 'credit' | 'refund', source: string, on: string, quantity = '') {
  if (frozen.value || !query.data?.drafts) return
  submission.reset()
  error.value = ''
  const today = new Date().toLocaleDateString('en-CA')
  Object.assign(form, { kind, source, settlement: '', on: today < on ? on : today, number: '', quantity,
    amount: kind === 'refund' ? quantity : '', bankId: query.data.banks.find(bank => bank.isDefault)?.id ?? '' })
  open.value = true
}
async function save() {
  if (!query.data?.drafts || frozen.value) return
  const value = form.kind === 'refund' ? documents.value.find(doc => doc.id === form.source) : currentReturn.value
  const amount = quantityInput.safeParse(form.kind === 'refund' ? form.amount : form.quantity)
  const invoiceOrBill = z.uuid().safeParse(form.settlement)
  const invalid = !value || !z.iso.date().safeParse(form.on).success || form.on < value.on || !/^[A-Za-z0-9/_-]{1,60}$/.test(form.number.trim())
    || (form.kind === 'credit'
      ? !invoiceOrBill.success || !related.value.some(row => row.id === invoiceOrBill.data && form.on >= row.terms.on)
      || (sale.value && (!amount.success || !('creditable' in value) || !value.creditable || compareDecimal(amount.data, value.creditable) > 0))
      : !z.uuid().safeParse(form.bankId).success || !amount.success || !('available' in value) || compareDecimal(amount.data, value.available) > 0)
  if (invalid) {
    error.value = '请检查业务日期、单号、关联单据、数量和金额。'
    return
  }
  const on = form.on, number = form.number.trim()
  let payload: Record<string, unknown>
  if (sale.value) {
    payload = { draft: form.kind === 'credit'
      ? { kind: 'credit', number, on, invoiceId: form.settlement, returnId: form.source, returnQuantity: amount.data }
      : { kind: 'refund', number, on, fundsId: form.source, bankId: form.bankId, amount: amount.data } }
  } else {
    payload = { terms: { kind: form.kind === 'credit' ? 9 : 10, on, number,
      memo: form.kind === 'credit' ? '采购退货贷项' : '供应商退款', amount: form.kind === 'credit' ? '0' : amount.data,
      quantity: '0', bankId: form.kind === 'refund' ? form.bankId : null,
      sourceId: form.kind === 'credit' ? form.settlement : form.source, returnReceiptId: form.kind === 'credit' ? form.source : null } }
  }
  error.value = ''
  if (await submission.send('return-accounting.' + form.kind, root() + '/documents', payload, { resourceId: form.source })) {
    open.value = false
    await query.refresh()
  }
}
async function decide(row: DocumentRow, approve: boolean) {
  if (frozen.value || row.state !== 'submitted' || (approve ? !query.data?.posts || row.maker : !query.data?.drafts || !row.maker)) return
  error.value = ''
  if (await submission.send('return-accounting.decision', root() + '/documents/' + row.id + '/decision',
    { expectedVersion: row.version, ...(sale.value ? { approve } : { decision: approve ? 'approve' : 'cancel' }) }, { resourceId: row.id })) {
    await query.refresh()
  }
}
async function accrue(id: string) {
  if (frozen.value || !query.data?.posts) return
  error.value = ''
  if (await submission.send('return-accounting.accrue', root() + '/receipts/' + id + '/accrue', {}, { resourceId: id })) await query.refresh()
}
async function check() {
  if (!submission.mutation.unknown) submission.resume()
  await submission.check(async (saved) => {
    if (sale.value) await ar.documents(saved.workspaceId, documentsPage.value)
    else await ap.documents(saved.workspaceId, documentsPage.value)
    return null
  })
}
async function retry() {
  if (!await submission.retry()) return
  open.value = false
  await query.refresh()
}
watch(() => query.owner, () => {
  open.value = false
  page.value = documentsPage.value = 1
  error.value = ''
}, { flush: 'sync' })
</script>

<template>
  <UCard class="rounded-sm" data-testid="stock-return-accounting">
    <template #header>
      <div class="flex flex-wrap items-center justify-between gap-2">
        <h3 class="text-sm font-semibold">
          {{ sale ? '销售退货与客户贷项' : '采购退货与供应商贷项' }}
        </h3>
        <UButton
          :label="active ? '刷新退货及贷项' : '查看退货及贷项'"
          size="xs"
          variant="outline"
          @click="active ? query.refresh() : active = true"
        />
      </div>
    </template>
    <div v-if="active" class="space-y-3">
      <SalesOperationStatus
        :message="error"
        :submission="submission"
        @check="check"
        @retry="retry"
      />
      <UAlert
        v-if="query.problem"
        color="warning"
        variant="soft"
        :title="query.problem"
      />
      <p v-if="target && !returns.some(row => row.id === target)" class="break-all text-xs text-muted">
        当前页尚未读到退货流水 {{ target }}。可刷新财务回执或翻页查询。
      </p>
      <p v-else-if="!returns.length && !query.loading" class="text-sm text-muted">
        当前页没有已接收的退货来源。
      </p>
      <div
        v-for="row in returns"
        :key="row.id"
        class="flex flex-wrap items-center justify-between gap-2 border-b border-default py-2 text-sm"
        :data-testid="'accounting-return-' + row.id"
      >
        <div>
          <p>{{ row.on }} · 退货数量 {{ row.quantity }}{{ row.creditable !== null ? ' · 可贷项 ' + row.creditable : '' }}</p>
          <p class="break-all text-xs text-muted">
            {{ row.id }} · 原流水 {{ row.original }}
          </p>
          <p v-if="row.note" class="text-xs text-muted">
            {{ row.note }}
          </p>
        </div>
        <div class="flex items-center gap-2">
          <UBadge :label="row.posted ? '成本已入账' : '待财务处理'" variant="subtle" />
          <UButton
            v-if="!sale && !row.posted && query.data?.posts && !requiresSupplierCredit(row)"
            label="处理未开票退货"
            variant="outline"
            size="xs"
            :disabled="frozen"
            @click="accrue(row.id)"
          />
          <UButton
            v-if="query.data?.drafts && (sale ? row.posted && row.creditable && compareDecimal(row.creditable, '0') > 0 && invoicesFor(row.original).length : !row.posted && billsFor(row.original).length)"
            label="新建贷项"
            variant="outline"
            size="xs"
            :disabled="frozen"
            @click="begin('credit', row.id, row.on, row.creditable ?? row.quantity)"
          />
        </div>
      </div>
      <div class="flex flex-wrap gap-2">
        <UButton
          label="上一页来源"
          size="xs"
          variant="outline"
          :disabled="page <= 1"
          @click="page--"
        />
        <UButton
          label="下一页来源"
          size="xs"
          variant="outline"
          :disabled="(sale ? query.data?.shipments.length ?? 0 : query.data?.receipts.length ?? 0) < 50"
          @click="page++"
        />
        <UButton
          label="上一页贷项或账单"
          size="xs"
          variant="outline"
          :disabled="documentsPage <= 1"
          @click="documentsPage--"
        />
        <UButton
          label="下一页贷项或账单"
          size="xs"
          variant="outline"
          :disabled="Math.max(query.data?.bills.length ?? 0, query.data?.trade.length ?? 0, query.data?.documents.length ?? 0, query.data?.invoices.length ?? 0) < 50"
          @click="documentsPage++"
        />
      </div>
      <div
        v-for="row in documents"
        :key="row.id"
        class="flex flex-wrap items-center justify-between gap-2 border-b border-default py-2 text-sm"
        :data-testid="'return-accounting-document-' + row.id"
      >
        <div>
          <p>{{ row.number }} · {{ row.credit ? '贷项' : '退款' }} · {{ row.state === 'posted' ? '已过账' : row.state === 'cancelled' ? '已取消' : '待独立复核' }}</p>
          <p class="break-all text-xs text-muted">
            金额 {{ row.total }}{{ row.credit ? ' · 可退款 ' + row.available : '' }} · 来源 {{ row.source || '—' }}
          </p>
        </div>
        <div class="flex gap-2">
          <UButton
            v-if="row.journal"
            label="查看凭证"
            variant="link"
            size="xs"
            :to="{ path: '/finance', query: { workspace: workspace(), tab: 'journals', journal: row.journal } }"
          />
          <UButton
            v-if="row.credit && row.state === 'posted' && query.data?.drafts && compareDecimal(row.available, '0') > 0"
            label="登记退款"
            variant="outline"
            size="xs"
            :disabled="frozen"
            @click="begin('refund', row.id, row.on, row.available)"
          />
          <UButton
            v-if="row.state === 'submitted' && query.data?.drafts && row.maker"
            label="取消申请"
            variant="ghost"
            size="xs"
            :disabled="frozen"
            @click="decide(row, false)"
          />
          <UButton
            v-if="row.state === 'submitted' && query.data?.posts && !row.maker"
            label="复核通过并过账"
            size="xs"
            :disabled="frozen"
            @click="decide(row, true)"
          />
        </div>
      </div>
    </div>
    <USlideover v-model:open="open" :title="form.kind === 'credit' ? '新建退货贷项' : '登记退货退款'" :ui="{ content: 'w-full sm:max-w-xl' }">
      <template #body>
        <div class="space-y-3" data-testid="return-accounting-form">
          <SalesOperationStatus
            :message="error"
            :submission="submission"
            @check="check"
            @retry="retry"
          />
          <UFormField label="单据编号" required>
            <UInput
              v-model="form.number"
              class="w-full"
              :disabled="frozen"
              data-testid="return-accounting-number"
            />
          </UFormField>
          <UFormField label="业务日期" required>
            <UInput
              v-model="form.on"
              type="date"
              class="w-full"
              :disabled="frozen"
              data-testid="return-accounting-date"
            />
          </UFormField>
          <template v-if="form.kind === 'credit'">
            <UFormField :label="sale ? '原发票' : '原供应商账单'" required>
              <USelectMenu
                v-model="form.settlement"
                :items="related.map(row => ({ label: row.terms.number, value: row.id }))"
                value-key="value"
                :disabled="frozen"
                class="w-full"
                data-testid="return-accounting-settlement"
              />
            </UFormField>
            <UFormField v-if="sale" label="贷项数量" required>
              <UInput
                v-model="form.quantity"
                inputmode="decimal"
                class="w-full"
                :disabled="frozen"
              />
            </UFormField>
          </template>
          <template v-else>
            <UFormField label="退款金额" required>
              <UInput
                v-model="form.amount"
                inputmode="decimal"
                class="w-full"
                :disabled="frozen"
              />
            </UFormField>
            <UFormField label="资金账户" required>
              <USelectMenu
                v-model="form.bankId"
                :items="query.data?.banks.map(row => ({ label: row.code + ' ' + row.name, value: row.id }))"
                value-key="value"
                :disabled="frozen"
                class="w-full"
              />
            </UFormField>
          </template>
        </div>
      </template>
      <template #footer>
        <UButton label="关闭" variant="ghost" @click="open = false" />
        <UButton
          label="提交独立复核"
          :disabled="frozen"
          data-testid="return-accounting-submit"
          @click="save"
        />
      </template>
    </USlideover>
  </UCard>
</template>

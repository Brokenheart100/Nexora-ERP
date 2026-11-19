<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'

type Kind = 'receivables' | 'payables'
interface Balance { opening: string; increases: string; decreases: string; closing: string }
interface Entry {
  id: string; kind: string; number: string; on: string; journalId: string
  openDelta: string; openBalance: string; fundsDelta: string; fundsBalance: string
}
interface Ledger {
  minorUnits: number; currency: string; watermark: number; kind: Kind; hasMore: boolean
  open: Balance; funds: Balance; items: Entry[]
}
interface Partner { id: string; code: string; name: string }
type Query = { kind: Kind; partnerId: string; from: string; through: string }

const props = defineProps<{ workspaceId: string; startsOn: string; through: string }>()
const base = computed(() => `/bff/api/finance/workspaces/${props.workspaceId}`)
const form = reactive<Query>({ kind: 'receivables', partnerId: '', from: props.startsOn, through: props.through })
const ledger = shallowRef<Ledger>()
const partners = shallowRef<Partner[]>([])
const journal = shallowRef<{ journal: { sourceNumber: string; memo: string; on: string } }>()
const submitted = shallowRef<Query>()
const partnerPage = ref(0)
const morePartners = ref(false)
const page = ref(1)
const shown = ref(false)
const busy = ref(false)
const problem = ref('')

const kinds = [{ label: '客户应收', value: 'receivables' }, { label: '供应商应付', value: 'payables' }]
const documents: Record<string, string> = {
  invoice: '发票', receipt: '收款', allocation: '核销', credit: '客户贷项', refund: '客户退款',
  bill: '账单', payment: '付款', suppliercredit: '供应商贷项', supplierrefund: '供应商退款', void: '冲销',
}
const partnerOptions = computed(() => partners.value.map(x => ({ value: x.id, label: `${x.code} · ${x.name}` })))
const money = (value: string) => formatDecimal(value, ledger.value?.minorUnits ?? 2)
const columns = computed<TableColumn<Entry>[]>(() => [
  { accessorKey: 'number', header: '单号' }, { accessorKey: 'on', header: '过账日期' },
  { id: 'kind', header: '业务', accessorFn: x => documents[x.kind] ?? x.kind },
  { id: 'openDelta', header: '应收应付变动', accessorFn: x => money(x.openDelta) },
  { id: 'openBalance', header: '应收应付余额', accessorFn: x => money(x.openBalance) },
  { id: 'fundsDelta', header: '往来款变动', accessorFn: x => money(x.fundsDelta) },
  { id: 'fundsBalance', header: '往来款余额', accessorFn: x => money(x.fundsBalance) },
  { id: 'journal', header: '凭证' },
])
const balances = computed(() => ledger.value ? [
  { label: ledger.value.kind === 'receivables' ? '客户应收' : '供应商应付', value: ledger.value.open },
  { label: ledger.value.kind === 'receivables' ? '客户预收及贷项余额' : '应收供应商退款', value: ledger.value.funds },
] : [])

async function run(action: () => Promise<void>) {
  if (busy.value) return
  busy.value = true
  problem.value = ''
  try { await action() }
  catch (error) { problem.value = (error as { data?: { detail?: string } }).data?.detail ?? '无法读取往来台账。' }
  finally { busy.value = false }
}

async function loadPartners() {
  const result = await $fetch<{ items: Partner[]; hasMore: boolean }>(`/bff/api/masterdata/workspaces/${props.workspaceId}/partners`, {
    retry: 0, query: { page: partnerPage.value + 1, role: form.kind === 'receivables' ? 'customer' : 'supplier' },
  })
  partners.value = [...partners.value, ...result.items]
  partnerPage.value++
  morePartners.value = result.hasMore
}

function changeKind(kind: Kind) {
  if (kind === form.kind) return
  void run(async () => {
    form.kind = kind
    form.partnerId = ''
    partnerPage.value = 0
    partners.value = []
    morePartners.value = false
    await loadPartners()
  })
}

async function read(query: Query, targetPage: number, watermark?: number) {
  const result = await $fetch<Ledger>(`${base.value}/reporting/partner-ledgers/${query.kind}/${query.partnerId}`, {
    retry: 0, query: { from: query.from, through: query.through, page: targetPage, watermark },
  })
  ledger.value = result
  submitted.value = query
  page.value = targetPage
  journal.value = undefined
}

function show() {
  shown.value = true
  if (!partnerPage.value) void run(loadPartners)
}

function move(target: number) {
  const query = submitted.value
  if (query && ledger.value) void run(() => read(query, target, ledger.value!.watermark))
}

function detail(id: string) {
  return run(async () => { journal.value = await $fetch(base.value + '/ledger/journals/' + id, { retry: 0 }) })
}
</script>

<template>
  <section aria-label="往来台账" class="mt-6 space-y-3">
    <h3>往来台账</h3>
    <UButton v-if="!shown" type="button" variant="outline" color="neutral" @click="show">打开往来台账</UButton>
    <template v-else>
      <form @submit.prevent="run(() => read({ ...form }, 1))">
        <fieldset :disabled="busy" class="flex flex-wrap items-end gap-2">
          <UFormField label="往来方向" name="ledgerKind">
            <USelect :model-value="form.kind" :items="kinds" @update:model-value="value => changeKind(value as Kind)" />
          </UFormField>
          <UFormField label="往来单位" name="ledgerPartner">
            <USelect v-model="form.partnerId" :items="partnerOptions" class="min-w-40" placeholder="选择往来单位" />
          </UFormField>
          <UButton v-if="morePartners || !partnerPage" type="button" variant="outline" color="neutral" @click="run(loadPartners)">加载往来单位</UButton>
          <UFormField label="台账起始日期" name="ledgerFrom">
            <UInput v-model="form.from" type="date" :min="startsOn" required />
          </UFormField>
          <UFormField label="台账截止日期" name="ledgerThrough">
            <UInput v-model="form.through" type="date" :min="form.from" required />
          </UFormField>
          <UButton type="submit" :disabled="!form.partnerId">查询往来台账</UButton>
        </fieldset>
      </form>
      <p v-if="problem" role="alert">{{ problem }}</p>
      <template v-if="ledger">
        <p>{{ ledger.currency }} · 过账水位 {{ ledger.watermark }}</p>
        <dl>
          <template v-for="balance in balances" :key="balance.label">
            <dt>{{ balance.label }}</dt>
            <dd>期初 {{ money(balance.value.opening) }} · 增加 {{ money(balance.value.increases) }} ·
              减少 {{ money(balance.value.decreases) }} · 期末 {{ money(balance.value.closing) }}</dd>
          </template>
        </dl>
        <UTable :data="ledger.items" :columns="columns" :get-row-id="item => item.id" :loading="busy">
          <template #journal-cell="{ row }">
            <UButton type="button" variant="outline" color="neutral" size="xs" :disabled="busy" @click="detail(row.original.journalId)">查看台账凭证</UButton>
          </template>
        </UTable>
        <p v-if="journal">{{ journal.journal.sourceNumber }} · {{ journal.journal.on }} · {{ journal.journal.memo }}</p>
        <div v-if="page > 1 || ledger.hasMore" class="flex gap-2">
          <UButton type="button" variant="outline" color="neutral" :disabled="page === 1 || busy" @click="move(page - 1)">上一页</UButton>
          <UButton type="button" variant="outline" color="neutral" :disabled="!ledger.hasMore || busy" @click="move(page + 1)">下一页</UButton>
        </div>
      </template>
    </template>
  </section>
</template>

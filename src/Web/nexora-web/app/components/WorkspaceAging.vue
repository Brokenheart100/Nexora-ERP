<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'

type Kind = 'receivables' | 'payables'
interface Item {
  id: string; partnerId: string | null; partnerName: string | null; number: string; on: string; dueOn: string
  journalId: string; original: string; outstanding: string; bucket: string
}
interface Aging {
  kind: Kind; currency: string; minorUnits: number; through: string; watermark: number; total: string
  buckets: { key: string; count: number; amount: string }[]; items: Item[]
}
interface Overview {
  currency: string; minorUnits: number; watermark: number; income: string; expense: string; profit: string
  cash: string; receivable: string; payable: string
}
const props = defineProps<{ workspaceId: string }>()
const base = computed(() => '/bff/api/finance/workspaces/' + props.workspaceId)
const startsOn = ref('')
const form = reactive({ kind: 'receivables' as Kind, from: '', through: '' })
const aging = shallowRef<Aging>()
const overview = shallowRef<Overview>()
const journal = shallowRef<{ journal: { sourceNumber: string; memo: string; on: string } }>()
const busy = ref(false)
const notice = ref('')
const buckets: Record<string, string> = { current: '未逾期', '1-30': '逾期 1–30 天', '31-60': '逾期 31–60 天', '61-90': '逾期 61–90 天', 'over-90': '逾期超过 90 天' }
const kindOptions = [{ label: '客户应收', value: 'receivables' }, { label: '供应商应付', value: 'payables' }]
function setKind(value: string) { form.kind = value as Kind }
const totals = [
  ['income', '本期收入'], ['expense', '本期费用'], ['profit', '本期净利润'], ['cash', '期末现金'],
  ['receivable', '应收未结'], ['payable', '应付未结'],
] as const

async function run(action: () => Promise<void>) {
  if (busy.value) return
  busy.value = true; notice.value = ''
  try { await action() }
  catch (error) { notice.value = (error as { data?: { detail?: string } }).data?.detail ?? '无法读取财务概览或账龄。' }
  finally { busy.value = false }
}
async function open() {
  const book = await $fetch<{ startsOn: string }>(base.value + '/ledger', { retry: 0 })
  startsOn.value = book.startsOn
  form.from = book.startsOn
  const now = new Date()
  const today = [now.getFullYear(), now.getMonth() + 1, now.getDate()].map(value => String(value).padStart(2, '0')).join('-')
  form.through = today < book.startsOn ? book.startsOn : today
  await query()
}
async function query() {
  journal.value = undefined
  const summary = await $fetch<Overview>(base.value + '/reporting/overview', { retry: 0, query: { from: form.from, through: form.through } })
  const balances = await $fetch<Aging>(base.value + '/reporting/aging/' + form.kind,
    { retry: 0, query: { through: form.through, watermark: summary.watermark } })
  overview.value = summary
  aging.value = balances
}
async function detail(id: string) {
  journal.value = await $fetch(base.value + '/ledger/journals/' + id, { retry: 0 })
}
const money = (amount: string) => formatDecimal(amount, aging.value?.minorUnits ?? 2)
const columns: TableColumn<Item>[] = [
  { accessorKey: 'number', header: '单号' },
  { id: 'partner', header: '往来单位', accessorFn: item => item.partnerName ?? item.partnerId ?? '—' },
  { accessorKey: 'dueOn', header: '到期日期' },
  { id: 'bucket', header: '账龄', accessorFn: item => buckets[item.bucket] ?? item.bucket },
  { id: 'original', header: '原金额', accessorFn: item => money(item.original) },
  { id: 'outstanding', header: '未结金额', accessorFn: item => money(item.outstanding) },
  { id: 'action', header: '来源' },
]

onMounted(() => { void open().catch(() => { /* 首屏加载失败时保留空状态，可用模块内按钮重试 */ }) })
</script>

<template>
  <section class="card aging" aria-labelledby="aging-title">
    <h2 id="aging-title"><UIcon class="mr-2 inline-block size-[1.08em] align-[-0.16em] text-nx-primary" name="i-lucide-hourglass" aria-hidden="true" />财务概览与账龄</h2>
    <UButton v-if="!startsOn" variant="outline" color="neutral" size="sm" :disabled="busy" type="button" @click="run(open)">打开财务概览与账龄</UButton>
    <form v-else @submit.prevent="run(query)">
      <fieldset :disabled="busy"><legend>财务概览与账龄查询</legend>
        <UFormField label="概览开始日期" name="agingFrom">
          <UInput :model-value="form.from" type="date" :min="startsOn" required
            @update:model-value="value => form.from = String(value)" />
        </UFormField>
        <UFormField label="账龄截止日期" name="agingThrough">
          <UInput :model-value="form.through" type="date" :min="form.from" required
            @update:model-value="value => form.through = String(value)" />
        </UFormField>
        <UFormField label="未结项目" name="agingKind">
          <USelect :model-value="form.kind" :items="kindOptions"
            @update:model-value="value => setKind(String(value))" />
        </UFormField>
        <UButton type="submit" color="primary">查询财务概览与账龄</UButton>
      </fieldset>
    </form>
    <UAlert v-if="notice" role="status" :description="notice" />
    <template v-if="aging && overview">
      <p>截至 {{ aging.through }} · {{ aging.currency }} · 过账水位 {{ aging.watermark }}</p>
      <dl class="aging-totals">
        <template v-for="[key, label] in totals" :key="key"><dt>{{ label }}</dt><dd>{{ money(overview[key]) }}</dd></template>
      </dl>
      <h3>{{ aging.kind === 'receivables' ? '客户应收账龄' : '供应商应付账龄' }}</h3>
      <p>未结总额 {{ money(aging.total) }}</p>
      <ul><li v-for="bucket in aging.buckets" :key="bucket.key">{{ buckets[bucket.key] }} · {{ bucket.count }} 单 · {{ money(bucket.amount) }}</li></ul>
      <UTable
        data-testid="aging-items"
        :loading="busy"
        :data="aging.items"
        :columns="columns"
        :get-row-id="item => item.id"
        :ui="{ td: 'align-top whitespace-normal', th: 'whitespace-nowrap' }"
      >
        <template #action-cell="{ row }">
          <UButton variant="outline" color="neutral" size="xs" type="button" :disabled="busy" @click="run(() => detail(row.original.journalId))">查看未结项凭证</UButton>
        </template>
      </UTable>
      <p v-if="journal">{{ journal.journal.sourceNumber }} · {{ journal.journal.on }} · {{ journal.journal.memo }}</p>
    </template>
  </section>
</template>

<style scoped>
.aging { margin-top: 24px }
fieldset { display: flex; flex-wrap: wrap; gap: 10px; align-items: end; min-width: 0; margin: 12px 0 }
.aging-totals { display: grid; grid-template-columns: max-content 1fr; padding: 15px 18px; margin: 14px 0; background: #fbfcfe; border: 1px solid #e9eef5; border-radius: 13px }
.aging-totals dt { font-size: 11.5px }
.aging-totals dd { font-weight: 650; color: #1b2b43 }
html.dark .aging li { background: var(--nx-surface-muted); border-color: var(--nx-border) }
html.dark .aging-totals { background: var(--nx-surface-muted); border-color: var(--nx-border) }
html.dark .aging-totals dd { color: var(--nx-ink-2) }
dl { font-size: 13px }
dt { color: var(--nx-ink-3) }
dd { margin: 0; overflow-wrap: anywhere }
li { overflow-wrap: anywhere }
</style>

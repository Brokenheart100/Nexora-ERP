<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import { z } from 'zod'
import type { AgingKind, ReportRange, ReportRevision } from '#shared/types/reporting'
import type { OpenItemAging, partnerLedgerSchema } from '#shared/types/trade'
import { useWorkspaceQuery } from '~/composables/api/useWorkspaceQuery'
import { useLedgerApi } from '~/composables/api/useLedgerApi'
import { reportPageSize, useReportingApi } from '~/composables/api/useReportingApi'
import { bookmarkedReportWatermark, currentReportRange, validReportRange } from '~/utils/finance/reporting'
import { displayDecimal } from '~/utils/api/decimal-display'

const route = useRoute()
const router = useRouter()
const api = useReportingApi()
const ledgerApi = useLedgerApi()
const book = useWorkspaceQuery('report-book', '/finance', ledgerApi.book)
const workspace = computed(() => book.session.activeWorkspaceId)
const start = computed(() => book.data?.settings?.startsOn ?? '')
const draft = reactive<{ kind: AgingKind, through: string }>({ kind: 'receivables', through: '' })
const selected = shallowRef<{ kind: AgingKind, through: string, watermark?: ReportRevision } | null>(null)
const page = ref(1)
const first = useWorkspaceQuery('aging-report', '/finance', (id, signal) => {
  const request = selected.value
  return request ? api.aging(id, request.kind, request.through, 1, request.watermark, signal) : Promise.resolve(null)
}, () => selected.value)
const subsequent = useWorkspaceQuery('aging-report-page', '/finance', (id, signal) => {
  const request = selected.value
  return request && first.data && page.value > 1
    ? api.aging(id, request.kind, request.through, page.value, first.data.watermark, signal)
    : Promise.resolve(null)
}, () => [selected.value, first.data?.watermark, page.value])
const rows = computed(() => page.value === 1 ? first.data?.items ?? [] : subsequent.data?.items ?? [])
const rowCount = computed(() => first.data?.buckets.reduce((sum, bucket) => sum + bucket.count, 0) ?? 0)
const validDate = computed(() => !!start.value && validReportRange({ from: start.value, through: draft.through }, start.value))

const ledgerOpen = ref(false)
const ledgerDraft = reactive<ReportRange>({ from: '', through: '' })
const subject = shallowRef<{ id: string, name: string, kind: AgingKind, through: string, watermark: ReportRevision } | null>(null)
const ledgerRange = shallowRef<ReportRange | null>(null)
const ledgerPage = ref(1)
const ledger = useWorkspaceQuery('report-partner-ledger', '/finance', (id, signal) => {
  const partner = subject.value
  return ledgerOpen.value && partner && ledgerRange.value
    ? api.partnerLedger(id, partner.kind, partner.id, ledgerRange.value, partner.watermark, ledgerPage.value, signal)
    : Promise.resolve(null)
}, () => [ledgerOpen.value ? subject.value : null, ledgerRange.value, ledgerPage.value])
const kinds = [{ value: 'receivables', label: '应收' }, { value: 'payables', label: '应付' }]
const buckets: Record<string, string> = { 'current': '未到期', '1-30': '1–30 天', '31-60': '31–60 天', '61-90': '61–90 天', 'over-90': '超过 90 天' }
type Item = OpenItemAging['items'][number]
type Entry = z.infer<typeof partnerLedgerSchema>['items'][number]
const columns: TableColumn<Item>[] = [
  { accessorKey: 'number', header: '单据' }, { accessorKey: 'partnerName', header: '往来单位' },
  { accessorKey: 'dueOn', header: '到期日' }, { accessorKey: 'bucket', header: '账龄' },
  { accessorKey: 'original', header: '原额' }, { accessorKey: 'outstanding', header: '未结余额' },
  { id: 'partner', header: '明细' }
]
const ledgerColumns: TableColumn<Entry>[] = [
  { accessorKey: 'on', header: '业务日期' }, { accessorKey: 'number', header: '凭证来源' },
  { accessorKey: 'openDelta', header: '未结变动' }, { accessorKey: 'openBalance', header: '未结余额' },
  { accessorKey: 'fundsDelta', header: '收付变动' }, { accessorKey: 'fundsBalance', header: '收付余额' },
  { id: 'document', header: '原单' }
]

watch(() => book.owner, () => {
  selected.value = null
  page.value = 1
  ledgerOpen.value = false
  ledgerRange.value = null
  subject.value = null
}, { flush: 'sync' })

async function refresh() {
  page.value = 1
  await first.refresh()
}

function apply(watermark?: string) {
  if (!validDate.value) return
  page.value = 1
  ledgerOpen.value = false
  const next = { ...draft, watermark }
  if (JSON.stringify(selected.value) === JSON.stringify(next)) void refresh()
  else selected.value = next
}

watch(start, (value) => {
  if (!value || selected.value) return
  draft.kind = route.query.aging === 'payables' ? 'payables' : 'receivables'
  const through = z.iso.date().safeParse(route.query.through).data
  const valid = !!through && validReportRange({ from: value, through }, value)
  draft.through = valid ? through! : currentReportRange(value).through
  const bookmark = bookmarkedReportWatermark(route.query, workspace.value)
  apply(valid ? bookmark : undefined)
  const storedPage = Number(route.query.agingPage)
  if (bookmark && Number.isInteger(storedPage) && storedPage > 1 && storedPage <= 100_000) page.value = storedPage
}, { immediate: true })

watch(() => [first.data, page.value] as const, ([snapshot, current]) => {
  if (!snapshot || route.path !== '/finance' || !selected.value) return
  const last = Math.max(1, Math.ceil(rowCount.value / reportPageSize))
  if (current > last) {
    page.value = last
    return
  }
  void router.replace({ query: { ...route.query, tab: 'aging', aging: selected.value.kind, through: snapshot.through,
    workspace: workspace.value, snapshotWorkspace: workspace.value, watermark: String(snapshot.watermark), agingPage: String(current) } })
})

function openLedger(row: Item) {
  if (!row.partnerId || !selected.value || !first.data) return
  subject.value = { id: row.partnerId, name: row.partnerName || '往来单位', kind: selected.value.kind,
    through: first.data.through, watermark: first.data.watermark }
  Object.assign(ledgerDraft, { from: start.value, through: first.data.through })
  ledgerRange.value = { ...ledgerDraft }
  ledgerPage.value = 1
  ledgerOpen.value = true
}

const ledgerValid = computed(() => !!subject.value && validReportRange(ledgerDraft, start.value) && ledgerDraft.through <= subject.value.through)
function applyLedger() {
  if (!ledgerValid.value) return
  ledgerPage.value = 1
  const next = { ...ledgerDraft }
  if (JSON.stringify(next) === JSON.stringify(ledgerRange.value)) void ledger.refresh()
  else ledgerRange.value = next
}

function money(value: string) {
  return displayDecimal(value, first.data?.minorUnits ?? 0)
}
function journal(id: string) {
  return { path: '/finance', query: { workspace: workspace.value, tab: 'journals', journal: id } }
}
function documentLink(kind: AgingKind, id: string) {
  return kind === 'receivables'
    ? { path: '/sales', query: { workspace: workspace.value, tab: 'receivables', document: id } }
    : { path: '/finance', query: { workspace: workspace.value, tab: 'payables', bill: id } }
}
function ledgerDocument(row: Entry) {
  if (subject.value?.kind === 'receivables') return documentLink('receivables', row.id)
  if (row.kind === 'bill') return documentLink('payables', row.id)
  if (row.relatedDocumentId && ['payment', 'supplier-credit'].includes(row.kind)) return documentLink('payables', row.relatedDocumentId)
}

defineExpose({ refresh })
</script>

<template>
  <section data-testid="live-report-aging">
    <UCard class="rounded-sm">
      <template #header>
        <h2 class="font-semibold">
          账龄与往来明细
        </h2>
      </template>
      <USkeleton v-if="book.loading && !book.data" class="h-20 w-full" />
      <UAlert v-else-if="book.problem" color="error" :title="book.problem" />
      <UAlert v-else-if="!start" color="warning" title="请先初始化账簿。" />
      <div v-else class="space-y-4">
        <form class="flex flex-wrap items-end gap-2" @submit.prevent="apply()">
          <UFormField label="账龄类型">
            <USelect v-model="draft.kind" :items="kinds" data-testid="aging-kind" />
          </UFormField>
          <UFormField label="截止日期">
            <UInput
              v-model="draft.through"
              type="date"
              :min="start"
              data-testid="aging-through"
            />
          </UFormField>
          <UButton
            label="查询账龄"
            type="submit"
            :disabled="!validDate"
            data-testid="aging-apply"
          />
        </form>
        <USkeleton v-if="first.loading && !first.data" class="h-24 w-full" />
        <UAlert v-else-if="first.problem" color="error" :title="first.problem" />
        <template v-else-if="first.data">
          <div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm" data-testid="aging-snapshot">
            <strong>未结合计 {{ money(first.data.total) }} {{ first.data.currency }}</strong>
            <span class="text-muted">截至 {{ first.data.through }} · 过账水位 {{ first.data.watermark }} · 共 {{ rowCount }} 笔</span>
          </div>
          <dl class="grid grid-cols-2 gap-2 sm:grid-cols-5">
            <div v-for="bucket in first.data.buckets" :key="bucket.key" class="rounded-sm bg-elevated/50 p-2 text-sm tabular-nums">
              <dt class="text-xs text-muted">
                {{ buckets[bucket.key] ?? bucket.key }} · {{ bucket.count }} 笔
              </dt>
              <dd>{{ money(bucket.amount) }}</dd>
            </div>
          </dl>
          <USkeleton v-if="page > 1 && subsequent.loading" class="h-20 w-full" />
          <UAlert v-else-if="page > 1 && subsequent.problem" color="error" :title="subsequent.problem" />
          <UTable
            v-else
            :data="rows"
            :columns="columns"
            class="nx-table"
            data-testid="aging-items"
          >
            <template #number-cell="{ row }">
              <UButton
                :label="row.original.number"
                :to="documentLink(selected?.kind ?? 'receivables', row.original.id)"
                variant="link"
                size="xs"
              />
            </template>
            <template #bucket-cell="{ row }">
              {{ buckets[row.original.bucket] ?? row.original.bucket }}
            </template>
            <template #original-cell="{ row }">
              {{ money(row.original.original) }}
            </template>
            <template #outstanding-cell="{ row }">
              {{ money(row.original.outstanding) }}
            </template>
            <template #partner-cell="{ row }">
              <UButton
                v-if="row.original.partnerId"
                label="往来明细账"
                variant="ghost"
                size="xs"
                :data-testid="'aging-ledger-' + row.original.id"
                @click="openLedger(row.original)"
              />
            </template>
            <template #empty>
              该快照没有未结单据。
            </template>
          </UTable>
          <UPagination
            v-if="rowCount > reportPageSize"
            v-model:page="page"
            :items-per-page="reportPageSize"
            :total="rowCount"
            data-testid="aging-pagination"
          />
        </template>
      </div>
    </UCard>
    <USlideover v-model:open="ledgerOpen" :title="subject?.name + ' · 往来明细账'" :ui="{ content: 'sm:max-w-4xl' }">
      <template #body>
        <form class="mb-3 flex flex-wrap items-end gap-2" @submit.prevent="applyLedger">
          <UFormField label="开始日期">
            <UInput
              v-model="ledgerDraft.from"
              type="date"
              :min="start"
              data-testid="partner-ledger-from"
            />
          </UFormField>
          <UFormField label="结束日期" help="以当前账龄快照为上限">
            <UInput
              v-model="ledgerDraft.through"
              type="date"
              :min="ledgerDraft.from"
              :max="subject?.through"
              data-testid="partner-ledger-through"
            />
          </UFormField>
          <UButton
            label="查询明细"
            type="submit"
            :disabled="!ledgerValid"
            data-testid="partner-ledger-apply"
          />
        </form>
        <USkeleton v-if="ledger.loading && !ledger.data" class="h-24 w-full" />
        <UAlert v-else-if="ledger.problem" color="error" :title="ledger.problem" />
        <div v-else-if="ledger.data" class="space-y-3" data-testid="partner-ledger">
          <p class="text-sm text-muted">
            {{ ledger.data.from }} 至 {{ ledger.data.through }} · {{ ledger.data.currency }} · 过账水位 {{ ledger.data.watermark }}
          </p>
          <dl v-for="balance in [{ label: '未结', values: ledger.data.open }, { label: '收付', values: ledger.data.funds }]" :key="balance.label" class="flex flex-wrap gap-x-4 gap-y-1 rounded-sm bg-elevated/50 p-2 text-sm tabular-nums">
            <dt>{{ balance.label }}</dt>
            <dd>期初 {{ money(balance.values.opening) }}</dd>
            <dd>增加 {{ money(balance.values.increases) }}</dd>
            <dd>减少 {{ money(balance.values.decreases) }}</dd>
            <dd>期末 {{ money(balance.values.closing) }}</dd>
          </dl>
          <UTable :data="ledger.data.items" :columns="ledgerColumns" class="nx-table">
            <template #number-cell="{ row }">
              <UButton
                :label="row.original.number"
                :to="journal(row.original.journalId)"
                variant="link"
                size="xs"
              />
            </template>
            <template #document-cell="{ row }">
              <UButton
                v-if="ledgerDocument(row.original)"
                label="查看单据"
                :to="ledgerDocument(row.original)"
                variant="link"
                size="xs"
              />
            </template>
            <template #empty>
              该期间没有明细。
            </template>
          </UTable>
          <div class="flex items-center gap-2">
            <UButton
              label="上一页"
              variant="ghost"
              :disabled="ledgerPage === 1"
              @click="ledgerPage--"
            />
            <span class="text-xs text-muted">第 {{ ledgerPage }} 页</span>
            <UButton
              label="下一页"
              variant="ghost"
              :disabled="!ledger.data.hasMore"
              @click="ledgerPage++"
            />
          </div>
        </div>
      </template>
    </USlideover>
  </section>
</template>

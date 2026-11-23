<script setup lang="ts">
import type { AgingBucket, PartnerLedgerEntry } from '~/mocks'
import { invoices, invoiceStatusColors, invoiceStatusLabels, purchaseOrders } from '~/mocks'
import type { OpenItemAging } from '#shared/types/trade'
import { displayDecimal } from '~/utils/api/decimal-display'

const props = defineProps<{
  aging: AgingBucket[]
  partnerLedgers: PartnerLedgerEntry[]
  receivableBuckets?: AgingBucket[]
  receivableOpenInvoices?: { id: string, customerName: string, dueAt: string, bucket: string, outstanding: string }[]
  connected?: boolean
  liveAging?: { receivable: OpenItemAging, payable: OpenItemAging }
  workspaceId?: string
  loading?: boolean
  problem?: string
}>()

const agingTab = ref<'receivable' | 'payable'>('receivable')
const agingTabItems = [
  { label: '应收账龄', value: 'receivable' },
  { label: '应付账龄', value: 'payable' }
]
const liveReport = computed(() => props.liveAging?.[agingTab.value])
const bucketLabels: Record<string, string> = { 'current': '未到期', '1-30': '逾期 1–30 天', '31-60': '逾期 31–60 天', '61-90': '逾期 61–90 天', 'over-90': '逾期超过 90 天' }

const search = ref('')
const direction = ref<'all' | 'ar' | 'ap'>('all')
const detailOpen = ref(false)
const selectedDocId = ref('')

const orderStatusText: Record<string, string> = {
  draft: '草稿',
  pending: '待审批',
  approved: '已审批',
  confirmed: '已确认',
  completed: '已完成',
  cancelled: '已取消',
  rejected: '已驳回',
  closed: '已关闭'
}

const receivableRows = computed(() => props.receivableBuckets ?? props.aging)
const receivableTotal = computed(() => receivableRows.value.reduce((sum, row) => sum + Number(row.receivable), 0))
const payableTotal = computed(() => props.aging.reduce((sum, row) => sum + Number(row.payable), 0))

const agingRows = computed(() =>
  props.aging.map((row, index) => {
    const total = agingTab.value === 'receivable' ? receivableTotal.value : payableTotal.value
    const receivableRow = receivableRows.value[index] ?? row
    const amount = Number(agingTab.value === 'receivable' ? receivableRow.receivable : row.payable)
    return {
      bucket: row.bucket,
      amount,
      percent: total > 0 ? Math.round((amount / total) * 100) : 0
    }
  })
)

function directionOf(docId: string): 'ar' | 'ap' {
  return docId.startsWith('INV') || docId.startsWith('RCPT') ? 'ar' : 'ap'
}

const ledgerRows = computed(() => {
  const keyword = search.value.trim().toLowerCase()
  return props.partnerLedgers
    .filter(row => direction.value === 'all' || directionOf(row.docId) === direction.value)
    .filter(row => keyword.length === 0
      || row.partnerName.toLowerCase().includes(keyword)
      || row.docId.toLowerCase().includes(keyword)
      || row.summary.toLowerCase().includes(keyword))
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date))
})

const ledgerDebitTotal = computed(() => ledgerRows.value.reduce((sum, row) => sum + Number(row.debit), 0))
const ledgerCreditTotal = computed(() => ledgerRows.value.reduce((sum, row) => sum + Number(row.credit), 0))

const selectedLedger = computed(() => props.partnerLedgers.find(row => row.docId === selectedDocId.value) ?? null)
const invoiceDoc = computed(() => invoices.find(invoice => invoice.id === selectedDocId.value) ?? null)
const purchaseDoc = computed(() => purchaseOrders.find(order => order.id === selectedDocId.value) ?? null)

function openDoc(row: PartnerLedgerEntry) {
  selectedDocId.value = row.docId
  detailOpen.value = true
}

function purchaseAmount() {
  const order = purchaseDoc.value
  if (!order) return 0
  return order.lines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0)
}
</script>

<template>
  <div v-if="connected" class="space-y-4" data-testid="ledger-panel">
    <UCard class="rounded-sm" data-testid="ledger-aging-table">
      <template #header>
        <div class="flex flex-wrap items-center justify-between gap-2">
          <h2 class="text-sm font-semibold">
            账龄分析
          </h2>
          <UTabs
            v-model="agingTab"
            :items="agingTabItems"
            :content="false"
            size="sm"
            data-testid="ledger-tabs"
          />
        </div>
      </template>
      <USkeleton v-if="loading" class="h-16 w-full" />
      <UAlert
        v-else-if="problem"
        color="warning"
        variant="soft"
        title="账龄暂无法读取"
        :description="problem"
      />
      <div v-else-if="liveReport" class="space-y-2">
        <div
          v-for="bucket in liveReport.buckets"
          :key="bucket.key"
          class="flex justify-between border-b border-default py-2 text-sm"
          data-testid="ledger-aging-row"
        >
          <span>{{ bucketLabels[bucket.key] ?? bucket.key }}</span>
          <span>{{ displayDecimal(bucket.amount, liveReport.minorUnits) }}</span>
        </div>
        <p class="flex justify-between text-sm font-semibold">
          <span>合计</span><span>{{ displayDecimal(liveReport.total, liveReport.minorUnits) }}</span>
        </p>
      </div>
    </UCard>
    <UCard v-if="liveReport" class="rounded-sm" data-testid="ledger-open-invoices">
      <template #header>
        <h2 class="text-sm font-semibold">
          {{ agingTab === 'receivable' ? '未结发票明细' : '未结供应商账单' }}
        </h2>
      </template>
      <p v-if="!liveReport.items.length" class="text-sm text-muted">
        当前没有未结单据。
      </p>
      <div
        v-for="row in liveReport.items"
        :key="row.id"
        class="flex flex-wrap items-center justify-between gap-2 border-b border-default py-2 text-sm"
        data-testid="ledger-open-invoice-row"
      >
        <UButton :label="row.number" variant="link" :to="{ path: agingTab === 'receivable' ? '/sales' : '/finance', query: { workspace: workspaceId, ...(agingTab === 'receivable' ? { tab: 'receivables', invoice: row.id } : { tab: 'payables', bill: row.id }) } }" />
        <span>{{ row.partnerName }} · 到期 {{ row.dueOn }}</span>
        <span>{{ displayDecimal(row.outstanding, liveReport.minorUnits) }}</span>
      </div>
      <p class="mt-2 text-xs text-muted">
        截至 {{ liveReport.through }} · 按当前工作区展示前 20 条。
      </p>
    </UCard>
  </div>
  <div v-else class="space-y-4" data-testid="ledger-panel">
    <UCard class="nx-reveal rounded-sm" :ui="{ body: 'p-0 sm:p-0' }" data-testid="ledger-aging-table">
      <template #header>
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 class="text-sm font-semibold text-highlighted">
              账龄分析
            </h2>
            <p class="mt-0.5 text-xs text-muted">
              应收合计 {{ formatMoney(receivableTotal) }} · 应付合计 {{ formatMoney(payableTotal) }}；金额右对齐展示。
            </p>
          </div>
          <UTabs
            v-model="agingTab"
            :items="agingTabItems"
            :content="false"
            size="sm"
            data-testid="ledger-tabs"
          />
        </div>
      </template>
      <div class="grid grid-cols-[minmax(0,1fr)_12rem_10rem] items-center gap-2 border-b border-default bg-elevated/40 px-3 py-2 text-xs font-medium text-muted">
        <span>账龄区间</span>
        <span class="text-right">金额</span>
        <span class="text-right">占比</span>
      </div>
      <div
        v-for="row in agingRows"
        :key="row.bucket"
        class="grid grid-cols-[minmax(0,1fr)_12rem_10rem] items-center gap-2 border-b border-default/60 px-3 py-2"
        data-testid="ledger-aging-row"
      >
        <span class="text-[13px] text-highlighted">{{ row.bucket }}</span>
        <span class="text-right text-[13px] tabular-nums text-highlighted">{{ formatMoney(row.amount) }}</span>
        <span class="text-right text-xs tabular-nums text-muted">{{ row.percent }}%</span>
      </div>
      <div class="grid grid-cols-[minmax(0,1fr)_12rem_10rem] items-center gap-2 bg-elevated/40 px-3 py-2 text-[13px] font-semibold">
        <span class="text-highlighted">合计</span>
        <span class="text-right tabular-nums text-highlighted">{{ formatMoney(agingTab === 'receivable' ? receivableTotal : payableTotal) }}</span>
        <span class="text-right text-xs text-muted">100%</span>
      </div>
    </UCard>

    <UCard class="nx-reveal rounded-sm" :ui="{ body: 'p-0 sm:p-0' }" data-testid="ledger-open-invoices">
      <template #header>
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 class="text-sm font-semibold text-highlighted">
              未结发票明细
            </h2>
            <p class="mt-0.5 text-xs text-muted">
              按当前工作区与账龄基准日 2026-11-18 计算，金额为未结余额。
            </p>
          </div>
          <UBadge
            color="neutral"
            variant="subtle"
            size="sm"
            :label="String((receivableOpenInvoices ?? []).length) + ' 张'"
          />
        </div>
      </template>
      <div v-if="(receivableOpenInvoices ?? []).length" class="divide-y divide-default">
        <div
          v-for="row in receivableOpenInvoices"
          :key="row.id"
          class="grid grid-cols-[minmax(0,10rem)_minmax(0,1fr)_6rem_9rem_9rem] items-center gap-2 px-3 py-2 text-[13px]"
          data-testid="ledger-open-invoice-row"
        >
          <span class="font-mono text-xs text-highlighted">{{ row.id }}</span>
          <span class="truncate text-default">{{ row.customerName }}</span>
          <span class="text-xs text-muted">{{ row.dueAt }}</span>
          <span class="text-xs text-muted">{{ row.bucket }}</span>
          <span class="text-right tabular-nums text-highlighted">{{ formatMoney(Number(row.outstanding)) }}</span>
        </div>
      </div>
      <div v-else class="px-3 py-6 text-center text-sm text-muted">
        暂无未结发票
      </div>
    </UCard>

    <UCard class="nx-reveal rounded-sm" :ui="{ body: 'p-0 sm:p-0' }" data-testid="ledger-partner-table">
      <template #header>
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 class="text-sm font-semibold text-highlighted">
              伙伴明细账
            </h2>
            <p class="mt-0.5 text-xs text-muted">
              点击单号可钻取到 mock 发票或采购订单；未关联单据会给出提示。
            </p>
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <UInput
              v-model="search"
              icon="i-carbon-search"
              placeholder="搜索伙伴、单号或摘要"
              size="sm"
              class="w-60"
              data-testid="ledger-partner-search"
            />
            <USelect
              v-model="direction"
              :items="[{ label: '全部方向', value: 'all' }, { label: '应收', value: 'ar' }, { label: '应付', value: 'ap' }]"
              size="sm"
              class="w-32"
              data-testid="ledger-partner-filter"
            />
          </div>
        </div>
      </template>

      <div class="grid grid-cols-[5.5rem_minmax(0,1fr)_6.5rem_7rem_minmax(0,1fr)_8rem_8rem_8rem] items-center gap-2 border-b border-default bg-elevated/40 px-3 py-2 text-xs font-medium text-muted">
        <span>日期</span>
        <span>伙伴</span>
        <span>单号</span>
        <span>方向</span>
        <span>摘要</span>
        <span class="text-right">借方</span>
        <span class="text-right">贷方</span>
        <span class="text-right">余额</span>
      </div>

      <div v-if="ledgerRows.length === 0" class="py-6" data-testid="ledger-empty">
        <UEmpty
          variant="naked"
          icon="i-carbon-book"
          title="没有匹配的伙伴明细"
          description="调整搜索关键字或方向筛选再试。"
          :actions="[{ label: '清空筛选', color: 'neutral', variant: 'outline', size: 'sm', onClick: () => { search = ''; direction = 'all' } }]"
        />
      </div>

      <div
        v-for="row in ledgerRows"
        :key="row.id"
        class="grid grid-cols-[5.5rem_minmax(0,1fr)_6.5rem_7rem_minmax(0,1fr)_8rem_8rem_8rem] items-center gap-2 border-b border-default/60 px-3 py-2 last:border-b-0"
        data-testid="ledger-partner-row"
      >
        <span class="text-xs tabular-nums text-muted">{{ row.date }}</span>
        <span class="truncate text-[13px] text-highlighted">{{ row.partnerName }}</span>
        <span data-testid="ledger-drill">
          <UButton
            :label="row.docId"
            variant="link"
            color="primary"
            size="xs"
            class="px-0"
            :data-testid="'ledger-doc-' + row.docId"
            @click="openDoc(row)"
          />
        </span>
        <UBadge
          :label="directionOf(row.docId) === 'ar' ? '应收' : '应付'"
          :color="directionOf(row.docId) === 'ar' ? 'info' : 'warning'"
          variant="subtle"
          size="sm"
        />
        <span class="truncate text-xs text-muted">{{ row.summary }}</span>
        <span class="text-right text-[13px] tabular-nums text-highlighted">{{ formatMoney(Number(row.debit)) }}</span>
        <span class="text-right text-[13px] tabular-nums text-highlighted">{{ formatMoney(Number(row.credit)) }}</span>
        <span class="text-right text-[13px] tabular-nums text-highlighted">{{ formatMoney(Number(row.balance)) }}</span>
      </div>

      <div class="grid grid-cols-[5.5rem_minmax(0,1fr)_6.5rem_7rem_minmax(0,1fr)_8rem_8rem_8rem] items-center gap-2 bg-elevated/40 px-3 py-2 text-[13px] font-semibold">
        <span class="col-span-5 text-highlighted">合计</span>
        <span class="text-right tabular-nums text-highlighted">{{ formatMoney(ledgerDebitTotal) }}</span>
        <span class="text-right tabular-nums text-highlighted">{{ formatMoney(ledgerCreditTotal) }}</span>
        <span class="text-right text-xs text-muted">—</span>
      </div>
    </UCard>

    <USlideover v-model:open="detailOpen" :ui="{ content: 'w-full sm:max-w-xl' }" data-testid="ledger-detail">
      <template #header>
        <div>
          <p class="text-xs text-muted">
            单据钻取
          </p>
          <h2 class="mt-1 text-base font-semibold text-highlighted">
            {{ selectedDocId || '—' }}
          </h2>
          <p class="mt-0.5 text-xs text-muted">
            {{ selectedLedger?.partnerName ?? '—' }} · {{ selectedLedger?.summary ?? '—' }}
          </p>
        </div>
      </template>

      <template #body>
        <div v-if="invoiceDoc" class="space-y-3">
          <div class="flex items-center gap-2">
            <UBadge
              label="销售发票"
              color="info"
              variant="subtle"
              size="sm"
            />
            <UBadge
              :label="invoiceStatusLabels[invoiceDoc.status]"
              :color="invoiceStatusColors[invoiceDoc.status]"
              variant="subtle"
              size="sm"
              data-testid="ledger-detail-status"
            />
          </div>
          <div class="grid gap-2 rounded-sm border border-default p-3 text-[13px] sm:grid-cols-2">
            <div>
              <p class="text-xs text-muted">
                客户
              </p>
              <p class="mt-0.5 text-highlighted">
                {{ invoiceDoc.customerName }}
              </p>
            </div>
            <div>
              <p class="text-xs text-muted">
                关联订单
              </p>
              <p class="mt-0.5 text-highlighted">
                {{ invoiceDoc.sourceOrderId }}
              </p>
            </div>
            <div>
              <p class="text-xs text-muted">
                开票日期
              </p>
              <p class="mt-0.5 text-highlighted">
                {{ invoiceDoc.issuedAt }}
              </p>
            </div>
            <div>
              <p class="text-xs text-muted">
                到期日期
              </p>
              <p class="mt-0.5 text-highlighted">
                {{ invoiceDoc.dueAt }}
              </p>
            </div>
            <div>
              <p class="text-xs text-muted">
                含税金额
              </p>
              <p class="mt-0.5 tabular-nums text-highlighted">
                {{ formatMoney(Number(invoiceDoc.amount)) }}
              </p>
            </div>
            <div>
              <p class="text-xs text-muted">
                税额
              </p>
              <p class="mt-0.5 tabular-nums text-highlighted">
                {{ formatMoney(Number(invoiceDoc.taxAmount)) }}
              </p>
            </div>
          </div>
          <p class="text-xs text-muted">
            该发票来自 app/mocks/billing.ts，仅在本地展示。
          </p>
        </div>

        <div v-else-if="purchaseDoc" class="space-y-3">
          <div class="flex items-center gap-2">
            <UBadge
              label="采购订单"
              color="warning"
              variant="subtle"
              size="sm"
            />
            <UBadge
              :label="orderStatusText[purchaseDoc.status] ?? purchaseDoc.status"
              color="neutral"
              variant="subtle"
              size="sm"
              data-testid="ledger-detail-status"
            />
          </div>
          <div class="grid gap-2 rounded-sm border border-default p-3 text-[13px] sm:grid-cols-2">
            <div>
              <p class="text-xs text-muted">
                供应商
              </p>
              <p class="mt-0.5 text-highlighted">
                {{ purchaseDoc.supplier }}
              </p>
            </div>
            <div>
              <p class="text-xs text-muted">
                联系人
              </p>
              <p class="mt-0.5 text-highlighted">
                {{ purchaseDoc.contact }}
              </p>
            </div>
            <div>
              <p class="text-xs text-muted">
                下单日期
              </p>
              <p class="mt-0.5 text-highlighted">
                {{ purchaseDoc.orderedAt }}
              </p>
            </div>
            <div>
              <p class="text-xs text-muted">
                预计到货
              </p>
              <p class="mt-0.5 text-highlighted">
                {{ purchaseDoc.expectedAt }}
              </p>
            </div>
            <div>
              <p class="text-xs text-muted">
                订单金额
              </p>
              <p class="mt-0.5 tabular-nums text-highlighted">
                {{ formatMoney(purchaseAmount()) }}
              </p>
            </div>
            <div>
              <p class="text-xs text-muted">
                明细行
              </p>
              <p class="mt-0.5 text-highlighted">
                {{ purchaseDoc.lines.length }} 行
              </p>
            </div>
          </div>
          <p class="text-xs text-muted">
            该采购订单来自 app/mocks/purchasing.ts，仅在本地展示。
          </p>
        </div>

        <div v-else class="space-y-3">
          <UAlert
            color="info"
            variant="soft"
            icon="i-carbon-information"
            title="未关联其他 mock 单据"
            description="该单号是收付款或本地账龄演示数据，只在明细账中保留金额记录。"
            data-testid="ledger-detail-empty"
          />
          <div v-if="selectedLedger" class="grid gap-2 rounded-sm border border-default p-3 text-[13px] sm:grid-cols-2">
            <div>
              <p class="text-xs text-muted">
                伙伴
              </p>
              <p class="mt-0.5 text-highlighted">
                {{ selectedLedger.partnerName }}
              </p>
            </div>
            <div>
              <p class="text-xs text-muted">
                摘要
              </p>
              <p class="mt-0.5 text-highlighted">
                {{ selectedLedger.summary }}
              </p>
            </div>
            <div>
              <p class="text-xs text-muted">
                借方
              </p>
              <p class="mt-0.5 tabular-nums text-highlighted">
                {{ formatMoney(Number(selectedLedger.debit)) }}
              </p>
            </div>
            <div>
              <p class="text-xs text-muted">
                贷方
              </p>
              <p class="mt-0.5 tabular-nums text-highlighted">
                {{ formatMoney(Number(selectedLedger.credit)) }}
              </p>
            </div>
          </div>
        </div>
      </template>

      <template #footer>
        <div class="flex w-full justify-end">
          <UButton
            label="关闭"
            color="neutral"
            variant="ghost"
            data-testid="ledger-detail-close"
            @click="detailOpen = false"
          />
        </div>
      </template>
    </USlideover>
  </div>
</template>

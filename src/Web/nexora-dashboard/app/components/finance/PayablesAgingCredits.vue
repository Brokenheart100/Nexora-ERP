<script setup lang="ts">
import type { usePayablesConnection } from '~/composables/finance/usePayablesConnection'
import { displayDecimal } from '~/utils/api/decimal-display'

const props = defineProps<{ live?: ReturnType<typeof usePayablesConnection> }>()
const money = (value: string | number) =>
  typeof value === 'string' ? displayDecimal(value, props.live?.query.data?.home.minorUnits ?? 2) : formatMoney(value)
const liveLedger = computed(() =>
  props.live?.reports.data?.ledger?.state === 'ready' ? props.live.reports.data.ledger.data : null
)
const partnerOptions = computed(() => [
  ...new Map(
    [
      ...(props.live?.query.data?.suppliers?.items.map(value => ({ value: value.id, label: value.code + ' ' + value.name })) ?? []),
      ...(props.live?.query.data?.documents
        .filter(value => value.terms.partnerId)
        .map(value => ({ value: value.terms.partnerId!, label: props.live!.partnerName(value.terms.partnerId!) })) ?? [])
    ].map(value => [value.value, value])
  ).values()
])
const liveAging = computed(() => (props.live?.reports.data?.aging.state === 'ready' ? props.live.reports.data.aging.data : null))

const emit = defineEmits<{
  'open-bill': [billId: string]
  'open-credit': [creditId: string]
}>()

const store = useSupplierTradeStore()
const { activeWorkspaceId } = useMockWorkspace()
const workspaceBills = computed(() => store.bills.filter(bill => bill.workspaceId === activeWorkspaceId.value))
const workspaceCredits = computed(() => store.credits.filter(credit => credit.workspaceId === activeWorkspaceId.value))

const agingBucketNames = ['未到期', '1-30 天', '31-60 天', '60 天以上']
const mockAgingRows = computed(() => {
  const totals = new Map<string, number>()
  for (const name of agingBucketNames) totals.set(name, 0)
  for (const bill of workspaceBills.value) {
    if (bill.status !== 'posted') continue
    const outstanding = store.outstandingOf(bill)
    if (outstanding <= 0.005) continue
    const bucket = agingBucketOf(bill.dueAt)
    totals.set(bucket, (totals.get(bucket) ?? 0) + outstanding)
  }
  return agingBucketNames.map(name => ({ bucket: name, amount: Math.round((totals.get(name) ?? 0) * 100) / 100 }))
})
const agingTotal = computed(() =>
  props.live ? (liveAging.value?.total ?? '待查询') : mockAgingRows.value.reduce((sum, row) => sum + row.amount, 0)
)
const mockOpenBills = computed(() =>
  workspaceBills.value.filter(bill => bill.status === 'posted' && store.outstandingOf(bill) > 0.005)
)

const agingRows = computed(() =>
  props.live ? (liveAging.value?.buckets.map(value => ({ bucket: value.key, amount: value.amount })) ?? []) : mockAgingRows.value
)
const openBills = computed(() =>
  props.live
    ? (liveAging.value?.items.map(value => ({ id: value.id, number: value.number,
        supplier: value.partnerName ?? (value.partnerId ? props.live!.partnerName(value.partnerId) : '—') })) ?? [])
    : mockOpenBills.value.map(value => ({ ...value, number: value.id }))
)
function outstanding(id: string) {
  if (props.live) return liveAging.value?.items.find(value => value.id === id)?.outstanding ?? '待查询'
  const value = store.bills.find(value => value.id === id)
  return value ? store.outstandingOf(value) : 0
}
function agingBucketOf(dueAt: string) {
  const days = Math.floor((new Date('2026-11-18T00:00:00').getTime() - new Date(dueAt + 'T00:00:00').getTime()) / 86400000)
  if (days <= 0) return '未到期'
  if (days <= 30) return '1-30 天'
  if (days <= 60) return '31-60 天'
  return '60 天以上'
}
function creditBill(creditId: string) {
  return store.bills.find(bill => bill.id === creditId) ?? null
}
function creditRefundTotal(creditId: string) {
  return store.refundsOf(creditId).reduce((sum, refund) => sum + refund.amount, 0)
}
</script>

<template>
  <div class="grid gap-4 xl:grid-cols-2">
    <UCard class="rounded-sm" :ui="{ body: 'p-0 sm:p-0' }" data-testid="payables-aging">
      <template #header>
        <div class="flex items-center justify-between gap-3">
          <div>
            <h3 class="text-sm font-semibold text-highlighted">
              采购应付账龄
            </h3><p class="mt-0.5 text-xs text-muted">
              按已过账账单到期日归集，未结金额实时联动。
            </p>
          </div>
          <UBadge
            label="账单口径"
            color="neutral"
            variant="subtle"
            size="sm"
          />
        </div>
      </template>
      <div class="px-4 py-3">
        <div v-if="live" class="mb-3 grid gap-2 sm:grid-cols-2">
          <UFormField label="应付明细起日">
            <UInput
              :model-value="live.report.from"
              type="date"
              data-testid="payables-report-from"
              @update:model-value="value => live?.updateReport('from', String(value))"
            />
          </UFormField><UFormField label="截止日期">
            <UInput
              :model-value="live.report.through"
              type="date"
              data-testid="payables-report-through"
              @update:model-value="value => live?.updateReport('through', String(value))"
            />
          </UFormField>
        </div>
        <UAlert v-if="live && (live.reports.problem || live.reports.data?.aging.state !== 'ready')" color="warning" :title="live.reports.problem || (live.reports.data?.aging.state !== 'ready' ? live.reports.data?.aging.message : '') || '账龄读取中'" />
        <div
          v-for="row in agingRows"
          :key="row.bucket"
          class="flex items-center justify-between border-b border-default py-2 text-sm last:border-b-0"
          data-testid="payables-aging-row"
        >
          <span class="text-muted">{{ row.bucket }}</span><span class="tabular-nums text-highlighted">{{ money(row.amount) }}</span>
        </div>
        <div class="mt-2 flex items-center justify-between rounded-sm bg-elevated/40 px-3 py-2 text-sm font-medium">
          <span>应付未结合计</span><span class="tabular-nums text-highlighted" data-testid="payables-aging-total">{{ money(agingTotal) }}</span>
        </div>
        <div v-if="openBills.length" class="mt-3 space-y-1">
          <p class="text-xs font-medium text-muted">
            未结账单
          </p>
          <button
            v-for="bill in openBills"
            :key="bill.id"
            type="button"
            class="flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-left text-xs hover:bg-elevated"
            @click="emit('open-bill', bill.id)"
          >
            <span class="text-highlighted">{{ bill.number }} · {{ bill.supplier }}</span><span class="tabular-nums">{{ money(outstanding(bill.id)) }}</span>
          </button>
        </div>
      </div>
      <div v-if="live" class="flex justify-end gap-2 p-3">
        <UButton
          label="上一页账龄"
          variant="outline"
          :disabled="live.report.agingPage <= 1"
          @click="live.changeReportPage('agingPage', -1)"
        /><UButton
          label="下一页账龄"
          variant="outline"
          :disabled="(liveAging?.items.length ?? 0) < 20"
          @click="live.changeReportPage('agingPage', 1)"
        />
      </div>
    </UCard>

    <UCard class="rounded-sm" :ui="{ body: 'p-0 sm:p-0' }" :data-testid="live ? 'payables-partner-ledger' : 'payables-credits'">
      <template #header>
        <div class="flex items-center justify-between gap-3">
          <div>
            <h3 class="text-sm font-semibold text-highlighted">
              {{ live ? '供应商应付明细' : '退货贷项与退款' }}
            </h3><p class="mt-0.5 text-xs text-muted">
              {{ live ? '按业务日期、供应商和服务端消费水位核对；退货贷项按后续阶段接入。' : '已确认退货对应供应商贷项，可追溯原收货行与原账单。' }}
            </p>
          </div>
          <UBadge
            :label="live ? '服务端明细' : workspaceCredits.length + ' 笔'"
            color="neutral"
            variant="subtle"
            size="sm"
          />
        </div>
      </template>
      <div v-if="live" class="space-y-3 p-4">
        <UFormField label="供应商">
          <USelect
            :model-value="live.report.partnerId"
            :items="partnerOptions"
            placeholder="选择供应商或打开账单"
            class="w-full"
            data-testid="payables-ledger-partner"
            @update:model-value="value => live?.updateReport('partnerId', String(value))"
          />
        </UFormField>
        <p v-if="!live.report.partnerId" class="text-xs text-muted">
          请选择供应商后查询应付明细。
        </p>
        <UAlert v-else-if="!liveLedger" color="warning" :title="live.reports.data?.ledger && live.reports.data.ledger.state !== 'ready' ? live.reports.data.ledger.message : live.reports.problem || '明细读取中'" />
        <template v-if="liveLedger">
          <p class="text-xs text-muted">
            {{ liveLedger.from }} 至 {{ liveLedger.through }} · 水位 {{ liveLedger.watermark }}
          </p><div class="flex justify-between text-sm font-medium">
            <span>供应商应付未结</span><span class="tabular-nums" data-testid="payables-partner-closing">{{ money(liveLedger.open.closing) }}</span>
          </div>
          <div class="overflow-x-auto">
            <table class="w-full text-xs" data-testid="payables-partner-lines">
              <thead>
                <tr>
                  <th class="text-left">
                    单据 / 日期
                  </th><th class="text-right">
                    未结变动
                  </th><th class="text-right">
                    未结余额
                  </th><th class="text-right">
                    资金发生
                  </th>
                </tr>
              </thead><tbody>
                <tr v-for="line in liveLedger.items" :key="line.id" class="border-t border-default">
                  <td class="py-2">
                    {{ line.number }} · {{ line.on }}<p class="text-muted">
                      凭证 {{ line.journalId }}
                    </p>
                  </td><td class="text-right tabular-nums">
                    {{ money(line.openDelta) }}
                  </td><td class="text-right tabular-nums">
                    {{ money(line.openBalance) }}
                  </td><td class="text-right tabular-nums">
                    {{ money(line.fundsDelta) }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div class="flex justify-end gap-2">
            <UButton
              label="上一页应付明细"
              variant="outline"
              :disabled="live.report.page <= 1"
              @click="live.changeReportPage('page', -1)"
            /><UButton
              label="下一页应付明细"
              variant="outline"
              :disabled="!liveLedger.hasMore"
              @click="live.changeReportPage('page', 1)"
            />
          </div>
        </template>
      </div>
      <div v-else class="divide-y divide-default">
        <div v-for="credit in workspaceCredits" :key="credit.id" class="flex items-start justify-between gap-3 px-4 py-3">
          <div class="min-w-0">
            <p class="text-sm font-medium text-highlighted">
              {{ credit.id }} · {{ creditBill(credit.billId)?.supplier ?? '—' }}
            </p>
            <p class="mt-0.5 truncate text-xs text-muted">
              {{ credit.reason }}
            </p>
            <p class="mt-1 text-xs text-muted">
              退货 {{ credit.quantity }} 件 · 退款 {{ formatMoney(creditRefundTotal(credit.id)) }} · {{ credit.status === 'refunded' ? '已退款' : '待退款' }}
            </p>
          </div>
          <div class="flex shrink-0 flex-col items-end gap-1">
            <span class="tabular-nums text-sm font-medium">{{ formatMoney(credit.total) }}</span>
            <UButton
              label="查看贷项"
              color="neutral"
              variant="ghost"
              size="xs"
              :data-testid="'credit-open-' + credit.id"
              @click="emit('open-credit', credit.id)"
            />
          </div>
        </div>
        <UEmpty
          v-if="!workspaceCredits.length"
          variant="naked"
          icon="i-carbon-return"
          title="暂无供应商贷项"
          description="已确认退货样例会显示在这里。"
          class="py-8"
        />
      </div>
    </UCard>
  </div>
</template>

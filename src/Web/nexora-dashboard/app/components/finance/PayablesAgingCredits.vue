<script setup lang="ts">
const emit = defineEmits<{
  'open-bill': [billId: string]
  'open-credit': [creditId: string]
}>()

const store = useSupplierTradeStore()
const { activeWorkspaceId } = useMockWorkspace()
const workspaceBills = computed(() => store.bills.filter(bill => bill.workspaceId === activeWorkspaceId.value))
const workspaceCredits = computed(() => store.credits.filter(credit => credit.workspaceId === activeWorkspaceId.value))

const agingBucketNames = ['未到期', '1-30 天', '31-60 天', '60 天以上']
const agingRows = computed(() => {
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
const agingTotal = computed(() => agingRows.value.reduce((sum, row) => sum + row.amount, 0))
const openBills = computed(() => workspaceBills.value.filter(bill => bill.status === 'posted' && store.outstandingOf(bill) > 0.005))

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
        <div
          v-for="row in agingRows"
          :key="row.bucket"
          class="flex items-center justify-between border-b border-default py-2 text-sm last:border-b-0"
          data-testid="payables-aging-row"
        >
          <span class="text-muted">{{ row.bucket }}</span><span class="tabular-nums text-highlighted">{{ formatMoney(row.amount) }}</span>
        </div>
        <div class="mt-2 flex items-center justify-between rounded-sm bg-elevated/40 px-3 py-2 text-sm font-medium">
          <span>应付未结合计</span><span class="tabular-nums text-highlighted" data-testid="payables-aging-total">{{ formatMoney(agingTotal) }}</span>
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
            <span class="text-highlighted">{{ bill.id }} · {{ bill.supplier }}</span><span class="tabular-nums">{{ formatMoney(store.outstandingOf(bill)) }}</span>
          </button>
        </div>
      </div>
    </UCard>

    <UCard class="rounded-sm" :ui="{ body: 'p-0 sm:p-0' }" data-testid="payables-credits">
      <template #header>
        <div class="flex items-center justify-between gap-3">
          <div>
            <h3 class="text-sm font-semibold text-highlighted">
              退货贷项与退款
            </h3><p class="mt-0.5 text-xs text-muted">
              已确认退货对应供应商贷项，可追溯原收货行与原账单。
            </p>
          </div>
          <UBadge
            :label="workspaceCredits.length + ' 笔'"
            color="neutral"
            variant="subtle"
            size="sm"
          />
        </div>
      </template>
      <div class="divide-y divide-default">
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

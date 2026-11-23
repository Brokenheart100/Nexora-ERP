<script setup lang="ts">
import type { SupplierBill } from '~/mocks'

const props = defineProps<{ orderId: string, connected?: boolean, connectedWorkspaceId?: string }>()
const store = useSupplierTradeStore()
const { activeWorkspaceId } = useMockWorkspace()

const workspaceId = computed(() => activeWorkspaceId.value)
const orderBills = computed(() =>
  store.bills.filter(bill => bill.orderId === props.orderId && bill.workspaceId === workspaceId.value)
)
const orderReceiptLines = computed(() =>
  store.receiptLines.filter(line => line.orderId === props.orderId && line.workspaceId === workspaceId.value)
)
const outstanding = computed(() =>
  orderBills.value.filter(bill => bill.status === 'posted').reduce((sum, bill) => sum + store.outstandingOf(bill), 0)
)
const pendingCount = computed(() => orderBills.value.filter(bill => bill.status === 'pending').length)
const accrualTotal = computed(() => orderReceiptLines.value.reduce((sum, line) => sum + line.accrualAmount, 0))
const matchedTotal = computed(() => orderReceiptLines.value.reduce((sum, line) => sum + line.matchedQuantity, 0))
const receivedTotal = computed(() => orderReceiptLines.value.reduce((sum, line) => sum + line.quantity, 0))

function openFinance(bill?: SupplierBill) {
  const query: Record<string, string> = { tab: 'payables' }
  if (props.connected) {
    query.workspace = props.connectedWorkspaceId ?? ''
    query.order = props.orderId
  }
  if (bill) query.bill = bill.id
  return navigateTo({ path: '/finance', query })
}
</script>

<template>
  <UCard class="rounded-sm" :ui="{ body: 'p-0 sm:p-0', header: 'p-3 sm:p-3' }" data-testid="order-payables">
    <template #header>
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p class="text-sm font-medium text-highlighted">
            应付与供应商账单
          </p>
          <p class="mt-0.5 text-xs text-muted">
            {{ connected ? '在财务中按当前采购单查询实收、暂估和账单；读取权限由财务服务核对。' : '收货暂估、账单匹配与付款核销均来自本地采购到付款样例。' }}
          </p>
        </div>
        <UBadge
          v-if="!connected"
          :label="orderBills.length + ' 张账单'"
          color="neutral"
          variant="subtle"
          size="sm"
        />
      </div>
    </template>

    <div class="space-y-3 p-3">
      <div v-if="!connected" class="grid gap-2 sm:grid-cols-3">
        <div class="rounded-sm border border-default p-2.5">
          <p class="text-xs text-muted">
            应付未结
          </p>
          <p class="mt-1 text-lg font-semibold tabular-nums" :class="outstanding > 0 ? 'text-warning' : 'text-highlighted'" data-testid="order-payables-outstanding">
            {{ formatMoney(outstanding) }}
          </p>
        </div>
        <div class="rounded-sm border border-default p-2.5">
          <p class="text-xs text-muted">
            待复核账单
          </p>
          <p class="mt-1 text-lg font-semibold tabular-nums text-highlighted" data-testid="order-payables-pending">
            {{ pendingCount }} 张
          </p>
        </div>
        <div class="rounded-sm border border-default p-2.5">
          <p class="text-xs text-muted">
            收货暂估
          </p>
          <p class="mt-1 text-lg font-semibold tabular-nums text-highlighted">
            {{ formatMoney(accrualTotal) }}
          </p>
          <p class="mt-0.5 text-[11px] text-muted">
            已匹配 {{ matchedTotal }} / 收货 {{ receivedTotal }}
          </p>
        </div>
      </div>

      <div v-if="!connected && orderBills.length" class="overflow-hidden rounded-sm border border-default">
        <div class="grid grid-cols-[minmax(0,1fr)_7rem_7rem_5rem] items-center gap-2 border-b border-default bg-elevated/40 px-3 py-2 text-xs font-medium text-muted">
          <span>账单</span><span class="text-right">价税合计</span><span class="text-right">未结</span><span class="text-right">操作</span>
        </div>
        <div v-for="bill in orderBills" :key="bill.id" class="grid grid-cols-[minmax(0,1fr)_7rem_7rem_5rem] items-center gap-2 border-b border-default/60 px-3 py-2 last:border-b-0">
          <div class="min-w-0">
            <p class="truncate text-[13px] font-medium text-highlighted">
              {{ bill.id }}
            </p>
            <p class="truncate text-[11px] text-muted">
              {{ bill.date }} · {{ store.billStatus(bill).label }}
            </p>
          </div>
          <span class="text-right text-xs tabular-nums">{{ formatMoney(bill.total) }}</span>
          <span class="text-right text-xs tabular-nums" :class="store.outstandingOf(bill) > 0 ? 'text-warning' : 'text-muted'">{{ formatMoney(store.outstandingOf(bill)) }}</span>
          <div class="flex justify-end">
            <UButton
              label="处理"
              size="xs"
              color="neutral"
              variant="ghost"
              :data-testid="'order-payable-' + bill.id"
              @click="openFinance(bill)"
            />
          </div>
        </div>
      </div>

      <UEmpty
        v-else-if="!connected"
        variant="naked"
        icon="i-carbon-receipt"
        title="该采购单尚无供应商账单"
        description="收货完成后，可到财务的采购应付页签匹配收货行并录入账单。"
        class="py-4"
      />

      <div class="flex flex-wrap items-center justify-between gap-2">
        <p class="text-xs text-muted">
          应付账龄、付款与退货贷项在财务模块统一处理。
        </p>
        <UButton
          label="在财务中处理"
          icon="i-carbon-arrow-right"
          color="primary"
          variant="outline"
          size="sm"
          data-testid="order-payables-open"
          @click="openFinance()"
        />
      </div>
    </div>
  </UCard>
</template>

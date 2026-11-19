<script setup lang="ts">
defineProps<{
  outstandingTotal: number
  pendingCount: number
  availableCount: number
  paymentCount: number
}>()
</script>

<template>
  <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
    <UCard class="rounded-sm" :ui="{ body: 'p-4' }">
      <p class="text-xs text-muted">
        采购应付未结
      </p>
      <p class="mt-1 text-2xl font-semibold tabular-nums text-highlighted" data-testid="payables-outstanding-total">
        {{ formatMoney(outstandingTotal) }}
      </p>
      <p class="mt-1 text-xs text-muted">
        已过账账单 · 未扣减待复核
      </p>
    </UCard>
    <UCard class="rounded-sm" :ui="{ body: 'p-4' }">
      <p class="text-xs text-muted">
        待复核账单
      </p>
      <p class="mt-1 text-2xl font-semibold tabular-nums text-highlighted" data-testid="payables-pending-count">
        {{ pendingCount }} 张
      </p>
      <p class="mt-1 text-xs text-muted">
        价差账单需先核对再复核
      </p>
    </UCard>
    <UCard class="rounded-sm" :ui="{ body: 'p-4' }">
      <p class="text-xs text-muted">
        可匹配收货行
      </p>
      <p class="mt-1 text-2xl font-semibold tabular-nums text-highlighted" data-testid="payables-available-count">
        {{ availableCount }} 行
      </p>
      <p class="mt-1 text-xs text-muted">
        已收货、已暂估且未匹配
      </p>
    </UCard>
    <UCard class="rounded-sm" :ui="{ body: 'p-4' }">
      <p class="text-xs text-muted">
        已登记付款
      </p>
      <p class="mt-1 text-2xl font-semibold tabular-nums text-highlighted" data-testid="payables-payment-count">
        {{ paymentCount }} 笔
      </p>
      <p class="mt-1 text-xs text-muted">
        资金账户来自银行对账样例
      </p>
    </UCard>
  </div>
</template>

<script setup lang="ts">
import type { PurchaseReceipt } from '~/mocks'

defineProps<{ receipts: PurchaseReceipt[] }>()

function receiptQuantity(receipt: PurchaseReceipt) {
  return receipt.lines.reduce((sum, line) => sum + line.quantity, 0)
}
</script>

<template>
  <div data-testid="order-receipts-list">
    <div v-if="receipts.length" class="space-y-2">
      <div
        v-for="receipt in receipts"
        :key="receipt.id"
        class="rounded-sm border border-default p-2.5"
        data-testid="order-receipt-item"
      >
        <div class="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
          <span class="font-mono text-[11px] text-muted">{{ receipt.id }}</span>
          <UBadge
            color="success"
            variant="subtle"
            size="sm"
            :label="receipt.receivedAt"
          />
          <span class="text-muted">收货人 {{ receipt.receiver }}</span>
          <span class="ml-auto tabular-nums text-muted">
            {{ receipt.lines.length }} 行 / {{ receiptQuantity(receipt) }} 件
          </span>
        </div>
        <ul class="mt-1.5 space-y-0.5">
          <li
            v-for="line in receipt.lines"
            :key="receipt.id + '-' + line.lineNo"
            class="flex items-center justify-between gap-3 text-[11.5px] text-muted"
          >
            <span class="truncate">
              <span class="tabular-nums">{{ line.lineNo }}.</span>
              {{ line.name }}
            </span>
            <span class="shrink-0 tabular-nums text-default">× {{ line.quantity }}</span>
          </li>
        </ul>
      </div>
    </div>
    <p v-else class="text-xs text-muted" data-testid="order-receipts-empty">
      暂无收货记录，审批通过后可发起收货。
    </p>
  </div>
</template>

<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { SupplierReceiptLineMatch } from '~/stores/supplierTrade'

const store = useSupplierTradeStore()
const { activeWorkspaceId } = useMockWorkspace()
const workspaceReceiptLines = computed(() => store.receiptLines.filter(line => line.workspaceId === activeWorkspaceId.value))

const receiptColumns: TableColumn<SupplierReceiptLineMatch>[] = [
  { accessorKey: 'receiptId', header: '收货单 / 采购单', id: 'receipt' },
  { accessorKey: 'orderSupplier', header: '供应商', id: 'supplier' },
  { accessorKey: 'name', header: '商品', id: 'product' },
  { accessorKey: 'quantity', header: '收货数量', id: 'quantity', meta: { style: { th: { minWidth: '6.5rem' } } } },
  { accessorKey: 'unitPrice', header: '暂估单价', id: 'unitPrice' },
  { accessorKey: 'accrualAmount', header: '暂估金额', id: 'accrual' },
  { id: 'matched', header: '已匹配 / 可匹配' },
  { id: 'variance', header: '价差' }
]
</script>

<template>
  <UCard class="rounded-sm" :ui="{ body: 'p-0 sm:p-0' }">
    <template #header>
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 class="text-sm font-semibold text-highlighted">
            收货计价、暂估与匹配
          </h3>
          <p class="mt-0.5 text-xs text-muted">
            分批收货按行展示已匹配与可匹配数量；价差来自供应商账单单价与采购单价。
          </p>
        </div>
        <UBadge
          label="暂估应付 · 已计价"
          color="neutral"
          variant="subtle"
          size="sm"
        />
      </div>
    </template>
    <ResizableTable :data="workspaceReceiptLines" :columns="receiptColumns" data-testid="payables-receipts">
      <template #receipt-cell="{ row }">
        <div class="text-xs">
          <p class="font-medium text-highlighted">
            {{ row.original.receiptId }}
          </p><p class="text-muted">
            {{ row.original.orderId }} · {{ row.original.receivedAt }}
          </p>
        </div>
      </template>
      <template #product-cell="{ row }">
        <div class="text-xs">
          <p class="max-w-56 truncate font-medium text-highlighted">
            {{ row.original.name }}
          </p><p class="text-muted">
            {{ row.original.sku }} · {{ row.original.spec }}
          </p>
        </div>
      </template>
      <template #unitPrice-cell="{ row }">
        <span class="tabular-nums">{{ formatMoney(row.original.unitPrice) }}</span>
      </template>
      <template #accrual-cell="{ row }">
        <span class="tabular-nums">{{ formatMoney(row.original.accrualAmount) }}</span>
      </template>
      <template #matched-cell="{ row }">
        <div class="flex items-center gap-2 text-xs">
          <span class="tabular-nums">{{ row.original.matchedQuantity }} / {{ row.original.availableQuantity }}</span>
          <UBadge
            :label="row.original.status === 'matched' ? '已匹配' : row.original.status === 'partial' ? '部分匹配' : '待匹配'"
            :color="row.original.status === 'matched' ? 'success' : row.original.status === 'partial' ? 'warning' : 'neutral'"
            variant="subtle"
            size="sm"
          />
        </div>
      </template>
      <template #variance-cell="{ row }">
        <div v-if="Math.abs(row.original.variance) > 0.005" class="flex items-center gap-2">
          <span class="tabular-nums text-warning">+{{ formatMoney(row.original.variance) }}</span>
          <UBadge
            v-if="row.original.variancePending"
            label="待审核"
            color="warning"
            variant="subtle"
            size="sm"
          />
        </div>
        <span v-else class="text-xs text-muted">无价差</span>
      </template>
    </ResizableTable>
  </UCard>
</template>

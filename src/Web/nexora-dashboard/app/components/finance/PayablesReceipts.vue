<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { usePayablesConnection } from '~/composables/finance/usePayablesConnection'
import { displayDecimal } from '~/utils/api/decimal-display'
import type { SupplierReceiptLineMatch } from '~/stores/supplierTrade'

const props = defineProps<{ live?: ReturnType<typeof usePayablesConnection> }>()
type ReceiptRow = SupplierReceiptLineMatch | ReturnType<typeof usePayablesConnection>['receiptRows'][number]
const money = (value: string | number) =>
  typeof value === 'string' ? displayDecimal(value, props.live?.query.data?.home.minorUnits ?? 2) : formatMoney(value)
const store = useSupplierTradeStore()
const { activeWorkspaceId } = useMockWorkspace()
const workspaceReceiptLines = computed(() =>
  props.live ? props.live.receiptRows : store.receiptLines.filter(line => line.workspaceId === activeWorkspaceId.value)
)

const mockColumns: TableColumn<ReceiptRow>[] = [
  { accessorKey: 'receiptId', header: '收货单 / 采购单', id: 'receipt' },
  { accessorKey: 'orderSupplier', header: '供应商', id: 'supplier' },
  { accessorKey: 'name', header: '商品', id: 'product' },
  { accessorKey: 'quantity', header: '收货数量', id: 'quantity', meta: { style: { th: { minWidth: '6.5rem' } } } },
  { accessorKey: 'unitPrice', header: '暂估单价', id: 'unitPrice' },
  { accessorKey: 'accrualAmount', header: '暂估金额', id: 'accrual' },
  { id: 'matched', header: '已匹配 / 可匹配' },
  { id: 'variance', header: '价差' }
]
const receiptColumns = computed<TableColumn<ReceiptRow>[]>(() =>
  props.live ? [...mockColumns.filter(value => value.id !== 'variance'), { id: 'accrualState', header: '暂估状态' }] : mockColumns
)
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
          :label="live ? '实收与暂估分别确认' : '暂估应付 · 已计价'"
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
        <span class="tabular-nums">{{ money(row.original.unitPrice) }}</span>
      </template>
      <template #accrual-cell="{ row }">
        <span class="tabular-nums">{{ money(row.original.accrualAmount) }}</span>
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
      <template #accrualState-cell="{ row }">
        <div v-if="live" class="space-y-1">
          <UBadge :label="live.receiptRows.find(value => value.id === row.original.id)?.posted ? '已暂估' : '等待暂估'" :color="live.receiptRows.find(value => value.id === row.original.id)?.posted ? 'success' : 'warning'" /><p class="text-xs text-muted">
            {{ live.receiptRows.find(value => value.id === row.original.id)?.pendingReason }}
          </p><UButton
            v-if="!live.receiptRows.find(value => value.id === row.original.id)?.posted"
            label="重试暂估"
            variant="outline"
            :disabled="!live.canApprove || live.locked"
            :data-testid="'accrue-' + row.original.id"
            @click="live.accrue(row.original.id)"
          />
        </div>
      </template>
      <template #variance-cell="{ row }">
        <div v-if="!live && Math.abs(Number(row.original.variance)) > 0.005" class="flex items-center gap-2">
          <span class="tabular-nums text-warning">+{{ money(row.original.variance) }}</span>
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
    <div v-if="live" class="flex justify-end gap-2 p-3">
      <UButton
        label="上一页实收"
        variant="outline"
        :disabled="live.receiptsPage <= 1"
        @click="live.changePage('receipts', -1)"
      /><span class="self-center text-xs text-muted">第 {{ live.receiptsPage }} 页</span><UButton
        label="下一页实收"
        variant="outline"
        :disabled="(live.query.data?.receipts.length ?? 0) < 50"
        @click="live.changePage('receipts', 1)"
      />
    </div>
  </UCard>
</template>

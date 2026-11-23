<script setup lang="ts">
import {
  movementTypeColors,
  movementTypeLabels,
  stockReturnStatusColors,
  stockReturnStatusLabels,
  warehouses
} from '~/mocks'
import type { WarehouseReturnsConnection } from '~/composables/inventory/useWarehouseReturns'

const props = defineProps<{ returnId: string | null, live?: WarehouseReturnsConnection }>()
const open = defineModel<boolean>('open', { default: false })
const stockFlow = useStockFlowStore()
const inventory = useInventoryStore()
const current = computed(() => props.live?.list.find(row => row.id === props.returnId))
const source = computed(() => current.value ? props.live?.sourceOrder(current.value.originalId) : undefined)
const workspaceId = computed(() => props.live?.query.session.activeWorkspaceId)

const stockReturn = computed(() => props.returnId
  ? stockFlow.returns.find(row => row.id === props.returnId) ?? null
  : null)
const execution = computed(() => stockReturn.value
  ? stockFlow.executions.find(row => row.id === stockReturn.value!.executionId) ?? null
  : null)
const permit = computed(() => execution.value
  ? stockFlow.permits.find(row => row.id === execution.value!.permitId) ?? null
  : null)
const warehouse = computed(() => stockReturn.value
  ? warehouses.find(row => row.id === stockReturn.value!.warehouseId) ?? null
  : null)
const movements = computed(() => props.returnId ? inventory.movementsForReturn(props.returnId) : [])
const totalQuantity = computed(() => stockReturn.value?.lines.reduce((sum, line) => sum + line.quantity, 0) ?? 0)
const invoicedTotal = computed(() => stockReturn.value?.lines.reduce((sum, line) => sum + (line.invoicedQuantity ?? 0), 0) ?? 0)
const uninvoicedTotal = computed(() => stockReturn.value?.lines.reduce((sum, line) => sum + (line.uninvoicedQuantity ?? 0), 0) ?? 0)
const orderLink = computed(() => stockReturn.value?.direction === 'sales'
  ? '/sales?tab=orders&order=' + stockReturn.value.orderId
  : '/purchase-orders?order=' + (stockReturn.value?.orderId ?? ''))
const creditLink = computed(() => stockReturn.value?.direction === 'sales' ? '/sales?tab=receivables' : '/finance?tab=payables')

function unitOf(sku: string) {
  return inventory.positions.find(position => position.sku === sku)?.unit ?? '件'
}

function movementQuantity(movement: { type: string, quantity: number }) {
  const sign = movement.type === 'outbound' ? '-' : movement.type === 'inbound' ? '+' : '±'
  return sign + movement.quantity
}
</script>

<template>
  <USlideover v-model:open="open" title="退货详情" :ui="{ content: 'w-full sm:max-w-3xl' }">
    <template #description>
      <span class="text-sm text-muted">
        {{ current ? current.id + ' · ' + (current.direction === 'purchase' ? '采购退货' : '销售退货') : stockReturn ? stockReturn.id + ' · ' + (stockReturn.direction === 'purchase' ? '采购退货' : '销售退货') : '查看退货明细、库存流水与原收发货记录' }}
      </span>
    </template>

    <template #body>
      <div v-if="live" class="space-y-4" data-testid="stock-return-detail">
        <SalesOperationStatus :message="live.error" :submission="live.submission" @check="live.check()" @retry="live.retry()" />
        <div v-if="current" class="space-y-2 text-sm">
          <UBadge :color="current.movementId ? 'success' : current.cancelled ? 'neutral' : 'warning'" variant="subtle"
            :label="current.cancelled ? '已取消' : current.movementId ? '仓库已确认' : '待仓库确认'" data-testid="stock-return-detail-status" />
          <p>{{ current.on }} · 退货 {{ current.quantity }} 件</p>
          <p>{{ current.reason }}</p>
          <p class="break-all text-muted">原流水 {{ current.originalId }}</p>
          <p v-if="current.movementId" class="break-all text-muted">退货流水 {{ current.movementId }}</p>
          <div class="flex flex-wrap gap-2">
            <UButton v-if="source" label="打开原订单" variant="outline" size="xs" :to="{ path: current.direction === 'sale' ? '/sales' : '/purchase-orders', query: { workspace: workspaceId, order: source.sourceNo } }" />
            <UButton v-if="current.movementId" label="查看财务来源" variant="outline" size="xs" :to="{ path: current.direction === 'sale' ? '/sales' : '/finance', query: { workspace: workspaceId, tab: current.direction === 'sale' ? 'receivables' : 'payables', stockReturn: current.movementId } }" />
          </div>
        </div>
        <p v-else class="text-sm text-muted">{{ live.query.loading ? '正在读取退货单。' : live.listError || '当前仓库列表中没有这张退货单。' }}</p>
      </div>
      <div v-else-if="stockReturn" class="space-y-4" data-testid="stock-return-detail">
        <UAlert
          color="neutral"
          variant="soft"
          icon="i-carbon-document"
          :description="(permit?.sourceNo ?? stockReturn.orderId) + ' · ' + stockReturn.partner + ' · ' + (warehouse?.name ?? stockReturn.warehouseId)"
          data-testid="stock-return-detail-source"
        />

        <div class="grid gap-2 sm:grid-cols-2">
          <div class="rounded-sm border border-default p-3 text-xs">
            <p class="text-muted">
              状态
            </p>
            <div class="mt-1 flex items-center gap-2">
              <UBadge
                :color="stockReturnStatusColors[stockReturn.status]"
                variant="subtle"
                size="sm"
                :label="stockReturnStatusLabels[stockReturn.status]"
                data-testid="stock-return-detail-status"
              />
              <span class="text-muted">合计 {{ totalQuantity }} 件</span>
            </div>
          </div>
          <div class="rounded-sm border border-default p-3 text-xs">
            <p class="text-muted">
              退货原因
            </p>
            <p class="mt-1 text-default">
              {{ stockReturn.reason }}
            </p>
          </div>
          <div class="rounded-sm border border-default p-3 text-xs">
            <p class="text-muted">
              创建 / 确认
            </p>
            <p class="mt-1 text-default">
              {{ stockReturn.createdAt }}
              <span v-if="stockReturn.confirmedAt" class="text-muted"> → {{ stockReturn.confirmedAt }}</span>
            </p>
          </div>
          <div class="rounded-sm border border-default p-3 text-xs">
            <p class="text-muted">
              开票拆分
            </p>
            <p class="mt-1 text-default" data-testid="stock-return-detail-split">
              已开票 {{ invoicedTotal }} 件 · 未开票 {{ uninvoicedTotal }} 件
            </p>
          </div>
        </div>

        <div class="space-y-2" data-testid="stock-return-detail-lines">
          <p class="text-xs font-medium text-highlighted">
            退货明细
          </p>
          <div
            v-for="line in stockReturn.lines"
            :key="line.lineNo"
            class="rounded-sm border border-default p-3"
            :data-testid="'stock-return-detail-line-' + line.lineNo"
          >
            <div class="flex flex-wrap items-start justify-between gap-2">
              <div class="min-w-0">
                <p class="text-sm text-default">
                  {{ line.name }}
                </p>
                <p class="mt-0.5 font-mono text-[11px] text-muted">
                  {{ line.sku }} · 第 {{ line.lineNo }} 行 · 单价 ¥{{ Number(line.unitPrice).toFixed(2) }}
                </p>
              </div>
              <p class="text-sm tabular-nums text-default">
                {{ line.quantity }} {{ unitOf(line.sku) }}
              </p>
            </div>
            <div class="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
              <UBadge
                v-if="line.invoicedQuantity !== undefined"
                color="primary"
                variant="subtle"
                size="sm"
                :label="'已开票 ' + line.invoicedQuantity"
              />
              <UBadge
                v-if="line.uninvoicedQuantity !== undefined"
                color="neutral"
                variant="subtle"
                size="sm"
                :label="'未开票 ' + line.uninvoicedQuantity"
              />
            </div>
          </div>
        </div>

        <div class="space-y-2" data-testid="stock-return-detail-movements">
          <p class="text-xs font-medium text-highlighted">
            库存流水
          </p>
          <p v-if="!movements.length" class="text-[11px] text-muted">
            确认退货后在此生成流水，数量与库存位置保持一致。
          </p>
          <div
            v-for="movement in movements"
            :key="movement.id"
            class="flex flex-wrap items-center justify-between gap-2 rounded-sm border border-default p-2 text-[11px]"
            :data-testid="'stock-return-movement-' + movement.id"
          >
            <div class="flex flex-wrap items-center gap-2">
              <UBadge
                :color="movementTypeColors[movement.type]"
                variant="subtle"
                size="sm"
                :label="movementTypeLabels[movement.type]"
              />
              <span class="font-mono text-muted">{{ movement.id }}</span>
              <span class="text-muted">{{ movement.at }}</span>
            </div>
            <div class="flex flex-wrap items-center gap-3">
              <span class="tabular-nums text-default">{{ movementQuantity(movement) }} 件</span>
              <span class="text-muted">结存 {{ movement.balanceAfter ?? '—' }}</span>
            </div>
          </div>
        </div>

        <div class="space-y-2" data-testid="stock-return-detail-execution">
          <p class="text-xs font-medium text-highlighted">
            原{{ stockReturn.sourceType === 'fulfillment' ? '发货' : '收货' }}记录
          </p>
          <div v-if="execution" class="rounded-sm border border-default p-3 text-[11px]">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <span class="font-mono text-default">{{ execution.id }}</span>
              <span class="text-muted">{{ execution.at }} · {{ execution.operator }}</span>
            </div>
            <p class="mt-1 text-muted">
              {{ execution.sourceId }} · {{ warehouse?.name ?? execution.warehouseId }}
            </p>
            <p class="mt-1 text-muted">
              {{ execution.lines.map(line => line.name + ' × ' + line.quantity).join('；') }}
            </p>
          </div>
          <p v-else class="text-[11px] text-muted">
            未找到原收发货记录。
          </p>
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <UButton
            :to="orderLink"
            :label="stockReturn.direction === 'sales' ? '打开原销售订单' : '打开原采购订单'"
            color="neutral"
            variant="outline"
            size="xs"
            data-testid="stock-return-detail-order"
          />
          <UButton
            v-if="stockReturn.creditId"
            :to="creditLink"
            :label="'打开贷项 ' + stockReturn.creditId"
            color="primary"
            variant="ghost"
            size="xs"
            data-testid="stock-return-detail-credit"
          />
          <span v-else class="text-[11px] text-muted">
            本单没有已开票数量，不生成贷项。
          </span>
        </div>
      </div>
      <p v-else class="text-sm text-muted">
        未找到退货单。
      </p>
    </template>

    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton
          label="关闭"
          color="neutral"
          variant="ghost"
          data-testid="stock-return-detail-close"
          @click="open = false"
        />
        <template v-if="live && current && !current.movementId && !current.cancelled">
          <UButton v-if="live.canAuthorize(current.direction)" label="取消待确认退货" variant="outline" color="error" :disabled="live.frozen" data-testid="stock-return-cancel-pending" @click="live.decide(current, false)" />
          <UButton label="确认退货" :disabled="live.frozen || !current.canConfirm" data-testid="stock-return-confirm" @click="live.decide(current, true)" />
        </template>
      </div>
    </template>
  </USlideover>
</template>

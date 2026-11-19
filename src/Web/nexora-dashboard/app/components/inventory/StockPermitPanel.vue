<script setup lang="ts">
import StockReturnDetailSlideover from '~/components/inventory/StockReturnDetailSlideover.vue'
import StockReturnSlideover from '~/components/inventory/StockReturnSlideover.vue'
import {
  stockPermitStatusColors,
  stockPermitStatusLabels,
  stockReturnStatusColors,
  stockReturnStatusLabels
} from '~/mocks'

const props = withDefaults(defineProps<{
  sourceType: 'purchase' | 'sales'
  sourceId: string
  canManage?: boolean
}>(), { canManage: true })

const stockFlow = useStockFlowStore()
const toast = useToast()

const permits = computed(() => stockFlow.permitsFor(props.sourceType, props.sourceId))
const returnOpen = ref(false)
const returnExecutionId = ref<string | null>(null)
const detailOpen = ref(false)
const detailReturnId = ref<string | null>(null)

function cancelPermit(id: string) {
  const result = stockFlow.cancelPermit(id)
  toast.add({ title: result.ok ? '许可已取消' : '操作未完成', description: result.message, color: result.ok ? 'success' : 'error' })
}

function closePermit(id: string) {
  const result = stockFlow.closePermit(id)
  toast.add({ title: result.ok ? '已关闭剩余额度' : '操作未完成', description: result.message, color: result.ok ? 'success' : 'error' })
}

function openReturn(executionId: string) {
  returnExecutionId.value = executionId
  returnOpen.value = true
}

function openDetail(returnId: string) {
  detailReturnId.value = returnId
  detailOpen.value = true
}

function confirmReturn(id: string) {
  const result = stockFlow.confirmReturn(id)
  toast.add({ title: result.ok ? '退货已确认' : '操作未完成', description: result.message, color: result.ok ? 'success' : 'error' })
}

function cancelReturn(id: string) {
  const result = stockFlow.cancelReturn(id)
  toast.add({ title: result.ok ? '退货已取消' : '操作未完成', description: result.message, color: result.ok ? 'success' : 'error' })
}

function creditLink(direction: 'purchase' | 'sales') {
  return direction === 'sales' ? '/sales?tab=receivables' : '/finance?tab=payables'
}
</script>

<template>
  <UCard class="rounded-sm" :ui="{ body: 'p-3 sm:p-3', header: 'p-3 sm:p-3' }">
    <template #header>
      <div class="flex flex-wrap items-center justify-between gap-2">
        <p class="text-sm font-medium text-highlighted">
          收发货许可与退货
        </p>
        <span class="text-xs text-muted">共 {{ permits.length }} 张许可</span>
      </div>
    </template>
    <div class="space-y-3" data-testid="stock-permits">
      <p v-if="!permits.length" class="text-xs text-muted" data-testid="stock-permits-empty">
        当前单据尚未签发收发货许可。
      </p>
      <div
        v-for="permit in permits"
        :key="permit.id"
        class="rounded-sm border border-default p-3"
        :data-testid="'stock-permit-' + permit.id"
      >
        <div class="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p class="font-mono text-xs text-default">
              {{ permit.id }}
            </p>
            <p class="mt-0.5 text-[11px] text-muted">
              {{ permit.direction === 'inbound' ? '入库许可' : '出库许可' }} · {{ permit.sourceNo }} · {{ permit.partner }}
            </p>
          </div>
          <UBadge
            :color="stockPermitStatusColors[permit.status]"
            variant="subtle"
            size="sm"
            :label="stockPermitStatusLabels[permit.status]"
            :data-testid="'stock-permit-status-' + permit.id"
          />
        </div>

        <div class="mt-2 space-y-1.5">
          <div
            v-for="line in permit.lines"
            :key="line.lineNo"
            class="flex flex-wrap items-center justify-between gap-2 text-[11px]"
          >
            <span class="min-w-0 truncate text-muted">{{ line.name }} · {{ line.sku }}</span>
            <span class="tabular-nums text-default">{{ line.executed }} / {{ line.permitted }}</span>
          </div>
        </div>

        <div class="mt-2 flex flex-wrap items-center justify-end gap-1.5">
          <UButton
            v-if="canManage && permit.status === 'pending'"
            label="取消许可"
            color="error"
            variant="ghost"
            size="xs"
            :data-testid="'stock-permit-cancel-' + permit.id"
            @click="cancelPermit(permit.id)"
          />
          <UButton
            v-if="canManage && (permit.status === 'pending' || permit.status === 'partial')"
            label="关闭剩余额度"
            color="neutral"
            variant="outline"
            size="xs"
            :data-testid="'stock-permit-close-' + permit.id"
            @click="closePermit(permit.id)"
          />
        </div>

        <div class="mt-3 border-t border-default pt-2">
          <p class="text-[11px] font-medium text-muted">
            执行记录
          </p>
          <div
            v-for="execution in stockFlow.executionsFor(permit.id)"
            :key="execution.id"
            class="mt-2 rounded-sm bg-elevated/60 p-2"
            :data-testid="'stock-permit-execution-' + execution.id"
          >
            <div class="flex flex-wrap items-center justify-between gap-2">
              <p class="text-[11px] text-default">
                {{ execution.at }} · {{ execution.operator }} · {{ execution.warehouseId }}
              </p>
              <span class="font-mono text-[10px] text-muted">{{ execution.sourceId }}</span>
            </div>
            <p class="mt-0.5 text-[10px] text-muted">
              {{ execution.lines.map(line => line.name + ' × ' + line.quantity).join('；') }}
            </p>
            <div class="mt-1.5 flex flex-wrap items-center gap-1.5">
              <UButton
                v-if="canManage"
                label="发起退货"
                icon="i-carbon-arrow-undo"
                color="neutral"
                variant="ghost"
                size="xs"
                :data-testid="'stock-permit-return-' + execution.id"
                @click="openReturn(execution.id)"
              />
            </div>
            <div
              v-for="stockReturn in stockFlow.returnsFor(execution.id)"
              :key="stockReturn.id"
              class="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-default pt-1.5"
              :data-testid="'stock-return-row-' + stockReturn.id"
            >
              <div class="flex flex-wrap items-center gap-2 text-[10px]">
                <span class="font-mono text-default">{{ stockReturn.id }}</span>
                <UBadge
                  :color="stockReturnStatusColors[stockReturn.status]"
                  variant="subtle"
                  size="sm"
                  :label="stockReturnStatusLabels[stockReturn.status]"
                />
                <span class="text-muted">{{ stockReturn.lines.reduce((sum, line) => sum + line.quantity, 0) }} 件</span>
              </div>
              <div class="flex flex-wrap items-center gap-1">
                <UButton
                  label="详情"
                  color="neutral"
                  variant="ghost"
                  size="xs"
                  :data-testid="'stock-return-detail-' + stockReturn.id"
                  @click="openDetail(stockReturn.id)"
                />
                <UButton
                  v-if="canManage && stockReturn.status === 'pending'"
                  label="确认"
                  color="primary"
                  variant="ghost"
                  size="xs"
                  :data-testid="'stock-return-confirm-' + stockReturn.id"
                  @click="confirmReturn(stockReturn.id)"
                />
                <UButton
                  v-if="canManage && stockReturn.status === 'pending'"
                  label="取消"
                  color="neutral"
                  variant="ghost"
                  size="xs"
                  :data-testid="'stock-return-cancel-' + stockReturn.id"
                  @click="cancelReturn(stockReturn.id)"
                />
                <UButton
                  v-if="stockReturn.creditId"
                  :to="creditLink(stockReturn.direction)"
                  :label="'打开贷项 ' + stockReturn.creditId"
                  color="primary"
                  variant="ghost"
                  size="xs"
                  :data-testid="'stock-return-credit-' + stockReturn.id"
                />
              </div>
            </div>
          </div>
          <p v-if="!stockFlow.executionsFor(permit.id).length" class="mt-1 text-[10px] text-muted">
            暂无执行记录，仓库确认收发货后在此显示。
          </p>
        </div>
      </div>
    </div>

    <StockReturnSlideover v-model:open="returnOpen" :execution-id="returnExecutionId" />
    <StockReturnDetailSlideover v-model:open="detailOpen" :return-id="detailReturnId" />
  </UCard>
</template>

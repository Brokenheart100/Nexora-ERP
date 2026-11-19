<script setup lang="ts">
import StockPermitPanel from '~/components/inventory/StockPermitPanel.vue'
import type { TableColumn } from '@nuxt/ui'
import type { SalesOrder, SalesOrderLine } from '~/mocks'
import { salesStatusColors, salesStatusLabels } from '~/mocks'

const props = defineProps<{
  order: SalesOrder | null
  canCreate: boolean
  canApprove: boolean
  canWithdraw?: boolean
  canCancel?: boolean
  canResubmit?: boolean
  selfApprovalBlocked?: boolean
}>()

const emit = defineEmits<{
  edit: []
  approve: []
  reject: []
  fulfill: []
  withdraw: []
  cancelDraft: []
  resubmit: []
  back: []
  openQuote: [quoteId: string]
}>()

const open = defineModel<boolean>('open', { default: false })

const detailLines = computed(() => props.order?.lines ?? [])
const approvalSteps = computed(() => props.order?.approvals ?? [])
const fulfillmentRecords = computed(() => [...(props.order?.fulfillments ?? [])]
  .sort((a, b) => b.shippedAt.localeCompare(a.shippedAt)))

const subtotal = computed(() => detailLines.value.reduce((sum, line) => sum + Number(line.amount), 0))
const tax = computed(() => subtotal.value * 0.13)
const total = computed(() => subtotal.value + tax.value)

const totalQuantity = computed(() => detailLines.value.reduce((sum, line) => sum + line.quantity, 0))
const shippedQuantity = computed(() => detailLines.value.reduce((sum, line) => sum + line.shipped, 0))
const shippedRate = computed(() => {
  if (!totalQuantity.value) return 0
  return Math.round(shippedQuantity.value / totalQuantity.value * 100)
})

const canEditSelected = computed(() => Boolean(
  props.order && props.canCreate && props.order.status === 'draft'
))
const canApproveSelected = computed(() => Boolean(
  props.order && props.canApprove && props.order.status === 'pending'
))
const canFulfillSelected = computed(() => Boolean(
  props.order && props.canCreate && ['approved', 'partial'].includes(props.order.status)
))

const printOpen = ref(false)
const printDocument = computed(() => props.order
  ? {
      kind: '销售订单' as const,
      documentNo: props.order.id,
      customer: props.order.customerName,
      status: salesStatusLabels[props.order.status],
      dateLabel: '下单日期',
      dateValue: props.order.orderedAt,
      owner: props.order.owner,
      note: props.order.note,
      lines: detailLines.value.map(line => ({
        lineNo: line.lineNo,
        sku: line.sku,
        name: line.name,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        amount: line.amount
      })),
      subtotal: subtotal.value,
      tax: tax.value,
      total: total.value
    }
  : null)

const lineColumns: TableColumn<SalesOrderLine>[] = [{
  accessorKey: 'lineNo',
  header: '序号',
  meta: { class: { td: 'tabular-nums text-muted' } }
}, {
  accessorKey: 'name',
  header: '商品',
  meta: { class: { td: 'min-w-[180px] whitespace-normal' } }
}, {
  accessorKey: 'quantity',
  header: '数量',
  meta: { class: { th: 'text-right', td: 'text-right tabular-nums' } }
}, {
  accessorKey: 'shipped',
  header: '已发货',
  meta: { class: { th: 'text-right', td: 'text-right tabular-nums' } }
}, {
  accessorKey: 'unitPrice',
  header: '单价',
  meta: { class: { th: 'text-right', td: 'text-right tabular-nums whitespace-nowrap' } }
}, {
  id: 'amount',
  header: '金额',
  meta: { class: { th: 'text-right', td: 'text-right tabular-nums whitespace-nowrap' } }
}]
</script>

<template>
  <USlideover v-model:open="open" :ui="{ content: 'w-full sm:max-w-3xl' }" data-testid="sales-order-detail">
    <template #header>
      <div class="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p class="font-mono text-xs text-muted">
            {{ order?.id }}
          </p>
          <h2 class="mt-1 text-base font-semibold text-highlighted">
            {{ order?.customerName }}
          </h2>
          <p class="mt-0.5 text-xs text-muted">
            负责人 {{ order?.owner }} · 承诺交付 {{ order?.promisedAt }}
          </p>
        </div>
        <UBadge
          v-if="order"
          :color="salesStatusColors[order.status]"
          variant="subtle"
          size="sm"
          :label="salesStatusLabels[order.status]"
          data-testid="sales-order-detail-status"
        />
      </div>
    </template>

    <template #body>
      <div v-if="order" class="space-y-5">
        <AppBreadcrumb current="销售订单" :detail="order.id" />
        <SalesStatusSteps kind="order" :status="order.status" />

        <UAlert
          v-if="order.status === 'cancelled'"
          color="error"
          variant="soft"
          icon="i-carbon-close-outline"
          title="订单已取消"
          description="取消订单不再参与履约与开票，仅保留历史记录。"
          data-testid="sales-order-cancelled-alert"
        />
        <UAlert
          v-else-if="order.status === 'closed'"
          color="neutral"
          variant="soft"
          icon="i-carbon-checkmark-outline"
          title="订单已关闭"
          description="履约与对账已完成，订单转为只读。"
          data-testid="sales-order-closed-alert"
        />
        <UAlert
          v-else-if="order.status === 'draft'"
          color="warning"
          variant="soft"
          icon="i-carbon-document"
          :title="order.withdrawnAt ? '已撤回提交' : '草稿订单'"
          :description="order.withdrawnAt
            ? '制单人于 ' + order.withdrawnAt + ' 撤回提交，当前为草稿，可修改后重新提交审批。'
            : '提交审批后才会进入销售审批队列，审批通过后方可发起履约。'"
          data-testid="sales-order-draft-alert"
        />

        <dl class="grid grid-cols-2 gap-x-4 gap-y-2 text-[13px] sm:grid-cols-4">
          <div>
            <dt class="text-xs text-muted">
              下单日期
            </dt>
            <dd class="mt-0.5 text-default">
              {{ order.orderedAt }}
            </dd>
          </div>
          <div>
            <dt class="text-xs text-muted">
              承诺交付
            </dt>
            <dd class="mt-0.5 text-default">
              {{ order.promisedAt }}
            </dd>
          </div>
          <div>
            <dt class="text-xs text-muted">
              明细行数
            </dt>
            <dd class="mt-0.5 tabular-nums text-default">
              {{ order.lines.length }} 行
            </dd>
          </div>
          <div>
            <dt class="text-xs text-muted">
              总数量
            </dt>
            <dd class="mt-0.5 tabular-nums text-default">
              {{ totalQuantity }}
            </dd>
          </div>
        </dl>

        <div class="space-y-1.5">
          <div class="flex items-center justify-between text-xs text-muted">
            <span>履约进度（已发货 {{ shippedQuantity }} / {{ totalQuantity }}）</span>
            <span class="tabular-nums">{{ shippedRate }}%</span>
          </div>
          <UProgress
            :model-value="shippedRate"
            size="sm"
            color="primary"
            data-testid="sales-order-fulfillment-progress"
          />
        </div>

        <UAlert
          v-if="order.note"
          color="neutral"
          variant="soft"
          icon="i-carbon-information"
          :description="order.note"
          :ui="{ description: 'text-xs' }"
          data-testid="sales-order-note"
        />

        <div v-if="order.quoteId" class="flex flex-wrap items-center justify-between gap-2 rounded-sm border border-default px-3 py-2">
          <p class="text-xs text-muted">
            由报价 <span class="font-mono text-default">{{ order.quoteId }}</span> 转换生成
          </p>
          <UButton
            label="查看原报价"
            icon="i-carbon-arrow-right"
            color="neutral"
            variant="ghost"
            size="xs"
            data-testid="sales-order-quote-link"
            @click="emit('openQuote', order.quoteId ?? '')"
          />
        </div>

        <UCard class="rounded-sm" :ui="{ body: 'p-0 sm:p-0', header: 'p-3 sm:p-3' }">
          <template #header>
            <div class="flex flex-wrap items-center justify-between gap-2">
              <p class="text-sm font-medium text-highlighted">
                销售明细（{{ detailLines.length }} 行）
              </p>
              <span class="text-xs text-muted">金额为未税金额</span>
            </div>
          </template>
          <div class="max-h-72 overflow-auto">
            <ResizableTable
              :data="detailLines"
              :columns="lineColumns"
              class="nx-table"
              :ui="{ th: 'sticky top-0 z-10 bg-elevated py-2', td: 'py-2', root: 'text-[12.5px]' }"
              data-testid="sales-order-lines"
            >
              <template #amount-cell="{ row }">
                {{ formatMoney(Number(row.original.amount)) }}
              </template>
            </ResizableTable>
          </div>
        </UCard>

        <UCard class="rounded-sm" :ui="{ body: 'p-3 sm:p-3', header: 'p-3 sm:p-3' }">
          <template #header>
            <div class="flex flex-wrap items-center justify-between gap-2">
              <p class="text-sm font-medium text-highlighted">
                审批轨迹
              </p>
              <span class="text-xs text-muted">{{ approvalSteps.length }} 条</span>
            </div>
          </template>
          <SalesApprovalTimeline :steps="approvalSteps" />
        </UCard>

        <UCard class="rounded-sm" :ui="{ body: 'p-3 sm:p-3', header: 'p-3 sm:p-3' }">
          <template #header>
            <div class="flex flex-wrap items-center justify-between gap-2">
              <p class="text-sm font-medium text-highlighted">
                关联履约记录
              </p>
              <span class="text-xs text-muted">共 {{ fulfillmentRecords.length }} 张发货单</span>
            </div>
          </template>
          <div data-testid="sales-order-fulfillments">
            <div v-if="fulfillmentRecords.length" class="space-y-2">
              <div
                v-for="record in fulfillmentRecords"
                :key="record.id"
                class="rounded-sm border border-default p-2.5"
                data-testid="sales-order-fulfillment"
              >
                <div class="flex flex-wrap items-center justify-between gap-2">
                  <p class="text-xs font-medium text-default">
                    {{ record.shippedAt }} · {{ record.shipper }}
                  </p>
                  <span class="font-mono text-[11px] text-muted">{{ record.id }}</span>
                </div>
                <ul class="mt-1 space-y-0.5">
                  <li v-for="line in record.lines" :key="line.lineNo" class="text-xs text-muted">
                    {{ line.name }} × {{ line.quantity }}
                  </li>
                </ul>
              </div>
            </div>
            <p v-else class="text-xs text-muted" data-testid="sales-order-fulfillment-empty">
              暂无履约记录，审批通过后可发起履约。
            </p>
          </div>
        </UCard>

        <StockPermitPanel source-type="sales" :source-id="order.id" :can-manage="canCreate" />

        <div class="flex justify-end">
          <dl class="w-full max-w-xs space-y-1.5 text-[13px]">
            <div class="flex justify-between gap-3">
              <dt class="text-muted">
                未税合计
              </dt>
              <dd class="tabular-nums text-default">
                {{ formatMoney(subtotal) }}
              </dd>
            </div>
            <div class="flex justify-between gap-3">
              <dt class="text-muted">
                税额（13%）
              </dt>
              <dd class="tabular-nums text-default">
                {{ formatMoney(tax) }}
              </dd>
            </div>
            <div class="flex justify-between gap-3 border-t border-default pt-1.5 text-sm font-semibold">
              <dt class="text-highlighted">
                价税合计
              </dt>
              <dd class="tabular-nums text-highlighted">
                {{ formatMoney(total) }}
              </dd>
            </div>
          </dl>
        </div>
      </div>
    </template>

    <template #footer>
      <div class="flex w-full flex-wrap items-center justify-between gap-2">
        <UButton
          label="返回列表"
          icon="i-carbon-arrow-left"
          color="neutral"
          variant="ghost"
          data-testid="sales-order-back"
          @click="emit('back')"
        />
        <div class="flex flex-wrap items-center justify-end gap-2">
          <p
            v-if="order?.status === 'pending' && !canApprove"
            class="text-xs text-muted"
            data-testid="sales-order-no-approve-permission"
          >
            当前身份无审批权限
          </p>
          <p
            v-if="selfApprovalBlocked"
            class="text-xs text-error"
            data-testid="sales-order-self-approval"
          >
            不能审批自己提交的单据
          </p>
          <UButton
            label="打印"
            icon="i-carbon-printer"
            color="neutral"
            variant="ghost"
            size="sm"
            data-testid="sales-order-print"
            @click="printOpen = true"
          />
          <UButton
            label="编辑"
            icon="i-carbon-edit"
            color="neutral"
            variant="outline"
            size="sm"
            :disabled="!canEditSelected"
            data-testid="sales-order-edit"
            @click="emit('edit')"
          />
          <UButton
            v-if="canWithdraw"
            label="撤回提交"
            icon="i-carbon-undo"
            color="warning"
            variant="outline"
            size="sm"
            data-testid="sales-order-withdraw"
            @click="emit('withdraw')"
          />
          <UButton
            v-if="canResubmit"
            label="重新提交"
            icon="i-carbon-send"
            size="sm"
            data-testid="sales-order-resubmit"
            @click="emit('resubmit')"
          />
          <UButton
            v-if="canCancel"
            label="取消草稿"
            icon="i-carbon-close"
            color="error"
            variant="ghost"
            size="sm"
            data-testid="sales-order-cancel-draft"
            @click="emit('cancelDraft')"
          />
          <UButton
            label="发起履约"
            icon="i-carbon-truck"
            color="neutral"
            variant="outline"
            size="sm"
            :disabled="!canFulfillSelected"
            data-testid="sales-order-fulfill"
            @click="emit('fulfill')"
          />
          <UButton
            label="驳回"
            icon="i-carbon-close"
            color="error"
            variant="outline"
            size="sm"
            :disabled="!canApproveSelected"
            data-testid="sales-order-reject"
            @click="emit('reject')"
          />
          <UButton
            label="批准"
            icon="i-carbon-checkmark"
            color="primary"
            size="sm"
            :disabled="!canApproveSelected"
            data-testid="sales-order-approve"
            @click="emit('approve')"
          />
        </div>
      </div>
    </template>
  </USlideover>

  <SalesPrintPreview v-model:open="printOpen" :document="printDocument" />
</template>

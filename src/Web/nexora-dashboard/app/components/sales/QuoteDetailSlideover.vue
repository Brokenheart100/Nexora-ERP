<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { Quote, QuoteLine } from '~/mocks'
import { quoteStatusColors, quoteStatusLabels } from '~/mocks'
import { displayDecimal } from '~/utils/api/decimal-display'

const props = defineProps<{
  quote: Quote | null
  canCreate: boolean
  live?: boolean
  canEdit?: boolean
  canSend?: boolean
  canConvert?: boolean
  canCancel?: boolean
  minorUnits?: number
}>()

const emit = defineEmits<{
  convert: []
  edit: []
  send: []
  cancel: []
  back: []
  openOrder: [orderId: string]
}>()

const open = defineModel<boolean>('open', { default: false })

const detailLines = computed(() => props.quote?.lines ?? [])

const subtotal = computed(() => detailLines.value.reduce((sum, line) => sum + Number(line.amount), 0))
const tax = computed(() => subtotal.value * 0.13)
const total = computed(() => subtotal.value + tax.value)

const canEditSelected = computed(() => props.live
  ? !!props.canEdit
  : Boolean(
      props.quote && props.canCreate && ['draft', 'sent'].includes(props.quote.status) && !props.quote.convertedOrderId
    ))
const canConvertSelected = computed(() => props.live
  ? !!props.canConvert
  : Boolean(
      props.quote
      && props.canCreate
      && ['sent', 'accepted'].includes(props.quote.status)
      && !props.quote.convertedOrderId
    ))

const lineColumns: TableColumn<QuoteLine>[] = [{
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
  accessorKey: 'unitPrice',
  header: '单价',
  meta: { class: { th: 'text-right', td: 'text-right tabular-nums whitespace-nowrap' } }
}, {
  accessorKey: 'taxRate',
  header: '税率',
  meta: { class: { th: 'text-right', td: 'text-right tabular-nums' } }
}, {
  id: 'amount',
  header: '金额',
  meta: { class: { th: 'text-right', td: 'text-right tabular-nums whitespace-nowrap' } }
}]
</script>

<template>
  <USlideover v-model:open="open" :ui="{ content: 'w-full sm:max-w-3xl' }" data-testid="quote-detail">
    <template #header>
      <div class="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p class="font-mono text-xs text-muted">
            {{ quote?.documentNumber ?? quote?.id }}
          </p>
          <h2 class="mt-1 text-base font-semibold text-highlighted">
            {{ quote?.customerName }}
          </h2>
          <p class="mt-0.5 text-xs text-muted">
            报价人 {{ quote?.owner }} · {{ live ? '报价日期' : '有效期至' }} {{ quote?.validUntil }}
          </p>
          <p v-if="quote?.sentAt" class="mt-0.5 text-xs text-muted" data-testid="quote-sent-at">
            正式发出于 {{ quote.sentAt }}
          </p>
        </div>
        <UBadge
          v-if="quote"
          :color="quoteStatusColors[quote.status]"
          variant="subtle"
          size="sm"
          :label="quoteStatusLabels[quote.status]"
          data-testid="quote-detail-status"
        />
      </div>
    </template>

    <template #body>
      <slot name="feedback" />
      <div v-if="quote" class="space-y-5">
        <AppBreadcrumb current="报价单" :detail="quote.documentNumber ?? quote.id" />
        <SalesStatusSteps kind="quote" :status="quote.status" :live="live" />

        <UAlert
          v-if="quote.status === 'rejected'"
          color="error"
          variant="soft"
          icon="i-carbon-close-outline"
          title="报价已被客户拒绝"
          description="可根据客户反馈修改明细后重新发送，或复制为新报价。"
          data-testid="quote-rejected-alert"
        />
        <UAlert
          v-else-if="quote.status === 'expired'"
          color="warning"
          variant="soft"
          icon="i-carbon-warning-alt"
          title="报价已过期"
          description="有效期已过，如需继续推进请复制为新报价并重新发送。"
          data-testid="quote-expired-alert"
        />
        <div
          v-else-if="quote.convertedOrderId || quote.status === 'converted'"
          class="flex flex-wrap items-center justify-between gap-2 rounded-sm border border-default px-3 py-2"
          data-testid="quote-converted-alert"
        >
          <p class="text-xs text-muted">
            已转为销售订单 <span class="font-mono text-default">{{ quote.convertedOrderNumber ?? quote.convertedOrderId }}</span>。
          </p>
          <UButton
            v-if="quote.convertedOrderId"
            label="查看销售订单"
            icon="i-carbon-arrow-right"
            color="neutral"
            variant="ghost"
            size="xs"
            data-testid="quote-open-order"
            @click="emit('openOrder', quote.convertedOrderId ?? '')"
          />
        </div>

        <dl class="grid grid-cols-2 gap-x-4 gap-y-2 text-[13px] sm:grid-cols-4">
          <div>
            <dt class="text-xs text-muted">
              报价人
            </dt>
            <dd class="mt-0.5 text-default">
              {{ quote.owner }}
            </dd>
          </div>
          <div>
            <dt class="text-xs text-muted">
              {{ live ? '报价日期' : '有效期至' }}
            </dt>
            <dd class="mt-0.5 text-default">
              {{ quote.validUntil }}
            </dd>
          </div>
          <div>
            <dt class="text-xs text-muted">
              明细行数
            </dt>
            <dd class="mt-0.5 tabular-nums text-default">
              {{ quote.lines.length }} 行
            </dd>
          </div>
          <div v-if="!live">
            <dt class="text-xs text-muted">
              更新时间
            </dt>
            <dd class="mt-0.5 tabular-nums text-default">
              {{ quote.updatedAt }}
            </dd>
          </div>
        </dl>

        <UCard class="rounded-sm" :ui="{ body: 'p-0 sm:p-0', header: 'p-3 sm:p-3' }">
          <template #header>
            <div class="flex flex-wrap items-center justify-between gap-2">
              <p class="text-sm font-medium text-highlighted">
                报价明细（{{ detailLines.length }} 行）
              </p>
              <span class="text-xs text-muted">金额为未税金额</span>
            </div>
          </template>
          <div class="max-h-72 overflow-auto">
            <ResizableTable
              :data="detailLines"
              :columns="live ? lineColumns.filter(column => !('accessorKey' in column) || column.accessorKey !== 'taxRate') : lineColumns"
              class="nx-table"
              :ui="{ th: 'sticky top-0 z-10 bg-elevated py-2', td: 'py-2', root: 'text-[12.5px]' }"
              data-testid="quote-lines"
            >
              <template #amount-cell="{ row }">
                {{ live ? displayDecimal(row.original.amount, minorUnits) : formatMoney(Number(row.original.amount)) }}
              </template>
            </ResizableTable>
          </div>
        </UCard>

        <div class="flex justify-end">
          <dl class="w-full max-w-xs space-y-1.5 text-[13px]">
            <div class="flex justify-between gap-3">
              <dt class="text-muted">
                未税合计
              </dt>
              <dd class="tabular-nums text-default">
                {{ live ? displayDecimal(quote.totalAmount, minorUnits) : formatMoney(subtotal) }}
              </dd>
            </div>
            <div v-if="!live" class="flex justify-between gap-3">
              <dt class="text-muted">
                税额（13%）
              </dt>
              <dd class="tabular-nums text-default">
                {{ formatMoney(tax) }}
              </dd>
            </div>
            <div v-if="!live" class="flex justify-between gap-3 border-t border-default pt-1.5 text-sm font-semibold">
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
          data-testid="quote-back"
          @click="emit('back')"
        />
        <div class="flex flex-wrap items-center justify-end gap-2">
          <UButton
            label="编辑"
            icon="i-carbon-edit"
            color="neutral"
            variant="outline"
            size="sm"
            :disabled="!canEditSelected"
            data-testid="quote-edit"
            @click="emit('edit')"
          />
          <UButton
            label="正式发出"
            icon="i-carbon-send"
            color="warning"
            variant="outline"
            size="sm"
            :disabled="live ? !canSend : !canCreate || quote?.status !== 'draft' || Boolean(quote?.convertedOrderId)"
            data-testid="quote-send"
            @click="emit('send')"
          />
          <UButton
            v-if="canCancel"
            label="取消草稿"
            color="error"
            variant="ghost"
            size="sm"
            @click="emit('cancel')"
          />
          <UButton
            label="转为销售订单"
            icon="i-carbon-document-add"
            size="sm"
            :disabled="!canConvertSelected"
            data-testid="quote-convert"
            @click="emit('convert')"
          />
        </div>
      </div>
    </template>
  </USlideover>
</template>

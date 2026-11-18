<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { Invoice, InvoiceLine, SalesOrder } from '~/mocks'
import {
  invoiceDeliveryChannelLabels,
  invoiceDeliveryStatusColors,
  invoiceDeliveryStatusLabels,
  invoiceStatusColors,
  invoiceStatusLabels
} from '~/mocks'

const props = defineProps<{
  invoice: Invoice | null
  order: SalesOrder | null
  canCreate: boolean
  busy: boolean
}>()

const emit = defineEmits<{
  back: []
  send: []
  retry: [deliveryId: string]
  openOrder: [orderId: string]
  registerReceipt: [customerName: string, invoiceId: string]
  allocate: [invoiceId: string, receiptId?: string]
  saveDraft: [lines: InvoiceLine[]]
  issue: []
  correct: [invoiceId: string]
}>()

const open = defineModel<boolean>('open', { default: false })

const toast = useToast()
const { copy, isSupported } = useClipboard()
const receivables = useReceivablesStore()

const detailLines = computed(() => props.invoice?.lines ?? [])
const outstanding = computed(() => receivables.outstandingOf(props.invoice))
const allocated = computed(() => props.invoice ? receivables.allocatedOf(props.invoice.id) : 0)
const invoiceAllocations = computed(() => props.invoice
  ? receivables.allocations.filter(row => row.invoiceId === props.invoice?.id)
  : [])
const isDraft = computed(() => props.invoice?.status === 'draft')
const customerReceipts = computed(() => props.invoice
  ? receivables.availableReceiptsFor(props.invoice.workspaceId, props.invoice.customerName)
  : [])
const customerCredits = computed(() => props.invoice
  ? receivables.credits.filter(credit => credit.workspaceId === props.invoice?.workspaceId
    && credit.customerName === props.invoice?.customerName
    && receivables.creditAvailableOf(credit) > 0.005)
  : [])
const deliveries = computed(() => [...(props.invoice?.deliveries ?? [])]
  .sort((a, b) => b.at.localeCompare(a.at)))

const shareLink = computed(() => {
  const token = props.invoice?.shareToken ?? props.invoice?.id.toLowerCase() ?? ''
  return 'https://demo.nexora.example/invoice-share/' + token
})

const canSend = computed(() => Boolean(
  props.invoice && props.canCreate && ['issued', 'overdue'].includes(props.invoice.status)
))

const printOpen = ref(false)
const printDocument = computed(() => {
  if (!props.invoice) return null
  const total = Number(props.invoice.amount)
  const tax = Number(props.invoice.taxAmount)
  return {
    kind: '发票' as const,
    documentNo: props.invoice.id,
    customer: props.invoice.customerName,
    status: invoiceStatusLabels[props.invoice.status],
    dateLabel: '开票日期',
    dateValue: props.invoice.issuedAt,
    note: '到期日 ' + props.invoice.dueAt + '；关联订单 ' + props.invoice.sourceOrderId,
    lines: detailLines.value.map(line => ({
      lineNo: line.lineNo,
      sku: line.sku,
      name: line.name,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      amount: line.amount
    })),
    subtotal: total - tax,
    tax,
    total
  }
})

async function copyShareLink() {
  if (!props.invoice || !isSupported.value) {
    toast.add({
      title: '当前浏览器不支持剪贴板',
      description: '可手动选中分享链接复制。',
      color: 'warning',
      icon: 'i-carbon-warning-alt'
    })
    return
  }
  await copy(shareLink.value)
  toast.add({
    title: '已复制分享链接',
    description: '链接为演示地址，不会访问后端或真实发票。',
    color: 'success',
    icon: 'i-carbon-copy'
  })
}

interface DraftLine extends InvoiceLine {
  shipped: number
}

const draftLines = ref<DraftLine[]>([])
const draftSubtotal = computed(() => draftLines.value.reduce((sum, line) => sum + Number(line.amount), 0))
const draftTax = computed(() => Math.round(draftSubtotal.value * 13) / 100)
const draftTotal = computed(() => draftSubtotal.value + draftTax.value)

function shippedFor(line: InvoiceLine) {
  const source = props.order?.lines.find(item => item.lineNo === line.lineNo || item.sku === line.sku)
  return source?.shipped ?? line.quantity
}

function resetDraftLines() {
  draftLines.value = (props.invoice?.lines ?? []).map(line => ({
    ...line,
    shipped: shippedFor(line)
  }))
}

watch(() => props.invoice?.id, resetDraftLines, { immediate: true })

function setDraftQuantity(line: DraftLine, value: string | number) {
  const parsed = Math.max(0, Math.floor(Number(value) || 0))
  line.quantity = Math.min(parsed, line.shipped)
  line.amount = (line.quantity * Number(line.unitPrice)).toFixed(2)
}

function setDraftPrice(line: DraftLine, value: string | number) {
  line.unitPrice = (Math.max(0, Number(value) || 0)).toFixed(2)
  line.amount = (line.quantity * Number(line.unitPrice)).toFixed(2)
}

function saveDraft(silent = false): boolean {
  const lines = draftLines.value
    .filter(line => line.quantity > 0)
    .map(({ shipped, ...line }) => ({ ...line }))
  if (!lines.length) {
    toast.add({ title: '请至少保留一行开票数量', color: 'warning', icon: 'i-carbon-warning-alt' })
    return false
  }
  emit('saveDraft', lines)
  if (!silent) toast.add({ title: '已提交发票草稿', color: 'success', icon: 'i-carbon-checkmark' })
  return true
}

function issueDraft() {
  if (!saveDraft(true)) return
  emit('issue')
}

function allocationSourceLabel(sourceType: 'receipt' | 'credit') {
  return sourceType === 'receipt' ? '收款单' : '销售贷项'
}

const lineColumns: TableColumn<InvoiceLine>[] = [{
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
  id: 'amount',
  header: '金额',
  meta: { class: { th: 'text-right', td: 'text-right tabular-nums whitespace-nowrap' } }
}]

const draftColumns: TableColumn<DraftLine>[] = [{
  accessorKey: 'name',
  header: '商品',
  meta: { class: { td: 'min-w-[160px] whitespace-normal' } }
}, {
  accessorKey: 'shipped',
  header: '可开票',
  meta: { class: { th: 'text-right', td: 'text-right tabular-nums' } }
}, {
  accessorKey: 'quantity',
  header: '本单数量',
  meta: { class: { th: 'text-right', td: 'text-right' } }
}, {
  accessorKey: 'unitPrice',
  header: '单价',
  meta: { class: { th: 'text-right', td: 'text-right' } }
}, {
  id: 'amount',
  header: '金额',
  meta: { class: { th: 'text-right', td: 'text-right tabular-nums whitespace-nowrap' } }
}]
</script>

<template>
  <USlideover v-model:open="open" :ui="{ content: 'w-full sm:max-w-3xl' }" data-testid="invoice-detail">
    <template #header>
      <div class="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p class="font-mono text-xs text-muted">
            {{ invoice?.id }}
          </p>
          <h2 class="mt-1 text-base font-semibold text-highlighted">
            {{ invoice?.customerName }}
          </h2>
          <p class="mt-0.5 text-xs text-muted">
            开票 {{ invoice?.issuedAt }} · 到期 {{ invoice?.dueAt }}
          </p>
        </div>
        <UBadge
          v-if="invoice"
          :color="invoiceStatusColors[invoice.status]"
          variant="subtle"
          size="sm"
          :label="invoiceStatusLabels[invoice.status]"
          data-testid="invoice-detail-status"
        />
      </div>
    </template>

    <template #body>
      <div v-if="invoice" class="space-y-5">
        <AppBreadcrumb current="发票" :detail="invoice.id" />

        <UAlert
          v-if="invoice.status === 'overdue'"
          color="error"
          variant="soft"
          icon="i-carbon-warning-alt"
          title="发票已逾期"
          description="可发送提醒邮件，并登记客户收款后按未结金额核销（本地演示）。"
          data-testid="invoice-overdue-alert"
        />
        <UAlert
          v-else-if="invoice.status === 'cancelled'"
          color="neutral"
          variant="soft"
          icon="i-carbon-close-outline"
          title="发票已作废"
          description="作废发票不可再发送、分享或标记收款。"
          data-testid="invoice-cancelled-alert"
        />
        <UAlert
          v-else-if="invoice.status === 'draft'"
          color="warning"
          variant="soft"
          icon="i-carbon-document"
          title="草稿发票"
          description="可编辑本单数量与单价，确认开票后进入应收台账；本原型不会真的开票。"
          data-testid="invoice-draft-alert"
        />

        <dl class="grid grid-cols-2 gap-x-4 gap-y-2 text-[13px] sm:grid-cols-5">
          <div>
            <dt class="text-xs text-muted">
              关联销售订单
            </dt>
            <dd class="mt-0.5 font-mono text-[12px] text-default">
              {{ invoice.sourceOrderId }}
            </dd>
          </div>
          <div>
            <dt class="text-xs text-muted">
              发票金额（价税合计）
            </dt>
            <dd class="mt-0.5 tabular-nums text-default">
              {{ formatMoney(Number(invoice.amount)) }}
            </dd>
          </div>
          <div>
            <dt class="text-xs text-muted">
              其中税额
            </dt>
            <dd class="mt-0.5 tabular-nums text-default">
              {{ formatMoney(Number(invoice.taxAmount)) }}
            </dd>
          </div>
          <div>
            <dt class="text-xs text-muted">
              未结金额
            </dt>
            <dd class="mt-0.5 tabular-nums text-highlighted" data-testid="invoice-outstanding">
              {{ formatMoney(outstanding) }}
            </dd>
          </div>
          <div>
            <dt class="text-xs text-muted">
              寄送记录
            </dt>
            <dd class="mt-0.5 tabular-nums text-default">
              {{ deliveries.length }} 条
            </dd>
          </div>
        </dl>

        <SalesPdfPreviewPanel :invoice="invoice" />

        <UCard v-if="!isDraft" class="rounded-sm" :ui="{ body: 'p-0 sm:p-0', header: 'p-3 sm:p-3' }">
          <template #header>
            <div class="flex flex-wrap items-center justify-between gap-2">
              <p class="text-sm font-medium text-highlighted">
                发票明细（{{ detailLines.length }} 行）
              </p>
              <span class="text-xs text-muted">金额为未税金额</span>
            </div>
          </template>
          <div class="max-h-64 overflow-auto">
            <ResizableTable
              :data="detailLines"
              :columns="lineColumns"
              class="nx-table"
              :ui="{ th: 'sticky top-0 z-10 bg-elevated py-2', td: 'py-2', root: 'text-[12.5px]' }"
              data-testid="invoice-lines"
            >
              <template #amount-cell="{ row }">
                {{ formatMoney(Number(row.original.amount)) }}
              </template>
            </ResizableTable>
          </div>
        </UCard>

        <UCard
          v-else
          class="rounded-sm"
          :ui="{ body: 'p-0 sm:p-0', header: 'p-3 sm:p-3' }"
          data-testid="invoice-draft-editor"
        >
          <template #header>
            <div class="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p class="text-sm font-medium text-highlighted">
                  编辑发票草稿（{{ draftLines.length }} 行）
                </p>
                <p class="mt-0.5 text-xs text-muted">
                  来源订单 {{ invoice.sourceOrderId }} · 可开票数量取自已发货明细
                </p>
              </div>
              <UBadge
                color="warning"
                variant="subtle"
                size="sm"
                label="草稿"
              />
            </div>
          </template>
          <div class="max-h-72 overflow-auto">
            <ResizableTable
              :data="draftLines"
              :columns="draftColumns"
              class="nx-table"
              :ui="{ th: 'sticky top-0 z-10 bg-elevated py-2', td: 'py-2', root: 'text-[12.5px]' }"
              data-testid="invoice-draft-lines"
            >
              <template #shipped-cell="{ row }">
                <span :class="row.original.shipped ? 'text-default' : 'text-error'">{{ row.original.shipped }}</span>
              </template>
              <template #quantity-cell="{ row }">
                <UInput
                  :model-value="row.original.quantity"
                  type="number"
                  min="0"
                  :max="row.original.shipped"
                  size="xs"
                  class="ml-auto w-20"
                  :disabled="!canCreate"
                  :data-testid="'invoice-draft-qty-' + row.original.lineNo"
                  @update:model-value="value => setDraftQuantity(row.original, value)"
                />
              </template>
              <template #unitPrice-cell="{ row }">
                <UInput
                  :model-value="row.original.unitPrice"
                  type="number"
                  min="0"
                  step="0.01"
                  size="xs"
                  class="ml-auto w-24"
                  :disabled="!canCreate"
                  :data-testid="'invoice-draft-price-' + row.original.lineNo"
                  @update:model-value="value => setDraftPrice(row.original, value)"
                />
              </template>
              <template #amount-cell="{ row }">
                {{ formatMoney(Number(row.original.amount)) }}
              </template>
            </ResizableTable>
          </div>
          <template #footer>
            <div class="flex flex-wrap items-center justify-between gap-2 p-3">
              <div class="text-xs text-muted">
                未税 <span class="tabular-nums text-default">{{ formatMoney(draftSubtotal) }}</span>
                · 税额 <span class="tabular-nums text-default">{{ formatMoney(draftTax) }}</span>
                · 价税合计 <span class="font-medium tabular-nums text-highlighted" data-testid="invoice-draft-total">{{ formatMoney(draftTotal) }}</span>
              </div>
              <div class="flex items-center gap-2">
                <UButton
                  label="保存草稿"
                  icon="i-carbon-save"
                  color="neutral"
                  variant="outline"
                  size="sm"
                  :disabled="!canCreate"
                  data-testid="invoice-draft-save"
                  @click="saveDraft()"
                />
                <UButton
                  label="确认开票"
                  icon="i-carbon-checkmark"
                  size="sm"
                  :disabled="!canCreate"
                  data-testid="invoice-draft-issue"
                  @click="issueDraft"
                />
              </div>
            </div>
          </template>
        </UCard>

        <UCard
          v-if="!isDraft"
          class="rounded-sm"
          :ui="{ body: 'p-3 sm:p-3', header: 'p-3 sm:p-3' }"
          data-testid="invoice-payments"
        >
          <template #header>
            <div class="flex flex-wrap items-center justify-between gap-2">
              <p class="text-sm font-medium text-highlighted">
                收款与核销
              </p>
              <span class="text-xs text-muted">已核销 {{ formatMoney(allocated) }} · 未结 {{ formatMoney(outstanding) }}</span>
            </div>
          </template>
          <div v-if="customerReceipts.length" class="mb-3 space-y-2" data-testid="invoice-available-receipts">
            <p class="text-xs font-medium text-default">
              可用收款（核销前余额）
            </p>
            <div
              v-for="row in customerReceipts"
              :key="row.id"
              class="flex flex-wrap items-center justify-between gap-2 rounded-sm border border-primary/30 bg-primary/5 px-3 py-2"
              data-testid="invoice-available-receipt"
            >
              <div class="min-w-0">
                <p class="text-xs font-medium text-default">
                  {{ row.id }} · {{ row.bankName }}
                </p>
                <p class="mt-0.5 text-[11px] text-muted">
                  {{ row.receivedAt }} · 参考 {{ row.reference }}
                </p>
              </div>
              <div class="flex items-center gap-2">
                <span class="tabular-nums text-sm text-primary">{{ formatMoney(receivables.receiptAvailableOf(row)) }}</span>
                <UButton
                  label="核销"
                  color="primary"
                  variant="soft"
                  size="xs"
                  :disabled="!canCreate"
                  data-testid="invoice-use-receipt"
                  @click="emit('allocate', invoice.id, row.id)"
                />
              </div>
            </div>
          </div>
          <div v-if="customerCredits.length" class="mb-3 space-y-2" data-testid="invoice-available-credits">
            <p class="text-xs font-medium text-default">
              可用销售贷项
            </p>
            <div
              v-for="row in customerCredits"
              :key="row.id"
              class="flex flex-wrap items-center justify-between gap-2 rounded-sm border border-default px-3 py-2"
              data-testid="invoice-available-credit"
            >
              <p class="text-xs text-default">
                {{ row.id }} · {{ row.name }} × {{ row.quantity }}
              </p>
              <span class="tabular-nums text-sm text-highlighted">{{ formatMoney(receivables.creditAvailableOf(row)) }}</span>
            </div>
          </div>
          <ol v-if="invoiceAllocations.length" class="space-y-2" data-testid="invoice-allocation-list">
            <li
              v-for="row in invoiceAllocations"
              :key="row.id"
              class="flex flex-wrap items-center justify-between gap-2 rounded-sm border border-default px-3 py-2"
              data-testid="invoice-allocation-row"
            >
              <div class="min-w-0">
                <p class="text-xs font-medium text-default">
                  {{ allocationSourceLabel(row.sourceType) }} · {{ row.receiptId ?? row.creditId }}
                </p>
                <p class="mt-0.5 text-[11px] text-muted">
                  {{ row.at }} · {{ row.id }}
                </p>
              </div>
              <span class="tabular-nums text-sm text-highlighted">{{ formatMoney(Number(row.amount)) }}</span>
            </li>
          </ol>
          <p v-else class="text-xs text-muted" data-testid="invoice-allocation-empty">
            暂无核销记录。登记客户收款后可按未结金额核销本发票。
          </p>
        </UCard>

        <UCard class="rounded-sm" :ui="{ body: 'p-3 sm:p-3', header: 'p-3 sm:p-3' }">
          <template #header>
            <div class="flex flex-wrap items-center justify-between gap-2">
              <p class="text-sm font-medium text-highlighted">
                分享链接
              </p>
              <UBadge
                color="neutral"
                variant="subtle"
                size="sm"
                label="演示地址"
              />
            </div>
          </template>
          <div class="flex flex-wrap items-center gap-2">
            <UInput
              :model-value="shareLink"
              readonly
              class="min-w-0 flex-1"
              size="sm"
              data-testid="invoice-share-link"
            />
            <UButton
              label="复制链接"
              icon="i-carbon-copy"
              color="neutral"
              variant="outline"
              size="sm"
              data-testid="invoice-share-copy"
              @click="copyShareLink"
            />
          </div>
          <p class="mt-2 text-xs text-muted">
            复制的是本地演示地址，不包含真实客户信息，也不会产生分享记录。
          </p>
        </UCard>

        <UCard class="rounded-sm" :ui="{ body: 'p-3 sm:p-3', header: 'p-3 sm:p-3' }">
          <template #header>
            <div class="flex flex-wrap items-center justify-between gap-2">
              <p class="text-sm font-medium text-highlighted">
                发送记录
              </p>
              <span class="text-xs text-muted">共 {{ deliveries.length }} 条</span>
            </div>
          </template>
          <div data-testid="invoice-deliveries">
            <ol v-if="deliveries.length" class="space-y-2">
              <li
                v-for="record in deliveries"
                :key="record.id"
                class="flex flex-wrap items-center justify-between gap-2 rounded-sm border border-default px-3 py-2"
                data-testid="invoice-delivery"
              >
                <div class="min-w-0">
                  <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <UBadge
                      :color="invoiceDeliveryStatusColors[record.status]"
                      variant="subtle"
                      size="sm"
                      :label="invoiceDeliveryStatusLabels[record.status]"
                    />
                    <span class="text-xs font-medium text-default">
                      {{ invoiceDeliveryChannelLabels[record.channel] }}
                    </span>
                    <span class="text-[11px] tabular-nums text-muted">{{ record.at }}</span>
                  </div>
                  <p class="mt-1 truncate text-xs text-muted">
                    {{ record.target }}
                  </p>
                  <p v-if="record.error" class="mt-0.5 text-xs text-error">
                    {{ record.error }}
                  </p>
                </div>
                <UButton
                  v-if="record.status === 'failed'"
                  label="重试"
                  icon="i-carbon-renew"
                  color="neutral"
                  variant="ghost"
                  size="xs"
                  :disabled="!canCreate"
                  :loading="busy"
                  data-testid="invoice-delivery-retry"
                  @click="emit('retry', record.id)"
                />
              </li>
            </ol>
            <p v-else class="text-xs text-muted" data-testid="invoice-delivery-empty">
              暂无发送记录，可点击下方「发送邮件」生成一条本地记录。
            </p>
          </div>
        </UCard>
      </div>
    </template>

    <template #footer>
      <div class="flex w-full flex-wrap items-center justify-between gap-2">
        <UButton
          label="返回列表"
          icon="i-carbon-arrow-left"
          color="neutral"
          variant="ghost"
          data-testid="invoice-back"
          @click="emit('back')"
        />
        <div class="flex flex-wrap items-center justify-end gap-2">
          <p v-if="invoice && !canCreate" class="text-xs text-muted">
            当前身份无开票操作权限
          </p>
          <UButton
            label="打印"
            icon="i-carbon-printer"
            color="neutral"
            variant="ghost"
            size="sm"
            data-testid="invoice-print"
            @click="printOpen = true"
          />
          <UButton
            label="查看关联订单"
            icon="i-carbon-arrow-right"
            color="neutral"
            variant="ghost"
            size="sm"
            data-testid="invoice-open-order"
            @click="emit('openOrder', invoice?.sourceOrderId ?? '')"
          />
          <UButton
            label="登记收款"
            icon="i-carbon-currency-yen"
            color="neutral"
            variant="outline"
            size="sm"
            :disabled="!canCreate || !invoice || !['issued', 'overdue'].includes(invoice.status)"
            data-testid="invoice-register-receipt"
            @click="emit('registerReceipt', invoice?.customerName ?? '', invoice?.id ?? '')"
          />
          <UButton
            label="核销"
            icon="i-carbon-connect"
            color="neutral"
            variant="outline"
            size="sm"
            :disabled="!canCreate || !invoice || !['issued', 'overdue'].includes(invoice.status) || outstanding <= 0"
            data-testid="invoice-allocate"
            @click="emit('allocate', invoice?.id ?? '')"
          />
          <UButton
            label="更正"
            icon="i-carbon-edit"
            color="neutral"
            variant="ghost"
            size="sm"
            :disabled="!canCreate || !invoice || !['issued', 'overdue', 'paid'].includes(invoice.status)"
            data-testid="invoice-correct"
            @click="emit('correct', invoice?.id ?? '')"
          />
          <UButton
            label="发送邮件"
            icon="i-carbon-email"
            size="sm"
            :disabled="!canSend"
            :loading="busy"
            data-testid="invoice-send"
            @click="emit('send')"
          />
        </div>
      </div>
    </template>
  </USlideover>

  <SalesPrintPreview v-model:open="printOpen" :document="printDocument" />
</template>

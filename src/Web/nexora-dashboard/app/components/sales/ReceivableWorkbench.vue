<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { CustomerReceipt, Invoice, SalesCredit, SalesOrder } from '~/mocks'
import {
  salesCreditStatusColors,
  salesCreditStatusLabels,
  salesStatusColors,
  salesStatusLabels
} from '~/mocks'

const props = defineProps<{
  invoices: Invoice[]
  orders: SalesOrder[]
  canCreate: boolean
}>()

const emit = defineEmits<{
  openInvoice: [invoiceId: string]
  openOrder: [orderId: string]
  createInvoice: [orderId: string]
  registerReceipt: [customerName: string]
  allocate: [invoiceId: string, receiptId?: string]
  openCredit: [creditId: string]
}>()

const receivables = useReceivablesStore()
const { workspace } = useMockWorkspace()
const today = '2026-11-18'

const receivableInvoices = computed(() => props.invoices
  .filter(invoice => (invoice.status === 'issued' || invoice.status === 'overdue')
    && receivables.outstandingOf(invoice) > 0.005))
const overdueInvoices = computed(() => receivableInvoices.value
  .filter(invoice => invoice.status === 'overdue')
  .sort((a, b) => a.dueAt.localeCompare(b.dueAt)))

const totalReceivable = computed(() => receivableInvoices.value
  .reduce((sum, invoice) => sum + receivables.outstandingOf(invoice), 0))
const overdueTotal = computed(() => overdueInvoices.value
  .reduce((sum, invoice) => sum + receivables.outstandingOf(invoice), 0))

const availableReceipts = computed(() => receivables.availableReceiptsFor(workspace.value.id))
const availableCredits = computed(() => receivables.credits.filter(credit => credit.workspaceId === workspace.value.id
  && receivables.creditAvailableOf(credit) > 0.005))
const unappliedTotal = computed(() => availableReceipts.value
  .reduce((sum, receipt) => sum + receivables.receiptAvailableOf(receipt), 0))
const creditAvailableTotal = computed(() => availableCredits.value
  .reduce((sum, credit) => sum + receivables.creditAvailableOf(credit), 0))

const pendingInvoiceOrders = computed(() => props.orders.filter((order) => {
  if (!['fulfilled', 'closed'].includes(order.status)) return false
  return !props.invoices.some(invoice => invoice.sourceOrderId === order.id && invoice.status !== 'cancelled')
}))

const agingRows = computed(() => receivables.agingBucketsFor(workspace.value.id).map(bucket => ({
  bucket: bucket.bucket,
  amount: Number(bucket.receivable)
})))
const agingMax = computed(() => Math.max(...agingRows.value.map(row => row.amount), 1))
const agingTotal = computed(() => agingRows.value.reduce((sum, row) => sum + row.amount, 0))

const agingChartData = computed(() => agingRows.value)

function daysOverdue(dueAt: string) {
  const diff = Date.parse(today) - Date.parse(dueAt)
  return Math.max(0, Math.floor(diff / 86400000))
}

const overdueColumns: TableColumn<Invoice>[] = [{
  accessorKey: 'id',
  header: '发票号',
  meta: { class: { td: 'font-mono text-[12px]' } }
}, {
  accessorKey: 'customerName',
  header: '客户',
  meta: { class: { td: 'min-w-[180px] whitespace-normal' } }
}, {
  accessorKey: 'dueAt',
  header: '到期日',
  meta: { class: { td: 'tabular-nums' } }
}, {
  id: 'days',
  header: '逾期天数',
  meta: { class: { th: 'text-right', td: 'text-right tabular-nums' } }
}, {
  id: 'amount',
  header: '未结金额',
  meta: { class: { th: 'text-right', td: 'text-right tabular-nums whitespace-nowrap' } }
}]

const receiptColumns: TableColumn<CustomerReceipt>[] = [{
  accessorKey: 'id',
  header: '收款单',
  meta: { class: { td: 'font-mono text-[12px]' } }
}, {
  accessorKey: 'bankName',
  header: '资金账户',
  meta: { class: { td: 'min-w-[140px] whitespace-normal' } }
}, {
  accessorKey: 'receivedAt',
  header: '收款日期',
  meta: { class: { td: 'tabular-nums' } }
}, {
  id: 'amount',
  header: '收款金额',
  meta: { class: { th: 'text-right', td: 'text-right tabular-nums whitespace-nowrap' } }
}, {
  id: 'available',
  header: '可核销',
  meta: { class: { th: 'text-right', td: 'text-right tabular-nums whitespace-nowrap' } }
}, {
  id: 'actions',
  header: '操作',
  meta: { class: { th: 'text-right', td: 'text-right' } }
}]

const creditColumns: TableColumn<SalesCredit>[] = [{
  accessorKey: 'id',
  header: '贷项',
  meta: { class: { td: 'font-mono text-[12px]' } }
}, {
  accessorKey: 'customerName',
  header: '客户',
  meta: { class: { td: 'min-w-[150px] whitespace-normal' } }
}, {
  accessorKey: 'invoiceId',
  header: '关联发票',
  meta: { class: { td: 'font-mono text-[12px]' } }
}, {
  accessorKey: 'status',
  header: '状态'
}, {
  id: 'available',
  header: '可退/可核销',
  meta: { class: { th: 'text-right', td: 'text-right tabular-nums whitespace-nowrap' } }
}, {
  id: 'actions',
  header: '操作',
  meta: { class: { th: 'text-right', td: 'text-right' } }
}]

const orderColumns: TableColumn<SalesOrder>[] = [{
  accessorKey: 'id',
  header: '订单号',
  meta: { class: { td: 'font-mono text-[12px]' } }
}, {
  accessorKey: 'customerName',
  header: '客户',
  meta: { class: { td: 'min-w-[180px] whitespace-normal' } }
}, {
  accessorKey: 'status',
  header: '状态'
}, {
  id: 'amount',
  header: '订单金额',
  meta: { class: { th: 'text-right', td: 'text-right tabular-nums whitespace-nowrap' } }
}]
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <p class="text-xs text-muted">
        客户收款、核销、销售贷项与退款共用同一台账；应收金额按未结余额计算。
      </p>
      <UButton
        label="登记客户收款"
        icon="i-carbon-currency-yen"
        size="sm"
        :disabled="!canCreate"
        data-testid="receivable-register-receipt"
        @click="emit('registerReceipt', '')"
      />
    </div>

    <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      <UCard class="rounded-sm" :ui="{ body: 'p-3 sm:p-3' }" data-testid="receivable-total">
        <p class="text-xs text-muted">
          应收总额
        </p>
        <p class="mt-1 text-xl font-semibold tabular-nums text-highlighted">
          {{ formatMoney(totalReceivable) }}
        </p>
        <p class="mt-0.5 text-[11px] text-muted">
          已开票未收款（演示口径）
        </p>
      </UCard>
      <UCard class="rounded-sm" :ui="{ body: 'p-3 sm:p-3' }" data-testid="receivable-overdue">
        <p class="text-xs text-muted">
          逾期未收
        </p>
        <p class="mt-1 text-xl font-semibold tabular-nums text-error">
          {{ formatMoney(overdueTotal) }}
        </p>
        <p class="mt-0.5 text-[11px] text-muted">
          共 {{ overdueInvoices.length }} 张发票
        </p>
      </UCard>
      <UCard class="rounded-sm" :ui="{ body: 'p-3 sm:p-3' }" data-testid="receivable-pending">
        <p class="text-xs text-muted">
          待开票单据
        </p>
        <p class="mt-1 text-xl font-semibold tabular-nums text-highlighted">
          {{ pendingInvoiceOrders.length }}
        </p>
        <p class="mt-0.5 text-[11px] text-muted">
          已履约/已关闭且未开票
        </p>
      </UCard>
      <UCard class="rounded-sm" :ui="{ body: 'p-3 sm:p-3' }" data-testid="receivable-overdue-count">
        <p class="text-xs text-muted">
          逾期占比
        </p>
        <p class="mt-1 text-xl font-semibold tabular-nums text-warning">
          {{ totalReceivable ? (overdueTotal / totalReceivable * 100).toFixed(1) : '0.0' }}%
        </p>
        <p class="mt-0.5 text-[11px] text-muted">
          逾期金额 / 应收总额
        </p>
      </UCard>
      <UCard class="rounded-sm" :ui="{ body: 'p-3 sm:p-3' }" data-testid="receivable-unapplied">
        <p class="text-xs text-muted">
          未核销收款
        </p>
        <p class="mt-1 text-xl font-semibold tabular-nums text-primary">
          {{ formatMoney(unappliedTotal) }}
        </p>
        <p class="mt-0.5 text-[11px] text-muted">
          共 {{ availableReceipts.length }} 张收款单可用
        </p>
      </UCard>
      <UCard class="rounded-sm" :ui="{ body: 'p-3 sm:p-3' }" data-testid="receivable-credits">
        <p class="text-xs text-muted">
          可用销售贷项
        </p>
        <p class="mt-1 text-xl font-semibold tabular-nums text-success">
          {{ formatMoney(creditAvailableTotal) }}
        </p>
        <p class="mt-0.5 text-[11px] text-muted">
          共 {{ availableCredits.length }} 笔可核销或退款
        </p>
      </UCard>
    </div>

    <div class="grid gap-3 xl:grid-cols-2">
      <UCard class="rounded-sm" :ui="{ body: 'p-3 sm:p-3', header: 'p-3 sm:p-3' }">
        <template #header>
          <div class="flex flex-wrap items-center justify-between gap-2">
            <p class="text-sm font-medium text-highlighted">
              逾期账龄分布
            </p>
            <UBadge
              color="neutral"
              variant="subtle"
              size="sm"
              label="当前工作区"
            />
          </div>
        </template>
        <UChart
          type="bar"
          :data="agingChartData"
          index="bucket"
          :categories="[{ key: 'amount', label: '应收金额' }]"
          :height="220"
          :format="value => formatMoney(Number(value))"
          aria-label="应收账龄分布柱状图"
          data-testid="receivable-aging-chart"
        />
        <p class="mt-1 text-[11px] text-muted">
          按当前工作区未结发票与到期日计算，基准日 2026-11-18。
        </p>
      </UCard>

      <UCard class="rounded-sm" :ui="{ body: 'p-0 sm:p-0', header: 'p-3 sm:p-3' }">
        <template #header>
          <div class="flex flex-wrap items-center justify-between gap-2">
            <p class="text-sm font-medium text-highlighted">
              账龄明细
            </p>
            <span class="text-xs tabular-nums text-muted">合计 {{ formatMoney(agingTotal) }}</span>
          </div>
        </template>
        <div class="divide-y divide-default" data-testid="receivable-aging-table">
          <div
            v-for="row in agingRows"
            :key="row.bucket"
            class="flex items-center gap-3 px-3 py-2.5"
            data-testid="receivable-aging-row"
          >
            <span class="w-20 shrink-0 text-xs text-muted">{{ row.bucket }}</span>
            <div class="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-elevated">
              <div class="h-full rounded-full bg-primary" :style="{ width: (row.amount / agingMax * 100) + '%' }" />
            </div>
            <span class="w-28 shrink-0 text-right text-xs tabular-nums text-default">{{ formatMoney(row.amount) }}</span>
          </div>
        </div>
      </UCard>
    </div>

    <div class="grid gap-3 xl:grid-cols-2">
      <UCard class="rounded-sm" :ui="{ body: 'p-0 sm:p-0', header: 'p-3 sm:p-3' }">
        <template #header>
          <div class="flex flex-wrap items-center justify-between gap-2">
            <p class="text-sm font-medium text-highlighted">
              客户收款单
            </p>
            <span class="text-xs text-muted">未核销余额可用于同一客户发票</span>
          </div>
        </template>
        <ResizableTable
          :data="availableReceipts"
          :columns="receiptColumns"
          class="nx-table"
          :ui="{ th: 'py-2.5', td: 'py-3' }"
          data-testid="receivable-receipt-table"
        >
          <template #amount-cell="{ row }">
            {{ formatMoney(Number(row.original.amount)) }}
          </template>
          <template #available-cell="{ row }">
            <span class="font-medium text-primary">{{ formatMoney(receivables.receiptAvailableOf(row.original)) }}</span>
          </template>
          <template #actions-cell="{ row }">
            <UButton
              label="核销"
              color="primary"
              variant="soft"
              size="xs"
              :disabled="!canCreate"
              :data-testid="'receipt-allocate-' + row.original.id"
              @click="emit('allocate', '', row.original.id)"
            />
          </template>
          <template #empty>
            <UEmpty
              variant="naked"
              icon="i-carbon-currency-yen"
              title="暂无未核销收款"
              class="py-6"
            />
          </template>
        </ResizableTable>
      </UCard>

      <UCard class="rounded-sm" :ui="{ body: 'p-0 sm:p-0', header: 'p-3 sm:p-3' }">
        <template #header>
          <div class="flex flex-wrap items-center justify-between gap-2">
            <p class="text-sm font-medium text-highlighted">
              销售贷项与退货
            </p>
            <span class="text-xs text-muted">已确认退货形成的关联贷项</span>
          </div>
        </template>
        <ResizableTable
          :data="availableCredits"
          :columns="creditColumns"
          class="nx-table"
          :ui="{ th: 'py-2.5', td: 'py-3' }"
          data-testid="receivable-credit-table"
        >
          <template #status-cell="{ row }">
            <UBadge
              :color="salesCreditStatusColors[row.original.status]"
              variant="subtle"
              size="sm"
              :label="salesCreditStatusLabels[row.original.status]"
            />
          </template>
          <template #available-cell="{ row }">
            <span class="font-medium text-success">{{ formatMoney(receivables.creditAvailableOf(row.original)) }}</span>
          </template>
          <template #actions-cell="{ row }">
            <UButton
              label="查看"
              color="neutral"
              variant="ghost"
              size="xs"
              :data-testid="'credit-open-' + row.original.id"
              @click="emit('openCredit', row.original.id)"
            />
          </template>
          <template #empty>
            <UEmpty
              variant="naked"
              icon="i-carbon-checkmark-filled"
              title="暂无可用销售贷项"
              class="py-6"
            />
          </template>
        </ResizableTable>
      </UCard>
    </div>

    <UCard class="rounded-sm" :ui="{ body: 'p-0 sm:p-0', header: 'p-3 sm:p-3' }">
      <template #header>
        <div class="flex flex-wrap items-center justify-between gap-2">
          <p class="text-sm font-medium text-highlighted">
            逾期发票
          </p>
          <span class="text-xs text-muted">按到期日升序，共 {{ overdueInvoices.length }} 张</span>
        </div>
      </template>
      <ResizableTable
        :data="overdueInvoices"
        :columns="overdueColumns"
        class="nx-table"
        :ui="{ th: 'py-2.5', td: 'py-3' }"
        data-testid="receivable-overdue-table"
      >
        <template #days-cell="{ row }">
          <span class="text-error">{{ daysOverdue(row.original.dueAt) }} 天</span>
        </template>
        <template #amount-cell="{ row }">
          {{ formatMoney(receivables.outstandingOf(row.original)) }}
        </template>
        <template #empty>
          <UEmpty
            variant="naked"
            icon="i-carbon-checkmark-filled"
            title="暂无逾期发票"
            class="py-6"
          />
        </template>
      </ResizableTable>
    </UCard>

    <UCard class="rounded-sm" :ui="{ body: 'p-0 sm:p-0', header: 'p-3 sm:p-3' }">
      <template #header>
        <div class="flex flex-wrap items-center justify-between gap-2">
          <p class="text-sm font-medium text-highlighted">
            待开票单据
          </p>
          <span class="text-xs text-muted">已履约或已关闭的销售订单，可直接生成草稿发票（本地演示）</span>
        </div>
      </template>
      <ResizableTable
        :data="pendingInvoiceOrders"
        :columns="orderColumns"
        class="nx-table"
        :ui="{ th: 'py-2.5', td: 'py-3' }"
        data-testid="receivable-pending-table"
      >
        <template #status-cell="{ row }">
          <UBadge
            :color="salesStatusColors[row.original.status]"
            variant="subtle"
            size="sm"
            :label="salesStatusLabels[row.original.status]"
          />
        </template>
        <template #amount-cell="{ row }">
          {{ formatMoney(Number(row.original.totalAmount)) }}
        </template>
        <template #empty>
          <UEmpty
            variant="naked"
            icon="i-carbon-checkmark-filled"
            title="暂无待开票单据"
            class="py-6"
          />
        </template>
      </ResizableTable>
      <div v-if="pendingInvoiceOrders.length" class="flex flex-wrap gap-2 border-t border-default px-3 py-2.5">
        <UButton
          v-for="order in pendingInvoiceOrders"
          :key="order.id"
          :label="'为 ' + order.id + ' 开票'"
          icon="i-carbon-document-add"
          color="neutral"
          variant="outline"
          size="xs"
          :disabled="!canCreate"
          data-testid="receivable-generate-invoice"
          @click="emit('createInvoice', order.id)"
        />
      </div>
    </UCard>

    <UCard class="rounded-sm" :ui="{ body: 'p-0 sm:p-0', header: 'p-3 sm:p-3' }">
      <template #header>
        <div class="flex flex-wrap items-center justify-between gap-2">
          <p class="text-sm font-medium text-highlighted">
            未收款发票
          </p>
          <span class="text-xs text-muted">点击行内「查看」打开发票详情与寄送记录</span>
        </div>
      </template>
      <ResizableTable
        :data="receivableInvoices"
        :columns="overdueColumns"
        class="nx-table"
        :ui="{ th: 'py-2.5', td: 'py-3' }"
        data-testid="receivable-invoice-table"
      >
        <template #days-cell="{ row }">
          <UBadge
            v-if="row.original.status === 'overdue'"
            color="error"
            variant="subtle"
            size="sm"
            :label="'逾期 ' + daysOverdue(row.original.dueAt) + ' 天'"
          />
          <span v-else class="text-xs text-muted">未到期</span>
        </template>
        <template #amount-cell="{ row }">
          {{ formatMoney(receivables.outstandingOf(row.original)) }}
        </template>
        <template #empty>
          <UEmpty
            variant="naked"
            icon="i-carbon-document"
            title="暂无未收款发票"
            class="py-6"
          />
        </template>
      </ResizableTable>
      <div v-if="receivableInvoices.length" class="flex flex-wrap gap-2 border-t border-default px-3 py-2.5">
        <UButton
          v-for="invoice in receivableInvoices"
          :key="invoice.id"
          :label="invoice.id"
          icon="i-carbon-arrow-right"
          color="neutral"
          variant="ghost"
          size="xs"
          data-testid="receivable-open-invoice"
          @click="emit('openInvoice', invoice.id)"
        />
        <UButton
          v-for="invoice in receivableInvoices"
          :key="'allocate-' + invoice.id"
          :label="'核销 ' + invoice.id"
          icon="i-carbon-connect"
          color="primary"
          variant="soft"
          size="xs"
          :disabled="!canCreate"
          :data-testid="'receivable-allocate-' + invoice.id"
          @click="emit('allocate', invoice.id)"
        />
      </div>
    </UCard>
  </div>
</template>

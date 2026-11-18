<script setup lang="ts">
import { bankAccounts, salesCreditStatusColors, salesCreditStatusLabels } from '~/mocks'

const props = defineProps<{
  creditId?: string | null
}>()

const emit = defineEmits<{
  refund: [payload: {
    creditId: string
    amount: number
    refundedAt: string
    bankAccountId: string
    bankName: string
    reference: string
  }]
  openInvoice: [invoiceId: string]
}>()

const open = defineModel<boolean>('open', { default: false })
const receivables = useReceivablesStore()
const defaultDate = '2026-11-18'
const banks = bankAccounts.filter(account => account.status === 'active')
const bankOptions = banks.map(account => ({ label: account.bankName + ' · ' + account.accountNo, value: account.id }))

const credit = computed(() => props.creditId
  ? receivables.credits.find(row => row.id === props.creditId) ?? null
  : null)
const invoice = computed(() => credit.value ? receivables.invoiceById(credit.value.invoiceId) : null)
const allocated = computed(() => credit.value ? receivables.creditAllocatedOf(credit.value.id) : 0)
const refunded = computed(() => credit.value ? receivables.creditRefundedOf(credit.value.id) : 0)
const available = computed(() => credit.value ? receivables.creditAvailableOf(credit.value) : 0)
const creditAllocations = computed(() => credit.value
  ? receivables.allocations.filter(row => row.creditId === credit.value?.id)
  : [])
const creditRefunds = computed(() => credit.value
  ? receivables.refunds.filter(row => row.creditId === credit.value?.id)
  : [])

const form = reactive({
  amount: '',
  refundedAt: defaultDate,
  bankAccountId: banks[0]?.id ?? '',
  reference: ''
})
const formError = ref('')

function reset() {
  formError.value = ''
  form.amount = available.value > 0 ? available.value.toFixed(2) : ''
  form.refundedAt = defaultDate
  form.bankAccountId = banks[0]?.id ?? ''
  form.reference = '销售退货退款'
}

watch(open, (value) => {
  if (value) reset()
}, { immediate: true })

function submit() {
  formError.value = ''
  if (!credit.value) {
    formError.value = '未找到销售贷项。'
    return
  }
  if (credit.value.status === 'refunded' || available.value <= 0) {
    formError.value = '该贷项已无可退金额。'
    return
  }
  const amount = Number(form.amount)
  if (!Number.isFinite(amount) || amount <= 0) {
    formError.value = '退款金额必须大于 0。'
    return
  }
  if (amount > available.value + 0.005) {
    formError.value = '退款金额不能超过可退金额 ¥' + available.value.toFixed(2) + '。'
    return
  }
  const bank = banks.find(account => account.id === form.bankAccountId)
  if (!bank) {
    formError.value = '请选择退款资金账户。'
    return
  }
  emit('refund', {
    creditId: credit.value.id,
    amount,
    refundedAt: form.refundedAt,
    bankAccountId: bank.id,
    bankName: bank.bankName,
    reference: form.reference.trim() || '销售退货退款'
  })
}
</script>

<template>
  <USlideover v-model:open="open" :ui="{ content: 'w-full sm:max-w-xl' }" data-testid="credit-detail">
    <template #header>
      <div class="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p class="font-mono text-xs text-muted">
            {{ credit?.id }}
          </p>
          <h2 class="mt-1 text-base font-semibold text-highlighted">
            {{ credit?.customerName || '销售贷项' }}
          </h2>
          <p class="mt-0.5 text-xs text-muted">
            已确认销售退货生成的关联贷项
          </p>
        </div>
        <UBadge
          v-if="credit"
          :color="salesCreditStatusColors[credit.status]"
          variant="subtle"
          size="sm"
          :label="salesCreditStatusLabels[credit.status]"
          data-testid="credit-status"
        />
      </div>
    </template>

    <template #body>
      <div v-if="credit" class="space-y-4">
        <dl class="grid grid-cols-2 gap-x-4 gap-y-2 text-[13px] sm:grid-cols-3">
          <div>
            <dt class="text-xs text-muted">
              关联发票
            </dt>
            <dd class="mt-0.5">
              <UButton
                :label="credit.invoiceId"
                color="primary"
                variant="link"
                size="xs"
                class="px-0 font-mono"
                data-testid="credit-invoice-link"
                @click="emit('openInvoice', credit.invoiceId)"
              />
            </dd>
          </div>
          <div>
            <dt class="text-xs text-muted">
              来源订单
            </dt>
            <dd class="mt-0.5 font-mono text-[12px] text-default">
              {{ credit.orderId }}
            </dd>
          </div>
          <div>
            <dt class="text-xs text-muted">
              来源发货
            </dt>
            <dd class="mt-0.5 font-mono text-[12px] text-default">
              {{ credit.fulfillmentId }} · 行 {{ credit.lineNo }}
            </dd>
          </div>
          <div>
            <dt class="text-xs text-muted">
              退货商品
            </dt>
            <dd class="mt-0.5 text-default">
              {{ credit.name }} × {{ credit.quantity }}
            </dd>
          </div>
          <div>
            <dt class="text-xs text-muted">
              价税合计
            </dt>
            <dd class="mt-0.5 tabular-nums text-default">
              {{ formatMoney(Number(credit.total)) }}
            </dd>
          </div>
          <div>
            <dt class="text-xs text-muted">
              确认日期
            </dt>
            <dd class="mt-0.5 tabular-nums text-default">
              {{ credit.confirmedAt }}
            </dd>
          </div>
        </dl>

        <div class="rounded-sm border border-default bg-elevated/40 p-3 text-xs text-muted">
          {{ credit.reason }}
        </div>

        <div class="grid gap-3 sm:grid-cols-3">
          <div class="rounded-sm border border-default p-3">
            <p class="text-xs text-muted">
              贷项金额
            </p>
            <p class="mt-1 text-lg font-semibold tabular-nums text-highlighted">
              {{ formatMoney(Number(credit.total)) }}
            </p>
          </div>
          <div class="rounded-sm border border-default p-3">
            <p class="text-xs text-muted">
              已核销
            </p>
            <p class="mt-1 text-lg font-semibold tabular-nums text-highlighted">
              {{ formatMoney(allocated) }}
            </p>
          </div>
          <div class="rounded-sm border border-primary/40 bg-primary/5 p-3" data-testid="credit-available">
            <p class="text-xs text-muted">
              待退款
            </p>
            <p class="mt-1 text-lg font-semibold tabular-nums text-primary">
              {{ formatMoney(available) }}
            </p>
          </div>
        </div>

        <UCard class="rounded-sm" :ui="{ body: 'p-0 sm:p-0', header: 'p-3 sm:p-3' }">
          <template #header>
            <p class="text-sm font-medium text-highlighted">
              关联记录
            </p>
          </template>
          <div class="space-y-2 p-3" data-testid="credit-links">
            <p class="text-xs text-muted">
              发票 {{ credit.invoiceId }} · 订单 {{ credit.orderId }} · 发货 {{ credit.fulfillmentId }}
            </p>
            <div v-if="creditAllocations.length" class="space-y-1">
              <p
                v-for="row in creditAllocations"
                :key="row.id"
                class="text-xs text-default"
                data-testid="credit-allocation-row"
              >
                核销 {{ row.invoiceId }} · {{ formatMoney(Number(row.amount)) }} · {{ row.at }}
              </p>
            </div>
            <p v-else class="text-xs text-muted">
              暂无核销记录。
            </p>
            <div v-if="creditRefunds.length" class="space-y-1">
              <p
                v-for="row in creditRefunds"
                :key="row.id"
                class="text-xs text-success"
                data-testid="credit-refund-row"
              >
                退款 {{ row.id }} · {{ formatMoney(Number(row.amount)) }} · {{ row.bankName }} · {{ row.refundedAt }}
              </p>
            </div>
          </div>
        </UCard>

        <UAlert
          v-if="credit.status === 'refunded'"
          color="success"
          variant="soft"
          icon="i-carbon-checkmark"
          title="该贷项已完成退款"
          :description="'已退款 ' + formatMoney(refunded) + '，不可重复退款。'"
        />

        <div v-else class="space-y-3 rounded-sm border border-default p-3" data-testid="credit-refund-form">
          <p class="text-sm font-medium text-highlighted">
            客户退款
          </p>
          <div class="grid gap-3 sm:grid-cols-2">
            <UFormField label="退款金额" required>
              <UInput
                v-model="form.amount"
                type="number"
                min="0"
                step="0.01"
                class="w-full"
                data-testid="credit-refund-amount"
              />
            </UFormField>
            <UFormField label="退款日期" required>
              <UInput
                v-model="form.refundedAt"
                type="date"
                class="w-full"
                data-testid="credit-refund-date"
              />
            </UFormField>
          </div>
          <UFormField label="退款账户" required>
            <USelect
              v-model="form.bankAccountId"
              :items="bankOptions"
              class="w-full"
              data-testid="credit-refund-bank"
            />
          </UFormField>
          <UFormField label="退款参考号">
            <UInput
              v-model="form.reference"
              class="w-full"
              data-testid="credit-refund-reference"
            />
          </UFormField>
          <UAlert
            v-if="formError"
            color="error"
            variant="soft"
            icon="i-carbon-warning-alt"
            :description="formError"
            data-testid="credit-refund-error"
          />
        </div>

        <p v-if="invoice" class="text-xs text-muted">
          发票当前未结 {{ formatMoney(receivables.outstandingOf(invoice)) }}，退款操作不会改变已开票金额。
        </p>
      </div>
    </template>

    <template #footer>
      <div class="flex w-full items-center justify-between gap-2">
        <p class="text-xs text-muted">
          纯 UI 演示：退款只写本地台账。
        </p>
        <div class="flex items-center gap-2">
          <UButton
            label="关闭"
            color="neutral"
            variant="ghost"
            data-testid="credit-close"
            @click="open = false"
          />
          <UButton
            v-if="credit && credit.status !== 'refunded'"
            label="确认退款"
            icon="i-carbon-currency-yen"
            :disabled="available <= 0"
            data-testid="credit-refund"
            @click="submit"
          />
        </div>
      </div>
    </template>
  </USlideover>
</template>

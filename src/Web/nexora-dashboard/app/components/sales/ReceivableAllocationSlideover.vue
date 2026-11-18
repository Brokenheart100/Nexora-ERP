<script setup lang="ts">
const props = defineProps<{
  invoiceId?: string | null
  receiptId?: string | null
}>()

const emit = defineEmits<{
  save: [payload: {
    invoiceId: string
    sourceType: 'receipt' | 'credit'
    sourceId: string
    amount: number
  }]
}>()

const open = defineModel<boolean>('open', { default: false })
const { workspace } = useMockWorkspace()
const receivables = useReceivablesStore()

const form = reactive({
  invoiceId: '',
  sourceType: 'receipt' as 'receipt' | 'credit',
  sourceId: '',
  amount: ''
})
const formError = ref('')

const invoiceOptions = computed(() => receivables.openInvoicesFor(workspace.value.id).map(invoice => ({
  label: invoice.id + ' · ' + invoice.customerName + ' · 未结 ' + formatMoney(receivables.outstandingOf(invoice)),
  value: invoice.id
})))

const selectedInvoice = computed(() => form.invoiceId ? receivables.invoiceById(form.invoiceId) : null)
const customerName = computed(() => selectedInvoice.value?.customerName ?? '')
const invoiceOutstanding = computed(() => receivables.outstandingOf(selectedInvoice.value))

const receiptOptions = computed(() => receivables.availableReceiptsFor(workspace.value.id, customerName.value)
  .map(receipt => ({
    label: receipt.id + ' · ' + receipt.bankName + ' · 可用 ' + formatMoney(receivables.receiptAvailableOf(receipt)),
    value: receipt.id
  })))

const creditOptions = computed(() => receivables.credits
  .filter(credit => credit.workspaceId === workspace.value.id
    && credit.customerName === customerName.value
    && receivables.creditAvailableOf(credit) > 0.005)
  .map(credit => ({
    label: credit.id + ' · ' + credit.name + ' · 可用 ' + formatMoney(receivables.creditAvailableOf(credit)),
    value: credit.id
  })))

const sourceOptions = computed(() => form.sourceType === 'receipt' ? receiptOptions.value : creditOptions.value)

const sourceAvailable = computed(() => {
  if (form.sourceType === 'receipt') {
    const receipt = receivables.receipts.find(row => row.id === form.sourceId)
    return receipt ? receivables.receiptAvailableOf(receipt) : 0
  }
  const credit = receivables.credits.find(row => row.id === form.sourceId)
  return credit ? receivables.creditAvailableOf(credit) : 0
})

const maxAmount = computed(() => Math.max(0, Math.min(invoiceOutstanding.value, sourceAvailable.value)))

function reset() {
  formError.value = ''
  const preferred = props.invoiceId && receivables.invoiceById(props.invoiceId)
    ? props.invoiceId
    : invoiceOptions.value[0]?.value ?? ''
  form.invoiceId = preferred
  form.sourceType = 'receipt'
  form.sourceId = props.receiptId || receiptOptions.value[0]?.value || ''
  form.amount = maxAmount.value ? maxAmount.value.toFixed(2) : ''
}

watch(open, (value) => {
  if (value) reset()
}, { immediate: true })

watch(() => form.invoiceId, () => {
  formError.value = ''
  const options = form.sourceType === 'receipt' ? receiptOptions.value : creditOptions.value
  if (!options.some(option => option.value === form.sourceId)) form.sourceId = options[0]?.value ?? ''
  form.amount = maxAmount.value ? maxAmount.value.toFixed(2) : ''
})

watch(() => form.sourceType, () => {
  formError.value = ''
  form.sourceId = sourceOptions.value[0]?.value ?? ''
  form.amount = maxAmount.value ? maxAmount.value.toFixed(2) : ''
})

function submit() {
  formError.value = ''
  const invoice = selectedInvoice.value
  if (!invoice) {
    formError.value = '请选择未结发票。'
    return
  }
  if (!form.sourceId) {
    formError.value = form.sourceType === 'receipt' ? '请选择客户收款单。' : '请选择销售贷项。'
    return
  }
  const amount = Number(form.amount)
  if (!Number.isFinite(amount) || amount <= 0) {
    formError.value = '核销金额必须大于 0。'
    return
  }
  if (amount > invoiceOutstanding.value + 0.005) {
    formError.value = '核销金额不能超过发票未结金额 ¥' + invoiceOutstanding.value.toFixed(2) + '。'
    return
  }
  if (amount > sourceAvailable.value + 0.005) {
    formError.value = '核销金额不能超过款项可用余额 ¥' + sourceAvailable.value.toFixed(2) + '。'
    return
  }
  emit('save', {
    invoiceId: form.invoiceId,
    sourceType: form.sourceType,
    sourceId: form.sourceId,
    amount
  })
}
</script>

<template>
  <USlideover v-model:open="open" :ui="{ content: 'w-full sm:max-w-lg' }" data-testid="allocate-form">
    <template #header>
      <div>
        <p class="text-xs text-muted">
          应收核销
        </p>
        <h2 class="mt-1 text-base font-semibold text-highlighted">
          {{ customerName || '选择客户与发票' }}
        </h2>
        <p class="mt-0.5 text-xs text-muted">
          同一客户的收款单或销售贷项，可用于核销一张未结发票。
        </p>
      </div>
    </template>

    <template #body>
      <div class="space-y-4">
        <UFormField label="未结发票" required>
          <USelect
            v-model="form.invoiceId"
            :items="invoiceOptions"
            class="w-full"
            placeholder="选择未结发票"
            data-testid="allocate-invoice"
          />
        </UFormField>

        <div class="grid gap-3 sm:grid-cols-2">
          <UFormField label="核销来源" required>
            <USelect
              v-model="form.sourceType"
              :items="[{ label: '客户收款单', value: 'receipt' }, { label: '销售贷项', value: 'credit' }]"
              class="w-full"
              data-testid="allocate-source-type"
            />
          </UFormField>
          <UFormField label="核销金额" required>
            <UInput
              v-model="form.amount"
              type="number"
              min="0"
              step="0.01"
              class="w-full"
              placeholder="0.00"
              data-testid="allocate-amount"
            />
          </UFormField>
        </div>

        <UFormField :label="form.sourceType === 'receipt' ? '客户收款单' : '销售贷项'" required>
          <USelect
            v-model="form.sourceId"
            :items="sourceOptions"
            class="w-full"
            :placeholder="form.sourceType === 'receipt' ? '选择可核销收款单' : '选择可核销贷项'"
            data-testid="allocate-source"
          />
        </UFormField>

        <div class="grid gap-3 sm:grid-cols-3">
          <div class="rounded-sm border border-default p-3" data-testid="allocate-outstanding">
            <p class="text-xs text-muted">
              发票未结
            </p>
            <p class="mt-1 text-lg font-semibold tabular-nums text-highlighted">
              {{ formatMoney(invoiceOutstanding) }}
            </p>
          </div>
          <div class="rounded-sm border border-default p-3" data-testid="allocate-available">
            <p class="text-xs text-muted">
              款项可用
            </p>
            <p class="mt-1 text-lg font-semibold tabular-nums text-highlighted">
              {{ formatMoney(sourceAvailable) }}
            </p>
          </div>
          <div class="rounded-sm border border-primary/40 bg-primary/5 p-3" data-testid="allocate-max">
            <p class="text-xs text-muted">
              本次上限
            </p>
            <p class="mt-1 text-lg font-semibold tabular-nums text-primary">
              {{ formatMoney(maxAmount) }}
            </p>
          </div>
        </div>

        <p class="text-xs text-muted">
          核销只减少本地台账的未结金额，不代表真实银行到账。超额时保存会被拒绝并提示可用上限。
        </p>

        <UAlert
          v-if="formError"
          color="error"
          variant="soft"
          icon="i-carbon-warning-alt"
          :description="formError"
          data-testid="allocate-error"
        />
      </div>
    </template>

    <template #footer>
      <div class="flex w-full items-center justify-end gap-2">
        <UButton
          label="取消"
          color="neutral"
          variant="ghost"
          data-testid="allocate-cancel"
          @click="open = false"
        />
        <UButton
          label="确认核销"
          icon="i-carbon-connect"
          data-testid="allocate-submit"
          @click="submit"
        />
      </div>
    </template>
  </USlideover>
</template>

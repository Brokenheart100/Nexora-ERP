<script setup lang="ts">
import { bankAccounts } from '~/mocks'

const props = defineProps<{
  customerName?: string
  invoiceId?: string | null
}>()

const emit = defineEmits<{
  save: [payload: {
    customerName: string
    amount: number
    receivedAt: string
    bankAccountId: string
    bankName: string
    reference: string
    note?: string
  }]
}>()

const open = defineModel<boolean>('open', { default: false })
const { workspace } = useMockWorkspace()
const receivables = useReceivablesStore()

const defaultDate = '2026-11-18'
const banks = bankAccounts.filter(account => account.status === 'active')
const bankOptions = banks.map(account => ({ label: account.bankName + ' · ' + account.accountNo, value: account.id }))
const customers = computed(() => Array.from(new Set(receivables.invoices
  .filter(invoice => invoice.workspaceId === workspace.value.id)
  .map(invoice => invoice.customerName))).sort((a, b) => a.localeCompare(b)))

const form = reactive({
  customerName: '',
  amount: '',
  receivedAt: defaultDate,
  bankAccountId: banks[0]?.id ?? '',
  reference: '',
  note: ''
})
const formError = ref('')

const selectedInvoice = computed(() => props.invoiceId ? receivables.invoiceById(props.invoiceId) : null)
const customerOutstanding = computed(() => {
  if (!form.customerName) return 0
  return receivables.openInvoicesFor(workspace.value.id, form.customerName)
    .reduce((sum, invoice) => sum + receivables.outstandingOf(invoice), 0)
})

function reset() {
  formError.value = ''
  form.customerName = props.customerName || customers.value[0] || ''
  form.receivedAt = defaultDate
  form.bankAccountId = banks[0]?.id ?? ''
  form.reference = ''
  form.note = ''
  form.amount = selectedInvoice.value ? receivables.outstandingOf(selectedInvoice.value).toFixed(2) : ''
}

watch(open, (value) => {
  if (value) reset()
}, { immediate: true })

function submit() {
  formError.value = ''
  if (!form.customerName) {
    formError.value = '请选择客户。'
    return
  }
  if (!form.receivedAt) {
    formError.value = '请选择收款日期。'
    return
  }
  const bank = banks.find(account => account.id === form.bankAccountId)
  if (!bank) {
    formError.value = '请选择资金账户。'
    return
  }
  const amount = Number(form.amount)
  if (!Number.isFinite(amount) || amount <= 0) {
    formError.value = '收款金额必须大于 0。'
    return
  }
  if (amount > customerOutstanding.value + 0.005) {
    formError.value = '收款金额不能超过该客户当前未结金额 ¥' + customerOutstanding.value.toFixed(2) + '。'
    return
  }
  emit('save', {
    customerName: form.customerName,
    amount,
    receivedAt: form.receivedAt,
    bankAccountId: bank.id,
    bankName: bank.bankName,
    reference: form.reference.trim() || '本地演示收款',
    ...(form.note.trim() ? { note: form.note.trim() } : {})
  })
}
</script>

<template>
  <USlideover v-model:open="open" :ui="{ content: 'w-full sm:max-w-lg' }" data-testid="receipt-form">
    <template #header>
      <div>
        <p class="text-xs text-muted">
          登记客户收款
        </p>
        <h2 class="mt-1 text-base font-semibold text-highlighted">
          {{ form.customerName || '选择客户' }}
        </h2>
        <p class="mt-0.5 text-xs text-muted">
          保存为独立收款单，核销前可在应收工作台看到可核销余额。
        </p>
      </div>
    </template>

    <template #body>
      <div class="space-y-4">
        <UAlert
          v-if="selectedInvoice"
          color="info"
          variant="soft"
          icon="i-carbon-document"
          :title="'关联发票 ' + selectedInvoice.id"
          :description="'价税合计 ' + formatMoney(Number(selectedInvoice.amount)) + '，当前未结 ' + formatMoney(receivables.outstandingOf(selectedInvoice)) + '。'"
          data-testid="receipt-invoice-hint"
        />

        <UFormField label="客户" required>
          <USelect
            v-model="form.customerName"
            :items="customers"
            class="w-full"
            placeholder="选择客户"
            data-testid="receipt-customer"
          />
        </UFormField>

        <div class="grid gap-3 sm:grid-cols-2">
          <UFormField label="收款金额" required>
            <UInput
              v-model="form.amount"
              type="number"
              min="0"
              step="0.01"
              class="w-full"
              placeholder="0.00"
              data-testid="receipt-amount"
            />
          </UFormField>
          <UFormField label="收款日期" required>
            <UInput
              v-model="form.receivedAt"
              type="date"
              class="w-full"
              data-testid="receipt-date"
            />
          </UFormField>
        </div>

        <UFormField label="资金账户" required>
          <USelect
            v-model="form.bankAccountId"
            :items="bankOptions"
            class="w-full"
            data-testid="receipt-bank"
          />
        </UFormField>

        <UFormField label="银行流水号 / 参考号">
          <UInput
            v-model="form.reference"
            class="w-full"
            placeholder="如 BANK-20261118-01"
            data-testid="receipt-reference"
          />
        </UFormField>

        <UFormField label="备注">
          <UTextarea
            v-model="form.note"
            :rows="2"
            class="w-full"
            placeholder="可记录回款渠道或沟通说明"
            data-testid="receipt-note"
          />
        </UFormField>

        <div class="rounded-sm border border-default bg-elevated/40 p-3 text-xs text-muted" data-testid="receipt-available">
          该客户当前未结 <span class="font-medium tabular-nums text-highlighted">{{ formatMoney(customerOutstanding) }}</span>。
          本次登记后，收款单可核销余额为收款金额减去已核销部分。
        </div>

        <UAlert
          v-if="formError"
          color="error"
          variant="soft"
          icon="i-carbon-warning-alt"
          :description="formError"
          data-testid="receipt-error"
        />
      </div>
    </template>

    <template #footer>
      <div class="flex w-full items-center justify-end gap-2">
        <UButton
          label="取消"
          color="neutral"
          variant="ghost"
          data-testid="receipt-cancel"
          @click="open = false"
        />
        <UButton
          label="保存收款单"
          icon="i-carbon-save"
          data-testid="receipt-submit"
          @click="submit"
        />
      </div>
    </template>
  </USlideover>
</template>

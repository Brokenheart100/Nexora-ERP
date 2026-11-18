<script setup lang="ts">
import type { PurchaseOrder } from '~/mocks'

interface ReceiptLineRow {
  lineNo: number
  sku: string
  name: string
  ordered: number
  received: number
  input: number
}

const props = defineProps<{ order: PurchaseOrder | null }>()
const emit = defineEmits<{
  confirm: [payload: { receiver: string, receivedAt: string, lines: { lineNo: number, quantity: number }[] }]
}>()

const open = defineModel<boolean>('open', { default: false })

const session = useSessionStore()
const receiver = ref('')
const receivedAt = ref('')
const rows = ref<ReceiptLineRow[]>([])
const errorMessage = ref('')
const { loading: submitting, run: runSubmit } = useMockAsync(async () => undefined, { delay: 700 })

function reset() {
  errorMessage.value = ''
  receiver.value = session.user.name
  receivedAt.value = new Date().toISOString().slice(0, 10)
  rows.value = (props.order?.lines ?? []).map(line => ({
    lineNo: line.lineNo,
    sku: line.sku,
    name: line.name,
    ordered: line.quantity,
    received: line.received,
    input: Math.max(line.quantity - line.received, 0)
  }))
}

watch(open, (value) => {
  if (value) reset()
}, { immediate: true })

const allReceived = computed(() => (props.order?.lines ?? []).every(line => line.received >= line.quantity))
const totalInput = computed(() => rows.value.reduce((sum, row) => sum + (Number(row.input) || 0), 0))

function remaining(row: ReceiptLineRow) {
  return Math.max(row.ordered - row.received, 0)
}

function updateInput(row: ReceiptLineRow, value: string | number) {
  const parsed = typeof value === 'number' ? value : Number(value)
  row.input = Number.isFinite(parsed) ? Math.max(parsed, 0) : 0
  errorMessage.value = ''
}

function fillRemaining(row: ReceiptLineRow) {
  row.input = remaining(row)
  errorMessage.value = ''
}

async function submit() {
  if (receiver.value.trim().length === 0) {
    errorMessage.value = '请填写收货人'
    return
  }
  if (!receivedAt.value) {
    errorMessage.value = '请选择收货日期'
    return
  }
  const lines = rows.value
    .filter(row => Number(row.input) > 0)
    .map(row => ({ lineNo: row.lineNo, quantity: Number(row.input) }))
  if (lines.length === 0) {
    errorMessage.value = '请至少填写一行收货数量'
    return
  }
  const over = rows.value.find(row => (Number(row.input) || 0) > remaining(row))
  if (over) {
    errorMessage.value = '第 ' + over.lineNo + ' 行超出待收数量（最多 ' + remaining(over) + '）'
    return
  }
  await runSubmit()
  emit('confirm', { receiver: receiver.value.trim(), receivedAt: receivedAt.value, lines })
  open.value = false
}
</script>

<template>
  <USlideover v-model:open="open" :ui="{ content: 'w-full sm:max-w-2xl' }" data-testid="receipt-form">
    <template #header>
      <div>
        <p class="text-xs text-muted">
          收货登记
        </p>
        <h2 class="mt-1 text-base font-semibold text-highlighted">
          {{ order?.id ?? '—' }} · {{ order?.supplier ?? '' }}
        </h2>
        <p class="mt-0.5 text-xs text-muted">
          纯 UI 演示：确认后登记本地收货单并推进订单状态，刷新页面恢复初始数据。
        </p>
      </div>
    </template>

    <template #body>
      <div class="space-y-4">
        <UAlert
          v-if="allReceived"
          color="success"
          variant="soft"
          icon="i-carbon-checkmark-filled"
          title="该订单明细已全部收货"
          description="无需再次登记收货。"
          data-testid="receipt-all-received"
        />

        <template v-else>
          <UAlert
            v-if="errorMessage"
            color="error"
            variant="soft"
            icon="i-carbon-warning-alt"
            :title="errorMessage"
            data-testid="receipt-error"
          />

          <div class="grid gap-3 sm:grid-cols-2">
            <UFormField label="收货人" required>
              <UInput
                v-model="receiver"
                placeholder="收货人姓名"
                class="w-full"
                data-testid="receipt-receiver"
              />
            </UFormField>
            <UFormField label="收货日期" required>
              <UInput
                v-model="receivedAt"
                type="date"
                class="w-full"
                data-testid="receipt-received-at"
              />
            </UFormField>
          </div>

          <div class="space-y-2">
            <div
              v-for="row in rows"
              :key="row.lineNo"
              class="rounded-sm border border-default p-2.5"
              data-testid="receipt-line"
            >
              <div class="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p class="text-sm font-medium text-highlighted">
                    {{ row.name }}
                  </p>
                  <p class="mt-0.5 text-xs text-muted">
                    {{ row.sku }} · 订购 {{ row.ordered }} · 已收 {{ row.received }} · 待收 {{ remaining(row) }}
                  </p>
                </div>
                <div class="flex items-center gap-2">
                  <UInput
                    :model-value="row.input"
                    type="number"
                    min="0"
                    :max="remaining(row)"
                    class="w-24"
                    data-testid="receipt-qty"
                    @update:model-value="value => updateInput(row, value)"
                  />
                  <UButton
                    label="收满"
                    color="neutral"
                    variant="ghost"
                    size="xs"
                    data-testid="receipt-fill-max"
                    @click="fillRemaining(row)"
                  />
                </div>
              </div>
              <p
                v-if="(Number(row.input) || 0) > remaining(row)"
                class="mt-1 text-xs text-error"
                data-testid="receipt-over"
              >
                超出待收数量：本行最多可收 {{ remaining(row) }} 件。
              </p>
            </div>
          </div>

          <div class="flex flex-wrap items-center justify-between gap-2 rounded-sm bg-elevated/60 px-3 py-2 text-[13px]">
            <span class="text-muted">本次收货合计</span>
            <span class="font-semibold tabular-nums text-highlighted">
              {{ totalInput }} 件
            </span>
          </div>

          <p class="text-xs text-muted">
            提示：可只填写部分行，订单将推进为「部分收货」；全部明细收满后自动推进为「已收货」。
          </p>
        </template>
      </div>
    </template>

    <template #footer>
      <div class="flex w-full items-center justify-between gap-2">
        <UButton
          label="取消"
          color="neutral"
          variant="ghost"
          data-testid="receipt-cancel"
          @click="open = false"
        />
        <UButton
          label="确认收货"
          icon="i-carbon-inventory-management"
          :loading="submitting"
          :disabled="allReceived"
          data-testid="receipt-submit"
          @click="submit"
        />
      </div>
    </template>
  </USlideover>
</template>

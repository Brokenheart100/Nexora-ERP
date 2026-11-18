<script setup lang="ts">
import type { PurchaseOrder, Warehouse } from '~/mocks'

interface ReceiveRow {
  lineNo: number
  sku: string
  name: string
  remaining: number
  input: number
}

const props = defineProps<{
  orders: PurchaseOrder[]
  warehouses: Warehouse[]
  defaultWarehouseId?: string
}>()

const emit = defineEmits<{
  confirm: [payload: {
    purchaseOrderId: string
    warehouseId: string
    receiver: string
    receivedAt: string
    lines: { lineNo: number, sku: string, name: string, quantity: number }[]
  }]
}>()

const open = defineModel<boolean>('open', { default: false })
const session = useSessionStore()
const { loading: submitting, run: runSubmit } = useMockAsync(async () => undefined, { delay: 700 })

const orderId = ref('')
const warehouseId = ref('')
const receiver = ref('')
const receivedAt = ref('')
const rows = ref<ReceiveRow[]>([])
const errorMessage = ref('')

const orderItems = computed(() => props.orders.map(order => ({
  label: order.id + ' · ' + order.supplier,
  value: order.id
})))
const warehouseItems = computed(() => props.warehouses.map(warehouse => ({
  label: warehouse.name,
  value: warehouse.id
})))
const selectedOrder = computed(() => props.orders.find(order => order.id === orderId.value) ?? null)
const totalInput = computed(() => rows.value.reduce((sum, row) => sum + (Number(row.input) || 0), 0))

function remainingOf(order: PurchaseOrder, line: PurchaseOrder['lines'][number]) {
  return Math.max(line.quantity - line.received, 0)
}

function today() {
  return new Date().toISOString().slice(0, 10)
}

function syncRows() {
  const order = selectedOrder.value
  if (!order) {
    rows.value = []
    return
  }
  rows.value = order.lines
    .map((line) => {
      const remaining = remainingOf(order, line)
      return { lineNo: line.lineNo, sku: line.sku, name: line.name, remaining, input: remaining }
    })
    .filter(row => row.remaining > 0)
}

function reset() {
  errorMessage.value = ''
  receiver.value = session.user.name
  receivedAt.value = today()
  warehouseId.value = props.defaultWarehouseId
    ?? props.warehouses.find(warehouse => warehouse.status === 'active')?.id
    ?? props.warehouses[0]?.id
    ?? ''
  orderId.value = props.orders[0]?.id ?? ''
  syncRows()
}

watch(open, (value) => {
  if (value) reset()
}, { immediate: true })
watch(orderId, () => {
  errorMessage.value = ''
  syncRows()
})

function fillRemaining(row: ReceiveRow) {
  row.input = row.remaining
}
function fillAllRemaining() {
  rows.value.forEach((row) => {
    row.input = row.remaining
  })
  errorMessage.value = ''
}
function updateInput(row: ReceiveRow, value: string | number) {
  const parsed = typeof value === 'number' ? value : Number(value)
  row.input = Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0
  errorMessage.value = ''
}

async function submit() {
  const order = selectedOrder.value
  if (!order) {
    errorMessage.value = '请选择采购单'
    return
  }
  if (!warehouseId.value) {
    errorMessage.value = '请选择入库仓库'
    return
  }
  if (!receiver.value.trim()) {
    errorMessage.value = '请填写收货人'
    return
  }
  if (!receivedAt.value) {
    errorMessage.value = '请选择收货日期'
    return
  }
  const lines = rows.value
    .filter(row => Number(row.input) > 0)
    .map(row => ({ lineNo: row.lineNo, sku: row.sku, name: row.name, quantity: Number(row.input) }))
  if (!lines.length) {
    errorMessage.value = '请至少填写一行收货数量'
    return
  }
  const overLine = rows.value.find(row => Number(row.input) > row.remaining)
  if (overLine) {
    errorMessage.value = '第 ' + overLine.lineNo + ' 行超出待收数量（最多 ' + overLine.remaining + '）'
    return
  }
  await runSubmit()
  emit('confirm', {
    purchaseOrderId: order.id,
    warehouseId: warehouseId.value,
    receiver: receiver.value.trim(),
    receivedAt: receivedAt.value,
    lines
  })
  open.value = false
}
</script>

<template>
  <USlideover
    v-model:open="open"
    :ui="{ content: 'w-full sm:max-w-2xl' }"
    data-testid="inventory-receive-form"
  >
    <template #header>
      <div>
        <p class="text-sm font-semibold text-highlighted">
          收货入库
        </p>
        <p class="mt-0.5 text-xs text-muted">
          从采购单带入待收数量，确认后更新库存位置并生成入库流水
        </p>
      </div>
    </template>

    <template #body>
      <div class="space-y-4">
        <UFormField label="采购单" required>
          <USelect
            v-model="orderId"
            :items="orderItems"
            placeholder="选择待收货的采购单"
            class="w-full"
            data-testid="inventory-receive-order"
          />
        </UFormField>

        <div class="grid gap-3 sm:grid-cols-3">
          <UFormField label="入库仓库" required>
            <USelect
              v-model="warehouseId"
              :items="warehouseItems"
              class="w-full"
              data-testid="inventory-receive-warehouse"
            />
          </UFormField>
          <UFormField label="收货人" required>
            <UInput
              v-model="receiver"
              placeholder="填写收货人"
              class="w-full"
              data-testid="inventory-receive-receiver"
            />
          </UFormField>
          <UFormField label="收货日期" required>
            <UInput
              v-model="receivedAt"
              type="date"
              class="w-full"
              data-testid="inventory-receive-date"
            />
          </UFormField>
        </div>

        <div class="flex items-center justify-between gap-2 border-b border-default pb-2">
          <div class="flex items-center gap-2">
            <p class="text-sm font-medium text-highlighted">
              待收明细
            </p>
            <UBadge variant="subtle" color="neutral" size="sm">
              {{ rows.length }} 行
            </UBadge>
          </div>
          <UButton
            label="全部收满"
            icon="i-carbon-checkmark"
            color="neutral"
            variant="ghost"
            size="xs"
            data-testid="inventory-receive-fill-all"
            @click="fillAllRemaining"
          />
        </div>

        <div v-if="!rows.length" class="rounded-sm border border-default px-3 py-6 text-center text-xs text-muted">
          该采购单已全部收货，没有待收明细
        </div>
        <div v-else class="space-y-2">
          <div
            v-for="row in rows"
            :key="row.lineNo"
            class="flex items-center justify-between gap-3 rounded-sm border border-default p-2.5"
            data-testid="inventory-receive-line"
          >
            <div class="min-w-0">
              <p class="truncate text-sm text-default">
                {{ row.name }}
              </p>
              <p class="mt-0.5 font-mono text-[11px] text-muted">
                {{ row.sku }} · 待收 {{ formatNumber(row.remaining) }}
              </p>
            </div>
            <div class="flex shrink-0 items-center gap-2">
              <UInput
                :model-value="row.input"
                type="number"
                :min="0"
                :max="row.remaining"
                class="w-24"
                data-testid="inventory-receive-qty"
                @update:model-value="updateInput(row, $event)"
              />
              <UButton
                label="收满"
                color="neutral"
                variant="outline"
                size="xs"
                data-testid="inventory-receive-fill"
                @click="fillRemaining(row)"
              />
            </div>
          </div>
        </div>

        <UAlert
          v-if="errorMessage"
          color="error"
          variant="soft"
          icon="i-carbon-warning"
          :description="errorMessage"
          data-testid="inventory-receive-error"
        />

        <div class="flex items-center justify-between rounded-sm bg-elevated/60 px-3 py-2 text-sm">
          <span class="text-muted">本次收货合计</span>
          <span class="tabular-nums font-semibold text-highlighted">{{ formatNumber(totalInput) }} 件</span>
        </div>
        <p class="text-xs text-muted">
          确认后仅更新本次预览的本地库存，刷新页面恢复初始数据。
        </p>
      </div>
    </template>

    <template #footer>
      <div class="flex w-full items-center justify-end gap-2">
        <UButton
          label="取消"
          color="neutral"
          variant="ghost"
          :disabled="submitting"
          data-testid="inventory-receive-cancel"
          @click="open = false"
        />
        <UButton
          label="确认收货"
          icon="i-carbon-inventory-management"
          :loading="submitting"
          data-testid="inventory-receive-submit"
          @click="submit"
        />
      </div>
    </template>
  </USlideover>
</template>

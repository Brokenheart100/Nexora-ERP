<script setup lang="ts">
import type { InventoryPosition, SalesOrder, Warehouse } from '~/mocks'

interface IssueRow {
  lineNo: number
  sku: string
  name: string
  remaining: number
  input: number
}

const props = defineProps<{
  orders: SalesOrder[]
  warehouses: Warehouse[]
  positions: InventoryPosition[]
  defaultWarehouseId?: string
}>()

const emit = defineEmits<{
  confirm: [payload: {
    salesOrderId: string
    warehouseId: string
    shipper: string
    shippedAt: string
    lines: { lineNo: number, sku: string, name: string, quantity: number }[]
  }]
}>()

const open = defineModel<boolean>('open', { default: false })
const session = useSessionStore()
const { loading: submitting, run: runSubmit } = useMockAsync(async () => undefined, { delay: 700 })

const orderId = ref('')
const warehouseId = ref('')
const shipper = ref('')
const shippedAt = ref('')
const rows = ref<IssueRow[]>([])
const errorMessage = ref('')

const orderItems = computed(() => props.orders.map(order => ({
  label: order.id + ' · ' + order.customerName,
  value: order.id
})))
const warehouseItems = computed(() => props.warehouses.map(warehouse => ({
  label: warehouse.name,
  value: warehouse.id
})))
const selectedOrder = computed(() => props.orders.find(order => order.id === orderId.value) ?? null)
const totalInput = computed(() => rows.value.reduce((sum, row) => sum + (Number(row.input) || 0), 0))

function remainingOf(order: SalesOrder, line: SalesOrder['lines'][number]) {
  return Math.max(line.quantity - line.shipped, 0)
}

function availableOf(sku: string) {
  return props.positions
    .filter(position => position.warehouseId === warehouseId.value && position.sku === sku)
    .reduce((sum, position) => sum + position.available, 0)
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
  shipper.value = session.user.name
  shippedAt.value = today()
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
watch(warehouseId, () => {
  errorMessage.value = ''
})

function updateInput(row: IssueRow, value: string | number) {
  const parsed = typeof value === 'number' ? value : Number(value)
  row.input = Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0
  errorMessage.value = ''
}

function fillAvailable(row: IssueRow) {
  row.input = Math.min(row.remaining, availableOf(row.sku))
}

async function submit() {
  const order = selectedOrder.value
  if (!order) {
    errorMessage.value = '请选择销售单'
    return
  }
  if (!warehouseId.value) {
    errorMessage.value = '请选择出库仓库'
    return
  }
  if (!shipper.value.trim()) {
    errorMessage.value = '请填写出库人'
    return
  }
  if (!shippedAt.value) {
    errorMessage.value = '请选择出库日期'
    return
  }
  const lines = rows.value
    .filter(row => Number(row.input) > 0)
    .map(row => ({ lineNo: row.lineNo, sku: row.sku, name: row.name, quantity: Number(row.input) }))
  if (!lines.length) {
    errorMessage.value = '请至少填写一行出库数量'
    return
  }
  const overLine = rows.value.find(row => Number(row.input) > row.remaining)
  if (overLine) {
    errorMessage.value = '第 ' + overLine.lineNo + ' 行超出待发数量（最多 ' + overLine.remaining + '）'
    return
  }
  const shortageLine = rows.value.find(row => Number(row.input) > availableOf(row.sku))
  if (shortageLine) {
    errorMessage.value = '第 ' + shortageLine.lineNo + ' 行超出该仓可用库存（可用 ' + availableOf(shortageLine.sku) + '）'
    return
  }
  await runSubmit()
  emit('confirm', {
    salesOrderId: order.id,
    warehouseId: warehouseId.value,
    shipper: shipper.value.trim(),
    shippedAt: shippedAt.value,
    lines
  })
  open.value = false
}
</script>

<template>
  <USlideover
    v-model:open="open"
    :ui="{ content: 'w-full sm:max-w-2xl' }"
    data-testid="inventory-issue-form"
  >
    <template #header>
      <div>
        <p class="text-sm font-semibold text-highlighted">
          销售出库
        </p>
        <p class="mt-0.5 text-xs text-muted">
          从销售履约单带入待发数量，确认后扣减库存并生成出库流水
        </p>
      </div>
    </template>

    <template #body>
      <div class="space-y-4">
        <UFormField label="销售单" required>
          <USelect
            v-model="orderId"
            :items="orderItems"
            placeholder="选择待出库的销售单"
            class="w-full"
            data-testid="inventory-issue-order"
          />
        </UFormField>

        <div class="grid gap-3 sm:grid-cols-3">
          <UFormField label="出库仓库" required>
            <USelect
              v-model="warehouseId"
              :items="warehouseItems"
              class="w-full"
              data-testid="inventory-issue-warehouse"
            />
          </UFormField>
          <UFormField label="出库人" required>
            <UInput
              v-model="shipper"
              placeholder="填写出库人"
              class="w-full"
              data-testid="inventory-issue-shipper"
            />
          </UFormField>
          <UFormField label="出库日期" required>
            <UInput
              v-model="shippedAt"
              type="date"
              class="w-full"
              data-testid="inventory-issue-date"
            />
          </UFormField>
        </div>

        <div class="flex items-center justify-between gap-2 border-b border-default pb-2">
          <div class="flex items-center gap-2">
            <p class="text-sm font-medium text-highlighted">
              待发明细
            </p>
            <UBadge variant="subtle" color="neutral" size="sm">
              {{ rows.length }} 行
            </UBadge>
          </div>
          <p class="text-xs text-muted">
            出库仓库：{{ warehouseItems.find(item => item.value === warehouseId)?.label ?? '—' }}
          </p>
        </div>

        <div v-if="!rows.length" class="rounded-sm border border-default px-3 py-6 text-center text-xs text-muted">
          该销售单已全部发货，没有待发明细
        </div>
        <div v-else class="space-y-2">
          <div
            v-for="row in rows"
            :key="row.lineNo"
            class="flex items-center justify-between gap-3 rounded-sm border border-default p-2.5"
            data-testid="inventory-issue-line"
          >
            <div class="min-w-0">
              <p class="truncate text-sm text-default">
                {{ row.name }}
              </p>
              <p class="mt-0.5 font-mono text-[11px] text-muted">
                {{ row.sku }} · 待发 {{ formatNumber(row.remaining) }} · 该仓可用 {{ formatNumber(availableOf(row.sku)) }}
              </p>
            </div>
            <div class="flex shrink-0 items-center gap-2">
              <UInput
                :model-value="row.input"
                type="number"
                :min="0"
                :max="row.remaining"
                class="w-24"
                data-testid="inventory-issue-qty"
                @update:model-value="updateInput(row, $event)"
              />
              <UButton
                label="按可用"
                color="neutral"
                variant="outline"
                size="xs"
                data-testid="inventory-issue-fill"
                @click="fillAvailable(row)"
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
          data-testid="inventory-issue-error"
        />

        <div class="flex items-center justify-between rounded-sm bg-elevated/60 px-3 py-2 text-sm">
          <span class="text-muted">本次出库合计</span>
          <span class="tabular-nums font-semibold text-highlighted">{{ formatNumber(totalInput) }} 件</span>
        </div>
        <p class="text-xs text-muted">
          确认后仅扣减本次预览的本地库存，刷新页面恢复初始数据。
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
          data-testid="inventory-issue-cancel"
          @click="open = false"
        />
        <UButton
          label="确认出库"
          icon="i-carbon-arrow-up-right"
          :loading="submitting"
          data-testid="inventory-issue-submit"
          @click="submit"
        />
      </div>
    </template>
  </USlideover>
</template>

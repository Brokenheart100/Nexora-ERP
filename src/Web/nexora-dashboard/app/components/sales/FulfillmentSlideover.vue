<script setup lang="ts">
import type { SalesOrder } from '~/mocks'

const props = defineProps<{ order: SalesOrder | null }>()

const emit = defineEmits<{
  confirm: [payload: { shippedAt: string, shipper: string, lines: { lineNo: number, quantity: number }[] }]
}>()

const open = defineModel<boolean>('open', { default: false })

const shippers = ['顺丰速运', '德邦物流', '京东物流', '客户自提']
const form = reactive({ shippedAt: '', shipper: shippers[0]! })
const formError = ref('')
const quantities = ref<Record<number, number>>({})
const { loading: saving, run: runSave } = useMockAsync(async () => undefined, { delay: 480 })

const lines = computed(() => props.order?.lines ?? [])

function remaining(line: { quantity: number, shipped: number }) {
  return Math.max(line.quantity - line.shipped, 0)
}

function reset() {
  formError.value = ''
  form.shippedAt = new Date().toISOString().slice(0, 10)
  form.shipper = shippers[0]!
  quantities.value = Object.fromEntries((props.order?.lines ?? []).map(line => [line.lineNo, remaining(line)]))
}

watch(open, (value) => {
  if (value) reset()
}, { immediate: true })

const totalQuantity = computed(() => lines.value.reduce(
  (sum, line) => sum + (Number(quantities.value[line.lineNo]) || 0),
  0
))

function updateQuantity(lineNo: number, value: string | number) {
  const parsed = typeof value === 'number' ? value : Number(value)
  quantities.value[lineNo] = Number.isFinite(parsed) ? parsed : 0
}

async function submit() {
  const order = props.order
  if (!order) return
  formError.value = ''
  if (!form.shippedAt) {
    formError.value = '请选择发货日期'
    return
  }
  const payload = order.lines
    .map(line => ({ lineNo: line.lineNo, quantity: Number(quantities.value[line.lineNo]) || 0 }))
    .filter(item => item.quantity > 0)
  if (!payload.length) {
    formError.value = '请至少填写一行本次发货数量'
    return
  }
  for (const item of payload) {
    const line = order.lines.find(entry => entry.lineNo === item.lineNo)!
    if (item.quantity > remaining(line)) {
      formError.value = '第 ' + line.lineNo + ' 行发货数量超过待发数量（剩余 ' + remaining(line) + '）'
      return
    }
  }
  await runSave()
  emit('confirm', { shippedAt: form.shippedAt, shipper: form.shipper, lines: payload })
  open.value = false
}
</script>

<template>
  <USlideover v-model:open="open" :ui="{ content: 'w-full sm:max-w-xl' }" data-testid="sales-fulfillment">
    <template #header>
      <div>
        <p class="text-xs text-muted">
          发起履约
        </p>
        <h2 class="mt-1 text-base font-semibold text-highlighted">
          {{ order?.customerName || '销售订单' }}
        </h2>
        <p class="mt-0.5 font-mono text-xs text-muted">
          {{ order?.id }}
        </p>
        <p class="mt-1 text-xs text-muted">
          纯 UI 演示：确认后只更新本地履约记录与订单状态，刷新页面恢复初始数据。
        </p>
      </div>
    </template>

    <template #body>
      <UForm :state="form" class="space-y-4" @submit.prevent>
        <UAlert
          v-if="formError"
          color="error"
          variant="soft"
          icon="i-carbon-warning-alt"
          :title="formError"
          data-testid="sales-fulfillment-error"
        />

        <div class="grid gap-3 sm:grid-cols-2">
          <UFormField label="发货日期" required>
            <UInput
              v-model="form.shippedAt"
              type="date"
              class="w-full"
              data-testid="sales-fulfillment-date"
            />
          </UFormField>
          <UFormField label="承运商" required>
            <USelect
              v-model="form.shipper"
              :items="shippers"
              class="w-full"
              data-testid="sales-fulfillment-shipper"
            />
          </UFormField>
        </div>

        <div>
          <p class="mb-2 text-sm font-medium text-default">
            本次发货明细（{{ lines.length }} 行）
          </p>
          <div class="space-y-2">
            <div
              v-for="line in lines"
              :key="line.lineNo"
              class="rounded-sm border border-default p-2.5"
              data-testid="sales-fulfillment-line"
            >
              <div class="flex flex-wrap items-start justify-between gap-2">
                <div class="min-w-0">
                  <p class="truncate text-[13px] text-default">
                    {{ line.name }}
                  </p>
                  <p class="mt-0.5 font-mono text-[11px] text-muted">
                    {{ line.sku }} · 订购 {{ line.quantity }} · 已发 {{ line.shipped }} · 待发 {{ remaining(line) }}
                  </p>
                </div>
                <UInput
                  :model-value="quantities[line.lineNo] ?? 0"
                  type="number"
                  min="0"
                  :max="remaining(line)"
                  size="sm"
                  class="w-28"
                  aria-label="本次发货数量"
                  data-testid="sales-fulfillment-qty"
                  @update:model-value="value => updateQuantity(line.lineNo, value)"
                />
              </div>
            </div>
          </div>
          <p class="mt-2 text-right text-xs tabular-nums text-muted">
            本次发货合计 {{ totalQuantity }} 件
          </p>
        </div>
      </UForm>
    </template>

    <template #footer>
      <div class="flex w-full flex-wrap items-center justify-between gap-2">
        <UButton
          label="取消"
          color="neutral"
          variant="ghost"
          data-testid="sales-fulfillment-cancel"
          @click="open = false"
        />
        <UButton
          label="确认发货"
          icon="i-carbon-truck"
          :loading="saving"
          data-testid="sales-fulfillment-confirm"
          @click="submit"
        />
      </div>
    </template>
  </USlideover>
</template>

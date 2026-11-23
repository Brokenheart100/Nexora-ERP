<script setup lang="ts">
import { warehouses } from '~/mocks'
import type { useWarehouseConnection } from '~/composables/inventory/useWarehouseConnection'
import { compareDecimal, subtractDecimal } from '#shared/utils/decimal'

const props = defineProps<{ permitId: string | null, live?: ReturnType<typeof useWarehouseConnection> }>()
const emit = defineEmits<{
  confirm: [
    payload: { permitId: string, warehouseId: string, operator: string, at: string, lines: { lineNo: number, quantity: number }[] }
  ]
}>()
const open = defineModel<boolean>('open', { default: false })
const stockFlow = useStockFlowStore()
const permit = computed(() =>
  props.live
    ? props.live.selected
      ? {
          id: props.live.selected.id,
          direction: props.live.selected.direction,
          sourceNo: props.live.selected.sourceNo,
          partner: props.live.selected.partner
        }
      : null
    : props.permitId
      ? (stockFlow.permits.find(row => row.id === props.permitId) ?? null)
      : null
)
const lines = computed(() =>
  props.live
    ? props.live.selected
      ? [
          {
            lineNo: 1,
            name: props.live.selected.itemName ?? props.live.itemName(props.live.selected.itemId),
            sku: props.live.selected.itemId,
            executed: props.live.selected.executed,
            permitted: props.live.selected.quantity
          }
        ]
      : []
    : props.permitId
      ? (stockFlow.permits.find(row => row.id === props.permitId)?.lines ?? [])
      : []
)
const warehouseItems = computed(() =>
  props.live
    ? (props.live.query.data?.warehouses.warehouses.map(value => ({
        label: value.name + '（' + value.code + '）',
        value: value.id
      })) ?? [])
    : warehouses
        .filter(value => value.status === 'active')
        .map(value => ({ label: value.name + '（' + value.code + '）', value: value.id }))
)
const mockWarehouse = ref('wh-east'),
  mockOperator = ref('陈立'),
  mockDate = ref('2026-11-18')
const warehouseId = computed({
  get: () => props.live?.warehouseId ?? mockWarehouse.value,
  set: (value) => {
    if (!props.live) mockWarehouse.value = value
  }
})
const operator = computed({
  get: () => props.live?.query.auth.user?.name ?? mockOperator.value,
  set: (value) => {
    if (!props.live) mockOperator.value = value
  }
})
const at = computed({
  get: () => props.live?.form.on ?? mockDate.value,
  set: (value) => {
    if (props.live) props.live.updateForm('on', value)
    else mockDate.value = value
  }
})
const quantities = ref<Record<number, number | string>>({}),
  error = ref('')
const locked = computed(() => props.live?.frozen ?? false)
function syncForm() {
  error.value = ''
  quantities.value = {}
  for (const line of lines.value) quantities.value[line.lineNo] = props.live ? props.live.form.quantity : 0
}
watch(
  () => [props.permitId, open.value] as const,
  () => {
    if (open.value) syncForm()
  }
)
function remaining(line: { permitted: number | string, executed: number | string }) {
  return props.live
    ? subtractDecimal(String(line.permitted), String(line.executed))
    : Number(line.permitted) - Number(line.executed)
}
function fillRemaining() {
  for (const line of lines.value) quantities.value[line.lineNo] = remaining(line)
}
async function submit() {
  if (props.live) {
    props.live.updateForm('quantity', String(quantities.value[1] ?? ''))
    if (await props.live.confirm()) open.value = false
    return
  }
  if (!permit.value || !warehouseId.value || !operator.value.trim() || !at.value) {
    error.value = '请填写仓库、经办人和业务日期。'
    return
  }
  const payloadLines = lines.value
    .map(line => ({ lineNo: line.lineNo, quantity: Number(quantities.value[line.lineNo] ?? 0) }))
    .filter(line => line.quantity > 0)
  if (!payloadLines.length) {
    error.value = '至少填写一行执行数量。'
    return
  }
  if (payloadLines.some(line => line.quantity > Number(remaining(lines.value.find(value => value.lineNo === line.lineNo)!)))) {
    error.value = '执行数量超过许可剩余。'
    return
  }
  emit('confirm', {
    permitId: permit.value.id,
    warehouseId: warehouseId.value,
    operator: operator.value,
    at: at.value,
    lines: payloadLines
  })
}
</script>

<template>
  <USlideover v-model:open="open" title="按许可执行收发货" :ui="{ content: 'w-full sm:max-w-2xl' }">
    <template #description>
      <span class="text-sm text-muted">仓库按许可确认数量，执行记录同步回采购或销售详情</span>
    </template>

    <template #body>
      <div class="space-y-4" data-testid="permit-execution-form">
        <UAlert
          v-if="permit"
          color="neutral"
          variant="soft"
          icon="i-carbon-document"
          :description="permit.id + ' · ' + (permit.direction === 'inbound' ? '入库' : '出库') + ' · ' + permit.sourceNo + ' · ' + permit.partner"
          data-testid="permit-execution-source"
        />

        <fieldset :disabled="locked" class="contents">
          <div class="grid gap-3 sm:grid-cols-3">
            <UFormField label="仓库" required>
              <USelect
                v-model="warehouseId"
                :disabled="!!live"
                :items="warehouseItems"
                class="w-full"
                data-testid="permit-execution-warehouse"
              />
            </UFormField>
            <UFormField label="经办人" required>
              <UInput
                v-model="operator"
                :disabled="!!live"
                class="w-full"
                data-testid="permit-execution-operator"
              />
            </UFormField>
            <UFormField label="业务日期" required>
              <UInput
                v-model="at"
                type="date"
                class="w-full"
                data-testid="permit-execution-date"
              />
            </UFormField>
          </div>

          <div class="flex items-center justify-between">
            <p class="text-xs text-muted">
              按行填写本次执行数量，不得超过许可剩余。
            </p>
            <UButton
              label="填入全部剩余"
              color="neutral"
              variant="ghost"
              size="xs"
              data-testid="permit-execution-fill"
              @click="fillRemaining"
            />
          </div>

          <div class="space-y-2">
            <div
              v-for="line in lines"
              :key="line.lineNo"
              class="rounded-sm border border-default p-3"
              data-testid="permit-execution-line"
            >
              <div class="flex flex-wrap items-start justify-between gap-2">
                <div class="min-w-0">
                  <p class="text-sm text-default">
                    {{ line.name }}
                  </p>
                  <p class="mt-0.5 font-mono text-[11px] text-muted">
                    {{ line.sku }} · 第 {{ line.lineNo }} 行
                  </p>
                </div>
                <div class="flex items-center gap-2 text-[11px] text-muted">
                  <span>已执行 {{ line.executed }}</span>
                  <UBadge
                    color="neutral"
                    variant="subtle"
                    size="sm"
                    :label="'剩余 ' + remaining(line)"
                  />
                </div>
              </div>
              <UInput
                :model-value="String(quantities[line.lineNo] ?? '')"
                :type="live ? 'text' : 'number'"
                inputmode="decimal"
                min="0"
                :max="String(remaining(line))"
                :disabled="compareDecimal(String(line.executed), String(line.permitted)) >= 0"
                class="mt-2 w-32"
                :data-testid="'permit-execution-qty-' + line.lineNo"
                @update:model-value="value => quantities[line.lineNo] = live ? String(value) : Number(value)"
              />
            </div>
          </div>
        </fieldset>
        <UButton
          v-if="live?.submission.failure && [409, 412].includes(live.submission.failure.status)"
          label="读取仓库当前修订，保留数量"
          variant="outline"
          data-testid="receipt-read-current"
          @click="live.readCurrent()"
        />
        <UAlert
          v-if="error || live?.error || live?.submission.message"
          color="error"
          variant="soft"
          :description="error || live?.error || live?.submission.message"
          data-testid="permit-execution-error"
        />
      </div>
    </template>

    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton
          label="取消"
          color="neutral"
          variant="ghost"
          data-testid="permit-execution-cancel"
          @click="open = false"
        />
        <UButton
          label="确认执行"
          :loading="live?.submission.mutation.busy"
          :disabled="locked"
          data-testid="permit-execution-submit"
          @click="submit"
        />
      </div>
    </template>
  </USlideover>
</template>

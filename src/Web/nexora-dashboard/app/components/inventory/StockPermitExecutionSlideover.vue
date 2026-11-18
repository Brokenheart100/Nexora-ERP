<script setup lang="ts">
import { warehouses } from '~/mocks'

const props = defineProps<{ permitId: string | null }>()
const emit = defineEmits<{
  confirm: [payload: {
    permitId: string
    warehouseId: string
    operator: string
    at: string
    lines: { lineNo: number, quantity: number }[]
  }]
}>()
const open = defineModel<boolean>('open', { default: false })
const stockFlow = useStockFlowStore()

const permit = computed(() => props.permitId
  ? stockFlow.permits.find(row => row.id === props.permitId) ?? null
  : null)
const lines = computed(() => permit.value?.lines ?? [])
const warehouseItems = computed(() => warehouses
  .filter(warehouse => warehouse.status === 'active')
  .map(warehouse => ({ label: warehouse.name + '（' + warehouse.code + '）', value: warehouse.id })))

const warehouseId = ref('wh-east')
const operator = ref('陈立')
const at = ref('2026-11-18')
const quantities = ref<Record<number, number>>({})
const error = ref('')

function syncForm() {
  error.value = ''
  quantities.value = {}
  for (const line of lines.value) quantities.value[line.lineNo] = 0
}

watch(() => [props.permitId, open.value] as const, () => {
  if (open.value) syncForm()
})

function fillRemaining() {
  for (const line of lines.value) quantities.value[line.lineNo] = line.permitted - line.executed
}

function submit() {
  if (!permit.value) return
  if (!warehouseId.value) {
    error.value = '请选择仓库。'
    return
  }
  if (!operator.value.trim()) {
    error.value = '请填写经办人。'
    return
  }
  if (!at.value) {
    error.value = '请选择业务日期。'
    return
  }
  const payloadLines = lines.value
    .map(line => ({ lineNo: line.lineNo, quantity: Number(quantities.value[line.lineNo] ?? 0) }))
    .filter(line => line.quantity > 0)
  if (!payloadLines.length) {
    error.value = '至少填写一行执行数量。'
    return
  }
  for (const line of payloadLines) {
    const permitLine = lines.value.find(row => row.lineNo === line.lineNo)!
    const remaining = permitLine.permitted - permitLine.executed
    if (line.quantity > remaining) {
      error.value = '第 ' + line.lineNo + ' 行超过许可剩余 ' + remaining + '。'
      return
    }
  }
  emit('confirm', { permitId: permit.value.id, warehouseId: warehouseId.value, operator: operator.value, at: at.value, lines: payloadLines })
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

        <div class="grid gap-3 sm:grid-cols-3">
          <UFormField label="仓库" required>
            <USelect
              v-model="warehouseId"
              :items="warehouseItems"
              class="w-full"
              data-testid="permit-execution-warehouse"
            />
          </UFormField>
          <UFormField label="经办人" required>
            <UInput v-model="operator" class="w-full" data-testid="permit-execution-operator" />
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
                  :label="'剩余 ' + (line.permitted - line.executed)"
                />
              </div>
            </div>
            <UInput
              v-model.number="quantities[line.lineNo]"
              type="number"
              min="0"
              :max="line.permitted - line.executed"
              :disabled="line.executed >= line.permitted"
              class="mt-2 w-32"
              :data-testid="'permit-execution-qty-' + line.lineNo"
            />
          </div>
        </div>

        <UAlert
          v-if="error"
          color="error"
          variant="soft"
          :description="error"
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
        <UButton label="确认执行" data-testid="permit-execution-submit" @click="submit" />
      </div>
    </template>
  </USlideover>
</template>

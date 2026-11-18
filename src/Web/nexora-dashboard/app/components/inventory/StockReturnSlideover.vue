<script setup lang="ts">
const props = defineProps<{ executionId: string | null }>()
const open = defineModel<boolean>('open', { default: false })
const stockFlow = useStockFlowStore()
const toast = useToast()

const reason = ref('')
const error = ref('')
const quantities = ref<Record<number, number>>({})

const execution = computed(() => props.executionId
  ? stockFlow.executions.find(row => row.id === props.executionId) ?? null
  : null)
const permit = computed(() => execution.value
  ? stockFlow.permits.find(row => row.id === execution.value!.permitId) ?? null
  : null)
const views = computed(() => props.executionId ? stockFlow.returnableLines(props.executionId) : [])
const total = computed(() => views.value.reduce((sum, line) => sum + (quantities.value[line.lineNo] ?? 0), 0))

function syncForm() {
  reason.value = ''
  error.value = ''
  quantities.value = {}
  for (const line of views.value) quantities.value[line.lineNo] = 0
}

watch(() => [props.executionId, open.value] as const, () => {
  if (open.value) syncForm()
})

function submit() {
  if (!props.executionId) return
  const lines = views.value
    .map(line => ({ lineNo: line.lineNo, quantity: Number(quantities.value[line.lineNo] ?? 0) }))
    .filter(line => line.quantity > 0)
  const result = stockFlow.createReturn(props.executionId, lines, reason.value)
  if (!result.ok) {
    error.value = result.message
    return
  }
  toast.add({ title: '已创建退货单', description: result.message, color: 'success' })
  open.value = false
}
</script>

<template>
  <USlideover v-model:open="open" title="发起退货" :ui="{ content: 'w-full sm:max-w-2xl' }">
    <template #description>
      <span class="text-sm text-muted">从原{{ execution?.sourceType === 'fulfillment' ? '发货' : '收货' }}记录发起，确认后生成关联贷项</span>
    </template>

    <template #body>
      <div class="space-y-4" data-testid="stock-return-form">
        <UAlert
          v-if="execution"
          color="neutral"
          variant="soft"
          icon="i-carbon-arrow-undo"
          :description="'来源 ' + execution.sourceId + ' · 原单 ' + (permit?.sourceNo ?? '') + ' · ' + (permit?.partner ?? '')"
          data-testid="stock-return-source"
        />

        <div class="space-y-2">
          <div
            v-for="line in views"
            :key="line.lineNo"
            class="rounded-sm border border-default p-3"
            data-testid="stock-return-line"
          >
            <div class="flex flex-wrap items-start justify-between gap-2">
              <div class="min-w-0">
                <p class="text-sm font-medium text-default">
                  {{ line.name }}
                </p>
                <p class="mt-0.5 font-mono text-[11px] text-muted">
                  {{ line.sku }} · 第 {{ line.lineNo }} 行
                </p>
              </div>
              <div class="flex flex-wrap items-center gap-2 text-[11px] text-muted">
                <span>原数量 {{ line.quantity }}</span>
                <span>已退 {{ line.returned }}</span>
                <span>待确认 {{ line.pending }}</span>
                <UBadge
                  color="neutral"
                  variant="subtle"
                  size="sm"
                  :label="'可退 ' + line.returnable"
                />
              </div>
            </div>
            <div class="mt-3 flex flex-wrap items-center gap-3">
              <UInput
                v-model.number="quantities[line.lineNo]"
                type="number"
                min="0"
                :max="line.returnable"
                :disabled="line.returnable <= 0"
                class="w-28"
                :data-testid="'stock-return-qty-' + line.lineNo"
              />
              <p class="text-xs text-muted" :data-testid="'stock-return-available-' + line.lineNo">
                最多可退 {{ line.returnable }} 件
              </p>
            </div>
          </div>
        </div>

        <UFormField label="退货原因" required>
          <UTextarea
            v-model="reason"
            :rows="3"
            placeholder="说明退货原因，确认后会写入贷项流程"
            class="w-full"
            data-testid="stock-return-reason"
          />
        </UFormField>

        <UAlert
          v-if="error"
          color="error"
          variant="soft"
          :description="error"
          data-testid="stock-return-error"
        />
        <p class="text-xs text-muted">
          本单合计退货 {{ total }} 件。确认退货后可打开对应贷项继续核销或退款。
        </p>
      </div>
    </template>

    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton
          label="取消"
          color="neutral"
          variant="ghost"
          data-testid="stock-return-cancel"
          @click="open = false"
        />
        <UButton label="创建退货单" data-testid="stock-return-submit" @click="submit" />
      </div>
    </template>
  </USlideover>
</template>

<script setup lang="ts">
import type { Quote, SalesOrder } from '~/mocks'

interface FormLine {
  key: number
  sku: string
  name: string
  quantity: number
  unitPrice: number
}

interface SalesFormData {
  customerName: string
  date: string
  note: string
  lines: { sku: string, name: string, quantity: number, unitPrice: number }[]
}

const props = defineProps<{
  kind: 'order' | 'quote'
  order: SalesOrder | null
  quote: Quote | null
  customers: string[]
}>()

const emit = defineEmits<{
  save: [payload: { kind: 'order' | 'quote', mode: 'draft' | 'submit', data: SalesFormData }]
}>()

const open = defineModel<boolean>('open', { default: false })

const form = reactive({
  customerName: '',
  date: '',
  note: ''
})

const lines = ref<FormLine[]>([])
const formError = ref('')
const { loading: saving, run: runSave } = useMockAsync(async () => undefined, { delay: 480 })

let lineKey = 0

function emptyLine(): FormLine {
  lineKey += 1
  return { key: lineKey, sku: '', name: '', quantity: 1, unitPrice: 0 }
}

function defaultDate() {
  const days = props.kind === 'quote' ? 30 : 14
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

function reset() {
  formError.value = ''
  const editing = props.kind === 'order' ? props.order : props.quote
  if (editing && props.kind === 'order' && props.order) {
    form.customerName = props.order.customerName
    form.date = props.order.promisedAt
    form.note = props.order.note
    lines.value = props.order.lines.map(line => ({
      key: ++lineKey,
      sku: line.sku,
      name: line.name,
      quantity: line.quantity,
      unitPrice: Number(line.unitPrice)
    }))
    return
  }
  if (editing && props.kind === 'quote' && props.quote) {
    form.customerName = props.quote.customerName
    form.date = props.quote.validUntil
    form.note = ''
    lines.value = props.quote.lines.map(line => ({
      key: ++lineKey,
      sku: line.sku,
      name: line.name,
      quantity: line.quantity,
      unitPrice: Number(line.unitPrice)
    }))
    return
  }
  form.customerName = ''
  form.date = defaultDate()
  form.note = ''
  lines.value = [emptyLine(), emptyLine()]
}

watch(open, (value) => {
  if (value) reset()
}, { immediate: true })

const isEditing = computed(() => Boolean(props.kind === 'order' ? props.order : props.quote))
const title = computed(() => (isEditing.value ? '编辑' : '新建') + (props.kind === 'order' ? '销售订单' : '报价单'))
const dateLabel = computed(() => (props.kind === 'order' ? '承诺交付日期' : '报价有效期'))
const notePlaceholder = computed(() => (props.kind === 'order'
  ? '可选，例如交付要求或付款条款'
  : '可选，例如折扣说明或客户关注点'))

const total = computed(() => lines.value.reduce(
  (sum, line) => sum + (Number(line.quantity) || 0) * (Number(line.unitPrice) || 0),
  0
))

function updateLineNumber(key: number, field: 'quantity' | 'unitPrice', value: string | number) {
  const line = lines.value.find(item => item.key === key)
  if (!line) return
  const parsed = typeof value === 'number' ? value : Number(value)
  line[field] = Number.isFinite(parsed) ? parsed : 0
}

function addLine() {
  lines.value = [...lines.value, emptyLine()]
}

function removeLine(key: number) {
  lines.value = lines.value.filter(line => line.key !== key)
}

function validate() {
  if (!form.customerName) return '请选择客户'
  if (!form.date) return props.kind === 'order' ? '请选择承诺交付日期' : '请选择报价有效期'
  if (!lines.value.length) return '请至少添加一行明细'
  for (let index = 0; index < lines.value.length; index += 1) {
    const line = lines.value[index]!
    if (!line.name.trim()) return '第 ' + (index + 1) + ' 行请填写商品名称'
    if (!(Number(line.quantity) > 0)) return '第 ' + (index + 1) + ' 行数量必须大于 0'
    if (!(Number(line.unitPrice) >= 0)) return '第 ' + (index + 1) + ' 行单价不能为负数'
  }
  return ''
}

async function submit(mode: 'draft' | 'submit') {
  formError.value = validate()
  if (formError.value) return
  await runSave()
  emit('save', {
    kind: props.kind,
    mode,
    data: {
      customerName: form.customerName,
      date: form.date,
      note: form.note.trim(),
      lines: lines.value.map((line, index) => ({
        sku: line.sku.trim() || 'SKU-NEW-' + String(index + 1).padStart(2, '0'),
        name: line.name.trim(),
        quantity: Number(line.quantity),
        unitPrice: Number(line.unitPrice)
      }))
    }
  })
  open.value = false
}
</script>

<template>
  <USlideover v-model:open="open" :ui="{ content: 'w-full sm:max-w-3xl' }" data-testid="sales-form">
    <template #header>
      <div>
        <p class="text-xs text-muted">
          {{ title }}
        </p>
        <h2 class="mt-1 text-base font-semibold text-highlighted">
          {{ form.customerName || '未选择客户' }}
        </h2>
        <p class="mt-0.5 text-xs text-muted">
          纯 UI 演示：保存或提交后只更新当前工作区的本地列表，刷新页面恢复初始数据。
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
          data-testid="sales-form-error"
        />

        <div class="grid gap-3 sm:grid-cols-2">
          <UFormField label="客户" required>
            <USelect
              v-model="form.customerName"
              :items="customers"
              placeholder="选择客户"
              class="w-full"
              data-testid="sales-form-customer"
            />
          </UFormField>
          <UFormField :label="dateLabel" required>
            <UInput
              v-model="form.date"
              type="date"
              class="w-full"
              data-testid="sales-form-date"
            />
          </UFormField>
          <UFormField label="备注" class="sm:col-span-2">
            <UInput
              v-model="form.note"
              :placeholder="notePlaceholder"
              class="w-full"
              data-testid="sales-form-note"
            />
          </UFormField>
        </div>

        <div>
          <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
            <p class="text-sm font-medium text-default">
              明细行（{{ lines.length }}）
            </p>
            <UButton
              label="添加明细行"
              icon="i-carbon-add"
              color="neutral"
              variant="outline"
              size="sm"
              data-testid="sales-form-add-line"
              @click="addLine"
            />
          </div>

          <div class="space-y-2">
            <div
              v-for="(line, index) in lines"
              :key="line.key"
              class="rounded-sm border border-default p-2.5"
              data-testid="sales-form-line"
            >
              <div class="mb-2 flex items-center justify-between">
                <p class="text-xs font-medium text-muted">
                  第 {{ index + 1 }} 行
                </p>
                <UButton
                  icon="i-carbon-trash-can"
                  color="error"
                  variant="ghost"
                  size="xs"
                  aria-label="删除明细行"
                  data-testid="sales-form-line-remove"
                  @click="removeLine(line.key)"
                />
              </div>
              <div class="grid gap-2 sm:grid-cols-6">
                <UInput
                  v-model="line.name"
                  placeholder="商品名称（必填）"
                  class="sm:col-span-6"
                  data-testid="sales-form-line-name"
                />
                <UInput
                  v-model="line.sku"
                  placeholder="SKU（可选，留空自动生成）"
                  class="sm:col-span-3"
                  data-testid="sales-form-line-sku"
                />
                <UInput
                  :model-value="line.quantity"
                  type="number"
                  min="1"
                  placeholder="数量"
                  class="sm:col-span-3"
                  data-testid="sales-form-line-qty"
                  @update:model-value="value => updateLineNumber(line.key, 'quantity', value)"
                />
                <UInput
                  :model-value="line.unitPrice"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="单价"
                  class="sm:col-span-3"
                  data-testid="sales-form-line-price"
                  @update:model-value="value => updateLineNumber(line.key, 'unitPrice', value)"
                />
                <p class="self-center text-right text-xs tabular-nums text-muted sm:col-span-3">
                  金额 {{ formatMoney((Number(line.quantity) || 0) * (Number(line.unitPrice) || 0)) }}
                </p>
              </div>
            </div>
          </div>

          <p
            v-if="!lines.length"
            class="rounded-sm border border-dashed border-default p-3 text-center text-xs text-muted"
          >
            暂无明细行，请点击「添加明细行」。
          </p>
        </div>

        <div class="flex justify-end">
          <dl class="w-full max-w-xs space-y-1 text-[13px]">
            <div class="flex justify-between gap-3">
              <dt class="text-muted">
                未税合计
              </dt>
              <dd class="tabular-nums text-default">
                {{ formatMoney(total) }}
              </dd>
            </div>
            <div class="flex justify-between gap-3">
              <dt class="text-muted">
                税额（13%）
              </dt>
              <dd class="tabular-nums text-default">
                {{ formatMoney(total * 0.13) }}
              </dd>
            </div>
            <div class="flex justify-between gap-3 border-t border-default pt-1 font-semibold">
              <dt class="text-highlighted">
                价税合计
              </dt>
              <dd class="tabular-nums text-highlighted">
                {{ formatMoney(total * 1.13) }}
              </dd>
            </div>
          </dl>
        </div>
      </UForm>
    </template>

    <template #footer>
      <div class="flex w-full flex-wrap items-center justify-between gap-2">
        <UButton
          label="取消"
          color="neutral"
          variant="ghost"
          data-testid="sales-form-cancel"
          @click="open = false"
        />
        <div class="flex flex-wrap items-center gap-2">
          <UButton
            label="保存草稿"
            icon="i-carbon-save"
            color="neutral"
            variant="outline"
            :loading="saving"
            data-testid="sales-form-save-draft"
            @click="submit('draft')"
          />
          <UButton
            :label="kind === 'quote' ? '提交报价' : '提交审批'"
            icon="i-carbon-send-alt"
            :loading="saving"
            data-testid="sales-form-submit"
            @click="submit('submit')"
          />
        </div>
      </div>
    </template>
  </USlideover>
</template>

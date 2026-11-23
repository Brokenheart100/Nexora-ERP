<script setup lang="ts">
import type { PurchaseOrder } from '~/mocks'
import { purchaseOrders } from '~/mocks'
import type { usePurchaseConnection } from '~/composables/purchasing/usePurchaseConnection'
import { multiplyDecimals } from '#shared/utils/decimal'

interface FormLine {
  key: number
  sku: string
  name: string
  spec: string
  itemId: string
  quantity: number | string
  unitPrice: number | string
}
interface OrderFormData {
  supplier: string
  contact: string
  expectedAt: string
  note: string
  lines: { sku: string, name: string, spec: string, quantity: number, unitPrice: number }[]
}
const props = defineProps<{ order: PurchaseOrder | null, live?: ReturnType<typeof usePurchaseConnection> }>()
const emit = defineEmits<{ save: [payload: { mode: 'draft' | 'submit', data: OrderFormData }] }>()
const open = defineModel<boolean>('open', { default: false })
const connected = computed(() => !!props.live)
const supplierItems = computed(() =>
  props.live
    ? (props.live.choices.data?.suppliers?.items ?? [])
        .filter(value => value.isActive)
        .map(value => ({ label: value.code + ' ' + value.name, value: value.id }))
    : [...new Set(purchaseOrders.map(order => order.supplier))].map(name => ({ label: name, value: name }))
)
const itemItems = computed(
  () =>
    props.live?.choices.data?.catalog?.page.items
      .filter(value => value.isActive && value.tracksInventory)
      .map(value => ({ label: value.code + ' ' + value.name, value: value.id })) ?? []
)
const mockForm = reactive({ number: '', departmentId: '', supplier: '', contact: '', expectedAt: '', note: '' })
const mockLines = ref<FormLine[]>([])
const form = computed(() => props.live?.editor.form ?? mockForm)
const lines = computed(() => props.live?.editor.lines ?? mockLines.value)
const formError = ref('')
const { loading: mockSaving, run: runSave } = useMockAsync(async () => undefined, { delay: 480 })
const saving = computed(() => props.live?.submission.mutation.busy ?? mockSaving.value)
const locked = computed(() => props.live?.frozen ?? false)
const needsBaseline = computed(() => [409, 412].includes(props.live?.submission.failure?.status ?? 0))
let lineKey = 0
function emptyLine(): FormLine {
  return { key: ++lineKey, itemId: '', sku: '', name: '', spec: '', quantity: 1, unitPrice: 0 }
}
function reset() {
  formError.value = ''
  if (props.live) return
  if (props.order) {
    Object.assign(mockForm, {
      supplier: props.order.supplier,
      contact: props.order.contact,
      expectedAt: props.order.expectedAt,
      note: props.order.note
    })
    mockLines.value = props.order.lines.map(line => ({ ...line, key: ++lineKey, itemId: '' }))
  } else {
    Object.assign(mockForm, { supplier: '', contact: '', expectedAt: new Date().toISOString().slice(0, 10), note: '' })
    mockLines.value = [emptyLine(), emptyLine()]
  }
}
watch(
  open,
  (value) => {
    if (value) reset()
  },
  { immediate: true }
)
const total = computed(() =>
  lines.value.reduce((sum, line) => sum + (Number(line.quantity) || 0) * (Number(line.unitPrice) || 0), 0)
)
const isEditing = computed(() => (connected.value ? !!props.live?.editor.id : !!props.order))
function updateLineNumber(key: number, field: 'quantity' | 'unitPrice', value: string | number) {
  const line = lines.value.find(item => item.key === key)
  if (line) line[field] = props.live ? String(value) : Number.isFinite(Number(value)) ? Number(value) : 0
}
function addLine() {
  if (props.live) props.live.addLine()
  else mockLines.value.push(emptyLine())
}
function removeLine(key: number) {
  if (props.live) props.live.removeLine(key)
  else mockLines.value = mockLines.value.filter(line => line.key !== key)
}
function amount(line: FormLine) {
  try {
    return connected.value
      ? multiplyDecimals(String(line.quantity), String(line.unitPrice))
      : formatMoney(Number(line.quantity) * Number(line.unitPrice))
  } catch {
    return '—'
  }
}
async function submit(mode: 'draft' | 'submit') {
  if (props.live) {
    if (await props.live.saveEditor(mode)) open.value = false
    return
  }
  if (!form.value.supplier) formError.value = '请选择供应商'
  else if (!form.value.expectedAt) formError.value = '请选择预计到货日期'
  else if (
    !lines.value.length
    || lines.value.some(line => !line.name.trim() || Number(line.quantity) <= 0 || Number(line.unitPrice) < 0)
  )
    formError.value = '请填写商品名称、正数数量和非负单价'
  else formError.value = ''
  if (formError.value) return
  await runSave()
  emit('save', {
    mode,
    data: {
      supplier: form.value.supplier,
      contact: form.value.contact.trim(),
      expectedAt: form.value.expectedAt,
      note: form.value.note.trim(),
      lines: lines.value.map((line, index) => ({
        sku: line.sku.trim() || 'SKU-NEW-' + String(index + 1).padStart(2, '0'),
        name: line.name.trim(),
        spec: line.spec.trim(),
        quantity: Number(line.quantity),
        unitPrice: Number(line.unitPrice)
      }))
    }
  })
  open.value = false
}
</script>

<template>
  <USlideover v-model:open="open" :ui="{ content: 'w-full sm:max-w-3xl' }" data-testid="order-form">
    <template #header>
      <div>
        <p class="text-xs text-muted">
          {{ isEditing ? '编辑采购单' : '新建采购单' }}
        </p>
        <h2 class="mt-1 text-base font-semibold text-highlighted">
          {{ form.supplier || '未选择供应商' }}
        </h2>
        <p class="mt-0.5 text-xs text-muted">
          {{ connected ? '按当前工作区保存；数量与单价使用十进制字符串。保存后提交审批需独立审批人批准。' : '纯 UI 演示：保存或提交后只更新当前工作区的本地列表，刷新页面恢复初始数据。' }}
        </p>
      </div>
    </template>

    <template #body>
      <UForm :state="form" class="space-y-4" @submit.prevent>
        <UAlert
          v-if="formError || live?.editor.error || live?.submission.message"
          color="error"
          variant="soft"
          icon="i-carbon-warning-alt"
          :title="formError || live?.editor.error || live?.submission.message"
          data-testid="order-form-error"
        />

        <UButton
          v-if="live && needsBaseline"
          label="读取当前版本，保留输入"
          variant="outline"
          :loading="live.readingEditor"
          data-testid="order-read-current"
          @click="live.readEditorBaseline()"
        />
        <fieldset :disabled="locked" class="contents">
          <div class="grid gap-3 sm:grid-cols-2">
            <UFormField v-if="connected" label="采购单号" required>
              <UInput
                v-model="form.number"
                :disabled="isEditing"
                class="w-full"
                data-testid="order-form-number"
              />
            </UFormField>
            <UFormField v-if="connected" label="部门范围">
              <USelect
                v-model="form.departmentId"
                :items="[...(live?.companyScope ? [{ label: '公司范围', value: 'company' }] : []), ...(live?.departments.map(value => ({ label: value.name, value: value.id })) ?? [])]"
                class="w-full"
                data-testid="order-form-department"
              />
            </UFormField>
            <UFormField label="供应商" required>
              <USelect
                v-model="form.supplier"
                :items="supplierItems"
                placeholder="选择供应商"
                class="w-full"
                data-testid="order-form-supplier"
              />
            </UFormField>
            <UFormField v-if="!connected" label="联系人">
              <UInput
                v-model="form.contact"
                placeholder="姓名 · 电话"
                class="w-full"
                data-testid="order-form-contact"
              />
            </UFormField>
            <UFormField :label="connected ? '下单日期' : '预计到货'" required>
              <UInput
                v-model="form.expectedAt"
                type="date"
                class="w-full"
                data-testid="order-form-expected"
              />
            </UFormField>
            <UFormField label="备注">
              <UInput
                v-model="form.note"
                placeholder="可选，例如交付要求"
                class="w-full"
                data-testid="order-form-note"
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
                data-testid="order-form-add-line"
                @click="addLine"
              />
            </div>

            <div class="space-y-2">
              <div
                v-for="(line, index) in lines"
                :key="line.key"
                class="rounded-sm border border-default p-2.5"
                data-testid="order-form-line"
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
                    data-testid="order-form-line-remove"
                    @click="removeLine(line.key)"
                  />
                </div>
                <div class="grid gap-2 sm:grid-cols-6">
                  <USelect
                    v-if="connected"
                    v-model="line.itemId"
                    :items="itemItems"
                    placeholder="选择当前工作区商品"
                    class="sm:col-span-6"
                    data-testid="order-form-line-item"
                  />
                  <UInput
                    v-else
                    v-model="line.name"
                    placeholder="商品名称（必填）"
                    class="sm:col-span-6"
                    data-testid="order-form-line-name"
                  />
                  <UInput
                    v-if="!connected"
                    v-model="line.spec"
                    placeholder="规格"
                    class="sm:col-span-3"
                    data-testid="order-form-line-spec"
                  />
                  <UInput
                    v-if="!connected"
                    v-model="line.sku"
                    placeholder="SKU（可选，留空自动生成）"
                    class="sm:col-span-3"
                    data-testid="order-form-line-sku"
                  />
                  <UInput
                    :model-value="String(line.quantity)"
                    :type="connected ? 'text' : 'number'"
                    inputmode="decimal"
                    min="0.000001"
                    placeholder="数量"
                    class="sm:col-span-3"
                    data-testid="order-form-line-qty"
                    @update:model-value="value => updateLineNumber(line.key, 'quantity', value)"
                  />
                  <UInput
                    :model-value="String(line.unitPrice)"
                    :type="connected ? 'text' : 'number'"
                    inputmode="decimal"
                    min="0"
                    step="0.01"
                    :placeholder="connected ? '单价（大于 0）' : '单价'"
                    class="sm:col-span-3"
                    data-testid="order-form-line-price"
                    @update:model-value="value => updateLineNumber(line.key, 'unitPrice', value)"
                  />
                </div>
                <p class="mt-1 text-right text-xs tabular-nums text-muted">
                  金额 {{ amount(line) }}
                </p>
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
                  {{ connected ? live?.editorTotal : formatMoney(total) }}
                </dd>
              </div>
              <div v-if="!connected" class="flex justify-between gap-3">
                <dt class="text-muted">
                  税额（13%）
                </dt>
                <dd class="tabular-nums text-default">
                  {{ formatMoney(total * 0.13) }}
                </dd>
              </div>
              <div v-if="!connected" class="flex justify-between gap-3 border-t border-default pt-1 font-semibold">
                <dt class="text-highlighted">
                  价税合计
                </dt>
                <dd class="tabular-nums text-highlighted">
                  {{ formatMoney(total * 1.13) }}
                </dd>
              </div>
            </dl>
          </div>
          <div v-if="connected" class="flex flex-wrap gap-2 text-xs text-muted">
            <UButton
              v-if="live?.choices.data?.catalog?.page.hasMore"
              label="下一页商品选项"
              variant="ghost"
              @click="live?.changeChoicePage('item', 1)"
            />
            <UButton
              v-if="live?.choices.data?.suppliers?.hasMore"
              label="下一页供应商选项"
              variant="ghost"
              @click="live?.changeChoicePage('supplier', 1)"
            />
            税额在供应商账单按配置评估；订单合计为未税金额。
          </div>
        </fieldset>
      </UForm>
    </template>

    <template #footer>
      <div class="flex w-full flex-wrap items-center justify-between gap-2">
        <UButton
          label="取消"
          color="neutral"
          variant="ghost"
          data-testid="order-form-cancel"
          @click="open = false"
        />
        <div class="flex flex-wrap items-center gap-2">
          <UButton
            label="保存草稿"
            icon="i-carbon-save"
            color="neutral"
            variant="outline"
            :loading="saving"
            :disabled="locked || needsBaseline"
            data-testid="order-form-save-draft"
            @click="submit('draft')"
          />
          <UButton
            label="提交审批"
            icon="i-carbon-send-alt"
            :loading="saving"
            :disabled="locked || needsBaseline"
            data-testid="order-form-submit"
            @click="submit('submit')"
          />
        </div>
      </div>
    </template>
  </USlideover>
</template>

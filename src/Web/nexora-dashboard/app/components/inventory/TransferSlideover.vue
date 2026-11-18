<script setup lang="ts">
import type { InventoryPosition, TransferLine, TransferOrder, Warehouse } from '~/mocks'
import { transferStatusColors, transferStatusLabels } from '~/mocks'
import type { TableColumn } from '@nuxt/ui'

interface TransferDraftRow {
  key: number
  sku: string
  quantity: number
}

const props = defineProps<{
  transfer?: TransferOrder | null
  warehouses: Warehouse[]
  positions: InventoryPosition[]
}>()

const emit = defineEmits<{
  confirm: [payload: { fromWarehouseId: string, toWarehouseId: string, lines: { sku: string, quantity: number }[] }]
  execute: [id: string]
}>()

const open = defineModel<boolean>('open', { default: false })
const { loading: submitting, run: runSubmit } = useMockAsync(async () => undefined, { delay: 700 })

const fromWarehouseId = ref('')
const toWarehouseId = ref('')
const draftRows = ref<TransferDraftRow[]>([])
const errorMessage = ref('')
let rowSequence = 0

const isView = computed(() => Boolean(props.transfer))
const warehouseItems = computed(() => props.warehouses.map(warehouse => ({
  label: warehouse.name + '（' + warehouse.city + '）',
  value: warehouse.id
})))
const targetWarehouseItems = computed(() => warehouseItems.value.filter(item => item.value !== fromWarehouseId.value))
const sourcePositions = computed(() => {
  const map = new Map<string, InventoryPosition>()
  for (const position of props.positions) {
    if (position.warehouseId !== fromWarehouseId.value || position.available <= 0) continue
    if (!map.has(position.sku)) map.set(position.sku, position)
  }
  return [...map.values()]
})
const skuItems = computed(() => sourcePositions.value.map(position => ({
  label: position.name + ' · 可用 ' + availableOf(position.sku),
  value: position.sku
})))

function availableOf(sku: string) {
  return props.positions
    .filter(position => position.warehouseId === fromWarehouseId.value && position.sku === sku)
    .reduce((sum, position) => sum + position.available, 0)
}

function warehouseName(id: string) {
  return props.warehouses.find(warehouse => warehouse.id === id)?.name ?? id
}

function reset() {
  errorMessage.value = ''
  if (props.transfer) {
    fromWarehouseId.value = props.transfer.fromWarehouseId
    toWarehouseId.value = props.transfer.toWarehouseId
    draftRows.value = []
    return
  }
  fromWarehouseId.value = props.warehouses.find(warehouse => warehouse.status === 'active')?.id
    ?? props.warehouses[0]?.id
    ?? ''
  toWarehouseId.value = props.warehouses.find(warehouse => warehouse.id !== fromWarehouseId.value)?.id ?? ''
  draftRows.value = [{ key: ++rowSequence, sku: '', quantity: 1 }]
}

watch(open, (value) => {
  if (value) reset()
}, { immediate: true })
watch(fromWarehouseId, () => {
  errorMessage.value = ''
  if (toWarehouseId.value === fromWarehouseId.value) toWarehouseId.value = ''
  const validSkus = new Set(sourcePositions.value.map(position => position.sku))
  draftRows.value = draftRows.value.map(row => row.sku && !validSkus.has(row.sku) ? { ...row, sku: '' } : row)
})

function addDraftRow() {
  draftRows.value.push({ key: ++rowSequence, sku: '', quantity: 1 })
  errorMessage.value = ''
}
function removeDraftRow(key: number) {
  if (draftRows.value.length <= 1) {
    return
  }
  draftRows.value = draftRows.value.filter(row => row.key !== key)
  errorMessage.value = ''
}
function updateQuantity(row: TransferDraftRow, value: string | number) {
  const parsed = typeof value === 'number' ? value : Number(value)
  row.quantity = Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0
  errorMessage.value = ''
}

async function submit() {
  if (!fromWarehouseId.value) {
    errorMessage.value = '请选择源仓库'
    return
  }
  if (!toWarehouseId.value) {
    errorMessage.value = '请选择目标仓库'
    return
  }
  if (fromWarehouseId.value === toWarehouseId.value) {
    errorMessage.value = '源仓库与目标仓库不能相同'
    return
  }
  const lines = draftRows.value
    .filter(row => row.sku && Number(row.quantity) > 0)
    .map(row => ({ sku: row.sku, quantity: Number(row.quantity) }))
  if (!lines.length) {
    errorMessage.value = '请至少添加一行调拨商品'
    return
  }
  const seen = new Set<string>()
  for (const line of lines) {
    if (seen.has(line.sku)) {
      errorMessage.value = '同一商品只能添加一行'
      return
    }
    seen.add(line.sku)
  }
  const shortage = lines.find(line => availableOf(line.sku) < line.quantity)
  if (shortage) {
    errorMessage.value = '商品 ' + shortage.sku + ' 超出源仓可用库存（可用 ' + availableOf(shortage.sku) + '）'
    return
  }
  await runSubmit()
  emit('confirm', {
    fromWarehouseId: fromWarehouseId.value,
    toWarehouseId: toWarehouseId.value,
    lines
  })
  open.value = false
}

async function executeTransfer() {
  if (!props.transfer) return
  await runSubmit()
  emit('execute', props.transfer.id)
  open.value = false
}

const lineColumns: TableColumn<TransferLine>[] = [
  { accessorKey: 'lineNo', header: '序号', meta: { class: { th: 'w-12', td: 'text-muted' } } },
  { accessorKey: 'name', header: '商品', meta: { class: { td: 'whitespace-normal' } } },
  { accessorKey: 'sku', header: 'SKU', meta: { class: { td: 'font-mono text-[11px] text-muted' } } },
  { accessorKey: 'quantity', header: '数量', meta: { class: { th: 'text-right', td: 'text-right tabular-nums' } } },
  { accessorKey: 'unit', header: '单位', meta: { class: { td: 'text-muted' } } }
]
</script>

<template>
  <USlideover
    v-model:open="open"
    :ui="{ content: 'w-full sm:max-w-2xl' }"
    data-testid="transfer-form"
  >
    <template #header>
      <div class="flex items-center justify-between gap-2">
        <div>
          <p class="text-sm font-semibold text-highlighted">
            {{ isView ? '调拨单 ' + transfer?.id : '新建调拨单' }}
          </p>
          <p class="mt-0.5 text-xs text-muted">
            确认后从源仓扣减、目标仓增加，并生成调拨流水
          </p>
        </div>
        <UBadge
          v-if="transfer"
          :color="transferStatusColors[transfer.status]"
          variant="subtle"
          size="sm"
          :label="transferStatusLabels[transfer.status]"
        />
      </div>
    </template>

    <template #body>
      <div class="space-y-4">
        <template v-if="isView && transfer">
          <div class="flex items-center justify-between gap-3 rounded-sm border border-default p-3">
            <div>
              <p class="text-[11px] text-muted">
                调拨路径
              </p>
              <p class="mt-1 text-sm text-default">
                {{ warehouseName(transfer.fromWarehouseId) }}
                <UIcon name="i-carbon-arrow-right" class="mx-1 inline size-3.5 text-muted" />
                {{ warehouseName(transfer.toWarehouseId) }}
              </p>
            </div>
            <UBadge
              :color="transferStatusColors[transfer.status]"
              variant="subtle"
              size="sm"
              :label="transferStatusLabels[transfer.status]"
            />
          </div>

          <dl class="grid grid-cols-3 gap-3 text-sm">
            <div>
              <dt class="text-[11px] text-muted">
                负责人
              </dt>
              <dd class="mt-0.5 text-default">
                {{ transfer.owner }}
              </dd>
            </div>
            <div>
              <dt class="text-[11px] text-muted">
                创建时间
              </dt>
              <dd class="mt-0.5 tabular-nums text-default">
                {{ transfer.createdAt }}
              </dd>
            </div>
            <div>
              <dt class="text-[11px] text-muted">
                商品行数
              </dt>
              <dd class="mt-0.5 tabular-nums text-default">
                {{ transfer.lines.length }} 行
              </dd>
            </div>
          </dl>

          <ResizableTable
            :data="transfer.lines"
            :columns="lineColumns"
            class="nx-table"
            :ui="{ th: 'py-2.5', td: 'py-2' }"
            data-testid="transfer-lines"
          />

          <p class="text-xs text-muted">
            {{ transfer.status === 'draft' ? '该调拨单待执行，执行后不可再次调整。仅本次预览，刷新后恢复。' : '该调拨单已执行，库存已按调拨行更新。' }}
          </p>
        </template>

        <template v-else>
          <div class="grid gap-3 sm:grid-cols-2">
            <UFormField label="源仓库" required>
              <USelect
                v-model="fromWarehouseId"
                :items="warehouseItems"
                class="w-full"
                data-testid="transfer-from"
              />
            </UFormField>
            <UFormField label="目标仓库" required>
              <USelect
                v-model="toWarehouseId"
                :items="targetWarehouseItems"
                placeholder="选择目标仓库"
                class="w-full"
                data-testid="transfer-to"
              />
            </UFormField>
          </div>

          <div class="flex items-center justify-between gap-2 border-b border-default pb-2">
            <div class="flex items-center gap-2">
              <p class="text-sm font-medium text-highlighted">
                调拨商品
              </p>
              <UBadge variant="subtle" color="neutral" size="sm">
                {{ draftRows.length }} 行
              </UBadge>
            </div>
            <UButton
              label="添加商品"
              icon="i-carbon-add"
              color="neutral"
              variant="outline"
              size="xs"
              data-testid="transfer-add-line"
              @click="addDraftRow"
            />
          </div>

          <div class="space-y-2">
            <div
              v-for="row in draftRows"
              :key="row.key"
              class="flex items-center gap-2 rounded-sm border border-default p-2.5"
              data-testid="transfer-line-editor"
            >
              <USelect
                v-model="row.sku"
                :items="skuItems"
                placeholder="选择源仓商品"
                class="min-w-0 flex-1"
                data-testid="transfer-sku"
              />
              <UInput
                :model-value="row.quantity"
                type="number"
                :min="1"
                class="w-24"
                data-testid="transfer-qty"
                @update:model-value="updateQuantity(row, $event)"
              />
              <span class="w-20 shrink-0 text-right text-[11px] tabular-nums text-muted">
                可用 {{ row.sku ? formatNumber(availableOf(row.sku)) : '—' }}
              </span>
              <UButton
                icon="i-carbon-close"
                color="neutral"
                variant="ghost"
                size="xs"
                :disabled="draftRows.length <= 1"
                aria-label="移除商品行"
                data-testid="transfer-remove"
                @click="removeDraftRow(row.key)"
              />
            </div>
          </div>

          <UAlert
            v-if="errorMessage"
            color="error"
            variant="soft"
            icon="i-carbon-warning"
            :description="errorMessage"
            data-testid="transfer-error"
          />

          <p class="text-xs text-muted">
            生成调拨单后立即执行并更新两边库存；仅本次预览，刷新后恢复初始数据。
          </p>
        </template>
      </div>
    </template>

    <template #footer>
      <div class="flex w-full items-center justify-end gap-2">
        <UButton
          label="取消"
          color="neutral"
          variant="ghost"
          :disabled="submitting"
          data-testid="transfer-cancel"
          @click="open = false"
        />
        <template v-if="isView && transfer">
          <UButton
            v-if="transfer.status === 'draft'"
            label="执行调拨"
            icon="i-carbon-play"
            :loading="submitting"
            data-testid="transfer-execute"
            @click="executeTransfer"
          />
          <UButton
            v-else
            label="关闭"
            color="neutral"
            variant="outline"
            data-testid="transfer-close"
            @click="open = false"
          />
        </template>
        <UButton
          v-else
          label="生成调拨单并执行"
          icon="i-carbon-arrows-horizontal"
          :loading="submitting"
          data-testid="transfer-submit"
          @click="submit"
        />
      </div>
    </template>
  </USlideover>
</template>

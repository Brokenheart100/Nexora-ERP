<script setup lang="ts">
import type { InventoryPosition, Stocktake, StocktakeLine, Warehouse } from '~/mocks'
import { stocktakeStatusColors, stocktakeStatusLabels } from '~/mocks'
import type { TableColumn } from '@nuxt/ui'

interface CountRow {
  lineNo: number
  sku: string
  name: string
  systemQty: number
  countedQty: number
  unit: string
}

const props = defineProps<{
  stocktake?: Stocktake | null
  warehouses: Warehouse[]
  positions: InventoryPosition[]
}>()

const emit = defineEmits<{
  save: [payload: { warehouseId: string, lines: StocktakeLine[] }]
  update: [payload: { id: string, lines: StocktakeLine[] }]
  complete: [payload: { id: string, lines: StocktakeLine[] }]
}>()

const open = defineModel<boolean>('open', { default: false })
const { loading: submitting, run: runSubmit } = useMockAsync(async () => undefined, { delay: 700 })

const warehouseId = ref('')
const rows = ref<CountRow[]>([])
const errorMessage = ref('')

const isEdit = computed(() => Boolean(props.stocktake))
const isCompleted = computed(() => props.stocktake?.status === 'completed')
const warehouseItems = computed(() => props.warehouses.map(warehouse => ({
  label: warehouse.name + '（' + warehouse.city + '）',
  value: warehouse.id
})))
const warehouseName = computed(() => props.warehouses.find(warehouse => warehouse.id === warehouseId.value)?.name ?? '—')
const diffRows = computed(() => rows.value.filter(row => row.countedQty - row.systemQty !== 0))

const columns: TableColumn<CountRow>[] = [
  { accessorKey: 'lineNo', header: '序号', meta: { class: { th: 'w-12', td: 'text-muted' } } },
  { accessorKey: 'name', header: '商品', meta: { class: { td: 'min-w-[200px] whitespace-normal' } } },
  { accessorKey: 'sku', header: 'SKU', meta: { class: { td: 'font-mono text-[11px] text-muted' } } },
  { accessorKey: 'systemQty', header: '账面数', meta: { class: { th: 'text-right', td: 'text-right tabular-nums' } } },
  { accessorKey: 'countedQty', header: '实盘数', meta: { class: { th: 'w-32 text-right', td: 'text-right' } } },
  { id: 'diff', header: '差异', meta: { class: { th: 'w-24 text-right', td: 'text-right' } } },
  { accessorKey: 'unit', header: '单位', meta: { class: { th: 'w-16', td: 'text-muted' } } }
]

function syncRows() {
  rows.value = props.positions
    .filter(position => position.warehouseId === warehouseId.value)
    .map((position, index) => ({
      lineNo: index + 1,
      sku: position.sku,
      name: position.name,
      systemQty: position.quantity,
      countedQty: position.quantity,
      unit: position.unit
    }))
}

function reset() {
  errorMessage.value = ''
  if (props.stocktake) {
    warehouseId.value = props.stocktake.warehouseId
    rows.value = props.stocktake.lines.map(line => ({ ...line }))
    return
  }
  warehouseId.value = props.warehouses.find(warehouse => warehouse.status === 'active')?.id
    ?? props.warehouses[0]?.id
    ?? ''
  syncRows()
}

watch(open, (value) => {
  if (value) reset()
}, { immediate: true })
watch(warehouseId, () => {
  if (!isEdit.value) syncRows()
})

function diffOf(row: CountRow) {
  return row.countedQty - row.systemQty
}
function diffLabel(row: CountRow) {
  const diff = diffOf(row)
  return diff > 0 ? '+' + diff : String(diff)
}
function diffColor(row: CountRow): 'success' | 'error' | 'neutral' {
  const diff = diffOf(row)
  if (diff === 0) return 'neutral'
  return diff > 0 ? 'success' : 'error'
}

function updateCounted(row: CountRow, value: string | number) {
  const parsed = typeof value === 'number' ? value : Number(value)
  row.countedQty = Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0
  errorMessage.value = ''
}

function buildLines(): StocktakeLine[] {
  return rows.value.map((row, index) => ({
    lineNo: index + 1,
    sku: row.sku,
    name: row.name,
    systemQty: row.systemQty,
    countedQty: Number(row.countedQty),
    unit: row.unit
  }))
}

function validate() {
  if (!warehouseId.value) return '请选择盘点仓库'
  if (!rows.value.length) return '该仓库没有可盘点的库存位置'
  const invalid = rows.value.find(row => !Number.isFinite(row.countedQty) || row.countedQty < 0)
  if (invalid) return '第 ' + invalid.lineNo + ' 行实盘数无效'
  return ''
}

async function submitSave() {
  const error = validate()
  if (error) {
    errorMessage.value = error
    return
  }
  await runSubmit()
  if (props.stocktake) {
    emit('update', { id: props.stocktake.id, lines: buildLines() })
  } else {
    emit('save', { warehouseId: warehouseId.value, lines: buildLines() })
  }
  open.value = false
}

async function submitComplete() {
  if (!props.stocktake) return
  const error = validate()
  if (error) {
    errorMessage.value = error
    return
  }
  await runSubmit()
  emit('complete', { id: props.stocktake.id, lines: buildLines() })
  open.value = false
}
</script>

<template>
  <USlideover
    v-model:open="open"
    :ui="{ content: 'w-full sm:max-w-3xl' }"
    data-testid="stocktake-form"
  >
    <template #header>
      <div class="flex items-center justify-between gap-2">
        <div>
          <p class="text-sm font-semibold text-highlighted">
            {{ isEdit ? '盘点单 ' + stocktake?.id : '新建盘点单' }}
          </p>
          <p class="mt-0.5 text-xs text-muted">
            录入实盘数，差异 = 实盘数 - 账面数；完成盘点后回写库存位置并生成盘点调整流水
          </p>
        </div>
        <UBadge
          v-if="stocktake"
          :color="stocktakeStatusColors[stocktake.status]"
          variant="subtle"
          size="sm"
          :label="stocktakeStatusLabels[stocktake.status]"
        />
      </div>
    </template>

    <template #body>
      <div class="space-y-4">
        <UFormField v-if="!isEdit" label="盘点仓库" required>
          <USelect
            v-model="warehouseId"
            :items="warehouseItems"
            class="w-full sm:w-72"
            data-testid="stocktake-warehouse"
          />
        </UFormField>

        <dl v-else class="grid grid-cols-3 gap-3 rounded-sm border border-default p-3 text-sm">
          <div>
            <dt class="text-[11px] text-muted">
              盘点仓库
            </dt>
            <dd class="mt-0.5 text-default">
              {{ warehouseName }}
            </dd>
          </div>
          <div>
            <dt class="text-[11px] text-muted">
              负责人
            </dt>
            <dd class="mt-0.5 text-default">
              {{ stocktake?.owner }}
            </dd>
          </div>
          <div>
            <dt class="text-[11px] text-muted">
              创建时间
            </dt>
            <dd class="mt-0.5 tabular-nums text-default">
              {{ stocktake?.createdAt }}
            </dd>
          </div>
        </dl>

        <div class="flex flex-wrap items-center justify-between gap-2 border-b border-default pb-2">
          <div class="flex items-center gap-2">
            <p class="text-sm font-medium text-highlighted">
              实盘明细
            </p>
            <UBadge variant="subtle" color="neutral" size="sm">
              {{ rows.length }} 行
            </UBadge>
            <UBadge
              v-if="diffRows.length"
              variant="subtle"
              color="warning"
              size="sm"
            >
              差异 {{ diffRows.length }} 行
            </UBadge>
          </div>
          <p class="text-xs text-muted">
            账面数来自当前库存位置
          </p>
        </div>

        <ResizableTable
          :data="rows"
          :columns="columns"
          class="nx-table"
          :ui="{ th: 'py-2.5', td: 'py-2' }"
          data-testid="stocktake-table"
        >
          <template #countedQty-cell="{ row }">
            <UInput
              :model-value="row.original.countedQty"
              type="number"
              :min="0"
              :disabled="isCompleted"
              class="ml-auto w-24"
              data-testid="stocktake-counted"
              @update:model-value="updateCounted(row.original, $event)"
            />
          </template>
          <template #diff-cell="{ row }">
            <UBadge
              :color="diffColor(row.original)"
              variant="subtle"
              size="sm"
              data-testid="stocktake-diff"
            >
              {{ diffLabel(row.original) }}
            </UBadge>
          </template>
          <template #empty>
            <div class="py-6 text-center text-xs text-muted" data-testid="stocktake-empty">
              该仓库没有库存位置
            </div>
          </template>
        </ResizableTable>

        <UAlert
          v-if="errorMessage"
          color="error"
          variant="soft"
          icon="i-carbon-warning"
          :description="errorMessage"
          data-testid="stocktake-error"
        />

        <p class="text-xs text-muted">
          {{ isCompleted ? '该盘点单已完成，实盘数只读。' : '保存实盘数不会修改库存；点击「完成盘点」才回写库存位置。仅本次预览，刷新后恢复。' }}
        </p>
      </div>
    </template>

    <template #footer>
      <div class="flex w-full items-center justify-end gap-2">
        <template v-if="isCompleted">
          <UButton
            label="关闭"
            color="neutral"
            variant="ghost"
            data-testid="stocktake-cancel"
            @click="open = false"
          />
        </template>
        <template v-else>
          <UButton
            label="取消"
            color="neutral"
            variant="ghost"
            :disabled="submitting"
            data-testid="stocktake-cancel"
            @click="open = false"
          />
          <template v-if="isEdit">
            <UButton
              label="保存实盘"
              color="neutral"
              variant="outline"
              icon="i-carbon-save"
              :loading="submitting"
              data-testid="stocktake-save"
              @click="submitSave"
            />
            <UButton
              label="完成盘点"
              icon="i-carbon-checkmark"
              :loading="submitting"
              data-testid="stocktake-complete"
              @click="submitComplete"
            />
          </template>
          <UButton
            v-else
            label="创建盘点单"
            icon="i-carbon-add"
            :loading="submitting"
            data-testid="stocktake-create-submit"
            @click="submitSave"
          />
        </template>
      </div>
    </template>
  </USlideover>
</template>

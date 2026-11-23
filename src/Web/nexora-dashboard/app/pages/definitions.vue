<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { DefinitionStatus, ProductCategory, TaxCode, UnitDefinition } from '~/mocks'
import {
  definitionStatusColors,
  definitionStatusLabels,
  productCategories,
  products,
  quotes,
  taxCodeKindLabels,
  taxCodes,
  unitDefinitions
} from '~/mocks'
import { z } from 'zod'
import { useDefinitionsConnection } from '~/composables/catalog/useDefinitionsConnection'
import { definitionInputSchema, type WireDefinition } from '#shared/types/masterdata'

const toast = useToast()
const route = useRoute()
const { loading, run: runRefresh } = useMockRefresh()
const { isLoading: stateLoading, isEmpty: mockEmpty, isError: mockError, isForbidden: mockForbidden } = useMockState()
const connection = useDefinitionsConnection()
const remote = connection.query
const submission = connection.submission
const connected = computed(() => remote.connected)
const isForbidden = computed(() => connected.value ? !remote.auth.user || remote.session.denied || [403, 404].includes(remote.status) || (!remote.loading && !remote.enabled && !remote.problem) : mockForbidden.value)
const isError = computed(() => connected.value ? !!remote.problem && !isForbidden.value : mockError.value)
const isEmpty = computed(() => connected.value ? !remote.loading && remote.enabled && !remote.problem && activeTotal.value === 0 : mockEmpty.value)
const { can } = useMockPermissions()

const tab = ref('categories')
const liveTax = computed(() => connected.value && tab.value === 'taxes')

const tabItems = computed(() => [
  { label: '商品分类', value: 'categories', icon: 'i-carbon-category' },
  { label: '计量单位', value: 'units', icon: 'i-carbon-ruler' },
  { label: '税码', value: 'taxes', icon: 'i-carbon-percentage' }
].filter(item => item.value !== 'taxes' || !connected.value || remote.session.canVisit('/finance')))

const categoryRows = ref<ProductCategory[]>(productCategories.map(category => ({ ...category })))
const unitRows = ref<UnitDefinition[]>(unitDefinitions.map(unit => ({ ...unit })))
const taxRows = ref<TaxCode[]>(taxCodes.map(taxCode => ({ ...taxCode })))

const canEdit = computed(() => connected.value ? connection.canEdit : can('catalog.edit'))
const showSkeleton = computed(() => connected.value ? remote.loading : loading.value || stateLoading.value)
const connectedSchema = definitionInputSchema.pick({ code: true, name: true }).extend({ status: z.enum(['active', 'inactive']) })
const connectedCategories = computed(() => (remote.data?.definitions ?? []).filter(item => item.kind === 'category').map(item => ({ ...item, description: '', productCount: 0, status: item.isActive ? 'active' as const : 'inactive' as const, updatedAt: String(item.version) })))
const connectedUnits = computed(() => (remote.data?.definitions ?? []).filter(item => item.kind === 'unit').map(item => ({ ...item, precision: 0, status: item.isActive ? 'active' as const : 'inactive' as const, updatedAt: String(item.version) })))

const recordLabel = computed(() => {
  if (tab.value === 'categories') return '分类'
  if (tab.value === 'units') return '单位'
  return '税码'
})

const activeTotal = computed(() => {
  if (connected.value) return tab.value === 'categories' ? connectedCategories.value.length : connectedUnits.value.length
  if (tab.value === 'categories') return categoryRows.value.length
  if (tab.value === 'units') return unitRows.value.length
  return taxRows.value.length
})

function categoryRefCount(category: ProductCategory) {
  return products.filter(product => product.category === category.name).length
}

function unitRefCount(unit: UnitDefinition) {
  return products.filter(product => product.unit === unit.name).length
}

function taxRefCount(taxCode: TaxCode) {
  return quotes.reduce((total, quote) => total + quote.lines.filter(line => line.taxRate === taxCode.rate).length, 0)
}

const categoryColumns: TableColumn<ProductCategory>[] = [{
  accessorKey: 'code',
  header: '编码',
  meta: { class: { td: 'whitespace-nowrap font-mono text-[12px] text-muted' } }
}, {
  accessorKey: 'name',
  header: '分类名称',
  meta: { class: { td: 'whitespace-nowrap' } }
}, {
  accessorKey: 'description',
  header: '说明',
  meta: { class: { td: 'min-w-[240px] text-muted' } }
}, {
  id: 'refs',
  header: '引用商品数',
  meta: { class: { th: 'text-right', td: 'text-right tabular-nums' } }
}, {
  accessorKey: 'status',
  header: '状态'
}, {
  accessorKey: 'updatedAt',
  header: '更新时间',
  meta: { class: { td: 'whitespace-nowrap text-muted' } }
}, {
  id: 'actions',
  header: '操作',
  meta: { class: { th: 'w-28', td: 'w-28 text-right' } }
}]

const unitColumns: TableColumn<UnitDefinition>[] = [{
  accessorKey: 'code',
  header: '编码',
  meta: { class: { td: 'whitespace-nowrap font-mono text-[12px] text-muted' } }
}, {
  accessorKey: 'name',
  header: '单位名称',
  meta: { class: { td: 'whitespace-nowrap' } }
}, {
  accessorKey: 'precision',
  header: '精度',
  meta: { class: { th: 'text-right', td: 'text-right tabular-nums' } }
}, {
  id: 'refs',
  header: '引用商品数',
  meta: { class: { th: 'text-right', td: 'text-right tabular-nums' } }
}, {
  accessorKey: 'status',
  header: '状态'
}, {
  accessorKey: 'updatedAt',
  header: '更新时间',
  meta: { class: { td: 'whitespace-nowrap text-muted' } }
}, {
  id: 'actions',
  header: '操作',
  meta: { class: { th: 'w-28', td: 'w-28 text-right' } }
}]

const taxColumns: TableColumn<TaxCode>[] = [{
  accessorKey: 'code',
  header: '编码',
  meta: { class: { td: 'whitespace-nowrap font-mono text-[12px] text-muted' } }
}, {
  accessorKey: 'name',
  header: '税码名称',
  meta: { class: { td: 'whitespace-nowrap' } }
}, {
  accessorKey: 'rate',
  header: '税率',
  meta: { class: { th: 'text-right', td: 'text-right tabular-nums' } }
}, {
  accessorKey: 'kind',
  header: '类型'
}, {
  id: 'refs',
  header: '引用报价行',
  meta: { class: { th: 'text-right', td: 'text-right tabular-nums' } }
}, {
  accessorKey: 'status',
  header: '状态'
}, {
  accessorKey: 'updatedAt',
  header: '更新时间',
  meta: { class: { td: 'whitespace-nowrap text-muted' } }
}, {
  id: 'actions',
  header: '操作',
  meta: { class: { th: 'w-28', td: 'w-28 text-right' } }
}]

function pad(value: number) {
  return String(value).padStart(2, '0')
}

function formatNow() {
  const now = new Date()
  return now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate()) + ' ' + pad(now.getHours()) + ':' + pad(now.getMinutes())
}

const definitionStatusSchema = z.enum(['active', 'inactive'])
const categoryDefinitionSchema = z.object({
  code: z.string().trim().min(1, '请填写分类编码').max(20, '编码不能超过 20 个字符'),
  name: z.string().trim().min(1, '请填写分类名称').max(40, '分类名称不能超过 40 个字符'),
  description: z.string().trim().max(120, '说明不能超过 120 个字符'),
  status: definitionStatusSchema
})
const unitDefinitionSchema = z.object({
  code: z.string().trim().min(1, '请填写单位编码').max(20, '编码不能超过 20 个字符'),
  name: z.string().trim().min(1, '请填写单位名称').max(20, '单位名称不能超过 20 个字符'),
  precision: z.number().int('精度必须是整数').min(0, '精度不能为负数').max(6, '精度不能超过 6 位'),
  status: definitionStatusSchema
})
const taxCodeSchema = z.object({
  code: z.string().trim().min(1, '请填写税码编码').max(20, '编码不能超过 20 个字符'),
  name: z.string().trim().min(1, '请填写税码名称').max(40, '税码名称不能超过 40 个字符'),
  rate: z.string().trim().regex(/^\d{1,2}(\.\d{1,2})?%$/, '税率格式如 13%'),
  taxKind: z.enum(['output', 'input']),
  status: definitionStatusSchema
})

const drawerOpen = ref(false)
const drawerMode = ref<'create' | 'edit'>('create')
const editingId = ref<string | null>(null)
const form = reactive({
  code: '',
  name: '',
  description: '',
  precision: 0,
  rate: '13%',
  taxKind: 'output' as 'output' | 'input',
  status: 'active' as DefinitionStatus
})

const drawerTitle = computed(() => (drawerMode.value === 'create' ? '新建' : '编辑') + recordLabel.value)
const activeFormId = computed(() => {
  if (tab.value === 'categories') return 'definition-category-form'
  if (tab.value === 'units') return 'definition-unit-form'
  return 'definition-tax-form'
})

async function openCreate() {
  if (connected.value && !await connection.open()) return
  if (!canEdit.value) {
    toast.add({ title: '没有编辑权限', description: '?state=forbidden 演示只读身份。', color: 'error' })
    return
  }
  drawerMode.value = 'create'
  editingId.value = null
  form.code = ''
  form.name = ''
  form.description = ''
  form.precision = 0
  form.rate = '13%'
  form.taxKind = 'output'
  form.status = 'active'
  drawerOpen.value = true
}

async function openCategoryEditor(category: ProductCategory) {
  if (connected.value) {
    const value = await connection.open(category.id)
    if (value && value !== true) showRemote(value)
    return
  }
  if (!canEdit.value) {
    toast.add({ title: '没有编辑权限', description: '?state=forbidden 演示只读身份。', color: 'error' })
    return
  }
  drawerMode.value = 'edit'
  editingId.value = category.id
  form.code = category.code
  form.name = category.name
  form.description = category.description
  form.status = category.status
  drawerOpen.value = true
}

async function openUnitEditor(unit: UnitDefinition) {
  if (connected.value) {
    const value = await connection.open(unit.id)
    if (value && value !== true) showRemote(value)
    return
  }
  if (!canEdit.value) {
    toast.add({ title: '没有编辑权限', description: '?state=forbidden 演示只读身份。', color: 'error' })
    return
  }
  drawerMode.value = 'edit'
  editingId.value = unit.id
  form.code = unit.code
  form.name = unit.name
  form.precision = unit.precision
  form.status = unit.status
  drawerOpen.value = true
}

function openTaxEditor(taxCode: TaxCode) {
  if (!canEdit.value) {
    toast.add({ title: '没有编辑权限', description: '?state=forbidden 演示只读身份。', color: 'error' })
    return
  }
  drawerMode.value = 'edit'
  editingId.value = taxCode.id
  form.code = taxCode.code
  form.name = taxCode.name
  form.rate = taxCode.rate
  form.taxKind = taxCode.kind
  form.status = taxCode.status
  drawerOpen.value = true
}

function closeDrawer() {
  drawerOpen.value = false
  editingId.value = null
}

async function saveCategory() {
  if (connected.value) {
    if (await connection.save(form, 'category')) closeDrawer()
    return
  }
  const parsed = categoryDefinitionSchema.safeParse(form)
  if (!parsed.success) {
    toast.add({ title: '请检查分类信息', description: parsed.error.issues[0]?.message ?? '表单校验未通过', color: 'error' })
    return
  }
  if (categoryRows.value.some(row => row.code === parsed.data.code && row.id !== editingId.value)) {
    toast.add({ title: '分类编码已存在', description: '请更换编码后再保存。', color: 'error' })
    return
  }
  if (editingId.value) {
    const index = categoryRows.value.findIndex(row => row.id === editingId.value)
    if (index >= 0) {
      categoryRows.value[index] = { ...categoryRows.value[index]!, ...parsed.data, updatedAt: formatNow() }
    }
    toast.add({ title: '已保存分类修改', description: '仅本次预览生效，刷新后恢复初始样例。', color: 'success' })
  } else {
    categoryRows.value.unshift({
      id: 'cat-local-' + Date.now(),
      ...parsed.data,
      productCount: 0,
      updatedAt: formatNow()
    })
    toast.add({ title: '已新增商品分类', description: '仅本次预览生效，刷新后恢复初始样例。', color: 'success' })
  }
  closeDrawer()
}

async function saveUnit() {
  if (connected.value) {
    if (await connection.save(form, 'unit')) closeDrawer()
    return
  }
  const parsed = unitDefinitionSchema.safeParse(form)
  if (!parsed.success) {
    toast.add({ title: '请检查单位信息', description: parsed.error.issues[0]?.message ?? '表单校验未通过', color: 'error' })
    return
  }
  if (unitRows.value.some(row => row.code === parsed.data.code && row.id !== editingId.value)) {
    toast.add({ title: '单位编码已存在', description: '请更换编码后再保存。', color: 'error' })
    return
  }
  if (editingId.value) {
    const index = unitRows.value.findIndex(row => row.id === editingId.value)
    if (index >= 0) {
      unitRows.value[index] = { ...unitRows.value[index]!, ...parsed.data, updatedAt: formatNow() }
    }
    toast.add({ title: '已保存单位修改', description: '仅本次预览生效，刷新后恢复初始样例。', color: 'success' })
  } else {
    unitRows.value.unshift({
      id: 'unit-local-' + Date.now(),
      ...parsed.data,
      updatedAt: formatNow()
    })
    toast.add({ title: '已新增计量单位', description: '仅本次预览生效，刷新后恢复初始样例。', color: 'success' })
  }
  closeDrawer()
}

function saveTaxCode() {
  const parsed = taxCodeSchema.safeParse(form)
  if (!parsed.success) {
    toast.add({ title: '请检查税码信息', description: parsed.error.issues[0]?.message ?? '表单校验未通过', color: 'error' })
    return
  }
  if (taxRows.value.some(row => row.code === parsed.data.code && row.id !== editingId.value)) {
    toast.add({ title: '税码编码已存在', description: '请更换编码后再保存。', color: 'error' })
    return
  }
  if (editingId.value) {
    const index = taxRows.value.findIndex(row => row.id === editingId.value)
    if (index >= 0) {
      taxRows.value[index] = {
        ...taxRows.value[index]!,
        code: parsed.data.code,
        name: parsed.data.name,
        rate: parsed.data.rate,
        kind: parsed.data.taxKind,
        status: parsed.data.status,
        updatedAt: formatNow()
      }
    }
    toast.add({ title: '已保存税码修改', description: '仅本次预览生效，刷新后恢复初始样例。', color: 'success' })
  } else {
    taxRows.value.unshift({
      id: 'tax-local-' + Date.now(),
      code: parsed.data.code,
      name: parsed.data.name,
      rate: parsed.data.rate,
      kind: parsed.data.taxKind,
      status: parsed.data.status,
      updatedAt: formatNow()
    })
    toast.add({ title: '已新增税码', description: '仅本次预览生效，刷新后恢复初始样例。', color: 'success' })
  }
  closeDrawer()
}

interface DeleteTarget {
  kind: 'category' | 'unit' | 'tax'
  id: string
  name: string
  refs: number
}

const deleteOpen = ref(false)
const deleteTarget = ref<DeleteTarget | null>(null)

const deleteRefLabel = computed(() => (deleteTarget.value?.kind === 'tax' ? '行报价明细引用' : '个商品引用'))

function askDeleteCategory(category: ProductCategory) {
  deleteTarget.value = { kind: 'category', id: category.id, name: category.name, refs: categoryRefCount(category) }
  deleteOpen.value = true
}

function askDeleteUnit(unit: UnitDefinition) {
  deleteTarget.value = { kind: 'unit', id: unit.id, name: unit.name, refs: unitRefCount(unit) }
  deleteOpen.value = true
}

function askDeleteTaxCode(taxCode: TaxCode) {
  deleteTarget.value = { kind: 'tax', id: taxCode.id, name: taxCode.name, refs: taxRefCount(taxCode) }
  deleteOpen.value = true
}

function confirmDelete() {
  const target = deleteTarget.value
  if (!target) return
  if (!canEdit.value) {
    toast.add({ title: '没有编辑权限', description: '?state=forbidden 演示只读身份。', color: 'error' })
    return
  }
  if (target.kind === 'category') {
    categoryRows.value = categoryRows.value.filter(row => row.id !== target.id)
  } else if (target.kind === 'unit') {
    unitRows.value = unitRows.value.filter(row => row.id !== target.id)
  } else {
    taxRows.value = taxRows.value.filter(row => row.id !== target.id)
  }
  toast.add({
    title: '已删除「' + target.name + '」',
    description: '仅本次预览生效，刷新后恢复初始样例；商品与报价中的已存引用不会被级联修改。',
    color: 'success'
  })
  deleteOpen.value = false
  deleteTarget.value = null
}

function refreshDefinitions() {
  if (connected.value) {
    void remote.refresh()
    return
  }
  runRefresh(() => {
    toast.add({
      title: '定义列表已刷新',
      description: '本地模拟数据刷新后恢复初始值。',
      color: 'neutral',
      icon: 'i-carbon-renew'
    })
  })
}

async function reloadPage() {
  await navigateTo({ path: route.path, query: {} })
}

function remoteColumns<T>(columns: TableColumn<T>[]) {
  return columns.filter(column => !('id' in column && column.id === 'refs') && !('accessorKey' in column && ['description', 'precision'].includes(String(column.accessorKey))))
    .map(column => 'accessorKey' in column && column.accessorKey === 'updatedAt' ? { ...column, header: '版本' } : column)
}
const displayedCategoryColumns = computed(() => connected.value ? remoteColumns(categoryColumns) : categoryColumns)
const displayedUnitColumns = computed(() => connected.value ? remoteColumns(unitColumns) : unitColumns)
function showRemote(value: WireDefinition) {
  tab.value = value.kind === 'category' ? 'categories' : 'units'
  drawerMode.value = 'edit'
  editingId.value = value.id
  form.code = value.code
  form.name = value.name
  form.status = value.isActive ? 'active' : 'inactive'
  drawerOpen.value = true
}
async function restoreDefinition() {
  const restored = await connection.resume()
  if (!restored) return
  if (restored.definition) showRemote(restored.definition)
  else {
    drawerMode.value = 'create'
    editingId.value = null
    tab.value = restored.record.payload.kind === 'unit' ? 'units' : 'categories'
  }
  form.code = String(restored.record.payload.code ?? restored.definition?.code ?? '')
  form.name = String(restored.record.payload.name ?? '')
  form.status = restored.record.payload.isActive === false ? 'inactive' : 'active'
  drawerOpen.value = true
}
async function checkDefinition(retry = false) {
  if (await connection.check(retry)) closeDrawer()
}
watch(() => remote.owner, () => {
  closeDrawer()
  form.code = ''
  form.name = ''
  form.description = ''
}, { flush: 'sync' })
</script>

<template>
  <div class="contents">
    <UDashboardPanel id="definitions">
      <template #header>
        <UDashboardNavbar title="定义维护">
          <template #leading>
            <UDashboardSidebarCollapse />
          </template>

          <template #right>
            <UBadge
              :label="connected ? remote.auth.simulated ? 'MSW 模拟接口' : '当前工作区接口' : '本地原型 · 模拟数据'"
              color="neutral"
              variant="subtle"
              size="sm"
            />
            <NotificationButton />
            <UButton
              v-if="!liveTax"
              :label="'新建' + recordLabel"
              icon="i-carbon-add"
              color="primary"
              size="sm"
              :disabled="!canEdit"
              data-testid="definitions-new"
              @click="openCreate"
            />
          </template>
        </UDashboardNavbar>

        <UDashboardToolbar :ui="{ root: 'flex-wrap gap-3 py-2.5' }">
          <template #left>
            <UTabs
              v-model="tab"
              :items="tabItems"
              :content="false"
              size="sm"
              data-testid="definitions-tabs"
            />
          </template>

          <template v-if="!liveTax" #right>
            <p class="text-xs text-muted">
              共 {{ activeTotal }} 条定义
            </p>
            <UTooltip text="刷新列表">
              <UButton
                icon="i-carbon-renew"
                color="neutral"
                variant="ghost"
                size="sm"
                :loading="loading"
                aria-label="刷新定义列表"
                data-testid="definitions-refresh"
                @click="refreshDefinitions"
              />
            </UTooltip>
          </template>
        </UDashboardToolbar>
      </template>

      <template #body>
        <AppBreadcrumb current="定义维护" class="mb-3" />
        <UAlert
          v-if="connected && !liveTax && (submission.record || connection.message)"
          class="mb-3"
          color="warning"
          title="请核对上次操作"
          :description="connection.message"
          data-testid="definitions-recovery"
        >
          <template #actions>
            <UButton v-if="submission.record" label="恢复上次提交" @click="restoreDefinition" />
          </template>
        </UAlert>
        <UCard v-if="liveTax" class="rounded-sm">
          <p class="text-sm text-muted">税码及其生效日期在财务的税务中心统一维护。</p>
          <UButton
            label="查看税率版本" icon="i-carbon-percentage" variant="outline" class="mt-3"
            :to="{ path: '/finance', query: { workspace: remote.session.activeWorkspaceId, tab: 'tax-center' } }"
          />
        </UCard>
        <UCard v-else class="nx-reveal rounded-sm" :ui="{ body: 'p-0 sm:p-0', footer: 'p-0 sm:p-0' }">
          <div v-if="showSkeleton" class="space-y-2 p-4" data-testid="definitions-skeleton">
            <USkeleton v-for="n in 6" :key="n" class="h-9 w-full" />
          </div>
          <div v-else-if="isError" class="p-6" data-testid="definitions-state-error">
            <UAlert
              color="error"
              variant="soft"
              icon="i-carbon-warning-alt"
              :title="connected ? remote.problem : '定义加载失败（演示）'"
              :description="connected ? '请重试读取当前工作区。' : '?state=error 会模拟一次加载失败。'"
              :actions="[{ label: '恢复正常', color: 'neutral', variant: 'outline', size: 'sm', onClick: reloadPage }]"
            />
          </div>
          <div v-else-if="isForbidden" class="py-6" data-testid="definitions-state-forbidden">
            <UEmpty
              variant="naked"
              icon="i-carbon-view-off"
              :title="connected ? '当前身份无权读取定义' : '没有定义读取权限（演示）'"
              :description="connected ? '请登录并选择有权限的工作区。' : '?state=forbidden 模拟读取权限不足。'"
              :actions="[{ label: '恢复正常', color: 'neutral', variant: 'outline', size: 'sm', onClick: reloadPage }]"
            />
          </div>
          <div v-else-if="isEmpty" class="py-6" data-testid="definitions-state-empty">
            <UEmpty
              variant="naked"
              icon="i-carbon-list"
              title="空状态演示"
              description="?state=empty 让定义列表返回 0 条数据；真实空态会引导新增定义。"
              :actions="[{ label: '恢复正常', color: 'neutral', variant: 'outline', size: 'sm', onClick: reloadPage }]"
            />
          </div>
          <div v-else :key="'definitions-' + tab" class="nx-fade">
            <ResizableTable
              v-if="tab === 'categories'"
              :data="connected ? connectedCategories : categoryRows"
              :columns="displayedCategoryColumns"
              class="nx-table"
              :ui="{ th: 'py-2.5', td: 'py-3' }"
              :row-activate="openCategoryEditor"
              data-testid="definitions-categories-table"
            >
              <template #refs-cell="{ row }">
                {{ categoryRefCount(row.original) }}
              </template>
              <template #status-cell="{ row }">
                <UBadge
                  :color="definitionStatusColors[row.original.status]"
                  variant="subtle"
                  size="sm"
                  :label="definitionStatusLabels[row.original.status]"
                />
              </template>
              <template #actions-cell="{ row }">
                <div class="flex justify-end gap-1">
                  <UButton
                    label="编辑"
                    color="neutral"
                    variant="ghost"
                    size="xs"
                    :disabled="!canEdit"
                    data-testid="definitions-edit"
                    @click="openCategoryEditor(row.original)"
                  />
                  <UButton
                    label="删除"
                    color="error"
                    variant="ghost"
                    size="xs"
                    data-testid="definitions-delete"
                    @click="askDeleteCategory(row.original)"
                  />
                </div>
              </template>
              <template #empty>
                <UEmpty
                  variant="naked"
                  icon="i-carbon-category"
                  title="还没有商品分类"
                  description="新增分类后，商品可按分类归档与筛选。"
                  :actions="[{ label: '新建分类', color: 'neutral', variant: 'outline', size: 'sm', onClick: openCreate }]"
                />
              </template>
            </ResizableTable>

            <ResizableTable
              v-else-if="tab === 'units'"
              :data="connected ? connectedUnits : unitRows"
              :columns="displayedUnitColumns"
              class="nx-table"
              :ui="{ th: 'py-2.5', td: 'py-3' }"
              :row-activate="openUnitEditor"
              data-testid="definitions-units-table"
            >
              <template #refs-cell="{ row }">
                {{ unitRefCount(row.original) }}
              </template>
              <template #status-cell="{ row }">
                <UBadge
                  :color="definitionStatusColors[row.original.status]"
                  variant="subtle"
                  size="sm"
                  :label="definitionStatusLabels[row.original.status]"
                />
              </template>
              <template #actions-cell="{ row }">
                <div class="flex justify-end gap-1">
                  <UButton
                    label="编辑"
                    color="neutral"
                    variant="ghost"
                    size="xs"
                    :disabled="!canEdit"
                    data-testid="definitions-edit"
                    @click="openUnitEditor(row.original)"
                  />
                  <UButton
                    label="删除"
                    color="error"
                    variant="ghost"
                    size="xs"
                    data-testid="definitions-delete"
                    @click="askDeleteUnit(row.original)"
                  />
                </div>
              </template>
              <template #empty>
                <UEmpty
                  variant="naked"
                  icon="i-carbon-ruler"
                  title="还没有计量单位"
                  description="新增单位后可在商品与单据行中使用。"
                  :actions="[{ label: '新建单位', color: 'neutral', variant: 'outline', size: 'sm', onClick: openCreate }]"
                />
              </template>
            </ResizableTable>

            <ResizableTable
              v-else
              :data="taxRows"
              :columns="taxColumns"
              class="nx-table"
              :ui="{ th: 'py-2.5', td: 'py-3' }"
              :row-activate="openTaxEditor"
              data-testid="definitions-taxes-table"
            >
              <template #kind-cell="{ row }">
                <UBadge
                  :color="row.original.kind === 'output' ? 'info' : 'neutral'"
                  variant="subtle"
                  size="sm"
                  :label="taxCodeKindLabels[row.original.kind]"
                />
              </template>
              <template #refs-cell="{ row }">
                {{ taxRefCount(row.original) }}
              </template>
              <template #status-cell="{ row }">
                <UBadge
                  :color="definitionStatusColors[row.original.status]"
                  variant="subtle"
                  size="sm"
                  :label="definitionStatusLabels[row.original.status]"
                />
              </template>
              <template #actions-cell="{ row }">
                <div class="flex justify-end gap-1">
                  <UButton
                    label="编辑"
                    color="neutral"
                    variant="ghost"
                    size="xs"
                    :disabled="!canEdit"
                    data-testid="definitions-edit"
                    @click="openTaxEditor(row.original)"
                  />
                  <UButton
                    label="删除"
                    color="error"
                    variant="ghost"
                    size="xs"
                    data-testid="definitions-delete"
                    @click="askDeleteTaxCode(row.original)"
                  />
                </div>
              </template>
              <template #empty>
                <UEmpty
                  variant="naked"
                  icon="i-carbon-percentage"
                  title="还没有税码"
                  description="新增税码后可在报价与订单行中使用。"
                  :actions="[{ label: '新建税码', color: 'neutral', variant: 'outline', size: 'sm', onClick: openCreate }]"
                />
              </template>
            </ResizableTable>
          </div>
        </UCard>
        <p class="mt-2 text-[11px] text-dimmed">
          {{ connected ? '分类与单位来自当前工作区；引用数量及精度未由此接口提供。' : '本地原型 · 模拟数据 · 写操作仅本次预览，刷新后恢复' }}
        </p>
      </template>
    </UDashboardPanel>

    <USlideover v-model:open="drawerOpen" :title="drawerTitle" :ui="{ content: 'sm:max-w-lg' }">
      <template #description>
        <span class="text-sm text-muted">{{ connected ? '编码创建后只读；名称与启用状态按当前版本保存' : '定义仅作用于本地预览，刷新后恢复初始样例' }}</span>
      </template>

      <template #body>
        <UAlert
          v-if="connected && submission.message"
          class="mb-3"
          color="warning"
          :title="submission.message"
          data-testid="definitions-feedback"
        >
          <template #actions>
            <UButton
              v-if="!submission.mutation.unknown"
              label="读取当前版本"
              data-testid="definitions-read-current"
              @click="connection.readCurrent()"
            />
            <UButton
              v-if="submission.failure?.kind === 'mfa'"
              label="重新验证身份"
              :to="'/bff/login?prompt=login&returnTo=' + encodeURIComponent(route.fullPath)"
              external
            />
          </template>
        </UAlert>
        <UAlert
          v-if="connected && submission.mutation.unknown"
          class="mb-3"
          color="warning"
          title="结果待确认"
          data-testid="definitions-unknown"
        >
          <template #actions>
            <UButton label="查询提交结果" :loading="submission.mutation.busy" @click="checkDefinition()" />
            <UButton label="重试原提交" :disabled="!submission.mutation.operation?.retryAvailable || submission.mutation.busy" @click="checkDefinition(true)" />
          </template>
        </UAlert>
        <p v-if="connected && connection.baseline" class="mb-3 text-xs text-muted" data-testid="definitions-version">
          当前版本 {{ connection.baseline.definition.version }} · {{ connection.baseline.definition.name }}
        </p>
        <fieldset :disabled="connected && !!submission.record" class="contents">
          <UForm
            v-if="tab === 'categories'"
            id="definition-category-form"
            :schema="connected ? connectedSchema : categoryDefinitionSchema"
            :state="form"
            class="space-y-4"
            @submit="saveCategory"
          >
            <div class="grid gap-4 sm:grid-cols-2">
              <UFormField
                label="分类编码"
                name="code"
                required
                :error="connected ? submission.fieldError('Code') : undefined"
              >
                <UInput
                  v-model="form.code"
                  :disabled="connected && drawerMode === 'edit'"
                  class="w-full"
                  data-testid="definitions-form-code"
                />
              </UFormField>
              <UFormField
                label="分类名称"
                name="name"
                required
                :error="connected ? submission.fieldError('Name') : undefined"
              >
                <UInput v-model="form.name" class="w-full" data-testid="definitions-form-name" />
              </UFormField>
            </div>
            <UFormField v-if="!connected" label="说明" name="description">
              <UTextarea
                v-model="form.description"
                :rows="3"
                class="w-full"
                data-testid="definitions-form-description"
              />
            </UFormField>
            <UFormField label="状态" name="status">
              <USelect
                v-model="form.status"
                :disabled="connected && drawerMode === 'create'"
                :items="[{ label: '启用', value: 'active' }, { label: '停用', value: 'inactive' }]"
                class="w-full"
                data-testid="definitions-form-status"
              />
            </UFormField>
          </UForm>

          <UForm
            v-else-if="tab === 'units'"
            id="definition-unit-form"
            :schema="connected ? connectedSchema : unitDefinitionSchema"
            :state="form"
            class="space-y-4"
            @submit="saveUnit"
          >
            <div class="grid gap-4 sm:grid-cols-2">
              <UFormField
                label="单位编码"
                name="code"
                required
                :error="connected ? submission.fieldError('Code') : undefined"
              >
                <UInput
                  v-model="form.code"
                  :disabled="connected && drawerMode === 'edit'"
                  class="w-full"
                  data-testid="definitions-form-code"
                />
              </UFormField>
              <UFormField
                label="单位名称"
                name="name"
                required
                :error="connected ? submission.fieldError('Name') : undefined"
              >
                <UInput v-model="form.name" class="w-full" data-testid="definitions-form-name" />
              </UFormField>
            </div>
            <div class="grid gap-4 sm:grid-cols-2">
              <UFormField
                v-if="!connected"
                label="小数精度"
                name="precision"
                required
              >
                <UInput
                  v-model.number="form.precision"
                  type="number"
                  min="0"
                  max="6"
                  class="w-full"
                  data-testid="definitions-form-precision"
                />
              </UFormField>
              <UFormField label="状态" name="status">
                <USelect
                  v-model="form.status"
                  :disabled="connected && drawerMode === 'create'"
                  :items="[{ label: '启用', value: 'active' }, { label: '停用', value: 'inactive' }]"
                  class="w-full"
                  data-testid="definitions-form-status"
                />
              </UFormField>
            </div>
          </UForm>

          <UForm
            v-else
            id="definition-tax-form"
            :schema="taxCodeSchema"
            :state="form"
            class="space-y-4"
            @submit="saveTaxCode"
          >
            <div class="grid gap-4 sm:grid-cols-2">
              <UFormField
                label="税码编码"
                name="code"
                required
                :error="connected ? submission.fieldError('Code') : undefined"
              >
                <UInput
                  v-model="form.code"
                  :disabled="connected && drawerMode === 'edit'"
                  class="w-full"
                  data-testid="definitions-form-code"
                />
              </UFormField>
              <UFormField
                label="税码名称"
                name="name"
                required
                :error="connected ? submission.fieldError('Name') : undefined"
              >
                <UInput v-model="form.name" class="w-full" data-testid="definitions-form-name" />
              </UFormField>
            </div>
            <div class="grid gap-4 sm:grid-cols-2">
              <UFormField label="税率" name="rate" required>
                <UInput
                  v-model="form.rate"
                  placeholder="如 13%"
                  class="w-full"
                  data-testid="definitions-form-rate"
                />
              </UFormField>
              <UFormField label="类型" name="taxKind">
                <USelect
                  v-model="form.taxKind"
                  :items="[{ label: '销项', value: 'output' }, { label: '进项', value: 'input' }]"
                  class="w-full"
                  data-testid="definitions-form-kind"
                />
              </UFormField>
            </div>
            <UFormField label="状态" name="status">
              <USelect
                v-model="form.status"
                :disabled="connected && drawerMode === 'create'"
                :items="[{ label: '启用', value: 'active' }, { label: '停用', value: 'inactive' }]"
                class="w-full"
                data-testid="definitions-form-status"
              />
            </UFormField>
          </UForm>
        </fieldset>
      </template>

      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton
            label="取消"
            color="neutral"
            variant="ghost"
            data-testid="definitions-cancel"
            @click="closeDrawer"
          />
          <UButton
            label="保存"
            type="submit"
            :form="activeFormId"
            color="primary"
            :loading="submission.mutation.busy"
            :disabled="connected && !!submission.record"
            data-testid="definitions-save"
          />
        </div>
      </template>
    </USlideover>

    <UModal v-model:open="deleteOpen" title="删除定义">
      <template #body>
        <div class="space-y-3" data-testid="definitions-delete-dialog">
          <p class="text-sm text-default">
            确定删除「{{ deleteTarget?.name }}」吗？
          </p>
          <UAlert
            :color="deleteTarget && deleteTarget.refs > 0 ? 'warning' : 'info'"
            variant="soft"
            icon="i-carbon-warning-alt"
            :title="'当前有 ' + (deleteTarget?.refs ?? 0) + ' ' + deleteRefLabel"
            description="删除只影响本次预览；商品与报价中的已存引用不会被级联修改。"
            data-testid="definitions-delete-count"
          />
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton
            label="取消"
            color="neutral"
            variant="ghost"
            data-testid="definitions-delete-cancel"
            @click="deleteOpen = false"
          />
          <UButton
            label="确认删除"
            color="error"
            data-testid="definitions-delete-confirm"
            @click="confirmDelete"
          />
        </div>
      </template>
    </UModal>
  </div>
</template>

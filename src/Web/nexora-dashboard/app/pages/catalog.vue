<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import { useCatalogConnection } from '~/composables/catalog/useCatalogConnection'
import { useCatalogEditor } from '~/composables/catalog/useCatalogEditor'
import { useScopedSubmission } from '~/composables/api/useScopedSubmission'
import { useMasterDataApi } from '~/composables/api/useMasterDataApi'
import { itemInputSchema } from '#shared/types/masterdata'
import { z } from 'zod'
import { catalogProduct, connectedItemEditSchema } from '~/utils/catalog/adapter'
import type { ChangeEntry, Product, ProductKind, ProductStatus, ProductTracking } from '~/mocks'
import {
  changeLogEntries,
  inventoryPositions,
  productCategories,
  productStatusColors,
  productStatusLabels,
  products,
  taxCodes,
  unitDefinitions,
  purchaseOrders,
  salesOrders
} from '~/mocks'

const toast = useToast()
const route = useRoute()
const { activeWorkspaceId } = useMockWorkspace()
const { loading, run: runRefresh } = useMockRefresh()
const { isLoading: stateLoading, isEmpty: mockEmpty, isError: mockError, isForbidden: mockForbidden } = useMockState()
const remote = useCatalogConnection()
const editor = useCatalogEditor(remote)
const masterDataApi = useMasterDataApi()
const creation = useScopedSubmission('catalog-create', () => remote.canEdit)
const createSchema = z.object({ name: itemInputSchema.shape.name, sku: itemInputSchema.shape.code, category: z.uuid('请选择分类。'), unit: z.uuid('请选择单位。'), kind: z.enum(['goods', 'service']) })
const connected = computed(() => remote.connected)
const isError = computed(() => connected.value ? !!remote.session.error || (!!remote.problem && ![401, 403, 404].includes(remote.problem.status)) : mockError.value)
const isForbidden = computed(() => connected.value ? !remote.auth.user || remote.session.denied || [401, 403, 404].includes(remote.problem?.status ?? 0) : mockForbidden.value)
const isEmpty = computed(() => connected.value ? !remote.loading && !isError.value && !isForbidden.value && remote.page === 1 && remote.rows.length === 0 : mockEmpty.value)
const { can } = useMockPermissions()
const ui = useUiStore()

const densityItems = [
  { label: '舒适', value: 'cozy' },
  { label: '紧凑', value: 'compact' }
]
const tableUi = computed(() => ui.tableDensity === 'compact'
  ? { th: 'py-1.5', td: 'py-2' }
  : { th: 'py-2.5', td: 'py-3' })

const prototypeRows = ref<Product[]>(products.map(product => ({ ...product })))
const rows = computed<Product[]>({ get: () => connected.value ? remote.rows : prototypeRows.value, set: (value) => {
  prototypeRows.value = value
} })
const localEntries = ref<ChangeEntry[]>([])
const searchInput = ref('')
const search = ref('')
const status = ref<'all' | ProductStatus>('all')
const category = ref('all')
const pageSize = 8

const canEdit = computed(() => connected.value ? remote.canEdit : can('catalog.edit'))
const showSkeleton = computed(() => connected.value ? remote.loading : loading.value || stateLoading.value)

const applySearch = useDebounceFn((value: string, owner: string) => {
  if (connected.value && owner !== remote.owner) return
  search.value = value
}, 220)

watch(searchInput, value => applySearch(value, remote.owner))

const statusItems = computed(() => connected.value
  ? [{ label: '全部状态', value: 'all' }, { label: '启用', value: 'active' }, { label: '停用', value: 'archived' }]
  : [
      { label: '全部状态', value: 'all' },
      { label: '在售', value: 'active' },
      { label: '草稿', value: 'draft' },
      { label: '已归档', value: 'archived' }
    ])

const categoryItems = computed(() => {
  const categories = [...new Set(rows.value.map(product => product.category))]
  return [{ label: '全部分类', value: 'all' }, ...categories.map(value => ({ label: value, value }))]
})

const productCategoryOptions = computed(() => connected.value
  ? remote.categoryOptions
  : productCategories
      .filter(categoryItem => categoryItem.status === 'active')
      .map(categoryItem => ({ label: categoryItem.name, value: categoryItem.name })))
const productUnitOptions = computed(() => connected.value
  ? remote.unitOptions
  : unitDefinitions
      .filter(unitItem => unitItem.status === 'active')
      .map(unitItem => ({ label: unitItem.name + '（' + unitItem.code + '）', value: unitItem.name })))
const productTaxOptions = computed(() => taxCodes
  .filter(taxItem => taxItem.status === 'active' && taxItem.kind === 'output')
  .map(taxItem => ({ label: taxItem.name, value: taxItem.rate })))
const kindItems: { label: string, value: ProductKind }[] = [
  { label: '商品', value: 'goods' },
  { label: '服务', value: 'service' }
]
const kindLabels: Record<ProductKind, string> = {
  goods: '商品',
  service: '服务'
}
const trackingItems = [
  { label: '不追踪', value: 'none' },
  { label: '批次追踪', value: 'batch' },
  { label: '序列号追踪', value: 'serial' }
]
const trackingLabels: Record<ProductTracking, string> = {
  none: '不追踪',
  batch: '批次追踪',
  serial: '序列号追踪'
}

const filteredRows = computed(() => {
  if (isForbidden.value || isError.value || isEmpty.value) return []
  const keyword = search.value.trim().toLowerCase()
  return rows.value.filter((product) => {
    if (status.value !== 'all' && product.status !== status.value) return false
    if (category.value !== 'all' && product.category !== category.value) return false
    if (!keyword) return true
    return product.name.toLowerCase().includes(keyword) || product.sku.toLowerCase().includes(keyword)
  })
})

const {
  page: prototypePage,
  pageRows: prototypePageRows,
  pageStart: prototypeStart,
  pageEnd: prototypeEnd,
  resetPage
} = useClientPagination(filteredRows, pageSize)
const page = computed({ get: () => connected.value ? remote.page : prototypePage.value, set: (value) => {
  if (connected.value) remote.page = value
  else prototypePage.value = value
} })
const pageRows = computed(() => connected.value ? filteredRows.value : prototypePageRows.value)
const pageStart = computed(() => connected.value ? filteredRows.value.length ? (remote.page - 1) * pageSize + 1 : 0 : prototypeStart.value)
const pageEnd = computed(() => connected.value ? (remote.page - 1) * pageSize + filteredRows.value.length : prototypeEnd.value)
const paginationTotal = computed(() => connected.value ? (remote.page - 1) * pageSize + remote.rows.length + (remote.hasMore ? 1 : 0) : filteredRows.value.length)

watch([search, status, category], () => {
  if (!connected.value) resetPage()
})

const activeFilters = computed(() => status.value !== 'all' || category.value !== 'all' || searchInput.value.trim() !== '')

function resetFilters() {
  searchInput.value = ''
  search.value = ''
  status.value = 'all'
  category.value = 'all'
}

const emptyKind = computed<'search' | 'filter' | 'all'>(() => {
  if (search.value.trim()) return 'search'
  if (status.value !== 'all' || category.value !== 'all') return 'filter'
  return 'all'
})

const emptyTestId = computed(() => 'catalog-empty-' + emptyKind.value)
const emptyIcon = computed(() => {
  if (emptyKind.value === 'search') return 'i-carbon-search'
  if (emptyKind.value === 'filter') return 'i-carbon-filter'
  return 'i-carbon-catalog'
})
const emptyTitle = computed(() => {
  if (emptyKind.value === 'search') return '没有找到匹配的商品'
  if (emptyKind.value === 'filter') return '当前筛选没有匹配的商品'
  return '商品目录暂无数据'
})
const emptyDescription = computed(() => {
  if (emptyKind.value === 'search') return '没有商品名称或 SKU 命中关键词，试试更换关键词或清空搜索。'
  if (emptyKind.value === 'filter') return '当前状态与分类组合没有结果，清空筛选后可查看全部 ' + rows.value.length + ' 个商品。'
  return connected.value ? '当前工作区暂无商品，创建功能将在后续接入。' : '目录中还没有商品，新建第一个商品开始维护。'
})

const selectedIds = ref<string[]>([])
const selectedCount = computed(() => selectedIds.value.length)
const pageAllSelected = computed(() => pageRows.value.length > 0 && pageRows.value.every(product => selectedIds.value.includes(product.id)))

function toggleRow(id: string, checked: boolean | 'indeterminate') {
  if (checked === true) {
    if (!selectedIds.value.includes(id)) selectedIds.value = [...selectedIds.value, id]
    return
  }
  selectedIds.value = selectedIds.value.filter(item => item !== id)
}

function togglePageSelection(checked: boolean | 'indeterminate') {
  const ids = pageRows.value.map(product => product.id)
  if (checked === true) {
    selectedIds.value = [...new Set([...selectedIds.value, ...ids])]
    return
  }
  selectedIds.value = selectedIds.value.filter(id => !ids.includes(id))
}

function clearSelection() {
  selectedIds.value = []
}

const columns = computed<TableColumn<Product>[]>(() => [{
  id: 'select',
  header: '选择',
  meta: { class: { th: 'w-10', td: 'w-10' } }
}, {
  accessorKey: 'sku',
  header: 'SKU',
  meta: { class: { td: 'whitespace-nowrap font-mono text-[12px] text-muted' } }
}, {
  accessorKey: 'name',
  header: '商品名称',
  meta: { class: { td: 'min-w-[260px] whitespace-normal' } }
}, {
  accessorKey: 'category',
  header: '分类'
}, {
  id: 'kind',
  header: '类型',
  meta: { class: { td: 'whitespace-nowrap' } }
}, {
  accessorKey: 'status',
  header: '状态'
}, {
  accessorKey: 'updatedAt',
  header: connected.value ? '版本' : '更新时间',
  meta: { class: { td: 'whitespace-nowrap text-muted' } }
}, {
  id: 'actions',
  header: '操作',
  meta: { class: { th: 'w-28', td: 'w-28 text-right' } }
}])

function pad(value: number) {
  return String(value).padStart(2, '0')
}

function formatNow() {
  const now = new Date()
  return now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate()) + ' ' + pad(now.getHours()) + ':' + pad(now.getMinutes())
}

let localSeq = 0

function makeLocalEntry(product: Product, action: string, summary: string, at: string): ChangeEntry {
  localSeq += 1
  return {
    id: 'chg-local-' + localSeq + '-' + product.id,
    workspaceId: activeWorkspaceId.value,
    entityType: 'product',
    entityId: product.id,
    entityName: product.name,
    action,
    actor: '当前用户',
    summary,
    at
  }
}

const drawerOpen = ref(false)
const current = ref<Product | null>(null)
const editForm = reactive({
  name: '',
  sku: '',
  category: '',
  unit: '',
  kind: 'goods' as ProductKind,
  price: 0,
  stock: 0,
  status: 'active' as ProductStatus,
  brand: '',
  barcode: '',
  spec: '',
  tracking: 'none' as ProductTracking,
  taxRate: '13%'
})

async function openEditor(product: Product) {
  if (connected.value) {
    if (!canEdit.value) {
      openDetail(product)
      return
    }
    const item = await editor.open(product.id)
    if (!item) return
    populateEditor(catalogProduct(item, remote.definitions))
    editForm.category = item.categoryId
    editForm.unit = item.unitId
    return
  }
  populateEditor(product)
}

function populateEditor(product: Product) {
  returnToDetailId.value = null
  current.value = product
  editForm.name = product.name
  editForm.sku = product.sku
  editForm.category = product.category
  editForm.unit = product.unit
  editForm.kind = product.kind ?? 'goods'
  editForm.price = product.price
  editForm.stock = product.stock
  editForm.status = product.status
  editForm.brand = product.brand ?? ''
  editForm.barcode = product.barcode ?? ''
  editForm.spec = product.spec ?? ''
  editForm.tracking = product.tracking ?? 'none'
  editForm.taxRate = product.taxRate ?? '13%'
  drawerOpen.value = true
}

const createOpen = ref(false)
const createForm = reactive({
  name: '',
  sku: '',
  category: '',
  unit: '',
  kind: 'goods' as ProductKind,
  price: 0,
  stock: 0,
  status: 'draft' as ProductStatus,
  brand: '',
  barcode: '',
  spec: '',
  tracking: 'none' as ProductTracking,
  taxRate: '13%'
})

function openCreate() {
  if (connected.value) {
    if (creation.record) return
    creation.reset()
  }
  if (!canEdit.value) {
    toast.add({ title: '没有编辑权限', description: '?state=forbidden 演示只读身份。', color: 'error' })
    return
  }
  createForm.name = ''
  createForm.sku = ''
  createForm.category = ''
  createForm.unit = ''
  createForm.kind = 'goods'
  createForm.price = 0
  createForm.stock = 0
  createForm.status = connected.value ? 'active' : 'draft'
  createForm.brand = ''
  createForm.barcode = ''
  createForm.spec = ''
  createForm.tracking = 'none'
  createForm.taxRate = '13%'
  createOpen.value = true
}

async function saveCreate() {
  if (connected.value) {
    const parsed = createSchema.safeParse(createForm)
    if (!parsed.success) return
    const payload = { code: parsed.data.sku, name: parsed.data.name, categoryId: parsed.data.category, unitId: parsed.data.unit,
      kind: parsed.data.kind === 'goods' ? 'product' : 'service', tracksInventory: parsed.data.kind === 'goods' && createForm.tracking !== 'none' }
    if (await creation.send('catalog.item.created', '/bff/api/masterdata/workspaces/' + remote.session.activeWorkspaceId + '/items', payload)) {
      createOpen.value = false
      await remote.refresh()
      toast.add({ title: '商品已创建', description: parsed.data.sku, color: 'success' })
    }
    return
  }
  if (!canEdit.value) {
    toast.add({ title: '没有编辑权限', description: '?state=forbidden 演示只读身份。', color: 'error' })
    return
  }
  const parsed = productEditSchema.safeParse(createForm)
  if (!parsed.success) {
    toast.add({ title: '请检查商品信息', description: parsed.error.issues[0]?.message ?? '表单校验未通过', color: 'error' })
    return
  }
  if (rows.value.some(item => item.sku === parsed.data.sku)) {
    toast.add({ title: 'SKU 已存在', description: '请更换 SKU 后再保存。', color: 'error' })
    return
  }
  const at = formatNow()
  const product: Product = {
    id: 'p-local-' + Date.now(),
    ...parsed.data,
    tracking: parsed.data.kind === 'service' ? 'none' : parsed.data.tracking,
    updatedAt: at
  }
  rows.value.unshift(product)
  localEntries.value.unshift(makeLocalEntry(product, '创建', '新建商品「' + product.name + '」，SKU 为 ' + product.sku + '。', at))
  createOpen.value = false
  toast.add({ title: '已新建商品', description: '仅本次预览生效，刷新后恢复初始样例。', color: 'success' })
}

async function saveEditor() {
  if (connected.value) {
    const parsed = connectedItemEditSchema.safeParse(editForm)
    if (parsed.success && await editor.save(parsed.data)) {
      drawerOpen.value = false
      toast.add({ title: '商品已保存', color: 'success' })
    }
    return
  }
  if (!canEdit.value) {
    toast.add({ title: '没有编辑权限', description: '?state=forbidden 演示只读身份。', color: 'error' })
    return
  }

  const product = current.value
  if (!product) return

  const parsed = productEditSchema.safeParse(editForm)
  if (!parsed.success) {
    toast.add({ title: '请检查商品信息', description: parsed.error.issues[0]?.message ?? '表单校验未通过', color: 'error' })
    return
  }

  if (rows.value.some(item => item.sku === parsed.data.sku && item.id !== product.id)) {
    toast.add({ title: 'SKU 已存在', description: '请更换 SKU 后再保存。', color: 'error' })
    return
  }

  const index = rows.value.findIndex(item => item.id === product.id)
  const at = formatNow()
  if (index >= 0) {
    rows.value[index] = {
      ...rows.value[index]!,
      name: parsed.data.name,
      sku: parsed.data.sku,
      category: parsed.data.category,
      unit: parsed.data.unit,
      kind: parsed.data.kind,
      price: parsed.data.price,
      stock: parsed.data.stock,
      status: parsed.data.status,
      brand: parsed.data.brand,
      barcode: parsed.data.barcode,
      spec: parsed.data.spec,
      tracking: parsed.data.kind === 'service' ? 'none' : parsed.data.tracking,
      taxRate: parsed.data.taxRate,
      updatedAt: at
    }
    localEntries.value.unshift(makeLocalEntry(product, '更新', '编辑商品基础信息，状态为' + productStatusLabels[parsed.data.status] + '。', at))
  }
  const returnDetail = returnToDetailId.value
  returnToDetailId.value = null
  drawerOpen.value = false
  if (returnDetail) detailId.value = returnDetail
  toast.add({ title: '已保存', description: '仅更新本次预览，刷新后恢复初始样例。', color: 'success' })
}

const detailId = ref<string | null>(null)
const linkedId = computed(() => z.uuid().safeParse(route.query.item).data)
const linkedItem = useWorkspaceQuery('command-catalog-item', '/catalog', (id) =>
  linkedId.value ? masterDataApi.item(id, linkedId.value).then(result => result.data) : Promise.resolve(null), () => linkedId.value)
watch(() => linkedItem.data, (item) => {
  if (item) detailId.value = item.id
}, { immediate: true })
const detailOpen = computed({
  get: () => detailId.value !== null,
  set: (value: boolean) => {
    if (!value) detailId.value = null
  }
})
const detailWireItem = computed(() => detailId.value && connected.value
  ? remote.item(detailId.value) ?? (linkedItem.data?.id === detailId.value ? linkedItem.data : null)
  : null)
const detailProduct = computed(() => (detailId.value
  ? rows.value.find(item => item.id === detailId.value) ?? (detailWireItem.value ? catalogProduct(detailWireItem.value, remote.definitions) : null)
  : null))
const returnToDetailId = ref<string | null>(null)

function editFromDetail() {
  const product = detailProduct.value
  if (!product) return
  detailId.value = null
  openEditor(product)
  returnToDetailId.value = product.id
}

const detailPurchaseRefs = computed(() => {
  const sku = detailProduct.value?.sku
  if (!sku) return 0
  return purchaseOrders.filter(order => order.lines.some(line => line.sku === sku)).length
})

const detailSalesRefs = computed(() => {
  const sku = detailProduct.value?.sku
  if (!sku) return 0
  return salesOrders.filter(order => order.lines.some(line => line.sku === sku)).length
})

const detailInventoryRefs = computed(() => {
  const sku = detailProduct.value?.sku
  if (!sku) return 0
  return inventoryPositions.filter(position => position.sku === sku).length
})

const detailRefs = computed(() => detailPurchaseRefs.value + detailSalesRefs.value + detailInventoryRefs.value)

const detailChangeEntries = computed(() => {
  const product = detailProduct.value
  if (!product) return []
  const mockEntries = changeLogEntries.filter(entry => entry.entityType === 'product' && entry.entityId === product.id)
  const local = localEntries.value.filter(entry => entry.entityId === product.id)
  return [...local, ...mockEntries].sort((a, b) => b.at.localeCompare(a.at))
})

function openDetail(product: Product) {
  detailId.value = product.id
}

function toggleArchive() {
  if (connected.value) return
  const product = detailProduct.value
  if (!product) return
  if (!canEdit.value) {
    toast.add({ title: '没有编辑权限', description: '?state=forbidden 演示只读身份。', color: 'error' })
    return
  }
  const next: ProductStatus = product.status === 'archived' ? 'active' : 'archived'
  const action = next === 'archived' ? '归档' : '恢复'
  const at = formatNow()
  rows.value = rows.value.map((item) => {
    if (item.id !== product.id) return item
    return { ...item, status: next, updatedAt: at }
  })
  localEntries.value.unshift(makeLocalEntry(product, action, action === '归档' ? '归档商品，停止在售展示。' : '从归档恢复为在售。', at))
  toast.add({ title: '已' + action + '商品', description: '仅本次预览生效，刷新后恢复初始样例。', color: 'success' })
}

function batchSetStatus(target: ProductStatus) {
  if (connected.value) return
  if (!canEdit.value) {
    toast.add({ title: '没有编辑权限', description: '?state=forbidden 演示只读身份。', color: 'error' })
    return
  }
  const action = target === 'archived' ? '归档' : '恢复'
  const at = formatNow()
  let changed = 0
  rows.value = rows.value.map((product) => {
    if (!selectedIds.value.includes(product.id) || product.status === target) return product
    changed += 1
    localEntries.value.unshift(makeLocalEntry(product, action, action + '商品「' + product.name + '」。', at))
    return { ...product, status: target, updatedAt: at }
  })
  toast.add({
    title: '已批量' + action + ' ' + changed + ' 个商品',
    description: '仅本次预览生效，刷新后恢复初始样例。',
    color: 'success'
  })
  clearSelection()
}

async function reloadPage() {
  await navigateTo({ path: route.path, query: {} })
}

watch(() => remote.owner, () => {
  if (!connected.value) return
  drawerOpen.value = false
  createOpen.value = false
  detailId.value = null
  current.value = null
  editForm.name = ''
  editForm.sku = ''
  editForm.category = ''
  editForm.unit = ''
  clearSelection()
  resetFilters()
}, { flush: 'sync' })

async function resumeSubmission() {
  const resumed = await editor.resume()
  if (!resumed) return
  populateEditor(catalogProduct(resumed.item, remote.definitions))
  editForm.name = resumed.payload.name
  editForm.category = resumed.payload.categoryId
  editForm.unit = resumed.item.unitId
  editForm.status = resumed.payload.isActive ? 'active' : 'archived'
}

async function confirmSubmission(retry = false) {
  if (await (retry ? editor.retry() : editor.check())) {
    drawerOpen.value = false
    toast.add({ title: '已确认本次提交', color: 'success' })
  }
}

const fileInput = ref<HTMLInputElement | null>(null)

const overflowItems = [[{
  label: '导出当前结果（CSV）',
  icon: 'i-carbon-document-export',
  onSelect: exportCatalog
}, {
  label: '导入商品（CSV 演示）',
  disabled: connected.value,
  icon: 'i-carbon-document-import',
  onSelect: () => fileInput.value?.click()
}]]

function exportCatalog() {
  if (connected.value) {
    downloadCsv('商品目录当前页.csv', ['编码', '名称', '分类', '单位', '状态', '版本'], filteredRows.value.map(item => [item.sku, item.name, item.category, item.unit, item.status === 'active' ? '启用' : '停用', item.updatedAt]))
    return
  }
  downloadCsv(
    '商品目录-' + new Date().toISOString().slice(0, 10) + '.csv',
    ['SKU', '商品名称', '分类', '单位', '单价', '库存', '状态', '更新时间'],
    filteredRows.value.map(product => [
      product.sku,
      product.name,
      product.category,
      product.unit,
      product.price,
      product.stock,
      productStatusLabels[product.status],
      product.updatedAt
    ])
  )
  toast.add({
    title: '已导出 ' + filteredRows.value.length + ' 条商品',
    description: 'CSV 由浏览器本地生成，未经过后端。',
    color: 'success',
    icon: 'i-carbon-document-export'
  })
}

async function refreshCatalog() {
  if (connected.value) {
    await remote.session.refreshAccess()
    await remote.refresh()
    return
  }
  runRefresh(() => {
    toast.add({
      title: '商品列表已刷新',
      description: '本地模拟数据刷新后恢复初始值。',
      color: 'neutral',
      icon: 'i-carbon-renew'
    })
  })
}

async function onImportFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  const text = await file.text()
  const count = text.split(/\r?\n/).filter(line => line.trim()).length
  toast.add({
    title: '已读取 ' + Math.max(0, count - 1) + ' 行（演示）',
    description: '本地原型不解析商品字段，刷新后恢复初始样例。',
    color: 'primary',
    icon: 'i-carbon-document-import'
  })
  input.value = ''
}

async function restoreCreation() {
  const saved = creation.resume()
  if (!saved) return
  createForm.name = String(saved.payload.name)
  createForm.sku = String(saved.payload.code)
  createForm.category = String(saved.payload.categoryId)
  createForm.unit = String(saved.payload.unitId)
  createForm.kind = saved.payload.kind === 'service' ? 'service' : 'goods'
  createForm.tracking = saved.payload.tracksInventory ? 'batch' : 'none'
  createForm.status = 'active'
  createOpen.value = true
}
async function checkCreation(retry = false) {
  const confirmed = retry ? await creation.retry() : await creation.check(saved => masterDataApi.receipt(saved.workspaceId, saved.operationId, saved.action))
  if (confirmed) {
    createOpen.value = false
    await remote.refresh()
  }
}
</script>

<template>
  <div class="contents">
    <UDashboardPanel id="catalog">
      <template #header>
        <UDashboardNavbar title="商品目录">
          <template #leading>
            <UDashboardSidebarCollapse />
          </template>

          <template #right>
            <NotificationButton />
            <UButton
              label="新建商品"
              icon="i-carbon-add"
              color="primary"
              size="sm"
              :disabled="!canEdit || (connected && !!creation.record)"
              data-testid="catalog-new"
              @click="openCreate"
            />
            <UDropdownMenu :items="overflowItems" :content="{ align: 'end' }">
              <UButton
                icon="i-carbon-overflow-menu-horizontal"
                color="neutral"
                variant="ghost"
                size="sm"
                aria-label="更多商品操作"
                data-testid="catalog-more"
              />
            </UDropdownMenu>
          </template>
        </UDashboardNavbar>

        <UDashboardToolbar :ui="{ root: 'flex-wrap gap-3 py-2.5' }">
          <template #left>
            <UInput
              v-model="searchInput"
              icon="i-carbon-search"
              placeholder="搜索商品名称或 SKU"
              size="sm"
              class="w-64 max-w-full"
              data-testid="catalog-search"
            />
            <USelect
              v-model="status"
              :items="statusItems"
              size="sm"
              class="w-36"
              data-testid="catalog-status"
            />
            <USelect
              v-model="category"
              :items="categoryItems"
              size="sm"
              class="w-40"
              data-testid="catalog-category"
            />
            <UButton
              v-if="activeFilters"
              label="重置"
              icon="i-carbon-reset"
              color="neutral"
              variant="ghost"
              size="sm"
              @click="resetFilters"
            />
          </template>

          <template #right>
            <p class="text-xs text-muted">
              {{ connected ? '当前页 ' + filteredRows.length + ' 条' : '共 ' + filteredRows.length + ' 条结果' }}<template v-if="selectedCount > 0">
                · 已选 {{ selectedCount }} 项
              </template>
            </p>
            <USelect
              :model-value="ui.tableDensity"
              :items="densityItems"
              size="sm"
              class="w-24"
              aria-label="表格密度"
              data-testid="catalog-density"
              @update:model-value="value => ui.setTableDensity(value === 'compact' ? 'compact' : 'cozy')"
            />
            <UTooltip text="刷新列表">
              <UButton
                icon="i-carbon-renew"
                color="neutral"
                variant="ghost"
                size="sm"
                :loading="showSkeleton"
                aria-label="刷新商品列表"
                data-testid="catalog-refresh"
                @click="refreshCatalog"
              />
            </UTooltip>
          </template>
        </UDashboardToolbar>
      </template>

      <template #body>
        <AppBreadcrumb current="商品目录" class="mb-3" />
        <UAlert
          v-if="connected && creation.record"
          class="mb-3"
          color="warning"
          title="商品创建结果待核对"
          data-testid="catalog-create-recovery"
        >
          <template #actions>
            <UButton label="恢复上次创建" @click="restoreCreation" />
          </template>
        </UAlert>
        <UAlert
          v-if="connected"
          class="mb-3"
          color="neutral"
          variant="subtle"
          :title="remote.auth.simulated ? 'MSW 模拟商品目录' : '当前工作区商品目录'"
          description="当前支持名称、分类和状态维护；搜索与筛选只作用于当前页。"
          data-testid="catalog-data-source"
        />
        <UAlert
          v-if="connected && editor.record && !drawerOpen"
          class="mb-3"
          color="warning"
          title="有待核对或继续的提交"
          description="请先恢复原提交，核对结果后再决定下一步。"
          :actions="[{ label: '恢复上次提交', onClick: resumeSubmission }]"
          data-testid="catalog-recovery-banner"
        />

        <div
          v-if="selectedCount > 0"
          class="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-sm border border-primary/30 bg-primary/5 px-3 py-2"
          data-testid="catalog-batch-bar"
        >
          <p class="text-xs text-default">
            已选 <span class="font-medium tabular-nums" data-testid="catalog-selected-count">{{ selectedCount }}</span>
            个商品
          </p>
          <div class="flex flex-wrap gap-2">
            <UButton
              label="批量归档"
              icon="i-carbon-archive"
              color="neutral"
              variant="outline"
              size="xs"
              :disabled="!canEdit || connected"
              data-testid="catalog-batch-archive"
              @click="batchSetStatus('archived')"
            />
            <UButton
              label="批量恢复"
              icon="i-carbon-renew"
              color="neutral"
              variant="outline"
              size="xs"
              :disabled="!canEdit || connected"
              data-testid="catalog-batch-restore"
              @click="batchSetStatus('active')"
            />
            <UButton
              label="取消选择"
              color="neutral"
              variant="ghost"
              size="xs"
              data-testid="catalog-batch-clear"
              @click="clearSelection"
            />
          </div>
        </div>

        <UCard class="nx-reveal rounded-sm" :ui="{ body: 'p-0 sm:p-0', footer: 'p-0 sm:p-0' }">
          <div v-if="showSkeleton" class="space-y-2 p-4" data-testid="catalog-skeleton">
            <USkeleton v-for="n in 8" :key="n" class="h-9 w-full" />
          </div>
          <div v-else-if="isError" class="p-6" data-testid="catalog-state-error">
            <UAlert
              color="error"
              variant="soft"
              icon="i-carbon-warning-alt"
              :title="connected ? '商品目录暂不可用' : '商品加载失败（演示）'"
              :description="connected ? remote.problem?.message || remote.session.error : '?state=error 会模拟一次加载失败。本原型不会访问后端。'"
              :actions="[{ label: connected ? '重新读取' : '恢复正常', color: 'neutral', variant: 'outline', size: 'sm', onClick: connected ? remote.refresh : reloadPage }]"
            />
          </div>
          <div v-else-if="isForbidden" class="py-6" data-testid="catalog-state-forbidden">
            <UEmpty
              variant="naked"
              icon="i-carbon-view-off"
              :title="connected ? remote.auth.user ? '当前工作区不可访问' : '请先登录' : '没有商品读取权限（演示）'"
              :description="connected ? '请通过左侧用户菜单登录，或选择有权访问的工作区。' : '?state=forbidden 模拟演示身份缺少 catalog.view 权限。'"
              :actions="[{ label: connected ? '重新读取' : '恢复正常', color: 'neutral', variant: 'outline', size: 'sm', onClick: connected ? remote.refresh : reloadPage }]"
            />
          </div>
          <div v-else-if="isEmpty" class="py-6" data-testid="catalog-state-empty">
            <UEmpty
              variant="naked"
              icon="i-carbon-catalog"
              :title="connected ? remote.session.workspace ? '当前工作区暂无商品' : '尚无可用工作区' : '空状态演示'"
              :description="connected ? '可选择其他工作区或稍后重新读取。' : '?state=empty 让商品列表返回 0 条数据；真实空态会引导清空筛选。'"
              :actions="[{ label: connected ? '重新读取' : '恢复正常', color: 'neutral', variant: 'outline', size: 'sm', onClick: connected ? remote.refresh : reloadPage }]"
            />
          </div>
          <div v-else :key="'catalog-page-' + page" class="nx-fade">
            <ResizableTable
              :data="pageRows"
              :columns="columns"
              class="nx-table"
              :ui="tableUi"
              :row-activate="openEditor"
              data-testid="catalog-table"
            >
              <template #select-header>
                <UCheckbox
                  :model-value="pageAllSelected"
                  aria-label="全选当前页商品"
                  data-testid="catalog-select-all"
                  @update:model-value="togglePageSelection"
                />
              </template>
              <template #select-cell="{ row }">
                <UCheckbox
                  :model-value="selectedIds.includes(row.original.id)"
                  :aria-label="'选择商品 ' + row.original.name"
                  data-testid="catalog-select-row"
                  @update:model-value="value => toggleRow(row.original.id, value)"
                />
              </template>
              <template #name-cell="{ row }">
                <p class="text-[13px] leading-5 text-default">
                  {{ row.original.name }}
                </p>
                <p class="mt-0.5 text-[11px] text-muted">
                  {{ row.original.unit }} · {{ row.original.category }}
                </p>
              </template>
              <template #kind-cell="{ row }">
                <div class="flex flex-col gap-1">
                  <UBadge
                    :color="(row.original.kind ?? 'goods') === 'service' ? 'info' : 'neutral'"
                    variant="subtle"
                    size="sm"
                    :label="kindLabels[row.original.kind ?? 'goods']"
                    data-testid="catalog-kind-badge"
                  />
                  <span class="text-[11px] text-muted">
                    {{ connected ? remote.item(row.original.id)?.tracksInventory ? '跟踪库存' : '不跟踪库存' : (row.original.tracking ?? 'none') === 'none' ? '不跟踪库存' : '跟踪库存' }}
                  </span>
                </div>
              </template>
              <template #status-cell="{ row }">
                <UBadge
                  :color="productStatusColors[row.original.status]"
                  variant="subtle"
                  size="sm"
                  :label="connected ? row.original.status === 'active' ? '启用' : '停用' : productStatusLabels[row.original.status]"
                />
              </template>
              <template #actions-cell="{ row }">
                <div class="flex justify-end gap-1">
                  <UButton
                    label="详情"
                    color="neutral"
                    variant="ghost"
                    size="xs"
                    data-testid="catalog-detail"
                    @click="openDetail(row.original)"
                  />
                  <UButton
                    label="编辑"
                    color="neutral"
                    variant="ghost"
                    size="xs"
                    :disabled="!canEdit"
                    data-testid="catalog-edit"
                    @click="openEditor(row.original)"
                  />
                </div>
              </template>
              <template #empty>
                <div :data-testid="emptyTestId">
                  <UEmpty
                    variant="naked"
                    :icon="emptyIcon"
                    :title="emptyTitle"
                    :description="emptyDescription"
                    :actions="activeFilters
                      ? [{ label: '清空筛选', color: 'neutral', variant: 'outline', size: 'sm', onClick: resetFilters }]
                      : connected ? [] : [{ label: '新建商品', color: 'neutral', variant: 'outline', size: 'sm', onClick: openCreate }]"
                  />
                </div>
              </template>
            </ResizableTable>
          </div>

          <template #footer>
            <div
              v-if="!showSkeleton && !isError && !isForbidden && !isEmpty"
              class="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5"
            >
              <p class="text-xs text-muted">
                {{ connected ? '当前第 ' + page + ' 页，共 ' + filteredRows.length + ' 条' + (remote.hasMore ? '，还有下一页' : '') : '第 ' + pageStart + '–' + pageEnd + ' 条，共 ' + filteredRows.length + ' 条' }}
              </p>
              <UPagination
                v-model:page="page"
                :total="paginationTotal"
                :ui="connected ? { first: 'hidden', last: 'hidden' } : undefined"
                :items-per-page="pageSize"
                size="sm"
                data-testid="catalog-pagination"
              />
            </div>
          </template>
        </UCard>
        <p class="mt-2 text-[11px] text-dimmed">
          {{ connected ? remote.auth.simulated ? 'MSW 模拟接口 · 提交通过同源请求验证' : '按当前账号与工作区读取 · 保存后重新查询当前状态' : '本地原型 · 模拟数据 · 写操作仅本次预览，刷新后恢复' }}
        </p>
      </template>
    </UDashboardPanel>

    <USlideover v-model:open="createOpen" title="新建商品" :ui="{ content: 'sm:max-w-lg' }">
      <template #description>
        <span class="text-sm text-muted">{{ connected ? '创建后默认启用，编码与基础单位固定；库存数量由仓库流程维护' : '填写商品基础信息，保存后加入本次预览列表' }}</span>
      </template>

      <template #body>
        <UAlert
          v-if="connected && creation.message"
          class="mb-3"
          color="warning"
          :title="creation.message"
          data-testid="catalog-create-feedback"
        >
          <template #actions>
            <UButton
              v-if="creation.failure?.kind === 'mfa'"
              label="重新验证身份"
              :to="'/bff/login?prompt=login&returnTo=' + encodeURIComponent(route.fullPath)"
              external
            />
          </template>
        </UAlert>
        <UAlert
          v-if="connected && creation.mutation.unknown"
          class="mb-3"
          color="warning"
          title="结果待确认"
          data-testid="catalog-create-unknown"
        >
          <template #actions>
            <UButton label="查询提交结果" :loading="creation.mutation.busy" @click="checkCreation()" />
            <UButton label="重试原提交" :disabled="!creation.mutation.operation?.retryAvailable || creation.mutation.busy" @click="checkCreation(true)" />
          </template>
        </UAlert>
        <fieldset :disabled="connected && !!creation.record" class="contents">
          <UForm
            id="product-create-form"
            data-testid="product-create-form"
            :schema="connected ? createSchema : productEditSchema"
            :state="createForm"
            class="space-y-4"
            @submit="saveCreate"
          >
            <UFormField label="商品名称" name="name" required>
              <UInput v-model="createForm.name" class="w-full" data-testid="catalog-create-name" />
            </UFormField>
            <div class="grid gap-4 sm:grid-cols-2">
              <UFormField label="SKU" name="sku" required>
                <UInput
                  v-model="createForm.sku"
                  placeholder="SKU-1001"
                  class="w-full"
                  data-testid="catalog-create-sku"
                />
              </UFormField>
              <UFormField label="分类" name="category" required>
                <USelect
                  v-model="createForm.category"
                  :items="connected ? remote.definitions.filter(value => value.kind === 'category' && value.isActive).map(value => ({ value: value.id, label: value.name })) : productCategoryOptions"
                  placeholder="选择分类"
                  class="w-full"
                  data-testid="catalog-create-category"
                />
              </UFormField>
            </div>
            <div v-if="!connected" class="grid gap-4 sm:grid-cols-2">
              <UFormField label="品牌" name="brand">
                <UInput
                  v-model="createForm.brand"
                  placeholder="如 ThinkPad"
                  class="w-full"
                  data-testid="catalog-create-brand"
                />
              </UFormField>
              <UFormField label="条码" name="barcode">
                <UInput
                  v-model="createForm.barcode"
                  placeholder="EAN-13 或内部条码"
                  class="w-full"
                  data-testid="catalog-create-barcode"
                />
              </UFormField>
            </div>
            <div class="grid gap-4 sm:grid-cols-2">
              <UFormField label="单位" name="unit" required>
                <USelect
                  v-model="createForm.unit"
                  :items="connected ? remote.definitions.filter(value => value.kind === 'unit' && value.isActive).map(value => ({ value: value.id, label: value.name })) : productUnitOptions"
                  placeholder="选择单位"
                  class="w-full"
                  data-testid="catalog-create-unit"
                />
              </UFormField>
              <UFormField label="类型" name="kind">
                <USelect
                  v-model="createForm.kind"
                  :items="kindItems"
                  class="w-full"
                  data-testid="catalog-create-kind"
                />
              </UFormField>
              <UFormField label="状态" name="status">
                <USelect
                  v-model="createForm.status"
                  :items="connected ? [{ label: '启用', value: 'active' }] : [{ label: '在售', value: 'active' }, { label: '草稿', value: 'draft' }, { label: '已归档', value: 'archived' }]"
                  :disabled="connected"
                  class="w-full"
                  data-testid="catalog-create-status"
                />
              </UFormField>
            </div>
            <UFormField v-if="!connected" label="规格" name="spec">
              <UInput
                v-model="createForm.spec"
                placeholder="如 i7/16G/512G、40×50cm"
                class="w-full"
                data-testid="catalog-create-spec"
              />
            </UFormField>
            <div class="grid gap-4 sm:grid-cols-2">
              <UFormField label="追踪方式" name="tracking">
                <USelect
                  v-model="createForm.tracking"
                  :items="connected ? [{ value: 'none', label: '不跟踪库存' }, { value: 'batch', label: '跟踪库存' }] : trackingItems"
                  :disabled="createForm.kind === 'service'"
                  class="w-full"
                  data-testid="catalog-create-tracking"
                />
              </UFormField>
              <UFormField v-if="!connected" label="销售税率" name="taxRate">
                <USelect
                  v-model="createForm.taxRate"
                  :items="productTaxOptions"
                  class="w-full"
                  data-testid="catalog-create-tax"
                />
              </UFormField>
            </div>
            <UAlert
              color="neutral"
              variant="soft"
              icon="i-carbon-information"
              title="单价与库存不在商品档案维护"
              description="单价在销售 / 采购交易行录入；库存数量由仓库收发货、盘点与调拨流程调整。"
              data-testid="catalog-create-policy"
            />
          </UForm>
        </fieldset>
      </template>

      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton
            label="取消"
            color="neutral"
            variant="ghost"
            data-testid="catalog-create-cancel"
            @click="createOpen = false"
          />
          <UButton
            label="保存"
            type="submit"
            form="product-create-form"
            color="primary"
            :loading="creation.mutation.busy"
            :disabled="connected && !!creation.record"
            data-testid="catalog-create-save"
          />
        </div>
      </template>
    </USlideover>

    <USlideover v-model:open="drawerOpen" title="编辑商品" :ui="{ content: 'sm:max-w-lg' }">
      <template #description>
        <span class="text-sm text-muted">{{ current?.sku }} · {{ connected ? '保存时校验当前记录版本' : '修改后仅作用于本次预览' }}</span>
      </template>

      <template #body>
        <UAlert
          v-if="connected && editor.message"
          class="mb-4"
          color="warning"
          variant="subtle"
          :title="editor.message"
          data-testid="catalog-write-feedback"
        >
          <template #actions>
            <UButton
              v-if="editor.failure?.kind === 'mfa'"
              label="重新验证身份"
              :to="'/bff/login?prompt=login&returnTo=' + encodeURIComponent(route.fullPath)"
              external
            />
            <UButton
              v-if="!editor.mutation.unknown"
              label="读取当前版本"
              :loading="editor.reading"
              data-testid="catalog-read-current"
              @click="editor.readCurrent()"
            />
          </template>
        </UAlert>
        <UAlert
          v-if="connected && editor.mutation.unknown"
          class="mb-4"
          color="warning"
          title="结果待确认"
          description="请先查询原操作，不会自动再次提交。"
          data-testid="catalog-write-unknown"
        >
          <template #actions>
            <UButton
              label="查询提交结果"
              :loading="editor.mutation.busy"
              data-testid="catalog-check-write"
              @click="confirmSubmission()"
            />
            <UButton
              label="重试原提交"
              :disabled="!editor.mutation.operation?.retryAvailable || editor.mutation.busy"
              data-testid="catalog-retry-write"
              @click="confirmSubmission(true)"
            />
          </template>
        </UAlert>
        <p v-if="connected && editor.failure?.traceId" class="mb-3 text-xs text-muted">
          跟踪编号：{{ editor.failure.traceId }}
        </p>
        <p v-if="connected && editor.baseline" class="mb-3 text-xs text-muted" data-testid="catalog-current-version">
          当前版本 {{ editor.baseline.item.version }} · 服务端名称 {{ editor.baseline.item.name }}
        </p>
        <UForm
          id="product-editor"
          :schema="connected ? connectedItemEditSchema : productEditSchema"
          :state="editForm"
          class="space-y-4"
          @submit="saveEditor"
        >
          <UFormField
            label="商品名称"
            name="name"
            required
            :error="connected ? editor.fieldError('Name') : undefined"
          >
            <UInput
              v-model="editForm.name"
              :disabled="connected && !!editor.record"
              class="w-full"
              data-testid="catalog-edit-name"
            />
          </UFormField>
          <div class="grid gap-4 sm:grid-cols-2">
            <UFormField label="SKU" name="sku">
              <UInput v-model="editForm.sku" :disabled="connected" class="w-full" />
            </UFormField>
            <UFormField label="分类" name="category" :error="connected ? editor.fieldError('CategoryId') : undefined">
              <USelect
                v-model="editForm.category"
                :disabled="connected && !!editor.record"
                :items="productCategoryOptions"
                class="w-full"
                data-testid="catalog-edit-category"
              />
            </UFormField>
          </div>
          <div v-if="!connected" class="grid gap-4 sm:grid-cols-2">
            <UFormField label="品牌" name="brand">
              <UInput v-model="editForm.brand" class="w-full" data-testid="catalog-edit-brand" />
            </UFormField>
            <UFormField label="条码" name="barcode">
              <UInput v-model="editForm.barcode" class="w-full" data-testid="catalog-edit-barcode" />
            </UFormField>
          </div>
          <UFormField v-if="!connected" label="规格" name="spec">
            <UInput v-model="editForm.spec" class="w-full" data-testid="catalog-edit-spec" />
          </UFormField>
          <div class="grid gap-4 sm:grid-cols-2">
            <UFormField label="单位" name="unit">
              <USelect
                v-model="editForm.unit"
                :disabled="connected"
                :items="productUnitOptions"
                class="w-full"
                data-testid="catalog-edit-unit"
              />
            </UFormField>
            <UFormField label="类型" name="kind">
              <USelect
                v-model="editForm.kind"
                :disabled="connected"
                :items="kindItems"
                class="w-full"
                data-testid="catalog-edit-kind"
              />
            </UFormField>
          </div>
          <div class="grid gap-4 sm:grid-cols-2">
            <UFormField label="追踪方式" name="tracking">
              <USelect
                v-model="editForm.tracking"
                :items="connected ? [{ value: 'none', label: editor.baseline?.item.tracksInventory ? '跟踪库存' : '不跟踪库存' }] : trackingItems"
                :disabled="connected || editForm.kind === 'service'"
                class="w-full"
                data-testid="catalog-edit-tracking"
              />
            </UFormField>
            <UFormField v-if="!connected" label="销售税率" name="taxRate">
              <USelect
                v-model="editForm.taxRate"
                :items="productTaxOptions"
                class="w-full"
                data-testid="catalog-edit-tax"
              />
            </UFormField>
          </div>
          <UFormField label="状态" name="status" :error="connected ? editor.fieldError('IsActive') : undefined">
            <USelect
              v-model="editForm.status"
              :items="statusItems.filter(item => item.value !== 'all')"
              :disabled="connected && !!editor.record"
              class="w-full"
              data-testid="catalog-edit-status"
            />
          </UFormField>
          <UAlert
            color="neutral"
            variant="soft"
            icon="i-carbon-information"
            title="单价与库存不在商品档案维护"
            description="单价在销售 / 采购交易行录入；库存数量由仓库收发货、盘点与调拨流程调整。"
            data-testid="catalog-edit-policy"
          />
        </UForm>
      </template>

      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton
            label="取消"
            color="neutral"
            variant="ghost"
            @click="drawerOpen = false"
          />
          <UButton
            label="保存"
            type="submit"
            form="product-editor"
            color="primary"
            :disabled="connected && (!canEdit || editor.reading || !!editor.record)"
            :loading="connected && editor.mutation.busy"
            data-testid="catalog-edit-save"
          />
        </div>
      </template>
    </USlideover>

    <USlideover v-model:open="detailOpen" :title="detailProduct?.name ?? '商品详情'" :ui="{ content: 'sm:max-w-xl' }">
      <template #description>
        <span v-if="detailProduct" class="text-sm text-muted">
          {{ detailProduct.sku }} · {{ detailProduct.category }} · {{ productStatusLabels[detailProduct.status] }}
        </span>
      </template>

      <template #body>
        <div v-if="detailProduct" class="space-y-5" data-testid="catalog-detail-panel">
          <div v-if="!connected" class="grid grid-cols-3 gap-2" data-testid="catalog-detail-refs">
            <div class="rounded-sm border border-default p-3">
              <p class="text-[11px] text-muted">
                采购单引用
              </p>
              <p class="mt-1 text-lg font-semibold tabular-nums" data-testid="catalog-detail-purchase-refs">
                {{ detailPurchaseRefs }}
              </p>
            </div>
            <div class="rounded-sm border border-default p-3">
              <p class="text-[11px] text-muted">
                销售单引用
              </p>
              <p class="mt-1 text-lg font-semibold tabular-nums" data-testid="catalog-detail-sales-refs">
                {{ detailSalesRefs }}
              </p>
            </div>
            <div class="rounded-sm border border-default p-3">
              <p class="text-[11px] text-muted">
                库存位置
              </p>
              <p class="mt-1 text-lg font-semibold tabular-nums" data-testid="catalog-detail-inventory-refs">
                {{ detailInventoryRefs }}
              </p>
            </div>
          </div>

          <dl class="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <div>
              <dt class="text-[11px] text-muted">
                商品编号
              </dt>
              <dd class="font-mono text-[12px]">
                {{ detailProduct.id }}
              </dd>
            </div>
            <div>
              <dt class="text-[11px] text-muted">
                单位
              </dt>
              <dd>{{ detailProduct.unit }}</dd>
            </div>
            <div>
              <dt class="text-[11px] text-muted">
                商品 / 服务
              </dt>
              <dd data-testid="catalog-detail-kind">
                {{ kindLabels[detailProduct.kind ?? 'goods'] }}
              </dd>
            </div>
            <div>
              <dt class="text-[11px] text-muted">
                是否跟踪库存
              </dt>
              <dd data-testid="catalog-detail-track-stock">
                {{ connected ? detailWireItem?.tracksInventory ? '是' : '否' : (detailProduct.tracking ?? 'none') === 'none' ? '否' : '是（' + trackingLabels[detailProduct.tracking ?? 'none'] + '）' }}
              </dd>
            </div>
            <div>
              <dt class="text-[11px] text-muted">
                品牌 / 条码
              </dt>
              <dd data-testid="catalog-detail-brand">
                {{ connected ? '扩展信息暂不可用' : (detailProduct.brand || '未填写') + ' / ' + (detailProduct.barcode || '未填写') }}
              </dd>
            </div>
            <div>
              <dt class="text-[11px] text-muted">
                规格 / 税率
              </dt>
              <dd data-testid="catalog-detail-spec">
                {{ connected ? '扩展信息暂不可用' : (detailProduct.spec || '未填写') + ' / ' + (detailProduct.taxRate || '13%') }}
              </dd>
            </div>
            <div>
              <dt class="text-[11px] text-muted">
                追踪方式
              </dt>
              <dd data-testid="catalog-detail-tracking">
                {{ connected ? '追踪明细暂不可用' : trackingLabels[detailProduct.tracking ?? 'none'] }}
              </dd>
            </div>
            <div>
              <dt class="text-[11px] text-muted">
                状态
              </dt>
              <dd>{{ productStatusLabels[detailProduct.status] }}</dd>
            </div>
            <div>
              <dt class="text-[11px] text-muted">
                更新时间
              </dt>
              <dd>{{ detailProduct.updatedAt }}</dd>
            </div>
          </dl>

          <UAlert
            v-if="!connected && detailRefs > 0"
            color="warning"
            variant="soft"
            icon="i-carbon-link"
            :title="'已被 ' + detailRefs + ' 处业务引用'"
            description="停用或归档只影响新单据的选择项；历史采购、销售与库存单据仍保留原商品信息。"
            data-testid="catalog-detail-reference-notice"
          />

          <div class="flex flex-wrap items-center justify-between gap-2 rounded-sm border border-default px-3 py-2">
            <p class="text-xs text-muted">
              库存数量与成本在仓库流程维护，商品档案只保留是否跟踪库存。
            </p>
            <NuxtLink to="/inventory" data-testid="catalog-detail-inventory-link">
              <UButton
                label="前往仓库流程"
                color="neutral"
                variant="outline"
                size="xs"
              />
            </NuxtLink>
          </div>

          <section data-testid="catalog-detail-changelog">
            <h3 class="mb-2 text-xs font-medium text-default">
              变更记录
            </h3>
            <ChangeLogTimeline
              :entries="connected ? [] : detailChangeEntries"
              compact
              empty-title="暂无变更记录"
              :empty-description="connected ? '当前页面尚未加载完整变更记录。' : '该商品还没有创建、编辑或归档记录。'"
            />
          </section>
        </div>
      </template>

      <template #footer>
        <div v-if="detailProduct" class="flex w-full flex-wrap items-center justify-end gap-2">
          <UButton
            :label="detailProduct.status === 'archived' ? '恢复' : '归档'"
            :icon="detailProduct.status === 'archived' ? 'i-carbon-renew' : 'i-carbon-archive'"
            color="neutral"
            variant="outline"
            size="sm"
            :disabled="!canEdit || connected"
            data-testid="catalog-detail-toggle-status"
            @click="toggleArchive"
          />
          <UButton
            label="编辑"
            icon="i-carbon-edit"
            color="neutral"
            variant="outline"
            size="sm"
            :disabled="!canEdit"
            data-testid="catalog-detail-edit"
            @click="editFromDetail"
          />
          <UButton
            label="关闭"
            color="neutral"
            variant="ghost"
            size="sm"
            data-testid="catalog-detail-close"
            @click="detailId = null"
          />
        </div>
      </template>
    </USlideover>

    <input
      ref="fileInput"
      type="file"
      accept=".csv,text/csv"
      class="hidden"
      data-testid="catalog-import-input"
      @change="onImportFile"
    >
  </div>
</template>

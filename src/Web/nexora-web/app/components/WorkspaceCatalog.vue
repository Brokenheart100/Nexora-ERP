<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'

interface Definition { id: string; kind: 'category' | 'unit'; code: string; name: string; isActive: boolean; version: number }
interface CatalogItem {
  id: string
  code: string
  name: string
  kind: 'product' | 'service'
  tracksInventory: boolean
  categoryId: string
  unitId: string
  isActive: boolean
  version: number
}
interface Catalog { definitions: Definition[]; page: { items: CatalogItem[]; hasMore: boolean }; canManage: boolean }

const props = defineProps<{ workspaceId: string }>()
const path = computed(() => `/bff/api/masterdata/workspaces/${props.workspaceId}`)
const open = ref(false)
const catalog = shallowRef<Catalog>()
const page = ref(1)
const busy = ref(false)
const notice = ref('')
const definition = reactive({ kind: 'category', code: '', name: '' })
const emptyItem = () => ({ code: '', name: '', kind: 'product', categoryId: '', unitId: '', tracksInventory: false })
const item = reactive(emptyItem())
const editing = ref<CatalogItem>()
const editingDefinition = ref<Definition>()
const categories = computed(() => catalog.value?.definitions.filter(x => x.kind === 'category' && x.isActive) ?? [])
const units = computed(() => catalog.value?.definitions.filter(x => x.kind === 'unit' && x.isActive) ?? [])
const editCategories = computed(() => catalog.value?.definitions.filter(x =>
  x.kind === 'category' && (x.isActive || x.id === editing.value?.categoryId)) ?? [])
const names = computed(() => new Map(catalog.value?.definitions.map(x => [x.id, x.name])))
const columns = computed<TableColumn<CatalogItem>[]>(() => {
  const base: TableColumn<CatalogItem>[] = [
    { accessorKey: 'code', header: '编码' },
    { accessorKey: 'name', header: '名称' },
    { id: 'kind', header: '类型', accessorFn: row => row.kind === 'service' ? '服务' : row.tracksInventory ? '库存商品' : '商品' },
    { id: 'category', header: '分类', accessorFn: row => names.value.get(row.categoryId) ?? '' },
    { id: 'unit', header: '单位', accessorFn: row => names.value.get(row.unitId) ?? '' },
    { id: 'state', header: '状态', accessorFn: row => row.isActive ? '启用' : '已停用' },
  ]
  if (catalog.value?.canManage) base.push({ id: 'actions', header: '操作' })
  return base
})
const submit = useWorkspaceMutation()
const definitionKindOptions = [{ label: '分类', value: 'category' }, { label: '计量单位', value: 'unit' }]
const itemKindOptions = [{ label: '商品', value: 'product' }, { label: '服务', value: 'service' }]
const categoryOptions = computed(() => categories.value.map(entry => ({ label: entry.name, value: entry.id })))
const unitOptions = computed(() => units.value.map(entry => ({ label: entry.name, value: entry.id })))
const editCategoryOptions = computed(() => editCategories.value.map(entry => ({
  label: entry.isActive ? entry.name : `${entry.name}（停用）`, value: entry.id,
})))
function setText<T extends object>(target: T | undefined, key: keyof T, value: string | number) {
  if (!target) return
  ;(target as Record<string, unknown>)[key as string] = String(value).trim()
}

async function refresh(target = page.value) {
  catalog.value = await $fetch<Catalog>(`${path.value}/catalog`, { query: { page: target }, retry: 0 })
  page.value = target
}

async function show(target = page.value) {
  open.value = true
  busy.value = true
  notice.value = ''
  try { await refresh(target) }
  catch { catalog.value = undefined; notice.value = '暂时无法读取目录，请检查工作区访问权限后重试。' }
  finally { busy.value = false }
}

async function save(key: string, suffix: string, method: 'POST' | 'PUT', payload: object, committed: () => void) {
  if (busy.value) return
  busy.value = true
  notice.value = ''
  try {
    await submit(key, `${path.value}${suffix}`, method, payload)
    committed()
    notice.value = '已保存。'
    try { await refresh() }
    catch { catalog.value = undefined; notice.value = '已保存，目录刷新失败。' }
  } catch (error) {
    const status = (error as { statusCode?: number }).statusCode
    if (status === 409) notice.value = '编码重复、操作冲突或资料版本已更新，请刷新后核对。'
    else if (status === 400) notice.value = '请核对编码、名称、分类及计量单位。'
    else if (status === 403 || status === 404) {
      catalog.value = undefined
      notice.value = '当前账号没有此工作区的目录管理权限。'
    } else notice.value = '保存结果尚未确认。保持内容不变手动重试会复用本次操作编号。'
  } finally { busy.value = false }
}

function createDefinition() {
  return save('definition', '/definitions', 'POST', { ...definition }, () => {
    definition.code = ''
    definition.name = ''
  })
}

function updateDefinition() {
  if (!editingDefinition.value) return
  const { id, version, name, isActive } = editingDefinition.value
  return save('definition-edit', `/definitions/${id}`, 'PUT', { expectedVersion: version, name, isActive },
    () => { editingDefinition.value = undefined })
}

function createItem() {
  return save('item', '/items', 'POST', { ...item, tracksInventory: item.kind === 'product' && item.tracksInventory },
    () => Object.assign(item, emptyItem()))
}

function updateItem() {
  if (!editing.value) return
  const { id, version, name, categoryId, isActive } = editing.value
  return save('edit', `/items/${id}`, 'PUT', { expectedVersion: version, name, categoryId, isActive },
    () => { editing.value = undefined })
}

onMounted(() => { void show().catch(() => { /* 首屏加载失败时保留空状态，可用模块内按钮重试 */ }) })
</script>

<template>
  <section class="card catalog" aria-labelledby="catalog-heading">
    <h2 id="catalog-heading"><UIcon class="mr-2 inline-block size-[1.08em] align-[-0.16em] text-nx-primary" name="i-lucide-package" aria-hidden="true" />商品目录</h2>
    <UButton variant="outline" color="neutral" size="sm" :disabled="busy" @click="show()">{{ open ? '刷新目录' : '打开商品目录' }}</UButton>
    <UAlert v-if="notice" role="status" :description="notice" />
    <template v-if="catalog">
      <div v-if="catalog.canManage" class="catalog-forms">
        <form @submit.prevent="createDefinition">
          <fieldset :disabled="busy">
            <legend>新增分类或计量单位</legend>
            <UFormField label="定义类型" name="definitionKind">
              <USelect v-model="definition.kind" :items="definitionKindOptions" />
            </UFormField>
            <UFormField label="定义编码" name="definitionCode" required>
              <UInput :model-value="definition.code" required maxlength="40" @update:model-value="value => setText(definition, 'code', value)" />
            </UFormField>
            <UFormField label="定义名称" name="definitionName" required>
              <UInput :model-value="definition.name" required maxlength="160" @update:model-value="value => setText(definition, 'name', value)" />
            </UFormField>
            <UButton type="submit" color="primary">保存定义</UButton>
          </fieldset>
        </form>
        <form @submit.prevent="createItem">
          <fieldset :disabled="busy || !categories.length || !units.length">
            <legend>新增商品或服务</legend>
            <UFormField label="项目类型" name="itemKind">
              <USelect v-model="item.kind" :items="itemKindOptions" />
            </UFormField>
            <UFormField label="项目编码" name="itemCode" required>
              <UInput :model-value="item.code" required maxlength="40" @update:model-value="value => setText(item, 'code', value)" />
            </UFormField>
            <UFormField label="项目名称" name="itemName" required>
              <UInput :model-value="item.name" required maxlength="160" @update:model-value="value => setText(item, 'name', value)" />
            </UFormField>
            <UFormField label="项目分类" name="categoryId" required>
              <USelect v-model="item.categoryId" :items="categoryOptions" placeholder="选择分类" />
            </UFormField>
            <UFormField label="基础单位" name="unitId" required>
              <USelect v-model="item.unitId" :items="unitOptions" placeholder="选择单位" />
            </UFormField>
            <UCheckbox v-if="item.kind === 'product'" v-model="item.tracksInventory" label="跟踪库存" />
            <UButton type="submit" color="primary">创建项目</UButton>
          </fieldset>
          <p v-if="!categories.length || !units.length">先新增分类和计量单位。</p>
        </form>
      </div>
      <details v-if="catalog.definitions.length" class="catalog-definitions">
        <summary>分类与计量单位</summary>
        <ul>
          <li v-for="row in catalog.definitions" :key="row.id">
            <span>{{ row.kind === 'category' ? '分类' : '计量单位' }} · {{ row.code }} · {{ row.name }} · {{ row.isActive ? '启用' : '已停用' }}</span>
            <UButton v-if="catalog.canManage" variant="outline" color="neutral" size="xs" :disabled="busy" @click="editingDefinition = { ...row }">编辑定义 {{ row.code }}</UButton>
          </li>
        </ul>
        <form v-if="catalog.canManage && editingDefinition" @submit.prevent="updateDefinition">
          <fieldset :disabled="busy">
            <legend>编辑定义 {{ editingDefinition.code }}</legend>
            <UFormField label="编辑定义名称" name="editingDefinitionName" required>
              <UInput :model-value="editingDefinition.name" required maxlength="160" @update:model-value="value => setText(editingDefinition, 'name', value)" />
            </UFormField>
            <UCheckbox v-model="editingDefinition.isActive" label="定义启用" />
            <div><UButton type="submit" color="primary">保存定义修改</UButton> <UButton type="button" variant="outline" color="neutral" size="sm" @click="editingDefinition = undefined">取消</UButton></div>
          </fieldset>
        </form>
      </details>
      <p v-if="!catalog.page.items.length">当前页暂无商品或服务。</p>
      <UTable
        v-else
        data-testid="catalog-list"
        :loading="busy"
        :data="catalog.page.items"
        :columns="columns"
        :get-row-id="row => row.id"
        :ui="{ td: 'align-top whitespace-normal', th: 'whitespace-nowrap' }"
      >
        <template #actions-cell="{ row }">
          <UButton v-if="catalog?.canManage" variant="outline" color="neutral" size="xs" :disabled="busy" @click="editing = { ...row.original }">编辑 {{ row.original.code }}</UButton>
        </template>
      </UTable>
      <div v-if="page > 1 || catalog.page.hasMore" class="catalog-pages">
        <UButton variant="outline" color="neutral" size="sm" :disabled="busy || page === 1" @click="show(page - 1)">上一页</UButton>
        <span>第 {{ page }} 页</span>
        <UButton variant="outline" color="neutral" size="sm" :disabled="busy || !catalog.page.hasMore" @click="show(page + 1)">下一页</UButton>
      </div>
      <form v-if="catalog.canManage && editing" @submit.prevent="updateItem">
        <fieldset :disabled="busy">
          <legend>编辑 {{ editing.code }}</legend>
          <UFormField label="编辑名称" name="editingName" required>
            <UInput :model-value="editing.name" required maxlength="160" @update:model-value="value => setText(editing, 'name', value)" />
          </UFormField>
          <UFormField label="编辑分类" name="editingCategoryId" required>
            <USelect v-model="editing.categoryId" :items="editCategoryOptions" />
          </UFormField>
          <UCheckbox v-model="editing.isActive" label="项目启用" />
          <div><UButton type="submit" color="primary">保存项目</UButton> <UButton type="button" variant="outline" color="neutral" size="sm" @click="editing = undefined">取消</UButton></div>
        </fieldset>
      </form>
    </template>
  </section>
</template>

<style scoped>
.catalog { margin-top: 20px; min-width: 0 }
.catalog-forms { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 16rem), 1fr)); gap: 16px; margin: 16px 0 }
fieldset { min-width: 0; border: 1px solid #e0e5ee; border-radius: 8px; padding: 12px; display: grid; gap: 10px }
legend { font-weight: 600 }

.catalog-pages { display: flex; align-items: center; gap: 10px; margin-top: 12px }
.catalog-definitions { margin: 12px 0; overflow-wrap: anywhere }
.catalog-definitions li { margin: 4px 0 }

details { padding: 4px 14px; background: var(--nx-surface-muted); border: 1px solid #e8edf5; border-radius: 12px }
summary { padding: 10px 0; font-size: 12.5px; font-weight: 650; color: #2c4f8f; cursor: pointer }
summary::marker { color: #8fa6c8 }
li { overflow-wrap: anywhere }
</style>

<script setup lang="ts">
import type { CsvColumn } from '../utils/export'

interface Order {
  departmentId: string | null
  id: string; number: string; on: string; currency: string; supplierName: string; state: string; version: number
}
interface OrderList { canCreate: boolean; canApprove: boolean; hasMore: boolean; orders: Order[] }
interface DraftLine { itemId: string; quantity: string; unitPrice: string }
interface OrderLine extends DraftLine { id: string; itemCode: string; itemName: string; unitCode: string; amount: string }
interface Detail {
  order: Order; supplierId: string; supplierCode: string; supplierVersion: number; note: string; minorUnits: number
  lines: OrderLine[]; total: string; isMaker: boolean; approvedVersion: number | null
}
interface Choice { id: string; code: string; name: string; isActive: boolean }
interface Item extends Choice { kind: string; tracksInventory: boolean }
interface Partner extends Choice { roles: string[] }

const props = defineProps<{ workspaceId: string }>()
const orderDepartments = useOrderDepartments(props.workspaceId, 'purchasing.order.')
const { departments, availableDepartments, unassignedAllowed, departmentName } = orderDepartments
const ordersPath = computed(() => `/bff/api/purchasing/workspaces/${props.workspaceId}/orders`)
const masterPath = computed(() => `/bff/api/masterdata/workspaces/${props.workspaceId}`)
const submit = useWorkspaceMutation()
const state = shallowRef<OrderList>()
const detail = shallowRef<Detail>()
const busy = ref(false)
const notice = ref('')
const page = ref(1)
const supplierPage = ref(0)
const itemPage = ref(0)
const moreSuppliers = ref(true)
const moreItems = ref(true)
const suppliers = shallowRef<Partner[]>([])
const items = shallowRef<Item[]>([])
const blankLine = (): DraftLine => ({ itemId: '', quantity: '1', unitPrice: '' })
const draft = reactive({ id: '', number: '', on: '', departmentId: '', supplierId: '', note: '', lines: [blankLine()] })
const reason = ref('')
const labels: Record<string, string> = { draft: '草稿', submitted: '待审批', approved: '已审批', cancelled: '已撤销', receiving: '收货中', received: '已收齐', closed: '已关单' }
const departmentOptions = computed(() => {
  const items = (draft.id ? departments.value : availableDepartments.value).map(department => ({ label: department.name, value: department.id }))
  return unassignedAllowed.value || draft.id ? [{ label: '未指定部门', value: '__none__' }, ...items] : items
})
const departmentSelection = computed({
  get: () => draft.departmentId || '__none__',
  set: value => { draft.departmentId = value === '__none__' ? '' : String(value) },
})
const supplierOptions = computed(() => {
  const list = suppliers.value.map(supplier => ({ label: `${supplier.code} · ${supplier.name}`, value: supplier.id }))
  return draft.id && draft.supplierId && !suppliers.value.some(x => x.id === draft.supplierId)
    ? [{ label: `当前供应商 · ${draft.supplierId}`, value: draft.supplierId }, ...list]
    : list
})
function itemOptions(selected: string) {
  const list = items.value.map(item => ({ label: `${item.code} · ${item.name}`, value: item.id }))
  return draft.id && selected && !items.value.some(x => x.id === selected)
    ? [{ label: `当前商品 · ${selected}`, value: selected }, ...list]
    : list
}
function setText<T extends object>(target: T, key: keyof T, value: string | number) {
  ;(target as Record<string, unknown>)[key as string] = String(value).trim()
}

async function run(action: () => Promise<void>) {
  if (busy.value) return
  busy.value = true
  notice.value = ''
  try { await action() }
  catch (error) {
    const failure = error as { statusCode?: number; data?: { detail?: string } }
    notice.value = failure.statusCode === 403 ? '当前成员需要采购制单或采购审批角色。'
      : failure.data?.detail || '请求未完成。请刷新核对状态，或保留原输入手动重试。'
  } finally { busy.value = false }
}
async function readList(next = page.value) {
  state.value = await $fetch<OrderList>(ordersPath.value, { retry: 0, query: { page: next } })
  page.value = next
}
async function open() {
  await run(async () => {
    await readList(1)
    await orderDepartments.refresh()
    if (state.value?.canCreate && supplierPage.value === 0) await loadSuppliers()
    if (state.value?.canCreate && itemPage.value === 0) await loadItems()
  })
}
async function loadSuppliers() {
  const result = await $fetch<{ items: Partner[]; hasMore: boolean }>(`${masterPath.value}/partners`,
    { retry: 0, query: { page: supplierPage.value + 1 } })
  suppliers.value = [...suppliers.value, ...result.items.filter(x => x.isActive && x.roles.includes('supplier'))]
  supplierPage.value++
  moreSuppliers.value = result.hasMore
}
async function loadItems() {
  const result = await $fetch<{ page: { items: Item[]; hasMore: boolean } }>(`${masterPath.value}/catalog`,
    { retry: 0, query: { page: itemPage.value + 1 } })
  items.value = [...items.value, ...result.page.items.filter(x => x.isActive && x.kind === 'product' && x.tracksInventory)]
  itemPage.value++
  moreItems.value = result.page.hasMore
}
async function readOrder(id: string) {
  detail.value = await $fetch<Detail>(`${ordersPath.value}/${id}`, { retry: 0 })
  reason.value = ''
}
function startEdit() {
  if (!detail.value) return
  const { order, supplierId, note, lines } = detail.value
  Object.assign(draft, { id: order.id, number: order.number, on: order.on, departmentId: order.departmentId ?? '', supplierId, note,
    lines: lines.map(({ itemId, quantity, unitPrice }) => ({ itemId, quantity, unitPrice })) })
}
function resetDraft() {
  Object.assign(draft, { id: '', number: '', on: '', departmentId: '', supplierId: '', note: '', lines: [blankLine()] })
}
async function saveDraft() {
  await run(async () => {
    const input = { on: draft.on, departmentId: draft.departmentId || null, supplierId: draft.supplierId, note: draft.note, lines: draft.lines }
    const result = draft.id
      ? await submit<{ id: string }>('edit-purchase', `${ordersPath.value}/${draft.id}`, 'PUT', { expectedVersion: draftVersion.value, draft: input })
      : await submit<{ id: string }>('create-purchase', ordersPath.value, 'POST', { number: draft.number, draft: input })
    resetDraft()
    await readList(1)
    await readOrder(result.id)
    notice.value = '采购草稿已保存。'
  })
}
const draftVersion = ref(0)
function edit() {
  draftVersion.value = detail.value?.order.version ?? 0
  startEdit()
}
async function decide(decision: 'submit' | 'withdraw' | 'cancel' | 'approve' | 'return') {
  const order = detail.value?.order
  if (!order) return
  await run(async () => {
    await submit('purchase-decision', `${ordersPath.value}/${order.id}/decision`, 'POST',
      { expectedVersion: order.version, decision, reason: reason.value || null })
    await readList()
    await readOrder(order.id)
    if (draft.id === order.id) resetDraft()
    notice.value = '采购订单状态已更新。'
  })
}

const { exporting, notice: exportNotice, error: exportError, exportCsv } = useCsvExport()
const card = ref<HTMLElement>()
const exportColumns: CsvColumn<Order>[] = [
  { header: '单号', value: order => order.number },
  { header: '日期', value: order => order.on },
  { header: '供应商', value: order => order.supplierName },
  { header: '状态', value: order => labels[order.state] ?? order.state },
  { header: '币种', value: order => order.currency },
  { header: '版本', value: order => order.version },
]
async function exportOrders() {
  await exportCsv({
    name: '采购订单',
    columns: exportColumns,
    fetchPage: async (pageNumber) => {
      const result = await $fetch<OrderList>(ordersPath.value, { retry: 0, query: { page: pageNumber } })
      return { rows: result.orders, hasMore: result.hasMore }
    },
  })
}
function printView() {
  printSection(card.value)
}

onMounted(() => { void open().catch(() => { /* 首屏加载失败时保留空状态，可用模块内按钮重试 */ }) })
</script>

<template>
  <section ref="card" class="card purchasing" aria-labelledby="purchasing-heading">
    <h2 id="purchasing-heading"><UIcon class="heading-icon" name="i-lucide-shopping-cart" aria-hidden="true" />采购订单</h2>
    <button class="quiet" type="button" :disabled="busy" @click="open">{{ state ? '刷新采购订单' : '打开采购订单' }}</button>
    <div class="actions">
      <button class="quiet" type="button" :disabled="busy || exporting" @click="run(exportOrders)">导出采购订单 CSV</button>
      <button class="quiet" type="button" @click="printView">打印当前视图</button>
    </div>
    <UAlert v-if="notice" role="status" :description="notice" />
    <UAlert v-if="exportNotice" role="status" :description="exportNotice" />
    <UAlert v-if="exportError" role="alert" color="error" icon="i-lucide-circle-alert" :description="exportError" />
    <template v-if="state">
      <form v-if="state.canCreate" @submit.prevent="saveDraft">
        <fieldset :disabled="busy">
          <legend>{{ draft.id ? '修改采购草稿' : '新建采购草稿' }}</legend>
          <UFormField label="采购单号" name="number">
            <UInput :model-value="draft.number" :readonly="!!draft.id" maxlength="60" required @update:model-value="value => setText(draft, 'number', value)" />
          </UFormField>
          <UFormField label="采购日期" name="on">
            <UInput :model-value="draft.on" type="date" required @update:model-value="value => draft.on = String(value)" />
          </UFormField>
          <UFormField v-if="departments.length" label="归属部门" name="departmentId">
            <USelect v-model="departmentSelection" :items="departmentOptions" :placeholder="unassignedAllowed || draft.id ? '未指定部门' : '选择部门'" :disabled="!!draft.id" :required="!unassignedAllowed" />
          </UFormField>
          <UFormField label="采购供应商" name="supplierId">
            <USelect :model-value="draft.supplierId" :items="supplierOptions" placeholder="选择供应商" required @update:model-value="value => draft.supplierId = String(value)" />
          </UFormField>
          <button v-if="moreSuppliers" type="button" class="quiet" @click="run(loadSuppliers)">加载更多供应商</button>
          <UFormField label="采购备注" name="note">
            <UInput :model-value="draft.note" maxlength="300" @update:model-value="value => setText(draft, 'note', value)" />
          </UFormField>
          <div v-for="(line, index) in draft.lines" :key="index" class="line">
            <UFormField :label="`库存商品 ${index + 1}`" name="itemId">
              <USelect :model-value="line.itemId" :items="itemOptions(line.itemId)" placeholder="选择库存商品" required @update:model-value="value => line.itemId = String(value)" />
            </UFormField>
            <UFormField :label="`采购数量 ${index + 1}`" name="quantity">
              <UInput :model-value="line.quantity" inputmode="decimal" maxlength="24" required @update:model-value="value => setText(line, 'quantity', value)" />
            </UFormField>
            <UFormField :label="`未税单价 ${index + 1}`" name="unitPrice">
              <UInput :model-value="line.unitPrice" inputmode="decimal" maxlength="24" required @update:model-value="value => setText(line, 'unitPrice', value)" />
            </UFormField>
            <button class="quiet" type="button" :disabled="draft.lines.length <= 1" @click="draft.lines.splice(index, 1)">移除采购行</button>
          </div>
          <div class="actions">
            <button v-if="moreItems" class="quiet" type="button" @click="run(loadItems)">加载更多库存商品</button>
            <button class="quiet" type="button" :disabled="draft.lines.length >= 50" @click="draft.lines.push(blankLine())">增加采购行</button>
            <button v-if="draft.id" class="quiet" type="button" @click="resetDraft">放弃编辑</button>
            <button class="primary">保存采购草稿</button>
          </div>
        </fieldset>
      </form>

      <p v-if="!state.orders.length">当前范围内暂无采购订单。</p>
      <ul><li v-for="order in state.orders" :key="order.id">
        <button type="button" class="quiet" :disabled="busy" @click="run(() => readOrder(order.id))">
          {{ order.number }} · {{ order.supplierName }} · {{ order.on }} · {{ labels[order.state] }}
        </button>
      </li></ul>
      <div v-if="page > 1 || state.hasMore" class="actions">
        <button type="button" class="quiet" :disabled="busy || page === 1" @click="run(() => readList(page - 1))">上一页采购单</button>
        <button type="button" class="quiet" :disabled="busy || !state.hasMore" @click="run(() => readList(page + 1))">下一页采购单</button>
      </div>
      <template v-if="detail">
        <h3>{{ detail.order.number }} · {{ labels[detail.order.state] }}</h3>
        <p v-if="detail.order.departmentId">部门 {{ departmentName(detail.order.departmentId) }}</p>
        <p>{{ detail.order.supplierName }} · {{ detail.supplierCode }} v{{ detail.supplierVersion }} · 订单 v{{ detail.order.version }}</p>
        <p v-if="detail.note">{{ detail.note }}</p>
        <ul><li v-for="line in detail.lines" :key="line.id">
          {{ line.itemCode }} · {{ line.itemName }} · {{ line.quantity }} {{ line.unitCode }} × {{ line.unitPrice }} = {{ formatDecimal(line.amount, detail.minorUnits) }}
        </li></ul>
        <p>未税合计 {{ formatDecimal(detail.total, detail.minorUnits) }} {{ detail.order.currency }}</p>
        <p v-if="detail.approvedVersion">批准版本 v{{ detail.approvedVersion }}</p>
        <PurchaseReceiptPanel
v-if="['approved', 'receiving', 'received', 'closed'].includes(detail.order.state)" :key="detail.order.id"
          :workspace-id="workspaceId" :order-id="detail.order.id" :version="detail.order.version" :order-state="detail.order.state"
          :lines="detail.lines" @changed="readOrder(detail!.order.id)" />
        <fieldset v-if="['draft', 'submitted'].includes(detail.order.state)" :disabled="busy">
          <legend>订单操作</legend>
          <UFormField v-if="detail.isMaker || orderDepartments.permits('approve', detail.order.departmentId)" label="采购操作原因" name="reason">
            <UInput :model-value="reason" maxlength="300" @update:model-value="value => reason = String(value).trim()" />
          </UFormField>
          <div class="actions">
            <template v-if="detail.isMaker && detail.order.state === 'draft'">
              <button v-if="orderDepartments.permits('create', detail.order.departmentId)" class="quiet" type="button" @click="edit">编辑采购草稿</button>
              <template v-if="orderDepartments.permits('submit', detail.order.departmentId)">
              <button class="primary" type="button" @click="decide('submit')">提交采购审批</button>
              <button class="quiet" type="button" :disabled="!reason" @click="decide('cancel')">撤销采购草稿</button>
              </template>
            </template>
            <template v-if="detail.order.state === 'submitted'">
              <button v-if="detail.isMaker && orderDepartments.permits('submit', detail.order.departmentId)" class="quiet" type="button" @click="decide('withdraw')">撤回采购申请</button>
              <template v-if="!detail.isMaker && orderDepartments.permits('approve', detail.order.departmentId)">
                <button class="primary" type="button" @click="decide('approve')">批准采购订单</button>
                <button class="quiet" type="button" :disabled="!reason" @click="decide('return')">退回采购草稿</button>
              </template>
            </template>
          </div>
        </fieldset>
      </template>
    </template>
  </section>
</template>

<style scoped>
.purchasing { margin-top: 24px }
fieldset { display: grid; gap: 10px; min-width: 0; margin: 12px 0; border: 1px solid #d1d9e6; border-radius: 8px }
.line, .actions { display: flex; flex-wrap: wrap; align-items: end; gap: 8px }
.line > div { flex: 1 1 140px }
li { margin: 6px 0; overflow-wrap: anywhere }
</style>

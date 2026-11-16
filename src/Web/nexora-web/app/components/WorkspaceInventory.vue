<script setup lang="ts">
import type { CsvColumn } from '../utils/export'

interface Warehouse { id: string; code: string; name: string; receiverId: string | null; version: number; canReceive: boolean; canApproveReturns: boolean; canApproveSalesReturns: boolean; canReadStock: boolean }
interface Member { id: string; email: string | null; subject: string; isActive: boolean }
interface Permit { ticket: { permitId: string; quantity: string; itemId: string; orderDate: string }; executed: string; cost: string; fenced: boolean; revision: number }
interface Position { itemId: string; quantity: string; value: string; average: string; available: string; reserved: string; currency: string; sequence: number }
interface Movement { id: string; itemId: string; permitId: string; on: string; quantity: string; cost: string; reversesId: string | null }
interface StockOperation {
  id: string; warehouseId: string; itemId: string; destinationId: string | null; on: string; quantity: string
  bookQuantity: string; reason: string; state: string; canConfirm: boolean; canCancel: boolean; version: number
  transitCost: string | null; receivedOn: string | null; canReceive: boolean
}
interface Destination { id: string; code: string; name: string }
interface Shipment { id: string; itemName: string; quantity: string; executed: string; revision: number; canShip: boolean; fenced: boolean }
interface Return { id: string; quantity: string; on: string; reason: string; movementId: string | null; cancelled: boolean; canConfirm: boolean }

const props = defineProps<{ workspaceId: string }>()
const base = computed(() => `/bff/api/inventory/workspaces/${props.workspaceId}`)
const home = shallowRef<{ canManage: boolean; warehouses: Warehouse[] }>()
const members = shallowRef<Member[]>([])
const selectedId = ref('')
const selected = computed(() => home.value?.warehouses.find(x => x.id === selectedId.value))
const permits = shallowRef<Permit[]>([])
const shipments = shallowRef<Shipment[]>([])
const salesReturns = shallowRef<Return[]>([])
const positions = shallowRef<Position[]>([])
const movements = shallowRef<Movement[]>([])
const returns = shallowRef<Return[]>([])
const operations = shallowRef<StockOperation[]>([])
const destinations = shallowRef<Destination[]>([])
const arrivalOn = ref('')
const correction = reactive({ itemId: '', destinationId: '', on: '', quantity: '', reason: '' })
const busy = ref(false)
const notice = ref('')
const newWarehouse = reactive({ code: '', name: '' })
const receiver = ref('')
const shipment = reactive({ id: '', on: '', quantity: '' })
const saleReturn = reactive({ movement: '', on: '', quantity: '', reason: '' })
const receipt = reactive({ id: '', on: '', quantity: '' })
const returned = reactive({ movement: '', on: '', quantity: '', reason: '' })
const warehouseOptions = computed(() => (home.value?.warehouses ?? []).map(entry => ({ label: entry.code + ' · ' + entry.name, value: entry.id })))
const memberOptions = computed(() => [
  { label: '撤销收货权限', value: '__none__' },
  ...members.value.map(entry => ({ label: entry.email ?? entry.subject, value: entry.id })),
])
const receivablePermitOptions = computed(() => permits.value
  .filter(entry => !entry.fenced && entry.executed !== entry.ticket.quantity)
  .map(entry => ({ label: entry.ticket.permitId + ' · ' + entry.executed + ' / ' + entry.ticket.quantity, value: entry.ticket.permitId })))
const shippablePermitOptions = computed(() => shipments.value
  .filter(entry => entry.canShip)
  .map(entry => ({ label: entry.itemName + ' · ' + entry.executed + ' / ' + entry.quantity, value: entry.id })))
const salesReturnMovementOptions = computed(() => movements.value
  .filter(entry => !entry.reversesId && entry.quantity.startsWith('-') && shipments.value.some(permit => permit.id === entry.permitId))
  .map(entry => ({ label: entry.on + ' · ' + entry.id + ' · ' + entry.quantity, value: entry.id })))
const positionOptions = computed(() => positions.value
  .map(entry => ({ label: entry.itemId + ' · 在库 ' + entry.quantity, value: entry.itemId })))
const destinationOptions = computed(() => [
  { label: '盘点当前仓库', value: '__none__' },
  ...destinations.value.map(entry => ({ label: '调拨到 ' + entry.code + ' · ' + entry.name, value: entry.id })),
])
const returnMovementOptions = computed(() => movements.value
  .filter(entry => !entry.reversesId && entry.quantity !== '0' && !entry.quantity.startsWith('-') && permits.value.some(permit => permit.ticket.permitId === entry.permitId))
  .map(entry => ({ label: entry.on + ' · ' + entry.id + ' · ' + entry.quantity, value: entry.id })))
const submit = useWorkspaceMutation()
const warehousePath = computed(() => `${base.value}/warehouses/${selectedId.value}`)

async function run(action: () => Promise<void>) {
  if (busy.value) return
  busy.value = true; notice.value = ''
  try { await action() }
  catch (error) {
    notice.value = (error as { data?: { detail?: string } }).data?.detail || '请求结果待确认，请刷新后核对。'
  } finally { busy.value = false }
}
async function readHome() {
  home.value = await $fetch(`${base.value}/warehouses`, { retry: 0 })
  if (home.value?.canManage) members.value = (await $fetch<Member[]>(`/bff/api/workspaces/${props.workspaceId}/members`, { retry: 0 })).filter(x => x.isActive)
  if (selected.value) await readWarehouse()
}
async function readWarehouse() {
  const warehouse = selected.value
  if (!warehouse) return
  receiver.value = warehouse.receiverId ?? ''
  const query = { retry: 0 as const }
  const stockAccess = home.value?.canManage || warehouse.canReceive
  const purchases = stockAccess || warehouse.canApproveReturns || warehouse.canReadStock
  const sales = stockAccess || warehouse.canApproveSalesReturns || warehouse.canReadStock
  const [foundPermits, foundMovements, foundReturns, foundPositions, foundShipments, foundSalesReturns, foundOperations, foundDestinations] = await Promise.all([
    purchases ? $fetch<Permit[]>(warehousePath.value + '/receipts', query) : Promise.resolve([]),
    $fetch<Movement[]>(warehousePath.value + '/movements', query),
    purchases ? $fetch<Return[]>(warehousePath.value + '/returns', query) : Promise.resolve([]),
    stockAccess || warehouse.canReadStock ? $fetch<Position[]>(warehousePath.value + '/positions', query) : Promise.resolve([]),
    sales ? $fetch<Shipment[]>(warehousePath.value + '/shipments', query) : Promise.resolve([]),
    sales ? $fetch<Return[]>(warehousePath.value + '/sales-returns', query) : Promise.resolve([]),
    stockAccess ? $fetch<StockOperation[]>(warehousePath.value + '/stock-operations', query) : Promise.resolve([]),
    warehouse.canReceive ? $fetch<Destination[]>(warehousePath.value + '/stock-operations/destinations', query) : Promise.resolve([]),
  ])
  permits.value = foundPermits; movements.value = foundMovements; returns.value = foundReturns; positions.value = foundPositions
  shipments.value = foundShipments; salesReturns.value = foundSalesReturns
  operations.value = foundOperations; destinations.value = foundDestinations
}
function add() {
  return run(async () => {
    await submit('add-warehouse', `${base.value}/warehouses`, 'POST', newWarehouse)
    Object.assign(newWarehouse, { code: '', name: '' })
    await readHome()
  })
}
function assign() {
  return run(async () => {
    await submit('assign-receiver', `${warehousePath.value}/receiver`, 'PUT', { expectedVersion: selected.value!.version, memberId: receiver.value || null })
    await readHome()
  })
}
function receive() {
  return run(async () => {
    const permit = permits.value.find(x => x.ticket.permitId === receipt.id)
    if (!permit) return
    await submit('receive-stock', `${base.value}/receipts/${receipt.id}/receive`, 'POST',
      { expectedRevision: permit.revision, on: receipt.on, quantity: receipt.quantity })
    receipt.quantity = ''
    await readWarehouse()
  })
}
function ship() {
  return run(async () => {
    const permit = shipments.value.find(x => x.id === shipment.id)
    if (!permit) return
    await submit('ship-sales-stock', base.value + '/shipments/' + permit.id + '/ship', 'POST',
      { expectedRevision: permit.revision, on: shipment.on, quantity: shipment.quantity })
    shipment.quantity = ''
    await readWarehouse()
  })
}
function authorizeSalesReturn() {
  return run(async () => {
    const { movement, on, quantity, reason } = saleReturn
    await submit('authorize-sales-return', base.value + '/shipments/' + movement + '/returns', 'POST', { on, quantity, reason })
    Object.assign(saleReturn, { movement: '', on: '', quantity: '', reason: '' })
    await readWarehouse()
  })
}
function decideSalesReturn(entry: Return, confirm: boolean) {
  return run(async () => {
    await submit('decide-sales-return', base.value + '/sales-returns/' + entry.id + '/decision', 'POST', { confirm })
    await readWarehouse()
  })
}
function prepareOperation() {
  return run(async () => {
    const pool = positions.value.find(x => x.itemId === correction.itemId)
    if (!pool) return
    await submit('prepare-stock-operation', warehousePath.value + '/stock-operations', 'POST',
      { ...correction, destinationId: correction.destinationId || null, expectedSequence: pool.sequence })
    Object.assign(correction, { itemId: '', destinationId: '', quantity: '', reason: '' })
    await readWarehouse()
  })
}
function decideOperation(entry: StockOperation, confirm: boolean) {
  return run(async () => {
    await submit('decide-stock-operation', base.value + '/stock-operations/' + entry.id + '/decision', 'POST',
      { expectedVersion: entry.version, confirm })
    await readWarehouse()
  })
}
function receiveTransfer(entry: StockOperation) {
  return run(async () => {
    await submit('receive-stock-transfer', base.value + '/stock-operations/' + entry.id + '/receive', 'POST',
      { expectedVersion: entry.version, on: arrivalOn.value })
    arrivalOn.value = ''
    await readWarehouse()
  })
}
function changeWarehouse() {
  arrivalOn.value = ''
  Object.assign(correction, { itemId: '', destinationId: '', on: '', quantity: '', reason: '' })
  return run(readWarehouse)
}
function authorizeReturn() {
  return run(async () => {
    await submit('authorize-return', `${base.value}/movements/${returned.movement}/returns`, 'POST',
      { on: returned.on, quantity: returned.quantity, reason: returned.reason })
    Object.assign(returned, { movement: '', on: '', quantity: '', reason: '' })
    await readWarehouse()
  })
}
function decideReturn(entry: Return, confirm: boolean) {
  return run(async () => {
    await submit('decide-return', `${base.value}/returns/${entry.id}/decision`, 'POST', { confirm })
    await readWarehouse()
  })
}

const { exporting, notice: exportNotice, error: exportError, exportCsv } = useCsvExport()
const card = ref<HTMLElement>()
interface ExportRow {
  warehouseCode: string; warehouseName: string; itemId: string; quantity: string; available: string
  reserved: string; value: string; average: string; currency: string
}
const exportColumns: CsvColumn<ExportRow>[] = [
  { header: '仓库编码', value: row => row.warehouseCode },
  { header: '仓库名称', value: row => row.warehouseName },
  { header: '商品ID', value: row => row.itemId },
  { header: '在库数量', value: row => row.quantity },
  { header: '可用数量', value: row => row.available },
  { header: '预留数量', value: row => row.reserved },
  { header: '库存价值', value: row => row.value },
  { header: '平均成本', value: row => row.average },
  { header: '币种', value: row => row.currency },
]
async function exportPositions() {
  await exportCsv({
    name: '库存余额',
    columns: exportColumns,
    fetchPage: async () => {
      const head = await $fetch<{ canManage: boolean; warehouses: Warehouse[] }>(`${base.value}/warehouses`, { retry: 0 })
      const rows: ExportRow[] = []
      for (const warehouse of head.warehouses) {
        if (!(head.canManage || warehouse.canReceive || warehouse.canReadStock)) continue
        const pools = await $fetch<Position[]>(`${base.value}/warehouses/${warehouse.id}/positions`, { retry: 0 })
        rows.push(...pools.map(pool => ({
          warehouseCode: warehouse.code, warehouseName: warehouse.name, itemId: pool.itemId,
          quantity: pool.quantity, available: pool.available, reserved: pool.reserved,
          value: pool.value, average: pool.average, currency: pool.currency,
        })))
      }
      return { rows, hasMore: false }
    },
  })
}
function printView() {
  printSection(card.value)
}

onMounted(() => { void readHome().catch(() => { /* 首屏加载失败时保留空状态，可用模块内按钮重试 */ }) })
</script>

<template>
  <section ref="card" class="inventory rounded-nx border border-nx-border bg-nx-surface p-6 shadow-nx-sm" aria-labelledby="inventory-heading">
    <h2 id="inventory-heading"><UIcon class="mr-2 inline-block size-[1.08em] align-[-0.16em] text-nx-primary" name="i-lucide-warehouse" aria-hidden="true" />仓库、收货与库存</h2>
    <UButton variant="outline" color="neutral" size="sm" type="button" :disabled="busy" @click="run(readHome)">{{ home ? '刷新库存工作台' : '打开库存工作台' }}</UButton>
    <div class="mb-3 mt-2 flex flex-wrap gap-2">
      <UButton variant="outline" color="neutral" size="sm" type="button" :disabled="busy || exporting" @click="run(exportPositions)">导出库存 CSV</UButton>
      <UButton variant="outline" color="neutral" size="sm" type="button" @click="printView">打印当前视图</UButton>
    </div>
    <UAlert v-if="notice" role="status" :description="notice" />
    <UAlert v-if="exportNotice" role="status" :description="exportNotice" />
    <UAlert v-if="exportError" role="alert" color="error" icon="i-lucide-circle-alert" :description="exportError" />
    <template v-if="home">
      <form v-if="home.canManage" @submit.prevent="add">
        <fieldset :disabled="busy">
          <legend>新增仓库</legend>
          <UFormField label="仓库编码" name="warehouseCode">
            <UInput :model-value="newWarehouse.code" maxlength="40" required @update:model-value="value => newWarehouse.code = String(value).trim()" />
          </UFormField>
          <UFormField label="仓库名称" name="warehouseName">
            <UInput :model-value="newWarehouse.name" maxlength="160" required @update:model-value="value => newWarehouse.name = String(value).trim()" />
          </UFormField>
          <UButton type="submit" color="primary">保存仓库</UButton>
        </fieldset>
      </form>
      <UFormField label="库存仓库" name="warehouseId">
        <USelect :model-value="selectedId" :items="warehouseOptions" :disabled="busy" placeholder="选择仓库" @update:model-value="value => { selectedId = String(value); changeWarehouse() }" />
      </UFormField>
      <template v-if="selected">
        <form v-if="home.canManage" @submit.prevent="assign">
          <fieldset :disabled="busy">
            <legend>指定仓库收货人</legend>
            <UFormField label="收货成员" name="receiverId">
              <USelect :model-value="receiver || '__none__'" :items="memberOptions" @update:model-value="value => { receiver = String(value) === '__none__' ? '' : String(value) }" />
            </UFormField>
            <UButton variant="outline" color="neutral" size="sm" type="submit">保存仓库范围</UButton>
          </fieldset>
        </form>
        <ul><li v-for="permit in permits" :key="permit.ticket.permitId">
          {{ permit.ticket.itemId }} · 实收 {{ permit.executed }} / {{ permit.ticket.quantity }} · 成本 {{ permit.cost }}{{ permit.fenced ? ' · 已取消余量' : '' }}
        </li></ul>
        <form v-if="selected.canReceive" @submit.prevent="receive">
          <fieldset :disabled="busy">
            <legend>确认实收</legend>
            <UFormField label="库存收货许可" name="receiptPermitId">
              <USelect :model-value="receipt.id" :items="receivablePermitOptions" placeholder="选择许可" required @update:model-value="value => receipt.id = String(value)" />
            </UFormField>
            <UFormField label="实收日期" name="receiptDate">
              <UInput :model-value="receipt.on" type="date" required @update:model-value="value => receipt.on = String(value)" />
            </UFormField>
            <UFormField label="实收数量" name="receiptQuantity">
              <UInput :model-value="receipt.quantity" inputmode="decimal" required @update:model-value="value => receipt.quantity = String(value).trim()" />
            </UFormField>
            <UButton type="submit" color="primary">确认收货</UButton>
          </fieldset>
        </form>
        <template v-if="shipments.length">
          <h3>销售预留与发货</h3>
          <ul><li v-for="permit in shipments" :key="permit.id">
            {{ permit.itemName }} · 已发 {{ permit.executed }} / {{ permit.quantity }}{{ permit.fenced ? ' · 已释放余量' : '' }}
          </li></ul>
          <form v-if="selected.canReceive" @submit.prevent="ship">
            <fieldset :disabled="busy"><legend>确认销售发货</legend>
              <UFormField label="销售发货许可" name="shipmentId">
                <USelect :model-value="shipment.id" :items="shippablePermitOptions" placeholder="选择许可" required @update:model-value="value => shipment.id = String(value)" />
              </UFormField>
              <UFormField label="发货日期" name="shipmentDate">
                <UInput :model-value="shipment.on" type="date" required @update:model-value="value => shipment.on = String(value)" />
              </UFormField>
              <UFormField label="发货数量" name="shipmentQuantity">
                <UInput :model-value="shipment.quantity" inputmode="decimal" required @update:model-value="value => shipment.quantity = String(value).trim()" />
              </UFormField>
              <UButton type="submit" color="primary">确认发货</UButton>
            </fieldset>
          </form>
        </template>
        <form v-if="selected.canApproveSalesReturns" @submit.prevent="authorizeSalesReturn">
          <fieldset :disabled="busy"><legend>授权销售退货</legend>
            <UFormField label="原发货流水" name="salesReturnMovementId">
              <USelect :model-value="saleReturn.movement" :items="salesReturnMovementOptions" placeholder="选择发货" required @update:model-value="value => saleReturn.movement = String(value)" />
            </UFormField>
            <UFormField label="销售退货日期" name="salesReturnDate">
              <UInput :model-value="saleReturn.on" type="date" required @update:model-value="value => saleReturn.on = String(value)" />
            </UFormField>
            <UFormField label="销售退货数量" name="salesReturnQuantity">
              <UInput :model-value="saleReturn.quantity" inputmode="decimal" required @update:model-value="value => saleReturn.quantity = String(value).trim()" />
            </UFormField>
            <UFormField label="销售退货原因" name="salesReturnReason">
              <UInput :model-value="saleReturn.reason" maxlength="300" required @update:model-value="value => saleReturn.reason = String(value).trim()" />
            </UFormField>
            <UButton type="submit" color="primary">签发销售退货许可</UButton>
          </fieldset>
        </form>
        <ul><li v-for="entry in salesReturns" :key="entry.id">
          销售退货 {{ entry.on }} · {{ entry.quantity }} · {{ entry.reason }} · {{ entry.cancelled ? '已撤销' : entry.movementId ? '已入库' : '待确认' }}
          <UButton
v-if="!entry.movementId && !entry.cancelled && entry.canConfirm" variant="outline" color="neutral" size="xs" type="button"
            :disabled="busy" @click="decideSalesReturn(entry, true)">确认销售退货</UButton>
          <UButton
v-if="!entry.movementId && !entry.cancelled && selected.canApproveSalesReturns" variant="outline" color="neutral" size="xs" type="button"
            :disabled="busy" @click="decideSalesReturn(entry, false)">撤销销售退货许可</UButton>
        </li></ul>
        <h3>库存与移动加权成本</h3>
        <ul><li v-for="pool in positions" :key="pool.itemId">
          {{ pool.itemId }} · 在库 {{ pool.quantity }} · 价值 {{ pool.value }} {{ pool.currency }} · 平均成本 {{ pool.average }} · 序列 {{ pool.sequence }} · 预留 {{ pool.reserved }} · 可用 {{ pool.available }}
        </li></ul>
        <h3 v-if="home.canManage || selected.canReceive">盘点与仓间调拨</h3>
        <form v-if="selected.canReceive && positions.length" @submit.prevent="prepareOperation">
          <fieldset :disabled="busy"><legend>提交库存复核</legend>
            <UFormField label="库存商品" name="correctionItemId">
              <USelect :model-value="correction.itemId" :items="positionOptions" placeholder="选择商品" required @update:model-value="value => correction.itemId = String(value)" />
            </UFormField>
            <UFormField label="盘点或调拨" name="correctionDestinationId">
              <USelect :model-value="correction.destinationId || '__none__'" :items="destinationOptions" @update:model-value="value => { correction.destinationId = String(value) === '__none__' ? '' : String(value) }" />
            </UFormField>
            <UFormField label="库存操作日期" name="correctionDate">
              <UInput :model-value="correction.on" type="date" required @update:model-value="value => correction.on = String(value)" />
            </UFormField>
            <UFormField :label="correction.destinationId ? '调拨数量' : '盘点实数'" name="correctionQuantity">
              <UInput :model-value="correction.quantity" inputmode="decimal" required @update:model-value="value => correction.quantity = String(value).trim()" />
            </UFormField>
            <UFormField label="库存操作原因" name="correctionReason">
              <UInput :model-value="correction.reason" maxlength="300" required @update:model-value="value => correction.reason = String(value).trim()" />
            </UFormField>
            <UButton type="submit" color="primary">提交库存复核</UButton>
          </fieldset>
        </form>
        <ul><li v-for="entry in operations" :key="entry.id">
          {{ entry.destinationId ? '仓间调拨' : '库存盘点' }} · {{ entry.on }} · {{ entry.itemId }}
          · 账面 {{ entry.bookQuantity }} · {{ entry.destinationId ? '调拨' : '实盘' }} {{ entry.quantity }} · {{ entry.reason }}
          · {{ entry.state === 'confirmed' ? '已确认' : entry.state === 'in-transit' ? '在途' : entry.state === 'cancelled' ? '已取消' : '待复核' }}
          <span v-if="entry.transitCost !== null"> · 调拨成本 {{ entry.transitCost }}</span>
          <span v-if="entry.receivedOn"> · 签收 {{ entry.receivedOn }}</span>
          <UButton v-if="entry.canConfirm" variant="outline" color="neutral" size="xs" type="button" :disabled="busy" @click="decideOperation(entry, true)">
            {{ entry.destinationId ? '复核并出库' : '确认库存复核' }}
          </UButton>
          <form v-if="entry.canReceive" @submit.prevent="receiveTransfer(entry)">
            <UFormField label="调拨到仓日期" name="arrivalOn">
              <UInput :model-value="arrivalOn" :min="entry.on" type="date" required :disabled="busy" @update:model-value="value => arrivalOn = String(value)" />
            </UFormField>
            <UButton variant="outline" color="neutral" size="xs" type="submit" :disabled="busy">签收调拨</UButton>
          </form>
          <UButton v-if="entry.canCancel" variant="outline" color="neutral" size="xs" type="button" :disabled="busy" @click="decideOperation(entry, false)">取消库存复核</UButton>
        </li></ul>
        <h3>变动流水</h3>
        <ul><li v-for="movement in movements" :key="movement.id">{{ movement.on }} · {{ movement.itemId }} · 数量 {{ movement.quantity }} · 成本 {{ movement.cost }}</li></ul>
        <form v-if="selected.canApproveReturns" @submit.prevent="authorizeReturn">
          <fieldset :disabled="busy">
            <legend>授权采购退货</legend>
            <UFormField label="原收货流水" name="returnMovementId">
              <USelect :model-value="returned.movement" :items="returnMovementOptions" placeholder="选择实收流水" required @update:model-value="value => returned.movement = String(value)" />
            </UFormField>
            <UFormField label="退货日期" name="returnDate">
              <UInput :model-value="returned.on" type="date" required @update:model-value="value => returned.on = String(value)" />
            </UFormField>
            <UFormField label="退货数量" name="returnQuantity">
              <UInput :model-value="returned.quantity" inputmode="decimal" required @update:model-value="value => returned.quantity = String(value).trim()" />
            </UFormField>
            <UFormField label="退货原因" name="returnReason">
              <UInput :model-value="returned.reason" maxlength="300" required @update:model-value="value => returned.reason = String(value).trim()" />
            </UFormField>
            <UButton type="submit" color="primary">授权退货</UButton>
          </fieldset>
        </form>
        <ul><li v-for="entry in returns" :key="entry.id">
          {{ entry.on }} · {{ entry.reason }} · {{ entry.quantity }} · {{ entry.cancelled ? '已取消' : entry.movementId ? '已确认' : '待确认' }}
          <template v-if="!entry.cancelled && !entry.movementId">
            <UButton v-if="entry.canConfirm" color="primary" type="button" :disabled="busy" @click="decideReturn(entry, true)">确认退货出库</UButton>
            <UButton v-if="selected.canApproveReturns" variant="outline" color="neutral" size="xs" type="button" :disabled="busy" @click="decideReturn(entry, false)">取消退货授权</UButton>
          </template>
        </li></ul>
      </template>
    </template>
  </section>
</template>

<style scoped>
.inventory { margin-top: 24px }
fieldset, label { display: grid; gap: 6px; min-width: 0 }
fieldset { margin: 12px 0; border: 1px solid #d1d9e6; border-radius: 8px }
select { max-width: 100% }
li { overflow-wrap: anywhere }
</style>

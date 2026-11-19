import type { CsvColumn } from '~/utils/export'

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

export function useWarehouseInventory(workspaceId: () => string) {
  const base = computed(() => `/bff/api/inventory/workspaces/${workspaceId()}`)
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
    if (home.value?.canManage) members.value = (await $fetch<Member[]>(`/bff/api/workspaces/${workspaceId()}/members`, { retry: 0 })).filter(x => x.isActive)
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

  onMounted(() => { void readHome().catch(() => { /* 首屏加载失败时保留空状态，可用模块内按钮重试 */ }) })

  return {
    home, busy, notice, newWarehouse, selectedId, warehouseOptions, selected, receiver, memberOptions,
    permits, receipt, receivablePermitOptions, shipments, shipment, shippablePermitOptions, saleReturn,
    salesReturnMovementOptions, salesReturns, positions, correction, positionOptions, destinationOptions,
    operations, arrivalOn, movements, returned, returnMovementOptions, returns, exporting, exportNotice,
    exportError, run, readHome, exportPositions, add, changeWarehouse, assign, receive, ship, authorizeSalesReturn,
    decideSalesReturn, prepareOperation, decideOperation, receiveTransfer, authorizeReturn, decideReturn,
  }
}

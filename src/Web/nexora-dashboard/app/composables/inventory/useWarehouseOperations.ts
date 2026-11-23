import { z } from 'zod'
import type { StockOperation } from '#shared/types/inventory'
import type { inventoryPoolSchema } from '#shared/types/purchasing'
import { quantityInput } from '#shared/types/purchasing'
import { compareDecimal } from '#shared/utils/decimal'
import { inventoryPath, warehousePath, useInventoryApi } from '~/composables/api/useInventoryApi'
import { useOrganizationApi } from '~/composables/api/useOrganizationApi'
import { useWorkspaceQuery } from '~/composables/api/useWorkspaceQuery'
import { useScopedSubmission } from '~/composables/api/useScopedSubmission'
import type { useWarehouseConnection } from './useWarehouseConnection'

const today = () => new Date().toLocaleDateString('en-CA')

export function useWarehouseOperations(warehouse: ReturnType<typeof useWarehouseConnection>, tab: Ref<string>) {
  const api = useInventoryApi()
  const organization = useOrganizationApi()
  const id = () => warehouse.warehouseId
  const query = useWorkspaceQuery('stock-operations', '/inventory', async (workspace, signal) => {
    if (!id() || tab.value !== 'warehouse-ops') return null
    return api.operations(workspace, id(), signal)
  }, () => [id(), tab.value])
  const workspace = () => query.session.activeWorkspaceId
  const submission = useScopedSubmission('stock-operations', () => query.enabled)
  const stockOpen = ref(false)
  const managementOpen = ref(false)
  const selection = shallowRef<StockOperation | null>(null)
  const destinations = shallowRef<Awaited<ReturnType<typeof api.destinations>>>([])
  const members = shallowRef<Awaited<ReturnType<typeof organization.members>>>([])
  const pools = shallowRef<z.infer<typeof inventoryPoolSchema>[]>([])
  const poolPage = ref(1)
  const loading = ref(false)
  const error = ref('')
  const stock = reactive({ transfer: false, itemId: '', destinationId: '', on: '', quantity: '', reason: '' })
  const management = reactive({ assign: false, code: '', name: '', memberId: '' })
  const arrival = ref(today())
  const manageAllowed = computed(() => warehouse.query.data?.warehouses.canManage === true)
  const prepareAllowed = computed(() => warehouse.query.data?.selected?.canReceive === true)
  const frozen = computed(() => loading.value || submission.mutation.busy || !!submission.record)
  let read: AbortController | undefined

  function clear() {
    read?.abort()
    read = undefined
    managementOpen.value = stockOpen.value = false
    selection.value = null
    pools.value = destinations.value = members.value = []
    error.value = ''
    loading.value = false
    submission.reset()
  }
  watch(() => [query.owner, id()], clear, { flush: 'sync' })
  onScopeDispose(() => read?.abort())

  async function load<T>(action: (signal: AbortSignal) => Promise<T>, apply: (result: T) => void) {
    read?.abort()
    const controller = new AbortController()
    read = controller
    loading.value = true
    error.value = ''
    try {
      const result = await action(controller.signal)
      if (read !== controller || controller.signal.aborted) return
      apply(result)
    } catch (failure) {
      if (read === controller && !controller.signal.aborted) error.value = failure instanceof Error ? failure.message : '仓库读取失败。'
    } finally {
      if (read === controller) loading.value = false
    }
  }
  async function openManagement(assign: boolean) {
    if (!manageAllowed.value || frozen.value) return
    submission.reset()
    Object.assign(management, { assign, code: '', name: '', memberId: warehouse.query.data?.selected?.receiverId ?? '' })
    error.value = ''
    managementOpen.value = true
    if (assign) await load(signal => organization.members(workspace(), signal), (rows) => {
      members.value = rows.filter(row => row.isActive)
    })
  }
  async function saveManagement() {
    const current = warehouse.query.data?.selected
    const member = z.uuid().safeParse(management.memberId)
    const code = management.code.trim(), name = management.name.trim()
    if (!manageAllowed.value || frozen.value) return
    if (management.assign ? !current || (!!management.memberId && !member.success) : !code || !name) {
      error.value = management.assign ? '请选择有效的工作区成员。' : '请输入仓库编码与名称。'
      return
    }
    error.value = ''
    const ok = management.assign && current
      ? await submission.send('warehouse.receiver', warehousePath(workspace(), current.id) + '/receiver',
          { expectedVersion: current.version, memberId: management.memberId || null }, { resourceId: current.id, warehouseId: current.id, method: 'PUT' })
      : await submission.send('warehouse.create', inventoryPath(workspace()) + '/warehouses', { code, name })
    const newId = submission.result?.id
    if (!ok) return
    managementOpen.value = false
    if (!management.assign && newId) warehouse.warehouseId = newId
    await warehouse.query.refresh()
  }
  async function openStock(transfer: boolean) {
    if (!prepareAllowed.value || frozen.value) return
    submission.reset()
    selection.value = null
    poolPage.value = 1
    Object.assign(stock, { transfer, itemId: '', destinationId: '', on: today(), quantity: '', reason: '' })
    stockOpen.value = true
    await load(
      signal => Promise.all([api.pools(workspace(), id(), 1, signal), transfer ? api.destinations(workspace(), id(), signal) : []]),
      ([items, targets]) => {
        pools.value = items
        destinations.value = targets
      })
  }
  async function changePoolPage(step: number) {
    const next = Math.max(1, poolPage.value + step)
    await load(signal => api.pools(workspace(), id(), next, signal), (rows) => {
      poolPage.value = next
      pools.value = rows
      stock.itemId = ''
    })
  }
  async function prepare() {
    if (!prepareAllowed.value || frozen.value) return
    const pool = pools.value.find(row => row.itemId === stock.itemId)
    const quantity = stock.transfer ? quantityInput.safeParse(stock.quantity) : z.string().trim().regex(/^\d{1,16}(?:\.\d{1,6})?$/).safeParse(stock.quantity)
    if (!pool || !quantity.success || !z.iso.date().safeParse(stock.on).success || !stock.reason.trim() || stock.reason.length > 300
      || (stock.transfer && (!destinations.value.some(row => row.id === stock.destinationId) || compareDecimal(quantity.data, pool.available) > 0))) {
      error.value = '请检查商品、日期、数量、调拨目标与原因。'
      return
    }
    error.value = ''
    const ok = await submission.send('stock-operation.prepare', warehousePath(workspace(), id()) + '/stock-operations', {
      itemId: pool.itemId, expectedSequence: pool.sequence, destinationId: stock.transfer ? stock.destinationId : null,
      on: stock.on, quantity: quantity.data, reason: stock.reason.trim()
    }, { warehouseId: id() })
    if (!ok || !submission.result) return
    const operationId = submission.result.id
    await query.refresh()
    await openDetail(operationId)
  }
  async function openDetail(operationId: string) {
    if (!z.uuid().safeParse(operationId).success || !id()) return
    stockOpen.value = true
    selection.value = query.data?.find(row => row.id === operationId) ?? null
    await load(signal => api.operation(workspace(), id(), operationId, signal), (row) => {
      selection.value = row
      arrival.value = today() < row.on ? row.on : today()
    })
  }
  async function decide(action: 'confirm' | 'cancel' | 'receive') {
    const current = selection.value
    if (!current || frozen.value || !(action === 'receive' ? current.canReceive : action === 'confirm' ? current.canConfirm : current.canCancel)) return
    if (action === 'receive' && (!z.iso.date().safeParse(arrival.value).success || arrival.value < current.on)) {
      error.value = '到仓日期须在出库日期当天或之后。'
      return
    }
    error.value = ''
    const payload = action === 'receive' ? { on: arrival.value } : { confirm: action === 'confirm' }
    if (await submission.send('stock-operation.' + action,
      inventoryPath(workspace()) + '/stock-operations/' + current.id + '/' + (action === 'receive' ? 'receive' : 'decision'),
      { ...payload, expectedVersion: current.version }, { resourceId: current.id, warehouseId: id() })) {
      await Promise.all([query.refresh(), warehouse.query.refresh()])
      await openDetail(current.id)
    }
  }
  async function check() {
    if (!submission.mutation.unknown) submission.resume()
    await submission.check(async (saved) => {
      if (!saved.warehouseId) await api.warehouses(saved.workspaceId)
      else if (saved.action === 'warehouse.receiver') await api.detail(saved.workspaceId, saved.warehouseId)
      else if (saved.resourceId) await api.operation(saved.workspaceId, saved.warehouseId, saved.resourceId)
      else await api.operations(saved.workspaceId, saved.warehouseId)
      return null
    })
  }
  async function retry() {
    const saved = submission.record
    if (!await submission.retry()) return
    const result = submission.result
    await Promise.all([query.refresh(), warehouse.query.refresh()])
    managementOpen.value = false
    if (saved?.warehouseId === id() && result && saved.action.startsWith('stock-operation.')) await openDetail(result.id)
  }

  return reactive({ query, warehouse, stockOpen, managementOpen, queries: { destinations, members, pools }, poolPage, stock,
    management, arrival, selection, loading, error, frozen, submission, manageAllowed, prepareAllowed, workspace,
    openManagement, saveManagement, openStock, changePoolPage, prepare, openDetail, decide, check, retry })
}

export type WarehouseOperationsConnection = ReturnType<typeof useWarehouseOperations>

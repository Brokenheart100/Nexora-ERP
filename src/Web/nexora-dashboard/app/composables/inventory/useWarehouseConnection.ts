import { useWorkspaceQuery } from '~/composables/api/useWorkspaceQuery'
import { useInventoryApi } from '~/composables/api/useInventoryApi'
import { useMasterDataApi } from '~/composables/api/useMasterDataApi'
import { useScopedSubmission } from '~/composables/api/useScopedSubmission'
import { changeSchema, quantityInput } from '#shared/types/purchasing'
import { compareDecimal, subtractDecimal } from '#shared/utils/decimal'
import { z } from 'zod'
import { ApiFailure } from '~/utils/api/client'

interface WarehouseTask {
  id: string
  direction: 'inbound' | 'outbound'
  sourceNo: string
  partner: string
  itemId: string
  itemName?: string
  quantity: string
  executed: string
  revision: number | string
  fenced: boolean
  canExecute: boolean
  expiresAtUtc?: string
}

function permittedTasks<T>(failure: unknown): T[] {
  if (failure instanceof ApiFailure && [403, 404].includes(failure.status)) return []
  throw failure
}

export function useWarehouseConnection() {
  const api = useInventoryApi(),
    master = useMasterDataApi(),
    route = useRoute()
  const warehouseId = ref(typeof route.query.warehouse === 'string' ? route.query.warehouse : '')
  const poolPage = ref(1),
    movementPage = ref(1)
  const query = useWorkspaceQuery(
    'warehouse-tasks',
    '/inventory',
    async (id, signal) => {
      const warehouses = await api.warehouses(id, signal)
      const selected = warehouses.warehouses.find(value => value.id === warehouseId.value)
      if (!selected) return { warehouses, selected: null, tasks: [] as WarehouseTask[], pools: null, movements: null, catalog: null }
      const [detail, reference] = await Promise.all([api.detail(id, selected.id, signal), api.reference(id, selected.id, signal)])
      const canReadPools = detail.canReadStock || detail.canReceive || warehouses.canManage
      const canReadMovements = canReadPools || detail.canApproveReturns || detail.canApproveSalesReturns
      const [receipts, shipments, pools, movements, catalog] = await Promise.all([
        api.receipts(id, selected.id, signal).catch(permittedTasks<Awaited<ReturnType<typeof api.receipts>>[number]>),
        api.shipments(id, selected.id, signal).catch(permittedTasks<Awaited<ReturnType<typeof api.shipments>>[number]>),
        canReadPools ? api.pools(id, selected.id, poolPage.value, signal) : null,
        canReadMovements ? api.movements(id, selected.id, movementPage.value, signal,
          z.uuid().safeParse(route.query.item).data) : null,
        master
          .catalog(id, 1, signal, 100)
          .then(value => value.data)
          .catch(() => null)
      ])
      const tasks: WarehouseTask[] = [
        ...receipts.map(row => ({ id: row.ticket.permitId, direction: 'inbound' as const, sourceNo: row.ticket.orderId,
          partner: row.ticket.supplierId, itemId: row.ticket.itemId, quantity: row.ticket.quantity,
          executed: row.executed, revision: row.revision, fenced: row.fenced, canExecute: reference.canReceive })),
        ...shipments.map(row => ({ ...row, direction: 'outbound' as const, sourceNo: row.orderId, partner: '—', canExecute: row.canShip }))
      ]
      return { warehouses, selected: { ...detail, canReceive: reference.canReceive }, tasks, pools, movements, catalog }
    },
    () => [warehouseId.value, poolPage.value, movementPage.value, route.query.item]
  )
  const submission = useScopedSubmission(
    'warehouse-receive',
    () => query.enabled,
    changeSchema.parse
  )
  const selected = shallowRef<WarehouseTask | null>(null),
    error = ref('')
  const form = reactive({ on: new Date().toLocaleDateString('en-CA'), quantity: '' })
  const frozen = computed(() => !!submission.record || submission.mutation.busy)
  watch(
    () => query.data,
    (value) => {
      if (value && !warehouseId.value) warehouseId.value = value.warehouses.warehouses[0]?.id ?? ''
    }
  )
  watch(
    warehouseId,
    () => {
      poolPage.value = 1
      movementPage.value = 1
      selected.value = null
      error.value = ''
    },
    { flush: 'sync' }
  )
  watch(() => route.query.warehouse, (value) => {
    if (typeof value === 'string') warehouseId.value = value
  })
  watch(() => route.query.item, () => { movementPage.value = 1 })
  watch(
    () => query.owner,
    () => {
      warehouseId.value = typeof route.query.warehouse === 'string' ? route.query.warehouse : ''
      selected.value = null
      error.value = ''
      form.quantity = ''
      poolPage.value = 1
      movementPage.value = 1
    },
    { flush: 'sync' }
  )
  function start(id: string) {
    if (frozen.value || !canExecute(id)) return
    selected.value = query.data?.tasks.find(value => value.id === id) ?? null
    form.quantity = ''
    form.on = new Date().toLocaleDateString('en-CA')
    error.value = ''
  }
  async function confirm() {
    const task = selected.value
    const warehouse = query.data?.selected
    if (!task || frozen.value || !warehouse || !canExecute(task.id)) return false
    const value = z.object({ on: z.iso.date(), quantity: quantityInput }).safeParse(form)
    if (!value.success) {
      error.value = '请填写有效业务日期与正数数量，最多六位小数。'
      return false
    }
    if (
      compareDecimal(value.data.quantity, subtractDecimal(task.quantity, task.executed)) > 0
    ) {
      error.value = '执行数量超过许可剩余。'
      return false
    }
    const shipment = task.direction === 'outbound'
    const success = await submission.send(
      shipment ? 'warehouse.ship' : 'warehouse.receive',
      `/bff/api/inventory/workspaces/${query.session.activeWorkspaceId}/${shipment ? 'shipments' : 'receipts'}/${task.id}/${shipment ? 'ship' : 'receive'}`,
      { expectedRevision: task.revision, ...value.data },
      { resourceId: task.id, warehouseId: warehouse.id }
    )
    if (success) {
      await query.refresh()
      selected.value = null
    }
    return success
  }
  async function readCurrent() {
    if (!selected.value || submission.record) return
    const id = selected.value.id,
      owner = query.owner
    await query.refresh()
    if (owner === query.owner) selected.value = query.data?.tasks.find(value => value.id === id) ?? null
  }
  async function recover(action: 'resume' | 'check' | 'retry') {
    const owner = query.owner,
      saved = submission.record
    if (!saved) return
    try {
      if (action === 'resume') {
        if (saved.warehouseId && warehouseId.value !== saved.warehouseId) {
          warehouseId.value = saved.warehouseId
          await query.refresh()
        }
        if (owner !== query.owner || !query.data?.selected) return
        if (!submission.resume()) return
        Object.assign(form, { on: saved.payload.on, quantity: saved.payload.quantity })
      } else if (action === 'check')
        await submission.check(async () => {
          if (!saved.warehouseId) throw new Error('请先读取原许可所在的仓库。')
          const ids = saved.action === 'warehouse.ship'
            ? (await api.shipments(saved.workspaceId, saved.warehouseId)).map(row => row.id)
            : (await api.receipts(saved.workspaceId, saved.warehouseId)).map(row => row.ticket.permitId)
          if (!ids.includes(saved.resourceId ?? '')) throw new Error('暂无法读取原仓库许可。')
          return null
        })
      else if (await submission.retry()) await query.refresh()
    } catch (failure) {
      if (owner === query.owner) error.value = failure instanceof Error ? failure.message : '恢复暂不可用。'
    }
  }
  function canExecute(id: string) {
    const task = query.data?.tasks.find(value => value.id === id)
    return !!task && task.canExecute && !task.fenced
      && (!task.expiresAtUtc || Date.parse(task.expiresAtUtc) > Date.now())
      && compareDecimal(task.executed, task.quantity) < 0
  }
  const itemName = (id: string) => query.data?.catalog?.page.items.find(item => item.id === id)?.name ?? id
  return reactive({
    query,
    warehouseId,
    poolPage,
    movementPage,
    selected,
    form,
    error,
    changePage: (key: 'pool' | 'movement', step: number) => {
      const target = key === 'pool' ? poolPage : movementPage
      target.value = Math.max(1, target.value + step)
    },
    updateForm: (key: 'on' | 'quantity', value: string) => {
      if (!frozen.value) form[key] = value
    },
    submission,
    frozen,
    start,
    confirm,
    readCurrent,
    recover,
    itemName,
    tasks: computed(() => query.data?.tasks ?? []),
    taskRows: computed(() =>
      (query.data?.tasks ?? []).map(value => ({
        id: value.id,
        direction: value.direction,
        sourceNo: value.sourceNo,
        partner: value.partner,
        status: value.fenced
          ? ('cancelled' as const)
          : compareDecimal(value.executed, value.quantity) >= 0
            ? ('completed' as const)
            : compareDecimal(value.executed, '0') > 0
              ? ('partial' as const)
              : ('pending' as const)
      }))
    ),
    canExecute
  })
}

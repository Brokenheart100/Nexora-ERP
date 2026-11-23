import type { z } from 'zod'
import { fulfillmentChangeSchema, salesPermitsSchema, type SalesPermit } from '#shared/types/sales'
import { quantityInput } from '#shared/types/purchasing'
import { compareDecimal, subtractDecimal, sumDecimals } from '#shared/utils/decimal'
import { useDashboardApi } from '~/composables/api/useDashboardApi'
import { useInventoryApi } from '~/composables/api/useInventoryApi'
import { salesOrdersPath, useSalesApi } from '~/composables/api/useSalesApi'
import { useScopedSubmission } from '~/composables/api/useScopedSubmission'
import type { SalesConnection } from './useSalesConnection'

export function useSalesFulfillment(sales: SalesConnection) {
  const api = useSalesApi()
  const client = useDashboardApi()
  const inventory = useInventoryApi()
  const allowance = shallowRef<z.infer<typeof salesPermitsSchema> | null>(null)
  const warehouses = shallowRef<Awaited<ReturnType<typeof inventory.warehouses>>['warehouses']>([])
  const loading = ref(false)
  const pending = ref(false)
  const error = ref('')
  const form = reactive({ warehouseId: '', reason: '', quantities: {} as Record<string, string> })
  const ws = () => sales.query.session.activeWorkspaceId
  const root = (id: string) => `${salesOrdersPath(ws())}/${id}/fulfillments`
  const submission = useScopedSubmission('sales-fulfillments', () => sales.query.enabled, fulfillmentChangeSchema.parse)
  const busy = computed(() => loading.value || pending.value || submission.mutation.busy || !!submission.record)
  const permits = computed(() => allowance.value?.permits ?? [])
  const canManage = computed(() => allowance.value?.canManage === true
    && ['approved', 'fulfilling', 'fulfilled'].includes(sales.detail?.order.state ?? ''))
  let active: AbortController | undefined
  let poll: AbortController | undefined

  function allowanceFor(lineId: string, quantity: string) {
    return subtractDecimal(quantity, sumDecimals(permits.value.filter(row => row.lineId === lineId)
      .map(row => row.state === 'cancelled' ? row.executed : row.quantity)))
  }

  async function read(id: string) {
    active?.abort()
    const controller = new AbortController()
    active = controller
    loading.value = true
    try {
      const value = await api.permits(ws(), id, controller.signal)
      if (active === controller) allowance.value = value
      return value
    } catch (failure) {
      if (active === controller) {
        allowance.value = null
        error.value = failure instanceof Error ? failure.message : '暂无法读取履约许可。'
      }
      return null
    } finally {
      if (active === controller) loading.value = false
    }
  }
  watch(() => [sales.query.owner, sales.selectedId, sales.detail?.order.isQuote] as const, ([, id, isQuote], previous) => {
    if (previous && (sales.query.owner !== previous[0] || id !== previous[1])) {
      active?.abort()
      active = undefined
      poll?.abort()
      allowance.value = null
      warehouses.value = []
      error.value = ''
      pending.value = loading.value = false
      Object.assign(form, { warehouseId: '', reason: '', quantities: {} })
    }
    if (id && isQuote === false && sales.query.enabled) void read(id)
  }, { flush: 'sync' })
  onScopeDispose(() => {
    active?.abort()
    poll?.abort()
  })

  async function refresh() {
    error.value = ''
    const id = sales.selectedId
    if (!id || !sales.query.enabled) return
    await sales.select(id)
    if (sales.selectedId === id && sales.detail && !sales.detail.order.isQuote) await read(id)
  }
  async function prepare() {
    error.value = ''
    const owner = sales.query.owner
    const id = sales.selectedId
    if (!canManage.value || !sales.detail || busy.value) return false
    try {
      const value = await inventory.warehouses(ws())
      if (owner !== sales.query.owner || id !== sales.selectedId) return false
      warehouses.value = value.warehouses
      form.warehouseId = value.warehouses.length === 1 ? value.warehouses[0]!.id : ''
      form.quantities = {}
      if (!value.warehouses.length) error.value = '没有可用的发货仓库。'
      return true
    } catch (failure) {
      if (owner === sales.query.owner && id === sales.selectedId) error.value = failure instanceof Error ? failure.message : '仓库读取失败。'
      return false
    }
  }
  async function settle(id: string, cancelId?: string) {
    const owner = sales.query.owner
    const result = submission.result
    const location = submission.mutation.operation?.result?.headers.get('location')
    const ids = result && 'permitIds' in result ? result.permitIds : cancelId ? [cancelId] : []
    if (ids.length && sales.selectedId === id) {
      poll?.abort()
      const waiter = new AbortController()
      poll = waiter
      pending.value = true
      try {
        const result = await client.poll(location || root(id), {
          signal: waiter.signal,
          complete: response => ids.every(permitId => salesPermitsSchema.parse(response.data).permits.some(row => row.id === permitId
            && (cancelId ? row.state === 'cancelled' || row.state === 'completed' : row.state !== 'dispatching')))
        })
        if (owner === sales.query.owner && sales.selectedId === id && !waiter.signal.aborted)
          allowance.value = salesPermitsSchema.parse(result.data)
      } catch {
        if (owner === sales.query.owner && sales.selectedId === id && !waiter.signal.aborted)
          error.value = '操作已受理，仓库回执仍在同步。可刷新核对许可状态。'
      } finally {
        if (poll === waiter) pending.value = false
      }
    }
    if (owner === sales.query.owner && sales.selectedId === id) {
      const notice = error.value
      await refresh()
      if (notice && owner === sales.query.owner && sales.selectedId === id) error.value = notice
    }
  }
  async function issue() {
    const order = sales.detail
    if (!order || !canManage.value || busy.value || order.order.state === 'fulfilled') return false
    error.value = ''
    if (!warehouses.value.some(row => row.id === form.warehouseId)) {
      error.value = '请选择发货仓库。'
      return false
    }
    const lines = []
    for (const line of order.lines) {
      const raw = form.quantities[line.id]?.trim()
      if (!raw) continue
      const quantity = quantityInput.safeParse(raw)
      if (!quantity.success || compareDecimal(quantity.data, allowanceFor(line.id, line.quantity)) > 0) {
        error.value = `${line.itemName} 的数量须为正数、最多六位小数且不超过可签发数量。`
        return false
      }
      lines.push({ lineId: line.id, quantity: quantity.data })
    }
    if (!lines.length) {
      error.value = '请填写至少一行许可数量。'
      return false
    }
    const id = order.order.id
    const ok = await submission.send('sales.fulfillment.issue', root(id),
      { warehouseId: form.warehouseId, lines, expectedVersion: order.order.version }, { resourceId: id, etag: sales.etag })
    if (ok) await settle(id)
    return ok
  }
  async function change(permit?: SalesPermit) {
    const order = sales.detail?.order
    if (!order || !canManage.value || busy.value || (!permit && !canClose.value)) return false
    error.value = ''
    const reason = form.reason.trim()
    if (!reason || reason.length > 300) {
      error.value = '请填写不超过 300 字的原因。'
      return false
    }
    const ok = await submission.send(permit ? 'sales.fulfillment.cancel' : 'sales.fulfillment.close',
      root(order.id) + (permit ? `/${permit.id}/cancel` : '/close'),
      { expectedVersion: order.version, reason }, { resourceId: order.id, etag: sales.etag })
    if (ok) await settle(order.id, permit?.id)
    return ok
  }
  async function check() {
    if (!submission.mutation.unknown) submission.resume()
    await submission.check(async (saved) => {
      if (!saved.resourceId) throw new Error('缺少原订单标识。')
      await api.permits(saved.workspaceId, saved.resourceId)
      return null
    })
  }
  async function retry() {
    const saved = submission.record
    if (!saved?.resourceId || !await submission.retry()) return false
    const result = submission.result
    await settle(saved.resourceId, result && 'permitId' in result ? result.permitId : undefined)
    return true
  }
  const canClose = computed(() => canManage.value && permits.value.every(row => ['cancelled', 'completed'].includes(row.state)))

  return reactive({ sales, form, warehouses, permits, allowance, canManage, canClose, loading, busy, error, submission,
    allowanceFor, refresh, prepare, issue, change, check, retry })
}
export type SalesFulfillmentConnection = ReturnType<typeof useSalesFulfillment>

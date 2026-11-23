import { http, HttpResponse } from 'msw/http'
import { z } from 'zod'
import type { SalesDetail, SalesPermit } from '../../../shared/types/sales'
import type { ShipmentAllowance } from '../../../shared/types/receivables'
import type { inventoryMovementSchema } from '../../../shared/types/purchasing'
import { quantityInput } from '../../../shared/types/purchasing'
import { compareDecimal, subtractDecimal, sumDecimals } from '../../../shared/utils/decimal'
import { mockWorkspaceId, problem, type CatalogFixture } from './catalog'

export const salesWarehouseId = 'fd2adf83-5d49-4d1b-bbb8-039816c20015'
type Permit = SalesPermit & { orderId: string, itemId: string, itemName: string, reads: number }
interface Operation {
  key: string
  fingerprint: string
  data: Record<string, unknown>
  status: number
  location?: string
}

export function createSalesFulfillmentHandlers(catalog: CatalogFixture, orders: {
  find: (workspace: string, id: string) => SalesDetail | undefined
  tag: (workspace: string, id: string) => string | undefined
  persist: () => void
}, storage?: Pick<Storage, 'getItem' | 'setItem'>) {
  const key = 'nexora:msw:sales-fulfillment'
  let state: { permits: Permit[], facts: ShipmentAllowance[], operations: Operation[], movements: z.infer<typeof inventoryMovementSchema>[] }
    = { permits: [], facts: [], operations: [], movements: [] }
  try {
    const value = storage?.getItem(key)
    if (value) state = JSON.parse(value) as typeof state
  } catch { /* Start with empty test data. */ }
  state.movements ??= []
  const persist = () => storage?.setItem(key, JSON.stringify(state))
  const active = () => catalog.scenario().startsWith('d5')
  const missing = () => problem(404, 'resource.not_found', '当前工作区没有此资源。')
  const denied = () => problem(403, 'sales.forbidden', '当前身份无权执行该操作。')
  const conflict = (detail: string) => problem(409, 'sales.state_conflict', detail)
  const reviewer = () => catalog.salesPermissions().includes('sales.order.approve')
  const receiver = () => catalog.scenario() === 'd5-receiver'
  const warehouse = () => ({ id: salesWarehouseId, code: 'MSW-D5-WH', name: '销售联调仓', receiverId: null, version: 1,
    canReceive: receiver(), canReadStock: true, canApproveReturns: false, canApproveSalesReturns: false })
  const inventory = '*/bff/api/inventory/workspaces/:workspaceId'
  const sale = '*/bff/api/sales/workspaces/:workspaceId/orders/:id/fulfillments'
  const validWarehouse = (workspace: unknown, id?: unknown) => workspace === mockWorkspaceId && (!id || id === salesWarehouseId)
  const bump = (order: SalesDetail) => (order.order.version = Number(order.order.version) + 1)
  const remaining = (permit: Permit) => subtractDecimal(permit.quantity, permit.executed)

  function respond(operation: Operation) {
    return HttpResponse.json(operation.data, { status: operation.status, headers: operation.location ? { Location: operation.location } : {} })
  }
  async function write(request: Request, workspace: unknown, can: boolean, apply: (body: Record<string, unknown>) =>
    { data: Record<string, unknown>, status?: number, location?: string } | Response) {
    if (!active() || !validWarehouse(workspace)) return missing()
    if (!can) return denied()
    if (request.headers.get('x-csrf-token') !== 'msw-only-csrf') return problem(400, 'csrf.invalid', '写入校验失败。')
    const body = await request.json() as Record<string, unknown>
    const operationId = z.uuid().safeParse(body.operationId)
    if (!operationId.success || operationId.data !== request.headers.get('idempotency-key')) return problem(400, 'idempotency.invalid', '操作标识无效。')
    const operationKey = JSON.stringify([catalog.subject(), workspace, operationId.data])
    const fingerprint = JSON.stringify([new URL(request.url).pathname, request.headers.get('if-match'), body])
    const original = state.operations.find(row => row.key === operationKey)
    if (original) return original.fingerprint === fingerprint ? respond(original) : conflict('操作标识已用于不同的请求。')
    const result = apply(body)
    if (result instanceof Response) return result
    const operation = { ...result, key: operationKey, fingerprint, status: result.status ?? 200 }
    state.operations.push(operation)
    orders.persist()
    persist()
    return respond(operation)
  }
  const resolve = (workspace: string, id: string, version: unknown, request: Request) => {
    const order = orders.find(workspace, id)
    if (!order || order.order.isQuote) return missing()
    return version === order.order.version && request.headers.get('if-match') === orders.tag(workspace, id)
      ? order
      : problem(412, 'sales.precondition_failed', '订单版本已变化。')
  }
  const handlers = [
    http.get(sale, ({ params }) => {
      const order = orders.find(String(params.workspaceId), String(params.id))
      if (!active() || !order || order.order.isQuote) return missing()
      const permits = state.permits.filter(row => row.orderId === order.order.id)
      for (const row of permits) {
        if (row.state === 'dispatching' && row.reads++ > 0) {
          row.state = 'reserved'
          row.revision = 1
          bump(order)
        } else if (row.state === 'cancelling') {
          row.state = 'cancelled'
          row.revision = Number(row.revision) + 1
          bump(order)
        }
      }
      orders.persist()
      persist()
      return HttpResponse.json({ canManage: reviewer(), permits })
    }),
    http.post(sale, ({ params, request }) => write(request, params.workspaceId, reviewer(), (body) => {
      const order = resolve(String(params.workspaceId), String(params.id), body.expectedVersion, request)
      if (order instanceof Response) return order
      if (!['approved', 'fulfilling'].includes(order.order.state)) return conflict('当前状态不可签发。')
      const input = z.object({ warehouseId: z.literal(salesWarehouseId), lines: z.array(z.object({ lineId: z.uuid(), quantity: quantityInput })).min(1).max(50) }).safeParse(body)
      if (!input.success) return problem(400, 'sales.invalid_request', '请输入仓库和有效行数量。')
      const batchId = crypto.randomUUID()
      const batch: Permit[] = []
      for (const row of input.data.lines) {
        const line = order.lines.find(item => item.id === row.lineId)
        const existing = state.permits.filter(permit => permit.lineId === row.lineId)
        const available = line && subtractDecimal(line.quantity, sumDecimals(existing.map(value => value.state === 'cancelled' ? value.executed : value.quantity)))
        if (!line || !available || compareDecimal(row.quantity, available) > 0) return conflict('超过可签发数量。')
        batch.push({ id: crypto.randomUUID(), orderId: order.order.id, warehouseId: salesWarehouseId, lineId: row.lineId,
          itemId: line.itemId, itemName: line.itemName, quantity: row.quantity, executed: '0', revision: 0,
          expiresAtUtc: new Date(Date.now() + 900_000).toISOString(), batchId, state: 'dispatching', reads: 0 })
      }
      state.permits.push(...batch)
      order.order.state = 'fulfilling'
      return { data: { batchId, permitIds: batch.map(row => row.id), orderVersion: bump(order) },
        status: 202, location: new URL(request.url).pathname }
    })),
    http.post(sale + '/:permitId/cancel', ({ params, request }) => write(request, params.workspaceId, reviewer(), (body) => {
      const order = resolve(String(params.workspaceId), String(params.id), body.expectedVersion, request)
      if (order instanceof Response) return order
      const permit = state.permits.find(row => row.orderId === params.id && row.id === params.permitId)
      if (!permit || !['reserved', 'dispatching'].includes(permit.state) || !String(body.reason ?? '').trim()) return conflict('许可暂不可取消。')
      permit.state = 'cancelling'
      return { data: { permitId: permit.id, orderVersion: bump(order) } }
    })),
    http.post(sale + '/close', ({ params, request }) => write(request, params.workspaceId, reviewer(), (body) => {
      const order = resolve(String(params.workspaceId), String(params.id), body.expectedVersion, request)
      if (order instanceof Response) return order
      if (!String(body.reason ?? '').trim() || state.permits.some(row => row.orderId === params.id && !['cancelled', 'completed'].includes(row.state)))
        return conflict('请处理待执行许可并填写原因。')
      order.order.state = 'closed'
      return { data: { id: order.order.id, version: bump(order) } }
    })),
    http.get(inventory + '/warehouses', ({ params }) => active()
      ? HttpResponse.json({ canManage: false, warehouses: validWarehouse(params.workspaceId) ? [warehouse()] : [] })
      : undefined),
    http.get(inventory + '/warehouses/:id', ({ params }) => active() ? validWarehouse(params.workspaceId, params.id) ? HttpResponse.json(warehouse()) : missing() : undefined),
    http.get(inventory + '/warehouses/:id/reference', ({ params }) => active() ? validWarehouse(params.workspaceId, params.id) ? HttpResponse.json(warehouse()) : missing() : undefined),
    http.get(inventory + '/warehouses/:id/receipts', () => active() ? HttpResponse.json([]) : undefined),
    http.get(inventory + '/warehouses/:id/positions', () => active() ? HttpResponse.json([]) : undefined),
    http.get(inventory + '/warehouses/:id/movements', ({ params, request }) => {
      if (!active()) return undefined
      if (!validWarehouse(params.workspaceId, params.id)) return missing()
      const query = new URL(request.url).searchParams
      const page = Number(query.get('page') ?? 1)
      const size = Number(query.get('pageSize') ?? 20)
      const item = query.get('itemId')
      return HttpResponse.json(state.movements.filter(row => !item || row.itemId === item).slice((page - 1) * size, page * size))
    }),
    http.get(inventory + '/warehouses/:id/shipments', ({ params }) => {
      if (!active()) return HttpResponse.json([])
      if (!validWarehouse(params.workspaceId, params.id)) return missing()
      return HttpResponse.json(state.permits.filter(row => row.state !== 'dispatching').map(row => ({
        ...row, fenced: row.state === 'cancelled', canShip: receiver() && row.state === 'reserved'
      })))
    }),
    http.post(inventory + '/shipments/:id/ship', ({ params, request }) => write(request, params.workspaceId, receiver(), (body) => {
      const permit = state.permits.find(row => row.id === params.id)
      if (!permit) return missing()
      if (body.expectedRevision !== permit.revision) return problem(412, 'stock.precondition_failed', '仓库许可修订号已变化。')
      const input = z.object({ on: z.iso.date(), quantity: quantityInput }).safeParse(body)
      if (!input.success || permit.state !== 'reserved' || compareDecimal(input.data.quantity, remaining(permit)) > 0) return conflict('许可剩余不足。')
      const order = orders.find(mockWorkspaceId, permit.orderId)
      const line = order?.lines.find(row => row.id === permit.lineId)
      if (!order || !line) return missing()
      const id = crypto.randomUUID()
      const { on, quantity } = input.data
      permit.executed = sumDecimals([permit.executed, quantity])
      permit.revision = Number(permit.revision) + 1
      if (remaining(permit) === '0') permit.state = 'completed'
      if (order.lines.every(line => compareDecimal(sumDecimals(state.permits.filter(row => row.lineId === line.id).map(row => row.executed)), line.quantity) >= 0))
        order.order.state = 'fulfilled'
      bump(order)
      state.facts.unshift({ id, orderId: order.order.id, itemId: line.itemId, customerId: order.customerId,
        customerName: order.order.customerName, itemName: line.itemName, on, quantity, unitPrice: line.unitPrice,
        available: quantity, creditable: '0', posted: true })
      state.movements.unshift({ id, permitId: permit.id, itemId: line.itemId, sequence: state.movements.length + 1,
        on, quantity: subtractDecimal('0', quantity), cost: '0', reversesId: null })
      return { data: { id, version: permit.revision } }
    }))
  ]
  return { handlers, facts: state.facts, persist }
}

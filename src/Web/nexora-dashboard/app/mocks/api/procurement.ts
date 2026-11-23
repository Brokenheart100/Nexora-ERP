import { http, HttpResponse } from 'msw/http'
import { z } from 'zod'
import {
  purchaseInputSchema,
  purchaseDetailSchema,
  inventoryReceiptSchema,
  inventoryMovementSchema,
  permitSchema,
  type PurchaseDetail
} from '../../../shared/types/purchasing'
import { accrualSchema } from '../../../shared/types/trade'
import { compareDecimal, divideDecimal, multiplyDecimals, subtractDecimal, sumDecimals } from '../../../shared/utils/decimal'
import { purchaseActions, remainingAllowance } from '../../utils/purchasing/order-policy'
import { problem, mockWorkspaceId, type CatalogFixture } from './catalog'
import { mockSupplierId } from './purchasing'

export const d4WarehouseId = '77777777-7777-4777-8777-000000000900'
const stateSchema = z.object({
  orders: z.array(purchaseDetailSchema.extend({ maker: z.string() })),
  permits: z.array(permitSchema.extend({ orderId: z.string() })),
  tasks: z.array(inventoryReceiptSchema),
  movements: z.array(inventoryMovementSchema),
  facts: z.array(accrualSchema),
  operations: z.array(
    z.object({
      key: z.string(),
      fingerprint: z.string(),
      result: z.record(z.string(), z.unknown()),
      status: z.number(),
      location: z.string().optional()
    })
  )
})
export type ProcurementState = z.infer<typeof stateSchema>
export function createProcurementHandlers(context: CatalogFixture, storage?: Pick<Storage, 'getItem' | 'setItem'>) {
  const active = () => context.scenario().startsWith('d4')
  const reviewer = () => context.scenario().startsWith('d4-reviewer')
  const receiver = () => context.scenario() === 'd4-receiver'
  const canCreate = () => context.editable() && !reviewer() && !receiver()
  const key = 'nexora:msw:d4-purchasing'
  let state: ProcurementState = { orders: [], permits: [], tasks: [], movements: [], facts: [], operations: [] }
  try {
    const raw = storage?.getItem(key)
    if (raw) state = stateSchema.parse(JSON.parse(raw))
  } catch {
    /* Discard an invalid development fixture. */
  }
  const persist = () => storage?.setItem(key, JSON.stringify(state))
  if (active() && !context.db.partners.some(value => value.id === mockSupplierId)) {
    context.db.partners.push({
      workspaceId: mockWorkspaceId,
      id: mockSupplierId,
      code: 'MSW-SUP',
      name: 'MSW 演示供应商',
      roles: ['supplier'],
      contacts: [],
      address: null,
      taxNumber: null,
      isActive: true,
      version: 1
    })
    context.persist()
  }
  const denied = () => problem(403, 'purchasing.forbidden', '当前身份无此操作权限。')
  const missing = () => problem(404, 'resource.not_found', '当前工作区没有此资源。')
  const root = '*/bff/api/purchasing/workspaces/:workspaceId/orders'
  const warehouseRoot = '*/bff/api/inventory/workspaces/:workspaceId'
  const allowed = (workspace: unknown) => workspace === mockWorkspaceId && context.allowed(workspace)
  const warehouse = () => ({
    id: d4WarehouseId,
    code: 'MSW-WH',
    name: 'MSW 当前仓库',
    receiverId: null,
    version: 1,
    canReceive: context.editable() && !reviewer(),
    canReadStock: true,
    canApproveReturns: false,
    canApproveSalesReturns: false
  })
  const detail = (order: ProcurementState['orders'][number]): PurchaseDetail => ({
    ...order,
    isMaker: order.maker === context.subject()
  })
  async function write(
    request: Request,
    workspace: unknown,
    can: boolean,
    apply: (body: Record<string, unknown>) => { result: Record<string, unknown>, status?: number, location?: string } | Response
  ) {
    if (!allowed(workspace)) return missing()
    if (!can) return denied()
    if (request.headers.get('x-csrf-token') !== 'msw-only-csrf') return problem(400, 'csrf.invalid', '写入校验失败。')
    const body = (await request.json()) as Record<string, unknown>
    if (!z.uuid().safeParse(body.operationId).success || request.headers.get('idempotency-key') !== body.operationId)
      return problem(400, 'idempotency.invalid', '操作标识无效。')
    const operationKey = JSON.stringify([workspace, context.subject(), body.operationId])
    const fingerprint = JSON.stringify([request.method, new URL(request.url).pathname, body])
    const old = state.operations.find(value => value.key === operationKey)
    if (old)
      return old.fingerprint === fingerprint
        ? HttpResponse.json(old.result, { status: old.status, headers: old.location ? { Location: old.location } : {} })
        : problem(409, 'idempotency.conflict', '原键已绑定另一份请求。')
    const response = apply(body)
    if (response instanceof Response) return response
    state.operations.push({
      key: operationKey,
      fingerprint,
      result: response.result,
      status: response.status ?? 200,
      location: response.location
    })
    persist()
    if (
      (context.scenario() === 'd4-order-unknown'
        && request.method === 'POST'
        && new URL(request.url).pathname.endsWith('/orders'))
      || (context.scenario() === 'd4-stock-unknown' && new URL(request.url).pathname.endsWith('/receive'))
    )
      return HttpResponse.error()
    return HttpResponse.json(response.result, {
      status: response.status ?? 200,
      headers: response.location ? { Location: response.location } : {}
    })
  }
  function make(input: z.infer<typeof purchaseInputSchema>, id: string, version: number, maker: string) {
    const supplier = context.db.partners.find(
      value =>
        value.id === input.draft.supplierId
        && value.workspaceId === mockWorkspaceId
        && value.isActive
        && value.roles.includes('supplier')
    )
    if (!supplier) return problem(409, 'supplier.invalid', '供应商不可用于新交易。')
    const lines = []
    for (const line of input.draft.lines) {
      const item = context.db.items.find(value => value.id === line.itemId && value.isActive && value.tracksInventory)
      if (!item || (context.db.itemWorkspaces[item.id] && context.db.itemWorkspaces[item.id] !== mockWorkspaceId))
        return problem(409, 'item.invalid', '商品不可用于当前采购。')
      const unit = context.db.definitions.find(
        value => value.id === item.unitId && value.workspaceId === mockWorkspaceId && value.isActive
      )
      if (!unit) return problem(400, 'unit.invalid', '计量单位不可用。')
      lines.push({
        id: crypto.randomUUID(),
        itemId: item.id,
        itemCode: item.code,
        itemName: item.name,
        itemVersion: item.version,
        unitCode: unit.code,
        unitVersion: unit.version,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        amount: multiplyDecimals(line.quantity, line.unitPrice)
      })
    }
    return {
      order: {
        id,
        number: input.number,
        on: input.draft.on,
        currency: 'CNY',
        supplierName: supplier.name,
        state: 'draft',
        version,
        departmentId: input.draft.departmentId
      },
      supplierId: supplier.id,
      supplierCode: supplier.code,
      supplierVersion: supplier.version,
      note: input.draft.note,
      minorUnits: 2,
      lines,
      total: sumDecimals(lines.map(line => line.amount)),
      isMaker: true,
      approvedAtUtc: null,
      approvedVersion: null,
      maker
    }
  }
  const handlers = [
    http.get(root, ({ params, request }) => {
      if (!active()) return
      if (!allowed(params.workspaceId)) return missing()
      const page = Math.max(1, Number(new URL(request.url).searchParams.get('page') ?? 1)),
        size = Math.min(100, Number(new URL(request.url).searchParams.get('pageSize') ?? 20))
      const rows = [...state.orders].reverse()
      return HttpResponse.json({
        canCreate: canCreate(),
        canApprove: reviewer(),
        orders: rows.slice((page - 1) * size, page * size).map(value => value.order),
        hasMore: rows.length > page * size
      })
    }),
    http.get(root + '/:id', ({ params }) => {
      if (!active()) return
      const value = allowed(params.workspaceId) && state.orders.find(order => order.order.id === params.id)
      return value ? HttpResponse.json(detail(value)) : missing()
    }),
    http.post(root, ({ params, request }) => {
      if (!active()) return
      return write(request, params.workspaceId, canCreate(), (body) => {
        const input = purchaseInputSchema.safeParse(body)
        if (!input.success) return problem(400, 'validation.failed', '采购单字段无效。')
        if (state.orders.some(value => value.order.number === input.data.number))
          return problem(409, 'number.duplicate', '单号已存在。')
        const value = make(input.data, crypto.randomUUID(), 1, context.subject())
        if (value instanceof Response) return value
        state.orders.push(value)
        return {
          result: { id: value.order.id, version: 1 },
          status: 201,
          location: new URL(request.url).pathname + '/' + value.order.id
        }
      })
    }),
    http.put(root + '/:id', ({ params, request }) => {
      if (!active()) return
      return write(request, params.workspaceId, canCreate(), (body) => {
        const value = state.orders.find(order => order.order.id === params.id)
        if (!value) return missing()
        if (value.maker !== context.subject()) return denied()
        if (String(body.expectedVersion) !== String(value.order.version) || value.order.state !== 'draft')
          return problem(409, 'version.conflict', '版本或状态已变化，原输入保留。')
        const input = purchaseInputSchema.safeParse({ number: value.order.number, draft: body.draft })
        if (!input.success) return problem(400, 'validation.failed', '采购单字段无效。')
        const next = make(input.data, value.order.id, Number(value.order.version) + 1, value.maker)
        if (next instanceof Response) return next
        Object.assign(value, next)
        return { result: { id: value.order.id, version: value.order.version } }
      })
    }),
    http.post(root + '/:id/decision', ({ params, request }) => {
      if (!active()) return
      return write(request, params.workspaceId, context.editable(), (body) => {
        const value = state.orders.find(order => order.order.id === params.id)
        if (!value) return missing()
        const grants = [
          'purchasing.order.read',
          ...(reviewer() ? ['purchasing.order.approve'] : canCreate() ? ['purchasing.order.create', 'purchasing.order.submit'] : [])
        ]
        if (
          !purchaseActions({ ...value.order, isMaker: value.maker === context.subject() }, { permissions: grants }).includes(
            body.decision as 'approve'
          )
        )
          return denied()
        if (String(body.expectedVersion) !== String(value.order.version)) return problem(409, 'version.conflict', '版本已变化。')
        value.order.state = { submit: 'submitted', withdraw: 'draft', return: 'draft', approve: 'approved', cancel: 'cancelled' }[
          String(body.decision)
        ]!
        value.order.version = Number(value.order.version) + 1
        if (body.decision === 'approve') {
          value.approvedVersion = value.order.version
          value.approvedAtUtc = new Date().toISOString()
        }
        return { result: { id: value.order.id, version: value.order.version } }
      })
    }),
    http.get(root + '/:id/receipts', ({ params }) => {
      if (!active()) return
      return allowed(params.workspaceId) && state.orders.some(value => value.order.id === params.id)
        ? HttpResponse.json({ canManage: reviewer(), permits: state.permits.filter(value => value.orderId === params.id) })
        : missing()
    }),
    http.post(root + '/:id/receipts', ({ params, request }) => {
      if (!active()) return
      return write(request, params.workspaceId, reviewer(), (body) => {
        const order = state.orders.find(value => value.order.id === params.id),
          quantity = z
            .string()
            .regex(/^\d+(\.\d{1,6})?$/)
            .safeParse(body.quantity)
        if (!order) return missing()
        if (String(body.expectedVersion) !== String(order.order.version))
          return problem(409, 'version.conflict', '订单版本已变化。')
        const line = order.lines.find(value => value.id === body.lineId)
        if (!line || body.warehouseId !== d4WarehouseId || !quantity.success || compareDecimal(quantity.data, '0') <= 0)
          return problem(400, 'validation.failed', '许可字段无效。')
        if (
          !['approved', 'receiving'].includes(order.order.state)
          || compareDecimal(
            quantity.data,
            remainingAllowance(
              line.quantity,
              line.id,
              state.permits.filter(value => value.orderId === order.order.id)
            )
          ) > 0
        )
          return problem(409, 'allowance.exceeded', '许可数量超过余量。')
        const permitId = crypto.randomUUID()
        state.permits.push({
          id: permitId,
          orderId: order.order.id,
          lineId: line.id,
          warehouseId: d4WarehouseId,
          quantity: quantity.data,
          executed: '0',
          revision: 1,
          state: 'issued'
        })
        state.tasks.push({
          ticket: {
            tenantId: mockWorkspaceId,
            workspaceId: mockWorkspaceId,
            permitId,
            orderId: order.order.id,
            lineId: line.id,
            approvedVersion: order.approvedVersion!,
            warehouseId: d4WarehouseId,
            itemId: line.itemId,
            unitId: context.db.items.find(value => value.id === line.itemId)!.unitId,
            supplierId: order.supplierId,
            orderDate: order.order.on,
            quantity: quantity.data,
            unitPrice: line.unitPrice,
            currency: 'CNY',
            minorUnits: 2
          },
          executed: '0',
          cost: '0',
          fenced: false,
          revision: 1
        })
        order.order.version = Number(order.order.version) + 1
        order.order.state = 'receiving'
        return { result: { permitId, orderVersion: order.order.version }, status: 202, location: new URL(request.url).pathname }
      })
    }),
    http.post(root + '/:id/receipts/:permitId/cancel', ({ params, request }) => {
      if (!active()) return
      return write(request, params.workspaceId, reviewer(), (body) => {
        const order = state.orders.find(value => value.order.id === params.id),
          permit = state.permits.find(value => value.id === params.permitId && value.orderId === params.id)
        if (!order || !permit) return missing()
        if (String(body.expectedVersion) !== String(order.order.version) || permit.state === 'completed')
          return problem(409, 'version.conflict', '订单或许可状态已变化。')
        if (!String(body.reason ?? '').trim()) return problem(400, 'validation.failed', '请填写取消原因。')
        permit.state = 'cancelled'
        permit.revision = Number(permit.revision) + 1
        const task = state.tasks.find(value => value.ticket.permitId === permit.id)!
        task.fenced = true
        task.revision = Number(task.revision) + 1
        order.order.version = Number(order.order.version) + 1
        return {
          result: { permitId: permit.id, orderVersion: order.order.version },
          status: 200
        }
      })
    }),
    http.post(root + '/:id/receipts/close', ({ params, request }) => {
      if (!active()) return
      return write(request, params.workspaceId, reviewer(), (body) => {
        const order = state.orders.find(value => value.order.id === params.id)
        if (!order) return missing()
        if (
          String(body.expectedVersion) !== String(order.order.version)
          || state.permits.some(value => value.orderId === params.id && !['cancelled', 'completed'].includes(value.state))
        )
          return problem(409, 'allowance.pending', '请先核对未完成许可。')
        if (!String(body.reason ?? '').trim()) return problem(400, 'validation.failed', '请填写关闭原因。')
        order.order.state = 'closed'
        order.order.version = Number(order.order.version) + 1
        return { result: { id: order.order.id, version: order.order.version } }
      })
    }),
    http.get(warehouseRoot + '/warehouses', ({ params }) =>
      active()
        ? allowed(params.workspaceId)
          ? HttpResponse.json({ canManage: false, warehouses: [warehouse()] })
          : missing()
        : undefined
    ),
    ...['', '/reference'].map(tail =>
      http.get(warehouseRoot + '/warehouses/:id' + tail, ({ params }) =>
        active()
          ? allowed(params.workspaceId) && params.id === d4WarehouseId
            ? HttpResponse.json(warehouse())
            : missing()
          : undefined
      )
    ),
    http.get(warehouseRoot + '/warehouses/:id/receipts', ({ params }) =>
      active()
        ? allowed(params.workspaceId) && params.id === d4WarehouseId
          ? HttpResponse.json(state.tasks)
          : missing()
        : undefined
    ),
    http.get(warehouseRoot + '/warehouses/:id/movements', ({ params }) =>
      active()
        ? allowed(params.workspaceId) && params.id === d4WarehouseId
          ? HttpResponse.json(state.movements)
          : missing()
        : undefined
    ),
    http.get(warehouseRoot + '/warehouses/:id/positions', ({ params }) => {
      if (!active()) return
      if (!allowed(params.workspaceId) || params.id !== d4WarehouseId) return missing()
      const ids = [...new Set(state.movements.map(value => value.itemId))]
      return HttpResponse.json(
        ids.map((itemId) => {
          const movements = state.movements.filter(value => value.itemId === itemId),
            quantity = sumDecimals(movements.map(value => value.quantity)),
            value = sumDecimals(movements.map(value => value.cost))
          return {
            itemId,
            unitId: context.db.items.find(value => value.id === itemId)!.unitId,
            currency: 'CNY',
            quantity,
            value,
            average: compareDecimal(quantity, '0') === 0 ? '0' : divideDecimal(value, quantity, 6),
            sequence: movements.length,
            reserved: '0',
            available: quantity
          }
        })
      )
    }),
    http.post(warehouseRoot + '/receipts/:id/receive', ({ params, request }) => {
      if (!active()) return
      return write(request, params.workspaceId, warehouse().canReceive, (body) => {
        const task = state.tasks.find(value => value.ticket.permitId === params.id),
          input = z.object({ on: z.iso.date(), quantity: z.string().regex(/^\d+(\.\d{1,6})?$/) }).safeParse(body)
        if (!task) return missing()
        if (String(body.expectedRevision) !== String(task.revision))
          return problem(409, 'version.conflict', '仓库许可修订号已变化。')
        if (!input.success || compareDecimal(input.data.quantity, '0') <= 0)
          return problem(400, 'validation.failed', '收货字段无效。')
        if (task.fenced || compareDecimal(input.data.quantity, subtractDecimal(task.ticket.quantity, task.executed)) > 0)
          return problem(409, 'receipt.exceeded', '许可已关闭或收货超量。')
        const cost = multiplyDecimals(input.data.quantity, task.ticket.unitPrice),
          id = crypto.randomUUID(),
          sequence = state.movements.filter(value => value.itemId === task.ticket.itemId).length + 1
        task.executed = sumDecimals([task.executed, input.data.quantity])
        task.cost = sumDecimals([task.cost, cost])
        task.revision = Number(task.revision) + 1
        state.movements.push({
          id,
          itemId: task.ticket.itemId,
          permitId: task.ticket.permitId,
          sequence,
          on: input.data.on,
          quantity: input.data.quantity,
          cost,
          reversesId: null
        })
        const permit = state.permits.find(value => value.id === task.ticket.permitId)!
        permit.executed = task.executed
        permit.state = compareDecimal(task.executed, task.ticket.quantity) === 0 ? 'completed' : 'issued'
        permit.revision = Number(permit.revision) + 1
        const order = state.orders.find(value => value.order.id === task.ticket.orderId)!
        order.order.version = Number(order.order.version) + 1
        const executed = sumDecimals(state.permits.filter(value => value.orderId === order.order.id).map(value => value.executed))
        order.order.state
          = compareDecimal(executed, sumDecimals(order.lines.map(value => value.quantity))) === 0 ? 'received' : 'receiving'
        state.facts.push({
          fact: {
            id,
            tenantId: mockWorkspaceId,
            workspaceId: mockWorkspaceId,
            warehouseId: d4WarehouseId,
            itemId: task.ticket.itemId,
            orderId: task.ticket.orderId,
            lineId: task.ticket.lineId,
            permitId: task.ticket.permitId,
            supplierId: task.ticket.supplierId,
            sequence,
            on: input.data.on,
            quantity: input.data.quantity,
            cost,
            currency: 'CNY',
            reversesId: null,
            adjustmentForBillId: null
          },
          posted: context.scenario() !== 'd4-pending',
          pendingReason: context.scenario() === 'd4-pending' ? '会计期间未开放，等待处理。' : null,
          journalId: context.scenario() === 'd4-pending' ? null : crypto.randomUUID(),
          matchedQuantity: '0',
          matchedCost: '0'
        })
        return { result: { id, version: sequence } }
      })
    })
  ]
  return { handlers, state, persist, active, allowed, reviewer, receiver, canCreate, context }
}
export type ProcurementFixture = ReturnType<typeof createProcurementHandlers>

import { http, HttpResponse } from 'msw/http'
import type { CatalogFixture } from './catalog'
import { mockItemId, mockWorkspaceId, tenantId } from './catalog'
import { createBusinessFixture } from './business-fixture'
import { compareDecimal, multiplyDecimals, subtractDecimal, sumDecimals } from '../../../shared/utils/decimal'
import type { StockOperation, StockReturn } from '../../../shared/types/inventory'
import { createReturnFinanceHandlers } from './return-finance'

export const mswSourceWarehouse = '71afd6f2-5fc9-4670-9cfa-a5750586147c'
export const mswTargetWarehouse = '83aa2e9e-8cab-4909-985e-328443e17c03'
export const mswSourceMovement = '70f64eb8-2ce4-4cb2-b60e-74a223e53397'
export const mswSalesMovement = 'ab1cd1f7-4f11-4680-8e04-0239ed2f2c01'
const sourceMember = 'c7d0295a-bec1-4f58-af74-253f61c80e14', targetMember = 'a17f6880-5f68-4559-9176-d7cb3213fdab'
const receiptPermit = 'b2ccf0ae-6c6a-4fa8-9925-1a3734482328'
const salePermit = '3e2c7fb7-415b-4cbf-a371-f742560fdf41'
const sourceOrder = '090aa768-f681-4e3d-aa09-7c12e3dfbe4d'
const unit = 'ea6804f2-10e3-4a5c-8ec0-e7e1074dac62'
interface Warehouse { id: string, code: string, name: string, receiverId: string | null, version: number }
interface Movement { id: string, warehouse: string, itemId: string, permitId: string, sequence: number, on: string, quantity: string, cost: string, reversesId: string | null }

export function createWarehouseOperationHandlers(catalog: CatalogFixture, storage?: Pick<Storage, 'getItem' | 'setItem'>) {
  const fixture = createBusinessFixture(catalog, 'd6', {
    warehouses: [
      { id: mswSourceWarehouse, code: 'D6-源仓', name: '源仓', receiverId: sourceMember, version: 1 },
      { id: mswTargetWarehouse, code: 'D6-目标仓', name: '目标仓', receiverId: targetMember, version: 1 }
    ] as Warehouse[],
    movements: [
      { id: mswSourceMovement, warehouse: mswSourceWarehouse, itemId: mockItemId, permitId: receiptPermit,
        sequence: 1, on: '2026-01-08', quantity: '10', cost: '60', reversesId: null },
      { id: mswSalesMovement, warehouse: mswSourceWarehouse, itemId: mockItemId, permitId: salePermit,
        sequence: 2, on: '2026-01-08', quantity: '-4', cost: '-24', reversesId: null }
    ] as Movement[],
    stock: [] as (StockOperation & { maker: string })[],
    returns: [] as (StockReturn & { maker: string, direction: 'purchase' | 'sale' })[]
  }, storage)
  const { state } = fixture
  const member = () => catalog.scenario() === 'd6-source' ? sourceMember : catalog.scenario() === 'd6-destination' ? targetMember : tenantId
  const manage = () => catalog.scenario().startsWith('d6-owner')
  const canApprove = () => manage() || catalog.scenario().startsWith('d6-reviewer')
  const inventory = '*/bff/api/inventory/workspaces/:workspaceId'
  const warehouse = inventory + '/warehouses/:id'
  const view = (row: Warehouse) => ({ ...row, canReceive: row.receiverId === member(), canReadStock: true,
    canApproveReturns: canApprove(), canApproveSalesReturns: canApprove() })
  const byWarehouse = (id: unknown) => state.warehouses.find(row => row.id === id)
  const pools = (id: unknown) => {
    const movements = state.movements.filter(row => row.warehouse === id)
    if (!movements.length) return []
    const quantity = sumDecimals(movements.map(row => row.quantity))
    return [{ itemId: mockItemId, unitId: unit, currency: 'CNY', quantity, value: sumDecimals(movements.map(row => row.cost)),
      average: '6', sequence: movements.length, reserved: '0', available: quantity }]
  }
  const byOperation = (id: unknown) => state.stock.find(row => row.id === id)
  const recordView = (row: (typeof state.stock)[number], at: unknown) => {
    const target = byWarehouse(row.destinationId)
    return { ...row, canConfirm: row.state === 'pending' && row.maker !== member() && (manage() || (at === row.destinationId && target?.receiverId === member())),
      canCancel: row.state === 'pending' && (manage() || row.maker === member()),
      canReceive: row.state === 'in-transit' && at === row.destinationId && target?.receiverId === member() && row.maker !== member() }
  }
  function movement(warehouseId: string, permitId: string, on: string, quantity: string, reversesId: string | null = null) {
    const id = crypto.randomUUID()
    const sequence = (pools(warehouseId)[0]?.sequence ?? 0) + 1
    state.movements.unshift({ id, warehouse: warehouseId, itemId: mockItemId, permitId, sequence, on, quantity, cost: multiplyDecimals(quantity, '6'), reversesId })
    return id
  }
  const returnList = (id: unknown, direction: 'purchase' | 'sale') => state.returns.filter(row =>
    row.direction === direction && state.movements.some(entry => entry.id === row.originalId && entry.warehouse === id))
    .map(row => ({ ...row, canConfirm: byWarehouse(id)?.receiverId === member() && row.maker !== member() && !row.cancelled && !row.movementId }))
  return [
    ...createReturnFinanceHandlers(catalog, { purchasePermit: receiptPermit, salePermit, orderId: sourceOrder, movements: () => state.movements }, storage),
    http.get('*/bff/api/workspaces/:id/members', ({ params }) => fixture.read(params.id, () => [
      { id: sourceMember, email: 'source@example.invalid', subject: 'source', isActive: true },
      { id: targetMember, email: 'target@example.invalid', subject: 'target', isActive: true }
    ])),
    http.get(inventory + '/warehouses', ({ params }) => fixture.read(params.workspaceId, () => ({ warehouses: state.warehouses.map(view), canManage: manage() }))),
    ...['', '/reference'].map(suffix => http.get(warehouse + suffix, ({ params }) =>
      fixture.read(params.workspaceId, () => byWarehouse(params.id) ? view(byWarehouse(params.id)!) : fixture.missing()))),
    http.post(inventory + '/warehouses', ({ params, request }) => fixture.write(params.workspaceId, request, (body) => {
      if (!manage()) return fixture.forbidden()
      if (state.warehouses.some(row => row.code === body.code)) return fixture.conflict('仓库编码已存在。')
      const id = crypto.randomUUID()
      state.warehouses.push({ id, code: String(body.code), name: String(body.name), version: 1, receiverId: null })
      return { id, version: 1 }
    }, 201)),
    http.put(warehouse + '/receiver', ({ params, request }) => fixture.write(params.workspaceId, request, (body) => {
      if (!manage()) return fixture.forbidden()
      const row = byWarehouse(params.id)
      if (!row) return fixture.missing()
      if (row.version !== body.expectedVersion) return fixture.stale()
      row.receiverId = typeof body.memberId === 'string' ? body.memberId : null
      return { id: row.id, version: ++row.version }
    })),
    http.get(warehouse + '/positions', ({ params }) => fixture.read(params.workspaceId, () => pools(params.id))),
    http.get(warehouse + '/movements', ({ params, request }) => fixture.read(params.workspaceId, () => {
      const item = new URL(request.url).searchParams.get('itemId')
      return state.movements.filter(row => row.warehouse === params.id && (!item || row.itemId === item))
    })),
    http.get(warehouse + '/shipments', ({ params }) => fixture.read(params.workspaceId, () => params.id === mswSourceWarehouse
      ? [{
          id: salePermit, orderId: sourceOrder, itemId: mockItemId, itemName: 'MSW 演示商品', quantity: '4', executed: '4', revision: 2,
          fenced: true, expiresAtUtc: '2026-02-01T00:00:00Z', canShip: false
        }]
      : [])),
    http.get(warehouse + '/receipts', ({ params }) => fixture.read(params.workspaceId, () => params.id === mswSourceWarehouse
      ? [{
          ticket: { permitId: receiptPermit, tenantId, workspaceId: mockWorkspaceId, orderId: sourceOrder, lineId: sourceOrder, approvedVersion: 1,
            warehouseId: mswSourceWarehouse, itemId: mockItemId, unitId: unit, supplierId: sourceOrder,
            orderDate: '2026-01-08', quantity: '10', unitPrice: '6', currency: 'CNY', minorUnits: 2 },
          executed: '10', cost: '60', fenced: false, revision: 2
        }]
      : [])),
    ...(['purchase', 'sale'] as const).map(direction => http.get(warehouse + (direction === 'sale' ? '/sales-returns' : '/returns'), ({ params }) =>
      fixture.read(params.workspaceId, () => returnList(params.id, direction)) ?? HttpResponse.json([]))),
    ...(['purchase', 'sale'] as const).map(direction => http.post(inventory + (direction === 'purchase' ? '/movements/:id/returns' : '/shipments/:id/returns'), ({ params, request }) => fixture.write(params.workspaceId, request, (body) => {
      if (!canApprove()) return fixture.forbidden()
      const original = state.movements.find(row => row.id === params.id && row.permitId === (direction === 'purchase' ? receiptPermit : salePermit) && !row.reversesId)
      if (!original) return fixture.missing()
      const used = sumDecimals(state.returns.filter(row => row.originalId === original.id && !row.cancelled).map(row => row.quantity))
      const quantity = String(body.quantity)
      const executed = direction === 'purchase' ? original.quantity : subtractDecimal('0', original.quantity)
      if (compareDecimal(quantity, subtractDecimal(executed, used)) > 0) return fixture.conflict('退货数量超过剩余。')
      const id = crypto.randomUUID()
      state.returns.unshift({ id, originalId: original.id, on: String(body.on), quantity, reason: String(body.reason),
        cancelled: false, movementId: null, canConfirm: false, maker: member(), direction })
      return { id, version: 1 }
    }))),
    ...(['purchase', 'sale'] as const).map(direction => http.post(inventory + (direction === 'purchase' ? '/returns/:id/decision' : '/sales-returns/:id/decision'), ({ params, request }) => fixture.write(params.workspaceId, request, (body) => {
      const row = state.returns.find(entry => entry.id === params.id && entry.direction === direction)
      const original = state.movements.find(entry => entry.id === row?.originalId)
      if (!row || !original) return fixture.missing()
      if (row.cancelled || row.movementId) return fixture.conflict('退货已完成。')
      if (body.confirm) {
        if (row.maker === member() || byWarehouse(original.warehouse)?.receiverId !== member()) return fixture.forbidden()
        row.movementId = movement(original.warehouse, original.permitId, row.on, direction === 'purchase' ? subtractDecimal('0', row.quantity) : row.quantity, original.id)
      } else {
        if (!canApprove()) return fixture.forbidden()
        row.cancelled = true
      }
      return { id: row.movementId ?? row.id, version: 2 }
    }))),
    http.get(warehouse + '/stock-operations', ({ params }) => fixture.read(params.workspaceId, () =>
      state.stock.filter(row => row.warehouseId === params.id || row.destinationId === params.id).map(row => recordView(row, params.id)))),
    http.get(warehouse + '/stock-operations/destinations', ({ params }) => fixture.read(params.workspaceId, () =>
      state.warehouses.filter(row => row.id !== params.id && row.receiverId && row.receiverId !== member()))),
    http.get(warehouse + '/stock-operations/:operation', ({ params }) => fixture.read(params.workspaceId, () => {
      const row = byOperation(params.operation)
      return row && [row.warehouseId, row.destinationId].includes(String(params.id)) ? recordView(row, params.id) : fixture.missing()
    })),
    http.post(warehouse + '/stock-operations', ({ params, request }) => fixture.write(params.workspaceId, request, (body) => {
      const id = String(params.id)
      if (byWarehouse(id)?.receiverId !== member()) return fixture.forbidden()
      const pool = pools(id)[0]
      if (!pool || body.expectedSequence !== pool.sequence) return fixture.stale()
      const quantity = String(body.quantity)
      if (body.destinationId && compareDecimal(quantity, pool.available) > 0) return fixture.conflict('可用库存不足。')
      const row: (typeof state.stock)[number] = { id: crypto.randomUUID(), warehouseId: id, itemId: mockItemId, on: String(body.on),
        bookQuantity: pool.quantity, quantity, reason: String(body.reason), destinationId: typeof body.destinationId === 'string' ? body.destinationId : null,
        state: 'pending', version: 1, canCancel: true, canConfirm: false, canReceive: false, maker: member() }
      state.stock.unshift(row)
      return { id: row.id, version: 1 }
    }, 201)),
    http.post(inventory + '/stock-operations/:id/:action', ({ params, request }) => fixture.write(params.workspaceId, request, (body) => {
      const row = byOperation(params.id)
      if (!row) return fixture.missing()
      if (params.action === 'receive' && row.state !== 'in-transit') return fixture.conflict('只有在途调拨可签收。')
      if (row.version !== body.expectedVersion) return fixture.stale()
      const at = row.destinationId ?? row.warehouseId, permissions = recordView(row, at)
      if (params.action === 'receive') {
        if (!permissions.canReceive || !row.destinationId) return fixture.forbidden()
        row.destinationMovementId = movement(row.destinationId, row.id, String(body.on), row.quantity)
        row.receivedOn = String(body.on)
        row.state = 'confirmed'
      } else if (body.confirm) {
        if (!permissions.canConfirm) return fixture.forbidden()
        const quantity = row.destinationId ? subtractDecimal('0', row.quantity) : subtractDecimal(row.quantity, row.bookQuantity)
        if (quantity !== '0') row.movementId = movement(row.warehouseId, row.id, row.on, quantity)
        row.transitCost = row.destinationId ? multiplyDecimals(row.quantity, '6') : null
        row.state = row.destinationId ? 'in-transit' : 'confirmed'
      } else {
        if (!permissions.canCancel) return fixture.forbidden()
        row.state = 'cancelled'
      }
      row.version = Number(row.version) + 1
      return { id: row.id, version: row.version }
    }))
  ]
}

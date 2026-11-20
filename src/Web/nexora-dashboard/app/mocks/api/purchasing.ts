import { http, HttpResponse } from 'msw/http'
import { purchaseInputSchema, type PurchaseDetail } from '#shared/types/purchasing'
import { multiplyDecimals, sumDecimals } from '#shared/utils/decimal'

export const mockSupplierId = '44444444-4444-4444-8444-444444444444'
export function createPurchaseHandlers(context: { workspaceId: string, scenario: () => string, item: { id: string, code: string, name: string, version: number } }) {
  const root = `*/bff/api/purchasing/workspaces/${context.workspaceId}/orders`
  const supplier = { id: mockSupplierId, code: 'MSW-SUP', name: 'MSW 演示供应商', roles: ['supplier'], isActive: true, version: 1 }
  const orders = new Map<string, PurchaseDetail>()
  const responses = new Map<string, { id: string, version: number | string }>()
  const problem = (status: number, detail: string) => HttpResponse.json({ status, title: detail, detail, code: 'mock.purchase', traceId: 'msw-demo' }, { status })
  function details(input: ReturnType<typeof purchaseInputSchema.parse>, id: string, version: number): PurchaseDetail {
    const lines = input.draft.lines.map(line => ({ id: crypto.randomUUID(), itemId: line.itemId, itemCode: context.item.code, itemName: context.item.name, itemVersion: context.item.version,
      unitCode: 'MSW-PCS', unitVersion: 1, quantity: line.quantity, unitPrice: line.unitPrice, amount: multiplyDecimals(line.quantity, line.unitPrice) }))
    return { order: { id, number: input.number, on: input.draft.on, currency: 'CNY', supplierName: supplier.name, state: 'draft', version, departmentId: input.draft.departmentId },
      supplierId: supplier.id, supplierCode: supplier.code, supplierVersion: 1, note: input.draft.note, minorUnits: 2, lines, total: sumDecimals(lines.map(line => line.amount)), isMaker: true, approvedVersion: null, approvedAtUtc: null }
  }
  const initial = details({ number: 'PO-MSW-001', draft: { on: '2026-01-01', supplierId: supplier.id, departmentId: null, note: '模拟数据，仅用于页面开发。', lines: [{ itemId: context.item.id, quantity: '100', unitPrice: '10' }] } }, '55555555-5555-4555-8555-555555555555', 1)
  orders.set(initial.order.id, initial)
  return [
    http.get(`*/bff/api/masterdata/workspaces/${context.workspaceId}/partners`, () => HttpResponse.json({ items: [supplier], hasMore: false, canManage: true })),
    http.get(`*/bff/api/masterdata/workspaces/${context.workspaceId}/partners/:id`, () => HttpResponse.json({ ...supplier, taxNumber: null, address: null, contacts: [] })),
    http.get(`*/bff/api/masterdata/workspaces/${context.workspaceId}/partners/:id/reference`, () => HttpResponse.json({ ...supplier, role: 'supplier' })),
    http.get(`*/bff/api/finance/workspaces/${context.workspaceId}/book`, () => HttpResponse.json({ isPersonal: false, canInitialize: false, settings: { baseCurrency: 'CNY', minorUnits: 2, startsOn: '2026-01-01', fiscalYearStartMonth: 1, template: 'trading' }, accounts: [] })),
    http.get(root, () => {
      if (context.scenario() === 'forbidden') return problem(403, '模拟：当前身份无权读取采购单。')
      if (context.scenario() === 'unavailable') return problem(503, '模拟：采购服务暂不可用。')
      return HttpResponse.json({ canCreate: true, canApprove: false, hasMore: false, orders: context.scenario() === 'empty' ? [] : [...orders.values()].map(detail => detail.order) })
    }),
    http.get(root + '/:id', ({ params }) => orders.has(String(params.id)) ? HttpResponse.json(orders.get(String(params.id))) : problem(404, '模拟采购单不存在。')),
    http.post(root, async ({ request }) => {
      const body = await request.json() as { operationId: string }
      const input = purchaseInputSchema.safeParse(body)
      if (!input.success) return problem(400, '采购单字段无效。')
      const replay = responses.get(body.operationId)
      if (replay) return HttpResponse.json(replay, { status: 201 })
      const id = crypto.randomUUID()
      const detail = details(input.data, id, 1)
      orders.set(id, detail)
      const result = { id, version: 1 }
      responses.set(body.operationId, result)
      return HttpResponse.json(result, { status: 201, headers: { Location: `/bff/api/purchasing/workspaces/${context.workspaceId}/orders/${id}` } })
    }),
    http.put(root + '/:id', async ({ params, request }) => {
      const current = orders.get(String(params.id))
      if (!current) return problem(404, '模拟采购单不存在。')
      const body = await request.json() as { operationId: string, expectedVersion: number, draft: unknown }
      if (responses.has(body.operationId)) return HttpResponse.json(responses.get(body.operationId))
      if (String(current.order.version) !== String(body.expectedVersion)) return problem(409, '采购单版本已变更。')
      const input = purchaseInputSchema.safeParse({ number: current.order.number, draft: body.draft })
      if (!input.success) return problem(400, '采购单字段无效。')
      const next = details(input.data, current.order.id, Number(current.order.version) + 1)
      orders.set(next.order.id, next)
      const result = { id: next.order.id, version: next.order.version }
      responses.set(body.operationId, result)
      return HttpResponse.json(result)
    }),
    http.post(root + '/:id/decision', async ({ params, request }) => {
      const current = orders.get(String(params.id))
      if (!current) return problem(404, '模拟采购单不存在。')
      const body = await request.json() as { operationId: string, expectedVersion: number, decision: string }
      if (responses.has(body.operationId)) return HttpResponse.json(responses.get(body.operationId))
      if (String(body.expectedVersion) !== String(current.order.version)) return problem(409, '采购单版本已变更。')
      const target = { submit: 'submitted', withdraw: 'draft', return: 'draft', approve: 'approved', cancel: 'cancelled' }[body.decision]
      if (!target) return problem(400, '模拟决定无效。')
      current.order.state = target
      current.order.version = Number(current.order.version) + 1
      const result = { id: current.order.id, version: current.order.version }
      responses.set(body.operationId, result)
      return HttpResponse.json(result)
    }),
    http.get(root + '/:id/receipts', () => HttpResponse.json({ canManage: false, permits: [] }))
  ]
}

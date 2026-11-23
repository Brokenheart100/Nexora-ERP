import { http, HttpResponse } from 'msw/http'
import { z } from 'zod'
import { salesDecisionSchema, salesDraftSchema, salesNumberSchema, type SalesDetail } from '../../../shared/types/sales'
import { multiplyDecimals, roundDecimal, sumDecimals } from '../../../shared/utils/decimal'
import { mockWorkspaceId, problem, type CatalogFixture } from './catalog'
import { createSalesFulfillmentHandlers } from './sales-fulfillment'

type SalesRow = SalesDetail & { workspaceId: string, maker: string }
interface Receipt {
  subject: string
  workspaceId: string
  operationId: string
  fingerprint: string
  result: { id: string, version: number | string }
  status: number
  location?: string
}

export function createSalesHandlers(catalog: CatalogFixture, storage?: Pick<Storage, 'getItem' | 'setItem'>) {
  const root = '*/bff/api/sales/workspaces/:workspaceId/orders'
  const storageKey = 'nexora:msw:sales'
  let db: { rows: SalesRow[], receipts: Receipt[], staleEdit: boolean } = { rows: [], receipts: [], staleEdit: false }
  try {
    const stored = storage?.getItem(storageKey)
    if (stored) db = JSON.parse(stored) as typeof db
  } catch { /* Start with an empty simulated service. */ }
  const persist = () => storage?.setItem(storageKey, JSON.stringify(db))
  const customerId = 'a6c68198-96dc-4d25-b6d3-70f73bde11a0'
  if (catalog.scenario().startsWith('d5') && !catalog.db.partners.some(value => value.id === customerId)) {
    catalog.db.partners.push({ workspaceId: mockWorkspaceId, id: customerId, code: 'MSW-CUSTOMER', name: 'MSW 销售测试客户',
      roles: ['customer'], isActive: true, version: 1, taxNumber: null, address: null, contacts: [] })
    catalog.persist()
  }
  const has = (name: string) => catalog.salesPermissions().includes('sales.order.' + name)
  const missing = () => problem(404, 'resource.not_found', '此工作区没有该销售单据。')
  const denied = () => problem(403, 'sales.forbidden', '当前模拟身份无此销售权限。')
  const conflict = (detail: string) => problem(409, 'sales.state_conflict', detail)
  const maker = (row: SalesRow) => row.maker === catalog.subject()
  const etag = (row: SalesRow) => `"sales-order-1-${row.order.id.replaceAll('-', '')}-${row.order.version}-${maker(row) ? 'm' : 'r'}"`
  const find = (workspaceId: string, id: string) => db.rows.find(row => row.workspaceId === workspaceId && row.order.id === id)
  const fulfillment = createSalesFulfillmentHandlers(catalog, {
    find, persist, tag: (workspaceId, id) => {
      const row = find(workspaceId, id)
      return row ? etag(row) : undefined
    }
  }, storage)

  function fill(row: SalesRow, draft: z.infer<typeof salesDraftSchema>) {
    const customer = catalog.db.partners.find(value => value.id === draft.customerId && value.workspaceId === row.workspaceId
      && value.isActive && value.roles.includes('customer'))
    if (!customer) throw new Error('请选择有效客户。')
    const lines = draft.lines.map((line) => {
      const item = catalog.find(row.workspaceId, line.itemId)
      const unit = catalog.db.definitions.find(value => value.id === item?.unitId && value.workspaceId === row.workspaceId && value.isActive)
      if (!item?.isActive || !item.tracksInventory || !unit) throw new Error('请选择有效库存商品。')
      return { ...line, id: crypto.randomUUID(), itemCode: item.code, itemName: item.name, itemVersion: item.version,
        unitCode: unit.code, unitVersion: unit.version, amount: roundDecimal(multiplyDecimals(line.quantity, line.unitPrice), 2) }
    })
    Object.assign(row, { customerId: customer.id, customerCode: customer.code, customerVersion: customer.version,
      note: draft.note, lines, total: sumDecimals(lines.map(line => line.amount)) })
    Object.assign(row.order, { customerName: customer.name, on: draft.on, total: row.total })
  }
  function receiptResponse(receipt: Receipt) {
    return HttpResponse.json(receipt.result, { status: receipt.status, headers: receipt.location ? { Location: receipt.location } : {} })
  }
  async function write(request: Request, workspaceId: string, kind: 'create' | 'edit' | 'decision' | 'convert', id = '') {
    if (!catalog.allowed(workspaceId)) return missing()
    if (request.headers.get('X-CSRF-TOKEN') !== 'msw-only-csrf') return problem(400, 'csrf.invalid', '写入校验失败。')
    const body = await request.json() as Record<string, unknown>
    const decision = salesDecisionSchema.safeParse(body.decision)
    const permission = kind === 'decision' ? decision.success && ['approve', 'return'].includes(decision.data) ? 'approve' : 'submit' : 'create'
    if (!has(permission)) return denied()
    const key = z.uuid().safeParse(body.operationId)
    if (!key.success || request.headers.get('idempotency-key') !== key.data) return problem(400, 'idempotency.invalid', '操作标识无效。')
    const path = new URL(request.url).pathname
    const fingerprint = JSON.stringify([path, request.method, request.headers.get('if-match'), body])
    const prior = db.receipts.find(value => value.workspaceId === workspaceId && value.subject === catalog.subject() && value.operationId === key.data)
    if (prior) return prior.fingerprint === fingerprint ? receiptResponse(prior) : conflict('幂等键已绑定其他提交。')

    const row = find(workspaceId, id)
    if (kind !== 'create') {
      if (!row) return missing()
      if (kind === 'edit' && catalog.scenario() === 'd5-stale-edit' && !db.staleEdit) {
        row.order.version = Number(row.order.version) + 1
        db.staleEdit = true
        persist()
      }
      if (request.headers.get('if-match') !== etag(row) || body.expectedVersion !== row.order.version) {
        return problem(412, 'sales.precondition_failed', '单据版本已变化。')
      }
    }
    try {
      let result: SalesRow
      if (kind === 'create') {
        const number = salesNumberSchema.parse(body.number)
        if (db.rows.some(value => value.workspaceId === workspaceId && value.order.number === number)) return conflict('单号已存在。')
        const draft = salesDraftSchema.parse(body.draft)
        result = { workspaceId, maker: catalog.subject(), customerId: '', customerCode: '', customerVersion: 1, note: '',
          minorUnits: 2, lines: [], total: '', isMaker: true, approvedVersion: null, approvedAtUtc: null,
          order: { id: crypto.randomUUID(), number, customerName: '', on: draft.on, currency: 'CNY', state: 'draft',
            version: 1, isQuote: body.isQuote === true, quoteId: null, departmentId: draft.departmentId } }
        fill(result, draft)
        db.rows.unshift(result)
      } else if (kind === 'convert' && row) {
        const number = salesNumberSchema.parse(body.orderNumber)
        if (!row.order.isQuote || row.order.state !== 'quoted' || !maker(row)) return conflict('报价不可转单。')
        if (db.rows.some(value => value.workspaceId === workspaceId && value.order.number === number)) return conflict('单号已存在。')
        result = { ...row, order: { ...row.order, id: crypto.randomUUID(), number, state: 'draft', version: 1, isQuote: false, quoteId: row.order.id },
          lines: row.lines.map(line => ({ ...line, id: crypto.randomUUID() })) }
        row.order.state = 'converted'
        row.order.version = Number(row.order.version) + 1
        row.convertedOrder = { id: result.order.id, number }
        db.rows.unshift(result)
      } else if (row) {
        result = row
        if (kind === 'edit') {
          if (!maker(row) || row.order.state !== 'draft') return conflict('仅制单人可修改草稿。')
          const draft = salesDraftSchema.parse(body.draft)
          if (draft.departmentId !== row.order.departmentId) return conflict('部门不可修改。')
          fill(row, draft)
        } else {
          const action = salesDecisionSchema.parse(body.decision)
          const { state, isQuote, version } = row.order
          if (action === 'issue-quote' && state === 'draft' && isQuote && maker(row)) row.order.state = 'quoted'
          else if (action === 'submit' && state === 'draft' && !isQuote && maker(row)) row.order.state = 'submitted'
          else if (action === 'withdraw' && state === 'submitted' && maker(row)) row.order.state = 'draft'
          else if (action === 'approve' && state === 'submitted' && !maker(row)) {
            row.order.state = 'approved'
            row.approvedVersion = version
            row.approvedAtUtc = new Date().toISOString()
          } else if (action === 'return' && state === 'submitted' && !maker(row) && typeof body.reason === 'string' && body.reason.trim()) row.order.state = 'draft'
          else if (action === 'cancel' && state === 'draft' && maker(row) && typeof body.reason === 'string' && body.reason.trim()) row.order.state = 'cancelled'
          else return conflict('当前状态或身份不能执行该操作。')
        }
        row.order.version = Number(row.order.version) + 1
      } else return missing()
      const created = kind === 'create' || kind === 'convert'
      const receipt = { workspaceId, subject: catalog.subject(), operationId: key.data, fingerprint, status: created ? 201 : 200,
        result: { id: result.order.id, version: result.order.version },
        location: created ? `/api/sales/workspaces/${workspaceId}/orders/${result.order.id}` : undefined }
      db.receipts.push(receipt)
      persist()
      if (kind === 'convert' && catalog.scenario() === 'd5-unknown-convert') return HttpResponse.error()
      return receiptResponse(receipt)
    } catch (error) {
      return problem(400, 'sales.validation', error instanceof Error ? error.message : '销售单据无效。')
    }
  }
  const handlers = [
    ...fulfillment.handlers,
    http.get(root, ({ params, request }) => {
      if (!catalog.allowed(params.workspaceId)) return missing()
      if (!has('read')) return denied()
      const input = new URL(request.url).searchParams
      const isQuote = input.get('isQuote')
      const page = Math.max(1, Number(input.get('page')) || 1)
      const size = Math.min(100, Math.max(1, Number(input.get('pageSize')) || 20))
      const rows = db.rows.filter(row => row.workspaceId === params.workspaceId && (isQuote === null || String(row.order.isQuote) === isQuote))
      return HttpResponse.json({ canCreate: has('create'), canApprove: has('approve'), hasMore: rows.length > page * size,
        orders: rows.slice((page - 1) * size, page * size).map(row => row.order) })
    }),
    http.get(root + '/:id', ({ params }) => {
      if (!catalog.allowed(params.workspaceId)) return missing()
      if (!has('read')) return denied()
      const row = find(String(params.workspaceId), String(params.id))
      if (!row) return missing()
      const { maker: creator, workspaceId: _workspaceId, ...value } = row
      return HttpResponse.json({ ...value, isMaker: creator === catalog.subject() }, { headers: { ETag: etag(row) } })
    }),
    http.post(root, ({ params, request }) => write(request, String(params.workspaceId), 'create')),
    http.put(root + '/:id', ({ params, request }) => write(request, String(params.workspaceId), 'edit', String(params.id))),
    http.post(root + '/:id/decision', ({ params, request }) => write(request, String(params.workspaceId), 'decision', String(params.id))),
    http.post(root + '/:id/convert', ({ params, request }) => write(request, String(params.workspaceId), 'convert', String(params.id)))
  ]
  return { handlers, fulfillment }
}

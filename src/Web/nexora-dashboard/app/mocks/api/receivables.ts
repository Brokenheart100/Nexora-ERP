import { http, HttpResponse } from 'msw/http'
import { z } from 'zod'
import type { CustomerDocument, ShipmentAllowance } from '../../../shared/types/receivables'
import { compareDecimal, multiplyDecimals, roundDecimal, subtractDecimal, sumDecimals } from '../../../shared/utils/decimal'
import { mockWorkspaceId, problem, type CatalogFixture } from './catalog'

const bankId = 'ebd5656f-83cc-44dc-b037-d511ca0d5d1f'
const bankAccount = '2b8c76e5-148d-45bb-9ffe-a0d3a6db44d3'
const setup = { receivableAccountId: crypto.randomUUID(), advanceAccountId: crypto.randomUUID(),
  revenueAccountId: crypto.randomUUID(), outputTaxAccountId: crypto.randomUUID(), costOfGoodsAccountId: crypto.randomUUID() }
const kindMap = { invoice: 1, receipt: 2, allocation: 3 } as const
type Doc = CustomerDocument & { maker: string }
type Change = { id: string, version: number | string }
type Saved = { key: string, fingerprint: string, change: Change, status: number, location?: string }
const inputSchema = z.object({ kind: z.enum(['invoice', 'receipt', 'allocation']), number: z.string(), on: z.iso.date(),
  dueOn: z.iso.date().nullish(), customerId: z.uuid().optional(), bankId: z.uuid().optional(),
  invoiceId: z.uuid().optional(), fundsId: z.uuid().optional(), amount: z.string().regex(/^\d+(\.\d+)?$/).optional(),
  lines: z.array(z.object({ shipmentId: z.uuid(), quantity: z.string().regex(/^\d+(\.\d+)?$/) })).optional() })

export function createReceivablesHandlers(catalog: CatalogFixture, salesFacts: ShipmentAllowance[], storage?: Pick<Storage, 'getItem' | 'setItem'>) {
  const key = 'nexora:msw:sales-finance'
  let state: { docs: Doc[], receipts: Saved[], nextNumber: number } = { docs: [], receipts: [], nextNumber: 1 }
  try {
    const value = storage?.getItem(key)
    if (value) state = JSON.parse(value) as typeof state
  } catch { /* Start with an empty local fixture. */ }
  const persist = () => storage?.setItem(key, JSON.stringify(state))
  const root = '*/bff/api/finance/workspaces/:workspaceId'
  const path = root + '/receivables'
  const active = () => catalog.scenario().startsWith('d5')
  const allowed = (workspace: unknown) => workspace === mockWorkspaceId
  const reviewer = () => catalog.scenario() === 'd5-reviewer'
  const maker = () => !reviewer() && !['d5-receiver', 'd5-read-only'].includes(catalog.scenario())
  const view = (row: Doc) => ({ ...row, isMaker: row.maker === catalog.subject() })
  const missing = () => problem(404, 'resource.not_found', '当前工作区没有此资源。')
  const conflict = (detail: string, code = 'finance.state_conflict') => problem(409, code, detail)
  const posted = (row?: Doc) => row?.state === 'posted'
  const byId = (id: unknown) => state.docs.find(row => row.id === id)
  const next = (on: string) => `D5-${on.slice(0, 4)}-${String(state.nextNumber).padStart(4, '0')}`
  const receiptRows = () => state.docs.filter(row => row.terms.kind === 2 && posted(row))
  const bank = () => ({ id: bankId, code: 'MSW-D5-BANK', name: '销售联调资金账户', kind: 'bank',
    accountId: bankAccount, isDefault: true, balance: sumDecimals(receiptRows().map(row => row.terms.total)), version: 1 + receiptRows().length })
  function available(id: string, except?: string) {
    const fact = salesFacts.find(row => row.id === id)
    const used = state.docs.filter(row => row.id !== except && row.terms.kind === 1 && row.state !== 'cancelled')
      .flatMap(row => row.terms.lines?.filter(line => line.shipmentId === id).map(line => line.quantity) ?? [])
    return subtractDecimal(fact?.quantity ?? '0', sumDecimals(used))
  }
  function respond(saved: Saved) {
    return HttpResponse.json(saved.change, { status: saved.status, headers: saved.location ? { Location: saved.location } : {} })
  }
  async function write(request: Request, workspace: unknown, apply: (body: Record<string, unknown>) => Change | Response, status = 200) {
    if (!active()) return undefined
    if (!allowed(workspace)) return missing()
    if (request.headers.get('x-csrf-token') !== 'msw-only-csrf') return problem(400, 'csrf.invalid', '写入校验失败。')
    const body = await request.json() as Record<string, unknown>
    const id = z.uuid().safeParse(body.operationId)
    if (!id.success || request.headers.get('idempotency-key') !== id.data) return problem(400, 'idempotency.invalid', '操作标识无效。')
    const operation = JSON.stringify([workspace, catalog.subject(), id.data])
    const fingerprint = JSON.stringify([request.method, new URL(request.url).pathname, body])
    const prior = state.receipts.find(row => row.key === operation)
    if (prior) return prior.fingerprint === fingerprint ? respond(prior) : conflict('操作标识已绑定其他请求。')
    const change = apply(body)
    if (change instanceof Response) return change
    const saved = { key: operation, fingerprint, change, status,
      location: status === 201 ? new URL(request.url).pathname + '/' + change.id : undefined }
    state.receipts.push(saved)
    persist()
    return respond(saved)
  }
  function prepare(input: unknown, original?: Doc) {
    const parsed = inputSchema.safeParse(input)
    if (!parsed.success) return problem(400, 'finance.invalid_request', '单据输入无效。')
    const draft = parsed.data
    if (draft.kind !== 'invoice' && !draft.number.trim()) return problem(400, 'finance.invalid_request', '需要单号。')
    const number = original?.terms.number ?? draft.number.trim().toUpperCase()
    if (number && state.docs.some(row => row.id !== original?.id && row.terms.number === number)) return conflict('单号已存在。')
    const kind = kindMap[draft.kind]
    const terms: CustomerDocument['terms'] = { kind, number, on: draft.on, currency: 'CNY', customerId: '', customerName: '', total: '0' }
    if (draft.kind === 'invoice') {
      if (!draft.lines?.length || new Set(draft.lines.map(row => row.shipmentId)).size !== draft.lines.length) return conflict('请选择发货行。')
      const lines: NonNullable<CustomerDocument['terms']['lines']> = []
      for (const row of draft.lines) {
        const fact = salesFacts.find(value => value.id === row.shipmentId && value.posted)
        if (!fact || draft.on < fact.on || compareDecimal(row.quantity, '0') <= 0
          || compareDecimal(row.quantity, available(row.shipmentId, original?.id)) > 0
          || (terms.customerId && terms.customerId !== fact.customerId)) return conflict('发货来源、日期或可开票数量无效。')
        terms.customerId = fact.customerId
        terms.customerName = fact.customerName
        const net = roundDecimal(multiplyDecimals(row.quantity, fact.unitPrice), 2)
        lines.push({ ...row, itemId: fact.itemId, name: fact.itemName, unitPrice: fact.unitPrice, net,
          tax: roundDecimal(multiplyDecimals(net, '0.13'), 2) })
      }
      terms.lines = lines
      terms.total = sumDecimals(lines.flatMap(row => [row.net, row.tax]))
      terms.dueOn = draft.dueOn ?? draft.on
    } else {
      if (!draft.amount || compareDecimal(draft.amount, '0') <= 0) return conflict('金额须大于零。')
      terms.total = draft.amount
      if (draft.kind === 'receipt') {
        const customer = catalog.db.partners.find(row => row.id === draft.customerId && row.workspaceId === mockWorkspaceId && row.roles.includes('customer'))
        if (!customer || draft.bankId !== bankId) return conflict('客户或账户无效。')
        Object.assign(terms, { customerId: customer.id, customerName: customer.name, bankId })
      } else {
        const funds = byId(draft.fundsId)
        const invoice = byId(draft.invoiceId)
        if (!funds || !invoice || !posted(funds) || !posted(invoice) || funds.terms.kind !== 2 || invoice.terms.kind !== 1
          || funds.terms.customerId !== invoice.terms.customerId
          || [funds, invoice].some(row => compareDecimal(terms.total, row.openBalance) > 0 || draft.on < row.terms.on)) return conflict('客户不匹配或余额不足。')
        Object.assign(terms, { customerId: invoice.terms.customerId, customerName: invoice.terms.customerName, fundsId: funds.id, invoiceId: invoice.id })
      }
    }
    return terms
  }
  const read = (workspace: unknown, action: () => object) => active() ? allowed(workspace) ? HttpResponse.json(action()) : missing() : undefined
  function page<T>(rows: T[], url: string) {
    const value = Math.max(1, Number(new URL(url).searchParams.get('page')) || 1)
    return rows.slice((value - 1) * 50, value * 50)
  }
  return [
    http.get(path, ({ params }) => read(params.workspaceId, () => ({ accounts: setup, canConfigure: false, canDraft: maker(), canPost: reviewer(), currency: 'CNY', fiscalNumbering: true }))),
    http.get(path + '/shipments', ({ params, request }) => read(params.workspaceId, () => page(salesFacts.map((row) => {
      const delayed = catalog.scenario() === 'd5-delayed'
      return { ...row, posted: !delayed, pendingReason: delayed ? '等待发货成本回执' : null, available: delayed ? '0' : available(row.id) }
    }), request.url))),
    http.get(path + '/invoices', ({ params, request }) => read(params.workspaceId, () => page(state.docs.filter(row => row.terms.kind === 1 && posted(row)), request.url).map(view))),
    http.get(path + '/documents', ({ params, request }) => read(params.workspaceId, () => page(state.docs, request.url).map(view))),
    http.get(path + '/documents/:id', ({ params }) => {
      if (!active()) return undefined
      const row = allowed(params.workspaceId) && byId(params.id)
      return row ? HttpResponse.json(view(row)) : missing()
    }),
    http.get(path + '/invoice-numbering/preview', ({ params, request }) => read(params.workspaceId, () => {
      const on = new URL(request.url).searchParams.get('on') ?? ''
      return { number: next(on), fiscalYear: Number(on.slice(0, 4)), sequence: state.nextNumber }
    })),
    http.post(path + '/documents', ({ params, request }) => write(request, params.workspaceId, (body) => {
      if (!maker()) return problem(403, 'finance.forbidden', '当前身份无制单权限。')
      const terms = prepare(body.draft)
      if (terms instanceof Response) return terms
      const row: Doc = { id: crypto.randomUUID(), terms, maker: catalog.subject(), isMaker: true,
        state: 'submitted', journalId: null, version: 1, openBalance: '0', awaitsFiscalNumber: terms.kind === 1 && !terms.number }
      state.docs.unshift(row)
      return { id: row.id, version: row.version }
    }, 201)),
    http.put(path + '/documents/:id', ({ params, request }) => write(request, params.workspaceId, (body) => {
      const row = byId(params.id)
      if (!row) return missing()
      if (!maker() || row.maker !== catalog.subject() || row.version !== body.expectedVersion || row.state !== 'submitted' || row.terms.kind !== 1)
        return conflict('无法修改当前版本。')
      const terms = prepare({ ...(body.draft as object), kind: 'invoice' }, row)
      if (terms instanceof Response) return terms
      row.terms = terms
      return { id: row.id, version: row.version = Number(row.version) + 1 }
    })),
    http.post(path + '/documents/:id/decision', ({ params, request }) => write(request, params.workspaceId, (body) => {
      const row = byId(params.id)
      if (!row) return missing()
      if (row.version !== body.expectedVersion || row.state !== 'submitted') return conflict('单据版本或状态已变化。')
      if (body.approve === true) {
        if (!reviewer() || row.maker === catalog.subject()) return problem(403, 'finance.forbidden', '需要独立复核。')
        if (row.terms.on.startsWith('2027')) return conflict('会计期间未开放。', 'finance.period_not_open')
        if (row.awaitsFiscalNumber) {
          if (body.expectedNumber !== next(row.terms.on)) return conflict('发票编号已变化。', 'finance.invoice_number_changed')
          row.terms.number = next(row.terms.on)
          row.awaitsFiscalNumber = false
          state.nextNumber++
        }
        if (row.terms.kind === 3) {
          const funds = byId(row.terms.fundsId)
          const invoice = byId(row.terms.invoiceId)
          if (!funds || !invoice || [funds, invoice].some(value => compareDecimal(row.terms.total, value.openBalance) > 0)) return conflict('可核销余额不足。')
          funds.openBalance = subtractDecimal(funds.openBalance, row.terms.total)
          invoice.openBalance = subtractDecimal(invoice.openBalance, row.terms.total)
        } else row.openBalance = row.terms.total
        row.state = 'posted'
        row.journalId = crypto.randomUUID()
      } else {
        if (!maker() || row.maker !== catalog.subject()) return problem(403, 'finance.forbidden', '只能取消本人申请。')
        row.state = 'cancelled'
        row.awaitsFiscalNumber = false
      }
      return { id: row.id, version: row.version = Number(row.version) + 1 }
    })),
    http.get(root + '/trade', ({ params }) => read(params.workspaceId, () => ({ currency: 'CNY', minorUnits: 2, canConfigure: false,
      canSubmit: maker(), canApprove: reviewer(), setup: null, banks: [bank()] }))),
    http.get(root + '/trade/banks/:id/movements', ({ params }) => read(params.workspaceId, () => receiptRows().map(row => ({
      id: row.id, bankId, documentId: row.id, journalId: row.journalId, on: row.terms.on, amount: row.terms.total, matched: '0', voided: false, reversesId: null
    })))),
    http.get(root + '/ledger/journals/:id', ({ params }) => {
      if (!active()) return undefined
      const row = allowed(params.workspaceId) && state.docs.find(value => value.journalId === params.id)
      if (!row) return missing()
      return HttpResponse.json({ journal: { id: row.journalId, kind: 'automatic', sourceNumber: row.terms.number, on: row.terms.on,
        memo: '', state: 'posted', version: 1, postingNumber: 1 }, lines: [
        { accountId: bankAccount, code: 'MSW-CONTROL', name: '业务控制科目', debit: row.terms.total, credit: '0' },
        { accountId: setup.advanceAccountId, code: 'MSW-COUNTER', name: '业务对方科目', debit: '0', credit: row.terms.total }
      ] })
    }),
    http.get(root + '/reporting/aging/receivables', ({ params, request }) => read(params.workspaceId, () => {
      const through = new URL(request.url).searchParams.get('through')
      const invoices = state.docs.filter(row => row.terms.kind === 1 && posted(row) && compareDecimal(row.openBalance, '0') > 0)
      const total = sumDecimals(invoices.map(row => row.openBalance))
      return { kind: 'receivables', currency: 'CNY', minorUnits: 2, through, watermark: 1, total,
        buckets: [{ key: 'current', count: invoices.length, amount: total }], items: invoices.map(row => ({
          id: row.id, partnerId: row.terms.customerId, partnerName: row.terms.customerName, number: row.terms.number,
          on: row.terms.on, dueOn: row.terms.dueOn ?? row.terms.on, journalId: row.journalId,
          original: row.terms.total, outstanding: row.openBalance, bucket: 'current'
        })) }
    })),
    http.get(root + '/reporting/aging/payables', ({ params, request }) => read(params.workspaceId, () => ({
      kind: 'payables', currency: 'CNY', minorUnits: 2, through: new URL(request.url).searchParams.get('through'),
      watermark: 1, total: '0', buckets: [], items: []
    })))
  ]
}

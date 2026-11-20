import { http, HttpResponse } from 'msw/http'
import type { AccrualReceipt, TradeDocument } from '#shared/types/trade'
import { tradeTermsSchema } from '#shared/types/trade'
import { multiplyDecimals, roundDecimal, sumDecimals } from '#shared/utils/decimal'
import { mockSupplierId } from './purchasing'

// Controlled UI examples. Transactional acceptance runs against the owning services.
export function createFinanceHandlers(context: { workspaceId: string, itemId: string, scenario: () => string }) {
  const root = `*/bff/api/finance/workspaces/${context.workspaceId}`
  const id = (value: number) => `66666666-6666-4666-8666-${String(value).padStart(12, '0')}`
  const bank = { id: id(1), code: 'MSW-BANK', name: '演示银行', kind: 'bank', accountId: id(2), isDefault: true, balance: '1400', version: 1 }
  const group = { code: 'MSW-VAT13', name: '演示 13% 税组', version: 1, rateCodes: ['VAT13'] }
  const receipts: AccrualReceipt[] = ['40', '60'].map((quantity, index) => ({ fact: { id: id(30 + index), tenantId: id(40), workspaceId: context.workspaceId, warehouseId: id(41), itemId: context.itemId, orderId: id(42), lineId: id(43), permitId: id(44 + index), supplierId: mockSupplierId,
    sequence: index + 1, on: '2026-01-03', quantity, cost: multiplyDecimals(quantity, '10'), currency: 'CNY', reversesId: null, adjustmentForBillId: null }, posted: true, pendingReason: null, journalId: id(50 + index), matchedQuantity: quantity, matchedCost: multiplyDecimals(quantity, '10') }))
  const defaults = { otherBankId: null, counterAccountId: null, sourceId: null, partnerId: mockSupplierId, quantity: '100', taxAssessmentId: null, statementLineId: null, method: null, dueOn: '2026-01-31' }
  const bill: TradeDocument = { id: id(10), terms: { ...defaults, kind: 1, on: '2026-01-04', number: 'MSW-BILL-1130', memo: 'P0 采购应付样例', amount: '1000', bankId: null },
    state: 'posted', version: 2, journalId: id(20), reversedById: null, total: '1130', outstanding: '530', recoverable: '0', isMaker: true,
    billMatches: receipts.map((receipt, index) => ({ id: id(60 + index), receiptId: receipt.fact.id, quantity: receipt.fact.quantity, net: receipt.fact.cost, tax: index === 0 ? '52' : '78', variance: '0', creditedQuantity: '0', creditedNet: '0', creditedTax: '0' })) }
  const payment: TradeDocument = { id: id(11), terms: { ...defaults, kind: 2, on: '2026-01-05', number: 'MSW-PAY-600', memo: 'P0 部分付款样例', amount: '600', bankId: bank.id, sourceId: bill.id, quantity: '0' }, state: 'posted', version: 2, journalId: id(21), reversedById: null, total: '600', outstanding: '0', recoverable: '0', isMaker: true, billMatches: null }
  const documents = new Map<string, TradeDocument>([[bill.id, bill], [payment.id, payment]])
  receipts.push({ ...receipts[0]!, fact: { ...receipts[0]!.fact, id: id(32), orderId: id(46), permitId: id(47), sequence: 3, quantity: '5', cost: '50' }, journalId: id(52), matchedQuantity: '0', matchedCost: '0' })
  const operations = new Map<string, object>()
  const problem = (status: number, detail: string) => HttpResponse.json({ status, code: 'mock.finance', detail, traceId: 'msw-demo' }, { status })
  const page = (request: Request) => Number(new URL(request.url).searchParams.get('page') ?? '1')
  const empty = (request: Request) => context.scenario() === 'empty' || page(request) > 1
  return [
    http.get(root + '/trade', () => HttpResponse.json({ currency: 'CNY', minorUnits: 2, canConfigure: false, canSubmit: true, canApprove: false, setup: null, banks: [bank] })),
    http.get(root + '/tax', () => HttpResponse.json({ canManage: false, groups: [group], rates: [], classifications: [] })),
    http.get(root + '/trade/receipts', ({ request }) => context.scenario() === 'unavailable' ? problem(503, '模拟：财务事实暂不可用。') : HttpResponse.json(empty(request) ? [] : receipts)),
    http.get(root + '/trade/documents', ({ request }) => HttpResponse.json(empty(request) ? [] : [...documents.values()])),
    http.get(root + '/trade/bills', ({ request }) => HttpResponse.json(empty(request) ? [] : [bill])),
    http.get(root + '/trade/documents/:id', ({ params }) => documents.has(String(params.id)) ? HttpResponse.json(documents.get(String(params.id))) : problem(404, '模拟账务单据不存在。')),
    http.post(root + '/trade/documents', async ({ request }) => {
      const body = await request.json() as { operationId: string, terms: unknown }
      if (operations.has(body.operationId)) return HttpResponse.json(operations.get(body.operationId), { status: 201 })
      const terms = tradeTermsSchema.safeParse(body.terms)
      if (!terms.success) return problem(400, '模拟账务输入无效。')
      const documentId = crypto.randomUUID()
      documents.set(documentId, { ...bill, id: documentId, terms: terms.data, state: 'submitted', version: 1, total: '0', outstanding: '0', journalId: null, billMatches: null })
      const result = { id: documentId, version: 1 }
      operations.set(body.operationId, result)
      return HttpResponse.json(result, { status: 201, headers: { Location: `/bff/api/finance/workspaces/${context.workspaceId}/trade/documents/${documentId}` } })
    }),
    http.post(root + '/trade/documents/:id/decision', async ({ params, request }) => {
      const body = await request.json() as { operationId: string, decision: string, expectedVersion: number }
      if (operations.has(body.operationId)) return HttpResponse.json(operations.get(body.operationId))
      const document = documents.get(String(params.id))
      if (!document) return problem(404, '模拟单据不存在。')
      if (body.decision !== 'cancel') return problem(403, '模拟制单人需等待独立复核。')
      if (document.state !== 'submitted' || String(document.version) !== String(body.expectedVersion)) return problem(409, '模拟单据版本或状态已变化。')
      document.state = 'cancelled'
      document.version = Number(document.version) + 1
      const result = { id: document.id, version: document.version }
      operations.set(body.operationId, result)
      return HttpResponse.json(result)
    }),
    http.post(root + '/tax/assessments', async ({ request }) => {
      const input = await request.json() as { operationId: string, on: string, groupCode: string, unitPrice: string, quantity: string, partnerId: string, itemId: string }
      if (operations.has(input.operationId)) return HttpResponse.json(operations.get(input.operationId))
      if (input.groupCode !== group.code) return problem(400, '请选择已配置的演示税组。')
      const net = roundDecimal(multiplyDecimals(input.unitPrice, input.quantity), 2)
      const tax = roundDecimal(multiplyDecimals(net, '0.13'), 2)
      const snapshot = { id: crypto.randomUUID(), on: input.on, currency: 'CNY', minorUnits: 2, policy: 'msw-demo', group, unitPrice: input.unitPrice, quantity: input.quantity, discount: '0', includesTax: false,
        references: [{ kind: 'partner', resourceId: input.partnerId, version: 1, classificationVersion: null }, { kind: 'item', resourceId: input.itemId, version: 1, classificationVersion: null }], amounts: { net, tax, total: sumDecimals([net, tax]), components: [] } }
      operations.set(input.operationId, snapshot)
      return HttpResponse.json(snapshot)
    }),
    http.get(root + '/trade/banks/:bankId/movements', ({ request }) => HttpResponse.json(empty(request) ? [] : [{ id: id(70), bankId: bank.id, documentId: payment.id, journalId: payment.journalId, on: payment.terms.on, amount: '-600', matched: '0', voided: false, reversesId: null }])),
    http.get(root + '/reporting/aging/payables', () => HttpResponse.json({ kind: 'payables', currency: 'CNY', minorUnits: 2, through: '2026-01-31', watermark: 4, total: '530', buckets: [{ key: 'current', count: 1, amount: '530' }], items: [{ id: bill.id, partnerId: mockSupplierId, partnerName: 'MSW 演示供应商', number: bill.terms.number, on: bill.terms.on, dueOn: '2026-01-31', journalId: bill.journalId, original: '1130', outstanding: '530', bucket: 'current' }] })),
    http.get(root + '/reporting/partner-ledgers/payables/:supplierId', () => HttpResponse.json({ kind: 'payables', partnerId: mockSupplierId, currency: 'CNY', minorUnits: 2, from: '2026-01-01', through: '2026-01-31', watermark: 4,
      open: { opening: '0', increases: '1130', decreases: '600', closing: '530' }, funds: { opening: '0', increases: '600', decreases: '0', closing: '600' }, hasMore: false, items: [] })),
    http.get(root + '/ledger/journals/:journalId', ({ params }) => HttpResponse.json({ journal: { id: params.journalId, kind: 'trade', sourceNumber: 'MSW-P0', on: '2026-01-05', memo: '模拟凭证', state: 'posted', version: 2, postingNumber: 4 },
      lines: [{ accountId: id(80), code: 'MSW-AP', name: '演示应付', debit: '600', credit: '0' }, { accountId: bank.accountId, code: 'MSW-BANK', name: '演示银行', debit: '0', credit: '600' }] }))
  ]
}

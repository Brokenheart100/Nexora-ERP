import { http } from 'msw/http'
import { z } from 'zod'
import { mockWorkspaceId, tenantId, type CatalogFixture } from './catalog'
import { createBusinessFixture } from './business-fixture'
import { compareDecimal, multiplyDecimals, subtractDecimal, sumDecimals } from '../../../shared/utils/decimal'
import { quantityInput } from '../../../shared/types/purchasing'
import type { AccrualReceipt, TradeDocument } from '../../../shared/types/trade'
import type { CustomerDocument, ShipmentAllowance } from '../../../shared/types/receivables'

type SourceMovement = Pick<AccrualReceipt['fact'], 'id' | 'itemId' | 'on' | 'quantity' | 'cost' | 'permitId' | 'sequence' | 'reversesId'> & { warehouse: string }
type Source = { purchasePermit: string, salePermit: string, orderId: string, movements: () => SourceMovement[] }
const bankId = 'db5aa4e4-42e2-4d3c-b15f-39812005b15a'
const bankControl = '4ae73fff-052a-4bc6-829f-1624f9388ce9'
const partner = 'eb4410d7-5603-424b-8245-1c33df0ca946'
const oldBill = 'eb6edd08-0a69-4491-8f16-02efad62e369'
const oldInvoice = 'b488512e-566e-438c-b3d3-7deb402cfa3b'
const numberAndDate = z.object({ number: z.string().min(1), on: z.iso.date() })
const customerDraft = numberAndDate.extend({ kind: z.enum(['credit', 'refund']), returnId: z.uuid().optional(),
  invoiceId: z.uuid().optional(), returnQuantity: quantityInput.optional(), fundsId: z.uuid().optional(), amount: quantityInput.optional(), bankId: z.uuid().optional() })
const supplierDraft = numberAndDate.extend({ kind: z.union([z.literal(9), z.literal(10)]), memo: z.string(), amount: z.string(), quantity: z.string(),
  sourceId: z.uuid(), returnReceiptId: z.uuid().nullish(), bankId: z.uuid().nullish() })

export function createReturnFinanceHandlers(catalog: CatalogFixture, source: Source, storage?: Pick<Storage, 'getItem' | 'setItem'>) {
  const fixture = createBusinessFixture(catalog, 'd6', {
    billed: catalog.scenario().includes('billed'), accrued: {} as Record<string, string>,
    ap: [] as (TradeDocument & { maker: string })[], ar: [] as (CustomerDocument & { maker: string })[]
  }, storage, 'd6-finance')
  const { state } = fixture
  const root = '*/bff/api/finance/workspaces/:workspaceId'
  const reviewer = () => catalog.scenario().startsWith('d6-reviewer')
  const maker = () => catalog.scenario().startsWith('d6-owner')
  const actor = () => catalog.subject()
  const view = <T extends { maker: string }>(row: T) => ({ ...row, isMaker: row.maker === actor() })
  const positive = (value: string) => value.startsWith('-') ? value.slice(1) : value
  const purchase = () => source.movements().filter(row => row.permitId === source.purchasePermit)
  const sales = () => source.movements().filter(row => row.permitId === source.salePermit)
  const currentBill = (): TradeDocument[] => state.billed
    ? purchase().filter(row => !row.reversesId).map(row => ({
        id: oldBill, terms: { kind: 1, on: row.on, number: 'D6-MSW-BILL', memo: '样例采购账单', amount: row.cost, quantity: row.quantity },
        state: 'posted', version: 2, isMaker: maker(), total: row.cost, outstanding: '0', recoverable: '0',
        billMatches: [{ id: row.id, receiptId: row.id, quantity: row.quantity, net: row.cost, tax: '0', variance: '0', creditedQuantity: '0', creditedNet: '0', creditedTax: '0' }]
      }))
    : []
  const currentInvoice = (): CustomerDocument[] => sales().filter(row => !row.reversesId).map(row => ({
    id: oldInvoice, terms: { kind: 1, on: row.on, number: 'D6-MSW-INVOICE', total: multiplyDecimals(positive(row.quantity), '10'),
      customerId: partner, customerName: 'MSW 退货客户', currency: 'CNY',
      lines: [{ shipmentId: row.id, itemId: row.itemId, name: 'MSW 演示商品', quantity: positive(row.quantity), unitPrice: '10', net: multiplyDecimals(positive(row.quantity), '10'), tax: '0' }] },
    state: 'posted', version: 2, isMaker: maker(), awaitsFiscalNumber: false, openBalance: '0'
  }))
  const accruals = (): AccrualReceipt[] => purchase().map((row) => {
    const posted = !row.reversesId || !!state.accrued[row.id]
    return { fact: { ...row, warehouseId: row.warehouse, tenantId, workspaceId: mockWorkspaceId, currency: 'CNY', supplierId: partner,
      orderId: source.orderId, lineId: source.orderId }, posted, matchedQuantity: state.billed && !row.reversesId ? row.quantity : '0', matchedCost: '0',
    journalId: state.accrued[row.id], pendingReason: posted ? null : state.billed ? '退货需关联原账单贷项。' : '等待退货成本入账。' }
  })
  const shipments = (): ShipmentAllowance[] => sales().map(row => ({ id: row.id, orderId: source.orderId, itemId: row.itemId, customerId: partner,
    customerName: 'MSW 退货客户', itemName: 'MSW 演示商品', on: row.on, quantity: positive(row.quantity), unitPrice: '10',
    available: '0', returnOf: row.reversesId, creditable: row.reversesId
      ? subtractDecimal(row.quantity,
          sumDecimals(state.ar.filter(doc => doc.state === 'posted' && doc.terms.returnId === row.id).flatMap(doc => doc.terms.lines?.map(line => line.quantity) ?? [])))
      : '0', posted: true }))
  const bank = { id: bankId, accountId: bankControl, code: 'D6-MSW-BANK', name: 'MSW 退货资金账户', isDefault: true, kind: 'bank', balance: '1000', version: 1 }
  const change = (row: { id: string, version: number | string }) => ({ id: row.id, version: row.version })
  return [
    http.get(root + '/trade', ({ params }) => fixture.read(params.workspaceId, () => ({ currency: 'CNY', minorUnits: 2,
      canConfigure: false, canSubmit: maker(), canApprove: reviewer(), setup: null, banks: [bank] }))),
    http.get(root + '/trade/bills', ({ params }) => fixture.read(params.workspaceId, currentBill)),
    http.get(root + '/trade/receipts', ({ params }) => fixture.read(params.workspaceId, accruals)),
    http.get(root + '/trade/documents', ({ params }) => fixture.read(params.workspaceId, () => state.ap.map(view))),
    http.post(root + '/trade/receipts/:id/accrue', ({ params, request }) => fixture.write(params.workspaceId, request, () => {
      if (!reviewer()) return fixture.forbidden()
      const row = purchase().find(row => row.id === params.id && row.reversesId)
      if (!row) return fixture.missing()
      if (state.billed) return fixture.conflict('已开票的采购退货需要贷项。')
      state.accrued[row.id] ??= crypto.randomUUID()
      return { id: row.id, version: 2 }
    })),
    http.post(root + '/trade/documents', ({ params, request }) => fixture.write(params.workspaceId, request, (body) => {
      if (!maker()) return fixture.forbidden()
      const draft = supplierDraft.safeParse(body.terms)
      if (!draft.success) return fixture.conflict('无效退货单据。')
      const terms = draft.data
      const original = purchase().find(row => row.id === terms.returnReceiptId && row.reversesId)
      const credit = state.ap.find(row => row.id === terms.sourceId && row.state === 'posted' && row.terms.kind === 9)
      if (terms.kind === 9
        ? !state.billed || !original || terms.sourceId !== oldBill || state.accrued[original.id]
        : !credit || terms.bankId !== bankId || !quantityInput.safeParse(terms.amount).success || compareDecimal(terms.amount, credit.recoverable) > 0)
        return fixture.conflict('退货、账单或退款金额不匹配。')
      const row: (typeof state.ap)[number] = { id: crypto.randomUUID(), version: 1, state: 'submitted', isMaker: true, maker: actor(),
        terms, billMatches: null, total: original ? positive(original.cost) : terms.amount, recoverable: '0', outstanding: '0' }
      state.ap.unshift(row)
      return change(row)
    }, 201)),
    http.get(root + '/receivables', ({ params }) => fixture.read(params.workspaceId, () => ({ accounts: null, canConfigure: false,
      canDraft: maker(), canPost: reviewer(), currency: 'CNY', fiscalNumbering: false }))),
    http.get(root + '/receivables/shipments', ({ params }) => fixture.read(params.workspaceId, shipments)),
    http.get(root + '/receivables/invoices', ({ params }) => fixture.read(params.workspaceId, currentInvoice)),
    http.get(root + '/receivables/documents', ({ params }) => fixture.read(params.workspaceId, () => state.ar.map(view))),
    http.post(root + '/receivables/documents', ({ params, request }) => fixture.write(params.workspaceId, request, (body) => {
      if (!maker()) return fixture.forbidden()
      const draft = customerDraft.safeParse(body.draft)
      if (!draft.success) return fixture.conflict('无效退货单据。')
      const { kind, number, on, invoiceId, returnId, returnQuantity, fundsId, amount, bankId: bankRef } = draft.data
      const fact = shipments().find(row => row.id === returnId && row.returnOf)
      const funds = state.ar.find(doc => doc.id === fundsId && doc.state === 'posted' && doc.terms.kind === 4)
      if (kind === 'credit'
        ? !fact || invoiceId !== oldInvoice || !returnQuantity || compareDecimal(returnQuantity, fact.creditable) > 0
        : !funds || !amount || bankRef !== bankId || compareDecimal(amount, funds.openBalance) > 0) return fixture.conflict('退货来源或剩余可退款额度已变化。')
      const total = kind === 'credit' ? multiplyDecimals(returnQuantity!, '10') : amount!
      const row: (typeof state.ar)[number] = { id: crypto.randomUUID(), version: 1, state: 'submitted', maker: actor(), isMaker: true,
        awaitsFiscalNumber: false, openBalance: '0', terms: { kind: kind === 'credit' ? 4 : 5, invoiceId, returnId, fundsId, bankId: bankRef,
          number, on, total, customerId: partner, customerName: 'MSW 退货客户', currency: 'CNY',
          lines: fact ? [{ shipmentId: fact.returnOf, itemId: fact.itemId, name: fact.itemName, quantity: returnQuantity!, unitPrice: '10', net: total, tax: '0' }] : null } }
      state.ar.unshift(row)
      return change(row)
    }, 201)),
    ...(['trade', 'receivables'] as const).map(service => http.post(root + '/' + service + '/documents/:id/decision', ({ params, request }) =>
      fixture.write(params.workspaceId, request, (body) => {
        const approve = service === 'trade' ? body.decision === 'approve' : body.approve === true
        const row = (service === 'trade' ? state.ap : state.ar).find(row => row.id === params.id)
        if (!row) return fixture.missing()
        if (approve ? !reviewer() || row.maker === actor() : !maker() || row.maker !== actor()) return fixture.forbidden()
        if (row.version !== body.expectedVersion) return fixture.stale()
        if (row.state !== 'submitted' || (approve && !row.terms.on.startsWith('2026-01'))) return fixture.conflict('单据版本、状态或期间不支持过账。')
        if (approve && 'recoverable' in row) {
          if (row.terms.kind === 9 && row.terms.returnReceiptId) {
            if (state.accrued[row.terms.returnReceiptId]) return fixture.conflict('退货已入账。')
            row.recoverable = row.total
            row.journalId = state.accrued[row.terms.returnReceiptId] = crypto.randomUUID()
          } else {
            const source = state.ap.find(doc => doc.id === row.terms.sourceId)
            if (!source || compareDecimal(row.total, source.recoverable) > 0) return fixture.conflict('可退款额度已变化。')
            source.recoverable = subtractDecimal(source.recoverable, row.total)
          }
        } else if (approve && 'openBalance' in row) {
          if (row.terms.kind === 4) {
            const allowed = shipments().find(fact => fact.id === row.terms.returnId)?.creditable ?? '0'
            if (compareDecimal(row.terms.lines?.[0]?.quantity ?? '0', allowed) > 0) return fixture.conflict('可贷项额度已变化。')
            row.openBalance = row.terms.total
          } else {
            const source = state.ar.find(doc => doc.id === row.terms.fundsId)
            if (!source || compareDecimal(row.terms.total, source.openBalance) > 0) return fixture.conflict('可退款额度已变化。')
            source.openBalance = subtractDecimal(source.openBalance, row.terms.total)
          }
        }
        row.state = approve ? 'posted' : 'cancelled'
        if (approve) row.journalId ??= crypto.randomUUID()
        row.version = Number(row.version) + 1
        return change(row)
      }))),
    ...(['payables', 'receivables'] as const).map(kind => http.get(root + '/reporting/aging/' + kind, ({ params, request }) =>
      fixture.read(params.workspaceId, () => ({ kind, through: new URL(request.url).searchParams.get('through') ?? '2026-01-31', currency: 'CNY',
        minorUnits: 2, watermark: 0, total: '0', buckets: [], items: [] }))))
  ]
}

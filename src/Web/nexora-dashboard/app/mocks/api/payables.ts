import { http, HttpResponse } from 'msw/http'
import { z } from 'zod'
import {
  tradeDocumentSchema,
  tradeTermsSchema,
  tradeJournalSchema,
  bankMovementSchema,
  type TradeDocument
} from '../../../shared/types/trade'
import { taxSnapshotSchema } from '../../../shared/types/tax'
import {
  compareDecimal,
  divideDecimal,
  multiplyDecimals,
  roundDecimal,
  subtractDecimal,
  sumDecimals
} from '../../../shared/utils/decimal'
import { changeSchema, decimalInput, quantityInput } from '../../../shared/types/purchasing'
import { problem, mockWorkspaceId } from './catalog'
import type { ProcurementFixture } from './procurement'

const bankId = '88888888-8888-4888-8888-000000000001',
  bankAccountId = '88888888-8888-4888-8888-000000000002'
const account = (index: number) => `88888888-8888-4888-8888-${String(100 + index).padStart(12, '0')}`
const resultSchema = z.union([changeSchema, taxSnapshotSchema])
const stateSchema = z.object({
  documents: z.array(tradeDocumentSchema.extend({ maker: z.string() })),
  assessments: z.array(taxSnapshotSchema),
  journals: z.array(tradeJournalSchema),
  movements: z.array(bankMovementSchema),
  balance: z.string(),
  operations: z.array(
    z.object({
      key: z.string(),
      fingerprint: z.string(),
      result: resultSchema,
      status: z.number(),
      location: z.string().optional()
    })
  )
})
export function createPayableHandlers(procurement: ProcurementFixture, storage?: Pick<Storage, 'getItem' | 'setItem'>) {
  const { context, active, allowed, reviewer, receiver } = procurement
  const root = '*/bff/api/finance/workspaces/:workspaceId'
  let state: z.infer<typeof stateSchema> = {
    documents: [],
    assessments: [],
    journals: [],
    movements: [],
    balance: '2000',
    operations: []
  }
  const stateKey = 'nexora:msw:d4-finance'
  try {
    const raw = storage?.getItem(stateKey)
    if (raw) state = stateSchema.parse(JSON.parse(raw))
  } catch {
    /* Reset invalid development fixtures. */
  }
  const persist = () => storage?.setItem(stateKey, JSON.stringify(state))
  const missing = () => problem(404, 'resource.not_found', '当前工作区没有此财务资源。')
  const canSubmit = () => context.editable() && !reviewer() && !receiver()
  const bank = () => ({
    id: bankId,
    accountId: bankAccountId,
    code: 'D4-BANK',
    name: 'D4 专用演示银行',
    kind: 'bank',
    isDefault: true,
    balance: state.balance,
    version: state.movements.length + 1
  })
  const group = { code: 'MSW-VAT13', name: '演示 13% 税组', version: 1, rateCodes: ['VAT13'] }
  const view = (value: z.infer<typeof stateSchema>['documents'][number]): TradeDocument => ({
    ...value,
    isMaker: value.maker === context.subject()
  })
  const page = <T>(values: T[], request: Request, size = 50) =>
    values.slice(
      (Math.max(1, Number(new URL(request.url).searchParams.get('page') ?? 1)) - 1) * size,
      Math.max(1, Number(new URL(request.url).searchParams.get('page') ?? 1)) * size
    )
  function journal(
    documentId: string,
    on: string,
    number: string,
    amount: string,
    debitId: string,
    debitName: string,
    creditId: string,
    creditName: string
  ) {
    const id = crypto.randomUUID(),
      postingNumber = state.journals.length + 1
    state.journals.push({
      journal: {
        id,
        kind: 'trade',
        sourceNumber: number,
        on,
        memo: 'D4 MSW business fixture ' + documentId,
        state: 'posted',
        version: 2,
        postingNumber
      },
      lines: [
        { accountId: debitId, code: debitId === bankAccountId ? '1002' : '2202', name: debitName, debit: amount, credit: '0' },
        { accountId: creditId, code: creditId === bankAccountId ? '1002' : '2202', name: creditName, debit: '0', credit: amount }
      ]
    })
    return id
  }
  async function write(
    request: Request,
    workspace: unknown,
    permitted: boolean,
    apply: (body: Record<string, unknown>) => { result: unknown, status?: number, location?: string } | Response
  ) {
    if (!allowed(workspace)) return missing()
    if (!permitted) return problem(403, 'finance.forbidden', '当前身份没有此财务操作权限。')
    const body = (await request.json()) as Record<string, unknown>
    if (
      request.headers.get('x-csrf-token') !== 'msw-only-csrf'
      || !z.uuid().safeParse(body.operationId).success
      || request.headers.get('idempotency-key') !== body.operationId
    )
      return problem(400, 'write.invalid', 'CSRF 或操作标识无效。')
    const key = JSON.stringify([workspace, context.subject(), body.operationId]),
      fingerprint = JSON.stringify([new URL(request.url).pathname, body])
    const old = state.operations.find(value => value.key === key)
    if (old)
      return old.fingerprint === fingerprint
        ? HttpResponse.json(old.result, { status: old.status, headers: old.location ? { Location: old.location } : {} })
        : problem(409, 'idempotency.conflict', '原操作键对应另一份请求。')
    const response = apply(body)
    if (response instanceof Response) return response
    state.operations.push({
      key,
      fingerprint,
      result: resultSchema.parse(response.result),
      status: response.status ?? 200,
      location: response.location
    })
    persist()
    procurement.persist()
    if (context.scenario() === 'd4-payment-unknown' && (body.terms as { kind?: number } | undefined)?.kind === 2)
      return HttpResponse.error()
    return HttpResponse.json(resultSchema.parse(response.result), {
      status: response.status ?? 200,
      headers: response.location ? { Location: response.location } : {}
    })
  }
  function postedBills(through = '9999-12-31') {
    return state.documents.filter(value => value.terms.kind === 1 && value.state === 'posted' && value.terms.on <= through)
  }
  return [
    http.get(root + '/trade', ({ params }) =>
      active()
        ? allowed(params.workspaceId)
          ? HttpResponse.json({
              currency: 'CNY',
              minorUnits: 2,
              canConfigure: false,
              canSubmit: canSubmit(),
              canApprove: reviewer(),
              banks: [bank()],
              setup: {
                inventoryAccountId: account(0),
                accrualAccountId: account(1),
                payableAccountId: account(2),
                inputTaxAccountId: account(3),
                varianceAccountId: account(4),
                donationIncomeAccountId: account(5),
                version: 1
              }
            })
          : missing()
        : undefined
    ),
    http.get(root + '/trade/banks', ({ params }) =>
      active() ? (allowed(params.workspaceId) ? HttpResponse.json([bank()]) : missing()) : undefined
    ),
    http.get(root + '/tax', ({ params }) =>
      active()
        ? allowed(params.workspaceId)
          ? HttpResponse.json({
              canManage: false,
              groups: [group],
              rates: [{ id: account(8), code: 'VAT13', name: '演示13%', effectiveOn: '2026-01-01', rate: '0.13' }],
              classifications: []
            })
          : missing()
        : undefined
    ),
    http.get(root + '/trade/receipts', ({ params, request }) => {
      if (!active()) return
      if (!allowed(params.workspaceId)) return missing()
      return HttpResponse.json(page(context.scenario() === 'd4-finance-lag' ? [] : procurement.state.facts, request))
    }),
    http.get(root + '/trade/documents', ({ params, request }) =>
      active()
        ? allowed(params.workspaceId)
          ? HttpResponse.json(page([...state.documents].reverse().map(view), request))
          : missing()
        : undefined
    ),
    http.get(root + '/trade/bills', ({ params, request }) =>
      active()
        ? allowed(params.workspaceId)
          ? HttpResponse.json(page([...postedBills()].reverse().map(view), request))
          : missing()
        : undefined
    ),
    http.get(root + '/trade/documents/:id', ({ params }) => {
      if (!active()) return
      const value = allowed(params.workspaceId) && state.documents.find(value => value.id === params.id)
      return value ? HttpResponse.json(view(value)) : missing()
    }),
    http.post(root + '/tax/assessments', ({ params, request }) => {
      if (!active()) return
      return write(request, params.workspaceId, canSubmit(), (body) => {
        const input = z
          .object({
            on: z.iso.date(),
            groupCode: z.string(),
            itemId: z.uuid(),
            partnerId: z.uuid(),
            quantity: z.string(),
            unitPrice: z.string()
          })
          .safeParse(body)
        if (
          !input.success
          || input.data.groupCode !== group.code
          || !context.db.items.some(value => value.id === input.data.itemId)
          || !context.db.partners.some(value => value.id === input.data.partnerId && value.workspaceId === mockWorkspaceId)
        )
          return problem(400, 'tax.invalid', '评估引用或税组无效。')
        const net = roundDecimal(multiplyDecimals(input.data.quantity, input.data.unitPrice), 2),
          tax = roundDecimal(multiplyDecimals(net, '0.13'), 2)
        const value = {
          id: crypto.randomUUID(),
          ...input.data,
          currency: 'CNY',
          minorUnits: 2,
          policy: 'd4-msw-demo',
          group,
          discount: '0',
          includesTax: false,
          references: [
            { kind: 'item', resourceId: input.data.itemId, version: 1, classificationVersion: null },
            { kind: 'partner', resourceId: input.data.partnerId, version: 1, classificationVersion: null }
          ],
          amounts: { net, tax, total: sumDecimals([net, tax]), components: [
            { rateId: '88888888-8888-4888-8888-000000000033', code: 'VAT13', effectiveOn: '2026-01-01', rate: '0.13', amount: tax }
          ] }
        }
        state.assessments.push(value)
        return { result: value }
      })
    }),
    http.get(root + '/tax/assessments/:id', ({ params }) => {
      if (!active()) return
      const value = allowed(params.workspaceId) && state.assessments.find(row => row.id === params.id)
      return value ? HttpResponse.json(value) : missing()
    }),
    http.post(root + '/trade/documents', ({ params, request }) => {
      if (!active()) return
      return write(request, params.workspaceId, canSubmit(), (body) => {
        const input = tradeTermsSchema.safeParse(body.terms)
        if (
          !input.success
          || ![1, 2].includes(input.data.kind)
          || compareDecimal(input.data.amount, '0') <= 0
          || !input.data.memo.trim()
        )
          return problem(400, 'trade.invalid', '账务字段无效。')
        if (state.documents.some(value => value.terms.number === input.data.number))
          return problem(409, 'number.duplicate', '财务单号已存在。')
        if (input.data.kind === 2 && input.data.bankId !== bankId) return missing()
        const value = {
          id: crypto.randomUUID(),
          terms: input.data,
          state: 'submitted',
          version: 1,
          journalId: null,
          reversedById: null,
          total: '0',
          outstanding: '0',
          recoverable: '0',
          isMaker: true,
          maker: context.subject(),
          billMatches: null
        }
        state.documents.push(value)
        return {
          result: { id: value.id, version: value.version },
          status: 201,
          location: new URL(request.url).pathname + '/' + value.id
        }
      })
    }),
    http.post(root + '/trade/documents/:id/decision', ({ params, request }) => {
      if (!active()) return
      return write(request, params.workspaceId, context.editable(), (body) => {
        const value = state.documents.find(value => value.id === params.id)
        if (!value) return missing()
        if (String(body.expectedVersion) !== String(value.version) || value.state !== 'submitted')
          return problem(409, 'version.conflict', '财务单据版本或状态已变化。')
        if (body.decision === 'cancel') {
          if (value.maker !== context.subject()) return problem(403, 'finance.forbidden', '仅制单人可取消本人待复核申请。')
          value.state = 'cancelled'
          value.version = Number(value.version) + 1
          return { result: { id: value.id, version: value.version } }
        }
        if (body.decision !== 'approve' || !reviewer() || value.maker === context.subject())
          return problem(409, 'independent.required', '需要独立财务复核。')
        if (value.terms.kind === 1) {
          const parsedLines = z
            .array(
              z.object({ receiptId: z.uuid(), quantity: quantityInput, net: decimalInput, taxAssessmentId: z.uuid().nullish() })
            )
            .safeParse(value.terms.billReceipts)
          if (!parsedLines.success) return problem(400, 'bill.invalid', '账单行字段无效。')
          const inputs = parsedLines.data,
            matches = [],
            matchedCosts = new Map<string, string>()
          if (!inputs.length || new Set(inputs.map(line => line.receiptId)).size !== inputs.length)
            return problem(400, 'bill.invalid', '请选择不同实收行。')
          for (const input of inputs) {
            const receipt = procurement.state.facts.find(fact => fact.fact.id === input.receiptId)
            if (
              !receipt?.posted
              || receipt.fact.supplierId !== value.terms.partnerId
              || value.terms.on < receipt.fact.on
              || compareDecimal(input.quantity, subtractDecimal(receipt.fact.quantity, receipt.matchedQuantity)) > 0
            )
              return problem(409, 'receipt.not_ready', '实收尚未暂估或可匹配数量不足。')
            const assessment = input.taxAssessmentId ? state.assessments.find(item => item.id === input.taxAssessmentId) : null
            if (
              input.taxAssessmentId
              && (!assessment
                || assessment.on !== value.terms.on
                || compareDecimal(assessment.amounts.net, input.net) !== 0
                || !assessment.references.some(
                  reference => reference.kind === 'partner' && reference.resourceId === value.terms.partnerId
                ))
            )
              return problem(409, 'tax.mismatch', '税额评估不匹配。')
            const remaining = subtractDecimal(receipt.fact.quantity, receipt.matchedQuantity),
              cost
                = compareDecimal(input.quantity, remaining) === 0
                  ? subtractDecimal(receipt.fact.cost, receipt.matchedCost)
                  : divideDecimal(
                      multiplyDecimals(subtractDecimal(receipt.fact.cost, receipt.matchedCost), input.quantity),
                      remaining,
                      2
                    )
            const variance = subtractDecimal(input.net, cost)
            if (compareDecimal(variance, '0') !== 0 && value.terms.method !== 'approve-cost-variance')
              return problem(409, 'variance.approval_required', '价差需要显式核对。')
            matchedCosts.set(input.receiptId, cost)
            matches.push({
              id: crypto.randomUUID(),
              receiptId: input.receiptId,
              quantity: input.quantity,
              net: input.net,
              tax: assessment?.amounts.tax ?? '0',
              variance,
              creditedQuantity: '0',
              creditedNet: '0',
              creditedTax: '0'
            })
          }
          if (compareDecimal(sumDecimals(matches.map(line => line.net)), value.terms.amount) !== 0)
            return problem(400, 'bill.invalid', '行净额与账单合计不一致。')
          for (const match of matches) {
            const receipt = procurement.state.facts.find(fact => fact.fact.id === match.receiptId)!
            receipt.matchedQuantity = sumDecimals([receipt.matchedQuantity, match.quantity])
            receipt.matchedCost = sumDecimals([receipt.matchedCost, matchedCosts.get(match.receiptId)!])
          }
          value.billMatches = matches
          value.total = sumDecimals([value.terms.amount, ...matches.map(line => line.tax)])
          value.outstanding = value.total
          value.journalId = journal(
            value.id,
            value.terms.on,
            value.terms.number,
            value.total,
            account(1),
            '暂估应付',
            account(2),
            '应付账款'
          )
          const savedJournal = state.journals.find(item => item.journal.id === value.journalId)!
          const variance = sumDecimals(matches.map(line => line.variance))
          savedJournal.lines = [
            { accountId: account(1), code: 'GRNI', name: '暂估应付', debit: sumDecimals([...matchedCosts.values()]), credit: '0' },
            { accountId: account(3), code: 'VAT', name: '进项税', debit: sumDecimals(matches.map(line => line.tax)), credit: '0' },
            {
              accountId: account(4),
              code: 'VAR',
              name: '采购价差',
              debit: compareDecimal(variance, '0') >= 0 ? variance : '0',
              credit: compareDecimal(variance, '0') < 0 ? variance.slice(1) : '0'
            },
            { accountId: account(2), code: 'AP', name: '应付账款', debit: '0', credit: value.total }
          ].filter(line => compareDecimal(line.debit, '0') !== 0 || compareDecimal(line.credit, '0') !== 0)
        } else {
          const bill = state.documents.find(
            item => item.id === value.terms.sourceId && item.terms.kind === 1 && item.state === 'posted'
          )
          if (
            !bill
            || bill.terms.partnerId !== value.terms.partnerId
            || compareDecimal(value.terms.amount, bill.outstanding) > 0
            || compareDecimal(value.terms.amount, state.balance) > 0
          )
            return problem(409, 'payment.invalid', '账单未结或银行可用金额不足。')
          bill.outstanding = subtractDecimal(bill.outstanding, value.terms.amount)
          bill.version = Number(bill.version) + 1
          state.balance = subtractDecimal(state.balance, value.terms.amount)
          value.total = value.terms.amount
          value.journalId = journal(
            value.id,
            value.terms.on,
            value.terms.number,
            value.terms.amount,
            account(2),
            '应付账款',
            bankAccountId,
            '银行'
          )
          state.movements.push({
            id: crypto.randomUUID(),
            bankId,
            documentId: value.id,
            journalId: value.journalId,
            on: value.terms.on,
            amount: '-' + value.terms.amount,
            matched: '0',
            voided: false,
            reversesId: null
          })
        }
        value.state = 'posted'
        value.version = Number(value.version) + 1
        return { result: { id: value.id, version: value.version } }
      })
    }),
    http.post(root + '/trade/receipts/:id/accrue', ({ params, request }) => {
      if (!active()) return
      return write(request, params.workspaceId, reviewer(), () => {
        const receipt = procurement.state.facts.find(value => value.fact.id === params.id)
        if (!receipt) return missing()
        if (context.scenario().includes('pending')) return problem(409, 'period.closed', '会计期间未开放，实收保留等待状态。')
        if (!receipt.posted) {
          receipt.posted = true
          receipt.pendingReason = null
          receipt.journalId = journal(
            receipt.fact.id,
            receipt.fact.on,
            receipt.fact.id,
            receipt.fact.cost,
            account(0),
            '库存',
            account(1),
            '暂估应付'
          )
        }
        return { result: { id: receipt.fact.id, version: 1 } }
      })
    }),
    http.get(root + '/trade/banks/:id/movements', ({ params, request }) =>
      active()
        ? allowed(params.workspaceId) && params.id === bankId
          ? HttpResponse.json(page([...state.movements].reverse(), request))
          : missing()
        : undefined
    ),
    http.get(root + '/ledger/journals/:id', ({ params }) => {
      if (!active()) return
      const value = allowed(params.workspaceId) && state.journals.find(value => value.journal.id === params.id)
      return value ? HttpResponse.json(value) : missing()
    }),
    http.get(root + '/reporting/aging/payables', ({ params, request }) => {
      if (!active()) return
      if (!allowed(params.workspaceId)) return missing()
      const through = new URL(request.url).searchParams.get('through') ?? '2026-01-31'
      const items = postedBills(through)
        .filter(value => compareDecimal(value.outstanding, '0') > 0)
        .map(value => ({
          id: value.id,
          partnerId: value.terms.partnerId,
          partnerName: context.db.partners.find(partner => partner.id === value.terms.partnerId)?.name ?? null,
          number: value.terms.number,
          on: value.terms.on,
          dueOn: value.terms.dueOn ?? value.terms.on,
          journalId: value.journalId,
          original: value.total,
          outstanding: value.outstanding,
          bucket: (() => {
            const days
              = (Date.parse(through + 'T00:00:00Z') - Date.parse((value.terms.dueOn ?? value.terms.on) + 'T00:00:00Z')) / 86400000
            return days <= 0 ? 'current' : days <= 30 ? '1-30' : days <= 60 ? '31-60' : days <= 90 ? '61-90' : '90+'
          })()
        }))
      const total = sumDecimals(items.map(value => value.outstanding))
      return HttpResponse.json({
        kind: 'payables',
        currency: 'CNY',
        minorUnits: 2,
        through,
        watermark: state.journals.length,
        total,
        buckets: [...new Set(items.map(value => value.bucket))].map(key => ({
          key,
          count: items.filter(value => value.bucket === key).length,
          amount: sumDecimals(items.filter(value => value.bucket === key).map(value => value.outstanding))
        })),
        items: page(items, request, 20)
      })
    }),
    http.get(root + '/reporting/partner-ledgers/payables/:partnerId', ({ params, request }) => {
      if (!active()) return
      if (!allowed(params.workspaceId)) return missing()
      const query = new URL(request.url).searchParams,
        through = query.get('through') ?? '2026-01-31',
        from = query.get('from') ?? '2026-01-01'
      const documents = state.documents
        .filter(value => value.state === 'posted' && value.terms.partnerId === params.partnerId && value.terms.on <= through)
        .sort((a, b) => a.terms.on.localeCompare(b.terms.on) || a.id.localeCompare(b.id))
      const before = documents.filter(value => value.terms.on < from),
        during = documents.filter(value => value.terms.on >= from)
      const delta = (value: (typeof documents)[number]) => (value.terms.kind === 1 ? value.total : '-' + value.terms.amount)
      const opening = sumDecimals(before.map(delta)),
        increases = sumDecimals(during.filter(value => value.terms.kind === 1).map(value => value.total)),
        decreases = sumDecimals(during.filter(value => value.terms.kind === 2).map(value => value.terms.amount))
      const closing = sumDecimals([opening, increases, '-' + decreases]),
        fundsOpening = sumDecimals(before.filter(value => value.terms.kind === 2).map(value => value.terms.amount))
      let openBalance = opening,
        fundsBalance = fundsOpening
      const items = during.map((value) => {
        const openDelta = delta(value),
          fundsDelta = value.terms.kind === 2 ? value.terms.amount : '0'
        openBalance = sumDecimals([openBalance, openDelta])
        fundsBalance = sumDecimals([fundsBalance, fundsDelta])
        return {
          id: value.id,
          kind: value.terms.kind === 1 ? 'bill' : 'payment',
          number: value.terms.number,
          on: value.terms.on,
          journalId: value.journalId,
          postingNumber: state.journals.find(journal => journal.journal.id === value.journalId)?.journal.postingNumber ?? 0,
          relatedDocumentId: value.terms.sourceId ?? null,
          openDelta,
          openBalance,
          fundsDelta,
          fundsBalance
        }
      })
      const rows = page(items, request, 20)
      return HttpResponse.json({
        kind: 'payables',
        partnerId: params.partnerId,
        currency: 'CNY',
        minorUnits: 2,
        from,
        through,
        watermark: state.journals.length,
        open: { opening, increases, decreases, closing },
        funds: { opening: fundsOpening, increases: decreases, decreases: '0', closing: sumDecimals([fundsOpening, decreases]) },
        hasMore: items.length > Number(query.get('page') ?? 1) * 20,
        items: rows
      })
    })
  ]
}

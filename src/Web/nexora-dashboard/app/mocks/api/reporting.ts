import { http, HttpResponse } from 'msw/http'
import { z } from 'zod'
import { reportKindSchema, type FinancialReport, type ReportExport } from '../../../shared/types/reporting'
import { createBusinessFixture } from './business-fixture'
import { mockItemId, mockWorkspaceId, type CatalogFixture, problem } from './catalog'

const finance = '*/bff/api/finance/workspaces/:workspaceId'
const id = (value: number) => 'd1100000-1111-4111-8111-' + value.toString().padStart(12, '0')
const start = '2026-01-01'
const watermark = 42
const currency = { currency: 'CNY', minorUnits: 2 }
export const d11ReportIds = { account: id(1), partner: id(2), journal: id(3), warehouse: id(4), purchase: id(5) }
const reportInput = z.object({
  kind: reportKindSchema, from: z.iso.date(), through: z.iso.date(), compare: z.boolean(), basis: z.enum(['accrual', 'cash']),
  watermark: z.coerce.number().int().nonnegative().max(watermark)
}).refine(input => input.from >= start && input.from <= input.through)
type Job = { record: ReportExport, snapshot: FinancialReport }

function report(input: z.infer<typeof reportInput>): FinancialReport {
  const { kind, from, through, basis, watermark: at, compare } = input
  const income = basis === 'cash' ? '500' : '800'
  const profit = basis === 'cash' ? '400' : '700'
  const day = 86_400_000
  const before = new Date(Date.parse(from) - day).toISOString().slice(0, 10)
  const beforeStart = new Date(Date.parse(from) - (Date.parse(through) - Date.parse(from) + day)).toISOString().slice(0, 10)
  const previousPeriod = compare && beforeStart >= start ? { from: beforeStart, through: before } : null
  const change = (amount: string) => ({ previous: previousPeriod ? '0' : null, difference: previousPeriod ? amount : null })
  const totals = ({
    'trial-balance': [['debit', '800'], ['credit', '800']],
    'profit-and-loss': [['income', income], ['expense', '100'], ['profit', profit]],
    'balance-sheet': [['assets', '2400'], ['liabilities', '1600'], ['equity', '800']],
    'cash-flow': [['cash-closing', '2400']],
    'equity-changes': [['equity-closing', '800']]
  } satisfies Record<FinancialReport['kind'], string[][]>)[kind]
  return {
    ...currency, kind, basis, period: { from, through }, previousPeriod,
    watermark: at, lines: kind === 'equity-changes'
      ? []
      : [{ row: {
          key: d11ReportIds.account, code: '6001', name: 'MSW-D11 主营收入', section: 'income', amount: income, opening: '0', debit: '0', credit: income
        }, ...change(income) }],
    totals: totals.map(([key, amount]) => ({ key: key!, amount: amount!, ...change(amount!) })),
    partners: kind === 'equity-changes'
      ? [{ code: 'P01', name: 'MSW 合伙人', share: '1', opening: '0',
          contributions: '100', drawings: '0', profitShare: '700', closing: '800' }]
      : null
  }
}

function reportPDF(snapshot: FinancialReport) {
  const stream = 'BT /F1 14 Tf 36 780 Td (' + [snapshot.kind, snapshot.period.from, snapshot.period.through, snapshot.watermark].join(' ') + ') Tj ET\n'
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    '<< /Length ' + stream.length + ' >>\nstream\n' + stream + 'endstream',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
  ]
  let pdf = '%PDF-1.4\n'
  const offsets = objects.map((object, index) => {
    const offset = pdf.length
    pdf += (index + 1) + ' 0 obj\n' + object + '\nendobj\n'
    return String(offset).padStart(10, '0') + ' 00000 n \n'
  })
  return pdf + 'xref\n0 6\n0000000000 65535 f \n' + offsets.join('') + 'trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n' + pdf.length + '\n%%EOF\n'
}

export function createReportingHandlers(catalog: CatalogFixture, storage?: Pick<Storage, 'getItem' | 'setItem'>) {
  const mock = createBusinessFixture(catalog, 'd11', { jobs: [] as Job[] }, storage)
  const { state } = mock
  const exportsPath = finance + '/report-exports'
  const owns = (workspace: unknown) => workspace === mockWorkspaceId && catalog.allowed(workspace)
  const ready = () => catalog.scenario() !== 'd11-queued'
  function view(job: Job): ReportExport {
    return { ...job.record, completedAtUtc: ready() ? job.record.requestedAtUtc : null }
  }
  const badRequest = () => problem(400, 'report.invalid', '日期、报表或过账水位无效。')
  function query(request: Request, kind: unknown) {
    const params = new URL(request.url).searchParams
    return reportInput.safeParse({ kind, from: params.get('from'), through: params.get('through'),
      watermark: params.get('watermark') ?? watermark, basis: params.get('basis') ?? 'accrual', compare: params.get('compare') === 'true' })
  }
  const add = (snapshot: FinancialReport) => {
    if (!ready() && state.jobs.length >= 3) return mock.conflict('队列已满，请等待任务完成后重试。')
    const record: ReportExport = { id: crypto.randomUUID(), kind: snapshot.kind, watermark: snapshot.watermark,
      requestedAtUtc: new Date().toISOString(), completedAtUtc: null }
    state.jobs.unshift({ record, snapshot })
    state.jobs.splice(20)
    return record
  }
  async function created(workspace: unknown, response?: Response) {
    if (response?.status === 201) {
      const job = await response.clone().json() as ReportExport
      response.headers.set('Location', '/bff/api/finance/workspaces/' + workspace + '/report-exports/' + job.id)
    }
    return response
  }
  return [
    http.get(finance + '/book', ({ params }) => mock.read(params.workspaceId, () => ({
      isPersonal: false, canInitialize: false, settings: { baseCurrency: 'CNY', minorUnits: 2, startsOn: start, fiscalYearStartMonth: 1, template: 'mock' }, accounts: []
    }))),
    http.get(finance + '/reports/:kind', ({ params, request }) => mock.read(params.workspaceId, () => {
      const input = query(request, params.kind)
      return input.success ? report(input.data) : badRequest()
    })),
    http.get(finance + '/reports/:kind/rows/:row', ({ params, request }) => mock.read(params.workspaceId, () => {
      const input = query(request, params.kind)
      if (!input.success || !new URL(request.url).searchParams.has('watermark')) return badRequest()
      const { from, through, watermark: at, basis } = input.data
      const amount = basis === 'cash' ? '500' : '800'
      return { period: { from, through }, watermark: at, hasMore: false, postings: [{
        journalId: d11ReportIds.journal, postingNumber: 42, on: through, sourceNumber: 'MSW-D11-JOURNAL', memo: 'MSW 样例凭证',
        accountId: d11ReportIds.account, code: '6001', name: '主营收入', debit: '0', credit: amount, reportAmount: amount
      }] }
    })),
    http.get(finance + '/reports/:kind/pdf', ({ params, request }) => mock.read(params.workspaceId, () => {
      const input = query(request, params.kind)
      return input.success ? new HttpResponse(reportPDF(report(input.data)), { headers: { 'Content-Type': 'application/pdf' } }) : badRequest()
    })),
    http.get(finance + '/reporting/overview', ({ params, request }) => mock.read(params.workspaceId, () => {
      const args = new URL(request.url).searchParams
      return { ...currency, period: { from: args.get('from'), through: args.get('through') },
        watermark, income: '800', expense: '100', profit: '700', cash: '2400', receivable: '2100', payable: '0' }
    })),
    http.get(finance + '/reporting/aging/:kind', ({ params, request }) => mock.read(params.workspaceId, () => {
      const query = new URL(request.url).searchParams
      const through = query.get('through')
      const page = Number(query.get('page') || 1)
      const size = Number(query.get('pageSize') || 20)
      const items = params.kind === 'payables'
        ? []
        : Array.from({ length: 21 }, (_, index) => ({
            id: id(100 + index), partnerId: d11ReportIds.partner, partnerName: 'MSW-D11 客户', number: 'MSW-AR-' + (index + 1),
            on: start, dueOn: '2026-02-01', journalId: d11ReportIds.journal, original: '100', outstanding: '100', bucket: 'current'
          }))
      return { kind: params.kind, ...currency, through, watermark, total: String(items.length * 100),
        buckets: [{ key: 'current', count: items.length, amount: String(items.length * 100) }],
        items: items.slice((page - 1) * size, page * size) }
    })),
    http.get(finance + '/reporting/partner-ledgers/:kind/:partner', ({ params, request }) => mock.read(params.workspaceId, () => {
      const query = new URL(request.url).searchParams
      const balance = { opening: '0', increases: '2100', decreases: '0', closing: '2100' }
      return { kind: params.kind, partnerId: params.partner, ...currency, from: query.get('from'), through: query.get('through'),
        watermark, open: balance, funds: { ...balance, increases: '0', closing: '0' }, hasMore: false,
        items: [{ id: id(100), kind: 'invoice', number: 'MSW-AR-1', on: start, journalId: d11ReportIds.journal,
          postingNumber: watermark, relatedDocumentId: null, openDelta: '100', openBalance: '100', fundsDelta: '0', fundsBalance: '0' }] }
    })),
    http.get(exportsPath, ({ params }) => mock.read(params.workspaceId, () => state.jobs.map(view))),
    http.post(exportsPath, async ({ params, request }) => created(params.workspaceId, await mock.write(params.workspaceId, request, (body) => {
      const input = reportInput.safeParse(body)
      return input.success ? add(report(input.data)) : badRequest()
    }, 201))),
    http.get(exportsPath + '/:id', ({ params }) => mock.read(params.workspaceId, () => {
      const job = state.jobs.find(job => job.record.id === params.id)
      return job ? view(job) : mock.missing()
    })),
    http.post(exportsPath + '/:id/rebuild', async ({ params, request }) => created(params.workspaceId, await mock.write(params.workspaceId, request, () => {
      const job = state.jobs.find(job => job.record.id === params.id)
      return job ? add(job.snapshot) : mock.missing()
    }, 201))),
    http.get(exportsPath + '/:id/file', ({ params }) => mock.read(params.workspaceId, () => {
      const job = state.jobs.find(job => job.record.id === params.id)
      if (!job) return mock.missing()
      if (!ready()) return mock.conflict('任务排队中。')
      const csv = '\uFEFFkey,amount\r\n' + job.snapshot.totals.map(total => total.key + ',' + total.amount).join('\r\n')
      return new HttpResponse(csv, { headers: { 'Content-Type': 'text/csv; charset=utf-8' } })
    })),
    http.get('*/bff/api/reports/workspaces/:workspaceId', ({ params }) => {
      if (!mock.active()) return
      const scenario = catalog.scenario()
      if (!owns(params.workspaceId) || scenario === 'd11-denied') return mock.missing()
      if (scenario === 'd11-pending') return HttpResponse.json({ status: 'pending' }, { status: 202, headers: { 'Retry-After': '2' } })
      if (scenario === 'd11-unavailable') return problem(503, 'reports.authority_unavailable', '授权服务暂不可用。')
      return HttpResponse.json({ workspaceId: params.workspaceId, tenantId: id(7), name: 'MSW-D11 经营工作区', countryCode: 'CN',
        baseCurrency: 'CNY', version: 7, lastEventId: id(6), projectedAtUtc: '2026-11-22T03:08:00Z' })
    }),
    http.get('*/bff/api/inventory/workspaces/:workspaceId/warehouses', ({ params }) => mock.read(params.workspaceId, () => ({
      canManage: false, warehouses: [{ id: d11ReportIds.warehouse, code: 'D11-WH', name: 'MSW 缺货仓', receiverId: null, version: 1,
        canReceive: false, canApproveReturns: false, canApproveSalesReturns: false, canReadStock: true }]
    }))),
    http.get('*/bff/api/inventory/workspaces/:workspaceId/warehouses/:warehouse/positions', ({ params }) => mock.read(params.workspaceId, () =>
      params.warehouse === d11ReportIds.warehouse
        ? [{ itemId: mockItemId, unitId: id(9), currency: 'CNY', quantity: '10', reserved: '10',
            available: '0', value: '100', average: '10', sequence: 1 }]
        : mock.missing())),
    http.get('*/bff/api/purchasing/workspaces/:workspaceId/orders', ({ params }) => mock.read(params.workspaceId, () => ({
      canCreate: true, canApprove: true, hasMore: false, orders: [{ id: d11ReportIds.purchase, number: 'MSW-D11-PO',
        supplierName: 'MSW-D11 供应商', on: start, currency: 'CNY', state: 'submitted', version: 2, departmentId: null }]
    })))
  ]
}

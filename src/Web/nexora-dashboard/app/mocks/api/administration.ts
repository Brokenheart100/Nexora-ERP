import { http, HttpResponse } from 'msw/http'
import { z } from 'zod'
import { companyPresentationSchema } from '../../../shared/types/workspace-administration'
import type { BillingCheckoutIntent, OrganizationBillingInvoice } from '../../../shared/types/organization-billing'
import { auditSources, changeSources } from '../../../shared/types/workspace-audit'
import { mockWorkspaceId, problem, tenantId, type CatalogFixture } from './catalog'
import { createBusinessFixture } from './business-fixture'

const base = '*/bff/api/workspaces/:id'
const now = '2026-11-22T08:00:00Z'
const next = '2026-12-22T08:00:00Z'
const plans = [
  { code: 'free', name: '免费版', monthlyPriceCents: 0, currency: 'CNY', limits: { workspaces: 1, members: 3, documentsPerMonth: 500 }, modules: ['company', 'book'] },
  { code: 'pro', name: '专业版', monthlyPriceCents: 29900, currency: 'CNY', limits: { workspaces: 100, members: 50, documentsPerMonth: 10000 }, modules: ['company', 'book', 'audit'] }
]

export function createAdministrationHandlers(catalog: CatalogFixture, storage?: Pick<Storage, 'getItem' | 'setItem'>) {
  const fixture = createBusinessFixture(catalog, 'd12', {
    company: { workspaceId: mockWorkspaceId, baseCurrency: 'CNY', version: 0, canManage: true, sessionIdleMinutes: 30, roleGrantApprovals: 1,
      presentation: { legalName: 'MSW 工作区公司', brandName: 'MSW 品牌', accentColor: '#274580', dateFormat: 'yyyy-MM-dd', timeZone: 'Asia/Shanghai', logoDataUrl: null as string | null } },
    pending: null as BillingCheckoutIntent | null,
    saved: false,
    planCode: 'pro',
    status: 'active',
    invoices: [] as OrganizationBillingInvoice[]
  }, storage)
  const { state, read, write, conflict } = fixture
  let quotes = 0
  const usage = { workspaces: 1, workspacesLimit: 100, members: 1, membersLimit: 50, documentsThisMonth: 1, documentsLimit: 10000, period: '2026-11' }
  const billing = () => ({ workspaceId: mockWorkspaceId, canManage: true, invoices: state.invoices, plans,
    subscription: { workspaceId: mockWorkspaceId, planCode: state.planCode, effectivePlanCode: state.planCode, status: state.status, version: 1, periodStartUtc: now, periodEndUtc: next, usage } })
  const settings = z.object({ presentation: companyPresentationSchema, sessionIdleMinutes: z.number().int().min(1).max(480), roleGrantApprovals: z.number().int().min(1).max(2) })
  const regularWrites = async (id: unknown, request: Request, apply: (body: unknown) => object | Response) => {
    if (!fixture.active()) return
    if (id !== mockWorkspaceId) return fixture.missing()
    if (request.headers.get('x-csrf-token') !== 'msw-only-csrf' || request.headers.has('idempotency-key')) return problem(400, 'request.invalid', '写入校验失败。')
    const result = apply(await request.json().catch(() => null))
    if (result instanceof Response) return result
    fixture.save()
    return HttpResponse.json(result)
  }
  const setPaid = (invoice: OrganizationBillingInvoice, reference: string) => {
    invoice.paymentReference = reference
    invoice.status = 'paid'
    invoice.paidAtUtc = now
    state.planCode = invoice.planCode
    state.status = 'active'
    return billing()
  }
  const createInvoice = (planCode: string, amountCents: number): OrganizationBillingInvoice => {
    const invoice = { id: crypto.randomUUID(), planCode, status: 'pending', amountCents, currency: 'CNY', issuedAtUtc: now, paidAtUtc: null, paymentReference: null }
    state.invoices.unshift(invoice)
    return invoice
  }

  return [
    http.get(base + '/settings', ({ params }) => read(params.id, () => state.company)),
    http.put(base + '/settings', ({ params, request }) => regularWrites(params.id, request, (body) => {
      if (catalog.scenario() === 'd12-mfa') return problem(403, 'mfa_step_up_required', '请重新验证。')
      if (request.headers.get('if-match') !== `"${state.company.version}"`) return fixture.stale()
      const parsed = settings.safeParse(body)
      if (!parsed.success) return problem(400, 'request.invalid', '公司资料格式无效。')
      Object.assign(state.company, parsed.data, { version: state.company.version + 1 })
      return state.company
    })),
    http.get(base + '/personal-links', ({ params }) => read(params.id, () => [])),
    http.get(base + '/announcements', ({ params }) => fixture.active() ? read(params.id, () => [{ id: 'd12-demo', title: '演示工作区公告', message: '新版工作区已开放治理与审计预览。', endsAtUtc: next }]) : HttpResponse.json([])),
    http.get(base + '/billing', ({ params }) => read(params.id, billing)),
    http.get(base + '/billing/entitlements', ({ params }) => read(params.id, () => {
      const plan = plans.find(item => item.code === state.planCode)!
      return { ...billing().subscription, planName: plan.name, modules: plan.modules, warnings: [] }
    })),
    http.get(base + '/billing/plan-quote', ({ params, request }) => read(params.id, () => {
      const plan = plans.find(item => item.code === new URL(request.url).searchParams.get('planCode'))
      if (!plan) return fixture.missing()
      const cents = plan.monthlyPriceCents + (catalog.scenario() === 'd12-quote-change' && ++quotes > 1 ? 100 : 0)
      return { planCode: plan.code, planName: plan.name, monthlyPriceCents: plan.monthlyPriceCents, currency: plan.currency,
        currentPlanCode: state.planCode, currentPlanName: plans.find(item => item.code === state.planCode)?.name, subscriptionStatus: state.status,
        chargeCents: cents, creditCents: 0, amountDueCents: cents, remainingDays: 30, prorated: false, effectiveAtUtc: now, periodEndUtc: next }
    })),
    http.get(base + '/billing/local-checkout', ({ params }) => read(params.id, () => ({ hasSavedCard: state.saved, pending: state.pending }))),
    http.post(base + '/billing/local-checkout', ({ params, request }) => write(params.id, request, (body) => {
      const plan = plans.find(item => item.code === body.planCode && item.monthlyPriceCents > 0)
      const amount = plan ? plan.monthlyPriceCents + (catalog.scenario() === 'd12-quote-change' && quotes > 1 ? 100 : 0) : 0
      if (!plan || body.expectedAmountCents !== amount) return conflict('费用已变化，请重新核对报价。')
      const invoice = createInvoice(plan.code, amount)
      state.pending = { invoiceId: invoice.id, planCode: plan.code, amountCents: amount, currency: plan.currency,
        usesSavedCard: state.saved && body.useSavedCard === true, ticket: 'msw-checkout-' + invoice.id }
      return state.pending
    })),
    http.post(base + '/billing/local-checkout/:invoice/callback', ({ params, request }) => regularWrites(params.id, request, (body) => {
      const invoice = state.invoices.find(item => item.id === params.invoice)
      if (!invoice || (body as { ticket?: string } | null)?.ticket !== 'msw-checkout-' + invoice.id) return fixture.missing()
      if (invoice.status === 'paid') return billing()
      state.pending = null
      state.saved ||= (body as { saveCard?: boolean }).saveCard === true
      return setPaid(invoice, 'MSW-TEST-' + invoice.id.slice(-8))
    })),
    http.post(base + '/billing/subscription', ({ params, request }) => write(params.id, request, (body) => {
      const plan = plans.find(item => item.code === body.planCode)
      if (!plan) return fixture.missing()
      if (!plan.monthlyPriceCents) {
        state.planCode = plan.code
        state.status = 'active'
      } else createInvoice(plan.code, plan.monthlyPriceCents)
      return billing()
    })),
    http.post(base + '/billing/subscription/cancel', ({ params, request }) => write(params.id, request, () => {
      state.planCode = 'free'
      state.status = 'canceled'
      state.pending = null
      return billing()
    })),
    http.post(base + '/billing/invoices/:invoice/pay', ({ params, request }) => write(params.id, request, (body) => {
      const invoice = state.invoices.find(item => item.id === params.invoice && item.status === 'pending')
      return invoice && typeof body.reference === 'string' ? setPaid(invoice, body.reference) : conflict('当前账单不能登记付款。')
    })),
    ...auditSources.map(source => http.get(`*/bff/api/${source === 'organization' ? '' : source + '/'}workspaces/:id/audit`, ({ params }) => read(params.id, () => ({ entries: [], hasMore: false, retentionDays: 730 })))),
    ...changeSources.flatMap((source) => {
      const route = `*/bff/api/${source === 'organization' ? '' : source + '/'}workspaces/:id/record-changes`
      const rows = source === 'organization'
        ? Array.from({ length: 23 }, (_, index) => ({
            id: crypto.randomUUID(), service: source, entityName: index < 21 ? 'WorkspacePreferences' : 'Workspace', entityId: mockWorkspaceId,
            operation: 'updated', tenantId, workspaceId: mockWorkspaceId, actorIssuer: 'msw', actorSubject: catalog.subject(), occurredAtUtc: now,
            changedProperties: 'BrandName', beforeJson: '{"BrandName":"旧演示品牌"}', afterJson: '{"BrandName":"演示品牌"}'
          }))
        : []
      const filtered = (query: URLSearchParams) => rows.filter(row => ['entityName', 'entityId', 'operation', 'actor'].every((key) => {
        const value = query.get(key)
        return !value || (key === 'actor' ? row.actorSubject === value : row[key as 'entityName' | 'entityId' | 'operation'] === value)
      }) && (query.get('from') === null || Date.parse(row.occurredAtUtc) >= Date.parse(query.get('from')!))
      && (query.get('through') === null || Date.parse(row.occurredAtUtc) <= Date.parse(query.get('through')!)))
      return [
        http.get(route, ({ params, request }) => read(params.id, () => {
          const query = new URL(request.url).searchParams
          const matches = filtered(query)
          const size = Number(query.get('pageSize')) || 20
          const start = ((Number(query.get('page')) || 1) - 1) * size
          return { changes: matches.slice(start, start + size), hasMore: matches.length > start + size, retentionDays: 730 }
        })),
        http.get(route + '.csv', ({ params, request }) => read(params.id, () => {
          const columns = 'occurredAtUtc,service,entityName,entityId,operation,actorIssuer,actorSubject,changedProperties,beforeJson,afterJson'
          const lines = filtered(new URL(request.url).searchParams).map(row => columns.split(',').map(key => '"' + String(row[key as keyof typeof row]).replaceAll('"', '""') + '"').join(','))
          return new HttpResponse([columns, ...lines].join('\n'), { headers: { 'Content-Type': 'text/csv; charset=utf-8' } })
        }))
      ]
    })
  ]
}

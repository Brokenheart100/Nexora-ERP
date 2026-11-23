import { http, HttpResponse } from 'msw/http'
import { z } from 'zod'
import { mockWorkspaceId, problem, type CatalogFixture } from './catalog'
import { createBusinessFixture } from './business-fixture'
import { mockPdf } from './treasury-banking'
import { mockPage } from './treasury'
import { invoiceScheduleInputSchema, invoiceShareTokenSchema, type InvoiceDispatch, type InvoiceOccurrence, type InvoiceSchedule, type InvoiceScheduleInput } from '../../../shared/types/invoicing'
import type { CustomerDocument } from '../../../shared/types/receivables'
import { multiplyDecimals } from '../../../shared/utils/decimal'

const id = (value: number) => '99990000-9999-4999-8999-' + String(value).padStart(12, '0')
export const d9Ids = { customer: id(1), service: id(2), posted: id(3), submitted: id(4), failed: id(5), unknown: id(6) }
export const d9Contact = 'd9-customer@example.invalid'
const today = '2026-11-21'
const root = '*/bff/api/finance/workspaces/:workspaceId'
const ar = root + '/receivables'
type Plan = Omit<InvoiceSchedule, 'version' | 'preview' | 'nextAtUtc'> & { version: number, maker: string }
type Document = Omit<CustomerDocument, 'version' | 'isMaker'> & { version: number, maker: string, sequence?: number }
type Dispatch = Omit<InvoiceDispatch, 'version'> & { version: number }
type Share = { id: string, invoiceId: string, digest: string, expiresAtUtc: string, revokedAtUtc: string | null }

function following(on: string, months: number, anchor: number) {
  const [year, month] = on.split('-').map(Number)
  const target = month! + months - 1
  const maximum = new Date(Date.UTC(year!, target + 1, 0)).getUTCDate()
  return new Date(Date.UTC(year!, target, Math.min(anchor, maximum))).toISOString().slice(0, 10)
}
function nextAfter(plan: Plan, on: string) {
  const next = following(on, plan.terms.intervalMonths, plan.terms.anchorDay)
  return plan.terms.endsOn && next > plan.terms.endsOn ? null : next
}
function viewPlan(plan: Plan): InvoiceSchedule {
  const preview: string[] = []
  for (let date = plan.nextOn; date && preview.length < 12; date = nextAfter(plan, date)) preview.push(date)
  const { maker: _maker, ...view } = plan
  return { ...view, preview, nextAtUtc: plan.nextOn && !plan.paused ? plan.nextOn + 'T01:00:00Z' : null }
}
const utc = () => new Date().toISOString()
const invalid = (message: string) => problem(400, 'validation.failed', message)
const hex = (buffer: Uint8Array) => Array.from(buffer, byte => byte.toString(16).padStart(2, '0')).join('')
const digest = async (value: string) => hex(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value.toUpperCase()))))
const shareView = (share: Share) => ({ id: share.id, expiresAtUtc: share.expiresAtUtc, revokedAtUtc: share.revokedAtUtc })

export function createInvoicingHandlers(catalog: CatalogFixture, storage?: Pick<Storage, 'setItem' | 'getItem'>) {
  const customer = { id: d9Ids.customer, code: 'MSW-D9-CUSTOMER', name: 'D9 模拟客户', roles: ['customer'], isActive: true,
    version: 1, taxNumber: null, address: null, contacts: [{ id: id(10), name: 'D9 联系人', email: d9Contact, phone: null }] }
  const service = { id: d9Ids.service, code: 'MSW-D9-SERVICE', name: 'D9 模拟服务', kind: 'service', tracksInventory: false,
    categoryId: id(11), unitId: id(12), isActive: true, version: 1 }
  const fixedTerms = { kind: 1 as const, number: 'D9-PREVIOUS', customerId: customer.id, customerName: customer.name, on: '2026-10-01',
    currency: 'CNY', total: '300', lines: [{ itemId: service.id, name: service.name, quantity: '2', unitPrice: '150', net: '300', tax: '0' }] }
  const seed: Document[] = [
    { id: d9Ids.posted, maker: 'msw-demo-maker', version: 2, state: 'posted', journalId: id(91), awaitsFiscalNumber: false, openBalance: '300', terms: fixedTerms },
    { id: d9Ids.submitted, maker: 'msw-demo-maker', version: 1, state: 'submitted', journalId: null, awaitsFiscalNumber: true, openBalance: '0',
      terms: { ...fixedTerms, number: '', on: '2026-10-01' } }
  ]
  const mail = (idValue: string, state: 'failed' | 'unknown'): Dispatch => ({ id: idValue, invoiceId: d9Ids.posted, recipient: d9Contact,
    state, attempt: 1, version: 3, previousId: null, resentAsId: null, updatedAtUtc: '2026-11-21T01:00:00Z', detail: 'MSW ' + state })
  const f = createBusinessFixture(catalog, 'd9', {
    schedules: [] as Plan[], history: [] as InvoiceOccurrence[], documents: seed, shares: [] as Share[],
    dispatches: [mail(d9Ids.failed, 'failed'), mail(d9Ids.unknown, 'unknown')],
    numbering: { pattern: 'D9-{FY}-{####}' as string | null, startingNumber: 1, version: 1 }
  }, storage)
  const { read, write, state } = f
  const reviewer = () => catalog.subject() === 'msw-reviewer'
  const maker = () => !reviewer() && !catalog.scenario().includes('read-only')
  const doc = (id: unknown) => state.documents.find(row => row.id === id)
  const viewDoc = ({ maker, sequence: _sequence, ...row }: Document) => ({ ...row, isMaker: maker === catalog.subject() })
  const planOf = (id: unknown) => state.schedules.find(row => row.id === id)
  const outcome = (plan: Plan, invoiceId?: string | null) =>
    ({ id: plan.id, version: plan.version, invoiceId: invoiceId ?? null, pendingReason: plan.pendingReason ?? null })
  const pack = (plan: Plan) => ({ id: plan.id, version: plan.version })
  const contact = (value: unknown) => value === d9Contact
  const channel = () => catalog.scenario().includes('no-mail') ? 'not-configured' : 'local-only'
  const pdfOf = (row: Document) => mockPdf('invoice', [row.terms.number || 'Draft', row.terms.on, 'Amount ' + row.terms.total])
  const posted = (invoice: unknown) => doc(invoice)?.state === 'posted'
  function preview(on: string) {
    const pattern = state.numbering.pattern
    if (!pattern) return f.conflict('财年编号已关闭。')
    const fiscalYear = Number(on.slice(0, 4))
    const past = state.documents.filter(row => row.state === 'posted' && row.terms.on.startsWith(String(fiscalYear)))
    const sequence = Math.max(state.numbering.startingNumber, 1 + Math.max(0, ...past.map(row => row.sequence ?? 0)))
    return { fiscalYear, sequence, number: pattern.replace('{FY}', String(fiscalYear)).replace(/\{(#+)\}/, (_, width: string) => String(sequence).padStart(width.length, '0')) }
  }
  function schedule(input: InvoiceScheduleInput, original?: Plan) {
    const { nextOn, ...fields } = input
    const anchorDay = original?.nextOn === nextOn ? original.terms.anchorDay : Number(nextOn.slice(-2))
    const value = { terms: { ...fields, anchorDay, customerName: customer.name, serviceName: service.name, brand: { timeZone: 'Asia/Shanghai' } },
      nextOn, pendingReason: null, maker: catalog.subject() }
    if (original) {
      Object.assign(original, value)
      original.version++
      return pack(original)
    }
    const created = { ...value, id: crypto.randomUUID(), paused: false, lastOn: null, version: 1 }
    state.schedules.unshift(created)
    return pack(created)
  }
  function savePlan(body: Record<string, unknown>, original?: Plan) {
    if (!maker()) return f.forbidden()
    if (String(body.expectedVersion) !== String(original?.version ?? 0)) return f.stale()
    const input = invoiceScheduleInputSchema.safeParse(body.input)
    if (!input.success || input.data.customerId !== customer.id || input.data.serviceId !== service.id
      || (input.data.endsOn && input.data.endsOn < input.data.nextOn) || (original?.lastOn && input.data.nextOn <= original.lastOn))
      return invalid('计划模板或日期无效。')
    return schedule(input.data, original)
  }
  function recordDate(plan: Plan, on: string, documentId: string | null) {
    state.history.unshift({ scheduleId: plan.id, on, templateVersion: plan.version, documentId, createdAtUtc: utc() })
    plan.lastOn = on
    plan.nextOn = nextAfter(plan, on)
    plan.pendingReason = null
  }
  const partnerRoot = '*/bff/api/masterdata/workspaces/:workspaceId'
  return [
    http.get(ar, ({ params }) => read(params.workspaceId, () => ({
      currency: 'CNY', fiscalNumbering: !!state.numbering.pattern, canConfigure: maker(), canDraft: maker(), canPost: reviewer(),
      accounts: { receivableAccountId: id(100), advanceAccountId: id(101), revenueAccountId: id(102), outputTaxAccountId: id(103), costOfGoodsAccountId: id(104) }
    }))),
    http.get(partnerRoot + '/partners', ({ params }) => read(params.workspaceId, () => ({ items: [customer], hasMore: false, canManage: maker() }))),
    http.get(partnerRoot + '/partners/:id', ({ params }) => read(params.workspaceId, () => params.id === customer.id ? customer : f.missing())),
    http.get(partnerRoot + '/catalog', ({ params }) => read(params.workspaceId, () =>
      ({ definitions: [], page: { items: [service], hasMore: false }, canManage: maker() }))),
    http.get(ar + '/schedules', ({ params, request }) => read(params.workspaceId, () => mockPage(state.schedules, request).map(viewPlan))),
    http.get(ar + '/schedules/:id/occurrences', ({ params, request }) => read(params.workspaceId, () =>
      planOf(params.id) ? mockPage(state.history.filter(row => row.scheduleId === params.id), request) : f.missing())),
    http.post(ar + '/schedules', ({ params, request }) => write(params.workspaceId, request, body => savePlan(body))),
    http.put(ar + '/schedules/:id', ({ params, request }) => write(params.workspaceId, request, body => {
      const plan = planOf(params.id)
      return plan ? savePlan(body, plan) : f.missing()
    })),
    http.post(ar + '/schedules/:id/pause', ({ params, request }) => write(params.workspaceId, request, (body) => {
      if (!maker()) return f.forbidden()
      const plan = planOf(params.id)
      if (!plan) return f.missing()
      if (String(body.expectedVersion) !== String(plan.version)) return f.stale()
      if (typeof body.paused !== 'boolean') return invalid('暂停状态无效。')
      if (plan.paused !== body.paused) { plan.paused = body.paused; plan.version++ }
      return pack(plan)
    })),
    http.post(ar + '/schedules/:id/skip', ({ params, request }) => write(params.workspaceId, request, (body) => {
      if (!maker()) return f.forbidden()
      const plan = planOf(params.id)
      if (!plan) return f.missing()
      if (!plan.nextOn || String(body.expectedVersion) !== String(plan.version) || body.on !== plan.nextOn) return f.stale()
      if (plan.paused) return f.conflict('计划已暂停。')
      recordDate(plan, plan.nextOn, null)
      plan.version++
      return pack(plan)
    })),
    http.post(ar + '/schedules/:id/run', async ({ params, request }) => {
      let generated = false
      const response = await write(params.workspaceId, request, (body) => {
        if (!maker()) return f.forbidden()
        const plan = planOf(params.id)
        if (!plan) return f.missing()
        const prior = state.history.find(row => row.scheduleId === plan.id && row.on === body.on)
        if (prior) return outcome(plan, prior.documentId)
        if (!plan.nextOn || plan.nextOn !== body.on || plan.paused || plan.nextOn > today) return f.conflict('该日期尚未到期，或计划已暂停。')
        if (catalog.scenario().includes('blocked')) {
          plan.pendingReason = '模拟会计期间未开放'
          return outcome(plan)
        }
        const on = plan.nextOn
        const identifier = crypto.randomUUID()
        const amount = multiplyDecimals(plan.terms.quantity, plan.terms.unitPrice)
        state.documents.unshift({ ...seed[1]!, id: identifier, maker: plan.maker, version: 1, awaitsFiscalNumber: !!state.numbering.pattern,
          terms: { ...fixedTerms, number: 'R-' + identifier, on, total: amount,
            lines: [{ ...fixedTerms.lines[0]!, quantity: plan.terms.quantity, unitPrice: plan.terms.unitPrice, net: amount }] } })
        recordDate(plan, on, identifier)
        generated = true
        return outcome(plan, identifier)
      })
      return generated && catalog.scenario().includes('run-unknown') ? HttpResponse.error() : response
    }),
    http.get(ar + '/documents', ({ params, request }) => read(params.workspaceId, () => mockPage(state.documents, request).map(viewDoc))),
    http.get(ar + '/invoices', ({ params }) => read(params.workspaceId, () => state.documents.filter(row => posted(row.id)).map(viewDoc))),
    http.get(ar + '/shipments', ({ params }) => read(params.workspaceId, () => [])),
    http.get(ar + '/documents/:id', ({ params }) => read(params.workspaceId, () => {
      const row = doc(params.id)
      return row ? viewDoc(row) : f.missing()
    })),
    http.post(ar + '/documents/:id/decision', ({ params, request }) => write(params.workspaceId, request, (body) => {
      const row = doc(params.id)
      if (!row) return f.missing()
      if (String(body.expectedVersion) !== String(row.version)) return f.stale()
      if (row.state !== 'submitted') return f.conflict('发票状态已更新。')
      if (body.decision === 'cancel' && maker() && row.maker === catalog.subject()) row.state = 'cancelled'
      else if (body.decision === 'approve' && reviewer() && row.maker !== catalog.subject()) {
        if (row.awaitsFiscalNumber) {
          const next = preview(row.terms.on)
          if (next instanceof Response || next.number !== body.expectedNumber) return f.conflict('候选号码已变化，请重新确认。')
          row.terms.number = next.number
          row.sequence = next.sequence
          row.awaitsFiscalNumber = false
        }
        row.state = 'posted'
        row.journalId = crypto.randomUUID()
        row.openBalance = row.terms.total
      } else return f.forbidden()
      return { id: row.id, version: ++row.version }
    })),
    http.get(ar + '/invoice-numbering', ({ params }) => read(params.workspaceId, () => state.numbering)),
    http.get(ar + '/invoice-numbering/preview', ({ params, request }) => read(params.workspaceId, () => {
      const date = z.iso.date().safeParse(new URL(request.url).searchParams.get('on'))
      return date.success ? preview(date.data) : invalid('请选择开票日期。')
    })),
    http.put(ar + '/invoice-numbering', ({ params, request }) => write(params.workspaceId, request, (body) => {
      if (!maker()) return f.forbidden()
      if (String(body.expectedVersion) !== String(state.numbering.version)) return f.stale()
      const input = z.object({ pattern: z.string().nullable(), startingNumber: z.number().int().min(1).max(999999999) }).safeParse(body)
      if (!input.success) return invalid('编号规则无效。')
      Object.assign(state.numbering, input.data)
      state.numbering.version++
      return state.numbering
    })),
    http.get(ar + '/documents/:id/pdf', ({ params, request }) => read(params.workspaceId, () => {
      const value = doc(params.id)
      const preview = new URL(request.url).searchParams.get('preview') === 'true'
      if (value && (value.state === 'posted' || (preview && value.state === 'submitted' && (reviewer() || value.maker === catalog.subject()))))
        return pdfOf(value)
      return f.missing()
    })),
    http.get(ar + '/documents/:id/shares', ({ params }) => read(params.workspaceId, () =>
      !reviewer() ? f.forbidden() : posted(params.id) ? state.shares.filter(row => row.invoiceId === params.id).map(shareView) : f.missing())),
    http.post(ar + '/documents/:id/shares', async ({ params, request }) => {
      if (!f.active()) return
      const token = hex(crypto.getRandomValues(new Uint8Array(32)))
      const hash = await digest(token)
      return write(params.workspaceId, request, (body) => {
        if (!reviewer()) return f.forbidden()
        const value = doc(params.id)
        if (!value || !posted(value.id)) return f.missing()
        const minutes = z.number().int().min(1).max(10080).safeParse(body.lifetimeMinutes)
        if (!minutes.success) return invalid('有效期无效。')
        const share = { id: crypto.randomUUID(), invoiceId: value.id, digest: hash, revokedAtUtc: null,
          expiresAtUtc: new Date(Date.now() + (catalog.scenario().includes('expired') ? -500 : minutes.data * 60000)).toISOString() }
        state.shares.unshift(share)
        return { ...shareView(share), token }
      }, 200, data => ({ ...data, token: null }))
    }),
    http.post(ar + '/shares/:id/revoke', ({ params, request }) => write(params.workspaceId, request, () => {
      if (!reviewer()) return f.forbidden()
      const value = state.shares.find(row => row.id === params.id)
      if (!value) return f.missing()
      value.revokedAtUtc ??= utc()
      return shareView(value)
    })),
    http.post('*/public/invoice-pdf', async ({ request }) => {
      if (!f.active()) return
      const payload = z.object({ token: invoiceShareTokenSchema }).safeParse(await request.json().catch(() => null))
      if (!payload.success) return f.missing()
      const hash = await digest(payload.data.token)
      const share = state.shares.find(row => hash === row.digest && !row.revokedAtUtc && Date.parse(row.expiresAtUtc) > Date.now())
      const invoice = doc(share?.invoiceId)
      if (!invoice || !posted(invoice.id)) return f.missing()
      const response = pdfOf(invoice)
      response.headers.set('cache-control', 'no-store')
      response.headers.set('referrer-policy', 'no-referrer')
      return response
    }),
    http.get(root + '/capabilities', ({ params }) => read(params.workspaceId, () =>
      ({ invoiceMail: channel(), workspaceMailSender: false, statutoryDonationReceipt: false }))),
    http.get(ar + '/documents/:id/dispatches', ({ params }) => read(params.workspaceId, () =>
      !reviewer() ? f.forbidden() : posted(params.id) ? state.dispatches.filter(row => row.invoiceId === params.id) : f.missing())),
    http.get(ar + '/documents/:id/dispatches/:dispatch', ({ params }) => read(params.workspaceId, () =>
      reviewer() ? state.dispatches.find(row => row.id === params.dispatch && row.invoiceId === params.id) ?? f.missing() : f.forbidden())),
    http.post(ar + '/documents/:id/dispatches', async ({ params, request }) => {
      const response = await write(params.workspaceId, request, (body) => {
        if (!reviewer() || !contact(body.recipient)) return f.forbidden()
        const row = doc(params.id)
        if (!row || !posted(row.id)) return f.missing()
        if (channel() === 'not-configured') return f.conflict('邮件通道未配置。')
        const status = catalog.scenario().includes('failed') ? 'failed' : 'sent'
        const dispatch: Dispatch = { ...mail(crypto.randomUUID(), 'failed'), invoiceId: row.id, state: status,
          detail: status === 'failed' ? 'SMTP 451' : null, updatedAtUtc: utc() }
        state.dispatches.unshift(dispatch)
        return dispatch
      }, 201)
      if (response?.status === 201) {
        const value = await response.clone().json() as Dispatch
        response.headers.set('location', '/bff/api/finance/workspaces/' + mockWorkspaceId + '/receivables/documents/' + value.invoiceId + '/dispatches/' + value.id)
      }
      return response
    }),
    http.post(ar + '/dispatches/:id/decision', ({ params, request }) => write(params.workspaceId, request, (body) => {
      if (!reviewer()) return f.forbidden()
      const row = state.dispatches.find(value => value.id === params.id)
      if (!row) return f.missing()
      if (String(body.expectedVersion) !== String(row.version)) return f.stale()
      if (body.decision === 'retry' && row.state === 'failed') {
        row.state = 'sent'; row.detail = null; row.attempt++
      } else if (body.decision === 'abandon' && !row.resentAsId && ['queued', 'failed', 'unknown'].includes(row.state)) {
        row.state = 'abandoned'
      } else if (body.decision === 'resend' && !row.resentAsId && ['sent', 'unknown'].includes(row.state)) {
        const replacement: Dispatch = { ...row, id: crypto.randomUUID(), previousId: row.id, resentAsId: null,
          attempt: 1, version: 3, state: 'sent', detail: null, updatedAtUtc: utc() }
        row.resentAsId = replacement.id
        row.version++
        row.updatedAtUtc = utc()
        state.dispatches.unshift(replacement)
        return replacement
      } else return f.conflict('该投递状态不允许此操作。')
      row.version++
      row.updatedAtUtc = utc()
      return row
    }))
  ]
}

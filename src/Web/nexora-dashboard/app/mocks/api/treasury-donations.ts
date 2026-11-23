import { http, HttpResponse } from 'msw/http'
import { z } from 'zod'
import { d8Invalid, type D8Fixture } from './treasury'
import { mockPdf } from './treasury-banking'

export function createDonationHandlers(f: D8Fixture, root: string, trade: string) {
  const { state, read, write } = f
  const path = trade + '/documents/:donation/donation-receipt'
  const record = (id: unknown) => state.documents.find(row => row.id === id && row.terms.kind === 6 && row.state === 'posted' && row.journalId)
  const utc = () => new Date().toISOString()
  const deliveries = (donation: unknown) => state.dispatches.filter(row => row.donationId === donation)
  const dispatch = (donation: unknown, dispatchId: unknown) => deliveries(donation).find(row => row.id === dispatchId)
  const mail = () => f.catalog.scenario().includes('no-mail') ? 'not-configured' : 'local-only'
  const ticketInput = z.object({ code: z.string().trim().min(1).max(40), number: z.string().trim().min(1).max(40), issuedOn: z.iso.date() })
  return [
    http.get(root + '/capabilities', ({ params }) => read(params.workspaceId, () =>
      ({ invoiceMail: mail(), workspaceMailSender: false, statutoryDonationReceipt: false }))),
    http.get(path, ({ params }) => read(params.workspaceId, () => {
      const value = record(params.donation)
      if (!value) return f.missing()
      const terms = value.terms
      return { number: 'DON-' + value.id.replaceAll('-', ''), donationNumber: terms.number, on: terms.on, currency: 'CNY', minorUnits: 2,
        amount: value.total, method: terms.method, donor: terms.donationIdentity?.donorName ?? terms.partnerId, recipient: terms.donationIdentity?.recipientName ?? null,
        journalId: value.journalId, reversedById: value.reversedById ?? null }
    })),
    http.get(path + '/pdf', ({ params }) => read(params.workspaceId, () => {
      const document = record(params.donation)
      return document ? mockPdf('donation-receipt', ['DON-' + document.id.replaceAll('-', ''), document.terms.number,
        'Date: ' + document.terms.on, 'Amount: CNY ' + document.total]) : f.missing()
    })),
    http.get(path + '/fiscal-tickets', ({ params }) => read(params.workspaceId, () =>
      record(params.donation) ? state.tickets.filter(row => row.donationId === params.donation) : f.missing())),
    http.get(path + '/fiscal-tickets/:ticket', ({ params }) => read(params.workspaceId, () =>
      state.tickets.find(row => row.donationId === params.donation && row.id === params.ticket) ?? f.missing())),
    http.post(path + '/fiscal-tickets', ({ params, request }) => write(params.workspaceId, request, (body) => {
      if (!f.reviewer()) return f.forbidden()
      const document = record(params.donation), input = ticketInput.safeParse(body)
      if (!document) return f.missing()
      if (!input.success || input.data.issuedOn < document.terms.on) return d8Invalid('票据代码、号码或开具日期无效。')
      if (document.reversedById || state.tickets.some(row => row.donationId === document.id
        || (row.code === input.data.code && row.number === input.data.number))) return f.conflict('捐赠已冲销或票据已登记。')
      const value = { ...input.data, id: crypto.randomUUID(), donationId: document.id, linkedAtUtc: utc() }
      state.tickets.push(value)
      return value
    }, 201)),
    http.get(path + '/dispatches', ({ params }) => read(params.workspaceId, () => {
      if (!f.reviewer()) return f.forbidden()
      return record(params.donation) ? deliveries(params.donation).slice().reverse() : f.missing()
    })),
    http.get(path + '/dispatches/:dispatch', ({ params }) => read(params.workspaceId, () => {
      if (!f.reviewer()) return f.forbidden()
      const value = dispatch(params.donation, params.dispatch)
      return value ? HttpResponse.json(value, { headers: { ETag: '"' + value.version + '"' } }) : f.missing()
    })),
    http.post(path + '/dispatches', ({ params, request }) => write(params.workspaceId, request, (body) => {
      if (!f.reviewer()) return f.forbidden()
      const document = record(params.donation)
      if (!document) return f.missing()
      if (document.reversedById || mail() === 'not-configured') return f.conflict('收据当前不能投递。')
      const contact = state.partners.find(row => row.id === document.terms.partnerId)?.contacts.find(row => row.email === body.recipient)
      if (!contact) return f.forbidden()
      const attempt = f.catalog.scenario().includes('mail-unknown') ? 'unknown' : f.catalog.scenario().includes('mail-failed') ? 'failed' : 'sent'
      const value = { id: crypto.randomUUID(), donationId: document.id, recipient: contact.email, state: attempt,
        attempt: 1, version: 3, previousId: null, resentAsId: null, updatedAtUtc: utc(), detail: attempt === 'sent' ? null : 'MSW 邮件投递场景' } as const
      state.dispatches.push(value)
      return value
    }, 201)),
    http.post(path + '/dispatches/:dispatch/decision', ({ params, request }) => write(params.workspaceId, request, (body) => {
      if (!f.reviewer()) return f.forbidden()
      const value = dispatch(params.donation, params.dispatch)
      if (!value) return f.missing()
      if (String(body.expectedVersion) !== String(value.version)) return f.stale()
      if (body.decision === 'abandon' && !value.resentAsId && ['queued', 'failed', 'unknown'].includes(value.state)) {
        value.state = 'abandoned'
      } else if (!record(params.donation)?.reversedById && mail() !== 'not-configured') {
        if (body.decision === 'retry' && value.state === 'failed') {
          value.state = 'sent'
          value.attempt++
          value.detail = null
        } else if (body.decision === 'resend' && !value.resentAsId && ['sent', 'unknown'].includes(value.state)) {
          const replacement = { ...value, id: crypto.randomUUID(), state: 'sent' as const, previousId: value.id, attempt: 1, version: 3,
            updatedAtUtc: utc(), detail: null }
          value.resentAsId = replacement.id
          value.version++
          value.updatedAtUtc = utc()
          state.dispatches.push(replacement)
          return replacement
        } else return f.conflict('投递状态不允许此操作。')
      } else return f.conflict('投递状态不允许此操作。')
      value.updatedAtUtc = utc()
      value.version++
      return value
    }))
  ]
}

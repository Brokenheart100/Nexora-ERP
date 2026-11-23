import { z } from 'zod'
import { usePartnersApi } from '~/composables/api/usePartnersApi'
import { useTradeApi } from '~/composables/api/useTradeApi'
import { receiptPath, useTreasuryApi } from '~/composables/api/useTreasuryApi'
import { useWorkspaceQuery } from '~/composables/api/useWorkspaceQuery'
import { useTreasuryWrite } from './useTreasuryWrite'
import type { TradeDocument } from '#shared/types/trade'

export function useDonationConnection(donationId: Ref<string>, dispatchId: Ref<string>, ticketId: Ref<string>) {
  const trade = useTradeApi()
  const partners = usePartnersApi()
  const api = useTreasuryApi()
  const page = ref(1)
  const home = useWorkspaceQuery('donation-home', '/finance', trade.home)
  const workspace = () => home.session.activeWorkspaceId
  const canApprove = computed(() => home.data?.canApprove === true)
  const canSubmit = computed(() => home.data?.canSubmit === true)
  const documents = useWorkspaceQuery('donation-documents', '/finance', (id, signal) => trade.documents(id, page.value, signal), () => page.value)
  const detail = useWorkspaceQuery('donation-detail', '/finance', async (id, signal) => {
    if (!z.uuid().safeParse(donationId.value).success) return null
    const value = await trade.document(id, donationId.value, signal)
    return value.terms.kind === 6 ? value : null
  }, () => donationId.value)
  const donors = useWorkspaceQuery('donation-donors', '/finance', async (id, signal) => {
    const items = []
    for (let page = 1; ; page++) {
      const result = await partners.list(id, page, 'donor', signal, 100)
      items.push(...result.items)
      if (!result.hasMore) return items
    }
  })
  const donor = useWorkspaceQuery('donation-donor-detail', '/finance', id =>
    detail.data?.terms.partnerId ? partners.detail(id, detail.data.terms.partnerId).then(result => result.data) : Promise.resolve(null), () => detail.data?.terms.partnerId)
  const capabilities = useWorkspaceQuery('donation-capabilities', '/finance', api.capabilities)
  const posted = computed(() => detail.data?.state === 'posted' ? detail.data.id : '')
  const receipt = useWorkspaceQuery('donation-receipt', '/finance', (id, signal) =>
    posted.value ? api.receipt(id, posted.value, signal) : Promise.resolve(null), () => posted.value)
  const tickets = useWorkspaceQuery('donation-tickets', '/finance', (id, signal) =>
    posted.value ? api.fiscalTickets(id, posted.value, signal) : Promise.resolve([]), () => posted.value)
  const ticket = useWorkspaceQuery('donation-ticket', '/finance', (id, signal) =>
    posted.value && z.uuid().safeParse(ticketId.value).success ? api.fiscalTicket(id, posted.value, ticketId.value, signal)
      : Promise.resolve(null), () => [posted.value, ticketId.value])
  const dispatches = useWorkspaceQuery('donation-dispatches', '/finance', (id, signal) =>
    posted.value && canApprove.value ? api.dispatches(id, posted.value, signal) : Promise.resolve([]), () => [posted.value, canApprove.value])
  const dispatch = useWorkspaceQuery('donation-dispatch', '/finance', (id, signal) =>
    posted.value && canApprove.value && z.uuid().safeParse(dispatchId.value).success ? api.dispatch(id, posted.value, dispatchId.value, signal)
      : Promise.resolve(null), () => [posted.value, dispatchId.value, canApprove.value])
  const write = useTreasuryWrite('donation', () => home.enabled, workspace)
  const root = (id: string) => '/documents/' + id + '/donation-receipt'
  const mailReady = computed(() => ['local-only', 'configured'].includes(capabilities.data?.invoiceMail ?? ''))
  function refreshDispatches() {
    return Promise.all([dispatches.refresh(), dispatch.refresh()])
  }
  let polls = 0
  watch([posted, dispatchId], () => { polls = 0 })
  watchEffect((onCleanup) => {
    const active = dispatches.data?.some(row => row.state === 'queued' || row.state === 'sending')
    if (!import.meta.client || !active || dispatches.loading || polls >= 12) return
    const timer = setTimeout(() => { polls++; void refreshDispatches() }, 1500)
    onCleanup(() => clearTimeout(timer))
  })
  async function refresh() {
    await Promise.all([documents.refresh(), detail.refresh(), home.refresh()])
    await Promise.all([receipt.refresh(), tickets.refresh(), ticket.refresh(), refreshDispatches()])
  }
  async function submit(terms: Record<string, unknown>) {
    if (!canSubmit.value || write.blocked) return false
    if (!await write.send('donation.submit', '/documents', { terms })) return false
    if (write.submission.result) donationId.value = write.submission.result.id
    page.value = 1
    await refresh()
    return true
  }
  async function decide(document: TradeDocument, decision: 'approve' | 'cancel') {
    if (document.state !== 'submitted' || write.blocked || (decision === 'approve' ? !canApprove.value || document.isMaker : !canSubmit.value || !document.isMaker)) return
    if (await write.send('donation.' + decision, '/documents/' + document.id + '/decision',
      { decision, expectedVersion: document.version }, { resourceId: document.id }) || [409, 412].includes(write.submission.failure?.status ?? 0)) await refresh()
  }
  async function linkTicket(input: { code: string, number: string, issuedOn: string }) {
    if (!posted.value || !canApprove.value || detail.data?.reversedById || write.blocked) return false
    if (!await write.send('donation.ticket', root(posted.value) + '/fiscal-tickets', input, { resourceId: posted.value })) return false
    await tickets.refresh()
    return true
  }
  async function queueMail(recipient: string) {
    if (!posted.value || !canApprove.value || !mailReady.value || detail.data?.reversedById || write.blocked) return false
    if (!await write.send('donation.mail', root(posted.value) + '/dispatches', { recipient }, { resourceId: posted.value })) return false
    polls = 0
    await refreshDispatches()
    return true
  }
  async function decideMail(decision: 'retry' | 'resend' | 'abandon') {
    const current = dispatch.data
    if (!current || !canApprove.value || write.blocked) return
    const ok = await write.send('donation.mail.' + decision, root(current.value.donationId) + '/dispatches/' + current.value.id + '/decision',
      { decision, expectedVersion: current.value.version }, { resourceId: current.value.id, etag: current.etag })
    if (ok && decision === 'resend' && write.submission.result) dispatchId.value = write.submission.result.id
    if (ok) polls = 0
    if (ok || [409, 412].includes(write.submission.failure?.status ?? 0)) await refreshDispatches()
  }
  async function check() {
    if (!write.submission.mutation.unknown && write.submission.record?.state === 'unknown') write.submission.resume()
    if (!write.submission.record) { await refresh(); return }
    await write.submission.check(async (saved) => {
      await refresh()
      if (saved.action === 'donation.ticket' && saved.resourceId) await api.fiscalTickets(workspace(), saved.resourceId)
      if (saved.action === 'donation.mail' && saved.resourceId) await api.dispatches(workspace(), saved.resourceId)
      if (saved.action.startsWith('donation.mail.') && saved.resourceId) {
        const [, id] = /\/documents\/([^/]+)\//.exec(saved.path) ?? []
        if (id) await api.dispatch(workspace(), id, saved.resourceId)
      }
      return null
    })
  }
  async function retry() {
    const action = write.submission.record?.action
    if (!await write.submission.retry()) return
    const result = write.submission.result
    if (result && action === 'donation.submit') donationId.value = result.id
    if (result && action === 'donation.mail.resend') dispatchId.value = result.id
    polls = 0
    await refresh()
  }
  watch(() => home.owner, () => { page.value = 1 }, { flush: 'sync' })
  return reactive({ workspace, home, documents, page, detail, donors, donor, receipt, tickets, ticket, dispatches, dispatch, capabilities, write,
    canApprove, canSubmit, mailReady, receiptPdf: computed(() => posted.value ? receiptPath(workspace(), posted.value) + '/pdf' : ''),
    submit, decide, linkTicket, queueMail, decideMail, refresh, refreshDispatches, check, retry })
}

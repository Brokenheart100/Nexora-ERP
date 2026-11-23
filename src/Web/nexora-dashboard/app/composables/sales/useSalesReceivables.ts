import { z } from 'zod'
import type { CustomerDocument, ShipmentAllowance } from '#shared/types/receivables'
import { salesNumberSchema } from '#shared/types/sales'
import { quantityInput } from '#shared/types/purchasing'
import { compareDecimal, sumDecimals } from '#shared/utils/decimal'
import { usePartnersApi } from '~/composables/api/usePartnersApi'
import { receivablesPath, useReceivablesApi } from '~/composables/api/useReceivablesApi'
import { useTradeApi } from '~/composables/api/useTradeApi'
import { useWorkspaceQuery } from '~/composables/api/useWorkspaceQuery'
import { useScopedSubmission } from '~/composables/api/useScopedSubmission'

type Entry = 'invoice' | 'receipt' | 'allocation'
const businessDate = () => new Date().toLocaleDateString('en-CA')
const decimalAmount = z.string().trim().regex(/^\d{1,16}(?:\.\d{1,6})?$/).refine(value => /[1-9]/.test(value))
const pageSize = 50

export function useSalesReceivables(tab: Ref<string>) {
  const api = useReceivablesApi()
  const trade = useTradeApi()
  const partners = usePartnersApi()
  const pages = reactive({ documents: 1, invoices: 1, shipments: 1, customers: 1 })
  const query = useWorkspaceQuery('sales-receivables', '/sales', async (id, signal) => {
    if (tab.value === 'invoice-delivery') {
      const [home, docs] = await Promise.all([api.home(id, signal), api.documents(id, pages.documents, signal)])
      return { home, docs, invoices: [], shipments: [], banks: null, customers: null, aging: null }
    }
    if (!['receivables', 'invoices'].includes(tab.value)) return null
    const [home, docs, invoices, shipments, banks, customers, aging] = await Promise.all([
      api.home(id, signal), api.documents(id, pages.documents, signal), api.invoices(id, pages.invoices, signal),
      api.shipments(id, pages.shipments, signal),
      api.banks(id, signal).catch(() => null), partners.list(id, pages.customers, 'customer', signal, 50).catch(() => null),
      api.aging(id, businessDate(), signal).catch(() => null)
    ])
    return { home, docs, invoices, shipments, banks, customers, aging }
  }, () => [tab.value, ...Object.values(pages)])
  const ws = () => query.session.activeWorkspaceId
  const documentPath = () => receivablesPath(ws()) + '/documents'
  const current = shallowRef<CustomerDocument | null>(null)
  const selectedId = ref('')
  const detailError = ref('')
  const loading = ref(false)
  const error = ref('')
  const candidate = ref('')
  const journal = shallowRef<Awaited<ReturnType<typeof trade.journal>> | null>(null)
  const movement = shallowRef<Awaited<ReturnType<typeof trade.bankMovements>>[number] | null>(null)
  const proofError = ref('')
  const submission = useScopedSubmission('sales-receivables', () => query.enabled)
  const form = reactive({
    kind: 'invoice' as Entry, id: '', version: null as string | number | null, number: '', on: '', dueOn: '',
    customerId: '', orderId: '', amount: '', bankId: '', invoiceId: '', fundsId: '',
    quantities: {} as Record<string, string>, originalLines: [] as NonNullable<CustomerDocument['terms']['lines']>
  })
  const selectedSources = shallowRef<ShipmentAllowance[]>([])
  const retainedInvoice = shallowRef<CustomerDocument | null>(null)
  const retainedFunds = shallowRef<CustomerDocument | null>(null)
  const frozen = computed(() => submission.mutation.busy || !!submission.record)
  const documents = computed(() => query.data?.docs ?? [])
  const invoices = computed(() => query.data?.invoices.filter(row => row.state === 'posted') ?? [])
  const openInvoices = computed(() => invoices.value.filter(row => compareDecimal(row.openBalance, '0') > 0))
  const receipts = computed(() => documents.value.filter(row => row.terms.kind === 2))
  const funds = computed(() => documents.value.filter(row => (row.terms.kind === 2 || row.terms.kind === 4)
    && row.state === 'posted' && compareDecimal(row.openBalance, '0') > 0))
  const canDraft = computed(() => !!query.data?.home.accounts && query.data.home.canDraft && !frozen.value)
  const canPost = computed(() => !!query.data?.home.canPost && current.value?.state === 'submitted' && !current.value.isMaker && !frozen.value)
  const canEdit = computed(() => canDraft.value && current.value?.isMaker === true && current.value.state === 'submitted'
    && current.value.terms.kind === 1 && current.value.terms.lines?.every(line => line.shipmentId) === true)
  const availableSources = computed(() => (query.data?.shipments ?? []).filter(row => row.posted && !row.returnOf
    && compareDecimal(row.available, '0') > 0))
  const selectedInvoice = computed(() => invoices.value.find(row => row.id === form.invoiceId)
    ?? (retainedInvoice.value?.id === form.invoiceId ? retainedInvoice.value : null))
  const allocationInvoices = computed(() => withSelected(openInvoices.value, selectedInvoice.value))
  const compatibleFunds = computed(() => {
    const customer = selectedInvoice.value?.terms.customerId
    const selected = documents.value.find(row => row.id === form.fundsId) ?? retainedFunds.value
    return withSelected(funds.value.filter(row => row.terms.customerId === customer),
      selected?.id === form.fundsId && selected.terms.customerId === customer ? selected : null)
  })
  const invoiceSources = computed(() => {
    const original = form.originalLines
    const shipments = new Map(selectedSources.value.map(row => [row.id, row]))
    for (const row of query.data?.shipments ?? []) shipments.set(row.id, row)
    const rows = [...shipments.values()].filter(row => row.posted && !row.returnOf && compareDecimal(row.available, '0') > 0
      && (!form.orderId || row.orderId === form.orderId) && (!form.customerId || row.customerId === form.customerId))
      .map(row => ({ id: row.id, customerId: row.customerId, customerName: row.customerName, name: row.itemName, on: row.on, unitPrice: row.unitPrice,
        available: sumDecimals([row.available, original.find(line => line.shipmentId === row.id)?.quantity ?? '0']) }))
    for (const line of original) {
      if (!line.shipmentId || rows.some(row => row.id === line.shipmentId)) continue
      const known = shipments.get(line.shipmentId)
      rows.push({ id: line.shipmentId, customerId: form.customerId, customerName: known?.customerName ?? current.value?.terms.customerName ?? '',
        name: line.name, on: known?.on ?? '',
        unitPrice: line.unitPrice, available: sumDecimals([known?.available ?? '0', line.quantity]) })
    }
    return rows
  })
  const customers = computed(() => {
    const values = query.data?.customers?.items.filter(row => row.isActive).map(row => ({ label: row.code + ' ' + row.name, value: row.id })) ?? []
    const known = current.value?.terms
    if (known && !values.some(row => row.value === known.customerId))
      return [{ label: known.customerName, value: known.customerId }, ...values]
    return values
  })
  let selection: AbortController | null = null

  function clear() {
    selection?.abort()
    selection = null
    current.value = journal.value = movement.value = null
    selectedId.value = detailError.value = candidate.value = error.value = proofError.value = ''
    loading.value = false
  }
  async function readDetail(id: string) {
    if (!query.enabled || !z.uuid().safeParse(id).success) return false
    if (selectedId.value && selectedId.value !== id) submission.reset()
    clear()
    const request = new AbortController()
    selection = request
    selectedId.value = id
    loading.value = true
    try {
      const value = await api.detail(ws(), id, request.signal)
      if (selection !== request) return false
      current.value = value
      if (value.journalId) void loadProof(value)
      return true
    } catch (failure) {
      if (selection === request) detailError.value = failure instanceof Error ? failure.message : '暂无法读取单据。'
      return false
    } finally {
      if (selection === request) loading.value = false
    }
  }
  async function loadProof(doc: CustomerDocument) {
    const request = selection
    const scope = ws()
    const bankId = doc.terms.bankId
    const [voucher, flows] = await Promise.allSettled([
      doc.journalId ? trade.journal(scope, doc.journalId) : null,
      doc.terms.kind === 2 && bankId ? trade.bankMovements(scope, bankId) : []
    ])
    if (selection !== request) return
    journal.value = voucher.status === 'fulfilled' ? voucher.value : null
    movement.value = flows.status === 'fulfilled' ? flows.value.find(row => row.documentId === doc.id) ?? null : null
    if (voucher.status === 'rejected' || flows.status === 'rejected') proofError.value = '凭证或资金流水暂无法读取。'
  }
  async function refresh() {
    await query.refresh()
  }
  function changePage(key: keyof typeof pages, step: number) {
    pages[key] = Math.max(1, pages[key] + step)
  }
  function setSourceQuantity(id: string, value: string | number) {
    form.quantities[id] = String(value)
    const row = query.data?.shipments.find(source => source.id === id) ?? selectedSources.value.find(source => source.id === id)
    const others = selectedSources.value.filter(source => source.id !== id)
    selectedSources.value = row && String(value).trim() ? [...others, row] : others
  }
  function withSelected(rows: CustomerDocument[], selected: CustomerDocument | null) {
    return selected?.state === 'posted' && compareDecimal(selected.openBalance, '0') > 0 && !rows.some(row => row.id === selected.id)
      ? [selected, ...rows]
      : rows
  }
  function selectAllocationInvoice(id: string | undefined) {
    retainedInvoice.value = allocationInvoices.value.find(row => row.id === id) ?? null
    form.invoiceId = id ?? ''
    const funds = documents.value.find(row => row.id === form.fundsId) ?? retainedFunds.value
    if (funds?.terms.customerId !== retainedInvoice.value?.terms.customerId) selectAllocationFunds()
  }
  function selectAllocationFunds(id?: string) {
    retainedFunds.value = compatibleFunds.value.find(row => row.id === id) ?? null
    form.fundsId = id ?? ''
  }
  function begin(kind: Entry, options: { orderId?: string, edit?: boolean, invoiceId?: string, fundsId?: string } = {}) {
    if (!canDraft.value || (options.edit && !canEdit.value)) return false
    submission.reset()
    error.value = ''
    const source = options.edit ? current.value : null
    const invoice = invoices.value.find(row => row.id === options.invoiceId) ?? (current.value?.id === options.invoiceId ? current.value : null)
    const lines = source?.terms.lines ?? []
    selectedSources.value = []
    retainedInvoice.value = invoice
    retainedFunds.value = funds.value.find(row => row.id === options.fundsId) ?? (current.value?.id === options.fundsId ? current.value : null)
    Object.assign(form, {
      kind, id: source?.id ?? '', version: source?.version ?? null, number: source?.terms.number ?? '',
      on: source?.terms.on ?? businessDate(), dueOn: source?.terms.dueOn ?? '',
      customerId: source?.terms.customerId ?? invoice?.terms.customerId ?? '', orderId: options.orderId ?? '',
      amount: '', bankId: query.data?.banks?.find(row => row.isDefault)?.id ?? '',
      invoiceId: options.invoiceId ?? '', fundsId: options.fundsId ?? '', originalLines: lines,
      quantities: Object.fromEntries(lines.flatMap(line => line.shipmentId ? [[line.shipmentId, line.quantity]] : []))
    })
    return true
  }
  async function save() {
    if (!canDraft.value) return null
    error.value = ''
    const number = salesNumberSchema.safeParse(form.number)
    const allowBlank = form.kind === 'invoice' && query.data?.home.fiscalNumbering && !form.number.trim()
    if ((!number.success && !allowBlank) || !z.iso.date().safeParse(form.on).success) {
      error.value = '请填写有效单号及业务日期。'
      return null
    }
    const draft: Record<string, unknown> = { kind: form.kind, number: number.success ? number.data : '', on: form.on }
    if (form.kind === 'invoice') {
      const rows = invoiceSources.value.filter(row => form.quantities[row.id]?.trim())
      const filled = Object.values(form.quantities).filter(value => value.trim()).length
      if (!rows.length || rows.length !== filled || rows.length > 50 || new Set(rows.map(row => row.customerId)).size !== 1 || rows.some((row) => {
        const quantity = quantityInput.safeParse(form.quantities[row.id])
        return !quantity.success || compareDecimal(quantity.data, row.available) > 0 || row.on > form.on
      })) {
        error.value = '请选择同一客户的可开票发货行，核对数量与业务日期。'
        return null
      }
      if (form.dueOn && (!z.iso.date().safeParse(form.dueOn).success || form.dueOn < form.on)) {
        error.value = '到期日须在开票日当天或之后。'
        return null
      }
      draft.lines = rows.map(row => ({ shipmentId: row.id, quantity: form.quantities[row.id]!.trim() }))
      draft.dueOn = form.dueOn || null
    } else {
      const amount = decimalAmount.safeParse(form.amount)
      if (!amount.success) {
        error.value = '请输入正数金额。'
        return null
      }
      draft.amount = amount.data
      if (form.kind === 'receipt') {
        if (!customers.value.some(row => row.value === form.customerId) || !query.data?.banks?.some(row => row.id === form.bankId)) {
          error.value = '请选择客户与资金账户。'
          return null
        }
        Object.assign(draft, { customerId: form.customerId, bankId: form.bankId })
      } else {
        const invoice = selectedInvoice.value
        const receipt = compatibleFunds.value.find(row => row.id === form.fundsId)
        if (!invoice || !receipt || [invoice, receipt].some(row => compareDecimal(amount.data, row.openBalance) > 0 || form.on < row.terms.on)) {
          error.value = '请选择同一客户的未结发票与可用款项，核对金额和业务日期。'
          return null
        }
        Object.assign(draft, { invoiceId: invoice.id, fundsId: receipt.id })
      }
    }
    const id = form.id
    const ok = await submission.send('receivables.' + (id ? 'revise' : form.kind),
      documentPath() + (id ? '/' + id : ''), id ? { draft, expectedVersion: form.version } : { draft },
      { method: id ? 'PUT' : 'POST', resourceId: id || undefined })
    const result = ok ? submission.result : null
    if (result) await refresh()
    return result
  }
  async function preview() {
    const doc = current.value
    const request = selection
    if (!canPost.value || !doc?.awaitsFiscalNumber) return
    candidate.value = ''
    try {
      const value = await api.preview(ws(), doc.terms.on, request?.signal)
      if (selection === request) candidate.value = value.number
    } catch (failure) {
      if (selection === request) error.value = failure instanceof Error ? failure.message : '无法预览发票编号。'
    }
  }
  async function decide(approve: boolean) {
    const doc = current.value
    if (!doc || doc.state !== 'submitted' || frozen.value || (approve ? !canPost.value : !canDraft.value || !doc.isMaker)) return
    if (approve && doc.awaitsFiscalNumber && !candidate.value) return
    error.value = ''
    const ok = await submission.send('receivables.' + (approve ? 'approve' : 'cancel'), documentPath() + '/' + doc.id + '/decision',
      { expectedVersion: doc.version, approve, expectedNumber: approve && doc.awaitsFiscalNumber ? candidate.value : null }, { resourceId: doc.id })
    if (ok) {
      if (selectedId.value === doc.id) await readDetail(doc.id)
      await refresh()
    } else if (submission.failure?.code === 'finance.invoice_number_changed' && selectedId.value === doc.id) {
      await preview()
      if (candidate.value) error.value = '候选编号已变化，请核对新编号后再次确认。'
    }
  }
  async function reloadEditor() {
    const id = form.id
    if (id && !frozen.value && await readDetail(id) && canEdit.value) {
      form.version = current.value?.version ?? null
      form.originalLines = current.value?.terms.lines ?? []
      submission.reset()
    }
  }
  async function check() {
    if (!submission.mutation.unknown) submission.resume()
    await submission.check(async (saved) => {
      if (saved.resourceId) await api.detail(saved.workspaceId, saved.resourceId)
      else await api.documents(saved.workspaceId, 1)
      return null
    })
  }
  async function retry() {
    if (!await submission.retry() || !submission.result) return null
    const result = submission.result
    await refresh()
    return result
  }
  watch(() => query.owner, () => {
    clear()
    selectedSources.value = []
    retainedInvoice.value = retainedFunds.value = null
    Object.assign(pages, { documents: 1, invoices: 1, shipments: 1, customers: 1 })
    Object.assign(form, { id: '', version: null, number: '', on: '', dueOn: '', customerId: '', orderId: '',
      amount: '', bankId: '', invoiceId: '', fundsId: '', quantities: {}, originalLines: [] })
  }, { flush: 'sync' })
  onScopeDispose(clear)

  return reactive({ query, pages, pageSize, current, selectedId, loading, detailError, error, candidate, journal, movement, proofError,
    submission, frozen, form, documents, invoices, allocationInvoices, receipts, funds, availableSources, invoiceSources,
    selectedInvoice, compatibleFunds, customers, canDraft, canPost, canEdit,
    clear, readDetail, refresh, changePage, setSourceQuantity, selectAllocationInvoice, selectAllocationFunds, begin, save, preview, decide, reloadEditor, check, retry })
}

export type SalesReceivablesConnection = ReturnType<typeof useSalesReceivables>

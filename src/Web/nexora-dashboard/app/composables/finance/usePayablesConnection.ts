import { z } from 'zod'
import { useWorkspaceQuery } from '~/composables/api/useWorkspaceQuery'
import { useTradeApi } from '~/composables/api/useTradeApi'
import { useFinanceSetupApi } from '~/composables/api/useFinanceSetupApi'
import { useMasterDataApi } from '~/composables/api/useMasterDataApi'
import { usePartnersApi } from '~/composables/api/usePartnersApi'
import { useScopedSubmission } from '~/composables/api/useScopedSubmission'
import { changeSchema, decimalInput, quantityInput } from '#shared/types/purchasing'
import { accrualSchema, type TradeDocument, type TradeJournal, type BankMovement } from '#shared/types/trade'
import { taxSnapshotSchema } from '#shared/types/tax'
import { billTerms, paymentTerms } from '#shared/utils/trade-documents'
import { compareDecimal, multiplyDecimals, roundDecimal, subtractDecimal, sumDecimals } from '#shared/utils/decimal'
import {
  payableBillView,
  payableReceiptView,
  payablePaymentView,
  isPurchaseReceipt,
  paidTotal,
  creditedTotal
} from '~/utils/finance/payables-presentation'

const formSchema = z.object({
  number: z.string().trim().min(1, '请填写账单号。').max(60),
  on: z.iso.date(),
  dueOn: z.union([z.iso.date(), z.literal('')]),
  memo: z.string().trim().min(1, '请填写摘要。').max(300),
  groupCode: z.string().min(1, '请选择税务处理。'),
  approveVariance: z.boolean()
})
const lineSchema = z.object({
  receiptId: z.uuid(),
  receiptLineNo: z.string(),
  quantity: quantityInput,
  unitPrice: decimalInput,
  assessment: taxSnapshotSchema.nullable()
})
const draftSchema = z.object({ form: formSchema, lines: z.array(lineSchema).min(1).max(50), receipts: z.array(accrualSchema).max(50).default([]) })
export type PayableDraftLine = z.infer<typeof lineSchema>
export function usePayablesConnection() {
  const api = useTradeApi(),
    finance = useFinanceSetupApi(),
    master = useMasterDataApi(),
    partners = usePartnersApi(),
    route = useRoute()
  const documentsPage = ref(1),
    receiptsPage = ref(1),
    billsPage = ref(1)
  const query = useWorkspaceQuery(
    'supplier-payables',
    '/finance',
    async (id, signal) => {
      const [home, documents, receipts, bills, tax, catalog, suppliers] = await Promise.all([
        api.home(id),
        api.documents(id, documentsPage.value),
        api.receipts(id, receiptsPage.value),
        api.bills(id, billsPage.value),
        finance.probe(() => finance.taxes(id, signal)),
        master
          .catalog(id, 1, signal, 100)
          .then(value => value.data)
          .catch(() => null),
        partners.list(id, 1, 'supplier', signal, 100).catch(() => null)
      ])
      return { home, documents, receipts, bills, tax, catalog, suppliers }
    },
    () => [documentsPage.value, receiptsPage.value, billsPage.value]
  )
  const today = () => new Date().toLocaleDateString('en-CA')
  const report = reactive({ from: today().slice(0, 4) + '-01-01', through: today(), partnerId: '', page: 1, agingPage: 1 })
  const reports = useWorkspaceQuery(
    'payables-reports',
    '/finance',
    async (id) => {
      const dates = z.object({ from: z.iso.date(), through: z.iso.date() }).parse(report)
      const [aging, ledger] = await Promise.all([
        finance.probe(() => api.aging(id, dates.through, report.agingPage)),
        report.partnerId
          ? finance.probe(() => api.partnerLedger(id, report.partnerId, dates.from, dates.through, report.page))
          : null
      ])
      return { aging, ledger }
    },
    () => [report.from, report.through, report.partnerId, report.page, report.agingPage]
  )
  const canSubmit = computed(() => query.enabled && query.data?.home.canSubmit === true && !!query.data.home.setup)
  const canApprove = computed(() => query.enabled && query.data?.home.canApprove === true)
  const submission = useScopedSubmission(
    'payables-write',
    () => query.enabled && (query.data?.home.canSubmit === true || canApprove.value),
    changeSchema.parse
  )
  const taxSubmission = useScopedSubmission('payables-tax', () => canSubmit.value, taxSnapshotSchema.parse)
  const locked = computed(
    () => !!submission.record || submission.mutation.busy || !!taxSubmission.record || taxSubmission.mutation.busy
  )
  const error = ref(''),
    selectedId = ref(''),
    detailLoading = ref(false),
    chosenReceipt = ref('')
  const details = shallowRef<Record<string, TradeDocument>>({})
  const unavailable = shallowRef<Set<string>>(new Set())
  let selection = 0
  const proofs = shallowRef<
    Record<
      string,
      {
        journal: TradeJournal | null
        movements: BankMovement[]
        bankId: string | null | undefined
        bankPage: number
        message: string
      }
    >
  >({})
  const billForm = reactive({ number: '', on: today(), dueOn: '', memo: '供应商账单', groupCode: '', approveVariance: false })
  const billLines = ref<PayableDraftLine[]>([])
  const selectedReceipts = shallowRef<z.infer<typeof accrualSchema>[]>([])
  const partnerName = (id: string) => query.data?.suppliers?.items.find(value => value.id === id)?.name ?? id
  const itemName = (id: string) => query.data?.catalog?.page.items.find(value => value.id === id)?.name ?? id
  function raw(id: string): TradeDocument | null {
    if (!query.enabled || [403, 404].includes(query.status) || unavailable.value.has(id)) return null
    const stored = details.value[id],
      listed = query.data?.documents.find(value => value.id === id) ?? query.data?.bills.find(value => value.id === id)
    return stored && (!listed || BigInt(stored.version) >= BigInt(listed.version)) ? stored : (listed ?? null)
  }
  async function readProof(document: TradeDocument, bankPage = 1) {
    const owner = query.owner
    try {
      const [journal, movements] = await Promise.all([
        document.journalId ? api.journal(query.session.activeWorkspaceId, document.journalId) : null,
        document.terms.bankId ? api.bankMovements(query.session.activeWorkspaceId, document.terms.bankId, bankPage) : []
      ])
      if (owner === query.owner)
        proofs.value = {
          ...proofs.value,
          [document.id]: { journal, movements, bankId: document.terms.bankId, bankPage, message: '' }
        }
    } catch (failure) {
      if (owner === query.owner)
        proofs.value = {
          ...proofs.value,
          [document.id]: {
            journal: null,
            movements: [],
            bankId: document.terms.bankId,
            bankPage,
            message: failure instanceof Error ? failure.message : '凭证或银行流水暂不可用。'
          }
        }
    }
  }
  async function select(id: string) {
    const owner = query.owner
    if (!query.enabled || !z.uuid().safeParse(id).success) return false
    const ticket = ++selection
    selectedId.value = id
    detailLoading.value = true
    error.value = ''
    try {
      const value = await api.document(query.session.activeWorkspaceId, id)
      if (owner !== query.owner || ticket !== selection) return false
      unavailable.value.delete(id)
      unavailable.value = new Set(unavailable.value)
      details.value = { ...details.value, [id]: value }
      if (value.terms.partnerId && report.partnerId !== value.terms.partnerId) {
        report.partnerId = value.terms.partnerId
        report.page = 1
      }
      await readProof(value)
      if (value.terms.kind === 2 && value.reversedById) {
        try {
          const reversal = await api.document(query.session.activeWorkspaceId, value.reversedById)
          if (owner !== query.owner || ticket !== selection) return false
          details.value = { ...details.value, [reversal.id]: reversal }
          await readProof(reversal)
        } catch (failure) {
          if (owner === query.owner && ticket === selection)
            error.value = failure instanceof Error ? failure.message : '冲销单暂不可用。'
        }
      }
      return owner === query.owner && ticket === selection
    } catch (failure) {
      if (owner === query.owner && ticket === selection) {
        unavailable.value = new Set([...unavailable.value, id])
        error.value = failure instanceof Error ? failure.message : '单据暂不可用。'
      }
    } finally {
      if (owner === query.owner && ticket === selection) detailLoading.value = false
    }
    return false
  }
  async function refresh() {
    const owner = query.owner
    await Promise.all([query.refresh(), reports.refresh()])
    if (owner === query.owner && selectedId.value) await select(selectedId.value)
  }
  function startBill() {
    if (locked.value || !canSubmit.value) return
    Object.assign(billForm, { number: '', on: today(), dueOn: '', memo: '供应商账单', groupCode: '', approveVariance: false })
    billLines.value = []
    selectedReceipts.value = []
    chosenReceipt.value = ''
    error.value = ''
  }
  const receiptFacts = computed(() =>
    (query.data?.receipts ?? []).filter(value => isPurchaseReceipt(value) && (!route.query.order || value.fact.orderId === route.query.order))
  )
  const receiptById = (id: string) => receiptFacts.value.find(value => value.fact.id === id)
    ?? selectedReceipts.value.find(value => value.fact.id === id)
  const available = (receiptId: string) => {
    const receipt = receiptById(receiptId)
    return receipt?.posted ? subtractDecimal(receipt.fact.quantity, receipt.matchedQuantity) : '0'
  }
  const supplierId = computed(
    () => receiptById(billLines.value[0]?.receiptId ?? '')?.fact.supplierId ?? ''
  )
  const orderId = computed(
    () => receiptById(billLines.value[0]?.receiptId ?? '')?.fact.orderId ?? ''
  )
  const options = computed(() =>
    receiptFacts.value
      .filter(
        value =>
          value.posted
          && compareDecimal(available(value.fact.id), '0') > 0
          && !billLines.value.some(line => line.receiptId === value.fact.id)
          && (!supplierId.value || value.fact.supplierId === supplierId.value)
      )
      .map(value => ({
        value: value.fact.id,
        label: value.fact.id + ' · ' + itemName(value.fact.itemId) + ' · 可匹配 ' + available(value.fact.id)
      }))
  )
  function addLine() {
    const receipt = receiptFacts.value.find(value => value.fact.id === chosenReceipt.value)
    if (locked.value || billLines.value.length >= 50 || !receipt?.posted || !options.value.some(value => value.value === receipt.fact.id)) return
    selectedReceipts.value = [...selectedReceipts.value.filter(value => value.fact.id !== receipt.fact.id), receipt]
    billLines.value.push({
      receiptId: receipt.fact.id,
      receiptLineNo: receipt.fact.lineId,
      quantity: available(receipt.fact.id),
      unitPrice: '',
      assessment: null
    })
    chosenReceipt.value = ''
  }
  function updateLine(receiptId: string, field: 'quantity' | 'unitPrice', value: string | number) {
    const line = billLines.value.find(value => value.receiptId === receiptId)
    if (!locked.value && line) {
      line[field] = String(value)
      line.assessment = null
    }
  }
  watch(
    () => [billForm.on, billForm.groupCode],
    () => {
      for (const line of billLines.value) line.assessment = null
    },
    { flush: 'sync' }
  )
  function draft() {
    return draftSchema.parse({ form: billForm, lines: billLines.value,
      receipts: billLines.value.map(line => receiptById(line.receiptId)).filter(value => value !== undefined) })
  }
  async function assess(receiptId: string) {
    if (locked.value || !canSubmit.value) return
    const owner = query.owner
    try {
      const saved = draft(),
        line = saved.lines.find(value => value.receiptId === receiptId)!,
        receipt = receiptById(receiptId)
      if (
        !line
        || !receipt
        || !query.data?.tax
        || query.data.tax.state !== 'ready'
        || !query.data.tax.data.groups.some(value => value.code === billForm.groupCode)
      )
        throw new Error('请选择已配置税组。')
      const success = await taxSubmission.send(
        'payables.tax',
        `/bff/api/finance/workspaces/${query.session.activeWorkspaceId}/tax/assessments`,
        {
          on: saved.form.on,
          groupCode: saved.form.groupCode,
          itemId: receipt.fact.itemId,
          partnerId: receipt.fact.supplierId,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          discount: '0',
          includesTax: false
        },
        { resourceId: receiptId, draft: saved }
      )
      if (success && owner === query.owner) {
        const current = billLines.value.find(value => value.receiptId === receiptId)
        if (current) current.assessment = taxSubmission.result
      }
    } catch (failure) {
      if (owner === query.owner) error.value = failure instanceof Error ? failure.message : '税额评估失败。'
    }
  }
  async function saveBill() {
    if (locked.value || !canSubmit.value || !query.data) return false
    try {
      const saved = draft()
      if (!supplierId.value || saved.lines.some(line => compareDecimal(line.quantity, available(line.receiptId)) > 0))
        throw new Error('请核对已暂估收货行及可匹配数量。')
      const terms = billTerms(
        { ...saved.form, partnerId: supplierId.value, currency: query.data.home.currency, minorUnits: query.data.home.minorUnits },
        saved.lines
      )
      if (
        await submission.send(
          'payables.bill',
          `/bff/api/finance/workspaces/${query.session.activeWorkspaceId}/trade/documents`,
          { terms },
          { draft: saved }
        )
      ) {
        await refresh()
        if (submission.result) await select(submission.result.id)
        return true
      }
    } catch (failure) {
      error.value
        = failure instanceof z.ZodError
          ? failure.issues.map(value => value.message).join('；')
          : failure instanceof Error
            ? failure.message
            : '账单未提交。'
    }
    return false
  }
  async function savePayment(id: string, input: { number: string, on: string, amount: string, bankId: string, memo: string }) {
    if (locked.value || !canSubmit.value) return false
    try {
      const value = z
        .object({
          number: z.string().trim().min(1).max(60),
          on: z.iso.date(),
          amount: quantityInput,
          bankId: z.uuid(),
          memo: z.string().trim().min(1).max(300)
        })
        .parse(input)
      const bill = raw(id)
      if (!bill) throw new Error('请读取当前账单。')
      const terms = paymentTerms(value, bill)
      if (
        await submission.send(
          'payables.payment',
          `/bff/api/finance/workspaces/${query.session.activeWorkspaceId}/trade/documents`,
          { terms },
          { resourceId: id }
        )
      ) {
        await refresh()
        if (submission.result) await select(submission.result.id)
        return true
      }
    } catch (failure) {
      error.value
        = failure instanceof z.ZodError
          ? '请填写付款单号、日期、资金账户、正数金额和摘要。'
          : failure instanceof Error
            ? failure.message
            : '付款未提交。'
    }
    return false
  }
  async function voidPayment(id: string, input: { number: string, on: string, memo: string }) {
    const payment = raw(id)
    if (locked.value || !canSubmit.value || payment?.terms.kind !== 2 || payment.state !== 'posted' || payment.reversedById) return false
    error.value = ''
    const value = z.object({ number: z.string().trim().min(1).max(60), on: z.iso.date(), memo: z.string().trim().min(1).max(300) }).safeParse(input)
    if (!value.success) {
      error.value = '请填写作废单号、日期及原因。'
      return false
    }
    const terms = { kind: 7, sourceId: id, amount: '0', quantity: '0', ...value.data }
    if (!await submission.send('payables.void', `/bff/api/finance/workspaces/${query.session.activeWorkspaceId}/trade/documents`, { terms }, { resourceId: id })) return false
    if (submission.result) await select(submission.result.id)
    await query.refresh()
    return true
  }
  async function decide(id: string, decision: 'approve' | 'cancel') {
    const owner = query.owner
    const current = raw(id)
    if (
      !current
      || locked.value
      || current.state !== 'submitted'
      || (decision === 'approve' ? !canApprove.value || current.isMaker : !query.data?.home.canSubmit || !current.isMaker)
    )
      return false
    if (
      !(await submission.send(
        'payables.' + decision,
        `/bff/api/finance/workspaces/${query.session.activeWorkspaceId}/trade/documents/${id}/decision`,
        { expectedVersion: current.version, decision },
        { resourceId: id }
      ))
    )
      return false
    await query.refresh()
    if (owner !== query.owner) return false
    await select(id)
    if (owner === query.owner && current.terms.sourceId) {
      try {
        const source = await api.document(query.session.activeWorkspaceId, current.terms.sourceId)
        if (owner === query.owner) {
          details.value = { ...details.value, [source.id]: source }
          if (current.terms.kind === 7 && source.terms.kind === 2) {
            await readProof(source)
            if (owner !== query.owner || !source.terms.sourceId) return false
            const bill = await api.document(query.session.activeWorkspaceId, source.terms.sourceId)
            if (owner === query.owner) details.value = { ...details.value, [bill.id]: bill }
          }
        }
      } catch (failure) {
        if (owner === query.owner) error.value = failure instanceof Error ? failure.message : '关联账单暂不可用。'
      }
    }
    if (owner === query.owner) await reports.refresh()
    return owner === query.owner
  }
  async function accrue(id: string) {
    if (!canApprove.value || locked.value) return
    if (
      await submission.send(
        'payables.accrue',
        `/bff/api/finance/workspaces/${query.session.activeWorkspaceId}/trade/receipts/${id}/accrue`,
        {},
        { resourceId: id }
      )
    )
      await refresh()
  }
  function restoreDraft(value: unknown) {
    const saved = draftSchema.parse(value)
    Object.assign(billForm, saved.form)
    billLines.value = saved.lines
    selectedReceipts.value = saved.receipts
  }
  async function recover(kind: 'write' | 'tax', action: 'resume' | 'check' | 'retry') {
    const current = kind === 'write' ? submission : taxSubmission,
      saved = current.record,
      owner = query.owner
    if (!saved) return null
    try {
      if (action === 'resume') {
        if (!current.resume()) return null
        if (saved.draft) restoreDraft(saved.draft)
        if (saved.resourceId && kind === 'write' && saved.action !== 'payables.accrue') await select(saved.resourceId)
      } else if (action === 'check')
        await current.check(async () => {
          const id = query.session.activeWorkspaceId
          if (kind === 'tax') await finance.taxes(id)
          else if (saved.action === 'payables.accrue') await api.receipts(id, receiptsPage.value)
          else if (saved.resourceId) await api.document(id, saved.resourceId)
          else await api.documents(id, documentsPage.value)
          return null
        })
      else if (await current.retry()) {
        if (kind === 'tax' && taxSubmission.result) {
          const line = billLines.value.find(value => value.receiptId === saved.resourceId)
          if (line) line.assessment = taxSubmission.result
        }
        if (kind === 'write' && saved.action !== 'payables.accrue' && submission.result) await select(submission.result.id)
        await refresh()
      }
      return owner === query.owner ? saved : null
    } catch (failure) {
      if (owner === query.owner) error.value = failure instanceof Error ? failure.message : '恢复暂不可用。'
      return null
    }
  }
  function formAmount(kind: 'net' | 'tax' | 'total'): string {
    try {
      if (kind === 'net')
        return sumDecimals(
          billLines.value.map(value =>
            roundDecimal(multiplyDecimals(value.quantity, value.unitPrice), query.data?.home.minorUnits ?? 2)
          )
        )
      if (billForm.groupCode === 'none') return kind === 'tax' ? '0' : formAmount('net')
      if (!billLines.value.length || billLines.value.some(value => !value.assessment)) return '待评估'
      return sumDecimals(billLines.value.map(value => value.assessment!.amounts[kind === 'total' ? 'total' : 'tax']))
    } catch {
      return '—'
    }
  }
  const billView = (id: string) => {
    const value = raw(id)
    return value?.terms.kind === 1 ? payableBillView(value, query.data?.receipts ?? [], partnerName) : null
  }
  const paymentView = (id: string) => {
    const value = raw(id)
    return value?.terms.kind === 2
      ? payablePaymentView(value, bankId => query.data?.home.banks.find(bank => bank.id === bankId)?.name ?? bankId)
      : null
  }
  const corrections = (paymentId: string) => {
    const linked = [...(query.data?.documents ?? []), ...Object.values(details.value)]
      .filter(row => row.terms.kind === 7 && row.terms.sourceId === paymentId)
    return [...new Set(linked.map(row => row.id))].map(raw).filter(row => row !== null)
  }
  watch(
    () => query.owner,
    () => {
      details.value = {}
      unavailable.value = new Set()
      proofs.value = {}
      selectedId.value = ''
      error.value = ''
      detailLoading.value = false
      documentsPage.value = 1
      receiptsPage.value = 1
      billsPage.value = 1
      billLines.value = []
      selectedReceipts.value = []
      chosenReceipt.value = ''
      Object.assign(billForm, { number: '', on: today(), dueOn: '', memo: '供应商账单', groupCode: '', approveVariance: false })
      report.partnerId = ''
      report.page = 1
      report.agingPage = 1
    },
    { flush: 'sync' }
  )
  return reactive({
    query,
    reports,
    report,
    documentsPage,
    receiptsPage,
    billsPage,
    canSubmit,
    canApprove,
    locked,
    submission,
    taxSubmission,
    error,
    selectedId,
    detailLoading,
    proofs,
    changePage: (key: 'documents' | 'receipts' | 'bills', step: number) => {
      const target = { documents: documentsPage, receipts: receiptsPage, bills: billsPage }[key]
      target.value = Math.max(1, target.value + step)
    },
    changeReportPage: (key: 'page' | 'agingPage', step: number) => {
      report[key] = Math.max(1, report[key] + step)
    },
    updateReport: (key: 'from' | 'through' | 'partnerId', value: string) => {
      report[key] = value
      report.page = 1
      report.agingPage = 1
    },
    billForm,
    billLines,
    chosenReceipt,
    options,
    paymentOptions: computed(() => (query.data?.bills ?? []).filter(value => value.state === 'posted' && compareDecimal(value.outstanding, '0') > 0)
      .map(value => ({ value: value.id, label: value.terms.number + ' · ' + partnerName(value.terms.partnerId ?? '') + ' · 未结 ' + value.outstanding }))),
    supplierId,
    orderId,
    available,
    itemName,
    partnerName,
    raw,
    billView,
    paymentView,
    select,
    readProof,
    refresh,
    startBill,
    addLine,
    updateLine,
    assess,
    saveBill,
    savePayment,
    voidPayment,
    corrections,
    decide,
    accrue,
    recover,
    formAmount,
    bills: computed(() =>
      (query.data?.documents ?? [])
        .filter(value => value.terms.kind === 1)
        .map(value => payableBillView(value, query.data?.receipts ?? [], partnerName))
    ),
    receiptRows: computed(() => receiptFacts.value.map(value => payableReceiptView(value, itemName, partnerName))),
    payments: computed(() =>
      (query.data?.documents ?? [])
        .filter(value => value.terms.kind === 2)
        .map(value => payablePaymentView(value, bankId => query.data?.home.banks.find(bank => bank.id === bankId)?.name ?? bankId))
    ),
    paid: (id: string) => {
      const value = raw(id)
      return value ? paidTotal(value) : '0'
    },
    credited: (id: string) => {
      const value = raw(id)
      return value ? creditedTotal(value) : '0'
    },
    outstanding: (id: string) => {
      const value = raw(id)
      return value?.state === 'posted' ? value.outstanding : '待过账'
    },
    state: (id: string) => {
      const value = raw(id)
      if (value?.reversedById) return '已作废'
      return { submitted: '待独立复核', posted: '已过账', cancelled: '已取消' }[value?.state ?? ''] ?? '待查询'
    }
  })
}

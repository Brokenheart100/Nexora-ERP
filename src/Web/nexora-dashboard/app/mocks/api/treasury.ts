import { http, HttpResponse } from 'msw/http'
import { z } from 'zod'
import { createBusinessFixture } from './business-fixture'
import { mockWorkspaceId, problem, type CatalogFixture } from './catalog'
import { createStatementHandlers } from './treasury-banking'
import { createDonationHandlers } from './treasury-donations'
import { tradeTermsSchema, type BankMovement, type TradeDocument, type TradeJournal } from '../../../shared/types/trade'
import { compareDecimal, subtractDecimal, sumDecimals } from '../../../shared/utils/decimal'
import type { WireBank, WireChart } from '../../../shared/types/prerequisites'
import type { BankCsvPreview, ReceiptDispatch, Reconciliation, StatementLine, fiscalTicketSchema, statementMatchSchema } from '../../../shared/types/treasury'

type MockDocument = Omit<TradeDocument, 'isMaker' | 'version'> & { maker: string, version: number }
type MockBank = Omit<WireBank, 'version'> & { version: number }
type MockPreview = { id: string, bankId: string, maker: string, expiresAtUtc: string, committedCount: number | null, rows: BankCsvPreview['rows'] }
type MockReconciliation = Omit<Reconciliation, 'version'> & { maker: string, version: number }
type MockDispatch = Omit<ReceiptDispatch, 'version'> & { version: number }
const id = (number: number) => '86868686-8686-4686-8686-' + String(number).padStart(12, '0')
export const d8Ids = { bank: id(1), payBank: id(2), bill: id(31), payment: id(32), donor: id(61), gift: id(68),
  failure: id(69), uncertain: id(70), control: id(14), income: id(15), expense: id(16), equity: id(17) }
export const d8BookOn = '2026-01-01'
export const d8On = '2026-01-08'
export const d8Contact = 'donor-d8@nexora.invalid'
const root = '*/bff/api/finance/workspaces/:workspaceId'
const trade = root + '/trade'
const termsInput = tradeTermsSchema.omit({ donationIdentity: true }).extend({ on: z.iso.date(), memo: z.string().trim().min(1).max(300),
  number: z.string().trim().min(1).max(60).transform(value => value.toUpperCase()), quantity: z.string().default('0'),
  amount: z.string().regex(/^\d{1,13}(?:\.\d{1,2})?$/) })

export function mockPage<T>(values: T[], request: Request) {
  const page = Math.max(1, Number(new URL(request.url).searchParams.get('page')) || 1)
  return values.slice((page - 1) * 50, page * 50)
}
export const d8Invalid = (message: string) => problem(400, 'validation.failed', message)
export const negative = (value: string) => subtractDecimal('0', value)
export const remainder = (entry: { amount: string, matched: string }) => subtractDecimal(entry.amount.replace(/^-/, ''), entry.matched)

function createTreasuryFixture(catalog: CatalogFixture, storage?: Pick<Storage, 'getItem' | 'setItem'>) {
  const accounts: WireChart['accounts'] = [
    [id(10), '1002-B', '演示银行控制科目', 'asset', 'control'],
    [id(11), '1002-P', '演示应付银行控制科目', 'asset', 'control'],
    [d8Ids.control, '1002-D8', 'D8 待关联控制科目', 'asset', 'control'],
    [d8Ids.income, '6301', 'D8 其他收入', 'income', 'posting'],
    [d8Ids.expense, '6601', 'D8 费用', 'expense', 'posting'],
    [d8Ids.equity, '4001', 'D8 权益', 'equity', 'posting'],
    [id(19), '2202', '应付账款', 'liability', 'control']
  ].map(([idValue, code, name, category, purpose]) => ({ id: idValue!, code: code!, name: name!, category: category!,
    purpose: purpose!, isArchived: false, isUsed: false, parentCode: null, version: 1 }))
  const partner = (idValue: string, code: string, name: string, role: 'donor' | 'supplier' | 'customer') => ({
    id: idValue, code, name, roles: [role], isActive: true, version: 1, taxNumber: null, address: null,
    contacts: role === 'donor' ? [{ id: id(62), name: 'D8 测试联系人', email: d8Contact, phone: null }] : []
  })
  const supplier = partner(id(60), 'D8-SUP', 'D8 演示供应商', 'supplier')
  const donor = partner(d8Ids.donor, 'D8-DONOR', 'D8 演示捐赠人', 'donor')
  const banks: MockBank[] = [
    { id: d8Ids.bank, code: 'D8-BANK', name: 'D8 对账账户', kind: 'bank', accountId: id(10), isDefault: true, balance: '1300', version: 5 },
    { id: d8Ids.payBank, code: 'D8-PAY-BANK', name: 'D8 应付账户', kind: 'bank', accountId: id(11), isDefault: false, balance: '1000', version: 4 }
  ]
  const documents: MockDocument[] = []
  const journals: TradeJournal[] = []
  const movements: BankMovement[] = []
  function seed(number: number, kind: number, bankId: string | null, amount: string, on: string, signed?: string) {
    const code = 'D8-SEED-' + number
    const journalId = id(200 + number)
    const value: MockDocument = { id: id(number), terms: { kind, on, number: code, memo: code, amount, quantity: '0', bankId },
      maker: 'msw-demo-maker', state: 'posted', version: 2, journalId, reversedById: null, total: amount, outstanding: '0', recoverable: '0', billMatches: null }
    documents.push(value)
    if (bankId && signed) movements.push({ id: id(300 + number), bankId, documentId: value.id, journalId, on, amount: signed, matched: '0', voided: false })
    journals.push({ journal: { id: journalId, kind: 'trade', sourceNumber: code, on, memo: code, state: 'posted', version: 2, postingNumber: number }, lines: [] })
    return value
  }
  seed(21, 8, d8Ids.bank, '1000', d8BookOn, '1000')
  seed(22, 4, d8Ids.bank, '300', d8On, '300')
  seed(23, 4, d8Ids.bank, '200', d8On, '200')
  seed(24, 3, d8Ids.bank, '200', d8On, '-200')
  seed(30, 8, d8Ids.payBank, '1400', d8BookOn, '1400')
  const bill = seed(31, 1, null, '1130', d8On)
  bill.outstanding = '530'
  bill.terms.partnerId = supplier.id
  const payment = seed(32, 2, d8Ids.payBank, '600', d8On, '-600')
  payment.terms.sourceId = bill.id
  const gift = seed(68, 6, d8Ids.payBank, '200', d8On, '200')
  Object.assign(gift.terms, { partnerId: donor.id, method: 'transfer', donationIdentity: { donorName: donor.name, recipientName: 'D8 演示工作区' } })
  const seededDispatch = (dispatchId: string, state: 'failed' | 'unknown'): MockDispatch => ({
    id: dispatchId, donationId: gift.id, recipient: d8Contact, state, attempt: 1, version: 3, previousId: null,
    resentAsId: null, updatedAtUtc: d8On + 'T02:00:00Z', detail: state === 'failed' ? '测试通道连接失败' : '测试通道结果未知'
  })
  const fixture = createBusinessFixture(catalog, 'd8', { accounts, banks, documents, movements, journals, partners: [supplier, donor],
    lines: [] as (Omit<StatementLine, 'version'> & { version: number })[], matches: [] as z.infer<typeof statementMatchSchema>[],
    previews: [] as MockPreview[], reconciliations: [] as MockReconciliation[],
    tickets: [] as z.infer<typeof fiscalTicketSchema>[], dispatches: [seededDispatch(d8Ids.failure, 'failed'), seededDispatch(d8Ids.uncertain, 'unknown')]
  }, storage)
  const { state } = fixture
  const reviewer = () => catalog.subject() === 'msw-reviewer'
  const submitter = () => !reviewer() && !catalog.scenario().includes('read-only')
  const getBank = (id: unknown) => state.banks.find(row => row.id === id)
  const getDoc = (id: unknown) => state.documents.find(row => row.id === id)
  const viewDoc = ({ maker, ...value }: MockDocument) => ({ ...value, isMaker: maker === catalog.subject() })
  const cutoff = (bank: string) => state.reconciliations.filter(row => row.bankId === bank && row.state === 'completed')
    .sort((left, right) => right.report.through.localeCompare(left.report.through))[0]?.report.through ?? ''
  const setup = { version: 1, inventoryAccountId: id(80), accrualAccountId: id(81), payableAccountId: id(19), inputTaxAccountId: id(83),
    varianceAccountId: d8Ids.expense, donationIncomeAccountId: d8Ids.income, supplierRecoveryAccountId: null }
  return { ...fixture, submitter, reviewer, getBank, getDoc, viewDoc, cutoff, setup, catalog }
}

export type D8Fixture = ReturnType<typeof createTreasuryFixture>

function postDocument(f: D8Fixture, value: MockDocument) {
  const terms = value.terms
  const source = f.getDoc(terms.sourceId)
  const originalMovement = terms.kind === 7 && f.state.movements.find(row => row.documentId === source?.id)
  const bank = f.getBank(originalMovement ? originalMovement.bankId : terms.bankId)
  const otherBank = f.getBank(terms.otherBankId)
  const amount = terms.kind === 7 ? source?.total ?? '0' : terms.amount
  if (!bank || (terms.kind === 5 && (!otherBank || otherBank.id === bank.id))) return f.missing()
  if (terms.on <= f.cutoff(bank.id) || (otherBank && terms.on <= f.cutoff(otherBank.id))) return f.conflict('资金账户已完成该日期的对账。')
  if (terms.kind === 7 && (!source || source.state !== 'posted' || source.reversedById || !originalMovement || originalMovement.matched !== '0'
    || originalMovement.on <= f.cutoff(bank.id) || terms.on < source.terms.on)) return f.conflict('原单当前不可作废。')
  if (terms.kind === 2 && (!source || source.terms.kind !== 1 || compareDecimal(source.outstanding, amount) < 0)) return f.conflict('付款超过账单未结金额。')
  const debitBank = ![2, 3, 5, 12].includes(terms.kind)
  const signed = originalMovement ? negative(originalMovement.amount) : debitBank ? amount : negative(amount)
  const line = f.state.lines.find(row => row.id === terms.statementLineId)
  if (terms.statementLineId && (!line || line.excluded || line.bankId !== bank.id || line.on !== terms.on
    || compareDecimal(amount, remainder(line)) > 0 || compareDecimal(signed, '0') !== compareDecimal(line.amount, '0'))) return f.conflict('对账单行可匹配余量已变化。')
  if (compareDecimal(sumDecimals([bank.balance, signed]), '0') < 0) return f.conflict('资金账户余额不足。')
  if (terms.kind === 2 && source) { source.outstanding = subtractDecimal(source.outstanding, amount); source.version++ }
  if (originalMovement && source) {
    originalMovement.voided = true
    source.reversedById = value.id
    source.version++
    const bill = f.getDoc(source.terms.sourceId)
    if (source.terms.kind === 2 && bill) { bill.outstanding = sumDecimals([bill.outstanding, amount]); bill.version++ }
  }
  if (terms.kind === 6) terms.donationIdentity = { donorName: f.state.partners.find(row => row.id === terms.partnerId)!.name, recipientName: 'D8 演示工作区' }
  const journalId = crypto.randomUUID()
  const movement = { id: crypto.randomUUID(), bankId: bank.id, documentId: value.id, journalId, on: terms.on,
    amount: signed, matched: line ? amount : '0', voided: false, reversesId: originalMovement ? originalMovement.id : null }
  function apply(account: MockBank, row: BankMovement) {
    account.balance = sumDecimals([account.balance, row.amount])
    account.version++
    f.state.movements.push(row)
  }
  apply(bank, movement)
  if (terms.kind === 5 && otherBank) apply(otherBank, { ...movement, id: crypto.randomUUID(), bankId: otherBank.id, amount })
  if (line) {
    line.matched = sumDecimals([line.matched, amount])
    line.version++
    f.state.matches.push({ id: crypto.randomUUID(), statementLineId: line.id, movementId: movement.id, referenceId: value.id, amount, reversed: false })
  }
  value.state = 'posted'
  value.total = amount
  value.journalId = journalId
  value.version++
  const counterId = otherBank?.accountId ?? terms.counterAccountId ?? f.setup.payableAccountId
  const entries = [bank.accountId, counterId].map((accountId, index) => {
    const account = f.state.accounts.find(row => row.id === accountId)
    const debit = (compareDecimal(signed, '0') > 0) === (index === 0)
    return { accountId, code: account?.code ?? '—', name: account?.name ?? '—', debit: debit ? amount : '0', credit: debit ? '0' : amount }
  })
  f.state.journals.push({ journal: { id: journalId, kind: 'trade', sourceNumber: terms.number, on: terms.on, memo: terms.memo,
    state: 'posted', version: 2, postingNumber: f.state.journals.length + 1 }, lines: entries })
  return { id: value.id, version: value.version }
}

export function createTreasuryHandlers(catalog: CatalogFixture, storage?: Pick<Storage, 'getItem' | 'setItem'>) {
  const f = createTreasuryFixture(catalog, storage)
  const { state, read, write } = f
  const partnerRoot = '*/bff/api/masterdata/workspaces/:workspaceId/partners'
  return [
    http.get(trade, ({ params }) => read(params.workspaceId, () => ({ currency: 'CNY', minorUnits: 2,
      canConfigure: f.submitter(), canSubmit: f.submitter(), canApprove: f.reviewer(), setup: f.setup, banks: state.banks }))),
    http.get(root + '/chart', ({ params }) => read(params.workspaceId, () => ({ revision: state.banks.length, canManage: f.submitter(),
      canImport: false, canExport: false, accounts: state.accounts.map(row => ({ ...row, isUsed: state.banks.some(bank => bank.accountId === row.id) })) }))),
    http.get(trade + '/banks', ({ params, request }) => read(params.workspaceId, () => mockPage(state.banks, request))),
    http.get(trade + '/banks/:bank', ({ params }) => read(params.workspaceId, () => {
      const bank = f.getBank(params.bank)
      return bank ? HttpResponse.json(bank, { headers: { ETag: '"' + bank.version + '"' } }) : f.missing()
    })),
    http.post(trade + '/banks', ({ params, request }) => write(params.workspaceId, request, (body) => {
      if (!f.submitter()) return f.forbidden()
      const parsed = z.object({ code: z.string().trim().min(1).max(40), name: z.string().trim().min(1).max(120),
        kind: z.enum(['bank', 'cash']), accountId: z.uuid() }).safeParse(body)
      if (!parsed.success) return d8Invalid('请输入资金账户资料。')
      const value = parsed.data
      if (!state.accounts.some(row => row.id === value.accountId && row.category === 'asset' && row.purpose === 'control')) return f.missing()
      const code = value.code.toUpperCase()
      if (state.banks.some(bank => bank.accountId === value.accountId || bank.code === code)) return f.conflict('资金账户编码或科目已使用。')
      const bank = { ...value, code, id: crypto.randomUUID(), balance: '0', version: 1, isDefault: !state.banks.length }
      state.banks.push(bank)
      return { id: bank.id, version: bank.version }
    }, 201)),
    http.post(trade + '/banks/:bank/default', ({ params, request }) => write(params.workspaceId, request, (body) => {
      if (!f.submitter()) return f.forbidden()
      const bank = f.getBank(params.bank)
      if (!bank) return f.missing()
      if (String(body.expectedVersion) !== String(bank.version)) return f.stale()
      state.banks.forEach((row) => {
        if (row.isDefault !== (row.id === bank.id)) { row.isDefault = row.id === bank.id; row.version++ }
      })
      return { id: bank.id, version: bank.version }
    })),
    http.get(trade + '/banks/:bank/movements', ({ request, params }) => read(params.workspaceId, () =>
      f.getBank(params.bank) ? mockPage(state.movements.filter(row => row.bankId === params.bank).reverse(), request) : f.missing())),
    http.get(trade + '/documents', ({ params, request }) => read(params.workspaceId, () => mockPage(state.documents.slice().reverse().map(f.viewDoc), request))),
    http.get(trade + '/bills', ({ params, request }) => read(params.workspaceId, () => mockPage(state.documents.filter(row => row.terms.kind === 1 && row.state === 'posted').reverse().map(f.viewDoc), request))),
    http.get(trade + '/documents/:id', ({ params }) => read(params.workspaceId, () => {
      const doc = f.getDoc(params.id)
      return doc ? f.viewDoc(doc) : f.missing()
    })),
    http.post(trade + '/documents', ({ params, request }) => write(params.workspaceId, request, (body) => {
      if (!f.submitter()) return f.forbidden()
      const input = termsInput.safeParse(body.terms)
      if (!input.success || ![2, 3, 4, 5, 6, 7, 11, 12].includes(input.data.kind)
        || (input.data.kind !== 7 && compareDecimal(input.data.amount, '0') <= 0)) return d8Invalid('资金交易内容无效。')
      const terms = input.data
      if (state.documents.some(row => row.terms.number === terms.number)) return f.conflict('资金交易单号已使用。')
      if (terms.kind !== 7 && !f.getBank(terms.bankId) || terms.kind === 7 && !f.getDoc(terms.sourceId)) return f.missing()
      if (terms.kind === 6 && !state.partners.some(row => row.id === terms.partnerId && row.roles.includes('donor'))) return f.missing()
      const value: MockDocument = { id: crypto.randomUUID(), maker: catalog.subject(), terms, state: 'submitted', version: 1,
        total: '0', outstanding: '0', recoverable: '0', journalId: null, reversedById: null, billMatches: null }
      state.documents.push(value)
      return { id: value.id, version: value.version }
    }, 201)),
    http.post(trade + '/documents/:id/decision', ({ params, request }) => write(params.workspaceId, request, (body) => {
      const value = f.getDoc(params.id)
      if (!value) return f.missing()
      if (String(body.expectedVersion) !== String(value.version)) return f.stale()
      if (value.state !== 'submitted') return f.conflict('当前单据不在待复核状态。')
      if (body.decision === 'approve') return !f.reviewer() || value.maker === catalog.subject() ? f.forbidden() : postDocument(f, value)
      if (body.decision !== 'cancel' || !f.submitter() || value.maker !== catalog.subject()) return f.forbidden()
      value.state = 'cancelled'
      return { id: value.id, version: ++value.version }
    })),
    http.get(trade + '/receipts', ({ params }) => read(params.workspaceId, () => [])),
    http.get(root + '/ledger/journals/:id', ({ params }) => read(params.workspaceId, () => state.journals.find(row => row.journal.id === params.id) ?? f.missing())),
    http.get(root + '/reporting/aging/payables', ({ params, request }) => read(params.workspaceId, () => {
      const through = new URL(request.url).searchParams.get('through') ?? d8On
      const bills = state.documents.filter(row => row.terms.kind === 1 && row.terms.on <= through && compareDecimal(row.outstanding, '0') > 0)
      return { kind: 'payables', currency: 'CNY', minorUnits: 2, through, watermark: state.journals.length,
        total: sumDecimals(bills.map(row => row.outstanding)), buckets: [],
        items: bills.map(row => ({ id: row.id, number: row.terms.number, partnerId: row.terms.partnerId, partnerName: state.partners[0]?.name,
          on: row.terms.on, dueOn: row.terms.on, journalId: row.journalId, original: row.total, outstanding: row.outstanding, bucket: 'current' })) }
    })),
    http.get(partnerRoot, ({ params, request }) => read(params.workspaceId, () => {
      const role = new URL(request.url).searchParams.get('role')
      return { items: state.partners.filter(row => !role || row.roles.some(value => value === role)), hasMore: false, canManage: f.submitter() }
    })),
    http.get(partnerRoot + '/:id', ({ params }) => read(params.workspaceId, () => state.partners.find(row => row.id === params.id) ?? f.missing())),
    ...createStatementHandlers(f, trade),
    ...createDonationHandlers(f, root, trade)
  ]
}

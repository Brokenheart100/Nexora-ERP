import { http } from 'msw/http'
import { z } from 'zod'
import type { CatalogFixture } from './catalog'
import { mockItemId } from './catalog'
import { createBusinessFixture } from './business-fixture'
import { compareDecimal, subtractDecimal, sumDecimals } from '../../../shared/utils/decimal'
import { changeSchema } from '../../../shared/types/purchasing'
import { partnerCapitalSchema, type fiscalYearPreviewSchema, type JournalSummary, type OpeningBatch } from '../../../shared/types/ledger'

const startsOn = '2026-01-01'
const account = (id: string, code: string, name: string, category: string, purpose = 'posting') =>
  ({ id, code, name, category, purpose, parentCode: null as string | null, isArchived: false, isUsed: false, version: 1 })
const seeds = [
  account('0f3cac15-f13d-4592-adea-40c3a0532fb8', '1001', '库存现金', 'asset'),
  account('56dccb6e-2c58-4709-9d32-38c2a5b15fd1', '3001', '期初权益', 'equity'),
  account('a737e551-9333-4d18-b969-5d2e6632885e', '6001', '营业收入', 'income'),
  account('b6741544-6ab3-495c-936c-5314668188ee', '1405', '库存商品', 'asset', 'control')
]
interface MemoJournal { journal: JournalSummary, maker: string, lines: { accountId: string, code: string, name: string, debit: string, credit: string }[] }
interface Preview { id: string, revision: number, expiresAtUtc: string, imported: (typeof seeds)[number][], committedRevision: number | null }
type FiscalPreview = z.infer<typeof fiscalYearPreviewSchema>
const draftSchema = z.object({ on: z.iso.date(), memo: z.string(), lines: z.array(z.object({
  accountId: z.uuid(), debit: z.string().regex(/^\d+(?:\.\d+)?$/), credit: z.string().regex(/^\d+(?:\.\d+)?$/)
})).min(2) })

export function createAccountingHandlers(catalog: CatalogFixture, storage?: Pick<Storage, 'getItem' | 'setItem'>) {
  const initialized = catalog.scenario() !== 'd7-uninitialized'
  const fixture = createBusinessFixture(catalog, 'd7', {
    settings: initialized ? { baseCurrency: 'CNY', startsOn, fiscalYearStartMonth: 1, minorUnits: 2, template: 'CNY' } : null,
    revision: 1, accounts: structuredClone(seeds), previews: [] as Preview[],
    journals: [] as MemoJournal[], number: 0, periods: [{ month: startsOn, state: 'open', version: 1, closingWatermark: null as number | null }],
    history: [] as { id: string, month: string, occurredAtUtc: string, version: number, state: string, reason: string, watermark: number | null }[],
    links: [] as { id: string, fromJournalId: string, toJournalId: string, kind: string, memo: string, version: number }[],
    batches: [] as (OpeningBatch & { maker: string })[], openingFile: '', openingProof: '', subFile: '', subProof: '',
    partnerships: [] as { year: number, version: number, partners: z.infer<typeof partnerCapitalSchema>[] }[],
    years: [] as { id: string, version: number, anchor: number, maker: string, state: string, report: FiscalPreview, closingJournals: string[], reopeningJournals: string[], reopenReason: string | null }[]
  }, storage)
  const { state } = fixture
  const root = '*/bff/api/finance/workspaces/:workspaceId'
  const ledger = root + '/ledger'
  const journals = ledger + '/journals'
  const reviewer = () => /^d7-(reviewer|delay)/.test(catalog.scenario())
  const maker = () => !reviewer()
  const subject = () => catalog.subject()
  const owns = (row: MemoJournal) => row.maker === subject()
  const byJournal = (id: unknown) => state.journals.find(row => row.journal.id === id)
  const view = (row: MemoJournal) => ({ ...row, isMaker: owns(row) })
  const findAccount = (id: unknown) => state.accounts.find(row => row.id === id)
  const open = (on: string) => state.periods.some(row => row.month === on.slice(0, 8) + '01' && row.state === 'open')
  const conflict = fixture.conflict
  const openingApplying = () => state.batches.some(row => row.state === 'applyingstock')
  const journalChange = (row: MemoJournal) => ({ id: row.journal.id, version: row.journal.version })
  function linesOf(input: unknown) {
    const parsed = draftSchema.safeParse(input)
    if (!parsed.success) return null
    const data = parsed.data
    if (compareDecimal(sumDecimals(data.lines.map(row => row.debit)), sumDecimals(data.lines.map(row => row.credit))) !== 0) return null
    const lines = data.lines.map((row) => {
      const existing = findAccount(row.accountId)
      return existing ? { ...row, code: existing.code, name: existing.name } : null
    })
    return lines.some(row => !row) ? null : { ...data, lines: lines.filter(row => row !== null) }
  }
  function start(kind: string, sourceNumber: string, input: NonNullable<ReturnType<typeof linesOf>>, importProvider?: string, externalId?: string) {
    const row: MemoJournal = { maker: subject(), lines: input.lines, journal: {
      id: crypto.randomUUID(), kind, sourceNumber, on: input.on, memo: input.memo, version: 1,
      state: 'draft', postingNumber: null, reversesId: null, importProvider, externalId
    } }
    state.journals.unshift(row)
    return row
  }
  function posted(row: MemoJournal) {
    row.journal.state = 'posted'
    row.journal.postingNumber = ++state.number
    for (const line of row.lines) {
      const account = findAccount(line.accountId)
      if (account) account.isUsed = true
    }
  }
  function gate(row: MemoJournal, decision: unknown) {
    if (decision === 'post') {
      if (!reviewer() || owns(row)) return fixture.forbidden()
      if (openingApplying()) return conflict('等待库存期初回执后再过账。')
      if (row.journal.state !== 'submitted' || !open(row.journal.on)) return conflict('凭证或期间状态阻止过账。')
    } else {
      if (!maker() || !owns(row)) return fixture.forbidden()
      if (!['draft', 'submitted'].includes(row.journal.state) || (decision === 'submit' && (row.journal.state !== 'draft' || !open(row.journal.on)))) return conflict('凭证或期间状态已变化。')
    }
    return null
  }
  function decide(row: MemoJournal, decision: unknown) {
    if (decision === 'post') posted(row)
    else row.journal.state = decision === 'submit' ? 'submitted' : 'cancelled'
    row.journal.version = Number(row.journal.version) + 1
    return journalChange(row)
  }
  function compileOpening(file: string) {
    const rows = file.trim().split(/\r?\n/).slice(1).flatMap((row, index) => {
      const [code, debit, credit] = row.split(',')
      const chart = state.accounts.find(item => item.code === code)
      return chart && debit && credit && /^\d+(\.\d+)?$/.test(debit) && /^\d+(\.\d+)?$/.test(credit)
        ? [{ row: index + 2, accountId: chart.id, code: chart.code, name: chart.name, debit, credit }]
        : []
    })
    const debit = sumDecimals(rows.map(row => row.debit)), credit = sumDecimals(rows.map(row => row.credit))
    return { rows, debit, credit, errors: !rows.length || compareDecimal(debit, credit) !== 0 ? [{ row: null, message: '期初行无效或借贷不平衡。' }] : [] }
  }
  function subRows(file: string) {
    return file.trim().split(/\r?\n/).slice(1).flatMap((line) => {
      const [kind, reference, resourceId, warehouseId, quantity, amount, dueOn] = line.split(',')
      return reference && amount && /^\d+(\.\d+)?$/.test(amount)
        ? [{
            id: crypto.randomUUID(), kind: kind ?? 'stock', reference, resourceId: resourceId || mockItemId, warehouseId: warehouseId || null,
            name: 'D7 模拟子账', quantity: quantity || '0', amount, dueOn: dueOn || null, accountId: seeds[3]!.id
          }]
        : []
    })
  }
  const batchView = (row: (typeof state.batches)[number]) => ({ ...row, isMaker: row.maker === subject() })
  function finishBatch(row: (typeof state.batches)[number]) {
    for (const entry of row.rows) {
      const document = start('opening-subledger', entry.reference, { on: row.on, memo: entry.name, lines: [{
        accountId: entry.accountId, code: seeds[3]!.code, name: seeds[3]!.name, debit: entry.amount, credit: '0'
      }, { accountId: row.equityAccountId, code: seeds[1]!.code, name: seeds[1]!.name, debit: '0', credit: entry.amount }] })
      posted(document)
      row.postings.push({ rowId: entry.id, journalId: document.journal.id, subledgerId: crypto.randomUUID() })
      const mismatched = catalog.scenario() === 'd7-reviewer-mismatch' && compareDecimal(entry.amount, '1') > 0
      row.checks.push({ rowId: entry.id, accountId: entry.accountId, imported: entry.amount,
        subledger: mismatched ? subtractDecimal(entry.amount, '1') : entry.amount, ledger: entry.amount, matched: !mismatched })
    }
    row.state = 'posted'
    row.version = Number(row.version) + 1
    fixture.save()
  }
  function yearPreview(anchor: number, equity: string): FiscalPreview {
    const openMonths = Array.from({ length: 12 }, (_, i) => `${anchor}-${String(i + 1).padStart(2, '0')}-01`)
      .filter(month => !state.periods.some(row => row.month === month && row.state === 'closed'))
    const lines = state.accounts.filter(row => ['income', 'expense'].includes(row.category)).map(row => ({
      accountId: row.id, code: row.code, name: row.name, balance: '0'
    }))
    return { period: { from: anchor + '-01-01', through: anchor + '-12-31' }, equityAccountId: equity, netProfit: '0',
      lines, openMonths, pendingDocuments: state.journals.filter(row => row.journal.state === 'submitted').length }
  }
  const readiness = () => ({ ready: !state.batches.some(row => row.state === 'applyingstock'), book: { exists: !!state.settings, currency: 'CNY', startsOn,
    opening: 'reviewed', lastPostingNumber: state.number }, checks: [], missingDocumentCount: 0, pendingCostCount: 0, missingDocuments: [], pendingCosts: [] })
  const book = () => ({ isPersonal: false, canInitialize: maker(), settings: state.settings, accounts: state.accounts })
  return [
    http.get(root + '/book', ({ params }) => fixture.read(params.workspaceId, book)),
    http.post(root + '/book', ({ params, request }) => fixture.write(params.workspaceId, request, (body) => {
      if (!maker()) return fixture.forbidden()
      if (state.settings) return conflict('账簿已创建。')
      state.settings = { baseCurrency: String(body.baseCurrency), startsOn: String(body.startsOn), fiscalYearStartMonth: Number(body.fiscalYearStartMonth), minorUnits: 2, template: 'CNY' }
      return book()
    })),
    http.get(root + '/chart', ({ params }) => fixture.read(params.workspaceId, () => ({
      revision: state.revision, canManage: maker(), canImport: maker(), canExport: true, accounts: state.accounts
    }))),
    http.get(root + '/chart/exports/:kind', ({ params }) => fixture.read(params.workspaceId, () => ({
      format: 'nexora.chart-structure.v1', template: 'CNY', accounts: params.kind === 'template' ? seeds : state.accounts, revision: state.revision
    }))),
    http.post(root + '/chart/accounts', ({ params, request }) => fixture.write(params.workspaceId, request, (body) => {
      if (!maker()) return fixture.forbidden()
      if (openingApplying()) return conflict('等待库存期初回执后再修改科目。')
      if (body.expectedRevision !== state.revision) return fixture.stale()
      const input = body.account as (typeof seeds)[number]
      const known = state.accounts.find(row => row.code === input.code)
      if (known) {
        if (known.version !== body.expectedVersion) return fixture.stale()
        if (known.isUsed && (known.category !== input.category || known.purpose !== input.purpose)) return conflict('使用中科目不能变更分类。')
        Object.assign(known, input, { version: known.version + 1 })
      } else state.accounts.push({ ...account(crypto.randomUUID(), input.code, input.name, input.category, input.purpose), parentCode: input.parentCode })
      return { revision: ++state.revision }
    })),
    http.post(root + '/chart/imports/preview', ({ params, request }) => fixture.write(params.workspaceId, request, (body) => {
      const data = typeof body.file === 'string' && body.format === 'nexora-json' ? parseAccounts(body.file) : []
      const errors = !data.length || data.some(row => body.mode === 'append' && state.accounts.some(item => item.code === row.code))
        || (body.mode === 'replace' && state.number > 0)
        ? [{ row: 1, message: '文件错误、编码重复或账簿已有凭证。' }]
        : []
      if (errors.length) return { previewId: null, revision: state.revision, fileHash: '', changes: [], errors }
      const id = crypto.randomUUID()
      state.previews.push({ id, revision: state.revision, expiresAtUtc: new Date(Date.now() + 300_000).toISOString(), imported: data, committedRevision: null })
      return { previewId: id, revision: state.revision, fileHash: id, errors, changes: data.map(row => ({ code: row.code, name: row.name, action: String(body.mode) })) }
    }, data => 'previewId' in data && data.previewId ? 201 : 200)),
    http.get(root + '/chart/imports/:id', ({ params }) => fixture.read(params.workspaceId, () => {
      const row = state.previews.find(value => value.id === params.id)
      if (!row) return fixture.missing()
      return { ...row, state: row.committedRevision ? 'committed' : catalog.scenario() === 'd7-expired' ? 'expired' : 'ready' }
    })),
    http.post(root + '/chart/imports/:id/commit', ({ params, request }) => fixture.write(params.workspaceId, request, () => {
      const row = state.previews.find(value => value.id === params.id)
      if (!row) return fixture.missing()
      if (row.committedRevision) return { revision: row.committedRevision }
      if (openingApplying()) return conflict('等待库存期初回执后再提交科目。')
      if (catalog.scenario() === 'd7-expired' || Date.parse(row.expiresAtUtc) < Date.now()) return conflict('预览已过期。')
      if (state.revision !== row.revision) return fixture.stale()
      for (const item of row.imported) {
        const known = state.accounts.find(account => account.code === item.code)
        if (known) Object.assign(known, { name: item.name, version: known.version + 1 })
        else state.accounts.push(item)
      }
      row.committedRevision = ++state.revision
      return { revision: state.revision }
    })),
    http.get(ledger, ({ params }) => fixture.read(params.workspaceId, () => ({
      currency: 'CNY', minorUnits: 2, startsOn, canDraft: maker(), canPost: reviewer(), canReverse: reviewer(), canManagePeriods: reviewer(),
      canConfigurePartnership: maker(), periods: state.periods
    }))),
    http.get(journals, ({ params, request }) => fixture.read(params.workspaceId, () => {
      const page = Number(new URL(request.url).searchParams.get('page') ?? 1)
      return state.journals.slice((page - 1) * 50, page * 50).map(row => row.journal)
    })),
    http.get(journals + '/:id', ({ params }) => fixture.read(params.workspaceId, () => {
      const row = byJournal(params.id)
      return row ? view(row) : fixture.missing()
    })),
    http.post(journals, ({ params, request }) => fixture.write(params.workspaceId, request, (body) => {
      if (!maker()) return fixture.forbidden()
      const input = linesOf(body.draft)
      if (!input || !open(input.on)) return conflict('凭证借贷或期间无效。')
      return journalChange(start('manual', String(body.sourceNumber || 'J-' + crypto.randomUUID().slice(0, 8)), input))
    }, 201)),
    http.post(journals + '/imported', ({ params, request }) => fixture.write(params.workspaceId, request, (body) => {
      if (!maker()) return fixture.forbidden()
      const input = linesOf(body.draft)
      if (!input || !open(input.on)) return conflict('凭证借贷或期间无效。')
      const prior = state.journals.find(row => row.journal.importProvider === body.provider && row.journal.externalId === body.externalId)
      if (prior) return conflict('该来源编号已有导入凭证。')
      return journalChange(start('imported', String(body.externalId), input, String(body.provider), String(body.externalId)))
    }, 201)),
    http.put(journals + '/:id', ({ params, request }) => fixture.write(params.workspaceId, request, (body) => {
      const row = byJournal(params.id)
      if (!row) return fixture.missing()
      if (!maker() || !owns(row)) return fixture.forbidden()
      if (row.journal.version !== body.expectedVersion) return fixture.stale()
      const draft = linesOf(body.draft)
      if (!draft || row.journal.state !== 'draft' || !open(draft.on)) return conflict('草稿状态已变化。')
      Object.assign(row.journal, { on: draft.on, memo: draft.memo, version: Number(row.journal.version) + 1 })
      row.lines = draft.lines
      return journalChange(row)
    })),
    http.post(journals + '/:id/decision', ({ params, request }) => fixture.write(params.workspaceId, request, (body) => {
      const row = byJournal(params.id)
      if (!row) return fixture.missing()
      if (row.journal.version !== body.expectedVersion) return fixture.stale()
      return gate(row, body.decision) ?? decide(row, body.decision)
    })),
    http.post(journals + '/imported/batch-decision', ({ params, request }) => fixture.write(params.workspaceId, request, (body) => {
      const parsed = z.array(changeSchema).min(1).max(50).safeParse(body.journals)
      if (!parsed.success) return conflict('请选择外部凭证。')
      const rows: MemoJournal[] = []
      for (const selected of parsed.data) {
        const row = byJournal(selected.id)
        if (!row || row.journal.kind !== 'imported') return fixture.missing()
        if (row.journal.version !== selected.version) return fixture.stale()
        const failure = gate(row, body.decision)
        if (failure) return failure
        rows.push(row)
      }
      return rows.map(row => decide(row, body.decision))
    })),
    http.post(journals + '/:id/reversal', ({ params, request }) => fixture.write(params.workspaceId, request, (body) => {
      if (!maker()) return fixture.forbidden()
      const original = byJournal(params.id)
      if (!original) return fixture.missing()
      if (original.journal.version !== body.expectedVersion) return fixture.stale()
      if (original.journal.state !== 'posted' || !['manual', 'imported'].includes(original.journal.kind)
        || !open(String(body.on)) || String(body.on) < original.journal.on || state.journals.some(row => row.journal.reversesId === original.journal.id))
        return conflict('凭证或期间状态不支持冲销。')
      const row = start('reversal', 'REV-' + original.journal.sourceNumber, {
        on: String(body.on), memo: String(body.reason), lines: original.lines.map(line => ({ ...line, debit: line.credit, credit: line.debit }))
      })
      row.journal.reversesId = original.journal.id
      return decide(row, 'submit')
    }, 201)),
    http.get(ledger + '/trial-balance/:through', ({ params }) => fixture.read(params.workspaceId, () => {
      const settled = state.journals.filter(row => row.journal.state === 'posted' && row.journal.on <= String(params.through)).flatMap(row => row.lines)
      const accounts = state.accounts.map((row) => {
        const lines = settled.filter(line => line.accountId === row.id)
        const debit = sumDecimals(lines.map(line => line.debit)), credit = sumDecimals(lines.map(line => line.credit))
        return { accountId: row.id, code: row.code, name: row.name, debit, credit, balance: subtractDecimal(debit, credit) }
      })
      return { through: params.through, currency: 'CNY', accounts, debit: sumDecimals(accounts.map(row => row.debit)), credit: sumDecimals(accounts.map(row => row.credit)) }
    })),
    http.get(ledger + '/links', ({ params, request }) => fixture.read(params.workspaceId, () => {
      const id = new URL(request.url).searchParams.get('journalId')
      return state.links.filter(row => !id || [row.fromJournalId, row.toJournalId].includes(id)).map((row) => {
        const from = byJournal(row.fromJournalId)!, to = byJournal(row.toJournalId)!
        return { ...row, fromSourceNumber: from.journal.sourceNumber, fromOn: from.journal.on, toSourceNumber: to.journal.sourceNumber, toOn: to.journal.on }
      })
    })),
    http.get(ledger + '/links/scan', ({ params }) => fixture.read(params.workspaceId, () => {
      const journal = state.journals[0]?.journal
      const issues = catalog.scenario() === 'd7-reviewer-mismatch' && journal
        ? [{ code: 'journal.reversal_missing_original', linkId: null, journalId: journal.id, message: '冲销凭证引用的原凭证不存在。' }]
        : []
      return { scannedAtUtc: new Date().toISOString(), linkCount: state.links.length, journalCount: state.journals.length, issues }
    })),
    http.post(ledger + '/links', ({ params, request }) => fixture.write(params.workspaceId, request, (body) => {
      if (!maker()) return fixture.forbidden()
      if (body.fromJournalId === body.toJournalId || !byJournal(body.fromJournalId) || !byJournal(body.toJournalId)) return conflict('请选择另一张凭证。')
      const row = { id: crypto.randomUUID(), fromJournalId: String(body.fromJournalId), toJournalId: String(body.toJournalId),
        kind: String(body.kind), memo: String(body.memo), version: 1 }
      state.links.unshift(row)
      return row
    })),
    http.post(ledger + '/links/:id/delete', ({ params, request }) => fixture.write(params.workspaceId, request, (body) => {
      if (!maker()) return fixture.forbidden()
      const index = state.links.findIndex(row => row.id === params.id), row = state.links[index]
      if (!row) return fixture.missing()
      if (row.version !== body.expectedVersion) return fixture.stale()
      state.links.splice(index, 1)
      return { id: row.id, version: row.version + 1 }
    })),
    http.post(ledger + '/opening-balances/preview', ({ params, request }) => fixture.write(params.workspaceId, request, (body) => {
      state.openingFile = String(body.file)
      state.openingProof = crypto.randomUUID()
      return { ...compileOpening(state.openingFile), chartRevision: state.revision, fileHash: state.openingProof, currency: 'CNY' }
    })),
    http.post(ledger + '/opening-balances/import', ({ params, request }) => fixture.write(params.workspaceId, request, (body) => {
      if (!maker()) return fixture.forbidden()
      if (body.chartRevision !== state.revision) return fixture.stale()
      if (state.journals.some(row => row.journal.kind === 'opening') || state.number > 0 || body.fileHash !== state.openingProof || body.file !== state.openingFile) return conflict('期初文件已变化或已导入。')
      const preview = compileOpening(state.openingFile)
      if (preview.errors.length) return conflict('期初文件无效。')
      return journalChange(start('opening', 'OPENING', { lines: preview.rows, on: String(body.on), memo: String(body.memo) }))
    }, 201)),
    http.post(ledger + '/opening-subledgers/preview', ({ params, request }) => fixture.write(params.workspaceId, request, (body) => {
      state.subFile = String(body.file)
      state.subProof = crypto.randomUUID()
      const rows = subRows(state.subFile)
      return { rows, errors: rows.length ? [] : [{ row: 1, message: '请填写有效的子账行。' }], fileHash: state.subProof, chartRevision: state.revision, on: startsOn, currency: 'CNY' }
    })),
    http.get(ledger + '/opening-subledgers', ({ params }) => fixture.read(params.workspaceId, () => state.batches.map(batchView))),
    http.get(root + '/trade/banks/:id/movements', ({ params }) => fixture.read(params.workspaceId, () => state.batches.flatMap(batch =>
      batch.rows.filter(row => row.kind === 'bank' && row.resourceId === params.id).flatMap(row =>
        batch.postings.filter(post => post.rowId === row.id && post.journalId).map(post => ({ id: post.subledgerId, bankId: row.resourceId,
          documentId: row.id, journalId: post.journalId, on: batch.on, amount: row.amount, matched: '0', voided: false })))))),
    http.post(ledger + '/opening-subledgers', ({ params, request }) => fixture.write(params.workspaceId, request, (body) => {
      if (!maker()) return fixture.forbidden()
      if (state.revision !== body.chartRevision) return fixture.stale()
      if (state.batches.some(row => !['rejected', 'cancelled'].includes(row.state)) || state.subFile !== body.file || state.subProof !== body.fileHash)
        return conflict('已有期初批次或文件已变化。')
      const change = { id: crypto.randomUUID(), state: 'submitted', version: 1, on: startsOn, currency: 'CNY', fileHash: state.subProof,
        equityAccountId: String(body.equityAccountId), rows: subRows(state.subFile), maker: subject(), checks: [], postings: [], isMaker: true }
      state.batches.unshift(change)
      return batchView(change)
    }, 201)),
    http.get(ledger + '/opening-subledgers/:id', ({ params }) => fixture.read(params.workspaceId, () => {
      const row = state.batches.find(value => value.id === params.id)
      if (!row) return fixture.missing()
      if (row.state === 'applyingstock' && !catalog.scenario().endsWith('-delay')) finishBatch(row)
      return batchView(row)
    })),
    http.post(ledger + '/opening-subledgers/:id/decision', ({ params, request }) => fixture.write(params.workspaceId, request, (body) => {
      const row = state.batches.find(value => value.id === params.id)
      if (!row) return fixture.missing()
      if (row.version !== body.expectedVersion) return fixture.stale()
      if (row.state !== 'submitted') return conflict('批次状态已变化。')
      if (body.decision === 'approve' ? !reviewer() || row.maker === subject() : !maker() || row.maker !== subject()) return fixture.forbidden()
      row.state = body.decision === 'approve' ? 'applyingstock' : 'cancelled'
      row.version = Number(row.version) + 1
      return batchView(row)
    })),
    http.get(root + '/readiness', ({ params }) => fixture.read(params.workspaceId, readiness)),
    http.post(root + '/readiness/backfill', ({ params, request }) => fixture.write(params.workspaceId, request, () =>
      reviewer() ? { posted: [], blocked: [], replayed: false, readiness: readiness() } : fixture.forbidden())),
    http.get(ledger + '/periods/:month', ({ params }) => fixture.read(params.workspaceId, () => {
      const period = state.periods.find(row => row.month === params.month)
      if (!period) return fixture.missing()
      const rows = state.journals.filter(row => row.journal.on.slice(0, 7) === period.month.slice(0, 7))
      return { period, check: { watermark: state.number, postedCount: rows.filter(row => row.journal.state === 'posted').length,
        pendingCount: rows.filter(row => row.journal.state === 'submitted').length, debit: '0', credit: '0' },
      history: state.history.filter(row => row.month === period.month) }
    })),
    http.post(ledger + '/periods/:month', ({ params, request }) => fixture.write(params.workspaceId, request, (body) => {
      if (!reviewer()) return fixture.forbidden()
      if (state.batches.some(row => row.state === 'applyingstock')) return conflict('等待库存应用完成。')
      const month = String(params.month)
      let row = state.periods.find(value => value.month === month)
      if ((row?.version ?? 0) !== body.expectedVersion) return fixture.stale()
      const pending = state.journals.some(value => value.journal.state === 'submitted' && value.journal.on.slice(0, 7) === month.slice(0, 7))
      if (!row && body.action === 'open') {
        row = { month, version: 1, state: 'open', closingWatermark: null }
        state.periods.push(row)
      } else if (row && body.action === 'begin-close' && row.state === 'open') {
        row.state = 'closing'
        row.closingWatermark = state.number
        row.version++
      } else if (row && body.action === 'close' && row.state === 'closing' && !pending) {
        row.state = 'closed'
        row.version++
      } else if (row && body.action === 'reopen' && row.state !== 'open') {
        row.state = 'open'
        row.closingWatermark = null
        row.version++
      } else return conflict('期间状态或待处理单据阻断操作。')
      state.history.unshift({ id: crypto.randomUUID(), month, version: row.version, state: row.state, reason: String(body.reason), occurredAtUtc: new Date().toISOString(), watermark: row.closingWatermark })
      return { month, version: row.version }
    })),
    http.get(ledger + '/fiscal-years', ({ params }) => fixture.read(params.workspaceId, () => state.years)),
    http.get(ledger + '/fiscal-years/preview', ({ params, request }) => fixture.read(params.workspaceId, () => {
      const input = new URL(request.url).searchParams
      return yearPreview(Number(input.get('year')), String(input.get('equityAccountId')))
    })),
    http.post(ledger + '/fiscal-years', ({ params, request }) => fixture.write(params.workspaceId, request, (body) => {
      if (!maker()) return fixture.forbidden()
      const anchor = Number(body.year), report = yearPreview(anchor, String(body.equityAccountId))
      if (report.openMonths.length || report.pendingDocuments) return conflict('还有未关账月份或待复核单据。')
      const row = { id: crypto.randomUUID(), version: 1, maker: subject(), anchor, report, state: 'pending', closingJournals: [], reopeningJournals: [], reopenReason: null }
      state.years.push(row)
      return row
    })),
    http.post(ledger + '/fiscal-years/:id/decision', ({ params, request }) => fixture.write(params.workspaceId, request, (body) => {
      const row = state.years.find(value => value.id === params.id)
      if (!row) return fixture.missing()
      if (row.version !== body.expectedVersion) return fixture.stale()
      if (body.decision === 'cancel' ? !maker() || row.maker !== subject() : !reviewer() || row.maker === subject()) return fixture.forbidden()
      row.state = body.decision === 'close' ? 'closed' : body.decision === 'reopen' ? 'reopened' : 'cancelled'
      row.version++
      return row
    })),
    http.get(ledger + '/partnerships/:year', ({ params }) => fixture.read(params.workspaceId,
      () => state.partnerships.find(row => row.year === Number(params.year)) ?? { year: Number(params.year), version: 0, partners: [] })),
    http.put(ledger + '/partnerships/:year', ({ params, request }) => fixture.write(params.workspaceId, request, (body) => {
      if (!maker()) return fixture.forbidden()
      const year = Number(params.year), previous = state.partnerships.find(row => row.year === year)
      if ((previous?.version ?? 0) !== body.expectedVersion) return fixture.stale()
      const value = z.array(partnerCapitalSchema).min(2).max(40).safeParse(body.partners)
      if (!value.success || compareDecimal(sumDecimals(value.data.map(row => row.share)), '1') !== 0) return conflict('分摊合计必须为 1。')
      const change = { year, version: (previous?.version ?? 0) + 1, partners: value.data }
      if (previous) Object.assign(previous, change)
      else state.partnerships.push(change)
      return change
    }))
  ]
}

function parseAccounts(file: string) {
  const item = z.object({ code: z.string().min(1), name: z.string().min(1), category: z.enum(['asset', 'liability', 'equity', 'income', 'expense']), purpose: z.string().optional() })
  try {
    const input = z.object({ accounts: z.array(item) }).safeParse(JSON.parse(file))
    return input.success ? input.data.accounts.map(row => account(crypto.randomUUID(), row.code, row.name, row.category, row.purpose)) : []
  } catch { return [] }
}

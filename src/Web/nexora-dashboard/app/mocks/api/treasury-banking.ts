import { http, HttpResponse } from 'msw/http'
import { z } from 'zod'
import { compareDecimal, subtractDecimal, sumDecimals } from '../../../shared/utils/decimal'
import type { BankCsvPreview, ReconciliationReport, StatementLine } from '../../../shared/types/treasury'
import type { BankMovement } from '../../../shared/types/trade'
import { csvColumns } from '../../utils/finance/csv-columns'
import { d8BookOn, d8Invalid, mockPage, negative, remainder, type D8Fixture } from './treasury'

const csvInput = z.object({ bankId: z.uuid(), file: z.string().min(1).max(262144),
  mapping: z.object({ externalId: z.string(), date: z.string(), amount: z.string(), description: z.string() }) })
const isoDate = z.iso.date()
const balance = z.string().regex(/^-?\d{1,13}(?:\.\d{1,2})?$/)
const reportInput = z.object({ through: isoDate, statementBalance: balance })
const reasonInput = z.string().trim().min(1).max(300)
const positive = (amount: string) => compareDecimal(amount, '0') > 0
function sameContent(a: Pick<StatementLine, 'on' | 'description' | 'amount'>, b: typeof a) {
  return a.on === b.on && a.description === b.description && compareDecimal(a.amount, b.amount) === 0
}
function parseCsv(input: z.infer<typeof csvInput>, existing: StatementLine[]): BankCsvPreview {
  const [head = '', ...lines] = input.file.split(/\r?\n/)
  const headers = csvColumns(head)
  const indices = Object.values(input.mapping).map(field => headers.indexOf(field))
  const result: BankCsvPreview = { previewId: null, fileHash: 'MSW', rows: [], errors: [], skipped: [] }
  if (headers.length < 4 || indices.some(index => index < 0) || new Set(indices).size !== 4) {
    result.errors.push({ row: 1, message: 'CSV 需要四个不同的映射列。' })
    return result
  }
  const seen = new Set<string>()
  lines.forEach((text, index) => {
    if (!text.trim()) return
    const row = index + 2
    const fields = csvColumns(text)
    const [externalId = '', on = '', raw = '', description = ''] = indices.map(column => fields[column])
    const amount = raw.replace(/^\+/, '')
    if (fields.length !== headers.length || !externalId || externalId.length > 120 || description.length > 300
      || !isoDate.safeParse(on).success || on < d8BookOn || !balance.safeParse(amount).success || compareDecimal(amount, '0') === 0) {
      result.errors.push({ row, message: '流水号、日期、有符号金额或摘要无效。' })
      return
    }
    if (seen.has(externalId)) {
      result.errors.push({ row, message: '文件内存在重复外部流水号。' })
      return
    }
    seen.add(externalId)
    const entry = { row, externalId, on, amount, description }
    const prior = existing.find(line => line.externalId === externalId)
    if (prior && !sameContent(prior, entry)) result.errors.push({ row, message: '已存在同流水号不同内容。' })
    result.rows.push({ entry, duplicate: !!prior })
  })
  if (!result.rows.length && !result.errors.length) result.errors.push({ row: 1, message: 'CSV 没有对账单行。' })
  return result
}
function statementReport(f: D8Fixture, bank: string, input: z.infer<typeof reportInput>): ReconciliationReport {
  const { through, statementBalance } = input
  const movements = f.state.movements.filter(item => item.bankId === bank && item.on <= through)
  const statement = f.state.lines.filter(item => item.bankId === bank && item.on <= through && !item.excluded)
  const matches = f.state.matches.filter(item => !item.reversed
    && movements.some(movement => movement.id === item.movementId) && statement.some(line => line.id === item.statementLineId))
  function net<T extends { id: string, on: string, amount: string }>(row: T, by: 'movementId' | 'statementLineId') {
    const allocated = sumDecimals(matches.filter(match => match[by] === row.id).map(match => match.amount))
    return sumDecimals([row.amount, positive(row.amount) ? negative(allocated) : allocated])
  }
  const books = movements.filter(item => f.getDoc(item.documentId)?.terms.kind !== 8)
    .map(item => ({ id: item.id, on: item.on, reference: '', journalId: item.journalId, amount: net(item, 'movementId') }))
    .filter(item => compareDecimal(item.amount, '0') !== 0)
  const lines = statement.map(item => ({ id: item.id, on: item.on, reference: item.externalId, journalId: null, amount: net(item, 'statementLineId') }))
    .filter(item => compareDecimal(item.amount, '0') !== 0)
  const bookBalance = sumDecimals(movements.map(item => item.amount))
  const outstandingBooks = sumDecimals(books.map(item => item.amount))
  const outstandingStatement = sumDecimals(lines.map(item => item.amount))
  const adjustedStatement = subtractDecimal(sumDecimals([statementBalance, outstandingBooks]), outstandingStatement)
  return { through, statementBalance, bookBalance, outstandingBooks, outstandingStatement, adjustedStatement, difference: subtractDecimal(adjustedStatement, bookBalance),
    ledgerDifference: '0', books, statement: lines, matches: matches.map(item => item.id) }
}

export function mockPdf(kind: string, lines: string[]) {
  const content = [kind + ' - MSW fixture', ...lines].map((line) => {
    const escaped = line.replace(/[^\x20-\x7e]/g, '?').replace(/[\\()]/g, '\\$&')
    return '(' + escaped + ') Tj'
  }).join('\n0 -20 Td\n')
  const stream = 'BT\n/F1 12 Tf\n50 785 Td\n' + content + '\nET\n'
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    '<< /Length ' + stream.length + ' >>\nstream\n' + stream + 'endstream'
  ]
  let pdf = '%PDF-1.4\n'
  const offsets = objects.map((value, index) => {
    const offset = String(pdf.length).padStart(10, '0')
    pdf += (index + 1) + ' 0 obj\n' + value + '\nendobj\n'
    return offset + ' 00000 n \n'
  })
  const xref = pdf.length
  pdf += 'xref\n0 6\n0000000000 65535 f \n' + offsets.join('') + 'trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF\n'
  return new HttpResponse(pdf, {
    headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': 'attachment; filename="' + kind + '.pdf"' }
  })
}

export function createStatementHandlers(f: D8Fixture, root: string) {
  const { state, read, write } = f
  const account = root + '/banks/:bank'
  const statements = root + '/statement/:line'
  const records = account + '/reconciliations'
  const list = (bank: unknown) => state.reconciliations.filter(row => row.bankId === bank).slice().reverse()
  const view = ({ maker: _maker, ...value }: D8Fixture['state']['reconciliations'][number]) => value
  const previewOf = (id: unknown) => state.previews.find(value => value.id === id && value.maker === f.catalog.subject())
  const line = (id: unknown) => state.lines.find(row => row.id === id)
  const mayEdit = (row: StatementLine, movement?: BankMovement) =>
    (movement && movement.on > row.on ? movement.on : row.on) > f.cutoff(row.bankId)
  return [
    http.post(root + '/imports/preview', ({ params, request }) => write(params.workspaceId, request, (body) => {
      if (!f.submitter()) return f.forbidden()
      const input = csvInput.safeParse(body)
      if (!input.success) return d8Invalid('CSV 内容或列映射无效。')
      if (!f.getBank(input.data.bankId)) return f.missing()
      const result = parseCsv(input.data, state.lines.filter(row => row.bankId === input.data.bankId))
      if (!result.errors.length && result.rows.length) {
        result.previewId = crypto.randomUUID()
        state.previews.push({ id: result.previewId, bankId: input.data.bankId, maker: f.catalog.subject(), rows: result.rows,
          committedCount: null, expiresAtUtc: new Date(Date.now() + (f.catalog.scenario().includes('expired') ? -1000 : 1_200_000)).toISOString() })
      }
      return result
    }, data => 'previewId' in data && data.previewId ? 201 : 200)),
    http.get(root + '/imports/:id', ({ params }) => read(params.workspaceId, () => {
      const value = previewOf(params.id)
      if (!value) return f.missing()
      return { id: value.id, bankId: value.bankId, expiresAtUtc: value.expiresAtUtc, committedCount: value.committedCount,
        state: value.committedCount !== null ? 'committed' : Date.parse(value.expiresAtUtc) <= Date.now() ? 'expired' : 'ready' }
    })),
    http.post(root + '/imports/:id/commit', async ({ params, request }) => {
      const mayLoseResponse = previewOf(params.id)?.committedCount === null && f.catalog.scenario() === 'd8-import-unknown'
      const response = await write(params.workspaceId, request, () => {
        if (!f.submitter()) return f.forbidden()
        const current = previewOf(params.id)
        if (!current) return f.missing()
        if (current.committedCount !== null) return { id: current.id, count: current.committedCount }
        if (Date.parse(current.expiresAtUtc) <= Date.now()) return f.conflict('导入预览已过期。')
        const existing = state.lines.filter(row => row.bankId === current.bankId)
        const insert = []
        for (const { entry } of current.rows) {
          const prior = existing.find(row => row.externalId === entry.externalId)
          if (prior && !sameContent(prior, entry)) return f.conflict('预览后已存在不同内容。')
          if (prior) continue
          if (entry.on <= f.cutoff(current.bankId)) return f.conflict('该日期的银行对账已完成。')
          insert.push({ ...entry, id: crypto.randomUUID(), bankId: current.bankId, batchId: current.id, matched: '0', version: 1, excluded: false })
        }
        state.lines.push(...insert)
        current.committedCount = insert.length
        return { id: current.id, count: insert.length }
      })
      return mayLoseResponse && response?.ok ? HttpResponse.error() : response
    }),
    http.get(account + '/statement', ({ params, request }) => read(params.workspaceId, () =>
      f.getBank(params.bank) ? mockPage(state.lines.filter(value => value.bankId === params.bank), request) : f.missing())),
    http.get(statements + '/matches', ({ params }) => read(params.workspaceId, () =>
      line(params.line) ? state.matches.filter(match => match.statementLineId === params.line) : f.missing())),
    http.post(statements + '/matches', ({ params, request }) => write(params.workspaceId, request, (body) => {
      if (!f.reviewer()) return f.forbidden()
      const row = line(params.line), movement = state.movements.find(row => row.id === body.movementId)
      if (!row || !movement || movement.bankId !== row.bankId) return f.missing()
      if (String(body.expectedVersion) !== String(row.version)) return f.stale()
      const amount = balance.safeParse(body.amount)
      if (!amount.success || !positive(amount.data)) return d8Invalid('匹配金额必须为正数。')
      if (!mayEdit(row, movement) || movement.voided || row.excluded || positive(row.amount) !== positive(movement.amount)
        || [row, movement].some(value => compareDecimal(amount.data, remainder(value)) > 0)) return f.conflict('匹配日期、方向或剩余金额不符。')
      const match = { id: crypto.randomUUID(), statementLineId: row.id, movementId: movement.id,
        referenceId: String(body.operationId), amount: amount.data, reversed: false }
      state.matches.push(match)
      row.matched = sumDecimals([row.matched, amount.data])
      movement.matched = sumDecimals([movement.matched, amount.data])
      return { id: match.id, version: ++row.version }
    })),
    http.post(root + '/matches/:id/release', ({ params, request }) => write(params.workspaceId, request, (body) => {
      if (!f.reviewer()) return f.forbidden()
      if (!reasonInput.safeParse(body.reason).success) return d8Invalid('请输入解除原因。')
      const match = state.matches.find(value => value.id === params.id)
      const row = line(match?.statementLineId), movement = state.movements.find(value => value.id === match?.movementId)
      if (!match || !row || !movement) return f.missing()
      if (match.reversed || !mayEdit(row, movement)) return f.conflict('匹配记录已解除或对账锁定。')
      match.reversed = true
      row.matched = subtractDecimal(row.matched, match.amount)
      movement.matched = subtractDecimal(movement.matched, match.amount)
      return { id: match.id, version: ++row.version }
    })),
    http.post(statements + '/exclude', ({ params, request }) => write(params.workspaceId, request, (body) => {
      if (!f.reviewer()) return f.forbidden()
      if (typeof body.exclude !== 'boolean' || !reasonInput.safeParse(body.reason).success) return d8Invalid('请输入排除或恢复原因。')
      const row = line(params.line)
      if (!row) return f.missing()
      if (String(body.expectedVersion) !== String(row.version)) return f.stale()
      if (!mayEdit(row) || positive(row.matched)) return f.conflict('请先解除匹配，已完成对账的记录不能修改。')
      if (row.excluded !== body.exclude) { row.excluded = body.exclude; row.version++ }
      return { id: row.id, version: row.version }
    })),
    http.get(records, ({ params }) => read(params.workspaceId, () => f.getBank(params.bank) ? list(params.bank).map(view) : f.missing())),
    http.post(records + '/preview', ({ params, request }) => write(params.workspaceId, request, (body) => {
      const bank = f.getBank(params.bank), input = reportInput.safeParse(body)
      if (!bank) return f.missing()
      return input.success ? statementReport(f, bank.id, input.data) : d8Invalid('请输入有效的日期和期末余额。')
    })),
    http.post(records, ({ params, request }) => write(params.workspaceId, request, (body) => {
      if (!f.submitter()) return f.forbidden()
      const bank = f.getBank(params.bank), input = reportInput.safeParse(body)
      if (!bank) return f.missing()
      if (!input.success) return d8Invalid('请输入有效的日期和期末余额。')
      if (input.data.through <= f.cutoff(bank.id)) return f.conflict('截止日期须晚于最近一次对账。')
      const row = { id: crypto.randomUUID(), bankId: bank.id, maker: f.catalog.subject(), state: 'pending' as const, version: 1,
        report: statementReport(f, bank.id, input.data), undoReason: null }
      state.reconciliations.push(row)
      return view(row)
    })),
    http.post(root + '/reconciliations/:id/decision', ({ params, request }) => write(params.workspaceId, request, (body) => {
      const row = state.reconciliations.find(value => value.id === params.id)
      if (!row) return f.missing()
      if (String(row.version) !== String(body.expectedVersion)) return f.stale()
      if (body.decision === 'cancel') {
        if (row.maker !== f.catalog.subject()) return f.forbidden()
        if (row.state !== 'pending') return f.conflict('只能取消待复核记录。')
        row.state = 'cancelled'
      } else {
        if (!f.reviewer()) return f.forbidden()
        if (body.decision === 'finish') {
          if (row.maker === f.catalog.subject()) return f.forbidden()
          if (row.state !== 'pending' || row.report.through <= f.cutoff(row.bankId)) return f.conflict('当前截止日期已完成对账。')
          if (JSON.stringify(row.report) !== JSON.stringify(statementReport(f, row.bankId, row.report))
            || compareDecimal(row.report.difference, '0') !== 0) return f.conflict('对账证据已变化或存在差额。')
          row.state = 'completed'
        } else if (body.decision === 'undo') {
          const reason = reasonInput.safeParse(body.reason)
          if (!reason.success) return d8Invalid('请输入撤销原因。')
          if (row.state !== 'completed' || row.report.through !== f.cutoff(row.bankId)) return f.conflict('只能撤销最新已完成的对账。')
          row.state = 'undone'
          row.undoReason = reason.data
        } else return d8Invalid('无效的对账操作。')
      }
      row.version++
      return view(row)
    })),
    http.get(root + '/reconciliations/:id/pdf', ({ params }) => read(params.workspaceId, () => {
      const row = state.reconciliations.find(value => value.id === params.id && ['completed', 'undone'].includes(value.state))
      if (!row) return f.missing()
      const { report } = row
      return mockPdf('reconciliation', [row.id, 'Cutoff: ' + report.through, 'Book: ' + report.bookBalance,
        'Statement: ' + report.statementBalance, 'Adjusted: ' + report.adjustedStatement, 'Difference: ' + report.difference])
    }))
  ]
}

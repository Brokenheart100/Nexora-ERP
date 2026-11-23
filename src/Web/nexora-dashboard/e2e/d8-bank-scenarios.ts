import { expect, type Page } from '@playwright/test'
import { changeBusiness, chooseOption, readBusiness, requestBusiness, uiChange } from './business-actions'
import { financePage, saveAccount } from './d7-accounting-scenarios'
import type { BankMovement, TradeDocument } from '../shared/types/trade'
import type { WireBank } from '../shared/types/prerequisites'
import type { BankCsvPreview, Reconciliation, ReconciliationReport, StatementLine } from '../shared/types/treasury'
import { compareDecimal } from '../shared/utils/decimal'

export const bankOn = '2026-01-08'
const secondOn = '2026-01-09'
const activityOn = '2026-01-10'
export const financeRoot = (workspace: string) => '/bff/api/finance/workspaces/' + workspace
const bankQuery = (bank: string) => '&bank=' + bank

export function amountIs(actual: string, expected: string) {
  expect(compareDecimal(actual, expected), actual + ' vs ' + expected).toBe(0)
}
export async function createBank(maker: Page, workspace: string, code: string, name: string, kind = 'bank') {
  const bankPath = financeRoot(workspace) + '/trade/banks'
  const account = await saveAccount(maker, financeRoot(workspace), { code: code + '-CTL', name: name + '控制科目', category: 'asset', purpose: 'control' })
  await maker.goto(financePage(workspace, 'treasury'))
  await maker.getByTestId('treasury-account-create').click()
  if (kind === 'cash') await chooseOption(maker, 'treasury-account-kind', '现金账户')
  await chooseOption(maker, 'treasury-account-ledger', account.code + ' · ' + account.name)
  await maker.getByTestId('treasury-account-name').fill(name)
  await maker.getByTestId('treasury-account-no').fill(code)
  const bank = await uiChange(maker, bankPath, () => maker.getByTestId('treasury-account-save').click(), 201)
  await expect(maker.getByTestId('treasury-account-' + bank.id)).toContainText(code)
  const detail = await readBusiness<WireBank>(maker, bankPath + '/' + bank.id)
  expect(detail).toMatchObject({ name, code, kind, accountId: account.id })
  amountIs(detail.balance, '0')
  return detail
}

export async function postTrade(maker: Page, reviewer: Page, workspace: string, terms: object) {
  const docs = financeRoot(workspace) + '/trade/documents'
  const document = await changeBusiness(maker, docs, { terms }, 201)
  await changeBusiness(reviewer, docs + '/' + document.id + '/decision', { decision: 'approve', expectedVersion: document.version })
  return readBusiness<TradeDocument>(reviewer, docs + '/' + document.id)
}

export async function verifyBanking(maker: Page, reviewer: Page, workspace: string, tag: string, bank: WireBank, cash: WireBank) {
  const finance = financeRoot(workspace)
  const trade = finance + '/trade'
  const docPath = trade + '/documents'
  const cashPath = trade + '/banks/' + cash.id
  const bankPath = trade + '/banks/' + bank.id
  const activeDefault = (await readBusiness<WireBank[]>(maker, trade + '/banks')).find(row => row.isDefault)
  const code = (key: string) => 'D8-' + key + '-' + tag
  const income = await saveAccount(maker, finance, { code: code('INC'), name: 'D8 其他收入', category: 'income' })
  const expense = await saveAccount(maker, finance, { code: code('EXP'), name: 'D8 费用', category: 'expense' })
  const equity = await saveAccount(maker, finance, { code: code('EQ'), name: 'D8 业主权益', category: 'equity' })
  const treasury = financePage(workspace, 'treasury', bankQuery(bank.id))
  const reconciliation = financePage(workspace, 'bank', bankQuery(bank.id))
  const field = (id: string) => maker.getByTestId(id)
  const review = (id: string) => reviewer.getByTestId(id)
  const posting = (bankId: string, amount: string) => postTrade(maker, reviewer, workspace,
    { kind: 8, on: '2026-01-01', bankId, counterAccountId: equity.id, number: code(bankId === bank.id ? 'INIT' : 'CASH-INIT'), memo: 'D8 联调期初', amount, quantity: '0' })
  const decide = async (id: string) => {
    await reviewer.goto(treasury)
    const row = review('treasury-flow-approve-' + id)
    await uiChange(reviewer, docPath + '/' + id + '/decision', () => row.click())
    await expect(row).toHaveCount(0)
    return readBusiness<TradeDocument>(reviewer, docPath + '/' + id)
  }
  const makeFlow = async (type: string, suffix: string, value: string, on: string, counter?: typeof equity, other?: WireBank) => {
    await maker.goto(treasury)
    await field('treasury-flow-create').click()
    await chooseOption(maker, 'treasury-flow-type', type)
    await field('treasury-flow-number').fill(code(suffix))
    await field('treasury-flow-date').fill(on)
    await field('treasury-flow-amount').fill(value)
    await field('treasury-flow-summary').fill('D8 ' + suffix)
    if (counter) await chooseOption(maker, 'treasury-flow-counter', counter.code + ' · ' + counter.name)
    if (other) await chooseOption(maker, 'treasury-flow-target', other.code + ' · ' + other.name)
    const doc = await uiChange(maker, docPath, () => field('treasury-flow-save').click(), 201)
    await expect(field('treasury-flow-approve-' + doc.id)).toHaveCount(0)
    return decide(doc.id)
  }
  try {
    await maker.goto(treasury)
    await uiChange(maker, bankPath + '/default', () => field('treasury-account-default-' + bank.id).click())
    await expect(field('treasury-account-' + bank.id)).toContainText('默认')
    expect((await readBusiness<WireBank>(maker, bankPath)).isDefault).toBe(true)
    await posting(bank.id, '1000')
    await posting(cash.id, '1600')
    const first = await makeFlow('其他收入', 'INC300', '300', bankOn, income)
    const second = await makeFlow('其他收入', 'INC200', '200', bankOn, income)

    await maker.goto(reconciliation)
    const headers = 'Ref,Day,Value,Memo\n'
    await field('treasury-import-csv').fill(headers + 'broken,wrong-date,7,Bad row')
    const invalid = await uiChange<BankCsvPreview>(maker, trade + '/imports/preview', () => field('treasury-import-preview-request').click())
    expect(invalid.previewId).toBeNull()
    expect(invalid.errors).toEqual([expect.objectContaining({ row: 2 })])
    await expect(field('treasury-import-preview')).toContainText('第 2 行')
    const skipCsv = [
      'activity_id,created_on,currency,status,direction,amount,description',
      'pending,2026-01-08T08:00:00Z,CNY,pending,in,2,Pending approval',
      'exchange,2026-01-08T08:00:00Z,CNY,completed,internal,5,Internal conversion',
      'foreign,2026-01-08T08:00:00Z,USD,completed,in,9,Other currency'
    ].join('\n')
    await field('treasury-import-csv').fill(skipCsv)
    const skipped = await uiChange<BankCsvPreview>(maker, trade + '/imports/preview', () => field('treasury-import-preview-request').click())
    expect(skipped.skipped?.map(row => row.row)).toEqual([2, 3, 4])
    await expect(field('treasury-import-preview')).toContainText('第 4 行 · 已跳过')
    const csv = headers + [
      ['split', bankOn, '500', '"split, two matches"'].join(','),
      ['expense', bankOn, '-200', 'Expense for statement'].join(','),
      ['ignore', bankOn, '17', 'To exclude'].join(',')
    ].join('\n')
    const previewCsv = async (content: string) => {
      await field('treasury-import-csv').fill(content)
      return uiChange<BankCsvPreview>(maker, trade + '/imports/preview', () => field('treasury-import-preview-request').click(), 201)
    }
    const preview = await previewCsv(csv)
    const imported = await uiChange<{ count: number }>(maker, trade + '/imports/' + preview.previewId + '/commit', () => field('treasury-import-submit').click())
    expect(imported.count).toBe(3)
    await maker.reload()
    await expect(field('treasury-import-id')).toHaveValue(preview.previewId!)
    await expect(field('treasury-import-status')).toContainText('已导入 3 行')
    const duplicate = await previewCsv(csv)
    expect(duplicate.rows.every(row => row.duplicate)).toBe(true)
    await expect(field('treasury-import-preview')).toContainText('重复 · 跳过')
    const repeated = await uiChange<{ count: number }>(maker, trade + '/imports/' + duplicate.previewId + '/commit', () => field('treasury-import-submit').click())
    expect(repeated.count).toBe(0)
    const lines = () => readBusiness<StatementLine[]>(maker, bankPath + '/statement')
    const lookup = async (key: string) => (await lines()).find(row => row.externalId === key)!
    const split = await lookup('split')
    const outgoing = await lookup('expense')
    const ignored = await lookup('ignore')

    await field('treasury-statement-open-' + split.id).click()
    await maker.getByRole('button', { name: '带入其他收入' }).click()
    await expect(field('treasury-flow-statement-source')).toContainText('split')
    await expect(field('treasury-flow-amount')).toHaveValue(/500/)
    await maker.getByRole('dialog').getByRole('button', { name: '取消', exact: true }).click()
    await field('treasury-statement-open-' + outgoing.id).click()
    await maker.getByRole('button', { name: '带入供应商付款' }).click()
    await expect(field('treasury-flow-bill')).toBeVisible()
    await maker.getByRole('dialog').getByRole('button', { name: '取消', exact: true }).click()
    await maker.getByRole('button', { name: '带入费用' }).click()
    await expect(field('treasury-flow-date')).toHaveValue(bankOn)
    await field('treasury-flow-number').fill(code('AUTO-EXP'))
    await chooseOption(maker, 'treasury-flow-counter', expense.code + ' · ' + expense.name)
    const spend = await uiChange(maker, docPath, () => field('treasury-flow-save').click(), 201)
    const spent = await decide(spend.id)
    expect(spent.terms.statementLineId).toBe(outgoing.id)
    amountIs((await lookup('expense')).matched, '200')

    const bankMoves = () => readBusiness<BankMovement[]>(reviewer, bankPath + '/movements')
    const movements = await bankMoves()
    const in300 = movements.find(row => row.documentId === first.id)!
    const in200 = movements.find(row => row.documentId === second.id)!
    const matches = trade + '/statement/' + split.id + '/matches'
    await reviewer.goto(reconciliation)
    await review('treasury-statement-open-' + split.id).click()
    const match = async (movement: BankMovement, amount: string) => {
      await chooseOption(reviewer, 'treasury-statement-flow-' + split.id, new RegExp(movement.id))
      await review('treasury-statement-amount-' + split.id).fill(amount)
      return uiChange(reviewer, matches, () => review('treasury-statement-match-' + split.id).click())
    }
    const firstMatch = await match(in300, '300')
    await expect(review('treasury-statement-row-' + split.id)).toContainText('剩余 200.00')
    const stale = await requestBusiness(reviewer, matches, { movementId: in200.id, expectedVersion: split.version, amount: '200' })
    expect([409, 412]).toContain(stale.status)
    const over = await requestBusiness(reviewer, matches, { movementId: in200.id, expectedVersion: firstMatch.version, amount: '201' })
    expect(over.status, over.text).toBe(409)
    amountIs((await lookup('split')).matched, '300')
    await review('treasury-statement-reason-' + split.id).fill('D8 核对解除后余额')
    await uiChange(reviewer, trade + '/matches/' + firstMatch.id + '/release', () => review('treasury-statement-release-' + firstMatch.id).click())
    await expect(review('treasury-statement-row-' + split.id)).toContainText('剩余 500.00')
    await match(in300, '300')
    const submitted = reviewer.waitForRequest(request => new URL(request.url()).pathname === matches && request.method() === 'POST')
    const finalMatch = await match(in200, '200')
    const { operationId, ...allocation } = (await submitted).postDataJSON()
    const replay = await requestBusiness(reviewer, matches, allocation, 'POST', operationId)
    expect(replay.status).toBe(200)
    expect(JSON.parse(replay.text)).toEqual(finalMatch)
    await expect(review('treasury-statement-row-' + split.id)).toContainText('已匹配 500.00')
    const retryDuplicate = await requestBusiness(reviewer, matches, { movementId: in200.id, expectedVersion: finalMatch.version, amount: '200' })
    expect(retryDuplicate.status, retryDuplicate.text).toBe(409)
    expect((await readBusiness<{ reversed: boolean }[]>(reviewer, matches)).filter(row => !row.reversed)).toHaveLength(2)
    await review('treasury-statement-open-' + ignored.id).click()
    for (const excluded of [true, false, true]) {
      await review('treasury-statement-reason-' + ignored.id).fill('D8 对账单排除与恢复')
      await uiChange(reviewer, trade + '/statement/' + ignored.id + '/exclude', () => review('treasury-statement-maintain-' + ignored.id).click())
      await expect(review('treasury-statement-row-' + ignored.id)).toContainText(excluded ? '已排除' : '未匹配')
      expect((await lookup('ignore')).excluded).toBe(excluded)
    }

    const records = bankPath + '/reconciliations'
    const reconciliationForm = async (day: string, ending: string) => {
      await field('treasury-recon-cutoff').fill(day)
      await field('treasury-recon-bank-balance').fill(ending)
    }
    const prepare = () => uiChange<Reconciliation>(maker, records, () => field('treasury-recon-save').click())
    await maker.goto(reconciliation)
    await reconciliationForm(bankOn, '1299')
    const wrong = await uiChange<ReconciliationReport>(maker, records + '/preview', () => field('treasury-recon-preview').click())
    amountIs(wrong.difference, '-1')
    await expect(field('treasury-recon-value-difference')).toHaveText('-1.00')
    const cancelled = await prepare()
    const cancelledRow = field('treasury-recon-record-' + cancelled.id)
    const refused = await requestBusiness(reviewer, trade + '/reconciliations/' + cancelled.id + '/decision',
      { expectedVersion: cancelled.version, decision: 'finish' })
    expect(refused.status, refused.text).toBe(409)
    await uiChange(maker, trade + '/reconciliations/' + cancelled.id + '/decision', () => cancelledRow.getByRole('button', { name: '取消申请' }).click())
    await expect(cancelledRow).toContainText('已取消')
    const approved: Reconciliation[] = []
    for (const day of [bankOn, secondOn]) {
      await reconciliationForm(day, '1300')
      const candidate = await prepare()
      amountIs(candidate.report.bookBalance, '1300')
      amountIs(candidate.report.adjustedStatement, '1300')
      amountIs(candidate.report.difference, '0')
      amountIs(candidate.report.ledgerDifference, '0')
      const path = trade + '/reconciliations/' + candidate.id + '/decision'
      expect((await requestBusiness(maker, path, { expectedVersion: candidate.version, decision: 'finish' })).status).toBe(403)
      await reviewer.goto(reconciliation)
      const done = await uiChange<Reconciliation>(reviewer, path, () => review('treasury-recon-finish-' + candidate.id).click())
      expect(done.state).toBe('completed')
      expect(done.report).toEqual(candidate.report)
      approved.push(done)
    }
    const [older, newest] = approved as [Reconciliation, Reconciliation]
    const oldUndo = await requestBusiness(reviewer, trade + '/reconciliations/' + older.id + '/decision',
      { expectedVersion: older.version, decision: 'undo', reason: 'D8 旧截止日保护' })
    expect(oldUndo.status, oldUndo.text).toBe(409)
    const locked = await requestBusiness(reviewer, trade + '/statement/' + ignored.id + '/exclude',
      { expectedVersion: (await lookup('ignore')).version, exclude: false, reason: 'D8 复核后的截止日保护' })
    expect(locked.status, locked.text).toBe(409)
    expect((await lookup('ignore')).excluded).toBe(true)
    await expect(review('treasury-recon-undo-' + older.id)).toHaveCount(0)
    const pdf = async (row: Reconciliation) => {
      const button = review('treasury-recon-pdf-' + row.id)
      await expect(button).toBeVisible()
      const href = await button.getAttribute('href')
      const response = await reviewer.request.get(href!)
      expect(response.ok()).toBe(true)
      expect(response.headers()['content-type']).toContain('application/pdf')
      const body = await response.body()
      expect(body.subarray(0, 5).toString()).toBe('%PDF-')
      expect(body.length).toBeGreaterThan(500)
    }
    await pdf(older)
    await pdf(newest)
    await review('treasury-recon-undo-' + newest.id).click()
    await expect(review('treasury-recon-undo-confirm')).toBeDisabled()
    await review('treasury-recon-undo-reason').fill('D8 验证最新一期撤销')
    const undone = await uiChange<Reconciliation>(reviewer, trade + '/reconciliations/' + newest.id + '/decision', () => review('treasury-recon-undo-confirm').click())
    expect(undone.state).toBe('undone')
    expect(undone.report).toEqual(newest.report)
    await pdf(undone)
    await expect(review('treasury-recon-undo-' + older.id)).toBeVisible()

    const transfer = await makeFlow('资金划转', 'TRANSFER', '20', activityOn, undefined, cash)
    await makeFlow('业主投入', 'OWNER-IN', '100', activityOn, equity)
    await makeFlow('业主提款', 'OWNER-OUT', '30', activityOn, equity)
    amountIs((await bankMoves()).find(row => row.documentId === transfer.id)!.amount, '-20')
    amountIs((await readBusiness<BankMovement[]>(reviewer, cashPath + '/movements')).find(row => row.documentId === transfer.id)!.amount, '20')
    amountIs((await readBusiness<WireBank>(reviewer, bankPath)).balance, '1350')
    expect((await readBusiness<Reconciliation[]>(reviewer, records)).find(row => row.id === older.id)?.report).toEqual(older.report)
  } finally {
    if (activeDefault && activeDefault.id !== bank.id) {
      const current = await readBusiness<WireBank>(maker, bankPath)
      if (current.isDefault) {
        const previous = await readBusiness<WireBank>(maker, trade + '/banks/' + activeDefault.id)
        await changeBusiness(maker, trade + '/banks/' + previous.id + '/default', { expectedVersion: previous.version })
      }
    }
  }
}

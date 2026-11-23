import { expect, test, type Page } from '@playwright/test'
import { emailLogin, login, write } from './helpers'
import { changeBusiness, chooseOption, readBusiness, requestBusiness, uiChange, type BusinessChange } from './business-actions'
import { financePage, saveAccount, verifyOpeningSubledgers, verifyYearClose } from './d7-accounting-scenarios'
import { verifyPaidSupplierReturn } from './d6-supplier-return'
import type { WireChart } from '../shared/types/prerequisites'
import type { JournalSummary, LedgerJournal } from '../shared/types/ledger'

type ChartAccount = WireChart['accounts'][number]
const on = '2026-01-01'

async function invite(owner: Page, target: Page, org: string, email: string) {
  const access = await readBusiness<{ authorizationVersion: number }>(owner, org + '/access')
  const invitation = await changeBusiness<{ invitation: { id: string }, token: string }>(owner, org + '/invitations',
    { expectedVersion: access.authorizationVersion, email, role: 'WorkspaceOwner' }, 201)
  await changeBusiness(target, '/bff/api/invitations/' + invitation.invitation.id + '/redeem', { token: invitation.token })
}
async function grant(owner: Page, approver: Page, target: Page, org: string, role: string, area = 'finance') {
  const member = await readBusiness<{ memberId: string }>(target, org + '/access')
  const path = org + '/members/' + member.memberId + '/' + area + '-role'
  const version = async () => (await readBusiness<{ authorizationVersion: number }>(owner, org + '/access')).authorizationVersion
  const proposal = await write(owner, path, 'POST', { expectedVersion: await version(), action: 'propose', role, operationId: crypto.randomUUID() })
  expect(proposal.status, proposal.text).toBe(200)
  const approval = await write(approver, path, 'POST', { expectedVersion: await version(), action: 'approve', operationId: crypto.randomUUID() })
  expect(approval.status, approval.text).toBe(200)
}
const validChart = (code: string) => JSON.stringify({ format: 'nexora.chart-structure.v1', accounts: [{ code, name: 'D7 独立新增', category: 'asset', purpose: 'posting' }] })
const pair = (account: ChartAccount, direction: 'debit' | 'credit', amount = '10') =>
  ({ accountId: account.id, debit: direction === 'debit' ? amount : '0', credit: direction === 'credit' ? amount : '0' })

test('D7 真实财务科目、凭证、期初和关账', async ({ browser }, testInfo) => {
  test.setTimeout(420_000)
  const owner = await browser.newPage(), maker = await browser.newPage(), reviewer = await browser.newPage()
  const tag = Date.now().toString(36)
  try {
    await Promise.all([emailLogin(owner, 'd7-acceptance-' + tag + '@example.invalid', true), login(maker, 'alice'), login(reviewer, 'bob')])
    const workspace = (await changeBusiness(owner, '/bff/api/workspaces', { name: 'D7 联调 ' + tag }, 201)).id
    const org = '/bff/api/workspaces/' + workspace
    await invite(owner, maker, org, 'alice@nexora.invalid')
    await invite(owner, reviewer, org, 'bob@nexora.invalid')
    await grant(maker, reviewer, maker, org, 'Accountant')
    await grant(reviewer, maker, reviewer, org, 'FinanceReviewer')
    const root = '/bff/api/finance/workspaces/' + workspace
    const ledger = root + '/ledger'
    const journals = ledger + '/journals'
    await maker.goto(financePage(workspace, 'workbench'))
    await maker.getByTestId('finance-book-start').fill(on)
    await uiChange(maker, root + '/book', () => maker.getByTestId('finance-book-initialize').click())
    await expect(maker.getByTestId('finance-book-status')).toContainText(on)

    await maker.goto(financePage(workspace, 'accounts'))
    const template = await readBusiness<{ accounts: object[] }>(maker, root + '/chart/exports/template')
    const replacement = { mode: 'replace', format: 'nexora-json', file: JSON.stringify(template) }
    const { previewId: replacementId } = await changeBusiness<{ previewId: string }>(maker, root + '/chart/imports/preview', replacement, 201)
    await changeBusiness(maker, root + '/chart/imports/' + replacementId + '/commit', {})
    await maker.reload()
    await maker.getByTestId('account-add').click()
    await maker.getByTestId('account-code').fill('9700')
    await maker.getByTestId('account-name').fill('D7 普通资产')
    await uiChange(maker, root + '/chart/accounts', () => maker.getByTestId('account-submit').click())
    await maker.getByTestId('chart-import-open').click()
    await maker.getByTestId('chart-import-file').fill(validChart('9700'))
    await uiChange(maker, root + '/chart/imports/preview', () => maker.getByTestId('chart-import-preview-action').click())
    await expect(maker.getByTestId('chart-import-commit')).toBeDisabled()
    await maker.getByTestId('chart-import-file').fill(validChart('9701'))
    const preview = await uiChange<{ previewId: string }>(maker, root + '/chart/imports/preview', () => maker.getByTestId('chart-import-preview-action').click(), 201)
    await saveAccount(maker, root, { code: '9702', name: 'D7 并发科目', category: 'asset' })
    const obsolete = await requestBusiness(maker, root + '/chart/imports/' + preview.previewId + '/commit', {})
    expect([409, 412]).toContain(obsolete.status)
    await maker.reload()
    await maker.getByTestId('chart-import-open').click()
    await maker.getByTestId('chart-import-file').fill(validChart('9701'))
    const confirmed = await uiChange<{ previewId: string }>(maker, root + '/chart/imports/preview', () => maker.getByTestId('chart-import-preview-action').click(), 201)
    await uiChange(maker, root + '/chart/imports/' + confirmed.previewId + '/commit', () => maker.getByTestId('chart-import-commit').click())
    await maker.getByRole('dialog', { name: '科目导入' }).getByRole('button', { name: '关闭', exact: true }).first().click()
    const archived = maker.getByTestId('account-row').filter({ hasText: '9701' })
    await archived.getByTestId('account-edit').click()
    await maker.getByRole('checkbox', { name: '归档科目' }).click()
    await uiChange(maker, root + '/chart/accounts', () => maker.getByTestId('account-submit').click())
    await expect(archived).toContainText('已归档')
    const chart = await readBusiness<WireChart>(maker, root + '/chart')
    const asset = chart.accounts.find(row => row.code === '9700')!
    const equity = chart.accounts.find(row => row.category === 'equity' && row.purpose === 'posting')!
    const income = chart.accounts.find(row => row.category === 'income' && row.purpose === 'posting')!
    for (const [kind, name] of [['template', '模板'], ['structure', '结构'], ['snapshot', '快照']]) {
      const [download] = await Promise.all([
        maker.waitForEvent('download'), maker.getByTestId('chart-files').getByRole('button', { name, exact: true }).click()
      ])
      expect(download.suggestedFilename()).toBe('nexora-chart-' + kind + '.json')
    }

    const periodPath = ledger + '/periods/' + on
    await reviewer.goto(financePage(workspace, 'closing'))
    await reviewer.getByTestId('closing-period-month').fill('2026-01')
    await reviewer.getByTestId('closing-period-reason').fill('D7 期初会计期间')
    await uiChange(reviewer, periodPath, () => reviewer.getByTestId('closing-period-action').click())
    await expect(reviewer.getByTestId('closing-period-state')).toHaveText('开放')
    await maker.goto(financePage(workspace, 'opening'))
    const openingCsv = 'Code,Debit,Credit\n' + asset.code + ',10,0\n' + equity.code + ',0,10'
    await maker.getByTestId('opening-gl-file').fill(openingCsv)
    await uiChange(maker, ledger + '/opening-balances/preview', () => maker.getByTestId('opening-gl-preview').click())
    const opening = await uiChange(maker, ledger + '/opening-balances/import', () => maker.getByTestId('opening-gl-import').click(), 201)
    const initial = await readBusiness<LedgerJournal>(maker, journals + '/' + opening.id)
    if (initial.journal.state === 'draft') await changeBusiness(maker, journals + '/' + opening.id + '/decision', { expectedVersion: initial.journal.version, decision: 'submit' })
    await reviewer.goto(financePage(workspace, 'journals', '&journal=' + opening.id))
    await uiChange(reviewer, journals + '/' + opening.id + '/decision', () => reviewer.getByTestId('journal-post').click())
    await expect(reviewer.getByTestId('journal-state')).toHaveText('已过账')
    const used = await readBusiness<WireChart>(maker, root + '/chart')
    const active = used.accounts.find(row => row.id === asset.id)!
    expect(active.isUsed).toBe(true)
    const changedPurpose = await requestBusiness(maker, root + '/chart/accounts', { expectedRevision: used.revision, expectedVersion: active.version,
      account: { code: asset.code, name: asset.name, category: asset.category, purpose: 'control' } })
    expect(changedPurpose.status).toBe(409)
    const usedReplace = await changeBusiness<{ previewId: string | null, errors: unknown[] }>(maker, root + '/chart/imports/preview', replacement)
    expect(usedReplace.previewId).toBeNull()
    expect(usedReplace.errors.length).toBeGreaterThan(0)
    const subledgers = await verifyOpeningSubledgers(maker, reviewer, workspace, equity)
    await test.step('D6 已付款采购退货的贷项与退款', async () => {
      await grant(maker, reviewer, maker, org, 'PurchasingOperator', 'purchase')
      await grant(reviewer, maker, reviewer, org, 'PurchasingApprover', 'purchase')
      await verifyPaidSupplierReturn(maker, reviewer, owner, workspace, subledgers)
    })

    await maker.goto(financePage(workspace, 'journals'))
    await maker.getByTestId('journal-new').click()
    await maker.getByTestId('journal-number').fill('D7-M-' + tag)
    await maker.getByTestId('journal-memo').fill('D7 凭证')
    await chooseOption(maker, 'journal-account-0', asset.code + ' ' + asset.name)
    await chooseOption(maker, 'journal-account-1', income.code + ' ' + income.name)
    await maker.getByTestId('journal-debit-0').fill('20')
    await maker.getByTestId('journal-credit-1').fill('20')
    const manual = await uiChange(maker, journals, () => maker.getByTestId('journal-save').click(), 201)
    await maker.getByTestId('journal-edit').click()
    await maker.getByTestId('journal-memo').fill('D7 修改草稿')
    await uiChange(maker, journals + '/' + manual.id, () => maker.getByTestId('journal-save').click(), 200, 'PUT')
    await uiChange(maker, journals + '/' + manual.id + '/decision', () => maker.getByTestId('journal-submit').click())
    await reviewer.goto(financePage(workspace, 'journals', '&journal=' + manual.id))
    await uiChange(reviewer, journals + '/' + manual.id + '/decision', () => reviewer.getByTestId('journal-post').click())
    await expect(reviewer.getByTestId('journal-state')).toHaveText('已过账')
    await maker.goto(financePage(workspace, 'journals', '&journal=' + manual.id))
    await maker.getByRole('button', { name: '新增关联' }).click()
    await maker.getByTestId('journal-link-target').fill(opening.id)
    await uiChange(maker, ledger + '/links', () => maker.getByTestId('journal-link-save').click())
    await expect(maker.getByRole('button', { name: 'OPENING', exact: true })).toBeVisible()
    await maker.getByRole('button', { name: '移除关联' }).click()
    await expect(maker.getByRole('button', { name: 'OPENING', exact: true })).not.toBeVisible()
    await maker.getByTestId('journal-reversal').click()
    await maker.getByTestId('journal-reversal-date').fill('2026-01-02')
    await maker.getByTestId('journal-reversal-reason').fill('D7 测试冲销')
    const reversal = await uiChange(maker, journals + '/' + manual.id + '/reversal', () => maker.getByTestId('journal-reversal').click(), 201)
    await expect(maker.getByTestId('journal-state')).toHaveText('待独立复核')
    await expect(maker.getByRole('button', { name: '查看原凭证' })).toBeVisible()
    await reviewer.goto(financePage(workspace, 'journals', '&journal=' + reversal.id))
    await uiChange(reviewer, journals + '/' + reversal.id + '/decision', () => reviewer.getByTestId('journal-post').click())
    await expect(reviewer.getByTestId('journal-state')).toHaveText('已过账')

    const input = { provider: 'd7', externalId: tag + '-A', draft: { on, memo: 'D7 外部凭证', lines: [pair(asset, 'debit'), pair(income, 'credit')] } }
    const importKey = crypto.randomUUID()
    const first = await requestBusiness(maker, journals + '/imported', input, 'POST', importKey)
    expect(first.status, first.text).toBe(201)
    const imported = JSON.parse(first.text) as BusinessChange
    const replay = await requestBusiness(maker, journals + '/imported', input, 'POST', importKey)
    expect(JSON.parse(replay.text)).toEqual(imported)
    expect((await requestBusiness(maker, journals + '/imported', input)).status).toBe(409)
    const other = await changeBusiness(maker, journals + '/imported', { ...input, externalId: tag + '-B' }, 201)
    const cancelled = await changeBusiness(maker, journals + '/imported', { ...input, externalId: tag + '-C' }, 201)
    const batchPath = journals + '/imported/batch-decision'
    const stale = await requestBusiness(maker, batchPath, { decision: 'submit', journals: [imported, { ...other, version: 999 }] })
    expect(stale.status, stale.text).toBe(409)
    expect((await readBusiness<LedgerJournal>(maker, journals + '/' + imported.id)).journal.state).toBe('draft')
    await maker.goto(financePage(workspace, 'imported'))
    await maker.getByTestId('ledger-row-' + cancelled.id).getByRole('checkbox').click()
    await uiChange(maker, batchPath, () => maker.getByTestId('journal-batch-cancel').click())
    await expect(maker.getByTestId('ledger-row-' + cancelled.id)).toContainText('已取消')
    for (const id of [imported.id, other.id]) await maker.getByTestId('ledger-row-' + id).getByRole('checkbox').click()
    await uiChange<BusinessChange[]>(maker, batchPath, () => maker.getByTestId('journal-batch-submit').click())

    await reviewer.goto(financePage(workspace, 'closing'))
    await reviewer.getByTestId('closing-period-month').fill('2026-01')
    await reviewer.getByTestId('closing-period-reason').fill('D7 核对月结门禁')
    const closing = await uiChange<{ version: number }>(reviewer, periodPath, () => reviewer.getByTestId('closing-period-action').click())
    await expect(reviewer.getByTestId('closing-period-state')).toHaveText('关账中')
    expect((await requestBusiness(reviewer, periodPath, { expectedVersion: closing.version, action: 'close', reason: '仍有待复核凭证' })).status).toBe(409)
    const reopened = await changeBusiness(reviewer, periodPath, { expectedVersion: closing.version, action: 'reopen', reason: '处理待复核凭证' })
    await reviewer.goto(financePage(workspace, 'imported'))
    for (const id of [imported.id, other.id]) await reviewer.getByTestId('ledger-row-' + id).getByRole('checkbox').click()
    await uiChange<BusinessChange[]>(reviewer, batchPath, () => reviewer.getByTestId('journal-batch-post').click())
    const current = await changeBusiness(reviewer, periodPath, { expectedVersion: reopened.version, action: 'begin-close', reason: '凭证已复核' })
    const closed = await changeBusiness(reviewer, periodPath, { expectedVersion: current.version, action: 'close', reason: '月结核对完毕' })
    const reopenedForYear = await changeBusiness(reviewer, periodPath, { expectedVersion: closed.version, action: 'reopen', reason: '验证期间重开' })
    await maker.goto(financePage(workspace, 'journals'))
    await maker.getByTestId('ledger-balance-date').fill('2026-01-31')
    await maker.getByTestId('ledger-trial-balance').click()
    await expect(maker.getByTestId('ledger-balance')).toContainText('2026-01-31')
    await maker.getByTestId('ledger-scan').click()
    await expect(maker.getByTestId('ledger-scan-result')).toContainText('个问题')
    expect((await readBusiness<JournalSummary[]>(maker, journals)).filter(row => row.kind === 'imported' && row.state === 'posted')).toHaveLength(2)
    await verifyYearClose(maker, reviewer, workspace, equity, reopenedForYear.version)
  } catch (failure) {
    for (const [name, page] of [['制单', maker], ['复核', reviewer], ['管理', owner]] as const) {
      if (page.url().startsWith('https://localhost:7444/')) await testInfo.attach(name, { body: await page.locator('body').ariaSnapshot({ timeout: 1800 }).catch(() => ''), contentType: 'text/plain' })
    }
    throw failure
  } finally {
    await Promise.all([owner.close(), maker.close(), reviewer.close()])
  }
})

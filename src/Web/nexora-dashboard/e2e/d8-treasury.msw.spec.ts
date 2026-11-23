import { expect, test, type Page } from '@playwright/test'
import { mockWorkspaceId } from '../app/mocks/api/catalog'
import { d8Ids, d8On } from '../app/mocks/api/treasury'
import { chooseOption, readBusiness, requestBusiness, uiChange } from './business-actions'
import type { BankCsvPreview, ReceiptDispatch, Reconciliation, StatementLine } from '../shared/types/treasury'
import type { BankMovement } from '../shared/types/trade'

const path = (tab: string, stage: string, query = '') => '/finance?workspace=' + mockWorkspaceId + '&tab=' + tab + '&mockCase=d8-' + stage + query
const trade = '/bff/api/finance/workspaces/' + mockWorkspaceId + '/trade'
const documents = trade + '/documents'
const bank = trade + '/banks/' + d8Ids.bank
const csv = 'Reference,Date,Amount,Summary\nsplit,2026-01-08,500,"split, two parts"\nexpense,2026-01-08,-200,expense'

async function login(page: Page, url: string) {
  await page.goto(url)
  await expect(page.getByTestId('user-menu-trigger')).toContainText('未登录', { timeout: 45_000 })
  await page.getByTestId('user-menu-trigger').click()
  await page.getByRole('menuitem', { name: '登录 Nexora', exact: true }).click()
}
function importCsv(page: Page, content: string, status: number) {
  return page.getByTestId('treasury-import-csv').fill(content).then(() =>
    uiChange<BankCsvPreview>(page, trade + '/imports/preview', () => page.getByTestId('treasury-import-preview-request').click(), status))
}
test('D8 MSW CSV 200 校验、过期预览重做与提交回执丢失恢复', async ({ page }) => {
  const field = (id: string) => page.getByTestId(id)
  await login(page, path('bank', 'expired'))
  const bad = await importCsv(page, csv.replace('500', 'x'), 200)
  expect(bad.previewId).toBeNull()
  await expect(field('treasury-import-preview')).toContainText('第 2 行')
  await importCsv(page, csv, 201)
  await expect(field('treasury-import-status')).toContainText('预览已过期')
  await expect(field('treasury-import-submit')).toHaveCount(0)
  await page.goto(path('bank', 'import-unknown'))
  const next = await importCsv(page, csv, 201)
  await field('treasury-import-submit').click()
  await expect(page.getByRole('button', { name: '核对原提交' })).toBeVisible()
  await page.reload()
  await expect(field('treasury-import-id')).toHaveValue(next.previewId!)
  await page.getByRole('button', { name: '核对原提交' }).click()
  await expect(field('treasury-import-status')).toContainText('已导入 2 行')
  await expect(page.getByRole('button', { name: '重试原提交' })).toHaveCount(0)
  expect((await readBusiness<StatementLine[]>(page, bank + '/statement')).map(row => row.externalId)).toEqual(['split', 'expense'])
})

test('D8 MSW 拆分匹配与两期对账的撤销顺序', async ({ page }) => {
  const field = (id: string) => page.getByTestId(id)
  await login(page, path('bank', 'maker'))
  const preview = await importCsv(page, csv, 201)
  await uiChange(page, trade + '/imports/' + preview.previewId + '/commit', () => field('treasury-import-submit').click())
  await page.goto(path('bank', 'reviewer'))
  await expect(field('treasury-statement')).toBeVisible()
  const lines = await readBusiness<StatementLine[]>(page, bank + '/statement')
  const movements = await readBusiness<BankMovement[]>(page, bank + '/movements')
  for (const row of lines) {
    await field('treasury-statement-open-' + row.id).click()
    const chosen = row.externalId === 'split'
      ? [movements.find(row => row.amount === '300')!, movements.find(row => row.amount === '200')!]
      : [movements.find(row => row.amount === '-200')!]
    for (const move of chosen) {
      await chooseOption(page, 'treasury-statement-flow-' + row.id, new RegExp(move.id))
      await field('treasury-statement-amount-' + row.id).fill(move.amount.replace('-', ''))
      await uiChange(page, trade + '/statement/' + row.id + '/matches', () => field('treasury-statement-match-' + row.id).click())
    }
    await expect(field('treasury-statement-row-' + row.id)).toContainText('剩余 0.00')
  }
  const completed: Reconciliation[] = []
  for (const cutoff of [d8On, '2026-01-09']) {
    await page.goto(path('bank', 'maker'))
    await field('treasury-recon-cutoff').fill(cutoff)
    await field('treasury-recon-bank-balance').fill('1300')
    const row = await uiChange<Reconciliation>(page, bank + '/reconciliations', () => field('treasury-recon-save').click())
    await expect(field('treasury-recon-value-adjustedStatement')).toHaveText('1,300.00')
    await page.goto(path('bank', 'reviewer'))
    completed.push(await uiChange<Reconciliation>(page, trade + '/reconciliations/' + row.id + '/decision',
      () => field('treasury-recon-finish-' + row.id).click()))
  }
  const [earlier, latest] = completed as [Reconciliation, Reconciliation]
  await expect(field('treasury-recon-undo-' + earlier.id)).toHaveCount(0)
  await field('treasury-recon-undo-' + latest.id).click()
  await field('treasury-recon-undo-reason').fill('模拟最近一期撤销')
  const undone = await uiChange<Reconciliation>(page, trade + '/reconciliations/' + latest.id + '/decision', () => field('treasury-recon-undo-confirm').click())
  expect(undone.report).toEqual(latest.report)
  expect(undone.state).toBe('undone')
  await expect(field('treasury-recon-pdf-' + latest.id)).toBeVisible()
  const href = (await field('treasury-recon-pdf-' + latest.id).getAttribute('href'))!
  const pdf = await page.evaluate(async (url) => {
    const response = await fetch(url)
    return { type: response.headers.get('content-type'), body: await response.text() }
  }, href)
  expect(pdf.type).toContain('application/pdf')
  expect(pdf.body).toContain('Cutoff: 2026-01-09')
  expect(pdf.body).toContain('startxref')
})

test('D8 MSW 付款作废由独立复核人完成并回补应付余额', async ({ page }) => {
  const field = (id: string) => page.getByTestId(id)
  const url = (actor: string) => path('payables', actor, '&bill=' + d8Ids.bill)
  await login(page, url('maker'))
  await expect(field('bill-detail-outstanding')).toContainText('530.00')
  await field('payment-open-' + d8Ids.payment).click()
  await field('payment-void-number').fill('D8-MS-VOID')
  await field('payment-void-date').fill(d8On)
  await field('payment-void-reason').fill('付款作废模拟')
  const doc = await uiChange(page, documents, () => field('payment-void-submit').click(), 201)
  await expect(field('payment-void-approve-' + doc.id)).toHaveCount(0)
  await page.goto(url('reviewer'))
  await field('payment-open-' + d8Ids.payment).click()
  await uiChange(page, documents + '/' + doc.id + '/decision', () => field('payment-void-approve-' + doc.id).click())
  await expect(field('payment-detail-status')).toHaveText('已作废')
  await expect(field('payment-reversal-balance')).toContainText('1,130.00')
})

test('D8 MSW 投递失败重试、未知结果独立补发与放弃', async ({ page }) => {
  const field = (id: string) => page.getByTestId(id)
  const receipt = documents + '/' + d8Ids.gift + '/donation-receipt'
  await login(page, path('donations', 'reviewer-mail-failed'))
  await field('donation-open-' + d8Ids.gift).click()
  await expect(field('donation-channel-state')).toContainText('本地邮件通道')
  await field('donation-dispatch-open-' + d8Ids.failure).click()
  const retry = await uiChange<ReceiptDispatch>(page, receipt + '/dispatches/' + d8Ids.failure + '/decision', () => field('donation-dispatch-retry').click())
  expect(retry.id).toBe(d8Ids.failure)
  expect(retry.attempt).toBe(2)
  await field('donation-dispatch-close').click()
  const invalidRetry = await requestBusiness(page, receipt + '/dispatches/' + d8Ids.uncertain + '/decision', { decision: 'retry', expectedVersion: 3 })
  expect(invalidRetry.status).toBe(409)
  await field('donation-dispatch-open-' + d8Ids.uncertain).click()
  await expect(field('donation-dispatch-retry')).toHaveCount(0)
  const resend = await uiChange<ReceiptDispatch>(page, receipt + '/dispatches/' + d8Ids.uncertain + '/decision', () => field('donation-dispatch-resend').click())
  expect(resend.previousId).toBe(d8Ids.uncertain)
  await expect(field('donation-dispatch-detail-previous')).toContainText(d8Ids.uncertain)
  await field('donation-dispatch-close').click()
  const failed = await uiChange<ReceiptDispatch>(page, receipt + '/dispatches', () => field('donation-mail-send').click(), 201)
  await field('donation-dispatch-open-' + failed.id).click()
  const abandoned = await uiChange<ReceiptDispatch>(page, receipt + '/dispatches/' + failed.id + '/decision', () => field('donation-dispatch-abandon').click())
  expect(abandoned.state).toBe('abandoned')
})

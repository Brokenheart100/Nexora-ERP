import { expect, test, type Page } from '@playwright/test'
import { api, baseline, origin } from './helpers'
import { changeBusiness, chooseOption, readBusiness } from './business-actions'
import { prepareInvoicing } from './d9-invoice-scenarios'
import { amountIs } from './d8-bank-scenarios'
import { saveAccount } from './d7-accounting-scenarios'
import { captureFile, exportJob, pinned, queryReport, reportFrom, reportThrough, routeFor } from './d11-report-actions'
import { sumDecimals } from '../shared/utils/decimal'
import type { OpenItemAging } from '../shared/types/trade'
import type { FinanceOverview, FinancialReport, ReportExport } from '../shared/types/reporting'

test.use({ trace: 'off', screenshot: 'off', video: 'off' })
type Fixture = Awaited<ReturnType<typeof prepareInvoicing>>

async function postInvoice(maker: Page, reviewer: Page, fixture: Fixture) {
  const schedules = fixture.ar + '/schedules'
  const plan = await changeBusiness(maker, schedules, { expectedVersion: 0, input: { ...fixture.input, quantity: '1', unitPrice: '150' } })
  const { invoiceId } = await changeBusiness<{ invoiceId: string }>(maker, schedules + '/' + plan.id + '/run', { on: reportThrough })
  expect(invoiceId).toBeTruthy()
  const path = fixture.ar + '/documents/' + invoiceId
  const doc = await readBusiness<{ version: number }>(maker, path)
  await changeBusiness(reviewer, path + '/decision', { expectedVersion: doc.version, approve: true })
  return invoiceId
}

async function partialPayment(maker: Page, reviewer: Page, fixture: Fixture, invoiceId: string) {
  const { finance, ar, input } = fixture
  const account = await saveAccount(maker, finance, { code: 'D11-BANK-CTL', name: 'D11 回款控制科目', category: 'asset', purpose: 'control' })
  const bank = await changeBusiness(maker, finance + '/trade/banks', { code: 'D11-BANK', name: 'D11 联调银行', kind: 'bank', accountId: account.id }, 201)
  async function post(draft: object) {
    const doc = await changeBusiness(maker, ar + '/documents', { draft }, 201)
    await changeBusiness(reviewer, ar + '/documents/' + doc.id + '/decision', { expectedVersion: doc.version, approve: true })
    return doc.id
  }
  const fundsId = await post({ kind: 'receipt', on: reportThrough, number: 'D11-RECEIPT', amount: '50', customerId: input.customerId, bankId: bank.id })
  await post({ kind: 'allocation', on: reportThrough, number: 'D11-ALLOC', amount: '50', invoiceId, fundsId })
}

async function verifyFinancialReports(maker: Page, reviewer: Page, fixture: Fixture) {
  const { workspace, finance } = fixture
  await maker.goto(routeFor(workspace, 'reporting'))
  await expect(maker.getByTestId('report-snapshot')).toBeVisible()
  const pl = finance + '/reports/profit-and-loss'
  const jobs = finance + '/report-exports'
  await maker.getByTestId('report-compare').click()
  const screen = await queryReport(maker, pl)
  expect(screen.previousPeriod).toEqual({ from: '2026-01-05', through: '2026-01-07' })
  const profit = screen.totals.find(total => total.key === 'profit')!
  amountIs(profit.amount, '3150')
  await expect(maker.getByTestId('report-totals')).toContainText('3,150.00')

  await postInvoice(maker, reviewer, fixture)
  const filter = '?from=' + reportFrom + '&through=' + reportThrough
  const current = await readBusiness<FinancialReport>(maker, pl + filter)
  amountIs(current.totals.find(total => total.key === 'profit')!.amount, '3300')
  expect(Number(current.watermark)).toBeGreaterThan(Number(screen.watermark))
  const income = screen.lines.find(line => line.row.section === 'income')!
  const drill = maker.waitForResponse(response => new URL(response.url()).pathname === pl + '/rows/' + income.row.key)
  await maker.getByTestId('report-row-' + income.row.key).click()
  pinned(await drill, screen)
  await expect(maker.getByTestId('report-drill')).toContainText('过账水位 ' + screen.watermark)
  await expect(maker.getByTestId('report-drill').getByRole('link').first()).toHaveAttribute('href', /tab=journals/)
  await maker.keyboard.press('Escape')

  const pdfResponse = maker.waitForResponse(response => new URL(response.url()).pathname === pl + '/pdf')
  await maker.getByTestId('report-pdf-preview').click()
  const pdf = await pdfResponse
  expect(pdf.status()).toBe(200)
  pinned(pdf, screen)
  const downloaded = await captureFile(maker, 'report-pdf-download')
  expect(downloaded.name).toBe('profit-and-loss-' + screen.watermark + '.pdf')
  expect(downloaded.bytes.subarray(0, 5).toString()).toBe('%PDF-')
  await maker.keyboard.press('Escape')

  const queued = await exportJob(maker, jobs, 'report-export-create')
  expect(queued.watermark).toBe(screen.watermark)
  await maker.reload()
  await maker.getByTestId('report-export-' + queued.id).click()
  await expect(maker.getByTestId('report-export-download')).toBeEnabled()
  const csv = await captureFile(maker, 'report-export-download')
  expect(csv.bytes.subarray(0, 3).toString('hex')).toBe('efbbbf')
  const csvText = csv.bytes.toString('utf8')
  expect(csvText).toContain('"profit-and-loss","accrual","2026-01-08","2026-01-10","2026-01-05","2026-01-07","CNY","' + screen.watermark + '"')
  expect(csvText).toContain('"合计","","profit","","","","3150.00","0.00","3150.00"')
  const rebuilt = await exportJob(maker, jobs + '/' + queued.id + '/rebuild', 'report-export-rebuild')
  expect(rebuilt.id).not.toBe(queued.id)
  expect(rebuilt.watermark).toBe(queued.watermark)
  await expect(maker.getByTestId('report-export-download')).toBeEnabled()
  expect((await captureFile(maker, 'report-export-download')).bytes.equals(csv.bytes)).toBe(true)
  expect((await api(reviewer, jobs + '/' + queued.id)).status).toBe(404)
  expect((await api(reviewer, jobs + '/' + queued.id + '/file')).status).toBe(404)
  const foreign = '/bff/api/finance/workspaces/' + baseline.workspace.id + '/report-exports/' + queued.id
  expect((await api(maker, foreign)).status).toBe(404)
  expect((await readBusiness<ReportExport[]>(reviewer, jobs)).some(job => job.id === queued.id)).toBe(false)
  await maker.keyboard.press('Escape')

  await chooseOption(maker, 'report-basis', '收付实现制')
  const cash = await queryReport(maker, pl)
  expect(cash.basis).toBe('cash')
  amountIs(cash.totals.find(total => total.key === 'income')!.amount, '50')
  await chooseOption(maker, 'report-kind', '权益变动表')
  const equity = await queryReport(maker, finance + '/reports/equity-changes')
  expect(equity.totals.some(total => total.key === 'equity-closing')).toBe(true)
  for (const [kind, name, basis] of [
    ['trial-balance', '试算平衡表', 'accrual'],
    ['balance-sheet', '资产负债表', 'accrual'],
    ['cash-flow', '现金流量表', 'cash']
  ] as const) {
    await chooseOption(maker, 'report-kind', name)
    expect((await queryReport(maker, finance + '/reports/' + kind)).basis).toBe(basis)
  }
  const foreignSnapshot = '&kind=profit-and-loss&from=' + reportFrom + '&through=' + reportThrough
    + '&watermark=0&snapshotWorkspace=' + baseline.workspace.id
  await maker.goto(routeFor(workspace, 'reporting', undefined, foreignSnapshot))
  await expect(maker.getByTestId('report-totals')).toContainText('3,300.00')
}

async function verifyAgingAndWorkbench(maker: Page, fixture: Fixture) {
  const { workspace, finance } = fixture
  const aging = finance + '/reporting/aging/receivables'
  await maker.goto(routeFor(workspace, 'aging', undefined, '&through=' + reportThrough))
  await expect(maker.getByTestId('aging-snapshot')).toContainText('3,250.00')
  const first = await readBusiness<OpenItemAging>(maker, aging + '?through=' + reportThrough + '&page=1&pageSize=20')
  const response = maker.waitForResponse(response => new URL(response.url()).pathname === aging && new URL(response.url()).searchParams.get('page') === '2')
  await maker.getByTestId('aging-pagination').getByRole('button', { name: '第 2 页', exact: true }).click()
  const follow = await response
  expect(new URL(follow.url()).searchParams.get('watermark')).toBe(String(first.watermark))
  const second = await follow.json() as OpenItemAging
  expect(first.items).toHaveLength(20)
  expect(second.items).toHaveLength(2)
  amountIs(second.total, first.total)
  amountIs(sumDecimals([...first.items, ...second.items].map(row => row.outstanding)), first.total)
  await expect(maker.getByTestId('aging-snapshot')).toContainText('共 22 笔')
  await maker.getByTestId('aging-ledger-' + second.items[0]!.id).click()
  await expect(maker.getByTestId('partner-ledger')).toContainText('期末 3,250.00')
  const original = maker.getByTestId('partner-ledger').getByRole('link', { name: '查看单据' }).first()
  await expect(original).toHaveAttribute('href', /document=/)
  await original.click()
  await expect(maker).toHaveURL(/\/sales\?.*document=/)
  await maker.goBack()
  await expect(maker.getByTestId('aging-snapshot')).toContainText('过账水位 ' + first.watermark)
  await expect(maker.getByTestId('aging-ledger-' + second.items[0]!.id)).toBeVisible()

  await maker.goto('/?workspace=' + workspace)
  await expect(maker.getByTestId('live-workbench')).toBeVisible()
  const projection = '/bff/api/reports/workspaces/' + workspace
  await expect.poll(async () => (await api(maker, projection)).status).toBe(200)
  await maker.getByRole('button', { name: '刷新投影' }).click()
  await expect(maker.getByTestId('projection-status')).toHaveText('已同步')
  await expect(maker.getByTestId('projection-updated')).toBeVisible()
  const overview = finance + '/reporting/overview'
  await maker.getByTestId('overview-from').fill(reportFrom)
  await maker.getByTestId('overview-through').fill(reportThrough)
  await maker.getByTestId('overview-apply').click()
  await expect(maker.getByTestId('overview-profit')).toContainText('3,300.00')
  const summary = await readBusiness<FinanceOverview>(maker, overview + '?from=' + reportFrom + '&through=' + reportThrough)
  amountIs(summary.receivable, '3250')
  await maker.getByTestId('overview-reports').click()
  await expect(maker.getByTestId('report-snapshot')).toContainText('过账水位 ' + summary.watermark)
  await expect(maker.getByTestId('report-totals')).toContainText('3,300.00')
  await maker.getByTestId('dashboard-search-button').click()
  await maker.getByRole('dialog').getByRole('textbox').fill('D9-SVC')
  await maker.getByRole('option', { name: /D9-SVC/ }).click()
  await expect(maker.getByTestId('catalog-detail-panel')).toBeVisible()
  await expect(maker.getByRole('dialog')).toHaveAccessibleName('定期开票测试服务')
}

test('D11 新版报表、导出、账龄与工作台真实快照', async ({ browser }) => {
  test.setTimeout(420_000)
  const [owner, maker, reviewer] = await Promise.all(Array.from({ length: 3 }, () => browser.newPage({ baseURL: origin })))
  try {
    const fixture = await prepareInvoicing(owner!, maker!, reviewer!, 'D11')
    const first = await postInvoice(maker!, reviewer!, fixture)
    for (let index = 1; index < 21; index++) await postInvoice(maker!, reviewer!, fixture)
    await partialPayment(maker!, reviewer!, fixture, first)
    await test.step('对照屏幕、PDF、钻取、CSV 水位和快照重建', () => verifyFinancialReports(maker!, reviewer!, fixture))
    await test.step('分页账龄、往来账、工作台和统一搜索', () => verifyAgingAndWorkbench(maker!, fixture))
  } finally {
    await Promise.all([owner, maker, reviewer].map(page => page?.close()))
  }
})

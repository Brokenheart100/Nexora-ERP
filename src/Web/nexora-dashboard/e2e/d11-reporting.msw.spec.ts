import { expect, test, type Page } from '@playwright/test'
import { mockWorkspaceId } from '../app/mocks/api/catalog'
import { d11ReportIds } from '../app/mocks/api/reporting'
import { api } from './helpers'
import { changeBusiness, chooseOption, uiChange } from './business-actions'
import { captureFile, exportJob, pinned, queryReport, reportThrough, routeFor } from './d11-report-actions'

const workspace = mockWorkspaceId
const finance = '/bff/api/finance/workspaces/' + workspace
const exportsPath = finance + '/report-exports'
const home = (scenario: string) => '/?workspace=' + workspace + '&mockCase=' + scenario

async function login(page: Page, path: string) {
  await page.goto(path)
  const user = page.getByTestId('user-menu-trigger')
  await expect(user).toContainText('未登录', { timeout: 45000 })
  await user.click()
  await page.getByRole('menuitem', { name: '登录 Nexora', exact: true }).click()
}

test('D11 MSW 报表、钻取和 PDF 共用期间、口径和水位', async ({ page }) => {
  await login(page, routeFor(workspace, 'reporting', 'd11'))
  await chooseOption(page, 'report-basis', '收付实现制')
  await page.getByTestId('report-compare').click()
  const target = finance + '/reports/profit-and-loss'
  const snapshot = await queryReport(page, target)
  expect(snapshot.basis).toBe('cash')
  await expect(page.getByTestId('report-totals')).toContainText('400.00')
  const drill = page.waitForResponse(response => response.url().includes('/rows/' + d11ReportIds.account))
  await page.getByTestId('report-row-' + d11ReportIds.account).click()
  pinned(await drill, snapshot)
  await expect(page.getByTestId('report-drill')).toContainText('MSW-D11-JOURNAL')
  await page.keyboard.press('Escape')
  const preview = page.waitForResponse(response => new URL(response.url()).pathname === target + '/pdf')
  await page.getByTestId('report-pdf-preview').click()
  pinned(await preview, snapshot)
  const pdf = await captureFile(page, 'report-pdf-download')
  expect(pdf.bytes.toString()).toContain('profit-and-loss 2026-01-08 2026-01-10 42')
  await page.keyboard.press('Escape')
  await chooseOption(page, 'report-kind', '权益变动表')
  await queryReport(page, finance + '/reports/equity-changes')
  await expect(page.getByTestId('report-partners')).toContainText('MSW 合伙人')
})

test('D11 MSW 导出排队、容量限制、刷新恢复与重建', async ({ page }) => {
  const queuedUrl = routeFor(workspace, 'reporting', 'd11-queued')
  await login(page, queuedUrl)
  const snapshot = await queryReport(page, finance + '/reports/profit-and-loss')
  const job = await exportJob(page, exportsPath, 'report-export-create')
  await expect(page.getByTestId('report-export-download')).toBeDisabled()
  expect((await api(page, exportsPath + '/' + job.id + '/file')).status).toBe(409)
  await page.keyboard.press('Escape')
  const payload = { kind: snapshot.kind, ...snapshot.period, basis: snapshot.basis, watermark: snapshot.watermark, compare: false }
  await changeBusiness(page, exportsPath, payload, 201)
  await changeBusiness(page, exportsPath, payload, 201)
  await uiChange(page, exportsPath, () => page.getByTestId('report-export-create').click(), 409)
  await expect(page.getByText('队列已满，请等待任务完成后重试。')).toBeVisible()
  await page.reload()
  await page.getByTestId('report-export-' + job.id).click()
  await expect(page.getByTestId('report-export-download')).toBeDisabled()
  await page.goto(routeFor(workspace, 'reporting', 'd11'))
  await page.getByTestId('report-export-' + job.id).click()
  const file = await captureFile(page, 'report-export-download')
  expect(file.bytes.toString()).toContain('profit,700')
  const rebuilt = await exportJob(page, exportsPath + '/' + job.id + '/rebuild', 'report-export-rebuild')
  expect(rebuilt.watermark).toBe(job.watermark)
  expect((await captureFile(page, 'report-export-download')).bytes.equals(file.bytes)).toBe(true)
})

test('D11 MSW 账龄分页保留汇总，按同水位读取往来账', async ({ page }) => {
  await login(page, routeFor(workspace, 'aging', 'd11', '&through=' + reportThrough))
  const totals = page.getByTestId('aging-snapshot')
  await expect(totals).toContainText('2,100.00')
  await expect(page.getByTestId('aging-items').getByRole('row').filter({ hasText: /MSW-AR-/ })).toHaveCount(20)
  const page2 = page.waitForResponse(response => new URL(response.url()).searchParams.get('page') === '2' && response.url().includes('/aging/'))
  await page.getByTestId('aging-pagination').getByRole('button', { name: '第 2 页', exact: true }).click()
  expect(new URL((await page2).url()).searchParams.get('watermark')).toBe('42')
  await expect(page.getByTestId('aging-items')).toContainText('MSW-AR-21')
  await expect(totals).toContainText('2,100.00')
  const partner = page.waitForResponse(response => response.url().includes('/partner-ledgers/receivables/'))
  await page.getByRole('button', { name: '往来明细账' }).click()
  expect(new URL((await partner).url()).searchParams.get('watermark')).toBe('42')
  await expect(page.getByTestId('partner-ledger')).toContainText('期末 2,100.00')
})

test('D11 MSW 投影四态与独立财务金额、审批、库存和搜索', async ({ page }) => {
  await login(page, home('d11-pending'))
  await expect(page.getByTestId('projection-status')).toHaveText('待同步')
  for (const [scenario, label] of [['d11-denied', '不可访问'], ['d11-unavailable', '暂不可用'], ['d11', '已同步']] as const) {
    await page.goto(home(scenario))
    await expect(page.getByTestId('projection-status')).toHaveText(label)
    await expect(page.getByTestId('overview-profit')).toContainText('700.00')
  }
  await expect(page.getByTestId('projection-version')).toContainText('版本 7')
  await expect(page.getByTestId('projection-updated')).toContainText('2026-11-22T03:08:00Z')
  await expect(page.getByTestId('live-approval-inbox')).toContainText('MSW-D11-PO')
  await expect(page.getByTestId('live-stock-alerts')).toContainText('可用 0')
  await page.getByTestId('dashboard-search-button').click()
  await page.getByRole('dialog').getByRole('textbox').fill('MSW-SKU-001')
  await page.getByRole('option', { name: /MSW-SKU-001/ }).click()
  await expect(page.getByTestId('catalog-detail-panel')).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveAccessibleName('MSW 演示商品')
})

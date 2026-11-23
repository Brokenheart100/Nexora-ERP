import { expect, test } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { mockWorkspaceId } from '../app/mocks/api/catalog'

const root = '/bff/api/workspaces/' + mockWorkspaceId
const path = (tab: string, scenario = 'd12') => '/settings?tab=' + tab + '&mockCase=' + scenario + '&workspace=' + mockWorkspaceId

test('D12 MSW 公司版本与公告、审计分页及按筛选导出', async ({ page, context }) => {
  test.setTimeout(120_000)
  await context.addCookies([{ name: 'nexora-msw-session', value: String(Date.now()), url: 'http://localhost:3003' }])
  await page.goto(path('company'))
  const brand = page.getByTestId('live-brand-name')
  await expect(brand).toHaveValue('MSW 品牌', { timeout: 60_000 })
  await brand.fill('演示品牌 2026')
  const [saved] = await Promise.all([page.waitForResponse(response => response.request().method() === 'PUT' && new URL(response.url()).pathname === root + '/settings'), page.getByTestId('live-company-save').click()])
  expect(saved.status()).toBe(200)
  expect(saved.request().headers()['if-match']).toBe('"0"')
  expect(saved.request().headers()).not.toHaveProperty('idempotency-key')
  await page.reload()
  await expect(brand).toHaveValue('演示品牌 2026')

  await page.goto('/change-log?mockCase=d12&workspace=' + mockWorkspaceId)
  await page.getByTestId('notification-button').click()
  await expect(page.getByText('演示工作区公告')).toBeVisible()
  await page.keyboard.press('Escape')
  await page.getByTestId('live-audit-entity').fill('WorkspacePreferences')
  await page.getByTestId('live-audit-apply').click()
  const grid = page.getByTestId('live-audit-table')
  await expect(grid.locator('tbody tr')).toHaveCount(20)
  await page.getByRole('button', { name: '下一页' }).click()
  await expect(grid.locator('tbody tr')).toHaveCount(1)
  await expect(page.getByRole('button', { name: '下一页' })).toBeDisabled()
  const [download, exportRequest] = await Promise.all([
    page.waitForEvent('download'),
    page.waitForRequest(request => new URL(request.url()).pathname.endsWith('/record-changes.csv')),
    page.getByTestId('live-audit-export').click()
  ])
  expect(new URL(exportRequest.url()).searchParams.get('entityName')).toBe('WorkspacePreferences')
  const csv = await readFile((await download.path())!, 'utf8')
  expect(csv.split('\n')).toHaveLength(22)
  expect(csv).not.toContain('"Workspace"')
})

test('D12 MSW 报价变化后显示新金额并等待重新确认', async ({ page, context }) => {
  await context.addCookies([{ name: 'nexora-msw-session', value: String(Date.now()), url: 'http://localhost:3003' }])
  await page.goto(path('billing', 'd12-quote-change'))
  await page.getByTestId('live-billing-quote-pro').click()
  await expect(page.getByTestId('live-billing-quote')).toContainText('299')
  let submissions = 0
  page.on('request', (request) => {
    if (request.method() === 'POST' && new URL(request.url()).pathname.endsWith('/billing/local-checkout')) submissions++
  })
  await page.getByTestId('live-checkout-start').click()
  await expect(page.getByTestId('live-billing-quote-problem')).toBeVisible()
  await expect(page.getByTestId('live-billing-quote')).toContainText('300')
  expect(submissions).toBe(0)
  await page.getByTestId('live-checkout-start').click()
  await expect(page.getByTestId('live-checkout-pending')).toBeVisible()
  expect(submissions).toBe(1)
})

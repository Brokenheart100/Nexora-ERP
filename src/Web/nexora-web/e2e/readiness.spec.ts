import { expect, test } from '@playwright/test'

const workspaceId = '11111111-1111-1111-1111-111111111111'

const book = {
  isPersonal: false,
  canInitialize: true,
  settings: { baseCurrency: 'CNY', minorUnits: 2, startsOn: '2026-01-01', fiscalYearStartMonth: 1, template: 'trade' },
  accounts: [],
}

const workspace = {
  id: workspaceId,
  tenantId: '22222222-2222-2222-2222-222222222222',
  name: '验收公司',
  countryCode: 'CN',
  baseCurrency: 'CNY',
  version: 1,
  isPersonal: false,
}

function readiness(ready: boolean, pendingCostCount: number) {
  return {
    ready,
    book: {
      exists: true,
      currency: 'CNY',
      minorUnits: 2,
      startsOn: '2026-01-01',
      lastPostingNumber: 7,
      opening: ready ? 'posted' : 'pending',
      hasPostings: true,
    },
    checks: [
      { code: 'book.opening', severity: ready ? 'pass' : 'warn', count: 1, message: 'Opening balances are pending.' },
      { code: 'documents.posted_without_journal', severity: 'pass', count: 0, message: 'Every posted document has a journal entry.' },
      { code: 'costs.pending_accrual', severity: ready ? 'pass' : 'fail', count: pendingCostCount, message: 'Post pending cost facts.' },
    ],
    missingDocuments: [],
    missingDocumentCount: 0,
    pendingCosts: ready
      ? []
      : [{ id: 'cost-1', on: '2026-02-03', kind: 'receipt', amount: '128.50', reason: 'The accounting period is not open.' }],
    pendingCostCount,
    generatedAt: '2026-11-14T00:00:00.000Z',
  }
}

async function mockWorkspace(page: import('@playwright/test').Page) {
  await page.route('**/bff/me', route => route.fulfill({ json: { name: '验收员', subject: 'e2e' } }))
  await page.route('**/bff/api/workspaces', route => route.fulfill({ json: [workspace] }))
  await page.route('**/bff/api/reports/workspaces/*', route => route.fulfill({ json: { status: 'pending' } }))
  await page.route('**/bff/api/workspaces/*/billing/entitlements', route => route.fulfill({ status: 404, body: '{}' }))
  await page.route('**/bff/api/finance/workspaces/' + workspaceId + '/book', route => route.fulfill({ json: book }))
  await page.route('**/bff/antiforgery', route => route.fulfill({ json: { requestToken: 'e2e-token' } }))
}

test('book tab shows readiness and backfills pending costs', async ({ page }) => {
  let ready = false
  let body: { operationId?: string } | null = null

  await mockWorkspace(page)
  await page.route('**/bff/api/finance/workspaces/' + workspaceId + '/readiness', route =>
    route.fulfill({ json: readiness(ready, ready ? 0 : 1) }))
  await page.route('**/bff/api/finance/workspaces/' + workspaceId + '/readiness/backfill', async (route) => {
    body = route.request().postDataJSON() as { operationId?: string }
    ready = true
    await route.fulfill({
      json: {
        posted: [{ id: 'cost-1', on: '2026-02-03', amount: '128.50', journalId: '33333333-3333-3333-3333-333333333333' }],
        blocked: [],
        replayed: false,
        readiness: readiness(true, 0),
      },
    })
  })

  await page.goto('/?workspace=' + workspaceId)
  const readinessResponse = page.waitForResponse('**/readiness', { timeout: 60_000 })
  await page.getByTestId('module-book').click()
  await readinessResponse
  await expect(page.getByRole('heading', { name: '开账就绪检查' })).toBeVisible({ timeout: 30_000 })
  await expect(page.getByTestId('readiness-summary')).toContainText('库存成本未入账 1 项')
  await expect(page.getByTestId('readiness-costs')).toContainText('采购入库')
  await expect(page.getByTestId('readiness-costs')).toContainText('128.50')

  await page.getByRole('button', { name: '按业务日期补记' }).click()
  await expect(page.getByTestId('readiness-summary')).toContainText('就绪', { timeout: 15_000 })
  await expect(page.getByRole('status').filter({ hasText: '已按业务日期补记 1 项' })).toBeVisible()
  expect(body?.operationId).toMatch(/^[0-9a-f-]{36}$/)
})

test('blocked backfill keeps the cost list and reports the reason', async ({ page }) => {
  await mockWorkspace(page)
  await page.route('**/bff/api/finance/workspaces/' + workspaceId + '/readiness', route =>
    route.fulfill({ json: readiness(false, 1) }))
  await page.route('**/bff/api/finance/workspaces/' + workspaceId + '/readiness/backfill', route =>
    route.fulfill({
      json: {
        posted: [],
        blocked: [{ id: 'cost-1', on: '2026-02-03', amount: '128.50', reason: 'The accounting period is not open.' }],
        replayed: false,
        readiness: readiness(false, 1),
      },
    }))

  await page.goto('/?workspace=' + workspaceId)
  await page.getByTestId('module-book').click()
  await expect(page.getByRole('heading', { name: '开账就绪检查' })).toBeVisible({ timeout: 60_000 })

  await page.getByRole('button', { name: '按业务日期补记' }).click()
  await expect(page.getByRole('status').filter({ hasText: '另有 1 项仍受阻' })).toBeVisible({ timeout: 15_000 })
  await expect(page.getByRole('heading', { name: '补记受阻（1）' })).toBeVisible()
})

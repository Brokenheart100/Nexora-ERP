import { expect, test } from '@playwright/test'

const workspaceId = '11111111-1111-1111-1111-111111111111'

const workspace = {
  id: workspaceId,
  tenantId: '22222222-2222-2222-2222-222222222222',
  name: '验收公司',
  countryCode: 'CN',
  baseCurrency: 'CNY',
  version: 1,
  isPersonal: false,
}

function policy(minutes: number, name: string, lastSeenAt: number) {
  return {
    idleTimeoutMinutes: minutes,
    sources: [{ workspaceId, workspaceName: name, idleTimeoutMinutes: minutes }],
    workspaceCount: 1,
    checkedAt: new Date().toISOString(),
    lastSeenAt,
    cached: false,
    stale: false,
    unavailable: false,
  }
}

async function mockWorkspace(page: import('@playwright/test').Page) {
  await page.route('**/bff/me', route => route.fulfill({ json: { name: '验收员', subject: 'e2e' } }))
  await page.route('**/bff/api/workspaces', route => route.fulfill({ json: [workspace] }))
  await page.route('**/bff/api/reports/workspaces/*', route => route.fulfill({ json: { status: 'pending' } }))
  await page.route('**/bff/api/workspaces/*/billing/entitlements', route => route.fulfill({ status: 404, body: '{}' }))
  await page.route('**/bff/antiforgery', route => route.fulfill({ json: { requestToken: 'e2e-token' } }))
}

test('warns with the shortest workspace policy and extends on continue', async ({ page }) => {
  let activityCalls = 0
  await mockWorkspace(page)
  await page.route(/\/bff\/session-policy(\?.*)?$/, route =>
    route.fulfill({ json: policy(1, '验收公司', Date.now() - 50_000) }))
  await page.route('**/bff/sessions/activity', route => {
    activityCalls += 1
    return route.fulfill({ json: { lastSeenAt: Date.now(), idleTimeoutMinutes: 1 } })
  })

  await page.goto('/?workspace=' + workspaceId)
  const warning = page.getByTestId('session-idle-warning')
  await expect(warning).toBeVisible({ timeout: 30_000 })
  await expect(warning).toContainText('验收公司（1 分钟）')
  await expect(warning).toContainText('00:')

  await warning.getByRole('button', { name: '继续使用' }).click()
  await expect(warning).toBeHidden({ timeout: 5_000 })
  expect(activityCalls).toBeGreaterThan(0)
})

test('announces a policy change without reloading the page', async ({ page }) => {
  let current = policy(30, '阿尔法', Date.now())
  await mockWorkspace(page)
  await page.route(/\/bff\/session-policy(\?.*)?$/, route =>
    route.fulfill({ json: { ...current, lastSeenAt: Date.now() } }))

  const initialPolicy = page.waitForResponse(response => response.url().includes('/bff/session-policy'))
  await page.goto('/?workspace=' + workspaceId)
  await initialPolicy
  await expect(page.getByTestId('session-idle-warning')).toBeHidden()
  current = policy(15, '贝塔', Date.now())
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
  await expect(page.getByText('自动登出策略已更新为 15 分钟，来源：贝塔（15 分钟）')).toBeVisible({ timeout: 15_000 })
})

test('logs out when the shortest idle policy expires', async ({ page }) => {
  let logoutCalls = 0
  await mockWorkspace(page)
  await page.route(/\/bff\/session-policy(\?.*)?$/, route =>
    route.fulfill({ json: policy(1, '验收公司', Date.now() - 58_000) }))
  await page.route('**/bff/logout', route => {
    logoutCalls += 1
    return route.fulfill({ json: { ok: true } })
  })

  await page.goto('/?workspace=' + workspaceId)
  await expect.poll(() => logoutCalls, { timeout: 30_000 }).toBeGreaterThan(0)
})

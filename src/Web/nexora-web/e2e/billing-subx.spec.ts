import { expect, request, test } from '@playwright/test'

const workspaceId = '11111111-1111-1111-1111-111111111111'
const workspace = {
  id: workspaceId,
  tenantId: '22222222-2222-2222-2222-222222222222',
  name: '订阅验收商贸',
  countryCode: 'CN',
  baseCurrency: 'CNY',
  version: 1,
  isPersonal: false,
}

const usage = {
  workspaces: 1, workspacesLimit: 10, members: 3, membersLimit: 50,
  documentsThisMonth: 12, documentsLimit: 20000, period: '2026-11',
}

const plans = [
  { code: 'free', name: '免费版', monthlyPriceCents: 0, currency: 'CNY', limits: { workspaces: 1, members: 3, documentsPerMonth: 500 }, modules: ['company', 'book'] },
  { code: 'standard', name: '标准版', monthlyPriceCents: 9900, currency: 'CNY', limits: { workspaces: 10, members: 50, documentsPerMonth: 20000 }, modules: ['company', 'book', 'sales'] },
  { code: 'pro', name: '专业版', monthlyPriceCents: 29900, currency: 'CNY', limits: { workspaces: 1000, members: 500, documentsPerMonth: 1000000 }, modules: ['company', 'book', 'sales', 'audit'] },
]

function billingView(planCode: string) {
  return {
    workspaceId,
    subscription: {
      workspaceId, planCode, status: planCode === 'free' ? 'canceled' : 'active', effectivePlanCode: planCode,
      periodStartUtc: '2026-11-04T12:00:00.000Z', periodEndUtc: planCode === 'free' ? null : '2026-12-04T12:00:00.000Z',
      version: 3, usage,
    },
    invoices: [],
    plans,
    canManage: true,
  }
}

function entitlements(planCode: string) {
  const plan = plans.find(item => item.code === planCode)!
  return {
    workspaceId, planCode: plan.code, planName: plan.name, status: 'active',
    effectivePlanCode: plan.code, modules: plan.modules, warnings: [], usage,
    periodEndUtc: '2026-12-04T12:00:00.000Z',
  }
}

async function mockWorkspace(page: import('@playwright/test').Page, planCode: string) {
  await page.route('**/bff/me', route => route.fulfill({ json: { name: '验收员', subject: 'e2e' } }))
  await page.route('**/bff/api/workspaces', route => route.fulfill({ json: [workspace] }))
  await page.route('**/bff/api/reports/workspaces/*', route => route.fulfill({ json: { status: 'pending' } }))
  await page.route('**/bff/api/workspaces/' + workspaceId + '/billing/entitlements', route =>
    route.fulfill({ json: entitlements(planCode) }))
  await page.route('**/bff/antiforgery', route => route.fulfill({ json: { requestToken: 'e2e-token' } }))
}

test('signup plan is highlighted and a prorated change waits for confirmation', async ({ page, context }) => {
  let planCode = 'standard'
  let posts = 0
  let body: { planCode?: string; paymentReference?: string; operationId?: string } | null = null

  await context.addCookies([{ name: 'nexora-signup-plan', value: 'pro', url: 'https://localhost:7443', secure: true }])
  await mockWorkspace(page, planCode)
  await page.route('**/bff/api/workspaces/' + workspaceId + '/billing', route => route.fulfill({ json: billingView(planCode) }))
  await page.route('**/bff/api/workspaces/' + workspaceId + '/billing/plan-quote*', route => route.fulfill({
    json: {
      planCode: 'pro', planName: '专业版', monthlyPriceCents: 29900, currency: 'CNY',
      currentPlanCode: 'standard', currentPlanName: '标准版', subscriptionStatus: 'active', prorated: true,
      chargeCents: 19933, creditCents: 6600, amountDueCents: 13333, remainingDays: 20,
      effectiveAtUtc: '2026-11-14T12:00:00.000Z', periodEndUtc: '2026-12-04T12:00:00.000Z',
    },
  }))
  await page.route('**/bff/api/workspaces/' + workspaceId + '/billing/subscription', async (route) => {
    posts += 1
    body = route.request().postDataJSON() as typeof body
    planCode = body?.planCode ?? 'standard'
    await route.fulfill({ json: billingView(planCode) })
  })

  await page.goto('/companies/' + workspaceId + '/billing')
  await expect(page.getByTestId('billing-signup-plan')).toContainText('专业版')
  await expect(page.locator('.plan.signup')).toContainText('注册时选择')

  const proCard = page.locator('.plan').filter({ hasText: '专业版' })
  await proCard.getByRole('button', { name: '查看费用并变更' }).click()
  await expect(page.getByTestId('billing-quote')).toBeVisible()
  await expect(page.getByTestId('quote-current')).toHaveText('标准版')
  await expect(page.getByTestId('quote-target')).toHaveText('专业版')
  await expect(page.getByTestId('quote-remaining')).toHaveText('20 天')
  await expect(page.getByTestId('quote-credit')).toHaveText('¥66.00')
  await expect(page.getByTestId('quote-charge')).toHaveText('¥199.33')
  await expect(page.getByTestId('quote-due')).toHaveText('¥133.33')
  await expect(page.getByTestId('quote-effective')).toHaveText('2026-11-14 12:00:00 UTC')
  await expect(page.getByTestId('quote-period-end')).toHaveText('2026-12-04 12:00:00 UTC')
  expect(posts).toBe(0)

  await page.getByPlaceholder('银行流水号或收据号').fill('BANK-SUBX')
  await page.getByRole('button', { name: '确认变更并登记付款' }).click()
  await expect(page.getByTestId('billing-plan')).toHaveText('专业版')
  await expect(page.getByRole('status').filter({ hasText: '本次应付 ¥133.33' })).toBeVisible()
  expect(posts).toBe(1)
  expect(body?.planCode).toBe('pro')
  expect(body?.paymentReference).toBe('BANK-SUBX')
  expect(body?.operationId).toMatch(/^[0-9a-f-]{36}$/)
  await expect(page.getByTestId('billing-quote')).toHaveCount(0)
  expect((await context.cookies()).find(cookie => cookie.name === 'nexora-signup-plan')?.value ?? '').toBe('')
})

test('a fully credited change needs no reference and still shows the confirmation first', async ({ page }) => {
  let planCode = 'pro'
  let posts = 0
  let body: { planCode?: string; paymentReference?: string | null } | null = null

  await mockWorkspace(page, planCode)
  await page.route('**/bff/api/workspaces/' + workspaceId + '/billing', route => route.fulfill({ json: billingView(planCode) }))
  await page.route('**/bff/api/workspaces/' + workspaceId + '/billing/plan-quote*', route => route.fulfill({
    json: {
      planCode: 'standard', planName: '标准版', monthlyPriceCents: 9900, currency: 'CNY',
      currentPlanCode: 'pro', currentPlanName: '专业版', subscriptionStatus: 'active', prorated: true,
      chargeCents: 4950, creditCents: 14950, amountDueCents: 0, remainingDays: 15,
      effectiveAtUtc: '2026-11-14T12:00:00.000Z', periodEndUtc: '2026-12-04T12:00:00.000Z',
    },
  }))
  await page.route('**/bff/api/workspaces/' + workspaceId + '/billing/subscription', async (route) => {
    posts += 1
    body = route.request().postDataJSON() as typeof body
    planCode = 'standard'
    await route.fulfill({ json: billingView(planCode) })
  })

  await page.goto('/companies/' + workspaceId + '/billing')
  const standardCard = page.locator('.plan').filter({ hasText: '标准版' })
  await standardCard.getByRole('button', { name: '查看费用并变更' }).click()
  await expect(page.getByTestId('quote-due')).toHaveText('¥0.00')
  await expect(page.getByRole('button', { name: '确认变更', exact: true })).toBeVisible()
  await expect(page.getByPlaceholder('银行流水号或收据号')).toHaveCount(0)
  expect(posts).toBe(0)

  await page.getByRole('button', { name: '确认变更', exact: true }).click()
  await expect(page.getByTestId('billing-plan')).toHaveText('标准版')
  await expect(page.getByRole('status').filter({ hasText: '本次无需补款' })).toBeVisible()
  expect(posts).toBe(1)
  expect(body?.paymentReference).toBeNull()
})

test('public pricing shows the published plans and opens registration with the chosen plan', async ({ page }) => {
  await page.route('**/bff/me', route => route.fulfill({ json: { name: '访客', subject: 'e2e' } }))
  await page.route('**/bff/api/workspaces', route => route.fulfill({ json: [] }))
  await page.goto('/pricing')
  await expect(page.getByTestId('pricing-free')).toContainText('免费版')
  await expect(page.getByTestId('pricing-standard')).toContainText('¥99.00')
  await expect(page.getByTestId('pricing-pro')).toContainText('¥299.00')
  await expect(page.getByTestId('pricing-standard')).toContainText('推荐')
  await expect(page.getByTestId('pricing-pro').getByRole('link', { name: '选择专业版并注册' }))
    .toHaveAttribute('href', '/bff/register?plan=pro')
  await expect(page.getByRole('link', { name: '联系服务团队' })).toHaveAttribute('href', /^mailto:support@nexora.example/)
  await expect(page.getByText('确认前不会创建账单或扣费')).toBeVisible()

  const api = await request.newContext({ baseURL: 'https://localhost:7443', ignoreHTTPSErrors: true })
  try {
    const register = await api.get('/bff/register?plan=pro', { maxRedirects: 0 })
    expect(register.status()).toBe(302)
    expect(register.headers()['set-cookie']).toContain('nexora-signup-plan=pro')

    const invalid = await api.get('/bff/register?plan=enterprise', { maxRedirects: 0 })
    expect(invalid.status()).toBe(302)
    expect(invalid.headers()['set-cookie'] ?? '').not.toContain('nexora-signup-plan')
  } finally {
    await api.dispose()
  }
})

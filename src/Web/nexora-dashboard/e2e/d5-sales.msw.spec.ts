import { expect, test, type Page } from '@playwright/test'

async function login(page: Page, area = 'quotes', scenario = 'd5-maker') {
  await page.goto(`/sales?tab=${area}&mockCase=${scenario}`)
  await expect(page.getByTestId('user-menu-trigger')).toContainText('未登录', { timeout: 45_000 })
  await page.getByTestId('user-menu-trigger').click()
  await page.getByRole('menuitem', { name: '登录 Nexora', exact: true }).click()
}

async function select(page: Page, trigger: string, name: RegExp) {
  await page.getByTestId(trigger).click()
  await page.getByRole('option', { name }).click()
}

async function form(page: Page, number: string, kind: 'quote' | 'order' = 'quote') {
  await page.getByTestId(kind === 'quote' ? 'quote-new' : 'sales-new-order').click()
  await page.getByTestId('sales-form-number').fill(number)
  await select(page, 'sales-form-customer', /MSW 销售测试客户/)
  await select(page, 'sales-form-line-item', /MSW-SKU-001/)
  await page.getByTestId('sales-form-line-qty').fill('2')
  await page.getByTestId('sales-form-line-price').fill('10.123456')
}

test('D5 原报价表单发出、转单、提交与撤回，复核人独立批准', async ({ page }) => {
  await login(page, 'quotes', 'd5-dual')
  await expect(page.getByTestId('sales-actor-switch')).toHaveCount(0)
  await form(page, 'D5-Q-001')
  await page.getByTestId('sales-form-submit').click()
  await expect(page.getByTestId('quote-detail-status')).toHaveText('已发送')
  await page.getByTestId('quote-convert').click()
  await page.getByTestId('quote-convert-number').fill('D5-SO-001')
  await page.getByTestId('quote-convert-confirm').click()
  await expect(page.getByTestId('sales-order-detail-status')).toHaveText('草稿')
  await page.getByTestId('sales-order-resubmit').click()
  await expect(page.getByTestId('sales-order-detail-status')).toHaveText('待审批')
  await expect(page.getByTestId('sales-order-approve')).toBeDisabled()
  await expect(page.getByTestId('sales-order-self-approval')).toBeVisible()
  await page.getByTestId('sales-order-withdraw').click()
  await expect(page.getByTestId('sales-order-detail-status')).toHaveText('草稿')
  await page.getByTestId('sales-order-resubmit').click()
  await expect(page.getByTestId('sales-order-detail-status')).toHaveText('待审批')
  await page.goto('/sales?tab=orders&mockCase=d5-reviewer')
  const row = page.getByTestId('sales-orders-table').getByRole('row').filter({ hasText: 'D5-SO-001' })
  await row.getByTestId('sales-orders-open').click()
  await page.getByTestId('sales-order-approve').click()
  await expect(page.getByTestId('sales-order-detail-status')).toHaveText('已批准')
  await page.getByTestId('sales-order-quote-link').click()
  await expect(page.getByTestId('quote-detail-status')).toHaveText('已转单')
  await expect(page.getByTestId('quote-converted-alert')).toContainText('D5-SO-001')
  await expect(page.getByTestId('quote-convert')).toBeDisabled()
})

test('D5 遇到旧版本时保留草稿编辑，读取新版本后才能再次保存', async ({ page }) => {
  await login(page, 'orders', 'd5-stale-edit')
  await form(page, 'D5-CONFLICT', 'order')
  await page.getByTestId('sales-form-save-draft').click()
  await expect(page.getByTestId('sales-order-detail-status')).toHaveText('草稿')
  await page.getByTestId('sales-order-edit').click()
  await page.getByTestId('sales-form-note').fill('旧版本，保留此输入')
  await page.getByTestId('sales-form-save-draft').click()
  await expect(page.getByTestId('sales-submission-status')).toContainText('记录已被修改')
  await expect(page.getByTestId('sales-form-note')).toHaveValue('旧版本，保留此输入')
  await expect(page.getByTestId('sales-form-save-draft')).toBeDisabled()
  await page.getByTestId('sales-reload-version').click()
  await page.getByTestId('sales-form-save-draft').click()
  await expect(page.getByTestId('sales-order-note')).toContainText('旧版本，保留此输入')
})

test('D5 转单响应丢失后回读，按原版本和原幂等键取回同一订单', async ({ page }) => {
  await login(page, 'quotes', 'd5-unknown-convert')
  await form(page, 'D5-LOST-Q')
  await page.getByTestId('sales-form-submit').click()
  await expect(page.getByTestId('quote-detail-status')).toHaveText('已发送')
  await page.getByTestId('quote-convert').click()
  await page.getByTestId('quote-convert-number').fill('D5-LOST-SO')
  const first = page.waitForRequest(request => request.method() === 'POST' && request.url().endsWith('/convert'))
  await page.getByTestId('quote-convert-confirm').click()
  const request = await first
  await expect(page.getByTestId('sales-submission-status')).toContainText('结果待确认')
  await expect(page.getByTestId('sales-retry-submission')).toHaveCount(0)
  await page.getByTestId('sales-check-submission').click()
  const repeating = page.waitForRequest(value => value.method() === 'POST' && value.url().endsWith('/convert'))
  await page.getByTestId('sales-retry-submission').click()
  const replay = await repeating
  expect(replay.postDataJSON()).toEqual(request.postDataJSON())
  expect(replay.headers()['idempotency-key']).toBe(request.headers()['idempotency-key'])
  expect(replay.headers()['if-match']).toBe(request.headers()['if-match'])
  await expect(page.getByTestId('sales-order-detail-status')).toHaveText('草稿')
  await page.getByTestId('sales-order-back').click()
  const matches = page.getByTestId('sales-orders-table').getByRole('row').filter({ hasText: 'D5-LOST-SO' })
  await expect(matches).toHaveCount(1)
})

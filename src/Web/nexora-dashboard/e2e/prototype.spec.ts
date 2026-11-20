import { expect, test } from '@playwright/test'

test('原有 UI 页面、布局和模拟交互保留', async ({ page }) => {
  await page.goto('http://localhost:3001/')
  await expect(page.getByTestId('dashboard-search-button')).toBeVisible()
  await expect(page.getByTestId('kpi-card-1')).toBeVisible()
  await page.getByRole('link', { name: /^(Product catalog|商品目录)$/ }).first().click()
  await expect(page).toHaveURL(/\/catalog/)
  await expect(page.getByRole('heading', { name: '商品目录', exact: true }).first()).toBeVisible()
})

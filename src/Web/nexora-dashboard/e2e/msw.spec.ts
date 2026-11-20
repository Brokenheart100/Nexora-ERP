import { expect, test } from '@playwright/test'
import { catalogSchema } from '../shared/types/wire'
import { mockWorkspaceId } from '../app/mocks/api/handlers'

test('原有 UI 保留，MSW 网络拦截基础可独立使用', async ({ page }) => {
  await page.goto('/catalog')
  await expect(page.getByTestId('dashboard-search-button')).toBeVisible({ timeout: 45_000 })
  const path = `/bff/api/masterdata/workspaces/${mockWorkspaceId}/catalog`
  const intercepted = page.waitForResponse(response => new URL(response.url()).pathname === path)
  const result = await page.evaluate(async (url) => {
    const response = await fetch(url)
    return { status: response.status, data: await response.json() }
  }, path)
  expect((await intercepted).fromServiceWorker()).toBe(true)
  expect(result.status).toBe(200)
  expect(catalogSchema.parse(result.data).page.items[0]?.code).toBe('MSW-SKU-001')
})

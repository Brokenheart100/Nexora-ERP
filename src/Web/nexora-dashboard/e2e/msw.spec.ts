import { expect, test } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
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

test('原用户菜单通过 MSW 登录、恢复会话、重新验证和退出', async ({ page }) => {
  await page.goto('/catalog')
  const menu = page.getByTestId('user-menu-trigger')
  await expect(menu).toContainText('未登录', { timeout: 45_000 })
  await menu.click()
  await expect(page.getByRole('menuitem', { name: '邮箱验证码登录', exact: true })).toBeVisible()
  await expect(page.getByRole('menuitem', { name: '邮箱开通账户', exact: true })).toBeVisible()
  await page.getByRole('menuitem', { name: '登录 Nexora', exact: true }).click()
  await expect(page).toHaveURL(/\/catalog$/)
  await expect(menu).toContainText('MSW 演示账号', { timeout: 45_000 })
  await page.reload()
  await expect(menu).toContainText('MSW 演示账号', { timeout: 45_000 })
  await menu.click()
  const reauth = page.waitForRequest(request => new URL(request.url()).pathname === '/bff/login' && new URL(request.url()).searchParams.get('prompt') === 'login')
  await page.getByRole('menuitem', { name: '重新验证身份', exact: true }).click()
  await reauth
  await expect(menu).toContainText('MSW 演示账号', { timeout: 45_000 })
  await menu.click()
  const logout = page.waitForResponse(response => new URL(response.url()).pathname === '/bff/logout' && response.request().method() === 'POST')
  await page.getByRole('menuitem', { name: '退出登录', exact: true }).click()
  expect((await logout).fromServiceWorker()).toBe(true)
  await expect(menu).toContainText('未登录', { timeout: 45_000 })
  await page.reload()
  await expect(menu).toContainText('未登录', { timeout: 45_000 })
})

test('原用户菜单明确显示会话服务不可用', async ({ page }) => {
  await page.goto('/catalog?mockCase=session-unavailable')
  await expect(page.getByTestId('user-menu-trigger')).toContainText('登录状态不可用', { timeout: 45_000 })
  await page.getByTestId('user-menu-trigger').click()
  await expect(page.getByRole('menuitem', { name: '重试读取登录状态', exact: true })).toBeVisible()
  await expect(page.getByRole('menuitem', { name: '演示身份', exact: true })).toHaveCount(0)
})

test('邀请登录回到原设置页', async ({ page }) => {
  await page.goto('/join?invite=local-example')
  await expect(page.getByTestId('dashboard-search-button')).toBeVisible({ timeout: 45_000 })
  await expect(page.getByTestId('invitation-login-status')).toContainText('请先登录')
  await page.getByTestId('user-menu-trigger').click()
  await page.getByRole('menuitem', { name: '邮箱验证码登录', exact: true }).click()
  await expect(page).toHaveURL(/\/join\?invite=local-example$/)
  await expect(page.getByTestId('user-menu-trigger')).toContainText('MSW 演示账号', { timeout: 45_000 })
  await expect(page.getByTestId('invitation-login-status')).toContainText('当前邀请尚未接受')
  await expect(page.getByTestId('settings-invitations')).toBeVisible()
})

test('原用户菜单保留键盘操作、响应式布局与语言切换', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('/catalog')
  const menu = page.getByTestId('user-menu-trigger').filter({ visible: true })
  await expect(menu).toContainText('未登录', { timeout: 45_000 })
  await menu.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('menuitem', { name: '登录 Nexora', exact: true })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(menu).toBeFocused()
  await menu.press('Enter')
  await page.getByRole('menuitem', { name: '登录 Nexora', exact: true }).focus()
  await page.keyboard.press('Enter')
  await expect(menu).toContainText('MSW 演示账号', { timeout: 45_000 })
  await expect(menu).toHaveAttribute('aria-label', 'MSW 演示账号')
  const directory = resolve(import.meta.dirname, '../../../../artifacts/dashboard-d1-original-ui')
  mkdirSync(directory, { recursive: true })
  for (const width of [1440, 1024, 768, 320]) {
    await page.setViewportSize({ width, height: 1000 })
    await page.goto('/catalog')
    if (width < 1024) await page.getByRole('button', { name: '打开侧边栏', exact: true }).click()
    await expect(menu).toContainText('MSW 演示账号', { timeout: 45_000 })
    await expect(menu).toBeVisible()
    await expect.poll(async () => {
      const bounds = await menu.boundingBox()
      return !!bounds && bounds.x >= 0 && bounds.x + bounds.width <= width
    }).toBe(true)
    await page.screenshot({ path: resolve(directory, `msw-${width}.png`), animations: 'disabled', fullPage: true })
  }
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('/catalog')
  await page.getByTestId('locale-switch').filter({ visible: true }).click()
  await page.getByRole('option', { name: 'English', exact: true }).click()
  await menu.click()
  await expect(page.getByRole('menuitem', { name: 'Sign out', exact: true })).toBeVisible()
  expect(errors).toEqual([])
})

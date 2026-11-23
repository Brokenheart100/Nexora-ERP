import { expect, test } from '@playwright/test'
import { mockWorkspaceId } from '../app/mocks/api/catalog'

test('D13 MSW 关闭 MFA 时隐藏验证入口并展示删除阻断原因', async ({ page, context }) => {
  await context.addCookies([{ name: 'nexora-msw-session', value: String(Date.now()), url: 'http://localhost:3003' }])
  await page.goto('/?mockCase=d13-mfa-disabled&workspace=' + mockWorkspaceId)
  await page.getByTestId('user-menu-trigger').click()
  await expect(page.getByRole('menuitem', { name: '重新验证身份' })).toHaveCount(0)
  await page.getByRole('menuitem', { name: '安全设置', exact: true }).click()
  await expect(page.getByTestId('live-mfa-status')).toHaveText('MFA 能力已关闭')
  await expect(page.getByRole('link', { name: '重新验证身份' })).toHaveCount(0)
  await page.getByTestId('live-deletion-preflight').click()
  await expect(page.getByTestId('live-deletion-review')).toContainText('当前账号是最后一个有效管理员')
  await expect(page.getByTestId('live-deletion-review')).toContainText('还需核对业务记录保留要求')
  await page.getByRole('tab', { name: '登录会话' }).click()
  await expect(page.getByTestId('live-session-policy')).toContainText('空闲 30 分钟后退出')
  await expect(page.getByText('当前会话', { exact: true })).toBeVisible()
})

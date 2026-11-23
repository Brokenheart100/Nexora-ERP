import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { api, baseline, completeEmailLogin, completePasswordLogin, origin, repository, write } from './helpers'
import { localTicket } from './runtime'

test('D1 原用户菜单真实登录、刷新恢复、MFA 重新验证与退出', async ({ page }) => {
  await page.goto('/catalog')
  const menu = page.getByTestId('user-menu-trigger')
  await expect(page.getByTestId('dashboard-search-button')).toBeVisible()
  await expect(menu).toContainText('未登录')
  await menu.click()
  await page.getByRole('menuitem', { name: '登录 Nexora', exact: true }).click()
  await completePasswordLogin(page, 'alice', '/catalog')
  await expect(menu).toContainText('alice')
  await localTicket(page, (ticket) => {
    ticket.expiresAt = Date.now() - 1000
  })
  await page.reload()
  await expect(menu).toContainText('alice')
  expect((await localTicket(page)).expiresAt).toBeGreaterThan(Date.now() + 60_000)
  await localTicket(page, (ticket) => {
    ticket.mfaAt = Date.now() - 600_000
  })
  const denied = await write(page, `/bff/api/workspaces/${baseline.workspace.id}/settings`, 'PUT', {})
  expect(denied.status).toBe(403)
  expect(JSON.parse(denied.text).data.code).toBe('mfa_step_up_required')
  await menu.click()
  await page.getByRole('menuitem', { name: '重新验证身份', exact: true }).click()
  await completePasswordLogin(page, 'alice', '/catalog')
  await expect(menu).toContainText('alice')
  const capabilities = JSON.parse((await api(page, '/bff/security/capabilities')).text)
  expect(Date.parse(capabilities.lastVerifiedAt)).toBeGreaterThan(Date.now() - 60_000)
  const evidence = resolve(repository, 'artifacts/dashboard-d1-original-ui')
  mkdirSync(evidence, { recursive: true })
  await page.screenshot({ path: resolve(evidence, 'real-session.png'), fullPage: true })
  await menu.click()
  const returned = page.waitForEvent('framenavigated', { predicate: frame => frame === page.mainFrame() && frame.url() === origin + '/' })
  await page.getByRole('menuitem', { name: '退出登录', exact: true }).click()
  await returned
  await expect(menu).toContainText('未登录')
  expect((await api(page, '/bff/me')).status).toBe(401)
})

test('D1 原设置页受邀邮箱登录回跳及原菜单开通账户', async ({ page }) => {
  const invitation = '/join?invite=local-example'
  await page.goto(invitation)
  await expect(page.getByTestId('invitation-login-status')).toContainText('请先登录')
  await page.getByTestId('user-menu-trigger').click()
  await page.getByRole('menuitem', { name: '邮箱验证码登录', exact: true }).click()
  await completeEmailLogin(page, baseline.reader.email, invitation)
  const identity = JSON.parse((await api(page, '/bff/me')).text)
  await expect(page.getByTestId('user-menu-trigger')).toContainText(identity.name)
  await expect(page.getByTestId('invitation-login-status')).toContainText('当前邀请尚未接受')
  await expect(page.getByTestId('settings-invitations')).toBeVisible()
  const returned = page.waitForEvent('framenavigated', { predicate: frame => frame === page.mainFrame() && frame.url() === origin + '/' })
  await page.getByTestId('user-menu-trigger').click()
  await page.getByRole('menuitem', { name: '退出登录', exact: true }).click()
  await returned
  await expect(page.getByTestId('user-menu-trigger')).toContainText('未登录')
  await page.getByTestId('user-menu-trigger').click()
  await page.getByRole('menuitem', { name: '邮箱开通账户', exact: true }).click()
  await completeEmailLogin(page, `dashboard-d1-ui-${Date.now()}@example.invalid`)
  const registered = await api(page, '/bff/me')
  expect(registered.status).toBe(200)
  await expect(page.getByTestId('user-menu-trigger')).toContainText(JSON.parse(registered.text).name)
})

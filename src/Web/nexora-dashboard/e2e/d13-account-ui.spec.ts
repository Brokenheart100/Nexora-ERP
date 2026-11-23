import { setTimeout } from 'node:timers/promises'
import { expect, test, type Page } from '@playwright/test'
import { api, emailLogin, login, origin, write } from './helpers'
import { changeBusiness, readBusiness } from './business-actions'
import type { SessionPolicy, SessionSummary } from '../shared/types/auth'
import type { CompanySettings, InvitationReceipt } from '../shared/types/workspace-administration'
import type { WireAccess, WireWorkspace } from '../shared/types/wire'

test.use({ trace: 'off', screenshot: 'off', video: 'off' })
const company = (id: string) => '/bff/api/workspaces/' + id
const tag = () => crypto.randomUUID().slice(0, 8)

async function loginByEmail(page: Page, email: string, register = false) {
  await emailLogin(page, email, register)
  await expect(page.getByTestId('user-menu-trigger')).toHaveAttribute('aria-label', new RegExp(email.split('@')[0]!))
}

async function openSecurity(page: Page) {
  await page.getByTestId('user-menu-trigger').click()
  await page.getByRole('menuitem', { name: '安全设置', exact: true }).click()
  await expect(page.getByTestId('live-account-security')).toBeVisible()
}

async function current(page: Page) {
  return (await readBusiness<{ sessions: SessionSummary[] }>(page, '/bff/sessions')).sessions.find(item => item.current)!
}

test('D13 账户预检、真实活动、策略来源及会话撤销', async ({ browser, page }) => {
  test.setTimeout(350_000)
  const marker = tag()
  const email = 'd13-account-' + marker + '@example.invalid'
  const otherContext = await browser.newContext({ baseURL: origin })
  const thirdContext = await browser.newContext({ baseURL: origin })
  try {
    const other = await otherContext.newPage()
    const third = await thirdContext.newPage()
    await loginByEmail(page, email, true)
    const first = await changeBusiness<WireWorkspace>(page, '/bff/api/workspaces', { name: 'D13 安全 ' + marker }, 201)
    const second = await changeBusiness<WireWorkspace>(page, '/bff/api/workspaces', { name: 'D13 策略 ' + marker }, 201)
    await page.goto('/?workspace=' + first.id)
    await expect(page.getByTestId('workspace-menu-trigger')).toContainText(first.name)
    await page.context().clearCookies({ name: '__Host-NexoraDashboard.Csrf' })
    const [tokenOne, tokenTwo] = await Promise.all([api(page, '/bff/antiforgery'), api(page, '/bff/antiforgery')])
    expect([tokenOne.status, tokenTwo.status]).toEqual([200, 200])
    expect(tokenOne.text === tokenTwo.text).toBe(true)
    await openSecurity(page)
    await expect(page.getByTestId('live-mfa-status')).toHaveText('敏感操作需要重新验证')
    await expect(page.getByTestId('live-account-provider')).toHaveAttribute('href', '/bff/account')
    const account = await page.request.get(origin + '/bff/account', { maxRedirects: 0 })
    expect(account.status()).toBe(302)
    expect(new URL(account.headers()['location']!).pathname).toMatch(/\/realms\/nexora\/account\/$/)
    await page.getByTestId('live-deletion-preflight').click()
    await expect(page.getByTestId('live-deletion-review')).toContainText('当前账号是最后一个有效管理员')
    await expect(page.getByTestId('live-deletion-review')).toContainText(first.name)

    await page.getByRole('tab', { name: '登录会话' }).click()
    const policyPanel = page.getByTestId('live-session-policy')
    await page.getByRole('button', { name: '读取最新策略' }).click()
    await expect(policyPanel).toContainText(first.name)
    await expect(policyPanel).toContainText(second.name)
    await setTimeout(16_000)
    const before = await readBusiness<SessionPolicy>(page, '/bff/session-policy')
    expect((await api(page, '/bff/sessions')).status).toBe(200)
    await page.evaluate(() => window.dispatchEvent(new PointerEvent('pointerdown')))
    expect((await readBusiness<SessionPolicy>(page, '/bff/session-policy')).lastSeenAt).toBe(before.lastSeenAt)
    await page.bringToFront()
    const [activity] = await Promise.all([
      page.waitForResponse(response => new URL(response.url()).pathname === '/bff/sessions/activity'),
      page.getByRole('button', { name: '刷新会话' }).click()
    ])
    expect(activity.status()).toBe(200)
    expect((await activity.json()).lastSeenAt).toBeGreaterThan(before.lastSeenAt)

    await page.getByTestId('security-close').click()
    await page.getByTestId('workspace-menu-trigger').click()
    const [updated] = await Promise.all([
      page.waitForResponse(response => new URL(response.url()).pathname === '/bff/session-policy' && new URL(response.url()).searchParams.get('refresh') === '1'),
      page.getByRole('menuitemcheckbox', { name: second.name }).click()
    ])
    expect(updated.status()).toBe(200)
    expect((await updated.json()).idleTimeoutMinutes).toBe(before.idleTimeoutMinutes)

    await loginByEmail(other, email)
    const peer = await current(other)
    await openSecurity(page)
    await page.getByRole('tab', { name: '登录会话' }).click()
    const row = page.getByTestId('live-session-' + peer.id)
    await row.getByRole('button', { name: '撤销', exact: true }).click()
    await page.getByTestId('live-confirm-session-revoke').click()
    await expect(row).toHaveCount(0)
    expect((await api(other, '/bff/me')).status).toBe(401)

    await loginByEmail(third, email)
    const peerTwo = await current(third)
    await page.getByRole('button', { name: '刷新会话' }).click()
    await expect(page.getByTestId('live-session-' + peerTwo.id)).toBeVisible()
    await page.getByTestId('live-revoke-others').click()
    await page.getByTestId('live-confirm-session-revoke').click()
    await expect(page.getByTestId('live-session-' + peerTwo.id)).toHaveCount(0)
    expect((await api(third, '/bff/me')).status).toBe(401)
    expect((await api(page, '/bff/me')).status).toBe(200)
    await page.getByRole('tab', { name: '设备授权' }).click()
    await expect(page.getByTestId('live-device-authorization').getByText('nexora-mcp', { exact: false })).toBeVisible()
  } finally {
    await otherContext.close()
    await thirdContext.close()
  }
})

test('D13 Organization 一分钟空闲政策按下一次访问生效', async ({ browser, page }) => {
  test.setTimeout(220_000)
  const marker = tag()
  const email = 'd13-idle-' + marker + '@example.invalid'
  const context = await browser.newContext({ baseURL: origin })
  let configured: { root: string, original: CompanySettings } | undefined
  try {
    const guest = await context.newPage()
    await loginByEmail(guest, email, true)
    await login(page)
    const workspace = await changeBusiness<WireWorkspace>(page, '/bff/api/workspaces', { name: 'D13 空闲 ' + marker }, 201)
    const root = company(workspace.id)
    const access = await readBusiness<WireAccess>(page, root + '/access')
    const invited = await write(page, root + '/invitations', 'POST', { email, role: 'WorkspaceReader', businessRoles: [], operationId: crypto.randomUUID() }, { 'If-Match': `"${access.authorizationVersion}"` })
    expect(invited.status).toBe(201)
    const receipt = JSON.parse(invited.text) as InvitationReceipt
    expect((await write(guest, '/bff/api/invitations/' + receipt.invitation.id + '/redeem', 'POST', { token: receipt.token })).status).toBe(200)
    const original = await readBusiness<CompanySettings>(page, root + '/settings')
    const change = await write(page, root + '/settings', 'PUT', { presentation: original.presentation, sessionIdleMinutes: 1 }, { 'If-Match': `"${original.version}"` })
    expect(change.status).toBe(200)
    configured = { root, original }
    const policy = await readBusiness<SessionPolicy>(guest, '/bff/session-policy?refresh=1')
    expect(policy.idleTimeoutMinutes).toBe(1)
    expect(policy.sources.some(item => item.workspaceId === workspace.id)).toBe(true)
    await guest.reload()
    await expect(guest.getByTestId('user-menu-trigger')).not.toHaveAttribute('aria-label', /^(登录状态不可用|未登录)$/)
    await expect.poll(async () => (await api(guest, '/bff/me')).status, { timeout: 75_000, intervals: [2000, 5000] }).toBe(401)
    await expect(guest.getByTestId('user-menu-trigger')).toHaveAttribute('aria-label', /^(登录状态不可用|未登录)$/)
  } finally {
    if (configured) {
      if ((await api(page, '/bff/me')).status === 401) await login(page)
      const { root, original } = configured
      const latest = await readBusiness<CompanySettings>(page, root + '/settings')
      const result = await write(page, root + '/settings', 'PUT', {
        presentation: original.presentation, sessionIdleMinutes: original.sessionIdleMinutes
      }, { 'If-Match': `"${latest.version}"` })
      expect(result.status).toBe(200)
    }
    await context.close()
  }
})

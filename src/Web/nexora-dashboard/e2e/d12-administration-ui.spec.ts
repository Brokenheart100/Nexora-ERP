import { readFile } from 'node:fs/promises'
import { expect, test, type Page } from '@playwright/test'
import { api, completeEmailLogin, emailLogin, login, origin, write } from './helpers'
import { changeBusiness, chooseOption, readBusiness, uiChange } from './business-actions'
import type { CompanySettings, InvitationReceipt, OrganizationMember, RoleGrant } from '../shared/types/workspace-administration'
import type { BillingCheckoutIntent, OrganizationBilling } from '../shared/types/organization-billing'
import type { WireAccess, WireAccount, WireWorkspace } from '../shared/types/wire'

test.use({ trace: 'off', screenshot: 'off', video: 'off' })
const suffix = () => crypto.randomUUID().slice(0, 8)
const organization = (workspace: string) => '/bff/api/workspaces/' + workspace
const settings = (workspace: string, tab: string) => '/settings?workspace=' + workspace + '&tab=' + tab
const service = (id: string, name: string) => '/bff/api/' + name + '/workspaces/' + id

async function create(page: Page, name: string, personal = false) {
  await page.getByTestId('workspace-menu-trigger').click()
  await page.getByRole('menuitem', { name: personal ? '新建个人工作区' : '新建企业工作区' }).click()
  await page.getByTestId('live-workspace-name').fill(name)
  return uiChange<WireWorkspace>(page, '/bff/api/workspaces' + (personal ? '/personal' : ''), () => page.getByTestId('live-workspace-create').click(), 201)
}

async function currentVersion(page: Page, root: string) {
  return (await readBusiness<WireAccess>(page, root + '/access')).authorizationVersion
}

async function invite(page: Page, root: string, email: string, role = 'WorkspaceReader', businessRoles: string[] = []) {
  const response = await write(page, root + '/invitations', 'POST', { email, role, businessRoles, operationId: crypto.randomUUID() }, { 'If-Match': `"${await currentVersion(page, root)}"` })
  expect(response.status).toBe(201)
  return JSON.parse(response.text) as InvitationReceipt
}

async function joinFromLink(page: Page, id: string, token: string) {
  try {
    await page.goto('/join#' + id + '.' + token)
  } catch {
    throw new Error('本地邀请页加载失败')
  }
  await expect(page).toHaveURL(origin + '/join')
}

async function mailInvitation(email: string, id: string) {
  const expectedOrigin = process.env.NEXORA_TEST_INVITATION_ORIGIN ?? origin
  const url = 'http://localhost:8025/api/v1/search?query=' + encodeURIComponent('to:' + email)
  let token = ''
  await expect.poll(async () => {
    const { messages } = await (await fetch(url)).json()
    for (const mail of messages ?? []) {
      const { Text, HTML } = await (await fetch('http://localhost:8025/api/v1/message/' + mail.ID)).json()
      const link = new RegExp('(https://[^/\\s]+)/join#' + id + '\\.([a-f0-9]{64})', 'i').exec([Text, HTML].join('\n'))
      if (link) {
        expect(link[1]).toBe(expectedOrigin)
        token = link[2]!
      }
      if (token) return true
    }
    return false
  }).toBe(true)
  return token
}

test('D12 工作区、品牌、个人账本、成员权限及六源审计', async ({ page }) => {
  const tag = suffix()
  await login(page)
  const workspace = await create(page, 'D12 组织 ' + tag)
  const root = organization(workspace.id)
  await expect(page.getByTestId('live-workspace-setup')).toBeVisible()
  await expect(page.getByTestId('finance-workbench')).toBeVisible()
  const original = await readBusiness<CompanySettings>(page, root + '/settings')
  const brand = 'D12 品牌 ' + tag
  await page.getByTestId('live-brand-name').fill(brand)
  await uiChange(page, root + '/settings', () => page.getByTestId('live-company-save').click(), 200, 'PUT')
  expect((await write(page, root + '/settings', 'PUT', { presentation: original.presentation }, { 'If-Match': `"${original.version}"` })).status).toBe(412)
  await page.reload()
  await expect(page.getByTestId('live-brand-name')).toHaveValue(brand)
  await expect(page.getByTestId('finance-workbench')).toBeVisible()
  await page.getByTestId('finance-book-start').fill('2026-01-01')
  await uiChange(page, service(workspace.id, 'finance') + '/book', () => page.getByTestId('finance-book-initialize').click())
  await expect(page.getByTestId('finance-book-status')).toContainText('2026-01-01')
  await expect(page.getByRole('link', { name: '维护科目表' })).toHaveAttribute('href', /^\/finance\?.*tab=accounts/)
  await page.reload()
  await expect(page.getByTestId('finance-book-status')).toContainText('2026-01-01')

  const workspaces = await readBusiness<WireWorkspace[]>(page, '/bff/api/workspaces')
  const personal = workspaces.find(item => item.isPersonal) ?? await create(page, 'D12 个人 ' + tag, true)
  expect(personal.isPersonal).toBe(true)
  await page.goto(settings(workspace.id, 'company'))
  const links = page.getByTestId('live-personal-links')
  const linkPath = root + '/personal-links/' + personal.id
  await uiChange(page, linkPath, () => links.getByRole('button', { name: '链接', exact: true }).click(), 200, 'PUT')
  await uiChange(page, linkPath, () => links.getByRole('button', { name: '解除链接' }).click(), 200, 'PUT')
  await expect(links.getByRole('button', { name: '链接', exact: true })).toBeVisible()
  expect((await api(page, root + '/announcements')).status).toBe(200)

  await page.goto(settings(workspace.id, 'members'))
  const [owner] = await readBusiness<OrganizationMember[]>(page, root + '/members')
  await page.getByTestId('live-member-' + owner!.id).click()
  await page.getByTestId('live-member-active').click()
  await uiChange(page, root + '/members/' + owner!.id, () => page.getByTestId('live-member-save').click(), 409)
  await expect(page.getByTestId('administration-action-status')).toBeVisible()

  await page.goto('/change-log?workspace=' + workspace.id)
  const tables = page.getByTestId('live-audit-table')
  await expect(tables.getByText('WorkspacePreferences').first()).toBeVisible()
  await page.getByTestId('live-audit-entity').fill('WorkspacePreferences')
  await Promise.all([
    page.waitForResponse(response => new URL(response.url()).searchParams.get('entityName') === 'WorkspacePreferences'),
    page.getByTestId('live-audit-apply').click()
  ])
  const preferenceRow = tables.locator('tbody tr').filter({ hasText: 'WorkspacePreferences' }).first()
  await preferenceRow.getByRole('button', { name: '查看变更' }).click()
  await expect(page.getByTestId('live-audit-snapshot')).toContainText(brand)
  await page.keyboard.press('Escape')
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('live-audit-export').click()])
  const csv = await readFile((await download.path())!, 'utf8')
  expect(csv).toContain('WorkspacePreferences')
  expect(csv).not.toContain('WorkspaceMember')
  await expect(preferenceRow.getByRole('link', { name: '打开来源' })).toHaveAttribute('href', /\/settings\?.*tab=company/)
  for (const service of ['purchasing', 'sales', 'finance', 'masterdata', 'inventory']) {
    const path = '/bff/api/' + service + '/workspaces/' + workspace.id
    expect((await api(page, path + '/record-changes?page=2&pageSize=1')).status).toBe(200)
    expect((await api(page, path + '/record-changes.csv?entityName=WorkspacePreferences')).headers['content-type']).toContain('text/csv')
    if (['purchasing', 'sales', 'finance'].includes(service)) expect((await api(page, path + '/audit?targetId=' + workspace.id)).status).toBe(200)
  }
  await page.goto('/purchase-audit?workspace=' + workspace.id)
  await expect(page.getByTestId('live-workspace-audit')).toBeVisible()
  await expect(tables).toBeVisible()
})

test('D12 独立批准、邮件回跳、成员停用与部门授权', async ({ page, browser }) => {
  test.setTimeout(360_000)
  const tag = suffix()
  const reviewerContext = await browser.newContext({ baseURL: origin })
  const guestContext = await browser.newContext({ baseURL: origin })
  try {
    const reviewer = await reviewerContext.newPage()
    const guest = await guestContext.newPage()
    await login(page)
    await login(reviewer, 'bob')
    const workspace = await create(page, 'D12 授权 ' + tag)
    const root = organization(workspace.id)
    const reviewerAccount = await readBusiness<WireAccount>(reviewer, '/bff/api/me')
    const ownerInvite = await invite(page, root, reviewerAccount.verifiedEmail!, 'WorkspaceOwner')
    await joinFromLink(reviewer, ownerInvite.invitation.id, ownerInvite.token)
    await uiChange(reviewer, '/bff/api/invitations/' + ownerInvite.invitation.id + '/redeem', () => reviewer.getByTestId('live-invitation-redeem').click())
    await expect(reviewer).toHaveURL(new RegExp('workspace=' + workspace.id))

    await page.goto(settings(workspace.id, 'invitations'))
    const mailbox = 'd12-invite-' + tag + '@example.invalid'
    await page.getByTestId('live-invitation-email').fill(mailbox)
    await chooseOption(page, 'execution-role-purchase-role', '采购经办')
    const pending = await uiChange<InvitationReceipt>(page, root + '/invitations', () => page.getByTestId('live-invitation-create').click(), 201)
    expect(pending.invitation.state).toBe('PendingApproval')
    await expect(page.getByTestId('live-invitation-approve')).toHaveCount(0)
    await reviewer.goto(settings(workspace.id, 'invitations'))
    await reviewer.getByTestId('live-invitation-' + pending.invitation.id).click()
    const approvalPath = root + '/invitations/' + pending.invitation.id + '/approve'
    const [approved] = await Promise.all([reviewer.waitForResponse(response => new URL(response.url()).pathname === approvalPath), reviewer.getByTestId('live-invitation-approve').click()])
    expect(approved.status()).toBe(200)
    const token = await mailInvitation(mailbox, pending.invitation.id)
    const redeemPath = '/bff/api/invitations/' + pending.invitation.id + '/redeem'
    await joinFromLink(reviewer, pending.invitation.id, token)
    await uiChange(reviewer, redeemPath, () => reviewer.getByTestId('live-invitation-redeem').click(), 409)
    await expect(reviewer.getByTestId('administration-action-status')).toBeVisible()

    await joinFromLink(guest, pending.invitation.id, token)
    await expect(guest.getByTestId('invitation-login-status')).toContainText('请先登录')
    await guest.getByRole('link', { name: '注册', exact: true }).click()
    await completeEmailLogin(guest, mailbox, '/join')
    await uiChange(guest, redeemPath, () => guest.getByTestId('live-invitation-redeem').click())
    expect((await write(guest, redeemPath, 'POST', { token })).status).toBe(409)
    const access = await readBusiness<WireAccess>(guest, root + '/access')
    await guest.goto('/change-log?workspace=' + workspace.id)
    await expect(guest.getByText('当前工作区未授予审计权限或未启用审计模块')).toBeVisible()
    expect((await api(guest, root + '/record-changes')).status).toBe(403)

    await page.goto(settings(workspace.id, 'departments'))
    await page.getByTestId('live-department-name').fill('D12 部门')
    await uiChange(page, root + '/departments', () => page.getByTestId('live-department-create').click())
    await page.goto(settings(workspace.id, 'roles'))
    await page.getByTestId('live-role-name').fill('D12 部门采购复核')
    await page.getByRole('checkbox', { name: 'purchasing.order.approve' }).click()
    await uiChange(page, root + '/custom-roles', () => page.getByTestId('live-role-save').click())
    await page.goto(settings(workspace.id, 'governance'))
    await chooseOption(page, 'live-grant-member', mailbox)
    await chooseOption(page, 'live-grant-role', 'D12 部门采购复核 · 版本 1')
    await chooseOption(page, 'live-grant-scope', '部门')
    await chooseOption(page, 'live-grant-resource', 'D12 部门')
    const grant = await uiChange<RoleGrant>(page, root + '/role-grants', () => page.getByTestId('live-grant-submit').click())
    const grantId = 'live-grant-' + grant.id
    await expect(page.getByTestId(grantId)).toContainText('已批准 0/1')
    await reviewer.goto(settings(workspace.id, 'governance'))
    const approvedGrant = await uiChange<RoleGrant>(reviewer, root + '/role-grants/' + grant.id, () => reviewer.getByTestId(grantId).getByRole('button', { name: '批准授权' }).click())
    expect(approvedGrant.state).toBe('Active')
    expect((await readBusiness<WireAccess>(guest, root + '/access')).scopedPermissions?.some(item => item.departmentId === grant.scopeId)).toBe(true)
    await page.reload()
    await uiChange(page, root + '/role-grants/' + grant.id, () => page.getByTestId(grantId).getByRole('button', { name: '撤销授权' }).click())
    expect((await readBusiness<WireAccess>(guest, root + '/access')).scopedPermissions?.some(item => item.departmentId === grant.scopeId)).not.toBe(true)

    const inventory = service(workspace.id, 'inventory')
    const finance = service(workspace.id, 'finance')
    const main = await changeBusiness(page, inventory + '/warehouses', { code: 'D12-MAIN', name: 'D12 可访问仓库' }, 201)
    const other = await changeBusiness(page, inventory + '/warehouses', { code: 'D12-OTHER', name: 'D12 另一仓库' }, 201)
    await changeBusiness(page, finance + '/book', { baseCurrency: 'CNY', startsOn: '2026-01-01', fiscalYearStartMonth: 1 })
    const actor = await readBusiness<WireAccess>(page, root + '/access')
    const roleChange = root + '/members/' + actor.memberId + '/finance-role'
    await page.goto(settings(workspace.id, 'members'))
    await page.getByTestId('live-member-' + actor.memberId).click()
    await chooseOption(page, 'execution-role-finance-role', '财务复核')
    await uiChange(page, roleChange, () => page.getByRole('button', { name: '提交单项申请' }).click())
    await reviewer.goto(settings(workspace.id, 'members'))
    await reviewer.getByTestId('live-member-' + actor.memberId).click()
    await uiChange(reviewer, roleChange, () => reviewer.getByRole('button', { name: '批准单项' }).click())
    await changeBusiness(page, finance + '/ledger/periods/2026-02-01', { expectedVersion: 0, action: 'open', reason: 'D12 会计期间范围验证' })
    for (const scope of [
      { name: 'D12 仓库读取', permission: 'inventory.stock.read', type: '仓库', resource: 'D12 可访问仓库', allowed: inventory + '/warehouses/' + main.id + '/positions', denied: inventory + '/warehouses/' + other.id + '/positions', code: 404 },
      { name: 'D12 期间读取', permission: 'finance.ledger.read', type: '会计期间', resource: null, allowed: finance + '/ledger/periods/2026-02-01', denied: finance + '/ledger/periods/2027-02-01', code: 403 }
    ]) {
      await page.goto(settings(workspace.id, 'roles'))
      await page.getByTestId('live-role-name').fill(scope.name)
      await page.getByRole('checkbox', { name: scope.permission }).click()
      await uiChange(page, root + '/custom-roles', () => page.getByTestId('live-role-save').click())
      await page.goto(settings(workspace.id, 'governance'))
      await chooseOption(page, 'live-grant-member', mailbox)
      await chooseOption(page, 'live-grant-role', scope.name + ' · 版本 1')
      await chooseOption(page, 'live-grant-scope', scope.type)
      if (scope.resource) await chooseOption(page, 'live-grant-resource', scope.resource)
      else {
        await page.getByTestId('live-grant-start').fill('2026-01-01')
        await page.getByTestId('live-grant-end').fill('2026-12-31')
      }
      const requested = await uiChange<RoleGrant>(page, root + '/role-grants', () => page.getByTestId('live-grant-submit').click())
      await reviewer.goto(settings(workspace.id, 'governance'))
      const rowId = 'live-grant-' + requested.id
      await uiChange(reviewer, root + '/role-grants/' + requested.id, () => reviewer.getByTestId(rowId).getByRole('button', { name: '批准授权' }).click())
      expect((await api(guest, scope.allowed)).status).toBe(200)
      expect((await api(guest, scope.denied)).status).toBe(scope.code)
      await page.reload()
      await uiChange(page, root + '/role-grants/' + requested.id, () => page.getByTestId(rowId).getByRole('button', { name: '撤销授权' }).click())
      expect((await api(guest, scope.allowed)).status).toBe(scope.code)
    }

    await page.goto(settings(workspace.id, 'members'))
    await page.getByTestId('live-member-' + access.memberId).click()
    await page.getByTestId('live-member-active').click()
    await uiChange(page, root + '/members/' + access.memberId, () => page.getByTestId('live-member-save').click())
    expect((await api(guest, root + '/access')).status).toBe(404)
  } finally {
    await reviewerContext.close()
    await guestContext.close()
  }
})

test('D12 敏感设置 MFA、测试结账恢复、重复确认、付款引用与权益', async ({ page }) => {
  test.setTimeout(240_000)
  const tag = suffix()
  await emailLogin(page, 'd12-billing-' + tag + '@example.invalid', true)
  const workspace = await create(page, 'D12 计费 ' + tag)
  const root = organization(workspace.id)
  await page.getByTestId('live-brand-name').fill('未授权修改 ' + tag)
  await uiChange(page, root + '/settings', () => page.getByTestId('live-company-save').click(), 403, 'PUT')
  await expect(page.getByRole('link', { name: '重新验证' })).toHaveAttribute('href', /prompt=login/)
  const personal = await create(page, 'D12 个人账本 ' + tag, true)
  expect(personal.isPersonal).toBe(true)
  await expect(page).toHaveURL(new RegExp('/finance\\?.*workspace=' + personal.id))
  await page.goto(settings(workspace.id, 'billing'))
  await page.getByTestId('live-billing-quote-pro').click()
  await expect(page.getByTestId('live-billing-quote')).toBeVisible()
  const local = root + '/billing/local-checkout'
  const [started] = await Promise.all([page.waitForResponse(response => new URL(response.url()).pathname === local && response.request().method() === 'POST'), page.getByTestId('live-checkout-start').click()])
  expect(started.status()).toBe(200)
  const checkout = await started.json() as BillingCheckoutIntent
  await page.reload()
  await expect(page.getByTestId('live-checkout-pending')).toBeVisible()
  await page.getByRole('checkbox', { name: '保留测试卡供后续结账' }).click()
  const callback = local + '/' + checkout.invoiceId + '/callback'
  await uiChange(page, callback, () => page.getByTestId('live-checkout-confirm').click())
  expect((await write(page, callback, 'POST', { ticket: checkout.ticket, saveCard: true })).status).toBe(200)
  await expect(page.getByTestId('live-billing-entitlements')).toContainText('生效套餐 pro')
  await expect(page.getByTestId('live-billing-invoices')).toContainText('已付款')

  await page.getByRole('button', { name: '取消订阅', exact: true }).click()
  await uiChange(page, root + '/billing/subscription/cancel', () => page.getByRole('button', { name: '确认取消订阅' }).click())
  await expect(page.getByTestId('live-billing-entitlements')).toContainText('生效套餐 free')
  await page.getByTestId('live-billing-quote-standard').click()
  await uiChange<OrganizationBilling>(page, root + '/billing/subscription', () => page.getByRole('button', { name: '创建应付账单' }).click())
  const { invoices } = await readBusiness<OrganizationBilling>(page, root + '/billing')
  const invoice = invoices.find(item => item.planCode === 'standard' && item.status === 'pending')!
  await page.getByRole('button', { name: '登记付款' }).click()
  await page.getByTestId('live-billing-payment-reference').fill('D12-TEST-' + tag)
  await uiChange(page, root + '/billing/invoices/' + invoice.id + '/pay', () => page.getByRole('button', { name: '确认付款引用' }).click())
  await expect(page.getByTestId('live-billing-invoices')).toContainText('D12-TEST-' + tag)
  await expect(page.getByTestId('live-billing-entitlements')).toContainText('生效套餐 standard')
  await changeBusiness(page, root + '/billing/subscription/cancel', {})
})

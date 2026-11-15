import { expect, test, type Page } from '@playwright/test'

const inboxRoot = 'http://localhost:8025'
const inbox = `${inboxRoot}/api/v1`
type Mail = { ID: string, Created: string }
type MailDetail = { Text?: string, HTML?: string }

test.beforeAll(async () => {
  try {
    const response = await fetch(`${inboxRoot}/livez`, { signal: AbortSignal.timeout(5_000) })
    if (!response.ok) throw new Error(`Mailpit liveness returned ${response.status}.`)
  } catch (error) {
    throw new Error('Run email onboarding tests with the AppHost Mailpit resource enabled.', { cause: error })
  }
})

async function readMail(email: string, match: RegExp, after = 0) {
  let messages: string[] = []
  await expect.poll(async () => {
    const response = await fetch(`${inbox}/search?query=${encodeURIComponent(`to:${email}`)}`)
    const { messages: captured = [] } = await response.json() as { messages?: Mail[] }
    const texts: string[] = []
    for (const message of [...captured].sort((a, b) => a.Created.localeCompare(b.Created))) {
      const detail = await (await fetch(`${inbox}/message/${message.ID}`)).json() as MailDetail
      const text = [detail.Text, detail.HTML].filter(Boolean).join('\n')
      if (match.test(text)) texts.push(text)
    }
    messages = texts
    return texts.length
  }, { timeout: 35_000 }).toBeGreaterThan(after)
  const value = match.exec(messages[after] ?? '')?.[1]
  if (!value) throw new Error('The expected value is missing from the captured email.')
  return value
}

const otp = /\bCode:\s*([0-9]{6})\b/
const link = /(https:\/\/localhost:7443\/join#[0-9a-f-]{36}\.[0-9a-f]{64})/

async function completeEmailChallenge(page: Page, email: string, after = 0) {
  const form = page.locator('#otp-form')
  await form.getByLabel('邮箱', { exact: true }).fill(email)
  await form.getByRole('button', { name: '发送验证码', exact: true }).click()
  const code = await readMail(email, otp, after)
  await form.getByLabel('六位验证码').fill(code)
  await form.getByRole('button', { name: '验证', exact: true }).click()
  await page.waitForURL(url => url.origin === 'https://localhost:7443' && ['/', '/join'].includes(url.pathname),
    { waitUntil: 'domcontentloaded' })
}

async function register(page: Page, email: string) {
  await page.goto('/')
  await page.getByRole('link', { name: '邮箱注册', exact: true }).click()
  await completeEmailChallenge(page, email)
  await expect(page.getByLabel('企业名称')).toBeVisible()
}

async function pickOption(page: Page, label: string, option: string) {
  await page.getByLabel(label, { exact: true }).click()
  await page.getByRole('option', { name: option, exact: true }).click()
}

async function pickCombobox(page: Page, name: string, option: string) {
  await page.getByRole('combobox', { name }).click()
  await page.getByRole('option', { name: option, exact: true }).click()
}

async function invite(owner: Page, email: string) {
  await owner.getByLabel('受邀邮箱', { exact: true }).fill(email)
  await owner.getByRole('button', { name: '创建邀请', exact: true }).click()
  await expect(owner.getByText('邀请邮件已发送。', { exact: true })).toBeVisible()
  return readMail(email, link)
}

test('Email registration, company creation and invitation by email for new and existing accounts', async ({ browser, page: owner }) => {
  test.setTimeout(180_000)
  const run = Date.now()
  const ownerEmail = `owner-${run}@example.invalid`
  const newcomerEmail = `new-${run}@example.invalid`
  const returningEmail = `existing-${run}@example.invalid`
  const name = `邮箱开通验证 ${run}`
  const newcomerContext = await browser.newContext({ baseURL: 'https://localhost:7443' })
  const returningContext = await browser.newContext({ baseURL: 'https://localhost:7443' })
  try {
    const returning = await returningContext.newPage()
    await register(returning, returningEmail)
    const registeredAt = Date.now()
    await returning.getByRole('button', { name: '退出登录', exact: true }).click()
    await expect(returning.getByRole('link', { name: '登录 Nexora', exact: true })).toBeVisible()

    await register(owner, ownerEmail)
    await owner.getByLabel('企业名称').fill(name)
    await owner.getByRole('button', { name: '创建工作区', exact: true }).click()
    await owner.waitForURL(/\/companies\/[0-9a-f-]+\/setup$/)
    const setupPath = new URL(owner.url()).pathname
    await owner.goto(setupPath.replace(/\/setup$/, '/members'))
    await expect(owner.getByRole('heading', { name: '团队与成员', exact: true })).toBeVisible()
    const newcomerLink = await invite(owner, newcomerEmail)
    const returningLink = await invite(owner, returningEmail)


    await owner.goto(newcomerLink)
    await owner.getByRole('button', { name: '接受邀请', exact: true }).click()
    await expect(owner.getByRole('alert')).toBeVisible()

    const newcomer = await newcomerContext.newPage()
    await newcomer.goto(newcomerLink)
    await newcomer.getByRole('link', { name: '邮箱注册', exact: true }).click()
    await completeEmailChallenge(newcomer, newcomerEmail)
    await expect(newcomer).toHaveURL('https://localhost:7443/join')
    await newcomer.getByRole('button', { name: '接受邀请', exact: true }).click()
    await expect(newcomer.getByRole('button', { name: new RegExp(name) })).toBeVisible()

    // Registration and sign-in share the real per-address one-minute sending cooldown.
    await expect.poll(() => Date.now() - registeredAt, { timeout: 65_000, intervals: [1_000] }).toBeGreaterThan(60_000)
    await returning.goto(returningLink)
    await returning.getByRole('link', { name: '登录 Nexora', exact: true }).click()
    await completeEmailChallenge(returning, returningEmail, 1)
    await expect(returning).toHaveURL('https://localhost:7443/join')
    await returning.getByRole('button', { name: '接受邀请', exact: true }).click()
    await expect(returning.getByRole('button', { name: new RegExp(name) })).toBeVisible()

    await returning.goto(returningLink)
    await returning.getByRole('button', { name: '接受邀请', exact: true }).click()
    await expect(returning.getByRole('alert')).toBeVisible()
  } finally {
    await newcomerContext.close()
    await returningContext.close()
  }
})

test('An incorrect email registration code consumes the challenge', async ({ page }) => {
  const email = `invalid-code-${Date.now()}@example.invalid`
  await page.goto('/')
  await page.getByRole('link', { name: '邮箱注册', exact: true }).click()
  const form = page.locator('#otp-form')
  await form.getByLabel('邮箱', { exact: true }).fill(email)
  await form.getByRole('button', { name: '发送验证码', exact: true }).click()
  const code = await readMail(email, otp)
  for (const value of [code === '000000' ? '000001' : '000000', code]) {
    await form.getByLabel('六位验证码').fill(value)
    await form.getByRole('button', { name: '验证', exact: true }).click()
    await expect(form.getByRole('status')).toContainText('验证码不可用')
  }
  await page.goto('/')
  expect(await page.evaluate(async () => (await fetch('/bff/me')).status)).toBe(401)
})

async function joinAsNewAccount(page: Page, invitationLink: string, email: string, company: string) {
  await page.goto(invitationLink)
  await page.getByRole('link', { name: '邮箱注册', exact: true }).click()
  await completeEmailChallenge(page, email)
  await page.getByRole('button', { name: '接受邀请', exact: true }).click()
  await expect(page.getByRole('button', { name: new RegExp(company) })).toBeVisible()
}

async function governanceApi(page: Page, path: string, body?: object, method?: 'GET' | 'POST' | 'PUT') {
  return page.evaluate(async ({ path, body, method }) => {
    const headers = new Headers()
    if (body) {
      const csrf = await (await fetch('/bff/antiforgery')).json()
      headers.set('X-CSRF-TOKEN', csrf.requestToken)
      headers.set('Content-Type', 'application/json')
    }
    const response = await fetch(path, {
      method: method ?? (body ? 'POST' : 'GET'), headers, body: body ? JSON.stringify(body) : undefined,
    })
    return { status: response.status, text: await response.text() }
  }, { path, body, method })
}

async function readGovernance<T>(page: Page, path: string): Promise<T> {
  const response = await governanceApi(page, path)
  expect(response.status).toBe(200)
  return JSON.parse(response.text) as T
}

type AccessSnapshot = { authorizationVersion: number; memberId: string }

async function postGovernance(page: Page, base: string, path: string, data: object, version?: number) {
  const access = await readGovernance<AccessSnapshot>(page, base + '/access')
  return governanceApi(page, base + path, {
    ...data, expectedVersion: version ?? access.authorizationVersion,
  })
}

test('Team and roles pages require independent approval for multi-role invitations and member edits', async ({ browser, page: owner }) => {
  test.setTimeout(180_000)
  const run = Date.now()
  const ownerEmail = `team-owner-${run}@example.invalid`
  const approverEmail = `team-approver-${run}@example.invalid`
  const employeeEmail = `team-employee-${run}@example.invalid`
  const name = `团队权限验收 ${run}`
  const approverContext = await browser.newContext({ baseURL: 'https://localhost:7443' })
  const employeeContext = await browser.newContext({ baseURL: 'https://localhost:7443' })
  try {
    await register(owner, ownerEmail)
    await owner.getByLabel('企业名称').fill(name)
    await owner.getByRole('button', { name: '创建工作区', exact: true }).click()
    await owner.waitForURL(/\/companies\/[0-9a-f-]+\/setup$/)
    const workspaceId = new URL(owner.url()).pathname.match(/\/companies\/([0-9a-f-]+)\/setup$/)![1]
    const membersPath = '/companies/' + workspaceId + '/members'
    await owner.goto(membersPath)
    await expect(owner.getByRole('heading', { name: '团队与成员', exact: true })).toBeVisible()
    const base = '/bff/api/workspaces/' + workspaceId

    await pickOption(owner, '邀请角色', '工作区所有者')
    const approverLink = await invite(owner, approverEmail)
    const approver = await approverContext.newPage()
    await joinAsNewAccount(approver, approverLink, approverEmail, name)

    await owner.getByRole('button', { name: '刷新权限与成员' }).click()
    await expect(owner.locator('[data-subject]').filter({ hasText: approverEmail })).toBeVisible()
    await pickOption(owner, '邀请角色', '工作区只读成员')
    await owner.getByLabel('受邀邮箱', { exact: true }).fill(employeeEmail)
    await pickCombobox(owner, '权限预设', '采购与销售制单')
    await expect(owner.getByRole('checkbox', { name: '采购制单', exact: true })).toBeChecked()
    await expect(owner.getByRole('checkbox', { name: '销售制单', exact: true })).toBeChecked()
    await owner.getByRole('checkbox', { name: '财务制单', exact: true }).check()
    await owner.getByRole('button', { name: '创建邀请', exact: true }).click()
    await expect(owner.getByText('邀请已提交，等待另一位所有者批准后发送邮件。')).toBeVisible()
    await expect(owner.getByLabel('一次性邀请码', { exact: true })).toHaveCount(0)
    const pending = owner.locator(`[data-email="${employeeEmail}"]`)
    await expect(pending).toContainText('待审批')
    await expect(pending.getByRole('button', { name: '批准邀请' })).toHaveCount(0)
    const mailbox = await fetch(`${inbox}/search?query=${encodeURIComponent(`to:${employeeEmail}`)}`)
    expect((await mailbox.json()).messages ?? []).toHaveLength(0)
    const invitations = await readGovernance<{ email: string; id: string }[]>(owner, base + '/invitations')
    const invitation = invitations.find(item => item.email === employeeEmail)
    expect(invitation).toBeDefined()
    const approvalPath = `/invitations/${invitation!.id}/approve`
    expect((await postGovernance(owner, base, approvalPath, {})).status).toBe(403)

    await approver.goto(membersPath)
    await approver.locator(`[data-email="${employeeEmail}"]`).getByRole('button', { name: '批准邀请' }).click()
    await expect(approver.getByText('邀请邮件已发送。', { exact: true })).toBeVisible()
    expect((await postGovernance(approver, base, approvalPath, {})).status).toBe(409)

    const employee = await employeeContext.newPage()
    await joinAsNewAccount(employee, await readMail(employeeEmail, link), employeeEmail, name)
    const status = async (permission: string) => (await governanceApi(employee, base + '/authorization/' + permission)).status
    for (const permission of ['purchasing.order.create', 'sales.order.create', 'finance.journal.create'])
      expect(await status(permission)).toBe(200)
    expect((await governanceApi(employee, `/bff/api/purchasing/workspaces/${workspaceId}/orders`)).status).toBe(200)
    expect((await governanceApi(employee, `/bff/api/sales/workspaces/${workspaceId}/orders`)).status).toBe(200)
    expect(await status('purchasing.order.approve')).toBe(403)
    expect((await governanceApi(employee, base + '/roles')).status).toBe(403)

    await owner.getByRole('button', { name: '刷新权限与成员' }).click()
    const member = owner.locator('[data-subject]').filter({ hasText: employeeEmail })
    await expect(member).toContainText('财务制单、采购制单、销售制单')
    const employeeMemberId = (await readGovernance<AccessSnapshot>(employee, base + '/access')).memberId
    const memberRolePath = `/members/${employeeMemberId}/business-roles`
    expect((await postGovernance(employee, base, memberRolePath, {
      action: 'submit', businessRoles: ['PurchasingApprover'],
    })).status).toBe(403)
    expect((await postGovernance(owner, base, memberRolePath, {
      action: 'submit', businessRoles: ['PurchasingOperator', 'PurchasingApprover'],
    })).status).toBe(400)

    await member.getByRole('button', { name: '编辑权限' }).click()
    await member.getByRole('checkbox', { name: '采购审批', exact: true }).check()
    await member.getByRole('button', { name: '提交业务角色申请' }).click()
    await expect(member).toContainText('待审批 · 财务制单、采购审批、销售制单')
    expect(await status('purchasing.order.approve')).toBe(403)
    expect((await postGovernance(owner, base, memberRolePath, { action: 'approve' })).status).toBe(403)
    const oldVersion = (await readGovernance<AccessSnapshot>(owner, base + '/access')).authorizationVersion - 1
    expect((await postGovernance(approver, base, memberRolePath, { action: 'approve' }, oldVersion)).status).toBe(409)

    await approver.getByRole('button', { name: '刷新权限与成员' }).click()
    await approver.locator('[data-subject]').filter({ hasText: employeeEmail })
      .getByRole('button', { name: '批准业务角色' }).click()
    await expect.poll(() => status('purchasing.order.approve')).toBe(200)
    expect(await status('purchasing.order.create')).toBe(403)

    await owner.getByRole('button', { name: '刷新权限与成员' }).click()
    await expect(member).toContainText('财务制单、采购审批、销售制单')
    await member.getByRole('button', { name: '编辑权限' }).click()
    await member.getByRole('checkbox', { name: '财务制单', exact: true }).uncheck()
    await member.getByRole('button', { name: '保存业务角色' }).click()
    await expect.poll(() => status('finance.journal.create')).toBe(403)
    expect(await status('sales.order.create')).toBe(200)

    await owner.getByRole('link', { name: '角色与权限', exact: true }).click()
    await pickCombobox(owner, '选择角色', '采购审批')
    await expect(owner.getByLabel('权限明细')).toContainText('purchasing.order.approve')
    await expect(owner.getByLabel('权限明细')).not.toContainText('purchasing.order.create')
    await owner.reload()
    await expect(owner.getByRole('heading', { name: '角色与权限', exact: true })).toBeVisible()
    await expect(owner.getByRole('link', { name: '团队与成员', exact: true })).toBeVisible()
  } finally {
    await approverContext.close()
    await employeeContext.close()
  }
})

test('Custom roles keep department and warehouse permissions in their approved scope', async ({ browser, page: owner }) => {
  test.setTimeout(180_000)
  const run = Date.now()
  const name = `自定义角色验收 ${run}`
  const ownerEmail = `scope-owner-${run}@example.invalid`
  const reviewerEmail = `scope-reviewer-${run}@example.invalid`
  const employeeEmail = `scope-employee-${run}@example.invalid`
  const reviewerContext = await browser.newContext({ baseURL: 'https://localhost:7443' })
  const employeeContext = await browser.newContext({ baseURL: 'https://localhost:7443' })
  try {
    await register(owner, ownerEmail)
    await owner.getByLabel('企业名称').fill(name)
    await owner.getByRole('button', { name: '创建工作区', exact: true }).click()
    await owner.waitForURL(/\/companies\/[0-9a-f-]+\/setup$/)
    const id = new URL(owner.url()).pathname.match(/\/companies\/([0-9a-f-]+)\/setup$/)![1]
    const membersPath = '/companies/' + id + '/members'
    await owner.goto(membersPath)
    await expect(owner.getByRole('heading', { name: '团队与成员', exact: true })).toBeVisible()
    const base = '/bff/api/workspaces/' + id
    const inventory = `/bff/api/inventory/workspaces/${id}`
    const purchase = `/bff/api/purchasing/workspaces/${id}/orders`
    const sales = `/bff/api/sales/workspaces/${id}/orders`
    const master = `/bff/api/masterdata/workspaces/${id}`
    const finance = `/bff/api/finance/workspaces/${id}`

    async function create(page: Page, path: string, body: object) {
      const result = await governanceApi(page, path, { operationId: crypto.randomUUID(), ...body })
      expect([200, 201], path).toContain(result.status)
      return JSON.parse(result.text) as { id: string; version: number }
    }

    await pickOption(owner, '邀请角色', '工作区所有者')
    const reviewerLink = await invite(owner, reviewerEmail)
    await pickOption(owner, '邀请角色', '工作区只读成员')
    const employeeLink = await invite(owner, employeeEmail)
    const reviewer = await reviewerContext.newPage()
    const employee = await employeeContext.newPage()
    await joinAsNewAccount(reviewer, reviewerLink, reviewerEmail, name)
    await joinAsNewAccount(employee, employeeLink, employeeEmail, name)
    const ownerId = (await readGovernance<AccessSnapshot>(owner, base + '/access')).memberId
    const employeeId = (await readGovernance<AccessSnapshot>(employee, base + '/access')).memberId
    const refresh = (page: Page) => page.getByRole('button', { name: '刷新权限与成员', exact: true }).click()

    await refresh(owner)
    await expect(owner.locator('[data-subject]').filter({ hasText: employeeEmail })).toBeVisible()
    const departmentNames = ['华东部门', '华南部门']
    for (const department of departmentNames) {
      await owner.getByLabel('新部门名称').fill(department)
      await owner.getByRole('button', { name: '创建部门', exact: true }).click()
      await expect(owner.getByText('部门已创建。')).toBeVisible()
      await expect(owner.getByRole('button', { name: '创建部门', exact: true })).toBeEnabled()
    }
    const directory = await readGovernance<{ id: string; name: string }[]>(owner, base + '/departments')
    const east = directory.find(item => item.name === departmentNames[0])!.id
    const south = directory.find(item => item.name === departmentNames[1])!.id
    const mainWarehouse = await create(owner, inventory + '/warehouses', { code: 'EAST', name: '华东仓' })
    const otherWarehouse = await create(owner, inventory + '/warehouses', { code: 'SOUTH', name: '华南仓' })
    const foreign = await create(owner, '/bff/api/workspaces', { name: `隔离公司 ${run}` })
    const foreignWarehouse = await create(owner, `/bff/api/inventory/workspaces/${foreign.id}/warehouses`, { code: 'EXT', name: '外部仓' })

    await owner.getByRole('link', { name: '角色与权限', exact: true }).click()
    async function customRole(title: string, labels: string[]) {
      await owner.getByLabel('自定义角色名称').fill(title)
      for (const label of labels)
        await owner.getByRole('checkbox', { name: label, exact: true }).check()
      await owner.getByRole('button', { name: '保存自定义角色', exact: true }).click()
      await expect(owner.getByText('自定义角色已保存。')).toBeVisible()
      return (await readGovernance<{ roles: { id: string; name: string; revision: number }[] }>(owner, base + '/custom-roles'))
        .roles.find(item => item.name === title)!
    }
    const orderRole = await customRole('部门制单', ['查看采购订单', '创建采购订单', '提交采购订单', '查看销售订单', '创建销售订单'])
    await pickOption(owner, '选择自定义角色', '新建角色')
    const stockRole = await customRole('仓库查阅', ['查看仓库库存及收发流水'])
    await pickOption(owner, '选择自定义角色', '新建角色')
    const readRole = await customRole('销售只读', ['查看销售订单'])
    expect((await postGovernance(owner, base, '/custom-roles', {
      name: '不可委派', permissions: ['organization.roles.assign'],
    })).status).toBe(400)

    await owner.getByRole('link', { name: '团队与成员', exact: true }).click()
    await reviewer.goto(membersPath)
    const grantPath = '/role-grants'
    const selectGrant = async (memberId: string, role: { id: string; name: string; revision: number }, scope: string, scopeId?: string) => {
      await pickOption(owner, '授权成员', memberId === ownerId ? ownerEmail : employeeEmail)
      await pickOption(owner, '授权角色', `${role.name} · v${role.revision}`)
      await pickOption(owner, '数据范围', scope === 'company' ? '整个公司' : scope === 'department' ? '指定部门' : '指定仓库')
      if (scopeId) {
        const scopeName = scope === 'department'
          ? (scopeId === east ? departmentNames[0] : departmentNames[1])
          : scopeId === mainWarehouse.id ? '华东仓' : '华南仓'
        await pickOption(owner, '范围对象', scopeName)
      }
      await owner.getByRole('button', { name: '提交角色授权', exact: true }).click()
      await expect(owner.getByText('已提交，等待另一位所有者审批。')).toBeVisible()
      const grants = await readGovernance<{ id: string; memberId: string; roleId: string; scope: string }[]>(owner, base + grantPath)
      const grant = grants.find(item => item.memberId === memberId && item.roleId === role.id && item.scope === scope)!
      return grant.id
    }
    const saveCustomRole = async (title: string, permissions: string[]) => {
      const saved = await postGovernance(owner, base, '/custom-roles', { name: title, permissions })
      expect([200, 201]).toContain(saved.status)
      return (await readGovernance<{ roles: { id: string; name: string; revision: number }[] }>(owner, base + '/custom-roles'))
        .roles.find(item => item.name === title)!
    }
    const selectPeriodGrant = async (memberId: string, role: { id: string; name: string; revision: number },
      startsOn: string, endsOn: string) => {
      await pickOption(owner, '授权成员', memberId === employeeId ? employeeEmail : ownerEmail)
      await pickOption(owner, '授权角色', `${role.name} · v${role.revision}`)
      await pickOption(owner, '数据范围', '指定财务期间')
      await owner.locator('[data-testid="grant-starts-on"]').fill(startsOn)
      await owner.locator('[data-testid="grant-ends-on"]').fill(endsOn)
      await owner.getByRole('button', { name: '提交角色授权', exact: true }).click()
      await expect(owner.getByText('已提交，等待另一位所有者审批。')).toBeVisible()
      const grants = await readGovernance<{ id: string; memberId: string; roleId: string; scope: string; startsOn: string | null }[]>(owner, base + '/role-grants')
      return grants.find(item => item.memberId === memberId && item.roleId === role.id &&
        item.scope === 'period' && item.startsOn === startsOn)!.id
    }
    const approve = async (grantId: string) => {
      await refresh(reviewer)
      await reviewer.locator(`[data-grant-id="${grantId}"]`).getByRole('button', { name: '批准角色授权' }).click()
      await expect(reviewer.locator(`[data-grant-id="${grantId}"]`)).toContainText('已授权')
      await refresh(owner)
      await expect(owner.locator(`[data-grant-id="${grantId}"]`)).toContainText('已授权')
    }

    await approve(await selectGrant(ownerId, orderRole, 'company'))
    const departmentGrant = await selectGrant(employeeId, orderRole, 'department', east)
    expect((await governanceApi(employee, purchase)).status).toBe(403)
    expect((await postGovernance(owner, base, grantPath + '/' + departmentGrant, { action: 'approve' })).status).toBe(403)
    await approve(departmentGrant)
    await approve(await selectGrant(employeeId, readRole, 'department', south))
    const warehouseGrant = await selectGrant(employeeId, stockRole, 'warehouse', mainWarehouse.id)
    expect((await governanceApi(employee, inventory + '/warehouses/' + mainWarehouse.id + '/positions')).status).toBe(404)
    await approve(warehouseGrant)
    const warehouseRequest = { memberId: employeeId, roleId: stockRole.id, roleRevision: stockRole.revision, scope: 'warehouse' }
    expect((await postGovernance(owner, base, grantPath, { ...warehouseRequest, scopeId: foreignWarehouse.id })).status).toBe(404)
    expect((await postGovernance(owner, base, grantPath, {
      ...warehouseRequest, scope: 'department', scopeId: east,
    })).status).toBe(400)

    const periodManageRole = await saveCustomRole('期间管理', ['finance.period.manage'])
    const periodReadRole = await saveCustomRole('期间查阅', ['finance.ledger.read'])
    await refresh(owner)
    await approve(await selectGrant(ownerId, periodManageRole, 'company'))
    await create(owner, finance + '/book', { baseCurrency: 'CNY', startsOn: '2026-01-01', fiscalYearStartMonth: 1 })
    await create(owner, finance + '/ledger/periods/2026-01-01', { expectedVersion: 0, action: 'open', reason: 'F07 财务期间范围' })
    const periodGrant = await selectPeriodGrant(employeeId, periodReadRole, '2026-01-01', '2026-12-31')
    expect((await governanceApi(employee, finance + '/ledger/periods/2026-01-01')).status).toBe(403)
    await approve(periodGrant)
    const periodAccess = await readGovernance<{ scopedPermissions: {
      permission: string; startsOn: string | null; endsOn: string | null
    }[] }>(employee, base + '/access')
    const periodPermission = periodAccess.scopedPermissions.find(item => item.permission === 'finance.ledger.read')
    expect(periodPermission?.startsOn).toBe('2026-01-01')
    expect(periodPermission?.endsOn).toBe('2026-12-31')
    expect((await governanceApi(employee, finance + '/ledger/periods/2026-01-01')).status).toBe(200)
    expect((await governanceApi(employee, finance + '/ledger/periods/2027-02-01')).status).toBe(403)
    const settings = await readGovernance<{ version: number; presentation: object }>(owner, base + '/settings')
    const policy = await governanceApi(owner, base + '/settings', {
      operationId: crypto.randomUUID(), expectedVersion: settings.version,
      presentation: settings.presentation, roleGrantApprovals: 2,
    }, 'PUT')
    expect(policy.status, policy.text).toBe(200)
    const dualRequest = await postGovernance(owner, base, grantPath, {
      operationId: crypto.randomUUID(), memberId: employeeId, roleId: stockRole.id,
      roleRevision: stockRole.revision, scope: 'warehouse', scopeId: otherWarehouse.id,
    })
    expect([200, 201]).toContain(dualRequest.status)
    type GrantRow = { id: string; requiredApprovals: number; approvalCount: number; state: string }
    const requestedGrant = JSON.parse(dualRequest.text) as { id: string }
    const dualGrant = (await readGovernance<GrantRow[]>(owner, base + grantPath))
      .find(item => item.id === requestedGrant.id)!
    expect(dualGrant).toMatchObject({ requiredApprovals: 2, approvalCount: 0, state: 'Pending' })
    expect((await postGovernance(reviewer, base, grantPath + '/' + dualGrant.id, { action: 'approve' })).status).toBe(200)
    const afterFirst = (await readGovernance<GrantRow[]>(owner, base + grantPath))
      .find(item => item.id === dualGrant.id)!
    expect(afterFirst).toMatchObject({ requiredApprovals: 2, approvalCount: 1, state: 'Pending' })
    expect((await postGovernance(reviewer, base, grantPath + '/' + dualGrant.id, { action: 'approve' })).status).toBe(403)
    expect((await postGovernance(owner, base, grantPath + '/' + dualGrant.id, { action: 'approve' })).status).toBe(403)
    await refresh(owner)

    const category = await create(owner, master + '/definitions', { kind: 'category', code: 'STOCK', name: '库存' })
    const unit = await create(owner, master + '/definitions', { kind: 'unit', code: 'EA', name: '件' })
    const product = await create(owner, master + '/items', {
      code: 'SCOPE', name: '范围验收商品', kind: 'product', tracksInventory: true, categoryId: category.id, unitId: unit.id,
    })
    const partner = await create(owner, master + '/partners', {
      code: 'PARTNER', profile: { name: '验收往来单位', roles: ['supplier', 'customer'], contacts: [] },
    })
    const draft = { on: '2026-01-03', lines: [{ itemId: product.id, quantity: '1', unitPrice: '2.12' }] }
    const southOrder = await create(owner, purchase, { number: 'SOUTH', draft: { ...draft, supplierId: partner.id, departmentId: south } })
    const legacyOrder = await create(owner, purchase, { number: 'LEGACY', draft: { ...draft, supplierId: partner.id } })
    const eastOrder = await create(employee, purchase, { number: 'EAST', draft: { ...draft, supplierId: partner.id, departmentId: east } })
    const southSale = await create(owner, sales, { number: 'SOUTH', draft: { ...draft, customerId: partner.id, departmentId: south } })
    await create(employee, sales, { number: 'EAST', draft: { ...draft, customerId: partner.id, departmentId: east } })

    const list = await readGovernance<{ orders: { id: string }[] }>(employee, purchase)
    expect(list.orders.map(item => item.id)).toEqual([eastOrder.id])
    expect((await governanceApi(employee, purchase + '/' + southOrder.id)).status).toBe(404)
    expect((await governanceApi(employee, purchase + '/' + legacyOrder.id)).status).toBe(404)
    expect((await governanceApi(employee, sales + '/' + southSale.id)).status).toBe(200)
    expect((await governanceApi(employee, sales, { operationId: crypto.randomUUID(), number: 'DENY',
      draft: { ...draft, customerId: partner.id, departmentId: south } })).status).toBe(403)
    expect((await governanceApi(employee, purchase + '/' + southOrder.id + '/decision', {
      operationId: crypto.randomUUID(), expectedVersion: southOrder.version, decision: 'submit',
    })).status).toBe(404)
    await create(employee, purchase + '/' + eastOrder.id + '/decision', { expectedVersion: eastOrder.version, decision: 'submit' })

    const warehouses = await readGovernance<{ warehouses: { id: string }[] }>(employee, inventory + '/warehouses')
    expect(warehouses.warehouses.map(warehouse => warehouse.id)).toEqual([mainWarehouse.id])
    expect((await governanceApi(employee, inventory + '/warehouses/' + mainWarehouse.id + '/positions')).status).toBe(200)
    expect((await governanceApi(employee, inventory + '/warehouses/' + otherWarehouse.id + '/positions')).status).toBe(404)
    expect((await governanceApi(employee, inventory + '/warehouses', { operationId: crypto.randomUUID(), code: 'DENY', name: '禁止创建' })).status).toBe(403)
    await owner.locator(`[data-grant-id="${warehouseGrant}"]`).getByRole('button', { name: '撤销角色授权' }).click()
    await expect.poll(async () => (await governanceApi(employee, inventory + '/warehouses/' + mainWarehouse.id + '/positions')).status).toBe(404)
    expect((await governanceApi(employee, purchase + '/' + eastOrder.id)).status).toBe(200)

    await owner.getByRole('link', { name: '角色与权限', exact: true }).click()
    await pickOption(owner, '选择自定义角色', `${orderRole.name} · v${orderRole.revision}`)
    await owner.getByRole('checkbox', { name: '创建采购订单', exact: true }).uncheck()
    await owner.getByRole('button', { name: '保存自定义角色', exact: true }).click()
    await expect(owner.getByText('自定义角色已保存。')).toBeVisible()
    const revision = await postGovernance(owner, base, grantPath, {
      memberId: employeeId, roleId: orderRole.id, roleRevision: orderRole.revision, scope: 'department', scopeId: east,
    })
    expect(revision.status).toBe(409)
    await create(employee, purchase, { number: 'PINNED', draft: { ...draft, supplierId: partner.id, departmentId: east } })
  } finally {
    await reviewerContext.close()
    await employeeContext.close()
  }
})

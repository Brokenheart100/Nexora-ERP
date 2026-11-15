import { test, expect, type Page } from '@playwright/test'
import { createHmac } from 'node:crypto'
import { execFile, spawn } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { promisify } from 'node:util'
import { formatDecimal } from '../app/utils/formatDecimal'

test('Catalog UI and API preserve workspace scope, versioning and idempotency', async ({ page }) => {
  await login(page, 'alice')
  const first = await write(page, '/bff/api/workspaces', 'POST', { operationId: crypto.randomUUID(), name: `商品目录 ${Date.now()}` })
  expect(first.status).toBe(201)
  const workspace = JSON.parse(first.text) as { id: string; name: string }
  const second = await write(page, '/bff/api/workspaces', 'POST', { operationId: crypto.randomUUID(), name: `目录隔离 ${Date.now()}` })
  expect(second.status).toBe(201)
  const other = JSON.parse(second.text) as { id: string }
  await page.reload()
  await page.getByRole('button', { name: new RegExp(workspace.name) }).click()
  await page.getByTestId('module-catalog').click()
  await page.getByLabel('定义编码').fill('hardware')
  await page.getByLabel('定义名称').fill('五金')
  await page.getByRole('button', { name: '保存定义' }).click()
  await page.getByLabel('定义类型').click()
  await page.getByRole('option', { name: '计量单位' }).click()
  await page.getByLabel('定义编码').fill('pcs')
  await page.getByLabel('定义名称').fill('件')
  await page.getByRole('button', { name: '保存定义' }).click()
  await page.getByLabel('项目分类').click()
  await expect(page.getByRole('option', { name: '五金' })).toHaveCount(1)
  await page.keyboard.press('Escape')
  await page.getByLabel('基础单位').click()
  await expect(page.getByRole('option', { name: '件', exact: true })).toHaveCount(1)
  await page.keyboard.press('Escape')
  await page.getByLabel('项目编码').fill('sku-01')
  await page.getByLabel('项目名称').fill('六角螺丝')
  await page.getByLabel('项目分类').click()
  await page.getByRole('option', { name: '五金' }).click()
  await page.getByLabel('基础单位').click()
  await page.getByRole('option', { name: '件', exact: true }).click()
  await page.getByRole('checkbox', { name: '跟踪库存' }).check()
  await page.getByRole('button', { name: '创建项目' }).click()
  await page.getByRole('button', { name: '编辑 SKU-01' }).click()
  await page.getByLabel('编辑名称').fill('六角螺丝 M8')
  await page.getByRole('checkbox', { name: '项目启用' }).uncheck()
  await page.getByRole('button', { name: '保存项目' }).click()
  await expect(page.getByRole('row', { name: /SKU-01 六角螺丝 M8.*已停用/ })).toBeVisible()

  const path = `/bff/api/masterdata/workspaces/${workspace.id}`
  const outside = `/bff/api/masterdata/workspaces/${other.id}`
  const result = await api(page, `${path}/catalog`)
  expect(result.status).toBe(200)
  const catalog = JSON.parse(result.text) as { page: { items: { id: string; version: number; categoryId: string; unitId: string }[] } }
  const saved = catalog.page.items[0]!
  expect(saved.version).toBe(2)
  expect((await api(page, `${outside}/items/${saved.id}`)).status).toBe(404)
  const data = { operationId: crypto.randomUUID(), code: 'svc-01', name: '安装服务', kind: 'service',
    tracksInventory: false, categoryId: saved.categoryId, unitId: saved.unitId }
  expect((await write(page, `${outside}/items`, 'POST', data)).status).toBe(400)
  expect((await write(page, `${path}/items`, 'POST', { ...data, tracksInventory: true })).status).toBe(400)
  expect((await write(page, `${path}/items`, 'POST', { ...data, kind: 'unknown' })).status).toBe(400)
  expect((await write(page, `${path}/items`, 'POST', { ...data, tracksInventory: undefined })).status).toBe(400)
  expect((await write(page, `${path}/items`, 'POST', { ...data, code: 'sku-01' })).status).toBe(409)
  expect((await write(page, `${path}/items/${saved.id}`, 'PUT', {
    operationId: crypto.randomUUID(), expectedVersion: 1, name: '过期版本', categoryId: saved.categoryId, isActive: true,
  })).status).toBe(409)
  const service = await write(page, `${path}/items`, 'POST', data)
  expect(service.status).toBe(200)
  const retry = await write(page, `${path}/items`, 'POST', data)
  expect(retry.status).toBe(200)
  expect(JSON.parse(retry.text)).toEqual(JSON.parse(service.text))
  expect((await write(page, `${path}/items`, 'POST', { ...data, name: '不同的操作内容' })).status).toBe(409)
  const servicePath = `${path}/items/${JSON.parse(service.text).id}`
  const edits = await Promise.all(['安装服务 A', '安装服务 B'].map(name =>
    write(page, servicePath, 'PUT', { operationId: crypto.randomUUID(), expectedVersion: 1,
      name, categoryId: saved.categoryId, isActive: true })))
  expect(edits.map(x => x.status).sort()).toEqual([200, 409])
  const detail = await api(page, servicePath)
  expect(detail.status).toBe(200)
  expect(JSON.parse(detail.text).version).toBe(2)
  expect((await api(page, `${servicePath}/reference`)).status).toBe(200)
  expect((await api(page, `${servicePath}/reference?inventory=true`)).status).toBe(409)
  expect((await api(page, `${path}/items/${saved.id}/reference`)).status).toBe(409)
  const stock = await write(page, `${path}/items`, 'POST', {
    ...data, operationId: crypto.randomUUID(), code: 'stock-02', kind: 'product', tracksInventory: true,
  })
  expect(stock.status).toBe(200)
  const stockReference = `${path}/items/${JSON.parse(stock.text).id}/reference?inventory=true`
  expect((await api(page, stockReference)).status).toBe(200)
  await page.getByText('分类与计量单位', { exact: true }).click()
  await page.getByRole('button', { name: '编辑定义 PCS' }).click()
  await page.getByLabel('编辑定义名称').fill('件（修订）')
  await page.getByRole('checkbox', { name: '定义启用' }).uncheck()
  await page.getByRole('button', { name: '保存定义修改' }).click()
  await expect(page.getByText('计量单位 · PCS · 件（修订） · 已停用', { exact: true })).toBeVisible()
  expect((await api(page, stockReference)).status).toBe(409)
  expect((await api(page, servicePath)).status).toBe(200)
  expect((await write(page, `${path}/items`, 'POST', {
    ...data, operationId: crypto.randomUUID(), code: 'INACTIVE-UNIT',
  })).status).toBe(409)
  const unitPath = `${path}/definitions/${saved.unitId}`
  expect((await write(page, unitPath, 'PUT', {
    operationId: crypto.randomUUID(), expectedVersion: 1, name: '旧版本', isActive: true,
  })).status).toBe(409)
  expect((await write(page, unitPath, 'PUT', {
    operationId: crypto.randomUUID(), expectedVersion: 2, name: '件（恢复）', isActive: true,
  })).status).toBe(200)
  const restored = await api(page, stockReference)
  expect(restored.status).toBe(200)
  expect(JSON.parse(restored.text).unit.version).toBe(3)
  expect((await api(page, `${outside}/items/${JSON.parse(stock.text).id}/reference`)).status).toBe(404)
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})


const runtime = resolve('../../../artifacts/p1/runtime')
const realm = JSON.parse(readFileSync(resolve(runtime, 'keycloak/nexora-realm.json'), 'utf8')) as {
  users: { username: string; credentials: { value: string }[] }[]
}
const seedFile = resolve(runtime, 'browser-otp.json')
const seeds = (existsSync(seedFile) ? JSON.parse(readFileSync(seedFile, 'utf8')) : {}) as Record<string, string>

function totp(rawSecret: string) {
  const counter = Buffer.alloc(8); counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000)))
  const digest = createHmac('sha1', Buffer.from(rawSecret, 'utf8')).update(counter).digest()
  const offset = digest[digest.length - 1]! & 15
  return String((digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, '0')
}
async function freshTotp(username: string, rawSecret: string) {
  const counterKey = `${username}:lastCounter`
  while (Number(seeds[counterKey] ?? 0) >= Math.floor(Date.now() / 30_000) || 30_000 - Date.now() % 30_000 < 2500)
    await new Promise(resolve => setTimeout(resolve, 250))
  seeds[counterKey] = String(Math.floor(Date.now() / 30_000))
  writeFileSync(seedFile, JSON.stringify(seeds))
  return totp(rawSecret)
}

// Use browser fetch, including its trusted Windows certificate store and same-origin cookie rules.
async function api(page: Page, path: string, method = 'GET', data?: unknown, headers?: Record<string, string>) {
  return page.evaluate(async ({ path, method, data, headers }) => {
    const response = await fetch(path, { method, credentials: 'same-origin',
      headers: { ...(data ? { 'Content-Type': 'application/json' } : {}), ...headers },
      body: data ? JSON.stringify(data) : undefined })
    return { status: response.status, text: await response.text(), etag: response.headers.get('etag') }
  }, { path, method, data, headers })
}

async function write(page: Page, path: string, method: 'POST' | 'PUT', data: object, headers?: Record<string, string>) {
  return page.evaluate(async ({ path, method, data, headers }) => {
    const csrf = await fetch('/bff/antiforgery')
    if (!csrf.ok) return { status: csrf.status, text: await csrf.text(), location: null, contentType: null }
    const { requestToken } = await csrf.json()
    const response = await fetch(path, {
      method, headers: { 'Content-Type': 'application/json', 'X-CSRF-TOKEN': requestToken, ...headers },
      body: JSON.stringify(data),
    })
    return { status: response.status, text: await response.text(),
      location: response.headers.get('location'), contentType: response.headers.get('content-type') }
  }, { path, method, data, headers })
}

async function login(page: Page, username: string) {
  console.log(`Starting ${username} browser login`)
  const user = realm.users.find(x => x.username === username)!
  await page.goto('/bff/login')
  await page.locator('#username').fill(username)
  await page.locator('#password').fill(user.credentials[0]!.value)
  await page.locator('#kc-login').click()
  const enrollment = page.locator('input[name="totpSecret"]')
  const challenge = page.locator('input[name="otp"]')
  await expect(enrollment.or(challenge)).toHaveCount(1)
  if (await enrollment.count()) {
    const raw = await enrollment.inputValue()
    seeds[username] = raw
    mkdirSync(runtime, { recursive: true }); writeFileSync(seedFile, JSON.stringify(seeds))
    await page.locator('input[name="totp"]').fill(await freshTotp(username, raw))
    await page.locator('input[name="userLabel"]').fill('P1 local browser check')
    await page.locator('input[type="submit"], button[type="submit"]').last().click()
  } else {
    if (!seeds[username]) throw new Error('Existing demo account MFA seed unavailable; use a separate fresh validation realm or enroll a new demo user.')
    await challenge.fill(await freshTotp(username, seeds[username]))
    await page.locator('#kc-login').click()
  }
  await page.waitForURL(url => url.origin === 'https://localhost:7443'
    || url.searchParams.get('execution') === 'VERIFY_PROFILE', { waitUntil: 'domcontentloaded' })
  if (new URL(page.url()).searchParams.get('execution') === 'VERIFY_PROFILE') {
    await page.locator('input[name="firstName"]').fill(username)
    await page.locator('input[name="lastName"]').fill('LocalDemo')
    await page.getByRole('button', { name: 'Submit', exact: true }).click()
  }
  await page.waitForURL('https://localhost:7443/', { waitUntil: 'domcontentloaded' })
  await expect(page.getByLabel('企业名称')).toBeVisible()
  console.log(`${username} OIDC and TOTP login passed`)
}

test('The direct frontend URL opens the BFF entry', async ({ page }) => {
  await page.goto('http://localhost:3000/?entry=aspire#workspace')
  await expect(page).toHaveURL('https://localhost:7443/?entry=aspire#workspace')
  await expect(page.getByRole('link', { name: '登录 Nexora' })).toBeVisible()
  await expect(page.getByRole('button', { name: '退出已有登录' })).toHaveCount(0)
})

test('Logout reports an unexpected antiforgery response in place', async ({ context, page }) => {
  await context.addCookies([{
    name: '__Host-Nexora.SsoHint', value: 'true', url: 'https://localhost:7443/', secure: true,
  }])
  await page.route('**/bff/antiforgery', route => route.fulfill({
    contentType: 'text/html',
    body: '<!doctype html><title>Nexora</title>',
  }))
  await page.goto('/')
  const logout = page.getByRole('button', { name: '退出已有登录', exact: true })
  await logout.click()
  await expect(page.getByRole('alert')).toHaveText('暂时无法发起退出，请重试。')
  await expect(page).toHaveURL('https://localhost:7443/')
  await expect(logout).toBeEnabled()
})

test('OIDC + TOTP, CSRF, workspace creation, projection, tenant denial and logout', async ({ browser, context: alice, page }) => {
  const bob = await browser.newContext({ baseURL: 'https://localhost:7443' })
  try {
    await page.goto('https://localhost:7443/')
    console.log('Public workspace page loaded')
    expect((await api(page, '/bff/me')).status).toBe(401)
    expect((await api(page, '/signin-oidc')).status).toBe(400)
    expect((await api(page, '/signout-callback-oidc')).status).toBe(400)
    await expect(page.getByRole('link', { name: '登录 Nexora' })).toBeVisible()
    await login(page, 'alice')
    expect((await api(page, '/api/workspaces')).status).toBe(401)
    expect(await page.evaluate(async () => {
      const response = await fetch('/bff/api/workspaces', { headers: { Authorization: 'Bearer invalid' } })
      return { status: response.status, cacheControl: response.headers.get('Cache-Control') }
    })).toEqual({ status: 200, cacheControl: 'no-store' })
    await page.goto('/bff/logout')
    await expect(page).toHaveURL('https://localhost:7443/')
    expect((await api(page, '/bff/me')).status).toBe(200)
    expect((await api(page, '/bff/api/workspaces', 'POST',
      { operationId: crypto.randomUUID(), name: 'CSRF must reject' })).status).toBe(400)
    const company = `浏览器验证商贸 ${Date.now()}`
    await page.getByLabel('企业名称').fill(company)
    await page.getByRole('button', { name: '创建工作区', exact: true }).click()
    await expect(page.getByRole('heading', { name: '初始化向导' })).toBeVisible()
    await page.getByRole('button', { name: '稍后继续' }).click()
    await expect(page.getByRole('button', { name: new RegExp(company) })).toBeVisible()
    const workspaces = JSON.parse((await api(page, '/bff/api/workspaces')).text) as { id: string; name: string }[]
    const id = workspaces.find(x => x.name === company)!.id
    await expect.poll(async () => (await api(page, `/bff/api/reports/workspaces/${id}`)).status, { timeout: 30_000 }).toBe(200)
    await page.getByRole('button', { name: '刷新投影' }).click()
    await expect(page.getByText('已同步', { exact: true })).toBeVisible()
    const cookies = await alice.cookies()
    const session = cookies.find(x => x.name === '__Host-Nexora.Session')!
    expect(session.httpOnly && session.secure).toBe(true)
    expect(session.value.split('.')).not.toHaveLength(3)
    expect(await page.evaluate(() => Object.keys(localStorage).length + Object.keys(sessionStorage).length)).toBe(0)
    await page.screenshot({ path: resolve('../../../artifacts/p1/workspace-desktop.png'), fullPage: true })
    await page.setViewportSize({ width: 390, height: 844 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: resolve('../../../artifacts/p1/workspace-mobile.png'), fullPage: true })

    const bobPage = await bob.newPage()
    await login(bobPage, 'bob')
    expect((await api(bobPage, `/bff/api/workspaces/${id}`)).status).toBe(404)
    expect((await api(bobPage, `/bff/api/reports/workspaces/${id}`)).status).toBe(404)
    await page.getByRole('button', { name: '退出登录', exact: true }).click()
    const signIn = page.getByRole('link', { name: '登录 Nexora' })
    await expect(signIn).toBeVisible()
    expect((await api(page, '/bff/me')).status).toBe(401)
    await alice.addCookies([session])
    expect((await api(page, '/bff/me')).status).toBe(401)
    await alice.clearCookies({ name: session.name })
    await expect(page.getByRole('button', { name: '退出已有登录' })).toHaveCount(0)
    await page.reload()
    await expect(signIn).toBeVisible()
    await expect(page.getByRole('button', { name: '退出已有登录' })).toHaveCount(0)
    await page.getByRole('link', { name: '开发账号登录', exact: true }).click()
    await expect(page.locator('#username')).toBeVisible()
  } finally { await bob.close({ reason: 'P1 check complete' }) }
})

for (const [tab, reload] of [['an open tab', false], ['a reloaded tab', true]] as const) {
  test(`Logout works from ${tab} after the BFF session is gone`, async ({ context, page }) => {
    await login(page, 'alice')
    await context.clearCookies({ name: '__Host-Nexora.Session' })
    expect((await api(page, '/bff/me')).status).toBe(401)

    const signIn = page.getByRole('link', { name: '登录 Nexora' })
    if (reload) {
      await page.reload()
      await expect(signIn).toBeVisible()
    }

    const logout = page.getByRole('button', { name: reload ? '退出已有登录' : '退出登录', exact: true })
    await expect(logout).toBeVisible({ timeout: 5_000 })
    const token = page.waitForResponse(response => new URL(response.url()).pathname === '/bff/antiforgery')
    await logout.click()
    expect((await token).status()).toBe(200)
    const confirm = page.locator('#kc-logout')
    await expect(confirm).toBeVisible()
    expect((await context.cookies()).some(cookie => cookie.name === '__Host-Nexora.SsoHint')).toBe(true)
    await confirm.click()
    await expect(signIn).toBeVisible()
    await expect(page.getByRole('button', { name: '退出已有登录' })).toHaveCount(0)
    expect((await api(page, '/bff/me')).status).toBe(401)
    expect((await api(page, '/bff/logout', 'POST')).status).toBe(400)
    expect((await write(page, '/bff/api/workspaces', 'POST', { name: 'Anonymous' })).status).toBe(401)
    await page.getByRole('link', { name: '开发账号登录', exact: true }).click()
    await expect(page.locator('#username')).toBeVisible()
  })
}

test('Workspace invitation, role assignment, immediate suspension and reactivation through the real BFF', async ({ browser, page }) => {
  const bobContext = await browser.newContext({ baseURL: 'https://localhost:7443' })
  try {
    await login(page, 'alice')
    const company = `成员管理商贸 ${Date.now()}`
    await page.getByLabel('企业名称').fill(company)
    await page.getByRole('button', { name: '创建工作区', exact: true }).click()
    await expect(page.getByRole('button', { name: new RegExp(company) })).toBeVisible()
    await page.waitForURL(/\/companies\/[0-9a-f-]+\/setup$/)
    await page.getByRole('link', { name: '团队与成员', exact: true }).click()
    await page.waitForURL(/\/companies\/[0-9a-f-]+\/members$/)
    await page.getByLabel('受邀邮箱', { exact: true }).fill('bob@nexora.invalid')
    await page.getByRole('button', { name: '创建邀请', exact: true }).click()
    const issued = page.getByLabel('一次性邀请码', { exact: true })
    await expect(issued).toBeVisible()
    const code = await issued.inputValue()
    await page.getByRole('button', { name: '隐藏邀请码', exact: true }).click()
    const workspaces = JSON.parse((await api(page, '/bff/api/workspaces')).text) as { id: string; name: string }[]
    const id = workspaces.find(w => w.name === company)!.id
    const bob = await bobContext.newPage()
    await login(bob, 'bob')
    const identity = JSON.parse((await api(bob, '/bff/me')).text) as { subject: string }
    await bob.getByLabel('邀请码', { exact: true }).fill(code)
    await bob.getByRole('button', { name: '兑换邀请', exact: true }).click()
    await expect(bob.getByText('已加入工作区。', { exact: true })).toBeVisible()
    await expect.poll(async () => (await api(bob, `/bff/api/reports/workspaces/${id}`)).status).toBe(200)
    await bob.getByRole('link', { name: '团队与成员', exact: true }).click()
    await expect(bob.getByText('成员管理由工作区所有者或访问管理员负责。')).toBeVisible()
    await expect(bob.getByRole('button', { name: '创建邀请', exact: true })).toHaveCount(0)
    const catalog = `/bff/api/masterdata/workspaces/${id}`
    expect((await api(bob, `${catalog}/catalog`)).status).toBe(200)
    expect((await api(bob, `${catalog}/partners`)).status).toBe(200)
    expect((await write(bob, `${catalog}/partners`, 'POST', {
      operationId: crypto.randomUUID(), code: 'PARTY', profile: { name: '越权写入', roles: ['customer'], contacts: [] },
    })).status).toBe(403)
    expect((await write(bob, `${catalog}/definitions`, 'POST', {
      operationId: crypto.randomUUID(), kind: 'unit', code: 'EA', name: '越权写入',
    })).status).toBe(403)

    await page.getByRole('button', { name: '刷新权限与成员', exact: true }).click()
    const row = page.locator(`[data-subject="${identity.subject}"]`)
    await expect(row).toBeVisible()
    await row.getByRole('button', { name: '编辑权限', exact: true }).click()
    await row.getByLabel('成员角色', { exact: true }).click()
    await page.getByRole('option', { name: '访问管理员', exact: true }).click()
    await row.getByRole('button', { name: '保存成员', exact: true }).click()
    await expect(page.getByText('成员权限已更新。', { exact: true })).toBeVisible()
    await bob.getByRole('button', { name: '刷新权限与成员', exact: true }).click()
    await expect(bob.getByRole('button', { name: '创建邀请', exact: true })).toBeVisible()
    expect((await api(bob, `/bff/api/workspaces/${id}/authorization/finance.journal.post`)).status).toBe(403)

    await row.getByRole('button', { name: '编辑权限', exact: true }).click()
    await row.getByRole('checkbox', { name: '启用', exact: true }).uncheck()
    await row.getByRole('button', { name: '保存成员', exact: true }).click()
    await expect.poll(async () => (await api(bob, `/bff/api/workspaces/${id}`)).status).toBe(404)
    expect((await api(bob, `/bff/api/reports/workspaces/${id}`)).status).toBe(404)
    expect((await api(bob, `${catalog}/catalog`)).status).toBe(404)
    expect((await api(bob, `${catalog}/partners`)).status).toBe(404)
    expect((await api(bob, '/bff/me')).status).toBe(200) // Authentication survived; business authorization was revoked.
    await bob.getByRole('button', { name: '刷新权限与成员', exact: true }).click()
    await expect(bob.getByLabel('工作区成员与授权')).not.toContainText('创建邀请')
    await row.getByRole('button', { name: '编辑权限', exact: true }).click()
    await row.getByRole('checkbox', { name: '启用', exact: true }).check()
    await row.getByRole('button', { name: '保存成员', exact: true }).click()
    await expect.poll(async () => (await api(bob, `/bff/api/workspaces/${id}`)).status).toBe(200)
    await page.getByLabel('受邀邮箱', { exact: true }).fill('revoked@nexora.invalid')
    await page.getByRole('button', { name: '创建邀请', exact: true }).click()
    await expect(issued).toBeVisible()
    const revokedInvitationId = (await issued.inputValue()).split('.')[0]!
    await page.getByRole('button', { name: '隐藏邀请码', exact: true }).click()
    await page.getByRole('button', { name: '撤销邀请', exact: true }).click()
    await expect(page.getByText('邀请已撤销。', { exact: true })).toBeVisible()
    const invitationRecords = JSON.parse((await api(page, `/bff/api/workspaces/${id}/invitations`)).text) as { id: string; state: string }[]
    expect(invitationRecords.find(invitation => invitation.id === revokedInvitationId)!.state).toBe('Revoked')
    await page.getByLabel('受邀邮箱', { exact: true }).fill('revoked@nexora.invalid')
    await page.getByRole('button', { name: '创建邀请', exact: true }).click()
    await expect(issued).toBeVisible()
    expect((await issued.inputValue()).split('.')[0]).not.toBe(revokedInvitationId)
    await page.getByRole('button', { name: '隐藏邀请码', exact: true }).click()
    await page.screenshot({ path: resolve('../../../artifacts/p1/members-desktop.png'), fullPage: true })
    await page.setViewportSize({ width: 390, height: 844 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: resolve('../../../artifacts/p1/members-mobile.png'), fullPage: true })
  } finally { await bobContext.close() }
})

test('Partner profiles retain multiple roles and scoped contacts across edits and reference checks', async ({ page }) => {
  await login(page, 'alice')
  const company = `往来档案 ${Date.now()}`
  const first = await write(page, '/bff/api/workspaces', 'POST', { operationId: crypto.randomUUID(), name: company })
  const second = await write(page, '/bff/api/workspaces', 'POST', { operationId: crypto.randomUUID(), name: `往来隔离 ${Date.now()}` })
  expect(first.status).toBe(201)
  expect(second.status).toBe(201)
  const workspaceId = JSON.parse(first.text).id as string
  const otherId = JSON.parse(second.text).id as string
  const path = `/bff/api/masterdata/workspaces/${workspaceId}/partners`
  const otherPath = `/bff/api/masterdata/workspaces/${otherId}/partners`

  await page.reload()
  await page.getByRole('button', { name: new RegExp(company) }).click()
  await page.getByTestId('module-partners').click()
  await page.getByRole('button', { name: '新增往来单位' }).click()
  await page.getByLabel('往来编码').fill('party-01')
  await page.getByLabel('往来名称').fill('华新联合商贸')
  await page.getByLabel('往来税号').fill('LOCAL-TEST-001')
  await page.getByLabel('往来地址').fill('本地测试地址')
  for (const role of ['客户', '供应商', '捐赠人'])
    await page.getByRole('checkbox', { name: role, exact: true }).check()
  await page.getByRole('button', { name: '添加联系人' }).click()
  await page.getByLabel('联系人姓名').fill('张三')
  await page.getByLabel('联系人邮箱').fill('contact@example.invalid')
  await page.getByLabel('联系人电话').fill('010-00000000')
  await page.getByRole('button', { name: '保存往来单位' }).click()
  await expect(page.getByRole('row', { name: /PARTY-01 华新联合商贸 客户 \/ 供应商 \/ 捐赠人/ })).toBeVisible()
  await expect(page.getByText('contact@example.invalid', { exact: false })).toBeVisible()

  const list = await api(page, path)
  expect(list.status).toBe(200)
  const partnerId = JSON.parse(list.text).items[0].id as string
  const detailPath = `${path}/${partnerId}`
  const referencePath = `${detailPath}/reference`
  const original = JSON.parse((await api(page, detailPath)).text)
  const contactId = original.contacts[0].id as string
  expect(original.version).toBe(1)
  expect(original.roles).toEqual(['customer', 'supplier', 'donor'])
  const reference = await api(page, `${referencePath}?role=supplier`)
  expect(reference.status).toBe(200)
  expect(JSON.parse(reference.text)).toEqual({ id: partnerId, code: 'PARTY-01', name: '华新联合商贸', role: 'supplier', version: 1 })
  expect((await api(page, `${otherPath}/${partnerId}`)).status).toBe(404)
  expect((await api(page, `${otherPath}/${partnerId}/reference?role=customer`)).status).toBe(404)
  expect((await api(page, `${referencePath}?role=unknown`)).status).toBe(400)

  const profile = { name: '另一个往来单位', roles: ['customer'], contacts: [] as object[] }
  const create = { operationId: crypto.randomUUID(), code: 'party-01', profile }
  expect((await write(page, path, 'POST', create)).status).toBe(409)
  const outside = await write(page, otherPath, 'POST', create)
  expect(outside.status).toBe(200)
  const outsidePartner = `${otherPath}/${JSON.parse(outside.text).id}`
  expect((await write(page, outsidePartner, 'PUT', {
    operationId: crypto.randomUUID(), expectedVersion: 1, isActive: true,
    profile: { ...profile, contacts: [{ id: contactId, name: '试图复用跨公司联系人' }] },
  })).status).toBe(400)
  expect((await write(page, path, 'POST', {
    operationId: crypto.randomUUID(), code: 'BAD', profile: { ...profile, roles: [] },
  })).status).toBe(400)

  await page.getByRole('button', { name: '编辑往来单位' }).click()
  await page.getByLabel('往来名称').fill('华新联合商贸二部')
  await page.getByLabel('联系人电话').fill('010-00000001')
  await page.getByRole('button', { name: '添加联系人' }).click()
  await page.getByRole('group', { name: '联系人 2', exact: true }).getByLabel('联系人姓名').fill('李四')
  await page.getByRole('button', { name: '保存往来单位' }).click()
  await expect(page.getByRole('heading', { name: '华新联合商贸二部' })).toBeVisible()
  const revised = JSON.parse((await api(page, detailPath)).text)
  expect(revised.version).toBe(2)
  expect(revised.contacts).toHaveLength(2)
  const retained = revised.contacts.find((contact: { id: string }) => contact.id === contactId)
  expect(retained.phone).toBe('010-00000001')
  const disabled = {
    operationId: crypto.randomUUID(), expectedVersion: 2, isActive: false,
    profile: { name: revised.name, roles: revised.roles, taxNumber: revised.taxNumber,
      address: revised.address, contacts: [retained] },
  }
  expect((await write(page, detailPath, 'PUT', { ...disabled, expectedVersion: 1 })).status).toBe(409)
  const saved = await write(page, detailPath, 'PUT', disabled)
  const replay = await write(page, detailPath, 'PUT', disabled)
  expect(saved.status).toBe(200)
  expect(replay.status).toBe(200)
  expect(JSON.parse(saved.text)).toEqual(JSON.parse(replay.text))
  expect((await api(page, `${referencePath}?role=customer`)).status).toBe(409)
  expect(JSON.parse((await api(page, detailPath)).text).contacts).toHaveLength(1)

  const enabled = await write(page, detailPath, 'PUT', {
    operationId: crypto.randomUUID(), expectedVersion: 3, isActive: true,
    profile: { ...disabled.profile, roles: ['donor'] },
  })
  expect(enabled.status).toBe(200)
  expect((await api(page, `${referencePath}?role=supplier`)).status).toBe(409)
  expect((await api(page, `${referencePath}?role=donor`)).status).toBe(200)
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

test('Company presentation and private workspace links stay independently scoped', async ({ browser, page }) => {
  await login(page, 'alice')
  const company = `偏好设置 ${Date.now()}`
  const created = await write(page, '/bff/api/workspaces', 'POST', { operationId: crypto.randomUUID(), name: company })
  expect(created.status).toBe(201)
  const enterprise = JSON.parse(created.text) as { id: string; tenantId: string }
  await page.reload()

  type Workspace = { id: string; name: string; tenantId: string; isPersonal: boolean }
  let personal = (JSON.parse((await api(page, '/bff/api/workspaces')).text) as Workspace[]).find(workspace => workspace.isPersonal)
  if (!personal) {
    const personalName = `个人工作区 ${Date.now()}`
    await page.getByRole('checkbox', { name: '创建个人工作区', exact: true }).check()
    await page.getByLabel('个人工作区名称').fill(personalName)
    await page.getByRole('button', { name: '创建工作区', exact: true }).click()
    await expect(page.getByRole('button', { name: new RegExp(personalName) })).toBeVisible()
    personal = (JSON.parse((await api(page, '/bff/api/workspaces')).text) as Workspace[]).find(workspace => workspace.isPersonal)!
  }
  expect(personal.tenantId).not.toBe(enterprise.tenantId)
  expect((await write(page, '/bff/api/workspaces/personal', 'POST', {
    operationId: crypto.randomUUID(), name: '第二个个人工作区',
  })).status).toBe(409)
  expect((await write(page, `/bff/api/workspaces/${personal.id}/invitations`, 'POST', {
    operationId: crypto.randomUUID(), expectedVersion: 1, email: 'bob@nexora.invalid', role: 'WorkspaceReader',
  })).status).toBe(409)

  await page.getByRole('button', { name: new RegExp(company) }).click()
  await page.getByTestId('module-company').click()
  await page.getByLabel('法定名称').fill('华新商贸有限公司')
  await page.getByLabel('品牌名称').fill('华新品牌')
  await page.getByLabel('日期格式').click()
  await page.getByRole('option', { name: '日/月/年' }).click()
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3fcAAAAASUVORK5CYII=', 'base64')
  await page.getByLabel('公司标志').setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: png })
  await expect(page.getByAltText('公司标志预览')).toBeVisible()
  await page.getByLabel('自定义角色授权审批').click()
  await page.getByRole('option', { name: '2 位所有者批准' }).click()
  await page.getByRole('button', { name: '保存公司设置' }).click()
  await expect(page.getByText('公司设置已保存。', { exact: true })).toBeVisible()

  const companyPath = `/bff/api/workspaces/${enterprise.id}`
  const settings = JSON.parse((await api(page, `${companyPath}/settings`)).text)
  expect(settings.version).toBe(1)
  expect(settings.presentation.brandName).toBe('华新品牌')
  expect(settings.presentation.dateFormat).toBe('dd/MM/yyyy')
  expect(settings.roleGrantApprovals).toBe(2)
  expect(settings.presentation.logoDataUrl).toBe(`data:image/png;base64,${png.toString('base64')}`)
  expect((await write(page, `${companyPath}/settings`, 'PUT', {
    expectedVersion: 0, presentation: settings.presentation,
  })).status).toBe(409)
  expect((await write(page, `${companyPath}/settings`, 'PUT', {
    expectedVersion: 1, presentation: { ...settings.presentation, logoDataUrl: 'data:image/svg+xml;base64,PHN2Zz4=' },
  })).status).toBe(400)

  await page.getByTestId('module-book').click()
  await page.getByLabel('核算起点').fill('2026-01-01')
  await page.getByLabel('会计年度起始月').fill('4')
  await page.getByRole('button', { name: '初始化账簿', exact: true }).click()
  await expect(page.getByRole('heading', { name: '商贸起始科目' })).toBeVisible()
  const companyBookPath = `/bff/api/finance/workspaces/${enterprise.id}/book`
  const personalBookPath = `/bff/api/finance/workspaces/${personal.id}/book`
  const companyBook = JSON.parse((await api(page, companyBookPath)).text)
  expect(companyBook.settings).toEqual({
    baseCurrency: 'CNY', minorUnits: 2, startsOn: '2026-01-01', fiscalYearStartMonth: 4, template: 'trade-starter-v1',
  })
  expect(companyBook.accounts).toHaveLength(7)
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: '导出起始科目' }).click()
  const download = await downloadPromise
  const exported = JSON.parse(readFileSync((await download.path())!, 'utf8'))
  expect(exported.format).toBe('nexora.chart-structure.v1')
  expect(exported.accounts).toContainEqual({ code: '1405', name: '库存商品', category: 'asset' })
  expect((await write(page, companyBookPath, 'POST', {
    operationId: crypto.randomUUID(), baseCurrency: 'USD', startsOn: '2026-01-01', fiscalYearStartMonth: 1,
  })).status).toBe(409)
  if (JSON.parse((await api(page, personalBookPath)).text).settings === null) {
    const start = { operationId: crypto.randomUUID(), baseCurrency: 'JPY', startsOn: '2026-02-01', fiscalYearStartMonth: 1 }
    const initialized = await write(page, personalBookPath, 'POST', start)
    const replay = await write(page, personalBookPath, 'POST', start)
    expect(initialized.status).toBe(200)
    expect(replay.status).toBe(200)
    expect(JSON.parse(replay.text)).toEqual(JSON.parse(initialized.text))
  }
  const personalBook = JSON.parse((await api(page, personalBookPath)).text)
  expect(personalBook.settings).toEqual({
    baseCurrency: 'JPY', minorUnits: 0, startsOn: '2026-02-01', fiscalYearStartMonth: 1, template: 'personal-starter-v1',
  })
  expect(personalBook.accounts).toHaveLength(5)
  expect(personalBook.accounts.some((account: { id: string }) =>
    companyBook.accounts.some((other: { id: string }) => other.id === account.id))).toBe(false)

  await page.getByTestId('module-company').click()
  await page.getByRole('button', { name: '建立关联', exact: true }).click()
  const shortcut = page.getByRole('button', { name: `前往 ${personal.name}`, exact: true })
  await expect(shortcut).toBeVisible()
  await shortcut.click()
  await expect(page.getByRole('heading', { name: personal.name, exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '创建邀请', exact: true })).toHaveCount(0)

  const preflight = '/bff/api/account/deletion-preflight'
  await page.getByRole('button', { name: '检查删除条件' }).click()
  await expect(page.getByRole('region', { name: '账号删除预检' })).toContainText('需要解除个人账本与企业的关联')
  const deletion = JSON.parse((await api(page, preflight)).text)
  const accountPopup = page.context().waitForEvent('page')
  await page.getByRole('link', { name: '管理登录凭据与设备会话' }).click()
  const account = await accountPopup
  await expect(account).toHaveURL(/\/realms\/nexora\/account\//)
  await account.close()
  expect(deletion).toMatchObject({ requiresRetentionReview: true, blockers: expect.arrayContaining([
    expect.objectContaining({ code: 'company-ownership', workspaceId: enterprise.id }),
    expect.objectContaining({ code: 'last-active-administrator', workspaceId: enterprise.id }),
    expect.objectContaining({ code: 'personal-workspace-disposition', workspaceId: personal.id }),
  ]) })
  const bob = await browser.newContext({ baseURL: 'https://localhost:7443' })
  try {
    const bobPage = await bob.newPage()
    await login(bobPage, 'bob')
    expect((await api(bobPage, companyPath + '/announcements')).status).toBe(404)
    const bobDeletion = JSON.parse((await api(bobPage, preflight + '?subject=alice')).text)
    expect(bobDeletion.blockers.some((item: { workspaceId: string }) => [enterprise.id, personal.id].includes(item.workspaceId))).toBe(false)
    expect((await api(bobPage, `/bff/api/workspaces/${personal.id}`)).status).toBe(404)
    expect((await api(bobPage, personalBookPath)).status).toBe(404)
    expect((await api(bobPage, companyBookPath)).status).toBe(404)
    expect((await write(bobPage, `${companyPath}/personal-links/${personal.id}`, 'PUT', { isLinked: true })).status).toBe(404)
  } finally { await bob.close() }

  await page.getByRole('button', { name: new RegExp(company) }).click()
  await page.getByTestId('module-company').click()
  await expect(shortcut).toBeVisible()
  await page.getByRole('button', { name: '解除关联', exact: true }).click()
  await expect(shortcut).toHaveCount(0)
  expect((await api(page, `/bff/api/workspaces/${personal.id}`)).status).toBe(200)
})

test('Account session registry lists devices, revokes other sessions and blocks replay', async ({ browser, page }) => {
  await login(page, 'alice')
  const second = await browser.newContext({ baseURL: 'https://localhost:7443' })
  const bob = await browser.newContext({ baseURL: 'https://localhost:7443' })
  try {
    const secondPage = await second.newPage()
    await login(secondPage, 'alice')
    const first = JSON.parse((await api(page, '/bff/sessions')).text) as {
      sessions: { id: string; createdAt: number; lastSeenAt: number; userAgent: string; expiresAt: number; current: boolean }[]
    }
    expect(first.sessions.filter(item => item.current)).toHaveLength(1)
    expect(first.sessions.length).toBeGreaterThanOrEqual(2)
    for (const item of first.sessions) {
      expect(item.id).toMatch(/^[\w-]{22}$/)
      expect(typeof item.userAgent).toBe('string')
      expect(item.lastSeenAt).toBeGreaterThan(0)
    }
    const target = first.sessions.filter(item => !item.current).sort((a, b) => b.createdAt - a.createdAt)[0]!

    const bobPage = await bob.newPage()
    await login(bobPage, 'bob')
    const bobList = JSON.parse((await api(bobPage, '/bff/sessions')).text) as { sessions: { id: string }[] }
    expect(bobList.sessions.some(item => first.sessions.some(other => other.id === item.id))).toBe(false)
    expect((await write(bobPage, '/bff/sessions/' + target.id + '/revoke', 'POST', {})).status).toBe(404)

    const revoked = await write(page, '/bff/sessions/' + target.id + '/revoke', 'POST', {})
    expect(revoked.status).toBe(200)
    expect(JSON.parse(revoked.text)).toEqual({ revoked: true, current: false })
    expect((await api(secondPage, '/bff/me')).status).toBe(401)
    expect((await api(page, '/bff/me')).status).toBe(200)

    // The revoked device must re-authenticate even though the Keycloak SSO cookie is still valid.
    await secondPage.goto('/bff/login')
    const password = secondPage.locator('input[name="password"]')
    await expect(password).toBeVisible()
    const alice = realm.users.find(x => x.username === 'alice')!
    await password.fill(alice.credentials[0]!.value)
    await secondPage.locator('#kc-login').click()
    const challenge = secondPage.locator('input[name="otp"]')
    if (await challenge.count()) {
      await challenge.fill(await freshTotp('alice', seeds['alice']!))
      await secondPage.locator('#kc-login').click()
    }
    await secondPage.waitForURL('https://localhost:7443/', { waitUntil: 'domcontentloaded', timeout: 60000 })
    expect((await api(secondPage, '/bff/me')).status).toBe(200)

    await page.reload()
    const region = page.getByRole('region', { name: '设备与会话' })
    await expect(region).toBeVisible()
    await expect(region).toContainText('当前设备')
    const listed = JSON.parse((await api(page, '/bff/sessions')).text) as { sessions: unknown[] }
    expect(listed.sessions.length).toBeGreaterThanOrEqual(2)
    await expect.poll(async () => region.locator('li').count()).toBe(listed.sessions.length)
    await region.getByRole('button', { name: '撤销其他设备' }).click()
    await expect.poll(async () => (await api(secondPage, '/bff/me')).status).toBe(401)
    await expect.poll(async () => region.locator('li').count()).toBe(1)
    await expect.poll(async () => {
      const current = JSON.parse((await api(page, '/bff/sessions')).text) as { sessions: unknown[] }
      return current.sessions.length
    }).toBe(1)
    expect((await api(page, '/bff/me')).status).toBe(200)
  } finally {
    await second.close()
    await bob.close()
  }
})

test('Security capabilities report MFA state and gate stale sensitive writes', async ({ page }) => {
  await login(page, 'alice')
  const capabilities = JSON.parse((await api(page, '/bff/security/capabilities')).text) as {
    available: boolean; required: boolean; enrolled: boolean; methods: string[]; stepUpSeconds: number
    lastVerifiedAt: string | null; reauthPath: string
  }
  expect(capabilities).toMatchObject({
    available: true, required: true, enrolled: true, stepUpSeconds: 300, reauthPath: '/bff/login?prompt=login',
  })
  expect(capabilities.methods).toContain('otp')
  expect(Date.parse(capabilities.lastVerifiedAt!)).toBeGreaterThan(0)

  const created = await write(page, '/bff/api/workspaces', 'POST', { operationId: crypto.randomUUID(), name: '安全验证 ' + Date.now() })
  expect(created.status).toBe(201)
  const workspaceId = JSON.parse(created.text).id as string
  const path = `/bff/api/workspaces/${workspaceId}/settings`
  const settings = JSON.parse((await api(page, path)).text) as { version: number; presentation: object }
  expect(settings.version).toBe(0)
  const revised = await write(page, path, 'PUT', { expectedVersion: settings.version, presentation: settings.presentation })
  expect(revised.status).toBe(200)
  expect(JSON.parse(revised.text)).toMatchObject({ workspaceId, version: 1 })

  await page.reload()
  const region = page.getByRole('region', { name: '账户安全' })
  await expect(region).toBeVisible()
  await expect(region).toContainText('已启用')
  await expect(region).toContainText('TOTP')
  await expect(region).toContainText('重新验证身份')
})

test('Chart hierarchy, archive, import preview and commit share the same scoped revision', async ({ page }) => {
  await login(page, 'alice')
  const name = `科目导入 ${Date.now()}`
  const created = await write(page, '/bff/api/workspaces', 'POST', { operationId: crypto.randomUUID(), name })
  expect(created.status).toBe(201)
  const id = JSON.parse(created.text).id as string
  const root = `/bff/api/finance/workspaces/${id}`
  expect((await write(page, `${root}/book`, 'POST', {
    operationId: crypto.randomUUID(), baseCurrency: 'CNY', startsOn: '2026-01-01', fiscalYearStartMonth: 1,
  })).status).toBe(200)
  const chart = `${root}/chart`
  const read = async () => JSON.parse((await api(page, chart)).text)
  const preview = (file: string, mode = 'append', format = 'nexora-json') =>
    write(page, `${chart}/imports/preview`, 'POST', { mode, format, file })
  const commit = (previewId: string, operationId = crypto.randomUUID()) =>
    write(page, `${chart}/imports/${previewId}/commit`, 'POST', { operationId })
  const json = (...accounts: object[]) => JSON.stringify({ format: 'nexora.chart-structure.v1', accounts })
  const apply = async (code: string, patch: object) => {
    const state = await read()
    const current = state.accounts.find((account: { code: string }) => account.code === code)
    const { name, category, parentCode, purpose, isArchived, version } = current
    return write(page, `${chart}/accounts`, 'POST', { operationId: crypto.randomUUID(),
      expectedRevision: state.revision, expectedVersion: version, account: { code, name, category, parentCode, purpose, isArchived, ...patch } })
  }

  await page.reload()
  await page.getByRole('button', { name: new RegExp(name) }).click()
  await page.getByTestId('module-book').click()
  await page.getByRole('button', { name: '打开科目管理' }).click()
  await page.getByRole('button', { name: '新增科目', exact: true }).click()
  await page.getByLabel('科目编码').fill('1100')
  await page.getByLabel('科目名称').fill('货币资金组')
  await page.getByLabel('科目用途').click()
  await page.getByRole('option', { name: '分组', exact: true }).click()
  await page.getByRole('button', { name: '保存科目', exact: true }).click()
  await expect(page.getByRole('row', { name: /1100 货币资金组/ })).toBeVisible()

  const child = { code: '1101', name: '门店备用金', category: 'asset', parentCode: '1100' }
  const before = await read()
  await page.getByLabel('科目文件内容').fill(json(child))
  await page.getByRole('button', { name: '预览导入', exact: true }).click()
  await expect(page.getByText('新增 · 1101 · 门店备用金')).toBeVisible()
  expect((await read()).revision).toBe(before.revision)
  await page.getByRole('button', { name: '提交导入', exact: true }).click()
  await expect(page.getByRole('row', { name: /1101 门店备用金 1100/ })).toBeVisible()
  const childId = (await read()).accounts.find((x: { code: string }) => x.code === '1101').id

  expect((await apply('1100', { isArchived: true })).status).toBe(409)
  await page.getByRole('button', { name: '编辑科目 1101', exact: true }).click()
  await page.getByRole('checkbox', { name: '归档科目', exact: true }).check()
  await page.getByRole('button', { name: '保存科目', exact: true }).click()
  await expect(page.getByRole('row', { name: /1101 .*已归档/ })).toBeVisible()
  expect((await apply('1100', { isArchived: true })).status).toBe(200)
  expect((await apply('1101', { isArchived: false })).status).toBe(409)
  expect((await apply('1100', { isArchived: false })).status).toBe(200)
  expect((await apply('1101', { isArchived: false })).status).toBe(200)
  const cycle = await preview(json({ code: 'X1', name: '循环一', category: 'asset', purpose: 'group', parentCode: 'X2' },
    { code: 'X2', name: '循环二', category: 'asset', purpose: 'group', parentCode: 'X1' }))
  expect(JSON.parse(cycle.text).previewId).toBeNull()
  expect(JSON.parse(cycle.text).errors.some((x: { message: string }) => x.message.includes('循环'))).toBe(true)
  const injection = await preview('Code,Name,Category,Balance\nX3,余额注入,asset,99', 'append', 'nexora-csv')
  expect(JSON.parse(injection.text).previewId).toBeNull()
  const duplicate = await preview(json(child))
  expect(JSON.parse(duplicate.text).previewId).toBeNull()

  const stale = JSON.parse((await preview(json({ ...child, name: '旧预览' }), 'upsert')).text)
  expect(stale.previewId).toBeTruthy()
  expect((await apply('1101', { name: '实际版本' })).status).toBe(200)
  const currentAfterEdit = await read()
  expect((await commit(stale.previewId)).status).toBe(409)
  expect(await read()).toEqual(currentAfterEdit)
  const mixed = await preview(json({ code: 'NEW', name: '有效行', category: 'asset' },
    { code: '1001', name: '类别冲突', category: 'liability' }), 'upsert')
  expect(JSON.parse(mixed.text).previewId).toBeNull()
  expect(await read()).toEqual(currentAfterEdit)
  const xero = JSON.parse((await preview('Code,Name,Type,Tax Code\n0012,"样例,银行",Bank,No Tax', 'append', 'xero-csv')).text)
  expect(xero.previewId).toBeTruthy()
  expect((await commit(xero.previewId)).status).toBe(200)
  const qbo = JSON.parse((await preview('Account Number,Account Name,Type,Detail Type\n1101,门店银行,Bank,Checking', 'upsert', 'qbo-csv')).text)
  expect(qbo.previewId).toBeTruthy()
  const operation = crypto.randomUUID()
  const result = await commit(qbo.previewId, operation)
  expect(result.status).toBe(200)
  expect(JSON.parse((await commit(qbo.previewId, operation)).text)).toEqual(JSON.parse(result.text))
  expect((await read()).accounts.find((x: { code: string }) => x.code === '1101').id).toBe(childId)
  expect((await read()).accounts.some((x: { code: string }) => x.code === '0012')).toBe(true)

  const replacement = JSON.parse((await preview(json({ ...child, parentCode: null }), 'replace')).text)
  expect(replacement.previewId).toBeTruthy()
  expect((await commit(replacement.previewId)).status).toBe(200)
  const snapshot = JSON.parse((await api(page, `${chart}/exports/snapshot`)).text)
  expect(snapshot.accounts.filter((x: { isArchived: boolean }) => !x.isArchived)).toHaveLength(1)
  expect(snapshot.accounts.find((x: { code: string }) => x.code === '1101').id).toBe(childId)
})

test('Effective tax rates and scoped classifications preserve calculation snapshots', async ({ page }) => {
  await login(page, 'alice')
  const name = `税务配置 ${Date.now()}`
  const created = await write(page, '/bff/api/workspaces', 'POST', { operationId: crypto.randomUUID(), name })
  expect(created.status).toBe(201)
  const id = JSON.parse(created.text).id as string
  const finance = `/bff/api/finance/workspaces/${id}`
  const master = `/bff/api/masterdata/workspaces/${id}`
  const post = (path: string, body: object) => write(page, path, 'POST', { operationId: crypto.randomUUID(), ...body })
  expect((await post(`${finance}/book`, { baseCurrency: 'CNY', startsOn: '2026-01-01', fiscalYearStartMonth: 1 })).status).toBe(200)
  await page.reload()
  await page.getByRole('button', { name: new RegExp(name) }).click()
  await page.getByTestId('module-book').click()
  await page.getByRole('button', { name: '打开税务配置' }).click()
  await page.getByLabel('税项编码').fill('SAMPLE')
  await page.getByLabel('税项名称').fill('样例税项')
  await page.getByLabel('生效日期').fill('2026-01-01')
  await page.getByLabel('税率（13% 填 0.13）').fill('0.13')
  await page.getByRole('button', { name: '保存税率版本' }).click()
  await expect(page.getByText('SAMPLE · 样例税项 · 2026-01-01 · 0.13', { exact: true })).toBeVisible()
  await page.getByLabel('税组编码').fill('SALE')
  await page.getByLabel('税组名称').fill('样例销售')
  await page.getByLabel('税项', { exact: true }).click()
  await page.getByRole('option', { name: 'SAMPLE' }).click()
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: '保存税组' }).click()
  await expect(page.getByRole('button', { name: '编辑税组 SALE' })).toBeVisible()
  const path = `${finance}/tax`
  const save = (part: string, body: object) => post(`${path}/${part}`, body)
  expect((await save('rates', { code: 'ITEM5', name: '另一测试税率', effectiveOn: '2026-01-01', rate: '0.05' })).status).toBe(200)
  expect((await save('groups', { code: 'ITEM', name: '样例商品组', expectedVersion: 0, rateCodes: ['ITEM5'] })).status).toBe(200)
  const define = async (kind: string, code: string) => {
    const response = await post(`${master}/definitions`, { kind, code, name: code })
    expect(response.status, response.text).toBe(200)
    return JSON.parse(response.text).id as string
  }
  const categoryId = await define('category', 'sample')
  const unitId = await define('unit', 'piece')
  const item = await post(`${master}/items`, { code: 'SAMPLE', name: '样例商品', kind: 'product', tracksInventory: false, categoryId, unitId })
  expect(item.status, item.text).toBe(200)
  const itemId = JSON.parse(item.text).id as string
  const partner = await post(`${master}/partners`, { code: 'SAMPLE', profile: { name: '样例客户', roles: ['customer'], contacts: [] } })
  expect(partner.status, partner.text).toBe(200)
  const partnerId = JSON.parse(partner.text).id as string
  expect((await save('classifications', { kind: 'item', resourceId: crypto.randomUUID(), groupCode: 'SALE', expectedVersion: 0 })).status).toBe(404)
  for (const [kind, resourceId] of [['item', itemId], ['partner', partnerId]]) {
    const classified = await save('classifications', { kind, resourceId, groupCode: kind === 'item' ? 'ITEM' : 'SALE', expectedVersion: 0 })
    expect(classified.status, classified.text).toBe(200)
  }
  const input = { operationId: crypto.randomUUID(), on: '2026-06-01', itemId, partnerId, unitPrice: '100', quantity: '3', discount: '0.1', includesTax: false }
  const assessment = await save('assessments', input)
  expect(assessment.status, assessment.text).toBe(200)
  const saved = JSON.parse(assessment.text)
  expect(saved.groupSource).toBe('partner')
  expect(saved.amounts).toMatchObject({ net: '270', tax: '35.1', total: '305.1' })
  expect(saved.references).toEqual([
    { kind: 'item', resourceId: itemId, version: 1, classificationVersion: 1 },
    { kind: 'partner', resourceId: partnerId, version: 1, classificationVersion: 1 },
  ])
  expect(JSON.parse((await save('assessments', input)).text)).toEqual(saved)
  const itemDefault = await save('assessments', { ...input, operationId: crypto.randomUUID(), partnerId: null })
  expect(itemDefault.status, itemDefault.text).toBe(200)
  expect(JSON.parse(itemDefault.text)).toMatchObject({ groupSource: 'item', amounts: { net: '270', tax: '13.5', total: '283.5' } })
  const inclusive = await save('assessments', { on: '2026-06-01', groupCode: 'SALE', unitPrice: '113', quantity: '1', discount: '0', includesTax: true })
  expect(inclusive.status, inclusive.text).toBe(200)
  expect(JSON.parse(inclusive.text).amounts).toMatchObject({ net: '100', tax: '13', total: '113' })
  expect((await save('rates', { code: 'SAMPLE', name: '样例税项修订', effectiveOn: '2026-07-01', rate: '0.1' })).status).toBe(200)
  const later = await save('assessments', { ...input, operationId: crypto.randomUUID(), on: '2026-07-01' })
  expect(later.status, later.text).toBe(200)
  expect(JSON.parse(later.text).amounts).toMatchObject({ net: '270', tax: '27', total: '297' })
  expect(JSON.parse((await api(page, `${path}/assessments/${saved.id}`)).text)).toEqual(saved)
  await page.getByLabel('税额快照 ID').fill(saved.id)
  await page.getByRole('button', { name: '查询税额快照', exact: true }).click()
  await expect(page.getByText(/未税 270\.00 · 税额 35\.10 · 含税 305\.10/)).toBeVisible()
  const other = await post('/bff/api/workspaces', { name: `税务隔离 ${Date.now()}` })
  expect(other.status).toBe(201)
  const outside = `/bff/api/finance/workspaces/${JSON.parse(other.text).id}`
  expect((await api(page, `${outside}/tax/assessments/${saved.id}`)).status).toBe(404)
})

test('Opening, journal approval, period races, reversal and P5 accrual reports preserve the scoped ledger', async ({ page, browser }) => {
  test.setTimeout(240_000)
  const checker = await browser.newContext({ baseURL: 'https://localhost:7443' })
  try {
    const reviewer = await checker.newPage()
    await Promise.all([login(page, 'alice'), login(reviewer, 'bob')])
    const name = `总账验收 ${Date.now()}`
    const post = (actor: Page, path: string, body: object) => write(actor, path, 'POST', { operationId: crypto.randomUUID(), ...body })
    const ok = async (promise: Promise<{ status: number; text: string }>, status = 200) => {
      const response = await promise
      expect(response.status, response.text).toBe(status)
      return JSON.parse(response.text)
    }
    const workspace = await ok(post(page, '/bff/api/workspaces', { name }), 201)
    const outside = await ok(post(page, '/bff/api/workspaces', { name: `总账隔离 ${Date.now()}` }), 201)
    const finance = `/bff/api/finance/workspaces/${workspace.id}`
    const root = `${finance}/ledger`
    const org = `/bff/api/workspaces/${workspace.id}`
    const periods = `${root}/periods/2026-01-01`
    const journal = (id: string) => `${root}/journals/${id}`
    const settings = { baseCurrency: 'CNY', startsOn: '2026-01-01', fiscalYearStartMonth: 1 }
    const book = await ok(post(page, `${finance}/book`, settings))
    const otherBook = await ok(post(page, `/bff/api/finance/workspaces/${outside.id}/book`, settings))
    const idFor = (code: string) => book.accounts.find((x: { code: string }) => x.code === code).id as string
    const cash = idFor('1001')
    const equity = idFor('3001')
    const revenue = idFor('4001')
    const access = (actor: Page) => ok(api(actor, `${org}/access`))
    const invite = await ok(post(page, `${org}/invitations`, {
      expectedVersion: (await access(page)).authorizationVersion, email: 'bob@nexora.invalid', role: 'WorkspaceOwner',
    }))
    await ok(post(reviewer, `/bff/api/invitations/${invite.invitation.id}/redeem`, { token: invite.token }))
    expect((await post(reviewer, periods, { expectedVersion: 0, action: 'open', reason: '未授权' })).status).toBe(403)
    const members = await ok(api(page, `${org}/members`)) as { id: string; email: string }[]
    const alice = members.find(x => x.email === 'alice@nexora.invalid')!.id
    const bob = members.find(x => x.email === 'bob@nexora.invalid')!.id
    const changeRole = async (actor: Page, member: string, action: string, role?: string) =>
      post(actor, `${org}/members/${member}/finance-role`, { expectedVersion: (await access(actor)).authorizationVersion, action, role })
    const grant = async (proposer: Page, approver: Page, member: string, role: string) => {
      await ok(changeRole(proposer, member, 'propose', role))
      await ok(changeRole(approver, member, 'approve'))
    }
    await ok(changeRole(page, alice, 'propose', 'Accountant'))
    expect((await changeRole(page, alice, 'approve')).status).toBe(403)
    await ok(changeRole(reviewer, alice, 'approve'))
    await grant(reviewer, page, bob, 'FinanceReviewer')

    const ready = async (actor: Page) => {
      await actor.reload()
      await actor.getByRole('button', { name: new RegExp(name) }).click()
      await actor.getByTestId('module-book').click()
      await actor.getByRole('button', { name: '打开总账', exact: true }).click()
    }
    await ready(reviewer)
    await reviewer.getByLabel('期间操作原因').fill('启用一月账簿')
    await reviewer.getByRole('button', { name: '开放期间', exact: true }).click()
    await expect(reviewer.getByRole('button', { name: '2026-01 · 开放' })).toBeVisible()

    const chart = `${finance}/chart`
    const getChart = () => ok(api(page, chart))
    for (const purpose of ['group', 'control']) {
      const current = await getChart()
      await ok(post(page, `${chart}/accounts`, { expectedRevision: current.revision,
        account: { code: purpose.toUpperCase(), name: purpose, category: 'asset', purpose } }))
    }
    const emptyReplacement = await ok(post(page, `${chart}/imports/preview`, {
      mode: 'replace', format: 'nexora-json', file: JSON.stringify({
        format: 'nexora.chart-structure.v1', accounts: [{ code: '1001', name: '替换现金', category: 'asset' }],
      }),
    }))
    expect(emptyReplacement.previewId).toBeTruthy()
    expect((await post(reviewer, `${chart}/imports/${emptyReplacement.previewId}/commit`, {})).status).toBe(404)
    const before = await getChart()
    const draft = (first: string, second: string, debit: number, credit = debit, memo = '样例凭证', on = '2026-01-01') =>
      ({ on, memo, lines: [{ accountId: first, debit: String(debit), credit: '0' }, { accountId: second, debit: '0', credit: String(credit) }] })
    const create = (kind: string, sourceNumber: string, data: object) => post(page, `${root}/journals`, { kind, sourceNumber, draft: data })
    const decide = (actor: Page, id: string, expectedVersion: number, decision: string, operationId = crypto.randomUUID()) =>
      post(actor, `${journal(id)}/decision`, { expectedVersion, decision, operationId })
    expect((await create('opening', '', draft(cash, revenue, 1000))).status).toBe(409)
    expect((await create('opening', '', draft(cash, equity, 1000, 999))).status).toBe(409)
    expect((await create('opening', '', draft(cash, equity, 1000.001))).status).toBe(400)
    expect((await create('opening', '', draft(otherBook.accounts[0].id, equity, 1000))).status).toBe(404)
    for (const purpose of ['group', 'control']) {
      const restricted = before.accounts.find((x: { purpose: string }) => x.purpose === purpose)
      expect((await create('opening', '', draft(restricted.id, equity, 1000))).status).toBe(409)
    }
    expect((await api(reviewer, `/bff/api/finance/workspaces/${outside.id}/ledger`)).status).toBe(404)

    await ready(page)
    await page.getByLabel('凭证类型').click()
    await page.getByRole('option', { name: '期初单', exact: true }).click()
    await page.getByLabel('凭证摘要').fill('期初核对')
    const accountOption = (id: string) => {
      const account = book.accounts.find((x: { id: string }) => x.id === id) as { code: string; name: string }
      return `${account.code} · ${account.name}`
    }
    await page.getByLabel('科目 1', { exact: true }).click()
    await page.getByRole('option', { name: accountOption(cash), exact: true }).click()
    await page.getByLabel('科目 2', { exact: true }).click()
    await page.getByRole('option', { name: accountOption(equity), exact: true }).click()
    await page.getByLabel('借方 1').fill('1000')
    await page.getByLabel('贷方 2').fill('1000')
    await page.getByRole('button', { name: '保存凭证草稿', exact: true }).click()
    await expect(page.getByText('凭证草稿已保存。', { exact: true })).toBeVisible()
    const [opening] = await ok(api(page, `${root}/journals`))
    expect(opening.kind).toBe('opening')
    expect((await create('opening', '', draft(cash, equity, 1000))).status).toBe(409)
    expect((await post(page, `${chart}/imports/${emptyReplacement.previewId}/commit`, {})).status).toBe(409)
    expect(await getChart()).toEqual(before)
    await page.getByRole('button', { name: '提交复核', exact: true }).click()
    await expect(page.getByText('凭证已提交复核。', { exact: true })).toBeVisible()
    expect((await decide(page, opening.id, 2, 'post')).status).toBe(403)
    expect((await decide(reviewer, opening.id, 1, 'post')).status).toBe(409)

    // Changing the maker's permissions cannot turn that identity into an independent reviewer.
    await ok(changeRole(page, alice, 'revoke'))
    await grant(page, reviewer, alice, 'FinanceReviewer')
    expect((await decide(page, opening.id, 2, 'post')).status).toBe(409)
    await ok(changeRole(page, alice, 'revoke'))
    await grant(page, reviewer, alice, 'Accountant')

    const operationId = crypto.randomUUID()
    const approved = await ok(decide(reviewer, opening.id, 2, 'post', operationId))
    expect(await ok(decide(reviewer, opening.id, 2, 'post', operationId))).toEqual(approved)
    const openingView = await ok(api(page, journal(opening.id)))
    expect(openingView.approvedVersion).toBe(2)
    expect(openingView.reviewer.subject).not.toBe(openingView.maker.subject)
    const balancePath = `${root}/trial-balance/2026-01-01`
    const openingBalance = await ok(api(page, balancePath))
    expect(openingBalance).toMatchObject({ debit: '1000', credit: '1000', currency: 'CNY' })
    expect(openingBalance.accounts).toEqual(expect.arrayContaining([
      expect.objectContaining({ accountId: cash, balance: '1000' }), expect.objectContaining({ accountId: equity, balance: '-1000' }),
    ]))
    expect((await api(page, `/bff/api/finance/workspaces/${outside.id}/ledger/journals/${opening.id}`)).status).toBe(404)
    const used = await getChart()
    const usedCash = used.accounts.find((x: { id: string }) => x.id === cash)
    expect(usedCash.isUsed).toBe(true)
    const saveCash = async (account: object) => {
      const state = await getChart()
      const current = state.accounts.find((x: { id: string }) => x.id === cash)
      return post(page, `${chart}/accounts`, { expectedRevision: state.revision, expectedVersion: current.version,
        account: { code: current.code, name: current.name, category: current.category, purpose: current.purpose, ...account } })
    }
    expect((await saveCash({ purpose: 'control' })).status).toBe(409)

    const manual = await ok(create('manual', 'SAL-001', draft(cash, revenue, 100, 100, '交易入账', '2026-01-10')))
    expect((await create('manual', 'sal-001', draft(cash, revenue, 100))).status).toBe(409)
    const updated = await ok(write(page, journal(manual.id), 'PUT', {
      operationId: crypto.randomUUID(), expectedVersion: 1, draft: draft(cash, revenue, 150, 150, '编辑后交易', '2026-01-10'),
    }))
    const submitted = await ok(decide(page, manual.id, updated.version, 'submit'))
    const pending = await ok(create('manual', 'HELD', draft(cash, revenue, 25)))
    const held = await ok(decide(page, pending.id, pending.version, 'submit'))
    const move = (action: string, expectedVersion: number, reason = '一月对账') =>
      post(reviewer, periods, { action, expectedVersion, reason })
    const [racePost, raceClose] = await Promise.all([
      decide(reviewer, manual.id, submitted.version, 'post'), move('begin-close', 1),
    ])
    expect(raceClose.status, raceClose.text).toBe(200)
    expect([200, 409]).toContain(racePost.status)
    const closing = await ok(api(reviewer, periods))
    expect(closing.period.state).toBe('closing')
    expect(closing.check.watermark).toBe(closing.period.closingWatermark)
    expect((await decide(reviewer, pending.id, held.version, 'post')).status).toBe(409)
    expect((await move('close', 2)).status).toBe(409)
    await ok(decide(page, pending.id, held.version, 'cancel'))
    if (racePost.status === 409) {
      expect(closing.check).toMatchObject({ postedCount: 1, pendingCount: 2, debit: '1000', credit: '1000' })
      expect((await decide(reviewer, manual.id, submitted.version, 'post')).status).toBe(409)
      expect((await move('close', 2)).status).toBe(409)
      await ok(move('reopen', 2, '处理关账前已提交凭证'))
      await ok(decide(reviewer, manual.id, submitted.version, 'post'))
      await ok(move('begin-close', 3))
    } else {
      expect(closing.check).toMatchObject({ postedCount: 2, pendingCount: 1, debit: '1150', credit: '1150' })
    }
    const closingVersion = racePost.status === 409 ? 4 : 2
    await ok(move('close', closingVersion))
    expect((await create('manual', 'LATE', draft(cash, revenue, 50))).status).toBe(409)
    const posted = await ok(api(page, journal(manual.id)))
    const reverse = (operationId = crypto.randomUUID()) => post(page, `${journal(manual.id)}/reversal`, {
      operationId, expectedVersion: posted.journal.version, on: '2026-01-20', reason: '原交易取消',
    })
    expect((await reverse()).status).toBe(409)
    expect((await post(page, periods, { action: 'reopen', expectedVersion: closingVersion + 1, reason: '无期间权限' })).status).toBe(403)
    await ok(move('reopen', closingVersion + 1, '批准补录冲销'))
    await ok(saveCash({ name: '现金（现用名称）', isArchived: true }))
    expect((await create('manual', 'ARCHIVED', draft(cash, revenue, 1))).status).toBe(409)
    const reverseKey = crypto.randomUUID()
    const reversed = await ok(reverse(reverseKey))
    expect(await ok(reverse(reverseKey))).toEqual(reversed)
    expect((await reverse()).status).toBe(409)
    const reversing = await ok(api(page, journal(reversed.id)))
    expect(reversing.journal).toMatchObject({ reversesId: manual.id, state: 'submitted' })
    expect((await decide(page, reversed.id, reversed.version, 'post')).status).toBe(403)
    await ok(decide(reviewer, reversed.id, reversed.version, 'post'))
    expect(await ok(api(page, journal(manual.id)))).toEqual(posted)
    const after = await ok(api(page, `${root}/trial-balance/2026-01-31`))
    expect(after).toMatchObject({ debit: '1300', credit: '1300' })
    expect(after.accounts.find((x: { accountId: string }) => x.accountId === cash).balance).toBe('1000')
    expect(after.accounts.find((x: { accountId: string }) => x.accountId === revenue).balance).toBe('0')
    const detail = await ok(api(page, `${root}/journals?postedOnly=true&accountId=${cash}&month=2026-01-01`))
    expect(detail.map((x: { id: string }) => x.id)).toEqual([reversed.id, manual.id, opening.id])

    const reports = finance + '/reports'
    const filter = '?from=2026-01-16&through=2026-01-25&compare=true'
    const trial = await ok(api(page, reports + '/trial-balance' + filter))
    expect(trial).toMatchObject({ basis: 'accrual', currency: 'CNY', previousPeriod: { from: '2026-01-06', through: '2026-01-15' } })
    expect(trial.lines).toContainEqual(expect.objectContaining({
      row: expect.objectContaining({ key: cash, opening: '1150', debit: '0', credit: '150', amount: '1000' }),
      previous: '1150', difference: '-150',
    }))
    expect(trial.totals).toContainEqual({ key: 'period-debit', amount: '150', previous: '150', difference: '0' })
    expect(trial.totals).toContainEqual({ key: 'closing-net', amount: '0', previous: '0', difference: '0' })
    const profit = await ok(api(page, reports + '/profit-and-loss' + filter))
    expect(profit.totals).toContainEqual({ key: 'profit', amount: '-150', previous: '150', difference: '-300' })
    const sheet = await ok(api(page, reports + '/balance-sheet' + filter))
    expect(sheet.lines).toContainEqual(expect.objectContaining({
      row: expect.objectContaining({ key: 'earnings', amount: '0' }), previous: '150', difference: '-150',
    }))
    expect(sheet.totals).toContainEqual({ key: 'balance-difference', amount: '0', previous: '0', difference: '0' })
    expect(sheet.totals).toContainEqual({ key: 'assets', amount: '1000', previous: '1150', difference: '-150' })
    const stable = await ok(api(page, reports + '/balance-sheet' + filter + '&watermark=' + posted.journal.postingNumber))
    expect(stable.totals).toContainEqual({ key: 'assets', amount: '1150', previous: '1150', difference: '0' })

    const drill = await ok(api(page, reports + '/profit-and-loss/rows/' + revenue + filter + '&watermark=' + profit.watermark))
    expect(drill.postings.map((x: { journalId: string }) => x.journalId)).toEqual([reversed.id])
    const earnings = await ok(api(page, reports + '/balance-sheet/rows/earnings' + filter + '&watermark=' + sheet.watermark))
    expect(earnings.postings.map((x: { journalId: string }) => x.journalId)).toEqual([reversed.id, manual.id])
    expect((await api(page, reports + '/balance-sheet/rows/' + otherBook.accounts[0].id + filter + '&watermark=' + sheet.watermark)).status).toBe(404)
    expect((await api(reviewer, '/bff/api/finance/workspaces/' + outside.id + '/reports/trial-balance' + filter)).status).toBe(404)
    expect((await api(page, reports + '/balance-sheet?from=2025-12-31&through=2026-01-25')).status).toBe(400)
    const beforeBook = await ok(api(page, reports + '/trial-balance?from=2026-01-01&through=2026-01-05&compare=true'))
    expect(beforeBook.previousPeriod).toBeNull()

    await page.getByTestId('module-reports').click()
    await page.getByLabel('报表类型').selectOption('profit-and-loss')
    await page.getByLabel('报表开始日期').fill('2026-01-16')
    await page.getByLabel('报表截止日期').fill('2026-01-25')
    await page.getByRole('button', { name: '查询财务报表', exact: true }).click()
    const report = page.getByRole('region', { name: '财务报表', exact: true })
    await expect(report.getByRole('heading', { name: '利润表', exact: true })).toBeVisible()
    await expect(report.getByText('-150.00 · 上期 150.00 · 变动 -300.00').first()).toBeVisible()
    await report.getByRole('button', { name: '钻取上期 商品收入' }).click()
    await report.getByRole('button', { name: '查看凭证 SAL-001' }).click()
    await expect(report.getByText('编辑后交易', { exact: true })).toBeVisible()
    const download = page.waitForEvent('download')
    await report.getByRole('button', { name: '导出报表 CSV' }).click()
    const csv = await download
    expect(csv.suggestedFilename()).toBe('profit-and-loss-2026-01-16-2026-01-25.csv')
    expect(readFileSync((await csv.path())!, 'utf8')).toContain('"4001","商品收入","收入",-150,150,-300')

    await page.emulateMedia({ media: 'print' })
    await page.evaluate(() => {
      window.print = () => {
        const report = document.querySelector('[data-testid="financial-reports"]') as HTMLElement
        const other = document.querySelector('[data-testid="app-header"]')!
        const filters = report.querySelector('form')!
        report.dataset.printIsolated = String(getComputedStyle(other).display === 'none'
          && getComputedStyle(filters).display === 'none' && getComputedStyle(report).display !== 'none'
          && report.getBoundingClientRect().height > 0 && report.offsetParent !== null)
        window.dispatchEvent(new Event('afterprint'))
      }
    })
    await report.getByRole('button', { name: '打印财务报表' }).click()
    await expect(report).toHaveAttribute('data-print-isolated', 'true')
    await page.emulateMedia({ media: 'screen' })

    const yearPath = root + '/fiscal-years'
    const closePreview = yearPath + '/preview?year=2026&equityAccountId=' + equity
    expect((await ok(api(reviewer, closePreview))).openMonths).toHaveLength(12)
    const profitJournal = await ok(create('manual', 'YEAR-SAL', draft(idFor('1002'), revenue, 40, 40, '年度入账', '2026-01-25')))
    const profitDraft = await ok(decide(page, profitJournal.id, profitJournal.version, 'submit'))
    await ok(decide(reviewer, profitJournal.id, profitDraft.version, 'post'))
    await ok(post(page, chart + '/accounts', { expectedRevision: (await getChart()).revision,
      account: { code: '1601', name: '设备', category: 'asset', purpose: 'posting' } }))
    const equipment = (await getChart()).accounts.find((x: { code: string }) => x.code === '1601')
    const investment = await ok(create('manual', 'YEAR-INVEST', {
      ...draft(equipment.id, idFor('1002'), 25, 25, '投资活动样例', '2026-01-25'), cashActivity: 'investing',
    }))
    const investmentDraft = await ok(decide(page, investment.id, investment.version, 'submit'))
    await ok(decide(reviewer, investment.id, investmentDraft.version, 'post'))
    const january = '?from=2026-01-01&through=2026-01-31'
    const cashReport = await ok(api(page, reports + '/cash-flow' + january))
    expect(cashReport.totals).toContainEqual({ key: 'investing', amount: '-25', previous: null, difference: null })
    expect(cashReport.totals).toContainEqual({ key: 'cash-closing', amount: '1015', previous: null, difference: null })
    const investmentDetail = await ok(api(page, reports + '/cash-flow/rows/manual-investing' + january + '&watermark=' + cashReport.watermark))
    expect(investmentDetail.postings).toContainEqual(expect.objectContaining({ journalId: investment.id, reportAmount: '-25' }))
    for (let month = 1; month <= 12; month++) {
      const monthPath = root + '/periods/2026-' + String(month).padStart(2, '0') + '-01'
      const readMonth = await api(reviewer, monthPath)
      const prior = readMonth.status === 404
        ? await ok(post(reviewer, monthPath, { action: 'open', expectedVersion: 0, reason: '年度验收' }))
        : JSON.parse(readMonth.text).period
      const checking = await ok(post(reviewer, monthPath, { action: 'begin-close', expectedVersion: prior.version, reason: '年度验收' }))
      await ok(post(reviewer, monthPath, { action: 'close', expectedVersion: checking.version, reason: '年度验收' }))
    }
    expect(await ok(api(reviewer, closePreview))).toMatchObject({ netProfit: '40', openMonths: [] })
    const closingPlan = await ok(post(page, yearPath, { year: 2026, equityAccountId: equity }))
    const yearDecision = (actor: Page, v: number, decision: string, operationId = crypto.randomUUID()) =>
      post(actor, yearPath + '/' + closingPlan.id + '/decision', { expectedVersion: v, decision, reason: '年结验收', operationId })
    expect((await yearDecision(page, closingPlan.version, 'close')).status).toBe(403)
    const yearCloseKey = crypto.randomUUID()
    const yearClosed = await ok(yearDecision(reviewer, closingPlan.version, 'close', yearCloseKey))
    expect(yearClosed).toMatchObject({ state: 'closed', closingJournals: [expect.any(String)] })
    expect(await ok(yearDecision(reviewer, closingPlan.version, 'close', yearCloseKey))).toEqual(yearClosed)
    const yearFilter = '?from=2026-01-01&through=2026-12-31'
    expect((await ok(api(page, reports + '/profit-and-loss' + yearFilter))).totals).toContainEqual(
      { key: 'profit', amount: '40', previous: null, difference: null })
    const afterCloseSheet = await ok(api(page, reports + '/balance-sheet' + yearFilter))
    expect(afterCloseSheet.lines).toContainEqual(expect.objectContaining({ row: expect.objectContaining({ key: 'earnings', amount: '0' }) }))
    expect(afterCloseSheet.lines).toContainEqual(expect.objectContaining({ row: expect.objectContaining({ key: equity, amount: '1040' }) }))
    const december = root + '/periods/2026-12-01'
    const decemberVersion = (await ok(api(reviewer, december))).period.version
    expect((await post(reviewer, december, { action: 'reopen', expectedVersion: decemberVersion, reason: '绕过年度门禁' })).status).toBe(409)
    const yearReopened = await ok(yearDecision(reviewer, yearClosed.version, 'reopen'))
    expect(yearReopened).toMatchObject({ state: 'reopened', reopeningJournals: [expect.any(String)] })
    expect((await ok(api(page, reports + '/balance-sheet' + yearFilter))).lines).toContainEqual(
      expect.objectContaining({ row: expect.objectContaining({ key: 'earnings', amount: '40' }) }))
    await ok(post(reviewer, december, { action: 'reopen', expectedVersion: decemberVersion, reason: '年度已重开' }))
  } finally {
    await checker.close()
  }
})

test('Purchase orders require current scoped references and independent approval', async ({ page, browser }) => {
  test.setTimeout(240_000)
  const second = await browser.newContext({ baseURL: 'https://localhost:7443' })
  try {
    const reviewer = await second.newPage()
    await Promise.all([login(page, 'alice'), login(reviewer, 'bob')])
    const post = (actor: Page, path: string, body: object) => write(actor, path, 'POST', { operationId: crypto.randomUUID(), ...body })
    const ok = async (pending: Promise<{ status: number; text: string }>, status = 200) => {
      const response = await pending
      expect(response.status, response.text).toBe(status)
      return JSON.parse(response.text)
    }
    const name = `采购订单验收 ${Date.now()}`
    const work = await ok(post(page, '/bff/api/workspaces', { name }), 201)
    const other = await ok(post(page, '/bff/api/workspaces', { name: `采购隔离 ${Date.now()}` }), 201)
    const org = `/bff/api/workspaces/${work.id}`
    const master = `/bff/api/masterdata/workspaces/${work.id}`
    const outsideMaster = `/bff/api/masterdata/workspaces/${other.id}`
    const orders = `/bff/api/purchasing/workspaces/${work.id}/orders`
    const detailPath = (id: string) => `${orders}/${id}`
    const access = (actor: Page) => ok(api(actor, `${org}/access`))
    expect((await api(page, orders)).status).toBe(403)
    expect((await api(reviewer, orders)).status).toBe(404)
    const invite = await ok(post(page, `${org}/invitations`, {
      expectedVersion: (await access(page)).authorizationVersion, email: 'bob@nexora.invalid', role: 'WorkspaceOwner',
    }))
    await ok(post(reviewer, `/bff/api/invitations/${invite.invitation.id}/redeem`, { token: invite.token }))
    const members = await ok(api(page, `${org}/members`)) as { id: string; email: string }[]
    const alice = members.find(x => x.email === 'alice@nexora.invalid')!.id
    const bob = members.find(x => x.email === 'bob@nexora.invalid')!.id
    const changeRole = async (actor: Page, member: string, action: string, role?: string) =>
      post(actor, `${org}/members/${member}/purchase-role`, {
        expectedVersion: (await access(actor)).authorizationVersion, action, role,
      })
    const grant = async (proposer: Page, approver: Page, member: string, role: string) => {
      await ok(changeRole(proposer, member, 'propose', role))
      await ok(changeRole(approver, member, 'approve'))
    }
    await ok(changeRole(page, alice, 'propose', 'PurchasingOperator'))
    expect((await changeRole(page, alice, 'approve')).status).toBe(403)
    await ok(changeRole(reviewer, alice, 'approve'))
    await grant(reviewer, page, bob, 'PurchasingApprover')
    const book = (workspaceId: string) => post(page, `/bff/api/finance/workspaces/${workspaceId}/book`, {
      baseCurrency: 'CNY', startsOn: '2026-01-01', fiscalYearStartMonth: 1,
    })
    const supplier = await ok(post(page, `${master}/partners`, {
      code: 'SUP', profile: { name: '样例供应商', roles: ['supplier'], contacts: [] },
    }))
    const buyer = await ok(post(page, `${master}/partners`, {
      code: 'BUYER', profile: { name: '客户专用', roles: ['customer'], contacts: [] },
    }))
    const outside = await ok(post(page, `${outsideMaster}/partners`, {
      code: 'SUP', profile: { name: '另一工作区供应商', roles: ['supplier'], contacts: [] },
    }))
    const category = await ok(post(page, `${master}/definitions`, { kind: 'category', code: 'STOCK', name: '库存' }))
    const unit = await ok(post(page, `${master}/definitions`, { kind: 'unit', code: 'PCS', name: '件' }))
    const createProduct = (code: string, tracksInventory: boolean) => post(page, `${master}/items`, {
      code, name: code === 'P3SKU' ? '样例库存件' : '非库存件', kind: 'product', tracksInventory, categoryId: category.id, unitId: unit.id,
    })
    const product = await ok(createProduct('P3SKU', true))
    const nonStock = await ok(createProduct('UNTRACKED', false))
    const draft = { on: '2026-01-03', supplierId: supplier.id, note: '采购样例', lines: [{ itemId: product.id, quantity: '3.125', unitPrice: '2.12' }] }
    const create = (number: string, input: object, operationId = crypto.randomUUID()) =>
      post(page, orders, { number, draft: input, operationId })
    expect((await create('MISSING-BOOK', draft)).status).toBe(409)
    await ok(book(work.id))
    expect((await create('INVALID-PARTY', { ...draft, supplierId: buyer.id })).status).toBe(409)
    expect((await create('OUTSIDE', { ...draft, supplierId: outside.id })).status).toBe(404)
    expect((await create('NONSTOCK', { ...draft, lines: [{ ...draft.lines[0], itemId: nonStock.id }] })).status).toBe(409)
    expect((await create('BAD-AMOUNT', { ...draft, lines: [{ ...draft.lines[0], unitPrice: '2.0000001' }] })).status).toBe(400)
    expect((await post(reviewer, orders, { number: 'NO-GRANT', draft })).status).toBe(403)

    const open = async (actor: Page) => {
      await actor.reload()
      await actor.getByRole('button', { name: new RegExp(name) }).click()
      await actor.getByTestId('module-purchasing').click()
    }
    await open(page)
    await page.getByLabel('采购单号', { exact: true }).fill('PO-001')
    await page.getByLabel('采购日期', { exact: true }).fill(draft.on)
    await page.getByLabel('采购供应商', { exact: true }).click()
    await page.getByRole('option', { name: 'SUP · 样例供应商', exact: true }).click()
    await page.getByLabel('库存商品 1', { exact: true }).click()
    await page.getByRole('option', { name: 'P3SKU · 样例库存件', exact: true }).click()
    await page.getByLabel('采购数量 1').fill('3.125')
    await page.getByLabel('未税单价 1').fill('2.12')
    await page.getByRole('button', { name: '保存采购草稿', exact: true }).click()
    await expect(page.getByText('未税合计 6.63 CNY', { exact: true })).toBeVisible()
    const order = (await ok(api(page, orders))).orders.find((x: { number: string }) => x.number === 'PO-001')
    expect(order.version).toBe(1)
    expect((await create('po-001', draft)).status).toBe(409)
    const retry = crypto.randomUUID()
    const repeated = await Promise.all([ok(create('RETRY-01', draft, retry)), ok(create('RETRY-01', draft, retry))])
    expect(repeated[0]).toEqual(repeated[1])
    expect((await create('RETRY-02', draft, retry)).status).toBe(409)
    expect((await api(reviewer, `/bff/api/purchasing/workspaces/${other.id}/orders/${order.id}`)).status).toBe(404)
    const decision = (actor: Page, expectedVersion: number, decision: string, reason?: string) =>
      post(actor, `${detailPath(order.id)}/decision`, { expectedVersion, decision, reason })
    await page.getByRole('button', { name: '提交采购审批', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'PO-001 · 待审批' })).toBeVisible()
    expect((await decision(page, 2, 'approve')).status).toBe(403)
    expect((await decision(reviewer, 1, 'approve')).status).toBe(409)
    await ok(write(page, `${master}/items/${product.id}`, 'PUT', {
      operationId: crypto.randomUUID(), expectedVersion: 1, name: '更名后库存件', categoryId: category.id, isActive: true,
    }))
    expect((await decision(reviewer, 2, 'approve')).status).toBe(409)
    expect((await ok(api(page, detailPath(order.id)))).order).toMatchObject({ version: 2, state: 'submitted' })
    await ok(decision(reviewer, 2, 'return', '刷新商品版本'))
    const updated = await ok(write(page, detailPath(order.id), 'PUT', { operationId: crypto.randomUUID(), expectedVersion: 3, draft }))
    await ok(decision(page, updated.version, 'submit'))

    await ok(changeRole(page, alice, 'revoke'))
    await grant(page, reviewer, alice, 'PurchasingApprover')
    expect((await decision(page, 5, 'approve')).status).toBe(409)
    await ok(changeRole(page, alice, 'revoke'))
    await grant(page, reviewer, alice, 'PurchasingOperator')

    await open(reviewer)
    await reviewer.getByRole('button', { name: /PO-001.*待审批/ }).click()
    await reviewer.getByRole('button', { name: '批准采购订单', exact: true }).click()
    await expect(reviewer.getByRole('heading', { name: 'PO-001 · 已审批' })).toBeVisible()
    const approved = await ok(api(page, detailPath(order.id)))
    expect(approved).toMatchObject({ approvedVersion: 5, total: '6.63', order: { version: 6, state: 'approved' },
      lines: [expect.objectContaining({ itemId: product.id, itemName: '更名后库存件', itemVersion: 2, unitCode: 'PCS' })] })
    expect((await write(page, detailPath(order.id), 'PUT', { operationId: crypto.randomUUID(), expectedVersion: 6, draft })).status).toBe(409)

    const inventory = `/bff/api/inventory/workspaces/${work.id}`
    const warehouse = await ok(post(page, `${inventory}/warehouses`, { code: 'MAIN', name: '验收主仓' }))
    const warehousePath = `${inventory}/warehouses/${warehouse.id}`
    await ok(write(page, `${warehousePath}/receiver`, 'PUT', { operationId: crypto.randomUUID(), expectedVersion: warehouse.version, memberId: alice }))
    const permitPath = `${detailPath(order.id)}/receipts`
    const permits = () => ok(api(reviewer, permitPath))
    const permitInput = { expectedVersion: 6, lineId: approved.lines[0].id, warehouseId: warehouse.id, quantity: '3.125' }
    expect((await post(page, permitPath, permitInput)).status).toBe(403)
    const [one, two] = await Promise.all([post(reviewer, permitPath, permitInput), post(reviewer, permitPath, permitInput)])
    expect([one.status, two.status].sort()).toEqual([200, 409])
    const permit = JSON.parse((one.status === 200 ? one : two).text)
    await expect.poll(async () => (await permits()).permits.find((x: { id: string }) => x.id === permit.permitId)?.state).toBe('issued')
    const receive = `${inventory}/receipts/${permit.permitId}/receive`
    const receiptOperation = crypto.randomUUID()
    const receiptInput = { operationId: receiptOperation, expectedRevision: 1, on: draft.on, quantity: '1.125' }
    expect((await post(reviewer, receive, receiptInput)).status).toBe(403)
    const recoveryResource = ({ broker: 'rabbitmq', consumer: 'finance' } as Record<string, string>)[process.env.NEXORA_TEST_P3_RECOVERY ?? '']
    const appHost = resolve('../../../src/Hosting/Nexora.AppHost/Nexora.AppHost.csproj')
    const broker = (args: string[]) => promisify(execFile)('pwsh', [
      '-NoProfile', '-CommandWithArgs', 'aspire @args; exit $LASTEXITCODE', ...args, '--apphost', appHost, '--non-interactive',
    ])
    if (recoveryResource) await broker(['resource', recoveryResource, 'stop'])
    const received = await (async () => {
      try { return await ok(post(page, receive, receiptInput)) }
      finally {
        if (recoveryResource) {
          await broker(['resource', recoveryResource, 'start'])
          await broker(['wait', recoveryResource, '--timeout', '90'])
        }
      }
    })()
    expect(await ok(post(page, receive, receiptInput))).toEqual(received)
    await expect.poll(async () => (await permits()).permits[0]?.executed).toBe('1.125')
    const currentOrder = await ok(api(reviewer, detailPath(order.id)))
    expect((await post(reviewer, permitPath, { ...permitInput, expectedVersion: currentOrder.order.version, quantity: '0.001' })).status).toBe(409)
    await ok(post(reviewer, `${permitPath}/${permit.permitId}/cancel`, { expectedVersion: currentOrder.order.version, reason: '部分到货，余量重新授权' }))
    await expect.poll(async () => (await permits()).permits[0]?.state).toBe('cancelled')
    expect((await post(page, receive, { ...receiptInput, operationId: crypto.randomUUID(), expectedRevision: 3 })).status).toBe(409)
    const latest = await ok(api(reviewer, detailPath(order.id)))
    const replacement = await ok(post(reviewer, permitPath, { ...permitInput, expectedVersion: latest.order.version, quantity: '2' }))
    await expect.poll(async () => (await permits()).permits.find((x: { id: string }) => x.id === replacement.permitId)?.state).toBe('issued')
    await ok(post(page, `${inventory}/receipts/${replacement.permitId}/receive`, { expectedRevision: 1, on: draft.on, quantity: '2' }))
    await expect.poll(async () => (await ok(api(reviewer, detailPath(order.id)))).order.state).toBe('received')
    const receivedOrder = await ok(api(reviewer, detailPath(order.id)))
    const closed = await ok(post(reviewer, `${permitPath}/close`, { expectedVersion: receivedOrder.order.version, reason: '已收齐关单' }))
    expect((await post(reviewer, permitPath, { ...permitInput, expectedVersion: closed.version, quantity: '0.001' })).status).toBe(409)
    expect((await ok(api(page, `${warehousePath}/positions`)))[0]).toMatchObject({ quantity: '3.125', value: '6.63', sequence: 2 })
    expect(await ok(api(page, `${warehousePath}/movements`))).toHaveLength(2)

    const finance = `/bff/api/finance/workspaces/${work.id}`
    const trade = `${finance}/trade`
    const changeFinanceRole = async (actor: Page, member: string, action: string, role?: string) =>
      post(actor, `${org}/members/${member}/finance-role`, {
        expectedVersion: (await access(actor)).authorizationVersion, action, role,
      })
    await ok(changeFinanceRole(page, alice, 'propose', 'Accountant'))
    await ok(changeFinanceRole(reviewer, alice, 'approve'))
    await ok(changeFinanceRole(reviewer, bob, 'propose', 'FinanceReviewer'))
    await ok(changeFinanceRole(page, bob, 'approve'))
    await ok(post(reviewer, `${finance}/ledger/periods/2026-01-01`, { expectedVersion: 0, action: 'open', reason: 'P3 跨服务验收' }))

    const chart = `${finance}/chart`
    const addAccount = async (code: string, category: string, purpose = 'posting') => {
      const before = await ok(api(page, chart))
      await ok(post(page, `${chart}/accounts`, { expectedRevision: before.revision, account: { code, name: code, category, purpose } }))
      return (await ok(api(page, chart))).accounts.find((x: { code: string }) => x.code === code).id as string
    }
    const accounts = {
      inventoryAccountId: await addAccount('INV-CTL', 'asset', 'control'),
      accrualAccountId: await addAccount('GRNI-CTL', 'liability', 'control'),
      payableAccountId: await addAccount('AP-CTL', 'liability', 'control'),
      inputTaxAccountId: await addAccount('INPUT-TAX', 'asset'),
      varianceAccountId: await addAccount('PRICE-VAR', 'expense'),
      donationIncomeAccountId: await addAccount('DON-INCOME', 'income'),
      supplierRecoveryAccountId: await addAccount('RECOVERY-CTL', 'asset', 'control'),
    }
    const bankAccountId = await addAccount('BANK-CTL', 'asset', 'control')
    const cashAccountId = await addAccount('CASH-CTL', 'asset', 'control')
    const starter = await ok(api(page, chart))
    const chartId = (code: string) => starter.accounts.find((x: { code: string }) => x.code === code).id as string
    await ok(post(page, `${trade}/setup`, { accounts }))
    const bank = await ok(post(page, `${trade}/banks`, { code: 'B1', name: '基本户', kind: 'bank', accountId: bankAccountId }))
    const cash = await ok(post(page, `${trade}/banks`, { code: 'C1', name: '现金账户', kind: 'cash', accountId: cashAccountId }))
    await ok(post(page, `${trade}/banks/${cash.id}/default`, { expectedVersion: cash.version }))
    const banks = async () => (await ok(api(page, trade))).banks
    expect((await banks()).filter((x: { isDefault: boolean }) => x.isDefault).map((x: { id: string }) => x.id)).toEqual([cash.id])

    const receiptRows = () => ok(api(reviewer, `${trade}/receipts`))
    await expect.poll(async () => (await receiptRows()).length).toBe(2)
    const initialFacts = (await receiptRows()).sort((a: { fact: { sequence: number } }, b: { fact: { sequence: number } }) => a.fact.sequence - b.fact.sequence)
    expect(initialFacts.map((x: { fact: { cost: string } }) => x.fact.cost)).toEqual(['2.39', '4.24'])
    for (const row of initialFacts)
      await ok(post(reviewer, `${trade}/receipts/${row.fact.id}/accrue`, {}))
    const receiptId = initialFacts[1].fact.id

    const tax = `${finance}/tax`
    await ok(post(page, `${tax}/rates`, { code: 'SAMPLE', name: '测试税率', effectiveOn: '2026-01-01', rate: '0.13' }))
    await ok(post(page, `${tax}/groups`, { code: 'INPUT', name: '测试进项', expectedVersion: 0, rateCodes: ['SAMPLE'] }))
    const assessment = await ok(post(page, `${tax}/assessments`, {
      on: '2026-01-04', groupCode: 'INPUT', itemId: product.id, partnerId: supplier.id, unitPrice: '5.24',
      quantity: '1', discount: '0', includesTax: false,
    }))
    const documents = () => ok(api(page, `${trade}/documents`))
    const findDoc = async (id: string) => (await documents()).find((x: { id: string }) => x.id === id)
    const submitTrade = (kind: number, number: string, amount: string, fields: object = {}) =>
      post(page, `${trade}/documents`, { terms: { kind, number, amount, on: '2026-01-04', memo: number, ...fields } })
    const approve = (id: string, actor = reviewer, version = 1, operationId = crypto.randomUUID()) =>
      post(actor, `${trade}/documents/${id}/decision`, { expectedVersion: version, decision: 'approve', operationId })
    const bill = await ok(submitTrade(1, 'BILL-01', '5.24', {
      sourceId: receiptId, partnerId: supplier.id, quantity: '2', taxAssessmentId: assessment.id, method: 'approve-cost-variance',
    }))
    expect((await approve(bill.id, page)).status).toBe(403)
    const approveKey = crypto.randomUUID()
    const billPosted = await ok(approve(bill.id, reviewer, 1, approveKey))
    expect(await ok(approve(bill.id, reviewer, 1, approveKey))).toEqual(billPosted)
    expect(await findDoc(bill.id)).toMatchObject({ total: '5.92', outstanding: '5.92' })
    await expect.poll(async () => (await receiptRows()).find((x: { fact: { adjustmentForBillId: string } }) =>
      x.fact.adjustmentForBillId === bill.id)?.posted, { timeout: 45_000 }).toBe(true)
    expect((await ok(api(page, `${warehousePath}/positions`)))[0]).toMatchObject({ value: '7.63', quantity: '3.125', sequence: 3 })
    const overBill = await ok(submitTrade(1, 'OVER-BILL', '1', { sourceId: receiptId, partnerId: supplier.id, quantity: '1' }))
    expect((await approve(overBill.id)).status).toBe(409)

    const returnMovement = async (originalId: string, quantity: string) => {
      const request = `${inventory}/movements/${originalId}/returns`
      expect((await post(page, request, { on: '2026-01-05', quantity, reason: '无采购审批权限' })).status).toBe(403)
      const authorized = await ok(post(reviewer, request, { on: '2026-01-05', quantity, reason: '退货样例' }))
      const path = `${inventory}/returns/${authorized.id}/decision`
      expect((await post(reviewer, path, { confirm: true })).status).toBe(403)
      const operationId = crypto.randomUUID()
      const result = await ok(post(page, path, { confirm: true, operationId }))
      expect(await ok(post(page, path, { confirm: true, operationId }))).toEqual(result)
      return result.id as string
    }
    const creditedReturn = await returnMovement(receiptId, '0.5')
    await expect.poll(async () => (await receiptRows()).find((x: { fact: { id: string } }) =>
      x.fact.id === creditedReturn)?.pendingReason).toContain('supplier credit')
    const credit = await ok(submitTrade(9, 'CREDIT-01', '0', { on: '2026-01-05', sourceId: bill.id, returnReceiptId: creditedReturn }))
    await ok(approve(credit.id))
    expect(await findDoc(credit.id)).toMatchObject({ total: '1.48', state: 'posted' })
    expect(await findDoc(bill.id)).toMatchObject({ outstanding: '4.44' })
    const unbilledReturn = await returnMovement(initialFacts[0].fact.id, '0.125')
    await expect.poll(async () => (await receiptRows()).find((x: { fact: { id: string } }) =>
      x.fact.id === unbilledReturn)?.posted).toBe(true)
    expect((await ok(api(page, `${warehousePath}/positions`)))[0]).toMatchObject({ value: '6.1', quantity: '2.5', sequence: 5 })

    const opening = await ok(submitTrade(8, 'BANK-OPEN', '1000', {
      on: '2026-01-01', bankId: bank.id, counterAccountId: chartId('3001'),
    }))
    await ok(approve(opening.id))
    const payment = await ok(submitTrade(2, 'PAY-01', '2', { on: '2026-01-06', bankId: bank.id, sourceId: bill.id }))
    await ok(approve(payment.id))
    expect(await findDoc(bill.id)).toMatchObject({ outstanding: '2.44' })

    const file = 'REF,DATE,VALUE,MEMO\nR1,2026-01-06,500,收入样例\nR2,2026-01-06,-200,费用样例\nR3,2026-01-06,-2,供应商付款'
    const mapping = { externalId: 'REF', date: 'DATE', amount: 'VALUE', description: 'MEMO' }
    const preview = async (text: string) => ok(post(page, `${trade}/imports/preview`, { bankId: bank.id, file: text, mapping }))
    const bad = await preview(file + '\nR4,2026-01-06,INVALID,坏数据')
    expect(bad.previewId).toBeNull()
    const batch = await preview(file)
    expect(batch.errors).toEqual([])
    const commit = (id: string, operationId = crypto.randomUUID()) => post(page, `${trade}/imports/${id}/commit`, { operationId })
    const importKey = crypto.randomUUID()
    const committed = await ok(commit(batch.previewId, importKey))
    expect(committed.count).toBe(3)
    expect(await ok(commit(batch.previewId, importKey))).toEqual(committed)
    const duplicate = await preview(file)
    expect(duplicate.rows.every((x: { duplicate: boolean }) => x.duplicate)).toBe(true)
    expect((await ok(commit(duplicate.previewId))).count).toBe(0)
    const statement = () => ok(api(page, `${trade}/banks/${bank.id}/statement`))
    const row = async (id: string) => (await statement()).find((x: { externalId: string }) => x.externalId === id)
    const income = await ok(submitTrade(4, 'BANK-INCOME', '500', {
      on: '2026-01-06', bankId: bank.id, counterAccountId: chartId('4001'), statementLineId: (await row('R1')).id,
    }))
    const expense = await ok(submitTrade(3, 'BANK-EXPENSE', '200', {
      on: '2026-01-06', bankId: bank.id, counterAccountId: chartId('5001'), statementLineId: (await row('R2')).id,
    }))
    await ok(approve(income.id))
    await ok(approve(expense.id))
    expect(await row('R1')).toMatchObject({ matched: '500' })
    expect(await row('R2')).toMatchObject({ matched: '200' })
    const payMovement = (await ok(api(page, `${trade}/banks/${bank.id}/movements`)))
      .find((x: { documentId: string }) => x.documentId === payment.id)
    const match = async (amount: string) => {
      const line = await row('R3')
      return post(reviewer, `${trade}/statement/${line.id}/matches`, { expectedVersion: line.version, movementId: payMovement.id, amount })
    }
    const firstMatch = await ok(match('1'))
    await ok(match('1'))
    expect((await match('0.01')).status).toBe(409)
    await ok(post(reviewer, `${trade}/matches/${firstMatch.id}/release`, { reason: '验证可撤销匹配' }))
    expect(await row('R3')).toMatchObject({ matched: '1' })
    await ok(match('1'))
    const voidMatched = await ok(submitTrade(7, 'VOID-MATCHED', '0', { sourceId: payment.id, on: '2026-01-06' }))
    expect((await approve(voidMatched.id)).status).toBe(409)
    expect(await findDoc(bill.id)).toMatchObject({ outstanding: '2.44' })

    const donor = await ok(post(page, `${master}/partners`, { code: 'DONOR', profile: { name: '样例捐赠人', roles: ['donor'], contacts: [] } }))
    const donation = await ok(submitTrade(6, 'DON-01', '200', { on: '2026-01-07', bankId: bank.id, partnerId: donor.id, method: 'transfer' }))
    const donationPath = trade + '/documents/' + donation.id + '/donation-receipt'
    expect((await api(page, donationPath)).status).toBe(404)
    await ok(approve(donation.id))
    const donationReceipt = await ok(api(page, donationPath))
    expect(donationReceipt).toMatchObject({ number: 'DON-' + donation.id.replaceAll('-', ''), donationNumber: 'DON-01',
      donor: '样例捐赠人', recipient: name, amount: '200', method: 'transfer', reversedById: null })
    const donationPdf = await api(page, donationPath + '/pdf')
    expect(donationPdf.status, donationPdf.text.slice(0, 180)).toBe(200)
    expect(donationPdf.text.startsWith('%PDF-')).toBe(true)
    const transfer = await ok(submitTrade(5, 'TRANSFER-01', '25', { on: '2026-01-07', bankId: bank.id, otherBankId: cash.id }))
    await ok(approve(transfer.id))
    const reversal = await ok(submitTrade(7, 'VOID-TRANSFER', '0', { on: '2026-01-08', sourceId: transfer.id }))
    await ok(approve(reversal.id))
    expect(await findDoc(transfer.id)).toMatchObject({ reversedById: reversal.id })
    expect((await banks()).find((x: { id: string }) => x.id === bank.id).balance).toBe('1498')
    expect((await banks()).find((x: { id: string }) => x.id === cash.id).balance).toBe('0')

    const balance = await ok(api(page, `${finance}/ledger/trial-balance/2026-01-31`))
    expect(balance.debit).toBe(balance.credit)
    const accountBalance = (id: string) => balance.accounts.find((x: { accountId: string }) => x.accountId === id)?.balance
    expect(accountBalance(accounts.inventoryAccountId)).toBe('6.1')
    expect(accountBalance(accounts.accrualAccountId)).toBe('-2.12')
    expect(accountBalance(accounts.payableAccountId)).toBe('-2.44')
    expect(accountBalance(accounts.inputTaxAccountId)).toBe('0.51')
    expect(accountBalance(accounts.donationIncomeAccountId)).toBe('-200')
    expect(accountBalance(bankAccountId)).toBe('1498')
    expect((await api(reviewer, `/bff/api/finance/workspaces/${other.id}/trade`)).status).toBe(404)

    const finalPayment = await ok(submitTrade(2, 'PAY-FINAL', '2.44', { on: '2026-01-08', bankId: bank.id, sourceId: bill.id }))
    await ok(approve(finalPayment.id))
    const paidReturn = await returnMovement(receiptId, '0.25')
    await expect.poll(async () => (await receiptRows()).find((x: { fact: { id: string } }) =>
      x.fact.id === paidReturn)?.pendingReason).toContain('supplier credit')
    const paidCredit = await ok(submitTrade(9, 'CREDIT-PAID', '0', { on: '2026-01-09', sourceId: bill.id, returnReceiptId: paidReturn }))
    await ok(approve(paidCredit.id))
    expect(await findDoc(paidCredit.id)).toMatchObject({ total: '0.75', recoverable: '0.75' })
    expect(await findDoc(bill.id)).toMatchObject({ outstanding: '0' })
    const refund = await ok(submitTrade(10, 'SUP-REFUND', '0.75', { on: '2026-01-10', bankId: bank.id, sourceId: paidCredit.id }))
    await ok(approve(refund.id))
    expect(await findDoc(paidCredit.id)).toMatchObject({ recoverable: '0' })
    expect((await banks()).find((x: { id: string }) => x.id === bank.id).balance).toBe('1496.31')
    const settled = await ok(api(page, `${finance}/ledger/trial-balance/2026-01-31`))
    expect(settled.debit).toBe(settled.credit)
    expect(settled.accounts.find((x: { accountId: string }) => x.accountId === accounts.supplierRecoveryAccountId).balance).toBe('0')
    const paidNet = await ok(api(page, finance + '/reports/profit-and-loss?basis=cash&from=2026-01-01&through=2026-01-31'))
    expect(paidNet.lines).toContainEqual(expect.objectContaining({ row: expect.objectContaining({ key: 'cash-purchases', amount: '3.27' }) }))

    await page.reload()
    await page.getByRole('button', { name: new RegExp(name) }).click()
    await page.getByTestId('module-inventory').click()
    await page.getByLabel('库存仓库').click()
  await page.getByRole('option', { name: 'MAIN · 验收主仓', exact: true }).click()
    await expect(page.getByRole('heading', { name: '库存与移动加权成本' })).toBeVisible()
    await expect(page.getByText(/在库 2\.25 · 价值 5\.49 CNY/)).toBeVisible()
    await page.getByTestId('module-book').click()
    await page.getByRole('button', { name: '打开资金工作台', exact: true }).click()
    await expect(page.getByText(/B1 · 基本户 · 1496\.31 CNY/)).toBeVisible()
    await page.getByLabel('查看银行流水和对账单').click()
  await page.getByRole('option', { name: '基本户', exact: true }).click()
    await page.getByRole('button', { name: '读取银行流水与待审核行', exact: true }).click()
    await expect(page.getByLabel('待审核对账单行')).toBeVisible()

    const combined = await ok(create('PO-MULTI', { ...draft, on: '2026-01-10', lines: [{ ...draft.lines[0], quantity: '2' }] }))
    const nextDecision = (actor: Page, decision: string, expectedVersion: number) =>
      post(actor, `${detailPath(combined.id)}/decision`, { decision, expectedVersion })
    await ok(nextDecision(page, 'submit', 1))
    await ok(nextDecision(reviewer, 'approve', 2))
    const secondOrder = await ok(api(reviewer, detailPath(combined.id)))
    const secondPermitPath = `${detailPath(combined.id)}/receipts`
    const secondPermit = await ok(post(reviewer, secondPermitPath, {
      expectedVersion: secondOrder.order.version, lineId: secondOrder.lines[0].id, warehouseId: warehouse.id, quantity: '2',
    }))
    await expect.poll(async () => (await ok(api(reviewer, secondPermitPath))).permits[0]?.state).toBe('issued')
    const secondReceive = `${inventory}/receipts/${secondPermit.permitId}/receive`
    const firstLot = await ok(post(page, secondReceive, { expectedRevision: 1, on: '2026-01-11', quantity: '1' }))
    const secondLot = await ok(post(page, secondReceive, { expectedRevision: 2, on: '2026-01-11', quantity: '1' }))
    const lookupFact = async (id: string) => (await receiptRows()).find((x: { fact: { id: string } }) => x.fact.id === id)
    for (const id of [firstLot.id, secondLot.id]) {
      await expect.poll(async () => !!(await lookupFact(id))).toBe(true)
      if (!(await lookupFact(id)).posted) await ok(post(reviewer, `${trade}/receipts/${id}/accrue`, {}))
    }
    const combinedBill = await ok(submitTrade(1, 'BILL-MULTI', '4.54', {
      on: '2026-01-12', partnerId: supplier.id, method: 'approve-cost-variance',
      billReceipts: [{ receiptId: firstLot.id, quantity: '1', net: '2.22' }, { receiptId: secondLot.id, quantity: '1', net: '2.32' }],
    }))
    await ok(approve(combinedBill.id))
    const combinedPosting = await findDoc(combinedBill.id)
    expect(combinedPosting).toMatchObject({ outstanding: '4.54', billMatches: [
      expect.objectContaining({ receiptId: firstLot.id, variance: '0.1' }), expect.objectContaining({ receiptId: secondLot.id, variance: '0.2' }),
    ] })
    await expect.poll(async () => (await receiptRows()).filter((x: { fact: { adjustmentForBillId: string } }) =>
      x.fact.adjustmentForBillId === combinedBill.id).length).toBe(2)
    const adjustments = (await receiptRows()).filter((x: { fact: { adjustmentForBillId: string } }) => x.fact.adjustmentForBillId === combinedBill.id)
      .sort((a: { fact: { sequence: number } }, b: { fact: { sequence: number } }) => a.fact.sequence - b.fact.sequence)
    for (const entry of adjustments)
      if (!entry.posted) await ok(post(reviewer, `${trade}/receipts/${entry.fact.id}/accrue`, {}))
    expect((await ok(api(page, `${warehousePath}/positions`)))[0]).toMatchObject({ value: '10.03', quantity: '4.25' })
    const crossCheck = await ok(api(page, `${finance}/ledger/trial-balance/2026-01-31`))
    expect(crossCheck.debit).toBe(crossCheck.credit)
    expect(crossCheck.accounts.find((x: { accountId: string }) => x.accountId === accounts.inventoryAccountId).balance).toBe('10.03')
    expect(crossCheck.accounts.find((x: { accountId: string }) => x.accountId === accounts.payableAccountId).balance).toBe('-4.54')
    expect(crossCheck.accounts.find((x: { accountId: string }) => x.accountId === bankAccountId).balance).toBe('1496.31')
    const apAging = await ok(api(page, finance + '/reporting/aging/payables?through=2026-01-31'))
    expect(apAging.total).toBe('4.54')
    expect(apAging.items.every((item: { bucket: string }) => item.bucket !== 'current')).toBe(true)

    const main = (await ok(api(page, warehousePath + '/positions')))[0]
    const stockOperations = warehousePath + '/stock-operations'
    const prepareStock = (body: object) => ok(post(page, stockOperations, {
      itemId: main.itemId, on: '2026-01-13', reason: 'P5 库存验收', ...body,
    }))
    const decideStock = (actor: Page, id: string) => post(actor, inventory + '/stock-operations/' + id + '/decision', {
      expectedVersion: 1, confirm: true,
    })
    const count = await prepareStock({ quantity: '4', expectedSequence: main.sequence })
    expect((await decideStock(page, count.id)).status).toBe(403)
    await ok(decideStock(reviewer, count.id))
    expect((await decideStock(reviewer, count.id)).status).toBe(409)
    const counted = (await ok(api(page, warehousePath + '/positions')))[0]
    expect(counted).toMatchObject({ quantity: '4', value: '9.44', sequence: main.sequence + 1 })
    await expect.poll(async () => (await receiptRows()).find((x: { fact: { stock?: { operationId: string } } }) =>
      x.fact.stock?.operationId === count.id)?.posted).toBe(true)
    const destination = await ok(post(page, inventory + '/warehouses', { code: 'SECOND', name: 'P5 调拨仓' }))
    const destinationPath = inventory + '/warehouses/' + destination.id
    await ok(write(page, destinationPath + '/receiver', 'PUT', {
      operationId: crypto.randomUUID(), expectedVersion: destination.version, memberId: bob,
    }))
    expect(await ok(api(page, stockOperations + '/destinations'))).toContainEqual(expect.objectContaining({ id: destination.id }))
    const relocation = await prepareStock({ destinationId: destination.id, quantity: '1', expectedSequence: counted.sequence })
    const shipped = await ok(decideStock(reviewer, relocation.id))
    expect((await ok(api(page, warehousePath + '/positions')))[0]).toMatchObject({ quantity: '3', value: '7.08' })
    expect(await ok(api(reviewer, destinationPath + '/positions'))).toEqual([])
    const incoming = await ok(api(reviewer, destinationPath + '/stock-operations'))
    expect(incoming).toContainEqual(expect.objectContaining({ id: relocation.id, state: 'in-transit',
      transitCost: '2.36', movementId: expect.any(String), destinationMovementId: null, canReceive: true }))
    const receiptPath = inventory + '/stock-operations/' + relocation.id + '/receive'
    expect((await post(page, receiptPath, { expectedVersion: shipped.version, on: '2026-01-14' })).status).toBe(403)
    const receiptRequest = { operationId: crypto.randomUUID(), expectedVersion: shipped.version, on: '2026-01-14' }
    const arrived = await ok(post(reviewer, receiptPath, receiptRequest))
    expect(await ok(post(reviewer, receiptPath, receiptRequest))).toEqual(arrived)
    expect((await ok(api(reviewer, destinationPath + '/positions')))[0]).toMatchObject({ quantity: '1', value: '2.36', sequence: 1 })
    await expect.poll(async () => (await receiptRows()).filter((x: { fact: { stock?: { operationId: string } }; posted: boolean; journalId: string | null }) =>
      x.fact.stock?.operationId === relocation.id && x.posted && !x.journalId).length).toBe(2)
    const afterCount = await ok(api(page, finance + '/ledger/trial-balance/2026-01-31'))
    expect(afterCount.accounts.find((x: { accountId: string }) => x.accountId === accounts.inventoryAccountId).balance).toBe('9.44')

    const voidDonation = await ok(submitTrade(7, 'VOID-DON-01', '0', { sourceId: donation.id, on: '2026-01-09' }))
    await ok(approve(voidDonation.id))
    expect(await ok(api(page, donationPath))).toMatchObject({ number: donationReceipt.number, reversedById: voidDonation.id })

    await ok(changeRole(reviewer, bob, 'revoke'))
    await grant(reviewer, page, bob, 'PurchasingOperator')
    expect((await api(reviewer, detailPath(order.id))).status).toBe(404)
    expect((await ok(api(reviewer, orders))).orders).toEqual([])
    const afterReceipts = await ok(api(page, detailPath(order.id)))
    expect(afterReceipts).toMatchObject({ approvedVersion: approved.approvedVersion, total: approved.total, lines: approved.lines })
  } finally {
    await second.close()
  }
})




test('P4 sales, inventory, invoicing, settlement and communication reconcile', async ({ page, browser, playwright }) => {
  test.setTimeout(360_000)
  const origin = 'https://localhost:7443'
  const reviewerContext = await browser.newContext({ baseURL: origin })
  const visitor = await playwright.request.newContext()
  const guestContext = await browser.newContext({ baseURL: origin })
  try {
    const guest = await guestContext.newPage()
    await guest.goto('/invoice-share')
    await expect(guest.getByRole('heading', { name: '客户发票' })).toBeVisible()
    const reviewer = await reviewerContext.newPage()
    await Promise.all([login(page, 'alice'), login(reviewer, 'bob')])
    const post = (actor: Page, path: string, body: object) => write(actor, path, 'POST', { operationId: crypto.randomUUID(), ...body })
    const put = (actor: Page, path: string, body: object) => write(actor, path, 'PUT', { operationId: crypto.randomUUID(), ...body })
    const ok = async (pending: Promise<{ status: number; text: string }>, status = 200) => {
      const result = await pending
      expect(result.status, result.text).toBe(status)
      return JSON.parse(result.text)
    }
    const read = (actor: Page, path: string) => ok(api(actor, path))
    const name = '销售闭环验收 ' + Date.now()
    const work = await ok(post(page, '/bff/api/workspaces', { name }), 201)
    const scope = '/workspaces/' + work.id
    const org = '/bff/api' + scope
    const finance = '/bff/api/finance' + scope
    const trade = finance + '/trade'
    const ar = finance + '/receivables'
    const inventory = '/bff/api/inventory' + scope
    const master = '/bff/api/masterdata' + scope
    const sales = '/bff/api/sales' + scope + '/orders'
    const purchase = '/bff/api/purchasing' + scope + '/orders'
    const version = async (actor: Page) => (await read(actor, org + '/access')).authorizationVersion
    const invite = await ok(post(page, org + '/invitations', { expectedVersion: await version(page), email: 'bob@nexora.invalid', role: 'WorkspaceOwner' }))
    await ok(post(reviewer, '/bff/api/invitations/' + invite.invitation.id + '/redeem', { token: invite.token }))
    const members = await read(page, org + '/members') as { id: string; email: string }[]
    const alice = members.find(x => x.email === 'alice@nexora.invalid')!.id
    const bob = members.find(x => x.email === 'bob@nexora.invalid')!.id
    const grant = async (maker: Page, approver: Page, member: string, area: string, role: string) => {
      const target = org + '/members/' + member + '/' + area + '-role'
      await ok(post(maker, target, { expectedVersion: await version(maker), action: 'propose', role }))
      await ok(post(approver, target, { expectedVersion: await version(approver), action: 'approve' }))
    }
    await grant(page, reviewer, alice, 'sales', 'SalesOperator')
    await grant(reviewer, page, bob, 'sales', 'SalesApprover')
    await grant(page, reviewer, alice, 'purchase', 'PurchasingOperator')
    await grant(reviewer, page, bob, 'purchase', 'PurchasingApprover')
    await grant(page, reviewer, alice, 'finance', 'Accountant')
    await grant(reviewer, page, bob, 'finance', 'FinanceReviewer')
    await ok(post(page, finance + '/book', { baseCurrency: 'CNY', startsOn: '2026-01-01', fiscalYearStartMonth: 1 }))
    await ok(post(reviewer, finance + '/ledger/periods/2026-01-01', { expectedVersion: 0, action: 'open', reason: 'P4 销售验收' }))
    const logo = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jCz8AAAAASUVORK5CYII='
    await ok(put(page, org + '/settings', { expectedVersion: 0, presentation: {
      legalName: '上海示例商贸', brandName: '明川品牌', accentColor: '#176B6B', dateFormat: 'dd/MM/yyyy', timeZone: 'Asia/Shanghai', logoDataUrl: logo,
    } }))
    const add = (path: string, body: object) => ok(post(page, path, body))
    const category = await add(master + '/definitions', { kind: 'category', code: 'P4', name: '销售项目' })
    const unit = await add(master + '/definitions', { kind: 'unit', code: 'PCS', name: '件' })
    const item = (code: string, itemName: string, stock: boolean) => add(master + '/items', {
      code, name: itemName, kind: stock ? 'product' : 'service', tracksInventory: stock, categoryId: category.id, unitId: unit.id,
    })
    const product = await item('P4-STOCK', '商贸库存件', true)
    const unavailable = await item('P4-EMPTY', '缺货商品', true)
    const service = await item('P4-SERVICE', '月度维护服务', false)
    const contactEmail = 'buyer@example.test'
    const supplier = await add(master + '/partners', { code: 'SUP', profile: { name: '验收供应商', roles: ['supplier'], contacts: [] } })
    const customer = await add(master + '/partners', { code: 'CUS', profile: { name: '华东客户', roles: ['customer'],
      contacts: [{ name: '财务联系人', email: contactEmail }] } })
    const account = async (code: string, category: string, purpose = 'posting') => {
      const chart = await read(page, finance + '/chart')
      await add(finance + '/chart/accounts', { expectedRevision: chart.revision, account: { code, name: code, category, purpose } })
      return (await read(page, finance + '/chart')).accounts.find((row: { code: string }) => row.code === code).id as string
    }
    const inventoryAccountId = await account('P4-INV', 'asset', 'control')
    const accrualAccountId = await account('P4-GRNI', 'liability', 'control')
    await add(trade + '/setup', { accounts: { inventoryAccountId, accrualAccountId,
      payableAccountId: await account('P4-AP', 'liability', 'control'), inputTaxAccountId: await account('P4-INPUT', 'asset'),
      varianceAccountId: await account('P4-VAR', 'expense'), donationIncomeAccountId: await account('P4-DON', 'income'),
    } })
    const arAccounts = {
      receivableAccountId: await account('P4-AR', 'asset', 'control'), advanceAccountId: await account('P4-ADV', 'liability', 'control'),
      revenueAccountId: await account('P4-REV', 'income'), outputTaxAccountId: await account('P4-VAT', 'liability', 'control'),
      costOfGoodsAccountId: await account('P4-COGS', 'expense'),
    }
    await add(ar + '/setup', { accounts: arAccounts })
    const bankAccountId = await account('P4-BANK', 'asset', 'control')
    const bank = await add(trade + '/banks', { code: 'BANK', name: '基本户', kind: 'bank', accountId: bankAccountId })
    const tax = finance + '/tax'
    await add(tax + '/rates', { code: 'SAMPLE', name: '验收税率', effectiveOn: '2026-01-01', rate: '0.13' })
    await add(tax + '/groups', { code: 'OUTPUT', name: '验收销项', expectedVersion: 0, rateCodes: ['SAMPLE'] })
    await add(tax + '/classifications', { kind: 'partner', resourceId: customer.id, groupCode: 'OUTPUT', expectedVersion: 0 })
    const warehouse = await add(inventory + '/warehouses', { code: 'MAIN', name: '销售主仓' })
    const warehousePath = inventory + '/warehouses/' + warehouse.id
    await ok(put(page, warehousePath + '/receiver', { expectedVersion: warehouse.version, memberId: alice }))
    const on = '2026-01-08'
    const po = await add(purchase, { number: 'P4-PURCHASE', draft: { on, supplierId: supplier.id,
      lines: [{ itemId: product.id, quantity: '10', unitPrice: '60' }] } })
    const poPath = purchase + '/' + po.id
    const decideOrder = (actor: Page, path: string, expectedVersion: number, decision: string) =>
      post(actor, path + '/decision', { expectedVersion, decision })
    await ok(decideOrder(page, poPath, 1, 'submit'))
    await ok(decideOrder(reviewer, poPath, 2, 'approve'))
    const poDetails = await read(page, poPath)
    const permit = await ok(post(reviewer, poPath + '/receipts', {
      expectedVersion: 3, lineId: poDetails.lines[0].id, warehouseId: warehouse.id, quantity: '10',
    }))
    await expect.poll(async () => (await read(reviewer, poPath + '/receipts')).permits[0]?.state).toBe('issued')
    const received = await add(inventory + '/receipts/' + permit.permitId + '/receive', { expectedRevision: 1, on, quantity: '10' })
    await expect.poll(async () => (await read(reviewer, trade + '/receipts')).find((row: { fact: { id: string } }) => row.fact.id === received.id)?.posted).toBe(true)

    const saleLine = { itemId: product.id, quantity: '10', unitPrice: '100' }
    const draft = { on, customerId: customer.id, lines: [saleLine, { itemId: unavailable.id, quantity: '1', unitPrice: '20' }] }
    const quoteInput = { number: 'QUOTE-P4', draft, isQuote: true }
    const quoteKey = crypto.randomUUID()
    const documentsUsed = async () => (await read(page, org + '/billing/entitlements')).usage.documentsThisMonth as number
    const beforeQuote = await documentsUsed()
    const quoteResponse = await write(page, sales, 'POST', quoteInput, { 'Idempotency-Key': `"${quoteKey}"` })
    const quote = await ok(Promise.resolve(quoteResponse), 201)
    const quotePath = sales + '/' + quote.id
    expect(quoteResponse.location).toBe(quotePath)
    const firstQuote = await api(page, quotePath)
    expect(firstQuote.status).toBe(200)
    expect(firstQuote.etag).toMatch(/^".+"$/)
    const notModified = await api(page, quotePath, 'GET', undefined, { 'If-None-Match': firstQuote.etag! })
    expect(notModified).toMatchObject({ status: 304, text: '', etag: firstQuote.etag })
    const quoteReplay = await post(page, sales, { ...quoteInput, operationId: quoteKey })
    expect(quoteReplay).toMatchObject({ status: 201, location: quoteResponse.location, text: quoteResponse.text })
    const idempotencyConflict = await write(page, sales, 'POST', { ...quoteInput, number: 'DIFFERENT-QUOTE' }, { 'Idempotency-Key': quoteKey })
    expect(idempotencyConflict.status).toBe(409)
    expect(idempotencyConflict.contentType).toContain('application/problem+json')
    expect(JSON.parse(idempotencyConflict.text)).toMatchObject({ status: 409, code: 'sales.idempotency_conflict', traceId: expect.any(String) })
    for (const invalidKey of ['', 'invalid', `${quoteKey}, ${quoteKey}`, crypto.randomUUID()]) {
      const invalid = await write(page, sales, 'POST', { ...quoteInput, operationId: quoteKey }, { 'Idempotency-Key': invalidKey })
      expect(invalid.status, invalid.text).toBe(400)
    }
    expect(await documentsUsed()).toBe(beforeQuote + 1)

    const edit = (tag: string, key = crypto.randomUUID()) => write(page, quotePath, 'PUT', { draft }, { 'If-Match': tag, 'Idempotency-Key': key })
    const reviewerQuote = await api(reviewer, quotePath)
    expect(reviewerQuote.etag).toMatch(/^".+"$/)
    expect(reviewerQuote.etag).not.toBe(firstQuote.etag)
    expect((await edit(reviewerQuote.etag!)).status).toBe(412)
    expect((await edit(`W/${firstQuote.etag}`)).status).toBe(412)
    expect((await edit('not-an-entity-tag')).status).toBe(400)
    expect((await edit(`*, ${firstQuote.etag}`)).status).toBe(400)
    expect((await write(page, quotePath, 'PUT', { draft }, { 'Idempotency-Key': crypto.randomUUID() })).status).toBe(400)
    const editionTag = `"other", ${firstQuote.etag}`
    const editKeys = [crypto.randomUUID(), crypto.randomUUID()]
    const edits = await Promise.all(editKeys.map(key => edit(editionTag, key)))
    expect(edits.map(result => result.status).sort()).toEqual([200, 412])
    const acceptedEditIndex = edits.findIndex(result => result.status === 200)
    const oldEditReplay = await write(page, quotePath, 'PUT', { draft, expectedVersion: 1, operationId: editKeys[acceptedEditIndex] })
    expect(oldEditReplay).toMatchObject({ status: 200, text: edits[acceptedEditIndex]?.text })
    const preconditionFailure = edits.find(result => result.status === 412)!
    expect(preconditionFailure.contentType).toContain('application/problem+json')
    expect(JSON.parse(preconditionFailure.text)).toMatchObject({ status: 412, code: 'sales.precondition_failed', traceId: expect.any(String) })
    const revised = await api(page, quotePath)
    expect(revised.etag).not.toBe(firstQuote.etag)
    expect(JSON.parse(revised.text).order.version).toBe(2)
    const issueQuote = { 'If-Match': '*', 'Idempotency-Key': crypto.randomUUID() }
    const issue = () => write(page, quotePath + '/decision', 'POST', { decision: 'issue-quote' }, issueQuote)
    const issued = await ok(issue())
    expect(await ok(issue())).toEqual(issued)
    const stale = await decideOrder(page, quotePath, 2, 'issue-quote')
    expect(stale.status).toBe(409)
    expect(stale.contentType).toContain('application/problem+json')
    expect(JSON.parse(stale.text)).toMatchObject({ status: 409, code: 'sales.version_conflict', traceId: expect.any(String) })
    expect((await read(page, quotePath)).order.version).toBe(3)
    const convertKey = crypto.randomUUID()
    const issuedQuote = await api(page, quotePath)
    const converted = await write(page, quotePath + '/convert', 'POST', { orderNumber: 'SALES-P4' },
      { 'If-Match': issuedQuote.etag!, 'Idempotency-Key': convertKey })
    const order = await ok(Promise.resolve(converted), 201)
    expect(converted.location).toBe(sales + '/' + order.id)
    expect(await post(page, quotePath + '/convert', { expectedVersion: 3, orderNumber: 'SALES-P4', operationId: convertKey }))
      .toMatchObject({ status: 201, location: converted.location, text: converted.text })
    expect((await post(page, quotePath + '/convert', { expectedVersion: 4, orderNumber: 'ALREADY-CONVERTED' })).status).toBe(409)
    const orderPath = sales + '/' + order.id
    await ok(decideOrder(page, orderPath, 1, 'submit'))
    expect((await decideOrder(page, orderPath, 2, 'approve')).status).toBe(403)
    await ok(decideOrder(reviewer, orderPath, 2, 'approve'))
    const permitsAt = (path: string) => read(reviewer, path + '/fulfillments')
    const reserve = async (path: string, lines: { lineId: string; quantity: string }[], holdSeconds = 900) => {
      const current = await api(reviewer, path)
      return write(reviewer, path + '/fulfillments', 'POST', { warehouseId: warehouse.id, lines, holdSeconds },
        { 'If-Match': current.etag!, 'Idempotency-Key': crypto.randomUUID() })
    }
    const stock = async () => (await read(page, warehousePath + '/positions')).find((row: { itemId: string }) => row.itemId === product.id)
    const detail = await read(reviewer, orderPath)
    const lines = detail.lines.map((row: { id: string; quantity: string }) => ({ lineId: row.id, quantity: row.quantity }))
    const denied = await ok(reserve(orderPath, lines))
    await expect.poll(async () => (await permitsAt(orderPath)).permits.filter((x: { id: string; state: string }) =>
      denied.permitIds.includes(x.id) && x.state === 'cancelled').length).toBe(2)
    for (const action of ['/' + denied.permitIds[0] + '/cancel', '/close']) {
      const rejected = await write(reviewer, orderPath + '/fulfillments' + action, 'POST', { reason: 'stale request' },
        { 'If-Match': issuedQuote.etag!, 'Idempotency-Key': crypto.randomUUID() })
      expect(rejected.status, rejected.text).toBe(412)
    }
    expect(await stock()).toMatchObject({ quantity: '10', reserved: '0', available: '10', value: '600' })
    const secondOrder = await ok(post(page, sales, { number: 'SALES-COMPETING', draft: { ...draft, lines: [saleLine] } }), 201)
    const secondPath = sales + '/' + secondOrder.id
    await ok(decideOrder(page, secondPath, 1, 'submit'))
    await ok(decideOrder(reviewer, secondPath, 2, 'approve'))
    const competingLine = (await read(reviewer, secondPath)).lines[0].id
    const attempts = await Promise.all([
      ok(reserve(orderPath, [lines[0]])),
      ok(reserve(secondPath, [{ lineId: competingLine, quantity: '10' }])),
    ])
    const permitStates = async () => Promise.all([orderPath, secondPath].map(async (path, index) =>
      (await permitsAt(path)).permits.find((x: { id: string }) => x.id === attempts[index].permitIds[0])?.state))
    await expect.poll(async () => (await permitStates()).slice().sort()).toEqual(['cancelled', 'reserved'])
    const winner = (await permitStates()).indexOf('reserved')
    const shipPermit = attempts[winner].permitIds[0] as string
    const shipmentPath = inventory + '/shipments/' + shipPermit + '/ship'
    expect(await stock()).toMatchObject({ quantity: '10', reserved: '10', available: '0' })
    expect((await post(reviewer, shipmentPath, { expectedRevision: 1, on, quantity: '6' })).status).toBe(403)
    const firstShipInput = { operationId: crypto.randomUUID(), expectedRevision: 1, on, quantity: '6' }
    const shippedFirst = await add(shipmentPath, firstShipInput)
    expect(await add(shipmentPath, firstShipInput)).toEqual(shippedFirst)
    expect(await stock()).toMatchObject({ quantity: '4', reserved: '4', available: '0', value: '240' })
    const shippedSecond = await add(shipmentPath, { expectedRevision: 2, on, quantity: '4' })
    expect(await stock()).toMatchObject({ quantity: '0', reserved: '0', available: '0', value: '0', sequence: 3 })
    const shipments = () => read(page, ar + '/shipments')
    await expect.poll(async () => (await shipments()).filter((x: { posted: boolean }) => x.posted).length).toBe(2)

    const submit = (kind: string, number: string, rest: object) => post(page, ar + '/documents', { draft: { kind, number, on, ...rest } })
    const approve = (doc: { id: string; version: number }, actor = reviewer) =>
      post(actor, ar + '/documents/' + doc.id + '/decision', { expectedVersion: doc.version, approve: true })
    const doc = async (id: string) => (await read(page, ar + '/documents')).find((row: { id: string }) => row.id === id)
    const invoiced = [{ shipmentId: shippedFirst.id, quantity: '6' }, { shipmentId: shippedSecond.id, quantity: '4' }]
    const drafts = await Promise.all([
      submit('invoice', 'INV-A', { lines: invoiced }), submit('invoice', 'INV-B', { lines: invoiced }),
    ])
    expect(drafts.map(x => x.status).sort()).toEqual([200, 409])
    let invoice = JSON.parse(drafts.find(x => x.status === 200)!.text)
    const invoicePath = ar + '/documents/' + invoice.id
    expect((await approve(invoice, page)).status).toBe(403)
    const fetchPdf = (actor: Page, path: string) => actor.evaluate(async (url) => {
      const response = await fetch(url, { redirect: 'manual' })
      return { status: response.status, disposition: response.headers.get('Content-Disposition'),
        bytes: response.ok ? Array.from(new Uint8Array(await response.arrayBuffer())) : [] }
    }, path)
    expect((await fetchPdf(reviewer, invoicePath + '/pdf')).status).toBe(404)
    const preview = await fetchPdf(reviewer, invoicePath + '/pdf?preview=true')
    expect(preview.status).toBe(200)
    expect(preview.disposition).toContain('inline')
    const originalVersion = invoice.version
    invoice = await ok(put(page, invoicePath, { expectedVersion: originalVersion, draft: { kind: 'invoice', on, dueOn: '2026-01-31', lines: invoiced } }))
    expect((await approve({ id: invoice.id, version: originalVersion })).status).toBe(409)
    await ok(approve(invoice))
    expect(await doc(invoice.id)).toMatchObject({ openBalance: '1130', state: 'posted', terms: { total: '1130', dueOn: '2026-01-31' } })
    const pdf = await fetchPdf(page, invoicePath + '/pdf')
    expect(pdf.status).toBe(200)
    const pdfBytes = Buffer.from(pdf.bytes)
    expect(pdfBytes.subarray(0, 4).toString()).toBe('%PDF')
    const evidence = resolve('../../../artifacts/p4/runtime')
    mkdirSync(evidence, { recursive: true })
    writeFileSync(resolve(evidence, 'sample-invoice.pdf'), pdfBytes)
    expect((await fetchPdf(guest, invoicePath + '/pdf')).status).toBe(401)
    expect((await post(page, invoicePath + '/shares', { lifetimeMinutes: 5 })).status).toBe(403)
    const shortShare = await ok(post(reviewer, invoicePath + '/shares', { lifetimeMinutes: 1 }))
    const share = await ok(post(reviewer, invoicePath + '/shares', { lifetimeMinutes: 10 }))
    const shared = (token: string) => guest.evaluate(async value => (await fetch('/public/invoice-pdf', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: value }),
    })).status, token)
    expect(await shared('0'.repeat(64))).toBe(404)
    expect(await shared(share.token)).toBe(200)
    await guest.goto('/invoice-share#' + share.token)
    const download = guest.waitForEvent('download')
    await guest.getByRole('button', { name: '下载共享发票 PDF' }).click()
    expect((await download).suggestedFilename()).toBe('invoice.pdf')
    expect(await guest.evaluate(() => location.hash.length === 0)).toBe(true)
    await ok(post(reviewer, ar + '/shares/' + share.id + '/revoke', {}))
    expect(await shared(share.token)).toBe(404)

    const receipt = await ok(submit('receipt', 'REC-500', { customerId: customer.id, amount: '500', bankId: bank.id }))
    await ok(approve(receipt))
    const firstAllocation = await ok(submit('allocation', 'ALLOC-500A', { invoiceId: invoice.id, fundsId: receipt.id, amount: '500' }))
    const competingAllocation = await ok(submit('allocation', 'ALLOC-500B', { invoiceId: invoice.id, fundsId: receipt.id, amount: '500' }))
    const allocations = await Promise.all([approve(firstAllocation), approve(competingAllocation)])
    expect(allocations.map(x => x.status).sort()).toEqual([200, 409])
    expect(await doc(invoice.id)).toMatchObject({ openBalance: '630' })
    expect(await doc(receipt.id)).toMatchObject({ openBalance: '0' })
    const reportPeriod = '?from=2026-01-01&through=2026-01-31'
    const cashProfit = finance + '/reports/profit-and-loss' + reportPeriod + '&basis=cash'
    const firstCash = await read(page, cashProfit)
    expect(firstCash).toMatchObject({ basis: 'cash', totals: expect.arrayContaining([
      { key: 'income', amount: '442.48', previous: null, difference: null },
    ]) })
    const agingPath = finance + '/reporting/aging/receivables?through=2026-02-01'
    const openAging = await read(page, agingPath + '&watermark=' + firstCash.watermark)
    expect(openAging).toMatchObject({ total: '630', items: [expect.objectContaining({ id: invoice.id,
      dueOn: '2026-01-31', bucket: '1-30', outstanding: '630' })] })
    const returnGoods = async (originalId: string) => {
      const authorized = await ok(post(reviewer, inventory + '/shipments/' + originalId + '/returns', { on, quantity: '1', reason: '客户退货验收' }))
      expect((await post(reviewer, inventory + '/sales-returns/' + authorized.id + '/decision', { confirm: true })).status).toBe(403)
      const returned = await add(inventory + '/sales-returns/' + authorized.id + '/decision', { confirm: true })
      await expect.poll(async () => (await shipments()).find((x: { id: string }) => x.id === returned.id)?.posted).toBe(true)
      return returned.id as string
    }
    const returnId = await returnGoods(shippedFirst.id)
    const credit = await ok(submit('credit', 'CN-1', { invoiceId: invoice.id, returnId, returnQuantity: '1' }))
    await ok(approve(credit))
    expect(await doc(invoice.id)).toMatchObject({ openBalance: '517' })
    const closeReceipt = await ok(submit('receipt', 'REC-517', { customerId: customer.id, amount: '517', bankId: bank.id }))
    await ok(approve(closeReceipt))
    await ok(approve(await ok(submit('allocation', 'ALLOC-517', { invoiceId: invoice.id, fundsId: closeReceipt.id, amount: '517' }))))
    const afterPaidReturn = await returnGoods(shippedSecond.id)
    const refundCredit = await ok(submit('credit', 'CN-PAID', { invoiceId: invoice.id, returnId: afterPaidReturn, returnQuantity: '1' }))
    await ok(approve(refundCredit))
    expect(await doc(refundCredit.id)).toMatchObject({ openBalance: '113' })
    await ok(approve(await ok(submit('refund', 'REFUND-113', { fundsId: refundCredit.id, bankId: bank.id, amount: '113' }))))
    expect(await doc(invoice.id)).toMatchObject({ openBalance: '0' })
    expect(await doc(refundCredit.id)).toMatchObject({ openBalance: '0' })
    const ledger = await read(page, finance + '/ledger/trial-balance/2026-01-31')
    expect(ledger.debit).toBe(ledger.credit)
    const balance = (id: string) => ledger.accounts.find((x: { accountId: string }) => x.accountId === id)?.balance ?? '0'
    expect([inventoryAccountId, accrualAccountId, arAccounts.receivableAccountId, arAccounts.advanceAccountId,
      arAccounts.revenueAccountId, arAccounts.outputTaxAccountId, arAccounts.costOfGoodsAccountId, bankAccountId].map(balance))
      .toEqual(['120', '-600', '0', '0', '-800', '-104', '480', '904'])
    const bankRows = await read(page, trade + '/banks/' + bank.id + '/movements') as { amount: string }[]
    expect(bankRows.map(x => x.amount).sort()).toEqual(['-113', '500', '517'])
    expect((await read(page, cashProfit)).totals).toContainEqual({ key: 'income', amount: '800', previous: null, difference: null })
    expect((await read(page, cashProfit + '&watermark=' + firstCash.watermark)).totals).toContainEqual(
      { key: 'income', amount: '442.48', previous: null, difference: null })
    expect((await read(page, agingPath)).total).toBe('0')
    expect((await read(page, agingPath + '&watermark=' + firstCash.watermark)).total).toBe('630')
    const cashFlow = await read(page, finance + '/reports/cash-flow' + reportPeriod)
    expect(cashFlow).toMatchObject({ basis: 'cash', totals: expect.arrayContaining([
      { key: 'cash-closing', amount: '904', previous: null, difference: null },
      { key: 'operating', amount: '904', previous: null, difference: null },
    ]) })
    const flowRows = await read(page, finance + '/reports/cash-flow/rows/customer-cash' + reportPeriod + '&watermark=' + cashFlow.watermark)
    expect(flowRows.postings.map((x: { reportAmount: string }) => x.reportAmount).sort()).toEqual(['-113', '500', '517'])
    expect(await read(page, finance + '/reporting/overview' + reportPeriod)).toMatchObject({ cash: '904', receivable: '0', payable: '0' })
    const capabilities = await read(page, finance + '/capabilities')
    // The local AppHost always exposes a loopback SMTP capture (Mailpit) for invoice mail.
    expect(capabilities).toMatchObject({ invoiceMail: 'local-only',
      workspaceMailSender: false, statutoryDonationReceipt: false })
    const reconcilePath = trade + '/banks/' + bank.id + '/reconciliations'
    const importPreview = await ok(post(page, trade + '/imports/preview', { bankId: bank.id,
      file: 'id,date,amount,description\nR500,2026-01-08,500,Receipt\nR517,2026-01-08,517,Receipt\nRF,2026-01-08,-113,Refund\nLAG,2026-01-31,1,Late book posting',
      mapping: { externalId: 'id', date: 'date', amount: 'amount', description: 'description' } }))
    await add(trade + '/imports/' + importPreview.previewId + '/commit', {})
    const statementRows = await read(reviewer, trade + '/banks/' + bank.id + '/statement')
    const movements = await read(reviewer, trade + '/banks/' + bank.id + '/movements')
    const lag = statementRows.find((line: { externalId: string }) => line.externalId === 'LAG')
    for (const line of statementRows.filter((row: { id: string }) => row.id !== lag.id)) {
      const movement = movements.find((row: { amount: string }) => row.amount === line.amount)
      await ok(post(reviewer, trade + '/statement/' + line.id + '/matches', { expectedVersion: line.version,
        movementId: movement.id, amount: line.amount.replace('-', '') }))
    }
    const reconciled = (balance: string) => add(reconcilePath, { through: '2026-01-31', statementBalance: balance })
    const exportPath = finance + '/report-exports'
    const exportRequest = { operationId: crypto.randomUUID(), kind: 'cash-flow', basis: 'cash', from: '2026-01-01',
      through: '2026-01-31', compare: true, watermark: cashFlow.watermark }
    const exportJob = await ok(write(page, exportPath, 'POST', exportRequest))
    expect(await ok(write(page, exportPath, 'POST', exportRequest))).toMatchObject({ id: exportJob.id })
    const file = exportPath + '/' + exportJob.id + '/file'
    await expect.poll(async () => (await api(page, file)).status).toBe(200)
    const csv = (await api(page, file)).text
    expect(csv).toContain('"cash-closing","","","","904.00"')
    expect((await api(reviewer, file)).status).toBe(404)
    const rebuilt = await add(exportPath + '/' + exportJob.id + '/rebuild', {})
    expect(rebuilt.watermark).toBe(exportJob.watermark)
    const rebuiltFile = exportPath + '/' + rebuilt.id + '/file'
    await expect.poll(async () => (await api(page, rebuiltFile)).status).toBe(200)
    expect((await api(page, rebuiltFile)).text).toBe(csv)

    const bad = await reconciled('904.99')
    const reconcileDecision = (row: { id: string; version: number }, decision: string, actor = reviewer) =>
      post(actor, trade + '/reconciliations/' + row.id + '/decision', { expectedVersion: row.version, decision, reason: '对账验收' })
    expect((await reconcileDecision(bad, 'finish')).status).toBe(409)
    const good = await reconciled('905')
    expect(good.report).toMatchObject({ bookBalance: '904', difference: '0', ledgerDifference: '0', books: [],
      statement: [expect.objectContaining({ id: lag.id, amount: '1' })] })
    expect((await reconcileDecision(good, 'finish', page)).status).toBe(403)
    const closed = await ok(reconcileDecision(good, 'finish'))
    expect(closed.state).toBe('completed')
    const reportFile = await api(page, trade + '/reconciliations/' + closed.id + '/pdf')
    expect(reportFile.status, reportFile.text.slice(0, 200)).toBe(200)
    expect(reportFile.text.startsWith('%PDF-')).toBe(true)
    const lateCash = await ok(submit('receipt', 'LATE-CASH', { customerId: customer.id, amount: '1', bankId: bank.id }))
    expect((await approve(lateCash)).status).toBe(409)
    await ok(post(reviewer, finance + '/ledger/periods/2026-02-01', { expectedVersion: 0, action: 'open', reason: '跨期匹配验收' }))
    const nextCash = await ok(submit('receipt', 'FEB-CASH', { on: '2026-02-01', customerId: customer.id, amount: '1', bankId: bank.id }))
    await ok(approve(nextCash))
    const nextMovement = (await read(reviewer, trade + '/banks/' + bank.id + '/movements'))
      .find((movement: { on: string; amount: string }) => movement.on === '2026-02-01' && movement.amount === '1')
    await ok(post(reviewer, trade + '/statement/' + lag.id + '/matches', { expectedVersion: lag.version,
      movementId: nextMovement.id, amount: '1' }))
    expect(await ok(post(page, reconcilePath + '/preview', { through: '2026-02-28', statementBalance: '905' })))
      .toMatchObject({ difference: '0', ledgerDifference: '0', books: [], statement: [] })
    expect(await ok(reconcileDecision(closed, 'undo'))).toMatchObject({ state: 'undone', report: closed.report })
    expect((await read(page, reconcilePath)).find((row: { id: string }) => row.id === closed.id).report).toEqual(closed.report)
    const loserPath = winner === 0 ? secondPath : orderPath
    const loserLine = winner === 0 ? competingLine : lines[0].lineId
    const expiring = await ok(reserve(loserPath, [{ lineId: loserLine, quantity: '2' }], 5))
    const expiresPermit = expiring.permitIds[0]
    await expect.poll(async () => (await permitsAt(loserPath)).permits.find((x: { id: string }) => x.id === expiresPermit)?.state).toBe('reserved')
    await expect.poll(async () => (await permitsAt(loserPath)).permits.find((x: { id: string }) => x.id === expiresPermit)?.state,
      { timeout: 25_000 }).toBe('cancelled')
    expect((await post(page, inventory + '/shipments/' + expiresPermit + '/ship', { expectedRevision: 1, on, quantity: '1' })).status).toBe(409)
    expect(await stock()).toMatchObject({ quantity: '2', reserved: '0', available: '2', value: '120' })
    const raced = await ok(reserve(loserPath, [{ lineId: loserLine, quantity: '2' }], 5))
    const racedId = raced.permitIds[0]
    const racedPermit = async () => (await permitsAt(loserPath)).permits.find((x: { id: string }) => x.id === racedId)
    await expect.poll(async () => (await racedPermit())?.state).toBe('reserved')
    const deadline = Date.parse((await racedPermit()).expiresAtUtc)
    await new Promise(resolveDeadline => setTimeout(resolveDeadline, Math.max(0, deadline - Date.now() - 20)))
    const atDeadline = await post(page, inventory + '/shipments/' + racedId + '/ship', { expectedRevision: 1, on, quantity: '1' })
    expect([200, 409]).toContain(atDeadline.status)
    await expect.poll(async () => (await racedPermit())?.state).toBe('cancelled')
    const left = atDeadline.status === 200 ? '1' : '2'
    expect(await stock()).toMatchObject({ quantity: left, reserved: '0', available: left })

    const schedules = ar + '/schedules'
    const template = { customerId: customer.id, serviceId: service.id, quantity: '1', unitPrice: '50',
      nextOn: '2090-01-31', endsOn: '2090-03-31', intervalMonths: 1, dueDays: 15 }
    const schedule = await add(schedules, { expectedVersion: 0, input: template })
    const schedulePath = schedules + '/' + schedule.id
    const scheduleView = async () => (await read(page, schedules)).find((x: { id: string }) => x.id === schedule.id)
    expect((await scheduleView()).preview).toEqual(['2090-01-31', '2090-02-28', '2090-03-31'])
    const paused = await add(schedulePath + '/pause', { expectedVersion: schedule.version, paused: true })
    const edited = await ok(put(page, schedulePath, { expectedVersion: paused.version,
      input: { ...template, nextOn: '2026-01-31', endsOn: '2026-03-31' } }))
    expect((await post(page, schedulePath + '/run', { on: '2026-01-31' })).status).toBe(409)
    expect(await read(page, schedulePath + '/occurrences')).toHaveLength(0)
    await add(schedulePath + '/pause', { expectedVersion: edited.version, paused: false })
    const runs = await Promise.all([add(schedulePath + '/run', { on: '2026-01-31' }), add(schedulePath + '/run', { on: '2026-01-31' })])
    expect(runs[0].invoiceId).toBeTruthy()
    expect(runs[0].invoiceId).toBe(runs[1].invoiceId)
    await expect.poll(async () => (await read(page, schedulePath + '/occurrences')).length).toBe(3)
    expect(await doc(runs[0].invoiceId)).toMatchObject({ state: 'submitted', journalId: null, terms: { total: '56.5' } })

    const mailPath = invoicePath + '/dispatches'
    expect((await post(page, mailPath, { recipient: contactEmail })).status).toBe(403)
    const outside = await ok(post(reviewer, '/bff/api/workspaces', { name: '发票隔离 ' + Date.now() }), 201)
    const outsideInvoice = invoicePath.replace(work.id, outside.id)
    expect((await fetchPdf(reviewer, outsideInvoice + '/pdf')).status).toBe(404)
    expect((await post(reviewer, outsideInvoice + '/dispatches', { recipient: contactEmail })).status).toBe(403)
    expect((await post(reviewer, mailPath, { recipient: 'outside@example.test' })).status).toBe(403)
    const sink = process.env.NEXORA_TEST_P4_SMTP_SINK
    if (sink) {
      const control = (data: object) => visitor.post(sink, { data })
      const deliveries = () => read(reviewer, mailPath)
      const status = async (id: string) => (await deliveries()).find((x: { id: string }) => x.id === id)
      const choose = (row: { id: string; version: number }, decision: string) =>
        post(reviewer, ar + '/dispatches/' + row.id + '/decision', { expectedVersion: row.version, decision })
      await control({ fail: true })
      const dispatch = await ok(post(reviewer, mailPath, { recipient: contactEmail }))
      await expect.poll(async () => (await status(dispatch.id))?.state).toBe('failed')
      await control({ fail: false })
      await ok(choose(await status(dispatch.id), 'retry'))
      await expect.poll(async () => (await status(dispatch.id))?.state).toBe('sent')
      const captured = await (await visitor.get(sink)).json() as { recipient: string; body: string }[]
      expect(captured.filter(x => x.body.includes(dispatch.id.replaceAll('-', '') + '/2'))).toEqual([
        expect.objectContaining({ recipient: contactEmail, body: expect.stringContaining('application/pdf') }),
      ])
      await control({ dropReply: true })
      const unknown = await ok(post(reviewer, mailPath, { recipient: contactEmail }))
      await expect.poll(async () => (await status(unknown.id))?.state).toBe('unknown')
      expect((await choose(await status(unknown.id), 'retry')).status).toBe(409)
      await control({ dropReply: false })
      const resent = await ok(choose(await status(unknown.id), 'resend'))
      expect(resent.previousId).toBe(unknown.id)
      await expect.poll(async () => (await status(resent.id))?.state).toBe('sent')
      await control({ fail: true })
      const abandoned = await ok(post(reviewer, mailPath, { recipient: contactEmail }))
      await expect.poll(async () => (await status(abandoned.id))?.state).toBe('failed')
      expect(await ok(choose(await status(abandoned.id), 'abandon'))).toMatchObject({ state: 'abandoned' })
      await control({})
    }
    await expect.poll(() => shared(shortShare.token), { timeout: 65_000, intervals: [2000, 5000] }).toBe(404)
    await page.reload()
    await page.getByRole('button', { name: new RegExp(name) }).click()
    await page.getByTestId('module-sales').click()
    await expect(page.getByRole('heading', { name: '销售报价与订单' })).toBeVisible()
    await page.getByTestId('module-receivables').click()
    await expect(page.getByRole('button', { name: /INV-[AB].*客户发票.*已过账/ })).toBeVisible()
  } finally {
    await visitor.dispose()
    await guestContext.close()
    await reviewerContext.close()
  }
}
)
test('Workspace setup wizard initializes settings, book, starter chart and tax, and resumes after skipping', async ({ page }) => {
  await login(page, 'alice')
  const stamp = Date.now()
  const company = '向导验证商贸 ' + stamp
  const createdResponse = await write(page, '/bff/api/workspaces', 'POST', {
    operationId: crypto.randomUUID(), name: company,
  })
  expect(createdResponse.status).toBe(201)
  const created = JSON.parse(createdResponse.text) as { id: string }
  await page.goto('/companies/' + created.id + '/setup')
  await expect(page.getByRole('heading', { name: '初始化向导' })).toBeVisible()
  await expect(page.getByTestId('setup-sub')).toContainText(company)
  await page.getByLabel('法定名称').fill(company + ' 有限公司')
  await page.getByLabel('品牌名称').fill(company)
  await page.getByRole('button', { name: '保存公司资料' }).click()
  await expect(page.getByText('公司资料已保存，可以继续下一步。')).toBeVisible()
  await page.getByRole('button', { name: '下一步' }).click()
  await page.getByRole('button', { name: '初始化账簿' }).click()
  await expect(page.getByText('账簿已初始化，已生成标准科目模板。')).toBeVisible()
  await page.getByRole('button', { name: '下一步' }).click()
  await expect(page.getByRole('heading', { name: '第 3 步 · 科目模板' })).toBeVisible()
  await expect(page.getByText(/科目构成：资产 \d+/)).toBeVisible()
  await page.getByRole('button', { name: '下一步' }).click()
  await expect(page.getByRole('heading', { name: '第 4 步 · 税制（可选）' })).toBeVisible()
  await page.getByRole('button', { name: '添加标准税率与税组' }).click()
  await expect(page.getByText('标准税率与税组已保存，税制步骤可完成。')).toBeVisible()
  await expect(page.getByText(/VAT13/)).toBeVisible()
  await page.getByRole('button', { name: '完成初始化' }).click()
  await expect(page).toHaveURL('https://localhost:7443/?workspace=' + created.id)
  await expect(page.getByRole('button', { name: new RegExp(company) })).toBeVisible()

  const skipped = '跳过向导商贸 ' + stamp
  const secondResponse = await write(page, '/bff/api/workspaces', 'POST', {
    operationId: crypto.randomUUID(), name: skipped,
  })
  expect(secondResponse.status).toBe(201)
  const second = JSON.parse(secondResponse.text) as { id: string }
  await page.goto('/companies/' + second.id + '/setup')
  await expect(page.getByRole('heading', { name: '初始化向导' })).toBeVisible()
  await page.getByRole('button', { name: '稍后继续' }).click()
  await expect(page).toHaveURL('https://localhost:7443/')
  await page.goto('/companies/' + second.id + '/setup')
  await expect(page.getByLabel('法定名称')).toBeVisible()
  const bookResponse = await api(page, '/bff/api/finance/workspaces/' + second.id + '/book')
  expect(bookResponse.status).toBe(200)
  expect((JSON.parse(bookResponse.text) as { settings: unknown }).settings).toBeNull()
})

test('Business dashboard summarizes finance, aging, inventory and projection state', async ({ page }) => {
  await login(page, 'alice')
  const stamp = Date.now()
  const company = '仪表盘验证商贸 ' + stamp
  const createdResponse = await write(page, '/bff/api/workspaces', 'POST', {
    operationId: crypto.randomUUID(), name: company,
  })
  expect(createdResponse.status).toBe(201)
  const created = JSON.parse(createdResponse.text) as { id: string }
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth() - 5, 1)
  const startsOn = [start.getFullYear(), String(start.getMonth() + 1).padStart(2, '0'), '01'].join('-')
  const today = [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0')].join('-')
  const bookResponse = await write(page, '/bff/api/finance/workspaces/' + created.id + '/book', 'POST', {
    operationId: crypto.randomUUID(), baseCurrency: 'CNY', startsOn, fiscalYearStartMonth: 1,
  })
  expect(bookResponse.status).toBe(200)
  await page.goto('/')
  await page.getByRole('button', { name: new RegExp(company) }).click()
  await page.getByTestId('module-dashboard').click()
  await expect(page.getByRole('heading', { name: '经营仪表盘' })).toBeVisible()
  const overviewResponse = await api(page, '/bff/api/finance/workspaces/' + created.id
    + '/reporting/overview?from=' + startsOn + '&through=' + today)
  expect(overviewResponse.status).toBe(200)
  const overview = JSON.parse(overviewResponse.text) as {
    income: string
    expense: string
    profit: string
    cash: string
    receivable: string
    payable: string
    minorUnits: number
  }
  await expect(page.getByTestId('kpi-income')).toHaveText(formatDecimal(overview.income, overview.minorUnits))
  await expect(page.getByTestId('kpi-expense')).toHaveText(formatDecimal(overview.expense, overview.minorUnits))
  await expect(page.getByTestId('kpi-profit')).toHaveText(formatDecimal(overview.profit, overview.minorUnits))
  await expect(page.getByTestId('kpi-cash')).toHaveText(formatDecimal(overview.cash, overview.minorUnits))
  await expect(page.getByTestId('kpi-receivable')).toHaveText(formatDecimal(overview.receivable, overview.minorUnits))
  await expect(page.getByTestId('kpi-payable')).toHaveText(formatDecimal(overview.payable, overview.minorUnits))
  await expect(page.getByTestId('kpi-inventory')).toHaveText('0.00')
  await expect(page.getByTestId('kpi-projection')).toContainText(/已同步|待同步/)
  await expect(page.getByTestId('dashboard-trend').locator('tbody tr')).toHaveCount(6)
  await expect(page.getByTestId('dashboard-consistency')).toContainText('利润表一致')
  await expect(page.getByText('本期暂无损益发生额；完成销售、采购或手工凭证后显示。')).toBeVisible()
  await expect(page.getByText('暂无未结应收。')).toBeVisible()
  await expect(page.getByText('暂无未结应付。')).toBeVisible()
  await page.getByRole('button', { name: '查看账龄明细' }).click()
  await expect(page.getByTestId('module-aging')).toHaveAttribute('aria-selected', 'true')
})

test('CLI device authorization grants scoped access and revokes immediately', async ({ page }) => {
  test.setTimeout(240_000)
  const stamp = Date.now()
  const company = 'CLI 授权商贸 ' + stamp
  const cliHome = resolve('../../../artifacts/w3/cli-home')
  rmSync(cliHome, { recursive: true, force: true })
  const cli = resolve('../../../scripts/p5/nexora-cli.mjs')
  const alice = realm.users.find(x => x.username === 'alice')!

  await login(page, 'alice')
  const created = await write(page, '/bff/api/workspaces', 'POST', { operationId: crypto.randomUUID(), name: company })
  expect(created.status).toBe(201)

  interface CliRun {
    lines: string[]
    child: ReturnType<typeof spawn>
    waitFor: (event: string) => Promise<Record<string, unknown>>
  }
  function runCli(...args: string[]): CliRun {
    const lines: string[] = []
    let buffer = ''
    const child = spawn(process.execPath, [cli, ...args], {
      env: {
        ...process.env,
        NEXORA_CLI_BASE: 'https://localhost:7443',
        NEXORA_CLI_HOME: cliHome,
        NODE_TLS_REJECT_UNAUTHORIZED: '0',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => {
      buffer += chunk
      let index = buffer.indexOf('\n')
      while (index >= 0) {
        lines.push(buffer.slice(0, index))
        buffer = buffer.slice(index + 1)
        index = buffer.indexOf('\n')
      }
    })
    const waitFor = async (event: string) => {
      for (let attempt = 0; attempt < 600; attempt++) {
        for (const line of lines) {
          try {
            const parsed = JSON.parse(line) as Record<string, unknown>
            if (parsed.event === event) return parsed
          }
          catch { /* ignore non-json output */ }
        }
        await page.waitForTimeout(100)
      }
      throw new Error('CLI did not emit ' + event + ': ' + lines.join(' | '))
    }
    return { lines, child, waitFor }
  }

  const decideConsent = async (accept: boolean) => {
    const acceptButton = page.locator('input#kc-login[name="accept"]')
    const cancelButton = page.locator('input#kc-cancel[name="cancel"]')
    for (let attempt = 0; attempt < 160; attempt++) {
      if (await acceptButton.count() || await cancelButton.count()) break
      const password = page.locator('#password')
      if (await password.count()) {
        if (await page.locator('#username').count()) await page.locator('#username').fill('alice')
        await password.fill(alice.credentials[0]!.value)
        await page.locator('#kc-login').click()
        await page.waitForLoadState('domcontentloaded')
        continue
      }
      const otp = page.locator('input[name="otp"]')
      if (await otp.count()) {
        await otp.fill(await freshTotp('alice', seeds.alice!))
        await page.locator('#kc-login').click()
        await page.waitForLoadState('domcontentloaded')
        continue
      }
      const next = page.locator('#kc-login')
      if (await next.count()) {
        await next.click()
        await page.waitForLoadState('domcontentloaded')
        continue
      }
      await page.waitForTimeout(250)
    }
    if (accept) await acceptButton.click()
    else await cancelButton.click()
  }

  const authorize = async (run: CliRun) => {
    const start = await run.waitFor('authorization_required')
    expect(String(start.verificationUrl)).toContain('/cli/authorize?user_code=')
    await page.goto(String(start.verificationUrl))
    await expect(page.getByRole('heading', { name: 'CLI 设备授权' })).toBeVisible()
    await page.getByRole('button', { name: '继续授权' }).click()
    await page.waitForLoadState('domcontentloaded')
    await decideConsent(true)
    return run.waitFor('authorized')
  }

  const run = runCli('login')
  const authorized = await authorize(run)
  expect(String(authorized.scope)).toContain('nexora.cli')

  const workspaces = await runCli('call', '--path', '/api/cli/workspaces')
  const workspaceCall = await workspaces.waitFor('call')
  expect(workspaceCall.status).toBe(200)
  expect(JSON.stringify(workspaceCall.body)).toContain(company)

  await page.goto('/')
  const webCall = await api(page, '/bff/api/cli/workspaces')
  expect(webCall.status).toBe(403)

  const webOnly = await runCli('call', '--path', '/api/workspaces')
  const webOnlyCall = await webOnly.waitFor('call')
  expect(webOnlyCall.status).toBe(403)

  const stored = JSON.parse(readFileSync(resolve(cliHome, 'tokens.json'), 'utf8')) as { accessToken: string }
  const logout = await runCli('logout')
  await logout.waitFor('logged_out')
  const afterLogout = await runCli('call', '--path', '/api/cli/workspaces', '--token', stored.accessToken)
  const revoked = await afterLogout.waitFor('call')
  expect(revoked.status).toBe(403)

  const deniedRun = runCli('login')
  const start = await deniedRun.waitFor('authorization_required')
  await page.goto(String(start.verificationUrl))
  await page.getByRole('button', { name: '继续授权' }).click()
  await page.waitForLoadState('domcontentloaded')
  await decideConsent(false)
  const denied = await deniedRun.waitFor('denied')
  expect(denied.event).toBe('denied')
})


test('Business data exports download CSV and print from list panels', async ({ page, browser }) => {
  test.setTimeout(300_000)
  await login(page, 'alice')
  const stamp = Date.now()
  const company = '导出验证商贸 ' + stamp
  const createdResponse = await write(page, '/bff/api/workspaces', 'POST', {
    operationId: crypto.randomUUID(), name: company,
  })
  expect(createdResponse.status).toBe(201)
  const created = JSON.parse(createdResponse.text) as { id: string }
  const now = new Date()
  const today = [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0')].join('-')
  const bookResponse = await write(page, '/bff/api/finance/workspaces/' + created.id + '/book', 'POST', {
    operationId: crypto.randomUUID(), baseCurrency: 'CNY', startsOn: today, fiscalYearStartMonth: 1,
  })
  expect(bookResponse.status).toBe(200)
  const bobContext = await browser.newContext({ baseURL: 'https://localhost:7443' })
  const bobPage = await bobContext.newPage()
  await login(bobPage, 'bob')
  const orgPath = '/bff/api/workspaces/' + created.id
  const version = async (actor: Page) => {
    const access = await api(actor, orgPath + '/access')
    expect(access.status).toBe(200)
    return (JSON.parse(access.text) as { authorizationVersion: number }).authorizationVersion
  }
  const inviteResponse = await write(page, orgPath + '/invitations', 'POST', {
    operationId: crypto.randomUUID(), expectedVersion: await version(page), email: 'bob@nexora.invalid', role: 'WorkspaceOwner',
  })
  expect(inviteResponse.status).toBe(200)
  const invite = JSON.parse(inviteResponse.text) as { invitation: { id: string }; token: string }
  const redeemResponse = await write(bobPage, '/bff/api/invitations/' + invite.invitation.id + '/redeem', 'POST', { operationId: crypto.randomUUID(), token: invite.token })
  expect(redeemResponse.status).toBe(200)
  const membersResponse = await api(page, orgPath + '/members')
  expect(membersResponse.status).toBe(200)
  const members = JSON.parse(membersResponse.text) as { id: string; email: string }[]
  const alice = members.find(x => x.email === 'alice@nexora.invalid')!.id
  const grant = async (maker: Page, approver: Page, member: string, area: string, role: string) => {
    const target = orgPath + '/members/' + member + '/' + area + '-role'
    const proposed = await write(maker, target, 'POST', { operationId: crypto.randomUUID(), expectedVersion: await version(maker), action: 'propose', role })
    expect(proposed.status).toBe(200)
    const approved = await write(approver, target, 'POST', { operationId: crypto.randomUUID(), expectedVersion: await version(approver), action: 'approve' })
    expect(approved.status).toBe(200)
  }
  await grant(page, bobPage, alice, 'sales', 'SalesOperator')
  await grant(page, bobPage, alice, 'purchase', 'PurchasingOperator')
  await grant(page, bobPage, alice, 'finance', 'Accountant')
  await page.addInitScript(() => {
    const state = window as unknown as { __printCalls?: number }
    window.print = () => { state.__printCalls = (state.__printCalls ?? 0) + 1 }
  })
  await page.goto('/')
  await page.getByRole('button', { name: new RegExp(company) }).click()

  await page.getByTestId('module-sales').click()
  const salesDownload = page.waitForEvent('download')
  await page.getByRole('button', { name: '导出销售订单 CSV' }).click()
  const salesFile = await salesDownload
  expect(salesFile.suggestedFilename()).toMatch(/^销售订单-\d{8}-\d{4}\.csv$/)
  const salesCsv = readFileSync((await salesFile.path())!, 'utf8')
  expect(salesCsv.startsWith('\uFEFF')).toBe(true)
  expect(salesCsv).toContain('"单号","单据类型","日期","客户","状态","币种","版本"')
  await page.getByRole('button', { name: '打印当前视图' }).click()
  await expect.poll(async () => page.evaluate(() => (window as unknown as { __printCalls?: number }).__printCalls ?? 0)).toBe(1)

  await page.getByTestId('module-purchasing').click()
  const purchaseDownload = page.waitForEvent('download')
  await page.getByRole('button', { name: '导出采购订单 CSV' }).click()
  const purchaseFile = await purchaseDownload
  expect(purchaseFile.suggestedFilename()).toMatch(/^采购订单-\d{8}-\d{4}\.csv$/)
  expect(readFileSync((await purchaseFile.path())!, 'utf8')).toContain('"单号","日期","供应商","状态","币种","版本"')

  await page.getByTestId('module-receivables').click()
  const receivableDownload = page.waitForEvent('download')
  await page.getByRole('button', { name: '导出客户单据 CSV' }).click()
  const receivableFile = await receivableDownload
  expect(receivableFile.suggestedFilename()).toMatch(/^客户单据-\d{8}-\d{4}\.csv$/)
  expect(readFileSync((await receivableFile.path())!, 'utf8'))
    .toContain('"单号","类型","状态","日期","到期日","客户","含税总额","币种","未结余额"')

  await page.getByTestId('module-inventory').click()
  const inventoryDownload = page.waitForEvent('download')
  await page.getByRole('button', { name: '导出库存 CSV' }).click()
  const inventoryFile = await inventoryDownload
  expect(inventoryFile.suggestedFilename()).toMatch(/^库存余额-\d{8}-\d{4}\.csv$/)
  expect(readFileSync((await inventoryFile.path())!, 'utf8')).toContain('"仓库编码","仓库名称","商品ID","在库数量"')

  const reportResponse = await api(page, '/bff/api/finance/workspaces/' + created.id
    + '/reports/profit-and-loss?from=' + today + '&through=' + today)
  expect(reportResponse.status).toBe(200)
  const report = JSON.parse(reportResponse.text) as { watermark: number }
  const queueExport = async () => {
    for (let attempt = 0; attempt < 6; attempt++) {
      const queued = await write(page, '/bff/api/finance/workspaces/' + created.id + '/report-exports', 'POST', {
        operationId: crypto.randomUUID(), kind: 'profit-and-loss', from: today, through: today,
        compare: false, watermark: report.watermark, basis: 'accrual',
      })
      if (queued.status === 200) return
      expect(queued.status).toBe(409)
      await page.waitForTimeout(500)
    }
    throw new Error('Report export queue stayed at capacity.')
  }
  for (let index = 0; index < 21; index++) await queueExport()
  const jobsResponse = await api(page, '/bff/api/finance/workspaces/' + created.id + '/report-exports')
  expect(jobsResponse.status).toBe(200)
  expect((JSON.parse(jobsResponse.text) as unknown[]).length).toBe(20)
  await bobContext.close()
})

test('Unified audit trail lists security and business events, filters, exports and isolates workspaces', async ({ page }) => {
  test.setTimeout(180_000)
  const stamp = Date.now()
  const company = '审计验证商贸 ' + stamp
  await login(page, 'alice')
  const created = await write(page, '/bff/api/workspaces', 'POST', { operationId: crypto.randomUUID(), name: company })
  expect(created.status).toBe(201)
  const workspace = JSON.parse(created.text) as { id: string }
  const today = new Date().toISOString().slice(0, 10)
  const settings = await write(page, '/bff/api/workspaces/' + workspace.id + '/settings', 'PUT', {
    expectedVersion: 0,
    presentation: {
      legalName: company, brandName: company, accentColor: '#274580', dateFormat: 'yyyy-MM-dd',
      timeZone: 'Asia/Shanghai', logoDataUrl: null,
    },
  })
  expect(settings.status).toBe(200)
  const book = await write(page, '/bff/api/finance/workspaces/' + workspace.id + '/book', 'POST', {
    operationId: crypto.randomUUID(), baseCurrency: 'CNY', startsOn: today, fiscalYearStartMonth: 1,
  })
  expect(book.status).toBe(200)
  const tax = await write(page, '/bff/api/finance/workspaces/' + workspace.id + '/tax/rates', 'POST', {
    operationId: crypto.randomUUID(), code: 'VAT13', name: '增值税 13%', effectiveOn: today, rate: '0.13',
  })
  expect(tax.status).toBe(200)

  await page.goto('/')
  await page.getByRole('button', { name: new RegExp(company) }).click()
  await page.getByTestId('module-audit').click()
  await expect(page.getByRole('heading', { name: '审计查询' })).toBeVisible()
  await expect(page.getByText('workspace.settings.revised')).toBeVisible()
  await expect(page.getByRole('cell', { name: '组织与安全', exact: true }).first()).toBeVisible()

  await page.getByLabel('操作', { exact: true }).fill('workspace.settings.revised')
  await page.getByRole('button', { name: '查询审计记录' }).click()
  await expect(page.getByText('workspace.settings.revised')).toBeVisible()
  await expect(page.getByRole('cell', { name: '财务', exact: true })).toHaveCount(0)
  await expect(page.getByRole('cell', { name: '销售', exact: true })).toHaveCount(0)

  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: '导出审计记录 CSV' }).click()
  const file = await download
  expect(file.suggestedFilename()).toMatch(/^审计记录-\d{8}-\d{4}\.csv$/)
  const csv = readFileSync(await file.path(), 'utf8')
  expect(csv.startsWith('\uFEFF')).toBe(true)
  expect(csv).toContain('"时间","来源","操作"')

  const second = await write(page, '/bff/api/workspaces', 'POST', { operationId: crypto.randomUUID(), name: '隔离验证商贸 ' + stamp })
  expect(second.status).toBe(201)
  const secondWorkspace = JSON.parse(second.text) as { id: string }
  const isolated = await api(page, '/bff/api/workspaces/' + secondWorkspace.id + '/audit')
  expect(isolated.status).toBe(200)
  const isolatedPage = JSON.parse(isolated.text) as { entries: { action: string }[] }
  expect(isolatedPage.entries.some(item => item.action === 'workspace.settings.revised')).toBe(false)
})

test('Finance MCP lists read-only tools, answers scoped calls and rejects other audiences', async ({ page }) => {
  test.setTimeout(300_000)
  const stamp = Date.now()
  const company = 'MCP 财务商贸 ' + stamp
  const cliHome = resolve('../../../artifacts/w3/mcp-home')
  rmSync(cliHome, { recursive: true, force: true })
  const cli = resolve('../../../scripts/p5/nexora-cli.mjs')
  const alice = realm.users.find(x => x.username === 'alice')!

  await login(page, 'alice')
  const created = await write(page, '/bff/api/workspaces', 'POST', { operationId: crypto.randomUUID(), name: company })
  expect(created.status).toBe(201)
  const workspaceId = (JSON.parse(created.text) as { id: string }).id
  const today = new Date().toISOString().slice(0, 10)
  const book = await write(page, `/bff/api/finance/workspaces/${workspaceId}/book`, 'POST', {
    operationId: crypto.randomUUID(), baseCurrency: 'CNY', startsOn: today, fiscalYearStartMonth: 1,
  })
  expect([200, 201]).toContain(book.status)

  interface CliRun {
    lines: string[]
    waitFor: (event: string) => Promise<Record<string, unknown>>
  }
  function runCli(...args: string[]): CliRun {
    const lines: string[] = []
    let buffer = ''
    const child = spawn(process.execPath, [cli, ...args], {
      env: {
        ...process.env,
        NEXORA_CLI_BASE: 'https://localhost:7443',
        NEXORA_CLI_HOME: cliHome,
        NODE_TLS_REJECT_UNAUTHORIZED: '0',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => {
      buffer += chunk
      let index = buffer.indexOf('\n')
      while (index >= 0) {
        lines.push(buffer.slice(0, index))
        buffer = buffer.slice(index + 1)
        index = buffer.indexOf('\n')
      }
    })
    const waitFor = async (event: string) => {
      for (let attempt = 0; attempt < 600; attempt++) {
        for (const line of lines) {
          try {
            const parsed = JSON.parse(line) as Record<string, unknown>
            if (parsed.event === event) return parsed
          }
          catch { /* ignore non-json output */ }
        }
        await page.waitForTimeout(100)
      }
      throw new Error('CLI did not emit ' + event + ': ' + lines.join(' | '))
    }
    return { lines, waitFor }
  }

  const decideConsent = async (accept: boolean) => {
    const acceptButton = page.locator('input#kc-login[name="accept"]')
    const cancelButton = page.locator('input#kc-cancel[name="cancel"]')
    for (let attempt = 0; attempt < 160; attempt++) {
      if (await acceptButton.count() || await cancelButton.count()) break
      const password = page.locator('#password')
      if (await password.count()) {
        if (await page.locator('#username').count()) await page.locator('#username').fill('alice')
        await password.fill(alice.credentials[0]!.value)
        await page.locator('#kc-login').click()
        await page.waitForLoadState('domcontentloaded')
        continue
      }
      const otp = page.locator('input[name="otp"]')
      if (await otp.count()) {
        await otp.fill(await freshTotp('alice', seeds.alice!))
        await page.locator('#kc-login').click()
        await page.waitForLoadState('domcontentloaded')
        continue
      }
      const next = page.locator('#kc-login')
      if (await next.count()) {
        await next.click()
        await page.waitForLoadState('domcontentloaded')
        continue
      }
      await page.waitForTimeout(250)
    }
    if (accept) await acceptButton.click()
    else await cancelButton.click()
  }

  const start = runCli('login', '--client', 'mcp')
  const required = await start.waitFor('authorization_required')
  expect(String(required.verificationUrl)).toContain('/cli/authorize?user_code=')
  await page.goto(String(required.verificationUrl))
  await expect(page.getByRole('heading', { name: 'CLI 设备授权' })).toBeVisible()
  await page.getByRole('button', { name: '继续授权' }).click()
  await page.waitForLoadState('domcontentloaded')
  await decideConsent(true)
  const authorized = await start.waitFor('authorized')
  expect(authorized.client).toBe('mcp')
  expect(String(authorized.scope)).toContain('nexora.mcp')

  interface JsonRpcBody {
    result?: {
      serverInfo?: { name?: string }
      tools?: { name: string }[]
      isError?: boolean
      structuredContent?: Record<string, unknown>
    }
    error?: { code: number, message: string }
  }
  const mcpCall = async (payload: Record<string, unknown>) => {
    const call = await runCli('call', '--path', '/mcp', '--method', 'POST', '--body', JSON.stringify(payload))
    const response = await call.waitFor('call')
    return { status: Number(response.status), body: response.body as JsonRpcBody }
  }

  const initialized = await mcpCall({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} })
  expect(initialized.status).toBe(200)
  expect(initialized.body.result?.serverInfo?.name).toBe('nexora-finance-mcp')

  const listed = await mcpCall({ jsonrpc: '2.0', id: 2, method: 'tools/list' })
  const toolNames = (listed.body.result?.tools ?? []).map(tool => tool.name)
  expect(toolNames).toContain('finance_list_accounts')
  expect(toolNames).toContain('finance_trial_balance')
  expect(toolNames).toContain('finance_financial_report')
  expect(toolNames).toContain('finance_list_journals')

  const accounts = await mcpCall({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'finance_list_accounts', arguments: { workspaceId } } })
  expect(accounts.body.result?.isError).toBe(false)
  const chart = accounts.body.result?.structuredContent as { accounts?: { code: string }[] } | undefined
  const chartCodes = (chart?.accounts ?? []).map(account => account.code)
  expect(chartCodes.length).toBeGreaterThan(0)

  await page.goto('/')
  const directChart = await api(page, `/bff/api/finance/workspaces/${workspaceId}/chart`)
  expect(directChart.status).toBe(200)
  const directCodes = (JSON.parse(directChart.text) as { accounts: { code: string }[] }).accounts.map(account => account.code)
  expect(chartCodes).toEqual(directCodes)

  const foreign = await mcpCall({ jsonrpc: '2.0', id: 7, method: 'tools/call', params: { name: 'finance_list_accounts', arguments: { workspaceId: crypto.randomUUID() } } })
  expect(foreign.status).toBe(200)
  expect(foreign.body.result?.isError).toBe(true)

  const trial = await mcpCall({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'finance_trial_balance', arguments: { workspaceId, through: today } } })
  expect(trial.body.result?.isError).toBe(false)
  expect((trial.body.result?.structuredContent as { currency?: string } | undefined)?.currency).toBe('CNY')

  const invalid = await mcpCall({ jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'finance_list_accounts', arguments: { workspaceId: 'not-a-uuid' } } })
  expect(invalid.body.error?.code).toBe(-32602)

  const cliOnly = await runCli('call', '--path', '/api/cli/workspaces')
  expect(Number((await cliOnly.waitFor('call')).status)).toBe(403)
  const webOnly = await runCli('call', '--path', '/api/workspaces')
  expect(Number((await webOnly.waitFor('call')).status)).toBe(403)

  const stored = JSON.parse(readFileSync(resolve(cliHome, 'tokens.json'), 'utf8')) as { accessToken: string }
  const logout = await runCli('logout')
  await logout.waitFor('logged_out')
  const revokedRun = await runCli('call', '--path', '/mcp', '--method', 'POST', '--body', JSON.stringify({ jsonrpc: '2.0', id: 6, method: 'ping' }), '--token', stored.accessToken)
  expect(Number((await revokedRun.waitFor('call')).status)).toBe(403)
})

test('AI assistant streams, cancels, resumes, gates tools and isolates workspaces', async ({ page }) => {
  test.setTimeout(240_000)
  await login(page, 'alice')
  const stamp = Date.now()
  const company = '助手验证商贸 ' + stamp
  const createdResponse = await write(page, '/bff/api/workspaces', 'POST', {
    operationId: crypto.randomUUID(), name: company,
  })
  expect(createdResponse.status).toBe(201)
  const created = JSON.parse(createdResponse.text) as { id: string }
  const assistantBase = '/bff/api/assistant/workspaces/' + created.id
  // 助手 stub 以 UTC 当天作为试算平衡截止日；账簿启用日同样按 UTC 取，避免本地与 UTC 跨日时 through 早于 startsOn。
  const today = new Date().toISOString().slice(0, 10)
  const bookResponse = await write(page, '/bff/api/finance/workspaces/' + created.id + '/book', 'POST', {
    operationId: crypto.randomUUID(), baseCurrency: 'CNY', startsOn: today, fiscalYearStartMonth: 1,
  })
  expect(bookResponse.status).toBe(200)

  await page.goto('/')
  await page.getByRole('button', { name: new RegExp(company) }).click()
  await page.getByTestId('module-assistant').click()
  await expect(page.getByRole('heading', { name: 'AI 助手' })).toBeVisible()
  await expect(page.getByText('nexora-stub')).toBeVisible()

  const input = page.getByLabel('消息')
  await input.fill('请介绍一下你能做什么')
  await page.getByRole('button', { name: '发送' }).click()
  const cancelButton = page.getByRole('button', { name: '取消' })
  await expect(page.getByText(/已收到你的请求/).first()).toBeVisible({ timeout: 30_000 })
  await expect(cancelButton).toBeEnabled()
  await cancelButton.click()
  await expect(page.getByText('已取消', { exact: true }).first()).toBeVisible({ timeout: 30_000 })
  await page.getByRole('button', { name: '恢复生成' }).click()
  await expect(page.getByText('已完成', { exact: true }).first()).toBeVisible({ timeout: 30_000 })
  await expect(page.getByText(/这是本地确定性测试模型生成的流式回复/).first()).toBeVisible()

  await input.fill('记录一条会话备注：下周复核应收')
  await page.getByRole('button', { name: '发送' }).click()
  await expect(page.getByText('等待审批', { exact: true }).first()).toBeVisible({ timeout: 30_000 })
  await expect(page.getByRole('button', { name: '批准执行' })).toBeVisible()
  await page.getByRole('button', { name: '拒绝' }).click()
  await expect(page.getByText('工具调用已拒绝，未执行任何操作。')).toBeVisible()

  await input.fill('记录一条会话备注：下周复核应付')
  await page.getByRole('button', { name: '发送' }).click()
  await expect(page.getByRole('button', { name: '批准执行' })).toBeVisible({ timeout: 30_000 })
  await page.getByRole('button', { name: '批准执行' }).click()
  await expect(page.getByText('工具调用已批准并执行。')).toBeVisible()
  await expect(page.getByText(/会话备注已记录：.*下周复核应付/).first()).toBeVisible()

  await input.fill('请读取本期试算平衡')
  await page.getByRole('button', { name: '发送' }).click()
  await expect(page.getByText(/试算平衡（.*CNY/).first()).toBeVisible({ timeout: 60_000 })

  await page.reload()
  await page.getByRole('button', { name: new RegExp(company) }).click()
  await page.getByTestId('module-assistant').click()
  await expect(page.getByText('会话历史')).toBeVisible()
  await page.getByTestId('assistant-sessions').locator('button').first().click()
  await expect(page.getByText(/会话备注已记录：/).first()).toBeVisible()
  const history = await api(page, assistantBase + '/sessions')
  expect(history.status).toBe(200)
  const historyBody = JSON.parse(history.text) as { sessions: { id: string }[] }
  expect(historyBody.sessions.length).toBeGreaterThan(0)

  const secondResponse = await write(page, '/bff/api/workspaces', 'POST', {
    operationId: crypto.randomUUID(), name: '助手隔离商贸 ' + stamp,
  })
  expect(secondResponse.status).toBe(201)
  const second = JSON.parse(secondResponse.text) as { id: string }
  const foreignSessions = await api(page, '/bff/api/assistant/workspaces/' + second.id + '/sessions')
  expect(foreignSessions.status).toBe(200)
  expect((JSON.parse(foreignSessions.text) as { sessions: unknown[] }).sessions).toEqual([])
  const foreignRun = await write(page, '/bff/api/assistant/workspaces/' + second.id + '/runs', 'POST', {
    sessionId: historyBody.sessions[0]!.id, message: '你好',
  })
  expect(foreignRun.status).toBe(404)
})

test('Billing plans enforce quotas, gate modules, record manual payments and downgrade on cancel', async ({ page }) => {
  test.setTimeout(360_000)
  await login(page, 'bob')
  const stamp = Date.now()
  const company = '计费验证商贸 ' + stamp
  // 上一次中断的运行可能把该账户留在免费版；按名称找回本用例创建的工作区并恢复专业版。
  const ownedList = await api(page, '/bff/api/workspaces')
  expect(ownedList.status).toBe(200)
  const owned = JSON.parse(ownedList.text) as { id: string; name: string; isPersonal: boolean }[]
  const previous = owned.find(candidate => !candidate.isPersonal && candidate.name.startsWith('计费验证商贸'))
  if (previous) {
    const previousBilling = await api(page, '/bff/api/workspaces/' + previous.id + '/billing')
    expect(previousBilling.status).toBe(200)
    const view = JSON.parse(previousBilling.text) as { canManage: boolean; subscription: { planCode: string } }
    expect(view.canManage).toBe(true)
    if (view.subscription.planCode !== 'pro')
      expect((await write(page, '/bff/api/workspaces/' + previous.id + '/billing/subscription', 'POST', {
        planCode: 'pro', operationId: crypto.randomUUID(), paymentReference: 'RESET-' + stamp,
      })).status).toBe(200)
  }
  const createdResponse = await write(page, '/bff/api/workspaces', 'POST', {
    operationId: crypto.randomUUID(), name: company,
  })
  expect(createdResponse.status).toBe(201)
  const workspace = JSON.parse(createdResponse.text) as { id: string }
  const org = '/bff/api/workspaces/' + workspace.id
  const billing = org + '/billing'
  const assistantSessions = '/bff/api/assistant/workspaces/' + workspace.id + '/sessions'
  const salesOrders = '/bff/api/sales/workspaces/' + workspace.id + '/orders'
  const inventoryWarehouses = '/bff/api/inventory/workspaces/' + workspace.id + '/warehouses'
  const version = async () => {
    const access = await api(page, org + '/access')
    expect(access.status).toBe(200)
    return (JSON.parse(access.text) as { authorizationVersion: number }).authorizationVersion
  }
  const readBilling = async () => {
    const response = await api(page, billing)
    expect(response.status).toBe(200)
    return JSON.parse(response.text) as {
      subscription: { planCode: string; status: string; effectivePlanCode: string }
      invoices: { id: string; status: string; planCode: string }[]
    }
  }
  const readEntitlements = async () => {
    const response = await api(page, billing + '/entitlements')
    expect(response.status).toBe(200)
    return JSON.parse(response.text) as {
      planCode: string; effectivePlanCode: string; modules: string[]
      usage: { documentsThisMonth: number; documentsLimit: number }
    }
  }

  // 本地默认套餐为专业版：AI 助手模块可用，计费视图按生效套餐展示。
  expect((await api(page, assistantSessions)).status).toBe(200)
  expect((await readBilling()).subscription.planCode).toBe('pro')

  // 账单页展示当前套餐与配额，并可通过界面降级到免费版。
  await page.goto('/companies/' + workspace.id + '/billing')
  await expect(page.getByTestId('billing-plan')).toHaveText('专业版')
  await expect(page.getByTestId('billing-usage-documents')).toBeVisible()
  await page.getByRole('button', { name: '切换到免费版' }).click()
  await expect(page.getByTestId('billing-plan')).toHaveText('免费版')
  await expect(page.getByTestId('billing-status')).toHaveText('已取消')

  // 免费版在网关拒绝未包含的模块，权益查询与套餐矩阵一致。
  const gated = await api(page, assistantSessions)
  expect(gated.status).toBe(403)
  expect(gated.text).toContain('module.not_in_plan')
  const gatedInventory = await api(page, inventoryWarehouses)
  expect(gatedInventory.status).toBe(403)
  expect(gatedInventory.text).toContain('module.not_in_plan')
  const free = await readEntitlements()
  expect(free.effectivePlanCode).toBe('free')
  expect(free.modules).not.toContain('sales')
  expect(free.modules).toContain('book')

  // 控制台隐藏免费版未包含的模块并展示当前套餐。
  await page.goto('/')
  await page.getByRole('button', { name: new RegExp(company) }).click()
  await expect(page.getByTestId('workspace-plan')).toHaveText('免费版')
  await expect(page.getByTestId('module-sales')).toHaveCount(0)
  await expect(page.getByTestId('module-book')).toBeVisible()

  // 免费版工作区配额为 1：已有工作区时新建第二个被拒绝。
  const blockedWorkspace = await write(page, '/bff/api/workspaces', 'POST', {
    operationId: crypto.randomUUID(), name: company + ' 二部',
  })
  expect(blockedWorkspace.status).toBe(409)

  // 免费版成员席位为 3：所有者 + 2 个待兑换邀请已满，第三个邀请被拒绝。
  const invite = async (email: string) => write(page, org + '/invitations', 'POST', {
    operationId: crypto.randomUUID(), expectedVersion: await version(), email, role: 'WorkspaceReader',
  })
  expect((await invite('seat1-' + stamp + '@example.com')).status).toBe(200)
  expect((await invite('seat2-' + stamp + '@example.com')).status).toBe(200)
  expect((await invite('seat3-' + stamp + '@example.com')).status).toBe(409)

  // 免费版每月 500 张单据：预留到上限后，订单写入在 BFF 入口被拒绝。
  const beforeDocuments = (await readEntitlements()).usage.documentsThisMonth
  let remaining = Math.max(0, 500 - beforeDocuments)
  while (remaining > 0) {
    const count = Math.min(100, remaining)
    const reserved = await write(page, billing + '/usage/documents', 'POST', { operationId: crypto.randomUUID(), count })
    expect(reserved.status).toBe(200)
    remaining -= count
  }
  expect((await write(page, billing + '/usage/documents', 'POST', { operationId: crypto.randomUUID(), count: 1 })).status).toBe(409)
  const blockedOrder = await write(page, salesOrders, 'POST', {
    operationId: crypto.randomUUID(), number: 'QUOTA-' + stamp, draft: {},
  })
  expect(blockedOrder.status).toBe(409)
  const blockedHeaderOrder = await write(page, salesOrders, 'POST', { number: 'QUOTA-HEADER-' + stamp, draft: {} },
    { 'Idempotency-Key': crypto.randomUUID() })
  expect(blockedHeaderOrder.status).toBe(409)

  // 登记线下付款升级到标准版：订阅激活、销售模块恢复，AI 助手仍属专业版。
  const upgradedResponse = await write(page, billing + '/subscription', 'POST', {
    planCode: 'standard', operationId: crypto.randomUUID(), paymentReference: 'BANK-' + stamp,
  })
  expect(upgradedResponse.status).toBe(200)
  const upgraded = JSON.parse(upgradedResponse.text) as {
    subscription: { planCode: string; status: string }; invoices: { status: string }[]
  }
  expect(upgraded.subscription.planCode).toBe('standard')
  expect(upgraded.subscription.status).toBe('active')
  expect(upgraded.invoices.some(invoice => invoice.status === 'paid')).toBe(true)
  const standardEntitlements = await readEntitlements()
  expect((await api(page, inventoryWarehouses)).status).toBe(200)
  expect((await api(page, assistantSessions)).status).toBe(403)
  expect(standardEntitlements.modules).toContain('sales')

  // 报价在确认前只读：按剩余周期折算并抵扣，订阅与账单保持不变。
  const beforeQuote = await readBilling()
  const quoteResponse = await api(page, billing + '/plan-quote?planCode=pro')
  expect(quoteResponse.status).toBe(200)
  const quote = JSON.parse(quoteResponse.text) as {
    planCode: string; currentPlanCode: string; prorated: boolean; chargeCents: number
    creditCents: number; amountDueCents: number; remainingDays: number; periodEndUtc: string
  }
  expect(quote.planCode).toBe('pro')
  expect(quote.currentPlanCode).toBe('standard')
  expect(quote.prorated).toBe(true)
  expect(quote.chargeCents).toBeGreaterThan(0)
  expect(quote.creditCents).toBeGreaterThan(0)
  expect(quote.amountDueCents).toBe(Math.max(0, quote.chargeCents - quote.creditCents))
  expect(quote.remainingDays).toBeGreaterThanOrEqual(1)
  expect(quote.remainingDays).toBeLessThanOrEqual(30)
  expect(new Date(quote.periodEndUtc).getTime()).toBeGreaterThan(Date.now())
  const afterQuote = await readBilling()
  expect(afterQuote.subscription.planCode).toBe('standard')
  expect(afterQuote.invoices.length).toBe(beforeQuote.invoices.length)

  // 取消后选择专业版进入试用并生成待支付账单；重复登记同一笔付款只记一次。
  expect((await write(page, billing + '/subscription/cancel', 'POST', { operationId: crypto.randomUUID() })).status).toBe(200)
  const trialResponse = await write(page, billing + '/subscription', 'POST', {
    planCode: 'pro', operationId: crypto.randomUUID(),
  })
  expect(trialResponse.status).toBe(200)
  const trial = JSON.parse(trialResponse.text) as {
    subscription: { status: string }; invoices: { id: string; status: string; planCode: string }[]
  }
  expect(trial.subscription.status).toBe('trial')
  const pending = trial.invoices.find(invoice => invoice.status === 'pending' && invoice.planCode === 'pro')
  expect(pending).toBeTruthy()
  const paymentOperation = crypto.randomUUID()
  const paidFirst = await write(page, billing + '/invoices/' + pending!.id + '/pay', 'POST', {
    operationId: paymentOperation, reference: 'BANK-' + stamp,
  })
  expect(paidFirst.status).toBe(200)
  const paidSecond = await write(page, billing + '/invoices/' + pending!.id + '/pay', 'POST', {
    operationId: paymentOperation, reference: 'BANK-' + stamp,
  })
  expect(paidSecond.status).toBe(200)
  const firstInvoices = (JSON.parse(paidFirst.text) as { invoices: { status: string }[] }).invoices
  const secondInvoices = (JSON.parse(paidSecond.text) as { invoices: { status: string }[] }).invoices
  expect(secondInvoices.length).toBe(firstInvoices.length)
  expect((await readBilling()).subscription.planCode).toBe('pro')
  expect((await api(page, assistantSessions)).status).toBe(200)

  // 同一计费账户下的第二个工作区共享权益；取消后同步降级，恢复专业版后恢复。
  const secondResponse = await write(page, '/bff/api/workspaces', 'POST', {
    operationId: crypto.randomUUID(), name: company + ' 二部',
  })
  expect(secondResponse.status).toBe(201)
  const second = JSON.parse(secondResponse.text) as { id: string }
  const secondSessions = '/bff/api/assistant/workspaces/' + second.id + '/sessions'
  expect((await api(page, secondSessions)).status).toBe(200)
  expect((await write(page, billing + '/subscription/cancel', 'POST', { operationId: crypto.randomUUID() })).status).toBe(200)
  expect((await api(page, secondSessions)).status).toBe(403)
  expect((await write(page, billing + '/subscription', 'POST', {
    planCode: 'pro', operationId: crypto.randomUUID(), paymentReference: 'RESTORE-' + stamp,
  })).status).toBe(200)
  expect((await api(page, secondSessions)).status).toBe(200)
})

test('Journal links connect posted entries, scan integrity and isolate workspaces', async ({ page, browser }) => {
  test.setTimeout(240_000)
  const checker = await browser.newContext({ baseURL: 'https://localhost:7443' })
  try {
    const reviewer = await checker.newPage()
    await Promise.all([login(page, 'bob'), login(reviewer, 'alice')])
    const name = `关联分录 ${Date.now()}`
    const post = (actor: Page, path: string, body: object) => write(actor, path, 'POST', { operationId: crypto.randomUUID(), ...body })
    const ok = async (promise: Promise<{ status: number; text: string }>, status = 200) => {
      const response = await promise
      expect(response.status, response.text).toBe(status)
      return JSON.parse(response.text)
    }
    const workspace = await ok(post(page, '/bff/api/workspaces', { name }), 201)
    const outside = await ok(post(page, '/bff/api/workspaces', { name: `关联隔离 ${Date.now()}` }), 201)
    const finance = `/bff/api/finance/workspaces/${workspace.id}`
    const root = `${finance}/ledger`
    const org = `/bff/api/workspaces/${workspace.id}`
    const settings = { baseCurrency: 'CNY', startsOn: '2026-01-01', fiscalYearStartMonth: 1 }
    const book = await ok(post(page, `${finance}/book`, settings))
    await ok(post(page, `/bff/api/finance/workspaces/${outside.id}/book`, settings))
    const idFor = (code: string) => book.accounts.find((x: { code: string }) => x.code === code).id as string
    const cash = idFor('1001')
    const equity = idFor('3001')
    const revenue = idFor('4001')
    const access = (actor: Page) => ok(api(actor, `${org}/access`))
    const invite = await ok(post(page, `${org}/invitations`, {
      expectedVersion: (await access(page)).authorizationVersion, email: 'alice@nexora.invalid', role: 'WorkspaceOwner',
    }))
    await ok(post(reviewer, `/bff/api/invitations/${invite.invitation.id}/redeem`, { token: invite.token }))
    const members = await ok(api(page, `${org}/members`)) as { id: string; email: string }[]
    const alice = members.find(x => x.email === 'alice@nexora.invalid')!.id
    const bob = members.find(x => x.email === 'bob@nexora.invalid')!.id
    const changeRole = async (actor: Page, member: string, action: string, role?: string) =>
      post(actor, `${org}/members/${member}/finance-role`, { expectedVersion: (await access(actor)).authorizationVersion, action, role })
    const grant = async (proposer: Page, approver: Page, member: string, role: string) => {
      await ok(changeRole(proposer, member, 'propose', role))
      await ok(changeRole(approver, member, 'approve'))
    }
    await ok(changeRole(page, bob, 'propose', 'Accountant'))
    await ok(changeRole(reviewer, bob, 'approve'))
    await grant(reviewer, page, alice, 'FinanceReviewer')

    const openBook = async (actor: Page) => {
      await actor.reload()
      await actor.getByRole('button', { name: new RegExp(name) }).click()
      await actor.getByTestId('module-book').click()
      await actor.getByRole('button', { name: '打开总账', exact: true }).click()
    }
    await openBook(reviewer)
    await reviewer.getByLabel('期间操作原因').fill('启用一月账簿')
    await reviewer.getByRole('button', { name: '开放期间', exact: true }).click()
    await expect(reviewer.getByRole('button', { name: '2026-01 · 开放' })).toBeVisible()

    const draft = (first: string, second: string, debit: number, memo: string) =>
      ({ on: '2026-01-01', memo, lines: [{ accountId: first, debit: String(debit), credit: '0' }, { accountId: second, debit: '0', credit: String(debit) }] })
    const create = (kind: string, sourceNumber: string, data: object) => post(page, `${root}/journals`, { kind, sourceNumber, draft: data })
    const decide = (actor: Page, id: string, expectedVersion: number, decision: string) =>
      post(actor, `${root}/journals/${id}/decision`, { expectedVersion, decision })
    const opening = await ok(create('opening', '', draft(cash, equity, 1000, '期初关联样例')))
    const manual = await ok(create('manual', 'LNK-01', draft(cash, revenue, 500, '关联手工凭证')))
    await ok(decide(page, opening.id, 1, 'submit'))
    await ok(decide(page, manual.id, 1, 'submit'))
    await ok(decide(reviewer, opening.id, 2, 'post'))
    await ok(decide(reviewer, manual.id, 2, 'post'))

    const draftOnly = await ok(create('manual', 'LNK-DRAFT', draft(cash, revenue, 100, '未过账凭证')))
    expect((await post(page, `${root}/links`, { fromJournalId: opening.id, toJournalId: draftOnly.id, kind: 'related', memo: '未过账' })).status).toBe(409)
    expect((await post(page, `${root}/links`, { fromJournalId: opening.id, toJournalId: opening.id, kind: 'related', memo: '自链' })).status).toBe(409)
    expect((await post(page, `${root}/links`, { fromJournalId: opening.id, toJournalId: manual.id, kind: 'unknown', memo: '未知' })).status).toBe(400)
    expect(await ok(api(page, `/bff/api/finance/workspaces/${outside.id}/ledger/links`))).toEqual([])
    expect((await post(reviewer, `/bff/api/finance/workspaces/${outside.id}/ledger/links`, {
      fromJournalId: opening.id, toJournalId: manual.id, kind: 'related', memo: '跨区',
    })).status).toBe(404)

    await openBook(page)
    await page.getByTestId('link-from').click()
    await page.getByRole('option', { name: /期初关联样例/ }).click()
    await page.getByTestId('link-to').click()
    await page.getByRole('option', { name: /关联手工凭证/ }).click()
    await page.getByTestId('link-kind').click()
    await page.getByRole('option', { name: '调整', exact: true }).click()
    await page.getByTestId('link-memo').fill('期末调整关联')
    await page.getByTestId('link-create').click()
    await expect(page.getByText('关联分录已建立。', { exact: true })).toBeVisible()
    await expect(page.getByTestId('link-list')).toContainText('期末调整关联')
    const links = await ok(api(page, `${root}/links`)) as { fromJournalId: string; toJournalId: string; kind: string; memo: string }[]
    expect(links.length).toBe(1)
    expect(links[0]).toMatchObject({ fromJournalId: opening.id, toJournalId: manual.id, kind: 'adjustment', memo: '期末调整关联' })
    expect((await post(page, `${root}/links`, { fromJournalId: opening.id, toJournalId: manual.id, kind: 'adjustment', memo: '重复' })).status).toBe(409)

    const scan = await ok(api(page, `${root}/links/scan`))
    expect(scan).toMatchObject({ linkCount: 1, journalCount: 3, issues: [] })
    await page.getByTestId('link-scan').click()
    await expect(page.getByTestId('link-scan-clean')).toBeVisible()

    await page.getByTestId('link-delete').click()
    await expect(page.getByText('关联分录已解除。', { exact: true })).toBeVisible()
    await expect(page.getByTestId('link-empty')).toBeVisible()
    expect(await ok(api(page, `${root}/links`))).toEqual([])
    const after = await ok(api(page, `${root}/links/scan`))
    expect(after.linkCount).toBe(0)
    expect(after.issues).toEqual([])
  } finally {
    await checker.close()
  }
})

test('Record changes capture cross-service snapshots, filter, export and isolate workspaces', async ({ page }) => {
  test.setTimeout(180_000)
  const stamp = Date.now()
  const company = '变更审计商贸 ' + stamp
  await login(page, 'bob')
  const created = await write(page, '/bff/api/workspaces', 'POST', { operationId: crypto.randomUUID(), name: company })
  expect(created.status).toBe(201)
  const workspace = JSON.parse(created.text) as { id: string }
  const today = new Date().toISOString().slice(0, 10)
  const settings = await write(page, '/bff/api/workspaces/' + workspace.id + '/settings', 'PUT', {
    expectedVersion: 0,
    presentation: {
      legalName: company, brandName: company, accentColor: '#274580', dateFormat: 'yyyy-MM-dd',
      timeZone: 'Asia/Shanghai', logoDataUrl: null,
    },
  })
  expect(settings.status).toBe(200)
  const book = await write(page, '/bff/api/finance/workspaces/' + workspace.id + '/book', 'POST', {
    operationId: crypto.randomUUID(), baseCurrency: 'CNY', startsOn: today, fiscalYearStartMonth: 1,
  })
  expect(book.status).toBe(200)
  const tax = await write(page, '/bff/api/finance/workspaces/' + workspace.id + '/tax/rates', 'POST', {
    operationId: crypto.randomUUID(), code: 'VAT13', name: '增值税 13%', effectiveOn: today, rate: '0.13',
  })
  expect(tax.status).toBe(200)

  interface ChangeView {
    id: string
    service: string
    entityName: string
    entityId: string
    operation: string
    workspaceId: string
    actorIssuer: string
    actorSubject: string
    occurredAtUtc: string
    changedProperties: string | null
    beforeJson: string | null
    afterJson: string | null
  }
  interface ChangePage {
    changes: ChangeView[]
    hasMore: boolean
    retentionDays: number
  }
  async function changes(path: string) {
    const response = await api(page, path)
    expect(response.status).toBe(200)
    return JSON.parse(response.text) as ChangePage
  }

  const revised = await write(page, '/bff/api/workspaces/' + workspace.id + '/settings', 'PUT', {
    expectedVersion: 1,
    presentation: {
      legalName: company, brandName: company + ' 二版', accentColor: '#274580', dateFormat: 'yyyy-MM-dd',
      timeZone: 'Asia/Shanghai', logoDataUrl: null,
    },
  })
  expect(revised.status).toBe(200)
  const organization = await changes('/bff/api/workspaces/' + workspace.id + '/record-changes')
  expect(organization.retentionDays).toBe(730)
  expect(organization.changes.some(change => change.service === 'organization'
    && change.entityName === 'Workspace' && change.operation === 'created')).toBe(true)
  expect(organization.changes.every(change => change.workspaceId === workspace.id)).toBe(true)
  const updated = await changes('/bff/api/workspaces/' + workspace.id + '/record-changes?operation=updated')
  expect(updated.changes.length).toBeGreaterThan(0)
  expect(updated.changes.every(change => change.operation === 'updated')).toBe(true)
  expect(updated.changes.some(change => (change.changedProperties ?? '').length > 0)).toBe(true)

  const finance = await changes('/bff/api/finance/workspaces/' + workspace.id + '/record-changes?operation=created')
  expect(finance.changes.length).toBeGreaterThan(0)
  expect(finance.changes.every(change => change.service === 'finance')).toBe(true)
  expect(finance.changes.some(change => /Book|Tax/i.test(change.entityName))).toBe(true)
  expect(finance.changes.every(change => change.actorSubject.length > 0)).toBe(true)

  const csv = await api(page, '/bff/api/finance/workspaces/' + workspace.id + '/record-changes.csv')
  expect(csv.status).toBe(200)
  expect(csv.text.startsWith('occurredAtUtc,service,entityName,entityId,operation,actorIssuer,actorSubject,changedProperties,beforeJson,afterJson')).toBe(true)
  expect(csv.text).toContain(',finance,')
  expect(csv.text).toContain('created')

  await page.goto('/')
  await page.getByRole('button', { name: new RegExp(company) }).click()
  await page.getByTestId('module-audit').click()
  await page.getByTestId('audit-tab-changes').click()
  await expect(page.getByRole('heading', { name: '记录变更' })).toBeVisible()
  await expect(page.getByTestId('record-change-list')).toBeVisible()
  await page.getByLabel('来源').click()
  await page.getByRole('option', { name: '财务', exact: true }).click()
  await page.getByRole('button', { name: '查询记录变更' }).click()
  await expect(page.getByRole('cell', { name: '财务', exact: true }).first()).toBeVisible()
  await expect(page.getByRole('cell', { name: '创建', exact: true }).first()).toBeVisible()
  await page.getByRole('button', { name: '展开' }).first().click()
  await expect(page.getByText('变更前', { exact: true })).toBeVisible()
  await expect(page.getByText('变更后', { exact: true })).toBeVisible()

  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: '导出记录变更 CSV' }).click()
  await expect(page.getByText('已导出记录变更 CSV。', { exact: true })).toBeVisible()
  const file = await download
  expect(file.suggestedFilename()).toMatch(/^记录变更-\d{8}-\d{4}\.csv$/)
  const exported = readFileSync(await file.path(), 'utf8')
  expect(exported.startsWith('\uFEFF')).toBe(true)
  expect(exported).toContain('"时间","来源","实体"')

  const second = await write(page, '/bff/api/workspaces', 'POST', { operationId: crypto.randomUUID(), name: '隔离变更商贸 ' + stamp })
  expect(second.status).toBe(201)
  const secondId = (JSON.parse(second.text) as { id: string }).id
  const isolated = await changes('/bff/api/workspaces/' + secondId + '/record-changes')
  expect(isolated.changes.every(change => change.workspaceId === secondId)).toBe(true)
  const firstIds = new Set(organization.changes.map(change => change.id))
  expect(isolated.changes.some(change => firstIds.has(change.id))).toBe(false)
  expect([403, 404]).toContain((await api(page, '/bff/api/workspaces/' + crypto.randomUUID() + '/record-changes')).status)
})

test('Effective session policy follows the shortest workspace idle timeout', async ({ page }) => {
  await login(page, 'bob')
  const name = '会话策略商贸 ' + Date.now()
  const created = await write(page, '/bff/api/workspaces', 'POST',
    { operationId: crypto.randomUUID(), name })
  expect(created.status).toBe(201)
  const workspaceId = (JSON.parse(created.text) as { id: string }).id
  const settingsPath = '/bff/api/workspaces/' + workspaceId + '/settings'
  const loaded = await api(page, settingsPath)
  expect(loaded.status).toBe(200)
  const settings = JSON.parse(loaded.text) as { version: number, presentation: object }
  const saved = await write(page, settingsPath, 'PUT', {
    expectedVersion: settings.version,
    presentation: settings.presentation,
    sessionIdleMinutes: 2,
  })
  expect(saved.status).toBe(200)
  expect((JSON.parse(saved.text) as { sessionIdleMinutes: number }).sessionIdleMinutes).toBe(2)
  try {
    await expect.poll(async () => {
      const response = await api(page, '/bff/session-policy?refresh=1')
      if (response.status !== 200) return -1
      return (JSON.parse(response.text) as { idleTimeoutMinutes: number }).idleTimeoutMinutes
    }, { timeout: 15_000 }).toBe(2)
    const policy = JSON.parse((await api(page, '/bff/session-policy?refresh=1')).text) as {
      idleTimeoutMinutes: number
      sources: { workspaceId: string, workspaceName: string, idleTimeoutMinutes: number }[]
    }
    expect(policy.sources).toContainEqual({ workspaceId, workspaceName: name, idleTimeoutMinutes: 2 })
  } finally {
    const revised = await write(page, settingsPath, 'PUT', {
      expectedVersion: (JSON.parse(saved.text) as { version: number }).version,
      presentation: (JSON.parse(saved.text) as { presentation: object }).presentation,
      sessionIdleMinutes: 30,
    })
    expect(revised.status).toBe(200)
  }
})




import assert from 'node:assert/strict'
import { createHmac, randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// Uses the existing browser test dependency; the dashboard has no runtime dependency on nexora-web.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const { chromium, expect } = createRequire(resolve(root, 'src/Web/nexora-web/package.json'))('@playwright/test')
const origin = 'https://localhost:7443'
const runtime = resolve(root, 'artifacts/p1/runtime')
const output = resolve(root, 'artifacts/dashboard-d0')
mkdirSync(output, { recursive: true })
const realm = JSON.parse(readFileSync(resolve(runtime, 'keycloak/nexora-realm.json'), 'utf8'))
const seedFile = resolve(runtime, 'browser-otp.json')
const seeds = existsSync(seedFile) ? JSON.parse(readFileSync(seedFile, 'utf8')) : {}
const resume = process.argv.includes('--resume-validation')
const previous = resume ? JSON.parse(readFileSync(resolve(output, 'workspace.json'), 'utf8')) : null
const run = previous?.run ?? new Date().toISOString().replace(/\D/g, '').slice(0, 14)
const report = previous ?? { run, origin, createdAtUtc: new Date().toISOString(), checks: [], responses: [] }
if (report.failure) {
  report.previousFailures = [...(report.previousFailures ?? []), report.failure]
  delete report.failure
}
const save = () => {
  const json = JSON.stringify(report, null, 2)
  writeFileSync(resolve(output, `workspace-${run}.json`), json)
  writeFileSync(resolve(output, 'workspace.json'), json)
}
const check = (name, actual, expected) => {
  report.checks.push({ name, actual, expected, passed: actual === expected })
  save()
  assert.equal(actual, expected, name)
}

async function freshTotp(username, secret) {
  const key = `${username}:lastCounter`
  while (Number(seeds[key] ?? 0) >= Math.floor(Date.now() / 30000) || 30000 - Date.now() % 30000 < 2500)
    await new Promise(resolveWait => setTimeout(resolveWait, 250))
  const counter = Buffer.alloc(8)
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)))
  const digest = createHmac('sha1', Buffer.from(secret, 'utf8')).update(counter).digest()
  const offset = digest[digest.length - 1] & 15
  seeds[key] = String(Math.floor(Date.now() / 30000))
  writeFileSync(seedFile, JSON.stringify(seeds))
  return String((digest.readUInt32BE(offset) & 0x7fffffff) % 1000000).padStart(6, '0')
}

async function login(page, username) {
  const user = realm.users.find(item => item.username === username)
  assert.ok(user, 'Expected a local demo identity')
  await page.goto(origin + '/bff/login')
  await page.locator('#username').fill(username)
  await page.locator('#password').fill(user.credentials[0].value)
  await page.locator('#kc-login').click()
  const enrollment = page.locator('input[name="totpSecret"]')
  const challenge = page.locator('input[name="otp"]')
  await expect(enrollment.or(challenge)).toHaveCount(1)
  if (await enrollment.count()) {
    seeds[username] = await enrollment.inputValue()
    await page.locator('input[name="totp"]').fill(await freshTotp(username, seeds[username]))
    await page.locator('input[name="userLabel"]').fill('Dashboard D0 local baseline')
    await page.locator('input[type="submit"], button[type="submit"]').last().click()
  } else {
    assert.ok(seeds[username], 'Existing local MFA seed is required')
    await challenge.fill(await freshTotp(username, seeds[username]))
    await page.locator('#kc-login').click()
  }
  await page.waitForURL(url => url.origin === origin || url.searchParams.get('execution') === 'VERIFY_PROFILE')
  if (new URL(page.url()).searchParams.get('execution') === 'VERIFY_PROFILE') {
    await page.locator('input[name="firstName"]').fill(username)
    await page.locator('input[name="lastName"]').fill('LocalDemo')
    await page.getByRole('button', { name: 'Submit', exact: true }).click()
  }
  await page.waitForURL(origin + '/')
}

async function register(page, email, returning = false) {
  assert.ok(email.endsWith('@example.invalid'), 'Only captured local test mail is allowed')
  await page.goto(origin + (returning ? '/bff/email-login' : '/bff/register'))
  const form = page.locator('#otp-form')
  await form.getByLabel('邮箱', { exact: true }).fill(email)
  const sentAfter = Date.now() - 1000
  await form.getByRole('button', { name: '发送验证码', exact: true }).click()
  let code
  await expect.poll(async () => {
    const response = await fetch('http://localhost:8025/api/v1/search?query=' + encodeURIComponent('to:' + email))
    const mailbox = await response.json()
    for (const mail of mailbox.messages ?? []) {
      if (Date.parse(mail.Created) < sentAfter) continue
      const detail = await (await fetch('http://localhost:8025/api/v1/message/' + mail.ID)).json()
      code = /\bCode:\s*([0-9]{6})\b/.exec([detail.Text, detail.HTML].join('\n'))?.[1]
      if (code) return true
    }
    return false
  }, { timeout: 35000 }).toBe(true)
  await form.getByLabel('六位验证码').fill(code)
  await form.getByRole('button', { name: '验证', exact: true }).click()
  await page.waitForURL(origin + '/')
}

async function request(page, path, method = 'GET', body, expected = 200, headers = {}) {
  assert.ok(path.startsWith('/bff/'), 'Use the existing same-origin BFF')
  const result = await page.evaluate(async ({ path, method, body, headers }) => {
    if (method !== 'GET') {
      const csrf = await fetch('/bff/antiforgery')
      if (!csrf.ok) throw new Error('Antiforgery request failed: ' + csrf.status)
      headers['X-CSRF-TOKEN'] = (await csrf.json()).requestToken
      headers['Content-Type'] = 'application/json'
    }
    const response = await fetch(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
    const text = await response.text()
    return { status: response.status, text, contentType: response.headers.get('content-type'),
      etag: response.headers.get('etag'), location: response.headers.get('location'), requestHeaders: Object.keys(headers) }
  }, { path, method, body, headers })
  const value = result.text ? JSON.parse(result.text) : null
  report.responses.push({ method, path, status: result.status, contentType: result.contentType,
    etag: result.etag, location: result.location, requestHeaders: result.requestHeaders,
    requestFields: Object.keys(body ?? {}), expectedStatus: expected,
    fields: Array.isArray(value) ? ['array'] : Object.keys(value ?? {}) })
  save()
  assert.equal(result.status, expected, `${method} ${path}: ${value?.code ?? value?.data?.code ?? result.status}`)
  return value
}
const post = (page, path, body, status = 200) => request(page, path, 'POST', { operationId: randomUUID(), ...body }, status)

const browser = await chromium.launch({ channel: 'msedge', headless: true })
try {
  const actors = {}
  for (const name of ['alice', 'bob', 'receiver', 'reader']) {
    const context = await browser.newContext({ baseURL: origin })
    actors[name] = await context.newPage()
  }
  await login(actors.alice, 'alice')
  await login(actors.bob, 'bob')
  const emails = { receiver: `dashboard-d0-receiver-${run}@example.invalid`, reader: `dashboard-d0-reader-${run}@example.invalid` }
  for (const name of ['receiver', 'reader']) await register(actors[name], emails[name], resume)
  const maker = actors.alice, reviewer = actors.bob
  const workspace = previous?.workspace ?? await post(maker, '/bff/api/workspaces', { name: 'Nexora Dashboard D0 ' + run }, 201)
  report.workspace = workspace
  save()
  const org = '/bff/api/workspaces/' + workspace.id
  const finance = '/bff/api/finance/workspaces/' + workspace.id
  const master = '/bff/api/masterdata/workspaces/' + workspace.id
  const inventory = '/bff/api/inventory/workspaces/' + workspace.id
  const version = async () => (await request(maker, org + '/access')).authorizationVersion
  const member = email => report.members.find(item => item.email === email).id
  if (!resume) {
    for (const [name, email, role] of [['bob', 'bob@nexora.invalid', 'WorkspaceOwner'], ['receiver', emails.receiver, 'WorkspaceReader'], ['reader', emails.reader, 'WorkspaceReader']]) {
      const invite = await post(maker, org + '/invitations', { expectedVersion: await version(), email, role }, 201)
      await post(actors[name], '/bff/api/invitations/' + invite.invitation.id + '/redeem', { token: invite.token })
    }
    report.members = await request(maker, org + '/members')
    for (const [name, area, role] of [['alice', 'purchase', 'PurchasingOperator'], ['bob', 'purchase', 'PurchasingApprover'],
      ['alice', 'sales', 'SalesOperator'], ['bob', 'sales', 'SalesApprover'], ['alice', 'finance', 'Accountant'], ['bob', 'finance', 'FinanceReviewer']]) {
      const id = member(name + '@nexora.invalid')
      const proposer = actors[name]
      const approver = name === 'alice' ? reviewer : maker
      await post(proposer, `${org}/members/${id}/${area}-role`, { expectedVersion: await version(), action: 'propose', role })
      await post(approver, `${org}/members/${id}/${area}-role`, { expectedVersion: await version(), action: 'approve' })
    }
    report.department = await post(maker, org + '/departments', { expectedVersion: await version(), name: 'D0 商贸联调部门' })
    report.book = await post(maker, finance + '/book', { baseCurrency: 'CNY', startsOn: '2026-01-01', fiscalYearStartMonth: 1 })
    await post(reviewer, finance + '/ledger/periods/2026-01-01', { expectedVersion: 0, action: 'open', reason: 'D0 专用联调期间' })
    const account = async (code, category, purpose = 'posting') => {
      const chart = await request(maker, finance + '/chart')
      await post(maker, finance + '/chart/accounts', { expectedRevision: chart.revision, account: { code, name: 'D0 ' + code, category, purpose } })
      return (await request(maker, finance + '/chart')).accounts.find(row => row.code === code).id
    }
    const tradeAccounts = {
      inventoryAccountId: await account('D0-INV', 'asset', 'control'), accrualAccountId: await account('D0-GRNI', 'liability', 'control'),
      payableAccountId: await account('D0-AP', 'liability', 'control'), inputTaxAccountId: await account('D0-INPUT', 'asset'),
      varianceAccountId: await account('D0-VAR', 'expense'), donationIncomeAccountId: await account('D0-DON', 'income')
    }
    const receivableAccounts = {
      receivableAccountId: await account('D0-AR', 'asset', 'control'), advanceAccountId: await account('D0-ADV', 'liability', 'control'),
      revenueAccountId: await account('D0-REV', 'income'), outputTaxAccountId: await account('D0-VAT', 'liability', 'control'),
      costOfGoodsAccountId: await account('D0-COGS', 'expense')
    }
    await post(maker, finance + '/trade/setup', { accounts: tradeAccounts })
    await post(maker, finance + '/receivables/setup', { accounts: receivableAccounts })
    report.bank = await post(maker, finance + '/trade/banks', { code: 'D0-BANK', name: 'D0 联调银行', kind: 'bank', accountId: await account('D0-BANK-CTL', 'asset', 'control') }, 201)
    report.accountMappings = { tradeAccounts, receivableAccounts }
    report.warehouse = await post(maker, inventory + '/warehouses', { code: 'D0-MAIN', name: 'D0 联调主仓' }, 201)
    const warehousePath = inventory + '/warehouses/' + report.warehouse.id
    const warehouse = await request(maker, warehousePath)
    await request(maker, warehousePath + '/receiver', 'PUT', { operationId: randomUUID(), expectedVersion: warehouse.version, memberId: member(emails.receiver) })
    const role = await post(maker, org + '/custom-roles', { expectedVersion: await version(), roleId: null, name: 'D0 主仓只读', permissions: ['inventory.stock.read'] })
    for (const name of ['receiver', 'reader']) {
      const grant = await post(maker, org + '/role-grants', { expectedVersion: await version(), memberId: member(emails[name]),
        roleId: role.id, roleRevision: role.revision, scope: 'warehouse', scopeId: warehouse.id, startsOn: null, endsOn: null })
      await post(reviewer, `${org}/role-grants/${grant.id}`, { expectedVersion: await version(), action: 'approve' })
    }
    const category = await post(maker, master + '/definitions', { kind: 'category', code: 'D0-GOODS', name: 'D0 商贸商品' }, 201)
    const unit = await post(maker, master + '/definitions', { kind: 'unit', code: 'D0-PCS', name: '件' }, 201)
    report.product = await post(maker, master + '/items', { code: 'D0-SKU-001', name: 'D0 商贸库存件', kind: 'product', tracksInventory: true, categoryId: category.id, unitId: unit.id }, 201)
    report.supplier = await post(maker, master + '/partners', { code: 'D0-SUP', profile: { name: 'D0 联调供应商', roles: ['supplier'], contacts: [] } }, 201)
    report.customer = await post(maker, master + '/partners', { code: 'D0-CUS', profile: { name: 'D0 联调客户', roles: ['customer'], contacts: [] } }, 201)
    await post(maker, finance + '/tax/rates', { code: 'D0-SAMPLE', name: 'D0 样例税率', effectiveOn: '2026-01-01', rate: '0.13' })
    await post(maker, finance + '/tax/groups', { code: 'D0-TAX', name: 'D0 样例税组', expectedVersion: 0, rateCodes: ['D0-SAMPLE'] })
    report.entitlements = await request(maker, org + '/billing/entitlements')
  }
  const warehousePath = inventory + '/warehouses/' + report.warehouse.id
  for (const name of ['alice', 'bob', 'receiver', 'reader']) {
    report[name] = { email: emails[name] ?? name + '@nexora.invalid', access: await request(actors[name], org + '/access') }
    await request(actors[name], '/bff/me')
  }
  const forbidden = report.isolatedWorkspace ?? await post(maker, '/bff/api/workspaces', { name: 'Nexora Dashboard D0 isolation ' + run }, 201)
  report.isolatedWorkspace = forbidden
  await request(reviewer, '/bff/api/workspaces/' + forbidden.id, 'GET', undefined, 404)
  await request(actors.reader, master + '/partners', 'POST', { operationId: randomUUID(), code: 'FORBIDDEN',
    profile: { name: '只读禁止写入', roles: ['customer'], contacts: [] } }, 403)
  report.catalog = await request(maker, master + '/catalog?pageSize=1')
  report.productDetail = await request(maker, master + '/items/' + report.product.id)
  report.purchaseList = await request(maker, '/bff/api/purchasing/workspaces/' + workspace.id + '/orders')
  report.salesList = await request(maker, '/bff/api/sales/workspaces/' + workspace.id + '/orders')
  await request(actors.receiver, warehousePath + '/receipts')
  await request(actors.reader, warehousePath + '/positions')
  for (const name of ['alice', 'bob', 'receiver', 'reader']) {
    const visible = await request(actors[name], '/bff/api/workspaces')
    check(name + ' sees the D0 workspace', visible.some(item => item.id === workspace.id), true)
    if (name !== 'alice') check(name + ' cannot see the isolated workspace', visible.some(item => item.id === forbidden.id), false)
  }
  check('Receiver can execute warehouse work', (await request(actors.receiver, warehousePath)).canReceive, true)
  check('Reader cannot execute warehouse work', (await request(actors.reader, warehousePath)).canReceive, false)
  report.warehouse = await request(maker, warehousePath)
  report.grants = await request(maker, org + '/role-grants')
  report.finance = { trade: await request(maker, finance + '/trade'), receivables: await request(maker, finance + '/receivables'),
    ledger: await request(reviewer, finance + '/ledger'), baseline: { authorizationScope: 'company',
      openPeriod: ['2026-01-01', '2026-01-31'], departmentId: report.department.id } }
  check('Warehouse receiver assignment', report.warehouse.receiverMemberId ?? report.warehouse.receiverId, member(emails.receiver))
  report.completedAtUtc = new Date().toISOString()
  save()
  console.log(`D0 fixture ready: ${workspace.id}; ${report.checks.length} checks passed; ${report.responses.length} BFF responses captured.`)
} catch (error) {
  report.failure = { message: error.message, atUtc: new Date().toISOString() }
  save()
  throw error
} finally {
  await browser.close()
}

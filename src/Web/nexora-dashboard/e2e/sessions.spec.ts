import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { api, baseline, emailLogin, login, logout, write } from './helpers'

test('两个真实会话通过 BFF 隔离资源', async ({ browser, page }) => {
  await login(page)
  expect((await api(page, `/bff/api/workspaces/${baseline.workspace.id}/access`)).status).toBe(200)
  const second = await browser.newContext({ baseURL: 'https://localhost:7444' })
  try {
    const bob = await second.newPage()
    await login(bob, 'bob')
    expect((await api(bob, `/bff/api/workspaces/${baseline.isolatedWorkspace.id}`)).status).toBe(404)
    expect((await api(bob, `/bff/api/masterdata/workspaces/${baseline.isolatedWorkspace.id}/items/${baseline.product.id}`)).status).toBe(404)
    expect((await api(bob, `/bff/api/workspaces/${baseline.workspace.id}/access`)).status).toBe(200)
  } finally { await second.close() }
})

test('邮箱登录与只读拒绝', async ({ page }) => {
  await emailLogin(page, baseline.reader.email)
  const id = baseline.workspace.id
  const item = `/bff/api/masterdata/workspaces/${id}/items/${baseline.product.id}`
  const before = await api(page, item)
  expect(before.status).toBe(200)
  const data = JSON.parse(before.text)
  expect((await write(page, item, 'PUT', { name: 'must not change', categoryId: data.categoryId, isActive: true, operationId: randomUUID() }, { 'If-Match': before.headers.etag! })).status).toBe(403)
  expect(JSON.parse((await api(page, item)).text).version).toBe(data.version)
  expect((await api(page, `/bff/api/workspaces/${baseline.isolatedWorkspace.id}`)).status).toBe(404)
  await logout(page)
})

test('新邮箱注册的独立账户配额拒绝均不写订单', async ({ browser, page }) => {
  await emailLogin(page, `dashboard-d12-quota-${Date.now()}@example.invalid`, true)
  const made = await write(page, '/bff/api/workspaces', 'POST', { name: 'D12 quota isolated owner', operationId: randomUUID() })
  expect(made.status, made.text).toBe(201)
  const workspace = JSON.parse(made.text)
  const org = `/bff/api/workspaces/${workspace.id}`
  const reviewerContext = await browser.newContext({ baseURL: 'https://localhost:7444' })
  const operatorContext = await browser.newContext({ baseURL: 'https://localhost:7444' })
  try {
    const operator = await operatorContext.newPage()
    const reviewer = await reviewerContext.newPage()
    await login(operator, 'alice')
    await login(reviewer, 'bob')
    const version = async () => JSON.parse((await api(page, org + '/access')).text).authorizationVersion
    for (const [email, actor] of [['alice@nexora.invalid', operator], ['bob@nexora.invalid', reviewer]] as const) {
      const invite = await write(page, org + '/invitations', 'POST', { expectedVersion: await version(), email, role: 'WorkspaceOwner', operationId: randomUUID() })
      expect(invite.status, invite.text).toBe(201)
      const invitation = JSON.parse(invite.text)
      expect((await write(actor, '/bff/api/invitations/' + invitation.invitation.id + '/redeem', 'POST', { token: invitation.token, operationId: randomUUID() })).status).toBe(200)
    }
    const memberId = JSON.parse((await api(operator, org + '/access')).text).memberId
    for (const [area, role] of [['sales', 'SalesOperator'], ['purchase', 'PurchasingOperator']]) {
      const path = `${org}/members/${memberId}/${area}-role`
      expect((await write(operator, path, 'POST', { expectedVersion: await version(), action: 'propose', role, operationId: randomUUID() })).status).toBe(200)
      expect((await write(reviewer, path, 'POST', { expectedVersion: await version(), action: 'approve', operationId: randomUUID() })).status).toBe(200)
    }
    const beforeOrders: Record<string, unknown> = {}
    for (const area of ['sales', 'purchasing']) {
      const response = await api(operator, `/bff/api/${area}/workspaces/${workspace.id}/orders`)
      expect(response.status, response.text).toBe(200)
      beforeOrders[area] = JSON.parse(response.text).orders
    }
    expect((await write(page, org + '/billing/subscription', 'POST', { planCode: 'free', operationId: randomUUID() })).status).toBe(200)
    let usage: { documentsThisMonth: number, documentsLimit: number }
    // This owner was just registered; no other person's subscription is changed.
    const billing = JSON.parse((await api(page, org + '/billing')).text)
    expect(billing.subscription.planCode).toBe('free')
    for (let index = 0; index < 5; index++) {
      const reserve = await write(page, org + '/billing/usage/documents', 'POST', { operationId: randomUUID(), count: 100 })
      expect(reserve.status, reserve.text).toBe(200)
      usage = JSON.parse(reserve.text)
    }
    expect(usage!.documentsThisMonth).toBe(500)
    for (const area of ['sales', 'purchasing']) {
      const path = `/bff/api/${area}/workspaces/${workspace.id}/orders`
      const operationId = randomUUID()
      const rejected = await write(operator, path, 'POST', { number: 'D12-REJECT', operationId }, { 'Idempotency-Key': operationId })
      expect(rejected.status, rejected.text).toBe(409)
      expect(JSON.parse(rejected.text).code).toBe('billing.quota_exceeded')
    }
    expect((await write(page, org + '/billing/subscription', 'POST', { planCode: 'pro', paymentReference: 'D12 local verification', operationId: randomUUID() })).status).toBe(200)
    for (const area of ['sales', 'purchasing']) {
      const after = await api(operator, `/bff/api/${area}/workspaces/${workspace.id}/orders`)
      expect(after.status).toBe(200)
      expect(JSON.parse(after.text).orders).toEqual(beforeOrders[area])
    }
  } finally {
    await operatorContext.close()
    await reviewerContext.close()
  }
})

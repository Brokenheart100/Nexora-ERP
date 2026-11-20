import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { api, baseline, login, logout, repository, write } from './helpers'
import { legacyWebEnabled } from './runtime'

test('新版 HTTPS 跳转、模拟预览及可选原版 BFF 入口', async ({ page }) => {
  await page.goto('http://localhost:3002/?entry=aspire#workspace', { waitUntil: 'domcontentloaded' })
  await expect(page).toHaveURL('https://localhost:7444/?entry=aspire#workspace')
  await expect(page.getByTestId('dashboard-search-button')).toBeVisible()
  await page.goto('http://localhost:3001/', { waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('dashboard-search-button')).toBeVisible()
  for (const output of ['.output', '.output-live']) expect(existsSync(resolve(repository, `src/Web/nexora-dashboard/${output}/server/index.mjs`)), 'Development startup must preserve production output.').toBe(true)
  if (legacyWebEnabled()) {
    await page.goto('https://localhost:7443/', { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('link', { name: '登录 Nexora', exact: true })).toBeVisible()
    expect((await api(page, '/bff/me')).status).toBe(401)
  } else {
    const response = page.waitForResponse(response => response.url() === 'https://localhost:7443/' && response.request().isNavigationRequest())
    await page.goto('https://localhost:7443/', { waitUntil: 'domcontentloaded' }).catch((error: Error) => {
      if (!error.message.includes('net::ERR_HTTP_RESPONSE_CODE_FAILURE')) throw error
    })
    // Without a public frontend route, the gateway's authentication fallback challenges the document.
    expect((await response).status()).toBe(401)
  }
})

test('独立 BFF 登录、CSRF、契约头及并发冲突', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('dashboard-search-button')).toBeVisible()
  expect((await api(page, '/bff/me')).status).toBe(401)
  for (const path of ['/alive', '/health', '/bff/status', '/bff/version']) expect((await api(page, path)).status, path).toBe(200)
  expect((await api(page, '/signin-oidc?state=invalid')).status).toBe(400)
  await login(page)
  const cookie = (await page.context().cookies()).find(item => item.name === '__Host-NexoraDashboard.Session')!
  expect(cookie).toMatchObject({ httpOnly: true, secure: true, path: '/', sameSite: 'Lax' })
  expect(cookie.value).toMatch(/^[\w-]{43}$/)
  expect((await api(page, '/api/workspaces')).status).toBe(401)
  expect((await api(page, '/bff/api/unpublished')).status).toBe(404)
  expect((await api(page, '/bff/api/workspaces', 'DELETE')).status).toBe(404)
  expect((await api(page, '/bff/api/workspaces', 'POST', {})).status).toBe(400)
  const base = `/bff/api/masterdata/workspaces/${baseline.workspace.id}`
  const path = `${base}/items/${baseline.product.id}`
  const item = await api(page, path)
  expect(item.status, item.text).toBe(200)
  const old = JSON.parse(item.text)
  const payload = { name: old.name, categoryId: old.categoryId, isActive: old.isActive, operationId: randomUUID() }
  const first = await write(page, path, 'PUT', payload, { 'If-Match': item.headers.etag!, 'Idempotency-Key': payload.operationId })
  expect(first.status, first.text).toBe(200)
  const duplicate = await write(page, path, 'PUT', payload, { 'If-Match': item.headers.etag!, 'Idempotency-Key': payload.operationId })
  expect(duplicate.text).toBe(first.text)
  expect((await write(page, path, 'PUT', { ...payload, name: old.name + ' conflict' }, { 'Idempotency-Key': payload.operationId, 'If-Match': item.headers.etag! })).status).toBe(409)
  expect((await write(page, path, 'PUT', { ...payload, operationId: randomUUID() }, { 'If-Match': item.headers.etag! })).status).toBe(412)
  expect((await write(page, path, 'PUT', { ...payload, operationId: randomUUID(), expectedVersion: old.version })).status).toBe(409)
  await logout(page)
  expect((await api(page, '/bff/me')).status).toBe(401)
})

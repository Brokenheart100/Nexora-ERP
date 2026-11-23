import { randomUUID } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { api, baseline, completePasswordLogin, emailLogin, write } from './helpers'
import type { WireItem } from '../shared/types/wire'
import { createApiClient, ResultUnknownError } from '../app/utils/api/client'
import { RequestScope } from '../app/utils/api/scope'

const catalogPath = `/catalog?workspace=${baseline.workspace.id}`
const root = `/bff/api/masterdata/workspaces/${baseline.workspace.id}`
const evidence = resolve(import.meta.dirname, '../../../../artifacts/dashboard-d2-original-ui')
mkdirSync(evidence, { recursive: true })

async function loginCatalog(page: Page) {
  await page.goto(catalogPath)
  await expect(page.getByTestId('user-menu-trigger')).toContainText('未登录')
  await page.getByTestId('user-menu-trigger').click()
  await page.getByRole('menuitem', { name: '登录 Nexora', exact: true }).click()
  await completePasswordLogin(page, 'alice', catalogPath)
  const list = await api(page, root + '/catalog?page=1&pageSize=8')
  expect(list.status, list.text).toBe(200)
  const item = JSON.parse(list.text).page.items[0] as WireItem
  await expect(page.getByTestId('catalog-table')).toContainText(item.code)
  return item
}

async function restore(page: Page, item: WireItem, prefix: string) {
  const response = await api(page, `${root}/items/${item.id}`)
  if (response.status !== 200 || !JSON.parse(response.text).name.startsWith(prefix)) return
  const operationId = randomUUID()
  const saved = await write(page, `${root}/items/${item.id}`, 'PUT', { name: item.name, categoryId: item.categoryId, isActive: item.isActive, operationId },
    { 'If-Match': response.headers.etag!, 'Idempotency-Key': operationId })
  expect(saved.status, saved.text).toBe(200)
}

test('D2 原商品页使用真实数据，412 保留输入并按新版本保存', async ({ page }) => {
  const item = await loginCatalog(page)
  const prefix = 'D2-' + Date.now()
  try {
    await page.screenshot({ path: resolve(evidence, 'live-catalog.png'), animations: 'disabled', fullPage: true })
    await page.getByTestId('catalog-edit').first().click()
    await page.getByTestId('catalog-edit-name').fill(prefix + '-my-input')
    const old = await api(page, `${root}/items/${item.id}`)
    const operationId = randomUUID()
    expect((await write(page, `${root}/items/${item.id}`, 'PUT', { name: prefix + '-other-update', categoryId: item.categoryId, isActive: item.isActive, operationId },
      { 'If-Match': old.headers.etag!, 'Idempotency-Key': operationId })).status).toBe(200)
    await page.getByTestId('catalog-edit-save').click()
    await expect(page.getByTestId('catalog-write-feedback')).toContainText('输入已保留')
    await expect(page.getByTestId('catalog-edit-name')).toHaveValue(prefix + '-my-input')
    await page.screenshot({ path: resolve(evidence, 'live-conflict.png'), animations: 'disabled', fullPage: true })
    await page.getByTestId('catalog-read-current').click()
    await expect(page.getByTestId('catalog-current-version')).toContainText(prefix + '-other-update')
    await page.getByTestId('catalog-edit-save').click()
    await expect(page.getByRole('dialog', { name: '编辑商品', exact: true })).not.toBeVisible()
    const saved = JSON.parse((await api(page, `${root}/items/${item.id}`)).text)
    expect(saved.name).toBe(prefix + '-my-input')
    expect(Number(saved.version)).toBe(Number(item.version) + 2)
    await expect(page.getByTestId('catalog-table')).not.toContainText('ThinkPad')
  } finally { await restore(page, item, prefix) }
})

test('D2 真实写入后丢失响应，刷新恢复仅确认或重放原操作', async ({ page }) => {
  const item = await loginCatalog(page)
  const prefix = 'D2-unknown-' + Date.now()
  let dropped = false
  let committedVersion = 0
  const submissions: { key: string, body: string | null }[] = []
  await page.route(`**${root}/items/${item.id}`, async (route) => {
    if (route.request().method() !== 'PUT') return route.continue()
    submissions.push({ key: route.request().headers()['idempotency-key']!, body: route.request().postData() })
    if (dropped) return route.continue()
    dropped = true
    const response = await route.fetch({ maxRetries: 0 })
    expect(response.status()).toBe(200)
    committedVersion = Number((await response.json()).version)
    await route.abort('failed')
  })
  try {
    await page.getByTestId('catalog-edit').first().click()
    await page.getByTestId('catalog-edit-name').fill(prefix)
    await page.getByTestId('catalog-edit-save').click()
    await expect(page.getByTestId('catalog-write-unknown')).toBeVisible()
    await page.screenshot({ path: resolve(evidence, 'live-unknown-write.png'), animations: 'disabled', fullPage: true })
    expect(submissions).toHaveLength(1)
    await page.reload()
    await expect(page.getByTestId('catalog-recovery-banner')).toBeVisible()
    await page.getByRole('button', { name: '恢复上次提交', exact: true }).click()
    await expect(page.getByTestId('catalog-edit-name')).toHaveValue(prefix)
    await page.getByTestId('catalog-check-write').click()
    const dialog = page.getByRole('dialog', { name: '编辑商品', exact: true })
    await expect.poll(async () => !await dialog.isVisible()
      || await page.getByTestId('catalog-retry-write').evaluateAll(buttons => buttons.some(button => button instanceof HTMLButtonElement && !button.disabled))).toBe(true)
    if (await dialog.isVisible()) await page.getByTestId('catalog-retry-write').click()
    await expect(dialog).not.toBeVisible()
    const saved = JSON.parse((await api(page, `${root}/items/${item.id}`)).text)
    expect(saved.name).toBe(prefix)
    expect(Number(saved.version)).toBe(committedVersion)
    expect(committedVersion).toBe(Number(item.version) + 1)
    if (submissions.length === 2) expect(submissions[1]).toEqual(submissions[0])
    await expect(page.getByTestId('catalog-recovery-banner')).not.toBeVisible()
  } finally {
    await page.unroute(`**${root}/items/${item.id}`)
    await restore(page, item, prefix)
  }
})

test('D2 真实只读用户看原目录，伪造写入和跨工作区请求仍被拒绝', async ({ page }) => {
  await emailLogin(page, baseline.reader.email)
  await page.goto(catalogPath)
  await expect(page.getByTestId('catalog-table')).toBeVisible()
  await expect(page.getByTestId('catalog-edit').first()).toBeDisabled()
  const path = `${root}/items/${baseline.product.id}`
  const before = await api(page, path)
  expect(before.status).toBe(200)
  const item = JSON.parse(before.text)
  const operationId = randomUUID()
  expect((await write(page, path, 'PUT', { name: 'must not change', categoryId: item.categoryId, isActive: item.isActive, operationId },
    { 'If-Match': before.headers.etag!, 'Idempotency-Key': operationId })).status).toBe(403)
  expect(JSON.parse((await api(page, path)).text).version).toBe(item.version)
  expect((await api(page, `/bff/api/masterdata/workspaces/${baseline.isolatedWorkspace.id}/items/${baseline.product.id}`)).status).toBe(404)
})

test('D2 客户端丢失真实建单响应后先回读，单据与配额仅增加一次', async ({ page }) => {
  await loginCatalog(page)
  const path = `/bff/api/purchasing/workspaces/${baseline.workspace.id}/orders`
  const entitlements = `/bff/api/workspaces/${baseline.workspace.id}/billing/entitlements`
  const quota = () => api(page, entitlements).then(response => JSON.parse(response.text).usage.documentsThisMonth as number)
  const beforeQuota = await quota()
  const operationId = randomUUID()
  const number = ('D2-unknown-' + operationId.slice(0, 12)).toUpperCase()
  const subject = JSON.parse((await api(page, '/bff/me')).text).subject as string
  let writes = 0
  let drop = true
  const client = createApiClient(new RequestScope({ mode: 'live', subject, workspaceId: baseline.workspace.id, authorizationVersion: 'acceptance' }),
    async (url, options) => {
      const response = await api(page, url, options.method, options.body, options.headers)
      if (url === path && options.method === 'POST') {
        writes++
        expect(response.status, response.text).toBe(201)
        if (drop) {
          drop = false
          throw new TypeError('Simulated response loss after server commit')
        }
      }
      return { status: response.status, data: JSON.parse(response.text), headers: new Headers(response.headers) }
    })
  const operation = client.createWrite<{ id: string }>(path, { number, operationId,
    draft: { on: '2026-01-03', supplierId: baseline.supplier.id, note: 'D2 unknown-response acceptance',
      lines: [{ itemId: baseline.product.id, quantity: '1', unitPrice: '100' }] } }, { idempotent: true })
  await expect(operation.send()).rejects.toBeInstanceOf(ResultUnknownError)
  expect(operation.state).toBe('unknown')
  expect(operation.retryAvailable).toBe(false)
  expect(writes).toBe(1)
  expect(await quota()).toBe(beforeQuota + 1)
  const confirmed = await operation.readBack(async () => {
    const response = await client.get<{ orders: { id: string, number: string }[] }>(path + '?pageSize=100')
    const matches = response.data.orders.filter(order => order.number === number)
    expect(matches).toHaveLength(1)
    const detail = await client.get<{ order: { id: string } }>(path + '/' + matches[0]!.id)
    expect(detail.data.order.id).toBe(matches[0]!.id)
    return { applied: true, result: { ...detail, data: { id: detail.data.order.id } } }
  })
  expect(confirmed).toBe(true)
  expect(operation.state).toBe('confirmed')
  expect(writes).toBe(1)
  expect(await quota()).toBe(beforeQuota + 1)
})

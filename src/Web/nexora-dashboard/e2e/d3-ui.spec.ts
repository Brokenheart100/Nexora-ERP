import { randomUUID } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { api, baseline, emailLogin, login, write } from './helpers'
import { mappingCandidates, tradeMappingFields, receivableMappingFields, type MappingField } from '../app/utils/api/account-mappings'
import type { WireChart } from '../shared/types/prerequisites'

const workspace = baseline.workspace.id as string
const root = `/bff/api/masterdata/workspaces/${workspace}`
const evidence = resolve(import.meta.dirname, '../../../../artifacts/dashboard-d3-original-ui')
mkdirSync(evidence, { recursive: true })
const result = (page: Page, path: string, method: string) => page.waitForResponse(response => new URL(response.url()).pathname === path && response.request().method() === method)

async function deactivateOwnIneligibleFixtures(page: Page) {
  const catalog = JSON.parse((await api(page, root + '/catalog?pageSize=100')).text)
  for (const item of catalog.page.items) {
    if (!item.isActive || !/^000-D3-I-[a-f0-9]{8}$/i.test(item.code) || !/^D3 商品 [a-f0-9]{8} 已更名$/i.test(item.name)) continue
    if (catalog.definitions.find((value: { id: string }) => value.id === item.categoryId)?.isActive !== false) continue
    const current = await api(page, root + '/items/' + item.id)
    const value = JSON.parse(current.text)
    if (value.name !== item.name) continue
    const operationId = randomUUID()
    const updated = await write(page, root + '/items/' + item.id, 'PUT', { name: value.name, categoryId: value.categoryId, isActive: false, operationId }, { 'If-Match': current.headers.etag!, 'Idempotency-Key': operationId })
    expect(updated.status, updated.text).toBe(200)
  }
}

async function definition(page: Page, kind: 'category' | 'unit', code: string, name: string) {
  await page.goto('/definitions?workspace=' + workspace)
  await expect(page.getByTestId('definitions-new')).toBeEnabled()
  if (kind === 'unit') await page.getByRole('tab', { name: '计量单位', exact: true }).click()
  await page.getByTestId('definitions-new').click()
  await page.getByTestId('definitions-form-code').fill(code)
  await page.getByTestId('definitions-form-name').fill(name)
  const response = result(page, root + '/definitions', 'POST')
  await page.getByTestId('definitions-save').click()
  const made = await response
  expect(made.status()).toBe(201)
  await expect(page.getByRole('dialog', { name: kind === 'category' ? '新建分类' : '新建单位', exact: true })).not.toBeVisible()
  return (await made.json()).id as string
}

async function partner(page: Page, code: string, name: string) {
  await page.goto('/partners?workspace=' + workspace)
  await expect(page.getByTestId('partners-new')).toBeEnabled()
  await page.getByTestId('partners-new').click()
  await page.getByTestId('partners-edit-code').fill(code)
  await page.getByTestId('partners-edit-name').fill(name)
  await page.getByTestId('partners-edit-role-customer').click()
  await page.getByTestId('partners-edit-contact').fill('D3 本地联系人')
  await page.getByTestId('partners-edit-line').fill('D3 完整地址原文')
  const response = result(page, root + '/partners', 'POST')
  await page.getByTestId('partners-edit-save').click()
  const made = await response
  expect(made.status()).toBe(201)
  await expect(page.getByRole('dialog', { name: '新建伙伴', exact: true })).not.toBeVisible()
  return (await made.json()).id as string
}

test('D3 原页面创建主数据，停用引用保留历史采购快照并隔离其他工作区', async ({ page }) => {
  await login(page)
  await deactivateOwnIneligibleFixtures(page)
  const suffix = randomUUID().slice(0, 8)
  const categoryName = 'D3 分类 ' + suffix, unitName = 'D3 单位 ' + suffix, itemName = 'D3 商品 ' + suffix, supplierName = 'D3 伙伴 ' + suffix
  const categoryId = await definition(page, 'category', '000-D3-C-' + suffix, categoryName)
  const unitId = await definition(page, 'unit', '000-D3-U-' + suffix, unitName)
  const supplierId = await partner(page, '000-D3-P-' + suffix, supplierName)
  await page.goto('/catalog?workspace=' + workspace)
  await page.getByTestId('catalog-new').click()
  await page.getByTestId('catalog-create-name').fill(itemName)
  await page.getByTestId('catalog-create-sku').fill('000-D3-I-' + suffix)
  await page.getByTestId('catalog-create-category').click()
  await page.getByRole('option', { name: categoryName, exact: true }).click()
  await page.getByTestId('catalog-create-unit').click()
  await page.getByRole('option', { name: unitName, exact: true }).click()
  await page.getByTestId('catalog-create-tracking').click()
  await page.getByRole('option', { name: '跟踪库存', exact: true }).click()
  const created = result(page, root + '/items', 'POST')
  await page.getByTestId('catalog-create-save').dblclick()
  const createdResponse = await created
  expect(createdResponse.status()).toBe(201)
  const itemId = (await createdResponse.json()).id
  await expect(page.getByRole('dialog', { name: '新建商品', exact: true })).not.toBeVisible()
  const itemReference = JSON.parse((await api(page, `${root}/items/${itemId}/reference`)).text)
  expect(itemReference.category.id).toBe(categoryId)
  expect(itemReference.unit.id).toBe(unitId)
  await page.screenshot({ path: resolve(evidence, 'live-catalog.png'), animations: 'disabled', fullPage: true })
  const operationId = randomUUID(), orders = `/bff/api/purchasing/workspaces/${workspace}/orders`
  const made = await write(page, orders, 'POST', { operationId, number: 'D3-HISTORY-' + suffix,
    draft: { on: '2026-01-03', supplierId, lines: [{ itemId, quantity: '1', unitPrice: '100' }] } }, { 'Idempotency-Key': operationId })
  expect(made.status, made.text).toBe(201)
  const orderPath = orders + '/' + JSON.parse(made.text).id
  const before = JSON.parse((await api(page, orderPath)).text)
  const itemRow = page.getByTestId('catalog-table').getByRole('row').filter({ hasText: '000-D3-I-' + suffix })
  await itemRow.getByTestId('catalog-edit').click()
  await page.getByTestId('catalog-edit-name').fill(itemName + ' 已更名')
  await page.getByTestId('catalog-edit-save').click()
  await expect(itemRow).toContainText(itemName + ' 已更名')
  await page.goto('/partners?workspace=' + workspace)
  const partnerRow = page.getByTestId('partners-table').getByRole('row').filter({ hasText: '000-D3-P-' + suffix })
  await partnerRow.getByTestId('partners-edit').click()
  await page.getByTestId('partners-edit-name').fill(supplierName + ' 已更名')
  await page.getByTestId('partners-edit-status').click()
  await page.getByRole('option', { name: '已停用', exact: true }).click()
  await page.getByTestId('partners-edit-save').click()
  await expect(partnerRow).toContainText('已停用')
  expect((await api(page, `${root}/partners/${supplierId}/reference?role=supplier`)).status).toBe(409)
  await page.goto('/definitions?workspace=' + workspace)
  await page.getByRole('tab', { name: '计量单位', exact: true }).click()
  const unitRow = page.getByTestId('definitions-units-table').getByRole('row').filter({ hasText: '000-D3-U-' + suffix })
  await unitRow.getByTestId('definitions-edit').click()
  await page.getByTestId('definitions-form-name').fill(unitName + ' 已更名')
  await page.getByTestId('definitions-save').click()
  await expect(unitRow).toContainText(unitName + ' 已更名')
  await page.getByRole('tab', { name: '商品分类', exact: true }).click()
  const categoryRow = page.getByTestId('definitions-categories-table').getByRole('row').filter({ hasText: '000-D3-C-' + suffix })
  await categoryRow.getByTestId('definitions-edit').click()
  await page.getByTestId('definitions-form-name').fill(categoryName + ' 已更名')
  await page.getByTestId('definitions-form-status').click()
  await page.getByRole('option', { name: '停用', exact: true }).click()
  await page.getByTestId('definitions-save').click()
  await expect(categoryRow).toContainText('停用')
  const reference = await api(page, `${root}/items/${itemId}/reference`)
  expect(reference.status).toBe(409)
  const foreign = root.replace(workspace, baseline.isolatedWorkspace.id)
  expect((await api(page, foreign + '/items/' + itemId)).status).toBe(404)
  const foreignOperation = randomUUID()
  const foreignCategory = await write(page, foreign + '/definitions', 'POST', { operationId: foreignOperation, code: 'D3-FOREIGN-' + suffix, name: 'D3 隔离分类 ' + suffix, kind: 'category' }, { 'Idempotency-Key': foreignOperation })
  expect(foreignCategory.status, foreignCategory.text).toBe(201)
  const forgedOperation = randomUUID()
  expect((await write(page, root + '/items', 'POST', { operationId: forgedOperation, code: 'D3-INVALID-' + suffix, name: 'Must not be created', kind: 'product', tracksInventory: true,
    categoryId: JSON.parse(foreignCategory.text).id, unitId }, { 'Idempotency-Key': forgedOperation })).status).toBe(400)
  const after = JSON.parse((await api(page, orderPath)).text)
  expect(after.lines).toEqual(before.lines)
  expect(after.order.supplierName).toBe(before.order.supplierName)
  expect(after.lines[0].itemName).toBe(itemName)
  expect(JSON.parse((await api(page, `${root}/items/${itemId}`)).text).name).toBe(itemName + ' 已更名')
  expect(Number(JSON.parse((await api(page, `${root}/definitions/${unitId}`)).text).version)).toBe(2)
  await page.screenshot({ path: resolve(evidence, 'live-definitions.png'), animations: 'disabled', fullPage: true })
  await page.goto('/finance?tab=documents&workspace=' + workspace)
  await expect(page.getByTestId('finance-prerequisite-book')).toContainText('已核对')
  await expect(page.getByTestId('finance-save-trade')).toBeDisabled()
  const warehouses = JSON.parse((await api(page, `/bff/api/inventory/workspaces/${workspace}/warehouses`)).text).warehouses
  const warehouse = warehouses.find((value: { id: string }) => value.id === baseline.warehouse.id)
  expect(warehouse).toBeTruthy()
  await page.getByTestId('finance-prerequisites-warehouse').click()
  await page.getByRole('option', { name: warehouse.code + ' ' + warehouse.name + (warehouse.canReceive ? ' · 可收货' : ' · 只读'), exact: true }).click()
  await expect(page.getByTestId('finance-warehouse-capability')).toContainText(warehouse.canReceive ? '可执行收货' : '当前身份仅可查看仓库资料')
  await deactivateOwnIneligibleFixtures(page)
})

test('D3 原伙伴抽屉的真实版本冲突保留输入并保存多角色联系人', async ({ page }) => {
  await login(page)
  const suffix = randomUUID().slice(0, 8), code = '000-D3-PC-' + suffix
  const id = await partner(page, code, 'D3 伙伴版本 ' + suffix)
  const row = page.getByTestId('partners-table').getByRole('row').filter({ hasText: code })
  await row.getByTestId('partners-edit').click()
  await page.getByTestId('partners-edit-name').fill('D3 我的保留输入 ' + suffix)
  const previous = await api(page, root + '/partners/' + id), original = JSON.parse(previous.text), operationId = randomUUID()
  expect((await write(page, root + '/partners/' + id, 'PUT', { operationId, profile: { name: 'D3 另一会话 ' + suffix, roles: original.roles, contacts: original.contacts, address: original.address, taxNumber: original.taxNumber }, isActive: true },
    { 'If-Match': previous.headers.etag!, 'Idempotency-Key': operationId })).status).toBe(200)
  await page.getByTestId('partners-edit-save').click()
  await expect(page.getByTestId('partners-feedback')).toContainText('输入已保留')
  await expect(page.getByTestId('partners-edit-name')).toHaveValue('D3 我的保留输入 ' + suffix)
  await page.getByRole('button', { name: '读取当前版本', exact: true }).click()
  await expect(page.getByRole('dialog', { name: '编辑伙伴', exact: true })).toContainText('D3 另一会话 ' + suffix)
  await page.getByTestId('partners-edit-save').click()
  await expect(page.getByRole('dialog', { name: '编辑伙伴', exact: true })).not.toBeVisible()
  const saved = JSON.parse((await api(page, root + '/partners/' + id)).text)
  expect(saved.roles).toEqual(original.roles)
  expect(saved.contacts).toEqual(original.contacts)
  expect(saved.address).toBe('D3 完整地址原文')
  expect(Number(saved.version)).toBe(Number(original.version) + 2)
  await row.getByTestId('partners-detail').click()
  await page.screenshot({ path: resolve(evidence, 'live-partner.png'), animations: 'disabled', fullPage: true })
})

test('D3 真实定义创建丢失响应后在原抽屉恢复，回执确认不重复创建', async ({ page }) => {
  await login(page)
  await page.goto('/definitions?workspace=' + workspace)
  await page.getByTestId('definitions-new').click()
  const suffix = randomUUID().slice(0, 8), name = 'D3 未知创建 ' + suffix
  await page.getByTestId('definitions-form-code').fill('000-D3-UNKNOWN-' + suffix)
  await page.getByTestId('definitions-form-name').fill(name)
  let id = '', writes = 0
  await page.route('**' + root + '/definitions', async (route) => {
    if (route.request().method() !== 'POST') return route.continue()
    writes++
    const response = await route.fetch({ maxRetries: 0 })
    expect(response.status()).toBe(201)
    id = (await response.json()).id
    await route.abort('failed')
  })
  await page.getByTestId('definitions-save').click()
  await expect(page.getByTestId('definitions-unknown')).toBeVisible()
  await page.reload()
  await page.getByTestId('definitions-recovery').getByRole('button', { name: '恢复上次提交', exact: true }).click()
  await expect(page.getByTestId('definitions-form-name')).toHaveValue(name)
  await page.getByRole('button', { name: '查询提交结果', exact: true }).click()
  await expect(page.getByRole('dialog', { name: '新建分类', exact: true })).not.toBeVisible()
  expect(writes).toBe(1)
  const list = JSON.parse((await api(page, root + '/catalog')).text)
  expect(list.definitions.filter((value: { id: string }) => value.id === id)).toHaveLength(1)
})

test('D3 真实只读导航、越权深链接与原主数据操作门禁', async ({ page }) => {
  await emailLogin(page, baseline.reader.email)
  await page.goto('/partners?workspace=' + workspace)
  await expect(page.getByTestId('partners-new')).toBeDisabled()
  await expect(page.getByTestId('partners-table')).toBeVisible()
  await expect(page.getByRole('link', { name: '采购订单', exact: true })).toHaveCount(0)
  await page.goto('/definitions?workspace=' + baseline.isolatedWorkspace.id)
  await expect(page.getByTestId('definitions-state-forbidden')).toBeVisible()
  await expect(page.getByTestId('definitions-categories-table')).toHaveCount(0)
  await page.getByTestId('workspace-menu-trigger').click()
  const authorized = JSON.parse((await api(page, '/bff/api/workspaces')).text).find((value: { id: string }) => value.id === workspace)
  await page.getByRole('menuitemcheckbox', { name: authorized.name, exact: true }).click()
  await expect(page.getByTestId('definitions-categories-table')).toBeVisible()
  await expect(page.getByTestId('definitions-edit').first()).toBeDisabled()
})

async function chooseMappings(page: Page, area: string, fields: MappingField[], chart: WireChart) {
  const selected = new Set<string>(), choices: Record<string, string> = {}
  for (const field of fields.filter(value => !value.optional)) {
    const candidates = mappingCandidates(chart.accounts, field, []).filter(account => !selected.has(account.id))
    const candidate = candidates.find(account => account.name === 'D3 ' + field.label) ?? candidates[0]!
    expect(candidate, field.label).toBeTruthy()
    choices[field.key] = candidate.id
    selected.add(candidate.id)
    await page.getByTestId(`finance-${area}-${field.key}`).click()
    await page.getByRole('option', { name: candidate.code + ' ' + candidate.name, exact: true }).click()
  }
  return choices
}

test('D3 独立真实工作区初始化原映射表单，未知结果回读后按原键重放', async ({ browser, page: owner }) => {
  await emailLogin(owner, `dashboard-d3-config-${Date.now()}@example.invalid`, true)
  const made = await write(owner, '/bff/api/workspaces', 'POST', { name: 'D3 配置验收 ' + Date.now(), operationId: randomUUID() })
  expect(made.status, made.text).toBe(201)
  const id = JSON.parse(made.text).id, org = '/bff/api/workspaces/' + id
  const other = await browser.newContext({ baseURL: 'https://localhost:7444' })
  const reviewerContext = await browser.newContext({ baseURL: 'https://localhost:7444' })
  try {
    const page = await other.newPage(), approver = await reviewerContext.newPage()
    await login(page, 'alice')
    await login(approver, 'bob')
    const access = async () => JSON.parse((await api(owner, org + '/access')).text)
    for (const [email, actor] of [['alice@nexora.invalid', page], ['bob@nexora.invalid', approver]] as const) {
      const invitation = await write(owner, org + '/invitations', 'POST', { expectedVersion: (await access()).authorizationVersion, email, role: 'WorkspaceOwner', operationId: randomUUID() })
      expect(invitation.status, invitation.text).toBe(201)
      const invited = JSON.parse(invitation.text)
      expect((await write(actor, '/bff/api/invitations/' + invited.invitation.id + '/redeem', 'POST', { token: invited.token, operationId: randomUUID() })).status).toBe(200)
    }
    const memberId = JSON.parse((await api(page, org + '/access')).text).memberId
    const path = org + '/members/' + memberId + '/finance-role'
    const proposed = await write(page, path, 'POST', { expectedVersion: (await access()).authorizationVersion, action: 'propose', role: 'Accountant', operationId: randomUUID() })
    expect(proposed.status, proposed.text).toBe(200)
    const approved = await write(approver, path, 'POST', { expectedVersion: (await access()).authorizationVersion, action: 'approve', operationId: randomUUID() })
    expect(approved.status, approved.text).toBe(200)
    const finance = '/bff/api/finance/workspaces/' + id
    const book = await write(page, finance + '/book', 'POST', { operationId: randomUUID(), baseCurrency: 'CNY', startsOn: '2026-01-01', fiscalYearStartMonth: 1 })
    expect(book.status, book.text).toBe(200)
    let chart = JSON.parse((await api(page, finance + '/chart')).text) as WireChart
    // The default chart contains posting accounts; prepare explicit control accounts in this isolated fixture.
    for (const [index, field] of [...tradeMappingFields, ...receivableMappingFields].entries()) {
      const saved = await write(page, finance + '/chart/accounts', 'POST', { operationId: randomUUID(), expectedRevision: chart.revision, expectedVersion: null,
        account: { code: String(990000 + index), name: 'D3 ' + field.label, category: field.category, purpose: field.purpose, parentCode: null, isArchived: false } })
      expect(saved.status, saved.text).toBe(200)
      chart = JSON.parse((await api(page, finance + '/chart')).text) as WireChart
    }
    await page.goto('/finance?tab=documents&workspace=' + id)
    await expect(page.getByTestId('finance-prerequisite-book')).toContainText('已核对')
    const payable = await chooseMappings(page, 'trade', tradeMappingFields, chart)
    const submissions: { key: string, body: string | null }[] = []
    let dropped = false
    await page.route('**' + finance + '/trade/setup', async (route) => {
      if (route.request().method() !== 'POST') return route.continue()
      submissions.push({ key: route.request().headers()['idempotency-key']!, body: route.request().postData() })
      if (dropped) return route.continue()
      dropped = true
      const response = await route.fetch({ maxRetries: 0 })
      expect(response.status()).toBe(200)
      await route.abort('failed')
    })
    await page.getByTestId('finance-save-trade').click()
    const feedback = page.getByTestId('finance-mapping-trade-feedback')
    await expect(feedback).toContainText('结果待确认')
    await page.reload()
    await feedback.getByRole('button', { name: '恢复上次提交', exact: true }).click()
    await feedback.getByRole('button', { name: '查询当前配置', exact: true }).click()
    await expect(feedback.getByRole('button', { name: '重试原提交', exact: true })).toBeEnabled()
    await feedback.getByRole('button', { name: '重试原提交', exact: true }).click()
    await expect(feedback).not.toBeVisible()
    expect(submissions).toHaveLength(2)
    expect(submissions[1]).toEqual(submissions[0])
    await expect(page.getByTestId('finance-save-trade')).toBeDisabled()
    const receivable = await chooseMappings(page, 'receivables', receivableMappingFields, chart)
    const configured = result(page, finance + '/receivables/setup', 'POST')
    await page.getByTestId('finance-save-receivables').click()
    const configuredResponse = await configured
    expect(configuredResponse.status(), await configuredResponse.text()).toBe(200)
    await expect(page.getByTestId('finance-prerequisite-receivables')).toContainText('已核对')
    await expect(page.getByTestId('finance-save-receivables')).toBeDisabled()
    expect(JSON.parse((await api(page, finance + '/trade')).text).setup).toMatchObject(payable)
    expect(JSON.parse((await api(page, finance + '/receivables')).text).accounts).toMatchObject(receivable)
    await page.screenshot({ path: resolve(evidence, 'live-finance-mappings.png'), animations: 'disabled', fullPage: true })
  } finally {
    await other.close()
    await reviewerContext.close()
  }
})

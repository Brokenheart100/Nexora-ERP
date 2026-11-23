import { expect, test, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

const evidence = resolve(import.meta.dirname, '../../../../artifacts/dashboard-d2-original-ui')
mkdirSync(evidence, { recursive: true })

async function login(page: Page, scenario = 'normal') {
  await page.goto('/catalog?mockCase=' + scenario)
  await expect(page.getByTestId('user-menu-trigger')).toContainText('未登录', { timeout: 45_000 })
  await page.getByTestId('user-menu-trigger').click()
  await page.getByRole('menuitem', { name: '登录 Nexora', exact: true }).click()
  await expect(page.getByTestId('catalog-table')).toBeVisible({ timeout: 45_000 })
}

test('D2 原商品目录读取 MSW、翻页、切换工作区并保存原编辑抽屉', async ({ page }) => {
  await login(page)
  const table = page.getByTestId('catalog-table')
  await expect(table).toContainText('MSW-SKU-001')
  await expect(table).not.toContainText('ThinkPad')
  await expect(page.getByTestId('catalog-edit')).toHaveCount(8)
  await page.screenshot({ path: resolve(evidence, 'msw-catalog.png'), animations: 'disabled', fullPage: true })
  await page.getByTestId('catalog-pagination').getByRole('button', { name: '下一页', exact: true }).click()
  await expect(table).toContainText('MSW-SKU-009')
  await page.getByTestId('workspace-menu-trigger').click()
  await page.getByRole('menuitemcheckbox', { name: 'MSW 另一工作区', exact: true }).click()
  await expect(table).toContainText('MSW-OTHER-001')
  await expect(table).not.toContainText('MSW-SKU-001')
  await page.getByTestId('workspace-menu-trigger').click()
  await page.getByRole('menuitemcheckbox', { name: 'MSW 采购演示公司', exact: true }).click()
  await expect(table).toContainText('MSW-SKU-001')
  await page.getByTestId('catalog-edit').first().click()
  await page.getByTestId('catalog-edit-name').fill('D2 原抽屉保存')
  await page.screenshot({ path: resolve(evidence, 'msw-editor.png'), animations: 'disabled', fullPage: true })
  let writes = 0
  page.on('request', (request) => {
    if (request.method() === 'PUT') writes++
  })
  await page.getByTestId('catalog-edit-save').dblclick()
  await expect(page.getByRole('dialog', { name: '编辑商品', exact: true })).not.toBeVisible()
  await expect(table).toContainText('D2 原抽屉保存')
  expect(writes).toBe(1)
})

test('D2 旧版本 412 保留原输入，读当前版本后由用户再次保存', async ({ page }) => {
  await login(page, 'conflict')
  await page.getByTestId('catalog-edit').first().click()
  await page.getByTestId('catalog-edit-name').fill('D2 保留输入')
  await page.getByTestId('catalog-edit-save').click()
  await expect(page.getByTestId('catalog-write-feedback')).toContainText('输入已保留')
  await expect(page.getByTestId('catalog-edit-name')).toHaveValue('D2 保留输入')
  await page.getByTestId('catalog-read-current').click()
  await expect(page.getByTestId('catalog-current-version')).toContainText('当前版本 2')
  await expect(page.getByTestId('catalog-edit-name')).toHaveValue('D2 保留输入')
  await page.getByTestId('catalog-edit-save').click()
  await expect(page.getByTestId('catalog-table')).toContainText('D2 保留输入')
})

test('D2 丢失响应后不重发，刷新仍能恢复并读取自己的回执', async ({ page }) => {
  await login(page, 'unknown-write')
  await page.getByTestId('catalog-edit').first().click()
  await page.getByTestId('catalog-edit-name').fill('D2 待确认输入')
  let writes = 0
  page.on('request', (request) => {
    if (request.method() === 'PUT') writes++
  })
  await page.getByTestId('catalog-edit-save').click()
  await expect(page.getByTestId('catalog-write-unknown')).toBeVisible()
  await expect(page.getByTestId('catalog-retry-write')).toBeDisabled()
  await page.reload()
  await expect(page.getByTestId('catalog-recovery-banner')).toBeVisible({ timeout: 45_000 })
  await page.getByRole('button', { name: '恢复上次提交', exact: true }).click()
  await expect(page.getByTestId('catalog-edit-name')).toHaveValue('D2 待确认输入')
  await page.getByTestId('catalog-check-write').click()
  await expect(page.getByRole('dialog', { name: '编辑商品', exact: true })).not.toBeVisible()
  await expect(page.getByTestId('catalog-recovery-banner')).not.toBeVisible()
  expect(writes).toBe(1)
})

test('D2 查回未确认后，明确重试沿用原键与原请求', async ({ page }) => {
  await login(page, 'retry-before-write')
  await page.getByTestId('catalog-edit').first().click()
  await page.getByTestId('catalog-edit-name').fill('D2 明确重试')
  const submissions: { key: string, body: string | null }[] = []
  page.on('request', (request) => {
    if (request.method() === 'PUT') submissions.push({ key: request.headers()['idempotency-key']!, body: request.postData() })
  })
  await page.getByTestId('catalog-edit-save').click()
  await expect(page.getByTestId('catalog-write-unknown')).toBeVisible()
  await page.getByTestId('catalog-check-write').click()
  await expect(page.getByTestId('catalog-retry-write')).toBeEnabled()
  await page.getByTestId('catalog-retry-write').click()
  await expect(page.getByTestId('catalog-table')).toContainText('D2 明确重试')
  expect(submissions).toHaveLength(2)
  expect(submissions[1]).toEqual(submissions[0])
})

test('D2 字段错误与只读拒绝保留原界面状态', async ({ page }) => {
  await login(page, 'validation')
  await page.getByTestId('catalog-edit').first().click()
  await page.getByTestId('catalog-edit-name').fill('D2 校验输入')
  await page.getByTestId('catalog-edit-save').click()
  await expect(page.getByRole('dialog', { name: '编辑商品', exact: true })).toContainText('名称未通过校验')
  await expect(page.getByTestId('catalog-edit-name')).toHaveValue('D2 校验输入')
  await page.goto('/catalog?mockCase=read-only')
  await expect(page.getByTestId('catalog-edit').first()).toBeDisabled({ timeout: 45_000 })
})

test('D2 未知提交不随其他账号或工作区显示', async ({ page }) => {
  await login(page, 'unknown-write')
  await page.getByTestId('catalog-edit').first().click()
  await page.getByTestId('catalog-edit-name').fill('D2 账号隔离')
  await page.getByTestId('catalog-edit-save').click()
  await expect(page.getByTestId('catalog-write-unknown')).toBeVisible()
  await page.goto('/catalog?mockCase=other-account')
  await expect(page.getByTestId('user-menu-trigger')).toContainText('MSW Bob', { timeout: 45_000 })
  await expect(page.getByTestId('catalog-table')).toContainText('MSW-OTHER-001')
  await expect(page.getByTestId('catalog-recovery-banner')).not.toBeVisible()
  await expect(page.getByTestId('catalog-table')).not.toContainText('D2 账号隔离')
})

test('D2 回读失败仍保留未知提交，刷新后继续核对', async ({ page }) => {
  await login(page, 'audit-unavailable')
  await page.getByTestId('catalog-edit').first().click()
  await page.getByTestId('catalog-edit-name').fill('D2 回读失败保留')
  let writes = 0
  page.on('request', (request) => {
    if (request.method() === 'PUT') writes++
  })
  await page.getByTestId('catalog-edit-save').click()
  await expect(page.getByTestId('catalog-write-unknown')).toBeVisible()
  await page.getByTestId('catalog-check-write').click()
  await expect(page.getByTestId('catalog-write-feedback')).toContainText('回执查询暂不可用')
  await expect(page.getByTestId('catalog-write-unknown')).toBeVisible()
  await expect(page.getByTestId('catalog-retry-write')).toBeDisabled()
  await page.reload()
  await page.getByRole('button', { name: '恢复上次提交', exact: true }).click()
  await expect(page.getByTestId('catalog-edit-name')).toHaveValue('D2 回读失败保留')
  await page.getByTestId('catalog-check-write').click()
  await expect(page.getByRole('dialog', { name: '编辑商品', exact: true })).not.toBeVisible()
  expect(writes).toBe(1)
})

test('D2 附加验证后在原抽屉恢复输入，由用户再次保存', async ({ page }) => {
  await login(page, 'mfa')
  await page.getByTestId('catalog-edit').first().click()
  await page.getByTestId('catalog-edit-name').fill('D2 附加验证输入')
  let writes = 0
  page.on('request', (request) => {
    if (request.method() === 'PUT') writes++
  })
  await page.getByTestId('catalog-edit-save').click()
  await expect(page.getByRole('link', { name: '重新验证身份', exact: true })).toBeVisible()
  await page.getByRole('link', { name: '重新验证身份', exact: true }).click()
  await page.getByRole('button', { name: '恢复上次提交', exact: true }).click()
  await expect(page.getByTestId('catalog-edit-name')).toHaveValue('D2 附加验证输入')
  expect(writes).toBe(1)
  await page.getByTestId('catalog-edit-save').click()
  await expect(page.getByTestId('catalog-table')).toContainText('D2 附加验证输入')
  await expect(page.getByRole('dialog', { name: '编辑商品', exact: true })).not.toBeVisible()
  expect(writes).toBe(2)
})

test('D2 刷新授权后撤销编辑操作', async ({ page }) => {
  await login(page)
  await page.getByTestId('catalog-edit').first().click()
  await page.getByTestId('catalog-edit-name').fill('D2 应清除的旧授权输入')
  await page.getByRole('button', { name: '取消', exact: true }).click()
  await page.evaluate(() => history.replaceState(null, '', '/catalog?mockCase=permission-change'))
  await page.getByTestId('workspace-menu-trigger').click()
  await page.getByRole('menuitem', { name: '刷新工作区与权限', exact: true }).click()
  await expect(page.getByTestId('catalog-edit').first()).toBeDisabled()
  await expect(page.getByRole('dialog', { name: '编辑商品', exact: true })).not.toBeVisible()
  await expect(page.getByTestId('catalog-table')).not.toContainText('D2 应清除的旧授权输入')
})

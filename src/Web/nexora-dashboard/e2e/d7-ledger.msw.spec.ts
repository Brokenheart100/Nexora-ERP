import { expect, test, type Page } from '@playwright/test'
import { mockItemId, mockWorkspaceId } from '../app/mocks/api/catalog'
import { mswSourceWarehouse } from '../app/mocks/api/warehouse-operations'
import { chooseOption, uiChange } from './business-actions'

const finance = `/bff/api/finance/workspaces/${mockWorkspaceId}`
const batches = finance + '/ledger/opening-subledgers'
const path = (tab: string, actor: string, query = '') => `/finance?tab=${tab}&workspace=${mockWorkspaceId}&mockCase=d7-${actor}${query}`

async function login(page: Page, url: string) {
  await page.goto(url)
  await expect(page.getByTestId('user-menu-trigger')).toContainText('未登录', { timeout: 45_000 })
  await page.getByTestId('user-menu-trigger').click()
  await page.getByRole('menuitem', { name: '登录 Nexora', exact: true }).click()
}

test('D7 MSW 预览过期后重新导入，刷新仍可看到新科目', async ({ page }) => {
  const field = (id: string) => page.getByTestId(id)
  const input = JSON.stringify({ format: 'nexora.chart-structure.v1', accounts: [{ code: '9701', name: 'MSW 导入科目', category: 'asset' }] })
  await login(page, path('accounts', 'expired'))
  await field('chart-import-open').click()
  await field('chart-import-file').fill(input)
  await field('chart-import-preview-action').click()
  await expect(field('chart-import-preview')).toContainText('请重新预览')
  await expect(field('chart-import-commit')).toBeDisabled()
  await page.goto(path('accounts', 'maker'))
  await field('chart-import-open').click()
  await field('chart-import-file').fill(input)
  const preview = await uiChange<{ previewId: string }>(page, finance + '/chart/imports/preview', () => field('chart-import-preview-action').click(), 201)
  await uiChange(page, finance + '/chart/imports/' + preview.previewId + '/commit', () => field('chart-import-commit').click())
  await page.reload()
  await expect(page.getByText('MSW 导入科目', { exact: true })).toBeVisible()
})

for (const matched of [true, false]) {
  test(`D7 MSW 独立复核后等待库存回执并回读${matched ? '一致结果' : '对账差异'}`, async ({ page }) => {
    const field = (id: string) => page.getByTestId(id)
    await login(page, path('opening', 'maker'))
    await page.getByRole('tab', { name: '期初子账', exact: true }).click()
    await chooseOption(page, 'opening-subledger-equity', /3001 期初权益/)
    await field('opening-subledger-file').fill(`Kind,Reference,ResourceId,WarehouseId,Quantity,Amount,DueOn\nstock,D7-MSW-STOCK,${mockItemId},${mswSourceWarehouse},2,20,`)
    await field('opening-subledger-preview').click()
    await expect(field('opening-subledger-preview-panel')).toContainText('D7-MSW-STOCK')
    const batch = await uiChange(page, batches, () => field('opening-subledger-submit').click(), 201)
    await expect(field('opening-batch-state')).toHaveText('待独立复核')
    await expect(field('opening-batch-approve')).toHaveCount(0)
    await page.goto(path('opening', 'delay'))
    await field('opening-batch-open-' + batch.id).click()
    await uiChange(page, batches + '/' + batch.id + '/decision', () => field('opening-batch-approve').click())
    await expect(field('opening-batch-state')).toHaveText('库存应用中')

    await page.goto(path('accounts', 'maker-delay'))
    await field('account-add').click()
    await field('account-code').fill('D7-WAIT')
    await field('account-name').fill('过账期间禁止变更')
    await uiChange(page, finance + '/chart/accounts', () => field('account-submit').click(), 409)
    await page.goto(path('opening', matched ? 'reviewer' : 'reviewer-mismatch'))
    await field('opening-batch-open-' + batch.id).click()
    await expect(field('opening-batch-state')).toHaveText('已过账')
    await expect(page.getByText(matched ? '导入 20 · 子账 20 · 总账 20 · 一致' : '导入 20 · 子账 19 · 总账 20 · 有差异')).toBeVisible()
    await page.getByRole('link', { name: '查看凭证' }).click()
    await expect(field('journal-state')).toHaveText('已过账')
    if (!matched) {
      await page.goto(path('journals', 'reviewer-mismatch'))
      await field('ledger-scan').click()
      await expect(field('ledger-scan-result')).toContainText('1 个问题')
      await field('ledger-scan-result').getByRole('button', { name: '查看问题凭证' }).click()
      await expect(field('journal-state')).toHaveText('已过账')
    }
  })
}

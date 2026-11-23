import { expect, test, type Page } from '@playwright/test'
import { mockItemId, mockWorkspaceId } from '../app/mocks/api/catalog'
import { mswSalesMovement, mswSourceMovement, mswSourceWarehouse, mswTargetWarehouse } from '../app/mocks/api/warehouse-operations'
import { chooseOption, requestBusiness, uiChange } from './business-actions'

const inventory = `/bff/api/inventory/workspaces/${mockWorkspaceId}`
const wh = (warehouse: string) => inventory + '/warehouses/' + warehouse
const finance = `/bff/api/finance/workspaces/${mockWorkspaceId}`
const path = (warehouse: string, actor: string, tab = 'warehouse-ops') =>
  `/inventory?workspace=${mockWorkspaceId}&warehouse=${warehouse}&tab=${tab}&item=${mockItemId}&mockCase=d6-${actor}`

async function login(page: Page, url: string) {
  await page.goto(url)
  await expect(page.getByTestId('user-menu-trigger')).toContainText('未登录', { timeout: 45_000 })
  await page.getByTestId('user-menu-trigger').click()
  await page.getByRole('menuitem', { name: '登录 Nexora', exact: true }).click()
}

test('D6 MSW 源仓出库、目标仓签收与部分采购退货', async ({ page }) => {
  const field = (id: string) => page.getByTestId(id)
  await login(page, path(mswSourceWarehouse, 'source'))
  await field('transfer-ops-new').click()
  await chooseOption(page, 'stock-operation-item', /MSW 演示商品/)
  await chooseOption(page, 'stock-operation-destination', /目标仓/)
  await field('stock-operation-date').fill('2026-01-08')
  await field('stock-operation-quantity').fill('3')
  await field('stock-operation-reason').fill('MSW 验证在途')
  const transfer = await uiChange(page, wh(mswSourceWarehouse) + '/stock-operations', () => field('stock-operation-submit').click(), 201)
  await expect(field('stock-operation-state')).toHaveText('待复核')
  await expect(field('stock-operation-confirm')).toHaveCount(0)
  const operation = inventory + '/stock-operations/' + transfer.id
  await page.goto(path(mswSourceWarehouse, 'owner'))
  await field('stock-operation-' + transfer.id).getByRole('button', { name: '查看' }).click()
  const dispatched = await uiChange(page, operation + '/decision', () => field('stock-operation-confirm').click())
  await expect(field('stock-operation-state')).toHaveText('在途')
  await expect(field('transfer-ops-cost')).toContainText('18')
  await page.goto(path(mswTargetWarehouse, 'destination'))
  await field('stock-operation-' + transfer.id).getByRole('button', { name: '查看' }).click()
  await field('stock-operation-arrival').fill('2026-01-08')
  await uiChange(page, operation + '/receive', () => field('stock-operation-receive').click())
  await expect(field('stock-operation-state')).toHaveText('已完成')
  const stale = await requestBusiness(page, operation + '/receive', { expectedVersion: dispatched.version, on: '2026-01-08' })
  expect(stale.status).toBe(409)

  await page.goto(path(mswSourceWarehouse, 'owner', 'movements'))
  await field('movement-return-' + mswSourceMovement).click()
  await field('stock-return-date').fill('2026-01-08')
  await field('stock-return-qty-1').fill('2')
  await field('stock-return-reason').fill('MSW 验证部分退货')
  const returned = await uiChange(page, inventory + '/movements/' + mswSourceMovement + '/returns', () => field('stock-return-submit').click())
  await expect(field('stock-return-detail-status')).toHaveText('待仓库确认')
  await page.goto(path(mswSourceWarehouse, 'source', 'movements'))
  await field('stock-return-row-' + returned.id).getByRole('button', { name: '查看' }).click()
  const result = await uiChange(page, inventory + '/returns/' + returned.id + '/decision', () => field('stock-return-confirm').click())
  await expect(field('stock-return-detail-status')).toHaveText('仓库已确认')
  await page.goto(`/finance?workspace=${mockWorkspaceId}&tab=payables&stockReturn=${result.id}&mockCase=d6-reviewer`)
  const account = field('accounting-return-' + result.id)
  await uiChange(page, finance + '/trade/receipts/' + result.id + '/accrue', () => account.getByRole('button', { name: '处理未开票退货' }).click())
  await expect(account).toContainText('成本已入账')
})

for (const sale of [false, true]) {
  test(`D6 MSW ${sale ? '客户' : '供应商'}贷项与退款分别复核`, async ({ page }) => {
    const field = (id: string) => page.getByTestId(id)
    const moving = sale ? mswSalesMovement : mswSourceMovement
    const owner = sale ? 'owner' : 'owner-billed'
    const documents = finance + (sale ? '/receivables' : '/trade') + '/documents'
    const accounting = (actor: string, id: string) => (sale ? '/sales?tab=receivables' : '/finance?tab=payables')
      + `&workspace=${mockWorkspaceId}&stockReturn=${id}&mockCase=d6-${actor}`
    await login(page, path(mswSourceWarehouse, owner, 'movements'))
    await field('movement-return-' + moving).click()
    await field('stock-return-date').fill('2026-01-08')
    await field('stock-return-qty-1').fill('1')
    await field('stock-return-reason').fill('MSW 已开票退货')
    const requested = await uiChange(page, inventory + (sale ? '/shipments/' : '/movements/') + moving + '/returns', () => field('stock-return-submit').click())
    await page.goto(path(mswSourceWarehouse, 'source', 'movements'))
    await field('stock-return-row-' + requested.id).getByRole('button', { name: '查看' }).click()
    const result = await uiChange(page, inventory + (sale ? '/sales-returns/' : '/returns/') + requested.id + '/decision', () => field('stock-return-confirm').click())
    await page.goto(accounting(owner, result.id))
    await field('accounting-return-' + result.id).getByRole('button', { name: '新建贷项' }).click()
    await chooseOption(page, 'return-accounting-settlement', sale ? 'D6-MSW-INVOICE' : 'D6-MSW-BILL')
    await field('return-accounting-number').fill('MSW-CREDIT')
    await field('return-accounting-date').fill('2026-01-08')
    const credit = await uiChange(page, documents, () => field('return-accounting-submit').click(), 201)
    const approve = async (id: string) => {
      await page.goto(accounting('reviewer', result.id))
      const row = field('return-accounting-document-' + id)
      await uiChange(page, `${documents}/${id}/decision`, () => row.getByRole('button', { name: '复核通过并过账' }).click())
      await expect(row).toContainText('已过账')
    }
    await approve(credit.id)
    await page.goto(accounting(owner, result.id))
    await field('return-accounting-document-' + credit.id).getByRole('button', { name: '登记退款' }).click()
    await field('return-accounting-number').fill('MSW-REFUND')
    await field('return-accounting-date').fill('2026-01-08')
    const refund = await uiChange(page, documents, () => field('return-accounting-submit').click(), 201)
    await approve(refund.id)
    await expect(field('return-accounting-document-' + credit.id)).toContainText('可退款 0')
  })
}

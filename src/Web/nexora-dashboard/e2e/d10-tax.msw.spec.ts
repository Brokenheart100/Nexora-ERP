import { expect, test, type Page } from '@playwright/test'
import { mockWorkspaceId } from '../app/mocks/api/catalog'
import type { TaxFiling, TaxSnapshot } from '../shared/types/tax'
import { chooseOption, readBusiness, requestBusiness, uiChange } from './business-actions'
import { addRate, addTaxGroup, showPeriod, taxEntry, taxRoot } from './d10-tax-actions'

const root = taxRoot(mockWorkspaceId)
const on = '2026-01-11'

async function login(page: Page, scenario = 'd10') {
  await page.goto(taxEntry(mockWorkspaceId, scenario))
  const user = page.getByTestId('user-menu-trigger')
  await expect(user).toContainText('未登录', { timeout: 45000 })
  await user.click()
  await page.getByRole('menuitem', { name: '登录 Nexora', exact: true }).click()
}

test('D10 MSW 税率版本变更后仍能回读原含税快照', async ({ page }) => {
  await login(page)
  const field = (id: string) => page.getByTestId(id)
  const first = await addRate(page, root, '0.13', '2026-01-01')
  await addTaxGroup(page, root)
  await field('tax-assess-on').fill(on)
  await chooseOption(page, 'tax-assess-group', /D10-STD/)
  await field('tax-assess-price').fill('1130')
  await field('tax-assess-discount').fill('0.10')
  await field('tax-assess-inclusive').click()
  const saved = await uiChange<TaxSnapshot>(page, root + '/assessments', () => field('tax-assess-save').click())
  expect(saved.amounts).toMatchObject({ net: '900', tax: '117', total: '1017', components: [expect.objectContaining({ rateId: first.id })] })
  await addRate(page, root, '0.14', '2026-02-01')
  await page.reload()
  await field('tax-assessment-id').fill(saved.id)
  await field('tax-assessment-detail-open').click()
  await expect(field('tax-assessment-detail')).toContainText('117.00')
  await expect(field('tax-assessment-detail')).toContainText('2026-01-01')
})

test('D10 MSW 申报响应丢失后按原提交重试，只产生一个历史版本', async ({ page }) => {
  await login(page, 'd10-unknown')
  const field = (id: string) => page.getByTestId(id)
  await field('tax-calendar-edit').click()
  await chooseOption(page, 'tax-calendar-cycle', '季度')
  await chooseOption(page, 'tax-calendar-basis', '收付实现制')
  await uiChange(page, root + '/calendar', () => field('tax-calendar-save').click(), 200, 'PUT')
  const preview = await showPeriod(page, root, on)
  expect(preview.current.period.through).toBe('2026-03-31')
  expect(preview.current.basis).toBe('cash')
  await field('tax-filing-open').click()
  await field('tax-filing-reference').fill('MSW-D10-FILING')
  await field('tax-filing-submit').click()
  await expect(page.getByRole('dialog').getByRole('button', { name: '核对原提交' })).toBeVisible()
  await page.reload()
  const filed = await showPeriod(page, root, on)
  expect(filed.filings).toHaveLength(1)
  await page.getByRole('button', { name: '核对原提交', exact: true }).click()
  const saved = await uiChange<TaxFiling>(page, root + '/periods/2026-01-01/filings', () =>
    page.getByRole('button', { name: '重试原提交', exact: true }).click(), 201)
  expect(saved.filing.id).toBe(filed.filings[0]?.id)
  await expect(field('tax-filing-detail')).toContainText('MSW-D10-FILING')
  expect((await readBusiness<TaxFiling>(page, root + '/filings/' + saved.filing.id)).filing.version).toBe(1)
})

test('D10 MSW 只读身份不能维护税组或申报，缺期间管理权限时隐藏锁账', async ({ page }) => {
  await login(page, 'd10-reader')
  await showPeriod(page, root, on)
  for (const id of ['tax-rate-create', 'tax-group-create', 'tax-assess-save', 'tax-calendar-edit', 'tax-filing-open'])
    await expect(page.getByTestId(id)).toHaveCount(0)
  const rejected = await requestBusiness(page, root + '/rates', { code: 'X', rate: '0.13', name: '只读测试', effectiveOn: on })
  expect(rejected.status).toBe(403)
  await page.goto(taxEntry(mockWorkspaceId, 'd10-no-lock'))
  await showPeriod(page, root, on)
  await page.getByTestId('tax-filing-open').click()
  await expect(page.getByTestId('tax-filing-lock')).toHaveCount(0)
})

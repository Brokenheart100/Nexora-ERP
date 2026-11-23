import { expect, type Page } from '@playwright/test'
import { readBusiness, uiChange } from './business-actions'
import type { TaxPeriod } from '../shared/types/tax'

export const taxRoot = (workspace: string) => '/bff/api/finance/workspaces/' + workspace + '/tax'
export const taxEntry = (workspace: string, scenario?: string) =>
  '/finance?tab=tax-center&workspace=' + workspace + (scenario ? '&mockCase=' + scenario : '')

export async function addRate(page: Page, tax: string, rate: string, on: string) {
  const field = (id: string) => page.getByTestId(id)
  await field('tax-rate-create').click()
  await field('tax-rate-code').fill('D10-VAT')
  await field('tax-rate-name').fill('D10 联调税率')
  await field('tax-rate-on').fill(on)
  await field('tax-rate-value').fill(rate)
  const result = await uiChange(page, tax + '/rates', () => field('tax-rate-save').click())
  await expect(field('tax-rate-table')).toContainText(on)
  return result
}

export async function addTaxGroup(page: Page, tax: string) {
  const field = (id: string) => page.getByTestId(id)
  await expect(field('tax-group-create')).toBeEnabled()
  await field('tax-group-create').click()
  await field('tax-group-code').fill('D10-STD')
  await field('tax-group-name').fill('D10 标准税组')
  await field('tax-group-rates').click()
  await page.getByRole('option', { name: 'D10-VAT', exact: true }).click()
  await field('tax-group-name').click()
  await uiChange(page, tax + '/groups', () => field('tax-group-save').click())
  await expect(field('tax-group-table')).toContainText('D10-STD')
}

export async function showPeriod(page: Page, tax: string, on: string) {
  await page.getByTestId('tax-period-date').fill(on)
  await page.getByTestId('tax-period-load').click()
  await expect(page.getByTestId('tax-period-current')).toBeVisible()
  const response = await readBusiness<TaxPeriod>(page, tax + '/periods/' + on)
  await expect(page.getByTestId('tax-period-current')).toContainText(response.current.period.through)
  return response
}

import { expect, type Page } from '@playwright/test'
import { api, write } from './helpers'

export interface BusinessChange { id: string, version: string | number }

export async function readBusiness<T>(page: Page, path: string): Promise<T> {
  const result = await api(page, path)
  expect(result.status, path + ' ' + result.text).toBe(200)
  return JSON.parse(result.text) as T
}
export function requestBusiness(page: Page, path: string, input: object, method: 'POST' | 'PUT' = 'POST', operationId = crypto.randomUUID()) {
  return write(page, path, method, { ...input, operationId }, { 'Idempotency-Key': operationId })
}
export async function changeBusiness<T = BusinessChange>(page: Page, path: string, input: object, status = 200, method: 'POST' | 'PUT' = 'POST') {
  const result = await requestBusiness(page, path, input, method)
  expect(result.status, path + ' ' + result.text).toBe(status)
  return JSON.parse(result.text) as T
}
export async function uiChange<T = BusinessChange>(
  page: Page, path: string, action: () => Promise<void>, status = 200, method = 'POST'
) {
  const [result] = await Promise.all([
    page.waitForResponse(response => new URL(response.url()).pathname === path && response.request().method() === method),
    action()
  ])
  const body = await result.text()
  expect(result.status(), path + ' ' + body).toBe(status)
  return JSON.parse(body) as T
}
export async function chooseOption(page: Page, id: string, option: string | RegExp) {
  await expect(page.getByRole('option')).toHaveCount(0)
  await page.getByTestId(id).click()
  await page.getByRole('option', { name: option, exact: typeof option === 'string' }).click()
  await expect(page.getByRole('option')).toHaveCount(0)
}

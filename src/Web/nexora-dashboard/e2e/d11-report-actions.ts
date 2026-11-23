import { readFile } from 'node:fs/promises'
import { expect, type Page, type Response } from '@playwright/test'
import type { FinancialReport, ReportExport } from '../shared/types/reporting'

export const reportFrom = '2026-01-08'
export const reportThrough = '2026-01-10'
export const routeFor = (workspace: string, tab: string, scenario?: string, fields = '') =>
  '/finance?workspace=' + workspace + '&tab=' + tab + (scenario ? '&mockCase=' + scenario : '') + fields

export async function queryReport(page: Page, root: string) {
  const field = (id: string) => page.getByTestId(id)
  await field('report-from').fill(reportFrom)
  await field('report-through').fill(reportThrough)
  const response = page.waitForResponse(response => new URL(response.url()).pathname === root && new URL(response.url()).searchParams.get('through') === reportThrough)
  await field('report-apply').click()
  const result = await response
  expect(result.status(), await result.text()).toBe(200)
  const snapshot = await result.json() as FinancialReport
  await expect(field('report-snapshot')).toContainText('过账水位 ' + snapshot.watermark)
  return snapshot
}

export async function exportJob(page: Page, path: string, testId: string) {
  const [response] = await Promise.all([
    page.waitForResponse(response => new URL(response.url()).pathname === path && response.request().method() === 'POST'),
    page.getByTestId(testId).click()
  ])
  expect(response.status(), await response.text()).toBe(201)
  const job = await response.json() as ReportExport
  const root = path.split('/report-exports')[0] + '/report-exports'
  expect(response.headers().location).toBe(root + '/' + job.id)
  await expect(page.getByTestId('report-export-detail')).toContainText('过账水位 ' + job.watermark)
  return job
}

export async function captureFile(page: Page, button: string) {
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId(button).click()])
  return { name: download.suggestedFilename(), bytes: await readFile(await download.path()) }
}

export function pinned(response: Response, snapshot: FinancialReport) {
  const path = new URL(response.url())
  expect(path.searchParams.get('watermark')).toBe(String(snapshot.watermark))
  expect(path.searchParams.get('from')).toBe(snapshot.period.from)
  expect(path.searchParams.get('through')).toBe(snapshot.period.through)
  expect(path.searchParams.get('basis')).toBe(snapshot.basis)
}

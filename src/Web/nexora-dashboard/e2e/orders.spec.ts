import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { api, baseline, login, write } from './helpers'
import { createApiClient } from '../app/utils/api/client'
import { RequestScope } from '../app/utils/api/scope'

test('采购销售同操作重放、额度、202 恢复查询和 CSV/PDF 头', async ({ browser, page }) => {
  await login(page)
  const org = `/bff/api/workspaces/${baseline.workspace.id}`
  for (const area of ['sales', 'purchasing']) {
    const quota = JSON.parse((await api(page, org + '/billing/entitlements')).text).usage.documentsThisMonth
    const path = `/bff/api/${area}/workspaces/${baseline.workspace.id}/orders`
    const operationId = randomUUID()
    const payload = { operationId, number: 'D12-' + operationId.slice(0, 12), isQuote: false,
      draft: { on: '2026-01-03', [area === 'sales' ? 'customerId' : 'supplierId']: area === 'sales' ? baseline.customer.id : baseline.supplier.id,
        note: 'D1/D2 BFF idempotency acceptance', lines: [{ itemId: baseline.product.id, quantity: '1', unitPrice: '100' }] } }
    const made = await write(page, path, 'POST', payload, { 'Idempotency-Key': operationId })
    expect(made.status, made.text).toBe(201)
    expect(made.headers.location).toBe(path + '/' + JSON.parse(made.text).id)
    const replay = await write(page, path, 'POST', payload, { 'Idempotency-Key': operationId })
    expect(replay.status).toBe(201)
    expect(replay.text).toBe(made.text)
    const after = JSON.parse((await api(page, org + '/billing/entitlements')).text).usage.documentsThisMonth
    expect(after).toBe(quota + 1)
    const rows = JSON.parse((await api(page, path + '?pageSize=100')).text).orders
    expect(rows.filter((row: { id: string }) => row.id === JSON.parse(made.text).id)).toHaveLength(1)
    if (area === 'purchasing') {
      const order = path + '/' + JSON.parse(made.text).id
      const detail = JSON.parse((await api(page, order)).text)
      const submitted = await write(page, order + '/decision', 'POST', { decision: 'submit', expectedVersion: 1, operationId: randomUUID() })
      expect(submitted.status, submitted.text).toBe(200)
      const context = await browser.newContext({ baseURL: 'https://localhost:7444' })
      try {
        const reviewer = await context.newPage()
        await login(reviewer, 'bob')
        const approved = await write(reviewer, order + '/decision', 'POST', { decision: 'approve', expectedVersion: JSON.parse(submitted.text).version, operationId: randomUUID() })
        expect(approved.status, approved.text).toBe(200)
        const issued = await write(reviewer, order + '/receipts', 'POST', { operationId: randomUUID(), expectedVersion: JSON.parse(approved.text).version,
          lineId: detail.lines[0].id, warehouseId: baseline.warehouse.id, quantity: '1' })
        expect(issued.status, issued.text).toBe(202)
        expect(issued.headers.location).toBe(order + '/receipts')
        const permitId = JSON.parse(issued.text).permitId
        const client = createApiClient(new RequestScope({ mode: 'live', subject: 'alice', workspaceId: baseline.workspace.id, authorizationVersion: 'acceptance' }),
          async (path) => {
            const response = await api(page, path)
            return { status: response.status, data: JSON.parse(response.text), headers: new Headers(response.headers) }
          })
        const result = await client.poll<{ permits: { id: string, state: string }[] }>(issued.headers.location!, {
          complete: response => response.data.permits.some(permit => permit.id === permitId && permit.state === 'issued'), budgetMs: 15_000
        })
        expect(result.status).toBe(200)
      } finally { await context.close() }
    }
  }
  const csv = await api(page, `/bff/api/finance/workspaces/${baseline.workspace.id}/record-changes.csv`)
  expect(csv.status, csv.text).toBe(200)
  expect(csv.headers['content-type']).toContain('text/csv')
  expect(csv.headers['content-disposition']).toContain('attachment;')
  const pdf = await api(page, `/bff/api/finance/workspaces/${baseline.workspace.id}/reports/balance-sheet/pdf?from=2026-01-01&through=2026-01-31`)
  expect(pdf.status, pdf.text.slice(0, 150)).toBe(200)
  expect(pdf.headers['content-type']).toContain('application/pdf')
  expect(pdf.headers['content-disposition']).toContain('attachment;')
  expect(pdf.text.startsWith('%PDF')).toBe(true)
})

// @vitest-environment node
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest'
import { setupServer } from 'msw/node'
import { createDashboardHandlers, mockWorkspaceId, mockItemId } from '../app/mocks/api/handlers'
import { mockSupplierId } from '../app/mocks/api/purchasing'

const server = setupServer()
const host = 'https://dashboard.invalid/bff/api'
const orderRoot = `${host}/purchasing/workspaces/${mockWorkspaceId}/orders`
let scenario = 'd4',
  values: Map<string, string>
const storage = {
  getItem: (key: string) => values.get(key) ?? null,
  setItem: (key: string, value: string) => {
    values.set(key, value)
  }
}
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
beforeEach(() => {
  scenario = 'd4'
  values = new Map()
  server.use(...createDashboardHandlers({ scenario: () => scenario, storage }))
})
afterEach(() => server.resetHandlers())
afterAll(() => server.close())
async function post(path: string, fields: object, operationId = crypto.randomUUID()) {
  return fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-CSRF-TOKEN': 'msw-only-csrf', 'Idempotency-Key': operationId },
    body: JSON.stringify({ ...fields, operationId })
  })
}
async function create() {
  const response = await post(orderRoot, {
    number: 'D4-' + crypto.randomUUID(),
    draft: {
      supplierId: mockSupplierId,
      on: '2026-01-03',
      note: '',
      departmentId: null,
      lines: [{ itemId: mockItemId, quantity: '100', unitPrice: '10' }]
    }
  })
  expect(response.status).toBe(201)
  return response.json()
}
it('D4 MSW enforces independent approval and warehouse revisions before executing a receipt once', async () => {
  const made = await create(),
    path = orderRoot + '/' + made.id
  const submitted = await post(path + '/decision', { expectedVersion: made.version, decision: 'submit', reason: '' })
  const pending = await submitted.json()
  expect((await post(path + '/decision', { expectedVersion: pending.version, decision: 'approve', reason: '' })).status).toBe(403)
  scenario = 'd4-reviewer'
  const approved = await (
    await post(path + '/decision', { expectedVersion: pending.version, decision: 'approve', reason: '' })
  ).json()
  const detail = await (await fetch(path)).json()
  const warehouseRoot = `${host}/inventory/workspaces/${mockWorkspaceId}`
  const warehouse = (await (await fetch(warehouseRoot + '/warehouses')).json()).warehouses[0]
  const issue = await post(path + '/receipts', {
    expectedVersion: approved.version,
    lineId: detail.lines[0].id,
    warehouseId: warehouse.id,
    quantity: '40'
  })
  expect(issue.status).toBe(202)
  expect(issue.headers.get('location')).toContain('/receipts')
  const permit = await issue.json()
  scenario = 'd4-receiver'
  const tasks = await (await fetch(warehouseRoot + '/warehouses/' + warehouse.id + '/receipts')).json()
  expect(tasks).toHaveLength(1)
  expect(
    (
      await post(warehouseRoot + '/receipts/' + permit.permitId + '/receive', {
        expectedRevision: 0,
        on: '2026-01-03',
        quantity: '40'
      })
    ).status
  ).toBe(409)
  const operationId = crypto.randomUUID(),
    fields = { expectedRevision: tasks[0].revision, on: '2026-01-03', quantity: '40' }
  expect((await post(warehouseRoot + '/receipts/' + permit.permitId + '/receive', fields, operationId)).status).toBe(200)
  expect((await post(warehouseRoot + '/receipts/' + permit.permitId + '/receive', fields, operationId)).status).toBe(200)
  expect(await (await fetch(warehouseRoot + '/warehouses/' + warehouse.id + '/movements')).json()).toHaveLength(1)
})
it('D4 MSW keeps a committed lost response across reload and rejects changing its original operation', async () => {
  scenario = 'd4-order-unknown'
  const operationId = crypto.randomUUID(),
    fields = {
      number: 'D4-UNKNOWN',
      draft: {
        supplierId: mockSupplierId,
        on: '2026-01-03',
        note: '',
        departmentId: null,
        lines: [{ itemId: mockItemId, quantity: '100', unitPrice: '10' }]
      }
    }
  await expect(post(orderRoot, fields, operationId)).rejects.toThrow()
  server.resetHandlers()
  server.use(...createDashboardHandlers({ scenario: () => scenario, storage }))
  expect((await post(orderRoot, fields, operationId)).status).toBe(201)
  expect((await post(orderRoot, { ...fields, number: 'CHANGED' }, operationId)).status).toBe(409)
  expect(
    (await (await fetch(orderRoot)).json()).orders.filter((value: { number: string }) => value.number === 'D4-UNKNOWN')
  ).toHaveLength(1)
})

it('D4 MSW posts a 1130 supplier bill and a separately approved 600 payment once, leaving 530', async () => {
  const made = await create(),
    path = orderRoot + '/' + made.id
  const submitted = await (await post(path + '/decision', { expectedVersion: made.version, decision: 'submit', reason: '' })).json()
  scenario = 'd4-reviewer'
  const approved = await (
    await post(path + '/decision', { expectedVersion: submitted.version, decision: 'approve', reason: '' })
  ).json()
  const detail = await (await fetch(path)).json(),
    inventory = `${host}/inventory/workspaces/${mockWorkspaceId}`
  const warehouse = (await (await fetch(inventory + '/warehouses')).json()).warehouses[0]
  const permit = await (
    await post(path + '/receipts', {
      expectedVersion: approved.version,
      lineId: detail.lines[0].id,
      warehouseId: warehouse.id,
      quantity: '100'
    })
  ).json()
  scenario = 'd4-receiver'
  const task = (await (await fetch(inventory + '/warehouses/' + warehouse.id + '/receipts')).json())[0]
  expect(
    (
      await post(inventory + '/receipts/' + permit.permitId + '/receive', {
        expectedRevision: task.revision,
        on: '2026-01-03',
        quantity: '100'
      })
    ).status
  ).toBe(200)
  const finance = `${host}/finance/workspaces/${mockWorkspaceId}`
  scenario = 'd4'
  const receipts = await (await fetch(finance + '/trade/receipts')).json()
  expect(receipts).toHaveLength(1)
  expect(receipts[0].fact.orderId).toBe(made.id)
  const assessment = await (
    await post(finance + '/tax/assessments', {
      on: '2026-01-04',
      groupCode: 'MSW-VAT13',
      itemId: mockItemId,
      partnerId: mockSupplierId,
      quantity: '100',
      unitPrice: '10',
      discount: '0',
      includesTax: false
    })
  ).json()
  expect(assessment.amounts).toMatchObject({ net: '1000', tax: '130', total: '1130' })
  const bill = await (
    await post(finance + '/trade/documents', {
      terms: {
        kind: 1,
        on: '2026-01-04',
        number: 'D4-BILL',
        memo: 'D4 bill',
        amount: '1000',
        quantity: '100',
        partnerId: mockSupplierId,
        billReceipts: [{ receiptId: receipts[0].fact.id, quantity: '100', net: '1000', taxAssessmentId: assessment.id }]
      }
    })
  ).json()
  expect(
    (await post(finance + '/trade/documents/' + bill.id + '/decision', { expectedVersion: bill.version, decision: 'approve' }))
      .status
  ).toBe(409)
  scenario = 'd4-reviewer'
  expect(
    (await post(finance + '/trade/documents/' + bill.id + '/decision', { expectedVersion: bill.version, decision: 'approve' }))
      .status
  ).toBe(200)
  scenario = 'd4'
  const home = await (await fetch(finance + '/trade')).json()
  const payment = await (
    await post(finance + '/trade/documents', {
      terms: {
        kind: 2,
        on: '2026-01-05',
        number: 'D4-PAY',
        memo: 'D4 partial payment',
        amount: '600',
        quantity: '0',
        sourceId: bill.id,
        partnerId: mockSupplierId,
        bankId: home.banks[0].id
      }
    })
  ).json()
  scenario = 'd4-reviewer'
  const operationId = crypto.randomUUID(),
    decision = { expectedVersion: payment.version, decision: 'approve' }
  expect((await post(finance + '/trade/documents/' + payment.id + '/decision', decision, operationId)).status).toBe(200)
  expect((await post(finance + '/trade/documents/' + payment.id + '/decision', decision, operationId)).status).toBe(200)
  expect((await (await fetch(finance + '/trade/documents/' + bill.id)).json()).outstanding).toBe('530')
  const movements = await (await fetch(finance + '/trade/banks/' + home.banks[0].id + '/movements')).json()
  expect(movements).toHaveLength(1)
  expect(movements[0].amount).toBe('-600')
  expect((await (await fetch(finance + '/reporting/aging/payables?through=2026-01-31')).json()).total).toBe('530')
})

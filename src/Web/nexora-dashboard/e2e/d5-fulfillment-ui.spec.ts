import { expect, test, type Page, type Response } from '@playwright/test'
import { api, baseline, emailLogin, login, write } from './helpers'
import type { InventoryReceipt, PurchaseDetail } from '../shared/types/purchasing'
import type { CustomerDocument, ShipmentAllowance } from '../shared/types/receivables'
import type { WarehouseShipment } from '../shared/types/sales'
import type { BankMovement, TradeJournal } from '../shared/types/trade'
import { compareDecimal, sumDecimals } from '../shared/utils/decimal'

const workspaceId = baseline.workspace.id
const master = `/bff/api/masterdata/workspaces/${workspaceId}`
const purchase = `/bff/api/purchasing/workspaces/${workspaceId}/orders`
const sales = `/bff/api/sales/workspaces/${workspaceId}/orders`
const inventory = `/bff/api/inventory/workspaces/${workspaceId}`
const finance = `/bff/api/finance/workspaces/${workspaceId}`
const ar = finance + '/receivables'
const warehouse = baseline.warehouse.id
const warehousePath = inventory + '/warehouses/' + warehouse
const shipOn = '2026-01-04'
const invoiceOn = '2026-01-05'
const docPage = (id?: string) => `/sales?tab=receivables&workspace=${workspaceId}${id ? '&document=' + id : ''}`
const orderPage = (id: string) => `/sales?workspace=${workspaceId}&order=${id}`
type Change = { id: string, version: number | string }
type Numbering = { pattern: string | null, startingNumber: number, version: number }

async function read<T>(page: Page, path: string) {
  const result = await api(page, path)
  expect(result.status, path + ' ' + result.text).toBe(200)
  return JSON.parse(result.text) as T
}
function attempt(page: Page, path: string, body: object, method: 'POST' | 'PUT' = 'POST') {
  const operationId = crypto.randomUUID()
  return write(page, path, method, { ...body, operationId }, { 'Idempotency-Key': operationId })
}
async function command<T = Change>(page: Page, path: string, body: object, status = 200, method: 'POST' | 'PUT' = 'POST') {
  const result = await attempt(page, path, body, method)
  expect(result.status, path + ' ' + result.text).toBe(status)
  return JSON.parse(result.text) as T
}
function response(page: Page, path: string, method = 'POST') {
  return page.waitForResponse(result => new URL(result.url()).pathname === path && result.request().method() === method)
}
async function confirmed<T = Change>(pending: Promise<Response>, expected: number) {
  const result = await pending
  const body = await result.text()
  expect(result.status(), body).toBe(expected)
  return JSON.parse(body) as T
}
async function option(page: Page, id: string, label: RegExp) {
  await page.getByTestId(id).click()
  await page.getByRole('option', { name: label }).click()
}
async function seedStock(maker: Page, reviewer: Page, receiver: Page, tag: string) {
  const { categoryId, unitId } = await read<{ categoryId: string, unitId: string }>(maker, master + '/items/' + baseline.product.id)
  const item = await command(maker, master + '/items', {
    code: 'D5-STOCK-' + tag, name: 'D5 发货验收 ' + tag, kind: 'product', tracksInventory: true, categoryId, unitId
  }, 201)
  await command(maker, finance + '/tax/classifications', { kind: 'item', resourceId: item.id, groupCode: 'D0-TAX', expectedVersion: 0 })
  const terms = { on: '2026-01-03', lines: [{ itemId: item.id, quantity: '101', unitPrice: '6' }] }
  const purchaseOrder = await command(maker, purchase, { number: 'D5-PO-' + tag, draft: { ...terms, supplierId: baseline.supplier.id } }, 201)
  const purchasePath = purchase + '/' + purchaseOrder.id
  const sent = await command(maker, purchasePath + '/decision', { decision: 'submit', expectedVersion: purchaseOrder.version })
  const approved = await command(reviewer, purchasePath + '/decision', { decision: 'approve', expectedVersion: sent.version })
  const details = await read<PurchaseDetail>(reviewer, purchasePath)
  const permit = await command<{ permitId: string }>(reviewer, purchasePath + '/receipts',
    { lineId: details.lines[0]!.id, warehouseId: warehouse, quantity: '101', expectedVersion: approved.version }, 202)
  let receipt: InventoryReceipt | undefined
  await expect.poll(async () => {
    receipt = (await read<InventoryReceipt[]>(receiver, warehousePath + '/receipts')).find(row => row.ticket.permitId === permit.permitId)
    return !!receipt
  }).toBe(true)
  await command(receiver, inventory + '/receipts/' + permit.permitId + '/receive',
    { on: '2026-01-03', quantity: '101', expectedRevision: receipt!.revision })
  return item.id
}
async function issue(reviewer: Page, orderId: string, quantity: string) {
  expect((await reviewer.goto(orderPage(orderId)))?.status()).toBe(200)
  await expect(reviewer.getByTestId('sales-order-fulfill')).toBeVisible()
  await reviewer.getByTestId('sales-order-fulfill').click()
  await option(reviewer, 'sales-fulfillment-warehouse', new RegExp(baseline.warehouse.code))
  await reviewer.getByTestId('sales-fulfillment-qty').fill(quantity)
  const pending = response(reviewer, sales + '/' + orderId + '/fulfillments')
  await reviewer.getByTestId('sales-fulfillment-confirm').click()
  const change = await confirmed<{ permitIds: string[] }>(pending, 202)
  expect((await pending).headers().location).toBe(sales + '/' + orderId + '/fulfillments')
  const permit = change.permitIds[0]!
  await expect(reviewer.getByTestId('stock-permit-status-' + permit)).toHaveText('已预留')
  return permit
}
async function ship(receiver: Page, permit: string, quantity: string) {
  await receiver.goto(`/inventory?tab=operations&workspace=${workspaceId}&warehouse=${warehouse}`)
  await receiver.getByTestId('permit-execute-' + permit).click()
  await receiver.getByTestId('permit-execution-date').fill(shipOn)
  await receiver.getByTestId('permit-execution-qty-1').fill(quantity)
  const pending = response(receiver, inventory + '/shipments/' + permit + '/ship')
  await receiver.getByTestId('permit-execution-submit').click()
  const result = await confirmed(pending, 200)
  await expect(receiver.getByTestId('permit-execution-submit')).not.toBeVisible()
  return result
}
async function approve(page: Page, id: string) {
  await page.goto(docPage(id))
  const pending = response(page, ar + '/documents/' + id + '/decision')
  await page.getByTestId('sales-receivable-approve').click()
  await confirmed(pending, 200)
  await expect(page.getByTestId('invoice-detail-status')).toHaveText('已过账')
}
const sourceAmount = (page: Page, rowId: string) => page.getByTestId('invoice-source-' + rowId).getByTestId('sales-invoice-quantity')

test('D5 真实仓库分批发货、发票编号竞争与收款核销', async ({ browser }, testInfo) => {
  test.setTimeout(330_000)
  const maker = await browser.newPage()
  const reviewer = await browser.newPage()
  const receiver = await browser.newPage()
  const tag = Date.now().toString(36).toUpperCase()
  let numbering: Numbering | null = null
  const testPattern = 'D5-' + tag + '-{FY}-{####}'
  try {
    await Promise.all([login(maker, 'alice'), login(reviewer, 'bob'), emailLogin(receiver, baseline.receiver.email)])
    const before = await read<Numbering>(maker, ar + '/invoice-numbering')
    if (!before.pattern) {
      await command(maker, ar + '/invoice-numbering', { expectedVersion: before.version, pattern: testPattern, startingNumber: before.startingNumber }, 200, 'PUT')
      numbering = before
    }
    const itemId = await seedStock(maker, reviewer, receiver, tag)
    const order = await command(maker, sales, { number: 'D5-ORDER-' + tag, draft: { on: shipOn,
      customerId: baseline.customer.id, lines: [{ itemId, quantity: '103', unitPrice: '10' }] } }, 201)
    const submitted = await command(maker, sales + '/' + order.id + '/decision', { decision: 'submit', expectedVersion: order.version })
    await command(reviewer, sales + '/' + order.id + '/decision', { decision: 'approve', expectedVersion: submitted.version })
    const permit = await issue(reviewer, order.id, '101')
    const first = await ship(receiver, permit, '40')
    const afterFirst = (await read<WarehouseShipment[]>(receiver, warehousePath + '/shipments')).find(row => row.id === permit)
    expect(afterFirst?.executed).toBe('40')
    expect(afterFirst?.canShip).toBe(true)
    const second = await ship(receiver, permit, '60')

    await reviewer.goto(orderPage(order.id))
    await expect(reviewer.getByTestId('stock-permit-' + permit)).toContainText('100 / 101')
    await reviewer.getByTestId('sales-fulfillment-reason').fill('D5 验证取消未执行的一件')
    const cancelling = response(reviewer, sales + '/' + order.id + '/fulfillments/' + permit + '/cancel')
    await reviewer.getByTestId('stock-permit-cancel-' + permit).click()
    await confirmed(cancelling, 200)
    await expect(reviewer.getByTestId('stock-permit-status-' + permit)).toHaveText('已取消')
    const replacement = await issue(reviewer, order.id, '1')
    const extra = await ship(receiver, replacement, '1')
    await reviewer.goto(orderPage(order.id))
    await expect(reviewer.getByTestId('stock-permit-status-' + replacement)).toHaveText('已发齐')
    await reviewer.getByTestId('sales-fulfillment-reason').fill('D5 结束剩余未签发数量')
    await reviewer.getByTestId('sales-close-fulfillment').click()
    await expect(reviewer.getByTestId('sales-order-detail-status')).toHaveText('已关闭')

    const movementRows = await read<{ id: string, cost: string, quantity: string }[]>(receiver, warehousePath + '/movements?itemId=' + itemId)
    expect(sumDecimals(movementRows.filter(row => [first.id, second.id].includes(row.id)).map(row => row.cost))).toBe('-600')
    let facts: ShipmentAllowance[] = []
    await expect.poll(async () => {
      facts = (await read<ShipmentAllowance[]>(maker, ar + '/shipments')).filter(row => row.orderId === order.id && row.posted)
      return facts.length
    }).toBe(3)
    const ship40 = facts.find(row => row.quantity === '40')!
    const ship60 = facts.find(row => row.quantity === '60')!
    const ship1 = facts.find(row => row.quantity === '1')!
    expect([first.id, second.id, extra.id]).toEqual(expect.arrayContaining(facts.map(row => row.id)))

    await maker.goto(docPage())
    await maker.getByTestId('receivable-shipment-' + ship40.id).getByRole('button', { name: '开票', exact: true }).click()
    await maker.getByTestId('sales-invoice-date').fill(invoiceOn)
    await sourceAmount(maker, ship40.id).fill('40')
    await sourceAmount(maker, ship60.id).fill('59')
    const creating = response(maker, ar + '/documents')
    await maker.getByTestId('sales-invoice-submit').click()
    const invoice = await confirmed(creating, 201)
    await expect(maker.getByTestId('invoice-detail-status')).toHaveText('待独立复核')
    await maker.getByTestId('sales-invoice-edit').click()
    await sourceAmount(maker, ship60.id).fill('60')
    const revising = response(maker, ar + '/documents/' + invoice.id, 'PUT')
    await maker.getByTestId('sales-invoice-submit').click()
    await confirmed(revising, 200)
    const excess = await attempt(maker, ar + '/documents', { draft: { kind: 'invoice', number: 'OVER-' + tag, on: invoiceOn,
      lines: [{ shipmentId: ship40.id, quantity: '1' }] } })
    expect(excess.status, excess.text).toBe(409)

    const extraInvoice = await command(maker, ar + '/documents', { draft: { kind: 'invoice', number: '', on: invoiceOn,
      lines: [{ shipmentId: ship1.id, quantity: '1' }] } }, 201)
    await reviewer.goto(docPage(invoice.id))
    await reviewer.getByTestId('sales-invoice-preview-number').click()
    const older = await reviewer.getByTestId('sales-invoice-candidate').innerText()
    await command(reviewer, ar + '/documents/' + extraInvoice.id + '/decision',
      { approve: true, expectedVersion: extraInvoice.version, expectedNumber: older })
    const staleNumber = response(reviewer, ar + '/documents/' + invoice.id + '/decision')
    await reviewer.getByTestId('sales-receivable-approve').click()
    const conflict = await confirmed<{ code: string }>(staleNumber, 409)
    expect(conflict.code).toBe('finance.invoice_number_changed')
    await expect(reviewer.getByTestId('sales-invoice-candidate')).not.toHaveText(older)
    await expect(reviewer.getByTestId('sales-operation-status')).toContainText('候选编号已变化')
    await reviewer.getByTestId('sales-receivable-approve').click()
    await expect(reviewer.getByTestId('invoice-outstanding')).toHaveText('1,130.00')

    await maker.goto(docPage(invoice.id))
    await maker.getByTestId('invoice-register-receipt').click()
    await maker.getByTestId('receipt-reference').fill('D5-R-' + tag)
    await maker.getByTestId('receipt-amount').fill('500')
    await maker.getByTestId('receipt-date').fill(invoiceOn)
    await option(maker, 'receipt-bank', /D0-BANK/)
    const recording = response(maker, ar + '/documents')
    await maker.getByTestId('receipt-submit').click()
    const receipt = await confirmed(recording, 201)
    await approve(reviewer, receipt.id)
    await expect(reviewer.getByTestId('invoice-outstanding')).toHaveText('500.00')
    await expect(reviewer.getByTestId('sales-receivable-movement')).toContainText('500.00')

    await maker.goto(docPage(invoice.id))
    await maker.getByTestId('invoice-allocate').click()
    await option(maker, 'allocate-source', new RegExp('D5-R-' + tag))
    await maker.getByTestId('allocate-amount').fill('500')
    await maker.getByTestId('sales-allocate-date').fill(invoiceOn)
    await maker.getByTestId('sales-allocate-number').fill('D5-A-' + tag)
    const allocating = response(maker, ar + '/documents')
    await maker.getByTestId('allocate-submit').click()
    const allocation = await confirmed(allocating, 201)
    const contender = await command(maker, ar + '/documents', { draft: { kind: 'allocation', number: 'D5-A2-' + tag, on: invoiceOn,
      invoiceId: invoice.id, fundsId: receipt.id, amount: '500' } }, 201)
    await reviewer.goto(docPage(allocation.id))
    const trying = response(reviewer, ar + '/documents/' + allocation.id + '/decision')
    const competing = attempt(reviewer, ar + '/documents/' + contender.id + '/decision', { expectedVersion: contender.version, approve: true })
    await reviewer.getByTestId('sales-receivable-approve').click()
    expect([(await trying).status(), (await competing).status].sort()).toEqual([200, 409])
    await reviewer.goto(docPage(invoice.id))
    await expect(reviewer.getByTestId('invoice-outstanding')).toHaveText('630.00')
    await reviewer.goto(docPage(receipt.id))
    await expect(reviewer.getByTestId('invoice-outstanding')).toHaveText('0.00')
    const [funds, flows] = await Promise.all([
      read<CustomerDocument>(reviewer, ar + '/documents/' + receipt.id),
      read<BankMovement[]>(reviewer, finance + '/trade/banks/' + baseline.bank.id + '/movements')
    ])
    expect(flows.filter(row => row.documentId === receipt.id)).toHaveLength(1)
    const journal = await read<TradeJournal>(reviewer, finance + '/ledger/journals/' + funds.journalId)
    expect(compareDecimal(sumDecimals(journal.lines.map(row => row.debit)), '500')).toBe(0)
    const postedInvoice = await read<CustomerDocument>(reviewer, ar + '/documents/' + invoice.id)
    await reviewer.goto(`/finance?tab=aging&workspace=${workspaceId}`)
    const agingRow = reviewer.getByTestId('ledger-open-invoice-row').filter({ hasText: postedInvoice.terms.number })
    await expect(agingRow).toContainText('630.00')
    await agingRow.getByRole('link', { name: postedInvoice.terms.number }).click()
    await expect(reviewer.getByTestId('invoice-outstanding')).toHaveText('630.00')

    const customer = await command(maker, master + '/partners', { code: 'D5-C-' + tag,
      profile: { name: 'D5 另一客户 ' + tag, roles: ['customer'], contacts: [] } }, 201)
    const foreignFunds = await command(maker, ar + '/documents', { draft: { kind: 'receipt', number: 'D5-F-' + tag,
      on: invoiceOn, customerId: customer.id, bankId: baseline.bank.id, amount: '1' } }, 201)
    await command(reviewer, ar + '/documents/' + foreignFunds.id + '/decision', { expectedVersion: foreignFunds.version, approve: true })
    const mismatch = await attempt(maker, ar + '/documents', { draft: { kind: 'allocation', number: 'D5-M-' + tag,
      on: invoiceOn, invoiceId: invoice.id, fundsId: foreignFunds.id, amount: '1' } })
    expect(mismatch.status, mismatch.text).toBe(409)
    expect((await read<CustomerDocument>(maker, ar + '/documents/' + invoice.id)).openBalance).toBe('630')

    const locked = await command(maker, ar + '/documents', { draft: { kind: 'receipt', number: 'D5-L-' + tag,
      on: '2027-11-21', customerId: baseline.customer.id, bankId: baseline.bank.id, amount: '1' } }, 201)
    const refused = await attempt(reviewer, ar + '/documents/' + locked.id + '/decision', { approve: true, expectedVersion: locked.version })
    expect(refused.status, refused.text).toBe(409)
    const blocked = await read<CustomerDocument>(maker, ar + '/documents/' + locked.id)
    expect(blocked).toMatchObject({ state: 'submitted', journalId: null })
    await command(maker, ar + '/documents/' + locked.id + '/decision', { approve: false, expectedVersion: blocked.version })

    const { categoryId, unitId } = await read<{ categoryId: string, unitId: string }>(maker, master + '/items/' + itemId)
    const service = await command(maker, master + '/items', { code: 'D5-SRV-' + tag,
      name: 'D5 服务项目 ' + tag, kind: 'service', tracksInventory: false, categoryId, unitId }, 201)
    await command(maker, finance + '/tax/classifications', { kind: 'item', resourceId: service.id, groupCode: 'D0-TAX', expectedVersion: 0 })
    const schedule = await command(maker, ar + '/schedules', { expectedVersion: 0, input: { customerId: baseline.customer.id,
      serviceId: service.id, quantity: '1', unitPrice: '10', nextOn: invoiceOn, endsOn: invoiceOn, intervalMonths: 1, dueDays: 10 } })
    const serviceInvoice = await command<{ invoiceId: string | null, pendingReason: string | null }>(maker,
      ar + '/schedules/' + schedule.id + '/run', { on: invoiceOn })
    expect(serviceInvoice.invoiceId, serviceInvoice.pendingReason ?? '').toBeTruthy()
    const serviceDocument = await read<CustomerDocument>(maker, ar + '/documents/' + serviceInvoice.invoiceId)
    expect(serviceDocument.terms.lines?.[0]).toMatchObject({ shipmentId: null, itemId: service.id })
    await maker.goto(docPage(serviceDocument.id))
    await expect(maker.getByText('D5 服务项目 ' + tag + ' · 服务项目', { exact: true })).toBeVisible()
    await expect(maker.getByTestId('sales-invoice-edit')).not.toBeVisible()
    await command(maker, ar + '/documents/' + serviceDocument.id + '/decision', { approve: false, expectedVersion: serviceDocument.version })
  } catch (failure) {
    for (const [name, page] of [['maker', maker], ['reviewer', reviewer], ['receiver', receiver]] as const) {
      const url = new URL(page.url())
      if (url.port === '7444') await testInfo.attach(name + ' Dashboard', { body: await page.locator('body').ariaSnapshot({ timeout: 2000 }).catch(() => url.pathname), contentType: 'text/plain' })
    }
    throw failure
  } finally {
    try {
      if (numbering) {
        const current = await read<Numbering>(maker, ar + '/invoice-numbering')
        if (current.pattern === testPattern)
          await command(maker, ar + '/invoice-numbering', { expectedVersion: current.version, pattern: numbering.pattern, startingNumber: numbering.startingNumber }, 200, 'PUT')
      }
    } finally {
      await Promise.all([maker.close(), reviewer.close(), receiver.close()])
    }
  }
})

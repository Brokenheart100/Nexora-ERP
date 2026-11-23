import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { promisify } from 'node:util'
import { expect, test as playwrightTest, type Browser, type BrowserContext, type Page, type Response } from '@playwright/test'
import { api, baseline, emailLogin, login, origin, repository, write } from './helpers'
import { compareDecimal, sumDecimals } from '../shared/utils/decimal'
import type { InventoryReceipt, PurchaseDetail, ReceiptPermit } from '../shared/types/purchasing'
import type { AccrualReceipt, BankMovement, TradeDocument, TradeJournal } from '../shared/types/trade'

const workspaceId = baseline.workspace.id
const org = '/bff/api/workspaces/' + workspaceId
const master = '/bff/api/masterdata/workspaces/' + workspaceId
const orders = '/bff/api/purchasing/workspaces/' + workspaceId + '/orders'
const inventory = '/bff/api/inventory/workspaces/' + workspaceId
const finance = '/bff/api/finance/workspaces/' + workspaceId
const warehouseId = baseline.warehouse.id
const workspace = 'workspace=' + workspaceId
const note = 'D4 原界面本地验收'
const purchaseOn = '2026-01-03', billOn = '2026-01-04', paymentOn = '2026-01-05'
const evidence = resolve(repository, 'artifacts/dashboard-d4-original-ui')
type ReceiverSession = Awaited<ReturnType<BrowserContext['storageState']>>

const test = playwrightTest.extend<{ receiver: Page }, { receiverSession: ReceiverSession }>({
  receiverSession: [async ({ browser }, use) => {
    const page = await actorPage(browser)
    try {
      await emailLogin(page, baseline.receiver.email)
      await use(await page.context().storageState())
    } finally {
      await page.context().close()
    }
  }, { scope: 'worker', timeout: 120_000 }],
  receiver: async ({ browser, receiverSession }, use) => {
    const page = await actorPage(browser, receiverSession)
    try {
      await page.goto('/', { waitUntil: 'domcontentloaded' })
      await use(page)
    } finally {
      await page.context().close()
    }
  }
})

function problemText(text: string) {
  try {
    const value = JSON.parse(text)
    return [value.code ?? value.data?.code, value.detail ?? value.data?.detail].filter(Boolean).join(' · ')
  } catch {
    return 'Non-JSON response'
  }
}

async function read<T>(page: Page, path: string) {
  const response = await api(page, path)
  expect(response.status, path + ' ' + problemText(response.text)).toBe(200)
  return JSON.parse(response.text) as T
}

async function command<T = { id: string, version: number | string }>(page: Page, path: string, input: object, status = 200,
  method: 'POST' | 'PUT' = 'POST', operationId = randomUUID()) {
  const response = await attempt(page, path, input, method, operationId)
  expect(response.status, path + ' ' + problemText(response.text)).toBe(status)
  return JSON.parse(response.text) as T
}

function attempt(page: Page, path: string, input: object, method: 'POST' | 'PUT' = 'POST', operationId = randomUUID()) {
  return write(page, path, method, { ...input, operationId }, { 'Idempotency-Key': operationId })
}

function responseFor(page: Page, path: string, method = 'POST') {
  return page.waitForResponse(response => new URL(response.url()).pathname === path && response.request().method() === method)
}

async function success<T>(promise: Promise<Response>, status: number) {
  const response = await promise
  const text = await response.text()
  expect(response.status(), problemText(text)).toBe(status)
  return JSON.parse(text) as T
}

async function choose(page: Page, control: string, label: string | RegExp) {
  await page.getByTestId(control).click()
  await page.getByRole('option', { name: label, exact: typeof label === 'string' }).click()
}

async function screenshot(page: Page, file: string) {
  await mkdir(evidence, { recursive: true })
  await page.screenshot({ path: resolve(evidence, file), animations: 'disabled', fullPage: true })
}

async function fixture(page: Page, tag: string) {
  const code = 'D4-SKU-' + tag, supplierCode = 'D4-SUP-' + tag
  const product = await read<{ categoryId: string, unitId: string }>(page, master + '/items/' + baseline.product.id)
  const item = await command(page, master + '/items', { code, name: 'D4 库存商品 ' + tag, kind: 'product', tracksInventory: true,
    categoryId: product.categoryId, unitId: product.unitId }, 201)
  const supplier = await command(page, master + '/partners', { code: supplierCode, profile: { name: 'D4 供应商 ' + tag, roles: ['supplier'], contacts: [] } }, 201)
  return { itemId: item.id, itemLabel: code + ' D4 库存商品 ' + tag, supplierId: supplier.id, supplierLabel: supplierCode + ' D4 供应商 ' + tag }
}

async function createThroughUi(page: Page, tag: string, values: Awaited<ReturnType<typeof fixture>>, quantity = '100') {
  const number = 'D4-PO-' + tag
  await page.goto('/purchase-orders?' + workspace)
  await page.getByTestId('orders-create').click()
  await page.getByTestId('order-form-number').fill(number)
  await choose(page, 'order-form-supplier', values.supplierLabel)
  await page.getByTestId('order-form-expected').fill(purchaseOn)
  await choose(page, 'order-form-department', baseline.department.name)
  await choose(page, 'order-form-line-item', values.itemLabel)
  await page.getByTestId('order-form-line-qty').fill(quantity)
  await page.getByTestId('order-form-line-price').fill('10')
  const made = responseFor(page, orders)
  await page.getByTestId('order-form-save-draft').click()
  const created = await success<{ id: string }>(made, 201)
  await expect(page.getByTestId('order-form-number')).not.toBeVisible()
  const row = page.getByRole('row').filter({ hasText: number })
  await expect(row).toContainText('草稿')
  await row.getByTestId('orders-open').click()
  await expect(page.getByTestId('order-live-version')).toContainText('草稿')
  return { ...created, number, path: orders + '/' + created.id }
}

async function orderAt(page: Page, orderId: string) {
  await page.goto('/purchase-orders?' + workspace + '&order=' + orderId)
  await expect(page.getByTestId('order-live-version')).toBeVisible()
}

async function issueThroughUi(page: Page, path: string, quantity: string) {
  await page.getByTestId('order-receive').click()
  await choose(page, 'receipt-live-warehouse', new RegExp(baseline.warehouse.code))
  await page.getByTestId('receipt-live-quantity').fill(quantity)
  const posted = responseFor(page, path + '/receipts')
  await page.getByTestId('receipt-submit').click()
  const result = await success<{ permitId: string }>(posted, 202)
  expect((await posted).headers().location).toBe(path + '/receipts')
  await expect(page.getByTestId('receipt-live-quantity')).not.toBeVisible()
  await expect(page.getByTestId('stock-permit-status-' + result.permitId)).toContainText('待收货')
  return result.permitId
}

async function stockPage(page: Page, permitId: string) {
  await page.goto('/inventory?tab=operations&' + workspace + '&warehouse=' + warehouseId + '&permit=' + permitId)
  await page.getByTestId('permit-execute-' + permitId).click()
}

async function receiveThroughUi(page: Page, permitId: string, quantity: string, on = purchaseOn) {
  await stockPage(page, permitId)
  await page.getByTestId('permit-execution-date').fill(on)
  await page.getByTestId('permit-execution-qty-1').fill(quantity)
  const done = responseFor(page, inventory + '/receipts/' + permitId + '/receive')
  await page.getByTestId('permit-execution-submit').click()
  const result = await success<{ id: string, version: number | string }>(done, 200)
  await expect(page.getByRole('dialog', { name: '按许可执行收发货', exact: true })).not.toBeVisible()
  return { result, payload: (await done).request().postDataJSON() as { operationId: ReturnType<typeof randomUUID>, expectedRevision: number | string, on: string, quantity: string } }
}

async function fundedBank(maker: Page, reviewer: Page, tag: string) {
  const chart = await read<{ revision: number | string, accounts: { id: string, code: string }[] }>(maker, finance + '/chart')
  const code = 'D4-CTL-' + tag
  await command(maker, finance + '/chart/accounts', { expectedRevision: chart.revision, expectedVersion: null,
    account: { code, name: 'D4 专用银行控制科目 ' + tag, category: 'asset', purpose: 'control', parentCode: null, isArchived: false } })
  const account = (await read<typeof chart>(maker, finance + '/chart')).accounts.find(value => value.code === code)!
  const entry = await command(maker, finance + '/trade/banks', { code: 'D4-BANK-' + tag, name: 'D4 验收银行 ' + tag, kind: 'bank', accountId: account.id }, 201)
  const income = await command(maker, finance + '/trade/documents', { terms: { kind: 4, number: 'D4-FUND-' + tag, on: purchaseOn,
    memo: 'D4 独立本地测试资金', amount: '2000', bankId: entry.id, counterAccountId: baseline.accountMappings.receivableAccounts.revenueAccountId, quantity: '0' } }, 201)
  await command(reviewer, finance + '/trade/documents/' + income.id + '/decision', { expectedVersion: income.version, decision: 'approve' })
  const balance = await read<{ balance: string }>(maker, finance + '/trade/banks/' + entry.id)
  expect(compareDecimal(balance.balance, '2000')).toBe(0)
  return { ...entry, accountId: account.id, code: 'D4-BANK-' + tag }
}

test('D4 原采购到付款真实全程，分收40/60，1130账单独立付款600后未结530', async ({ browser, page: maker, receiver }) => {
  test.setTimeout(360_000)
  const reviewer = await actorPage(browser)
  const tag = randomUUID().slice(0, 8).toUpperCase(), errors: string[] = []
  for (const page of [maker, reviewer, receiver]) page.on('pageerror', error => errors.push(error.message))
  try {
    await Promise.all([login(maker, 'alice'), login(reviewer, 'bob')])
    const values = await fixture(maker, tag), bank = await fundedBank(maker, reviewer, tag)
    const order = await createThroughUi(maker, tag, values)
    await maker.getByTestId('order-edit').click()
    await maker.getByTestId('order-form-note').fill(note)
    const stale = await read<PurchaseDetail>(maker, order.path)
    const originalDraft = { on: purchaseOn, supplierId: values.supplierId, departmentId: baseline.department.id, note: '并发版本验收',
      lines: [{ itemId: values.itemId, quantity: '100', unitPrice: '10' }] }
    await command(maker, order.path, { expectedVersion: stale.order.version, draft: originalDraft }, 200, 'PUT')
    const conflict = responseFor(maker, order.path, 'PUT')
    await maker.getByTestId('order-form-save-draft').click()
    expect((await conflict).status()).toBe(409)
    await expect(maker.getByTestId('order-form-note')).toHaveValue(note)
    await maker.getByTestId('order-read-current').click()
    const revised = responseFor(maker, order.path, 'PUT')
    await maker.getByTestId('order-form-save-draft').click()
    await success(revised, 200)
    await maker.getByTestId('order-resubmit').click()
    await expect(maker.getByTestId('order-live-version')).toContainText('待审批')
    await expect(maker.getByTestId('order-approve')).toHaveCount(0)
    await maker.getByTestId('order-withdraw').click()
    await expect(maker.getByTestId('order-live-version')).toContainText('草稿')
    await maker.getByTestId('order-resubmit').click()
    await expect(maker.getByTestId('order-live-version')).toContainText('待审批')
    await orderAt(reviewer, order.id)
    await reviewer.getByTestId('order-action-reason').fill('D4 退回后重新提交验收')
    await reviewer.getByTestId('order-reject').click()
    await expect(reviewer.getByTestId('order-live-version')).toContainText('草稿')
    await orderAt(maker, order.id)
    await maker.getByTestId('order-resubmit').click()
    await expect(maker.getByTestId('order-live-version')).toContainText('待审批')
    await orderAt(reviewer, order.id)
    await reviewer.getByTestId('order-approve').click()
    await expect(reviewer.getByTestId('order-live-version')).toContainText('已批准')
    const current = await read<PurchaseDetail>(reviewer, order.path)
    expect(current.order.departmentId).toBe(baseline.department.id)
    expect(current.approvedVersion).not.toBeNull()
    await screenshot(reviewer, 'live-purchase.png')
    await reviewer.getByTestId('order-print').click()
    const print = reviewer.getByTestId('print-preview')
    await expect(print.getByTestId('print-document')).toContainText(order.number)
    await expect(print.getByTestId('print-lines')).toContainText('1,000.00')
    await expect(print.getByTestId('print-summary')).toContainText('批准版本')
    await reviewer.getByTestId('print-close').click()

    const receivedIds: string[] = []
    for (const quantity of ['40', '60']) {
      await orderAt(reviewer, order.id)
      const permit = await issueThroughUi(reviewer, order.path, quantity)
      const received = await receiveThroughUi(receiver, permit, quantity)
      receivedIds.push(received.result.id)
      const { operationId, ...payload } = received.payload
      const replay = await command(receiver, inventory + '/receipts/' + permit + '/receive', payload, 200, 'POST', operationId)
      expect(replay.id).toBe(received.result.id)
      await expect.poll(async () => (await read<{ permits: ReceiptPermit[] }>(reviewer, order.path + '/receipts')).permits.find(value => value.id === permit)?.state).toBe('completed')
    }
    const tasks = await read<InventoryReceipt[]>(receiver, inventory + '/warehouses/' + warehouseId + '/receipts')
    expect(tasks.filter(row => row.ticket.orderId === order.id).map(row => row.executed).sort()).toEqual(['40', '60'])
    const movements = await read<{ id: string, quantity: string, cost: string }[]>(receiver, inventory + '/warehouses/' + warehouseId + '/movements?itemId=' + values.itemId)
    expect(movements.map(row => row.id).sort()).toEqual(receivedIds.sort())
    expect(sumDecimals(movements.map(row => row.cost))).toBe('1000')
    const pools = await read<{ itemId: string, quantity: string, value: string }[]>(receiver, inventory + '/warehouses/' + warehouseId + '/positions?pageSize=100')
    expect(pools.find(row => row.itemId === values.itemId)).toMatchObject({ quantity: '100', value: '1000' })
    await receiver.getByRole('tab', { name: '库存流水', exact: true }).click()
    await expect(receiver.getByTestId('movement-table')).toContainText('600')
    await screenshot(receiver, 'live-inventory.png')

    const facts = async () => (await read<AccrualReceipt[]>(maker, finance + '/trade/receipts')).filter(value => value.fact.orderId === order.id)
    await expect.poll(async () => (await facts()).filter(value => value.posted).length, { timeout: 45_000 }).toBe(2)
    expect((await facts()).map(value => value.fact.id).sort()).toEqual(receivedIds.sort())
    const payables = '/finance?tab=payables&' + workspace + '&order=' + order.id
    await maker.goto(payables)
    await expect(maker.getByTestId('payables-receipts')).toContainText('已暂估')
    await maker.getByTestId('payables-new-bill').click()
    await maker.getByTestId('bill-form-number').fill('D4-BILL-' + tag)
    await maker.getByTestId('bill-form-date').fill(billOn)
    await maker.getByTestId('bill-form-due').fill('2026-01-31')
    await choose(maker, 'bill-form-tax-group', /D0-TAX/)
    for (const receipt of await facts()) {
      await choose(maker, 'bill-form-line-select', new RegExp(receipt.fact.id))
      await maker.getByTestId('bill-form-add-line').click()
    }
    for (const field of await maker.getByTestId('bill-form-unit-price').all()) await field.fill('10')
    for (const receipt of await facts()) {
      const assessed = responseFor(maker, finance + '/tax/assessments')
      await maker.getByTestId('bill-assess-' + receipt.fact.id).click()
      await success(assessed, 200)
    }
    await expect(maker.getByTestId('bill-form-total')).toContainText('1,130.00')
    const madeBill = responseFor(maker, finance + '/trade/documents')
    await maker.getByTestId('bill-form-submit').click()
    const bill = await success<{ id: string }>(madeBill, 201)
    await expect(maker.getByTestId('bill-review-approve')).toBeDisabled()
    await reviewer.goto(payables + '&bill=' + bill.id)
    await reviewer.getByTestId('bill-review-approve').click()
    await expect(reviewer.getByTestId('bill-detail-outstanding')).toContainText('1,130.00')
    await expect(reviewer.getByTestId('bill-journal')).toContainText('130.00')

    await maker.goto(payables + '&bill=' + bill.id)
    await maker.getByTestId('bill-pay').click()
    await maker.getByTestId('payment-date').fill(paymentOn)
    await maker.getByTestId('payment-number').fill('D4-PAY-' + tag)
    await choose(maker, 'payment-bank', new RegExp(bank.code))
    await maker.getByTestId('payment-amount').fill('1131')
    await maker.getByTestId('payment-submit').click()
    await expect(maker.getByTestId('payment-error')).toContainText('余额足够')
    await maker.getByTestId('payment-amount').fill('600')
    const madePayment = responseFor(maker, finance + '/trade/documents')
    await maker.getByTestId('payment-submit').click()
    const payment = await success<{ id: string }>(madePayment, 201)
    await expect(maker.getByTestId('payment-detail-status')).toContainText('待独立复核')
    await expect(maker.getByTestId('payment-review-approve')).toBeDisabled()
    const submit = (await madePayment).request().postDataJSON()
    const replay = await command(maker, finance + '/trade/documents', { terms: submit.terms }, 201, 'POST', submit.operationId)
    expect(replay.id).toBe(payment.id)
    expect(compareDecimal((await read<TradeDocument>(maker, finance + '/trade/documents/' + bill.id)).outstanding, '1130')).toBe(0)

    await reviewer.goto(payables + '&bill=' + bill.id)
    await reviewer.getByTestId('payment-open-' + payment.id).click()
    const posted = responseFor(reviewer, finance + '/trade/documents/' + payment.id + '/decision')
    await reviewer.getByTestId('payment-review-approve').click()
    await success(posted, 200)
    await expect(reviewer.getByTestId('payment-detail-status')).toContainText('已过账')
    await expect(reviewer.getByTestId('payment-journal')).toContainText('600.00')
    await expect(reviewer.getByTestId('payment-bank-movements')).toContainText('-600.00')
    await expect(reviewer.getByTestId('payment-bank-movements')).toContainText('1,400.00')
    const reviewBody = (await posted).request().postDataJSON()
    await command(reviewer, finance + '/trade/documents/' + payment.id + '/decision', { expectedVersion: reviewBody.expectedVersion, decision: 'approve' }, 200, 'POST', reviewBody.operationId)
    await screenshot(reviewer, 'live-payment.png')
    const billed = await read<TradeDocument>(reviewer, finance + '/trade/documents/' + bill.id)
    expect(compareDecimal(billed.total, '1130')).toBe(0)
    expect(compareDecimal(billed.outstanding, '530')).toBe(0)
    expect(billed.billMatches).toHaveLength(2)
    expect(sumDecimals(billed.billMatches!.map(value => value.variance))).toBe('0')
    expect(sumDecimals(billed.billMatches!.map(value => value.tax))).toBe('130')
    const bankMoves = (await read<BankMovement[]>(reviewer, finance + '/trade/banks/' + bank.id + '/movements')).filter(value => value.documentId === payment.id)
    expect(bankMoves).toHaveLength(1)
    expect(compareDecimal(bankMoves[0]!.amount, '-600')).toBe(0)
    const journal = await read<TradeJournal>(reviewer, finance + '/ledger/journals/' + bankMoves[0]!.journalId)
    expect(compareDecimal(journal.lines.find(value => value.accountId === bank.accountId)!.credit, '600')).toBe(0)
    await reviewer.getByTestId('payment-detail-close').click()
    const ageRow = reviewer.getByTestId('payables-aging').getByRole('button').filter({ hasText: 'D4 供应商 ' + tag })
    await expect(ageRow).toContainText('530.00')
    await expect(reviewer.getByTestId('payables-partner-closing')).toContainText('530.00')
    await screenshot(reviewer, 'live-payables.png')
    await ageRow.click()
    await expect(reviewer.getByTestId('bill-detail-outstanding')).toContainText('530.00')
    expect(errors).toEqual([])
  } finally {
    await reviewer.context().close()
  }
})

async function startOrder(maker: Page, tag: string, values: Awaited<ReturnType<typeof fixture>>, departmentId: string | null, quantity = '10') {
  const number = 'D4-PO-' + tag
  const order = await command(maker, orders, { number, draft: { on: purchaseOn, supplierId: values.supplierId,
    departmentId, note, lines: [{ itemId: values.itemId, quantity, unitPrice: '10' }] } }, 201)
  const path = orders + '/' + order.id
  await command(maker, path + '/decision', { expectedVersion: order.version, decision: 'submit' })
  return { ...order, number, path }
}

async function permitAt(page: Page, path: string, id: string) {
  return (await read<{ permits: ReceiptPermit[] }>(page, path + '/receipts')).permits.find(value => value.id === id)
}

async function actorPage(browser: Browser, storageState?: ReceiverSession) {
  return (await browser.newContext({ baseURL: origin, locale: 'zh-CN', storageState })).newPage()
}

async function governance<T>(page: Page, path: string, input: object) {
  const response = await write(page, path, 'POST', input)
  expect(response.status, path + ' ' + problemText(response.text)).toBe(200)
  return JSON.parse(response.text) as T
}

test('D4 部门审批、并发签发和收货取消交错', async ({ browser, page: maker, receiver }) => {
  test.setTimeout(300_000)
  const reviewer = await actorPage(browser), departmentReviewer = await actorPage(browser)
  const tag = randomUUID().slice(0, 8).toUpperCase()
  const email = 'dashboard-d4-department-' + tag.toLowerCase() + '@example.invalid'
  try {
    await Promise.all([login(maker, 'alice'), login(reviewer, 'bob'), emailLogin(departmentReviewer, email, true)])
    const version = async () => (await read<{ authorizationVersion: number | string }>(maker, org + '/access')).authorizationVersion
    const invite = await command<{ invitation: { id: string }, token: string }>(maker, org + '/invitations',
      { expectedVersion: await version(), email, role: 'WorkspaceReader' }, 201)
    await command(departmentReviewer, '/bff/api/invitations/' + invite.invitation.id + '/redeem', { token: invite.token })
    const members = await read<{ id: string, email: string }[]>(maker, org + '/members')
    const role = await governance<{ id: string, revision: number | string }>(maker, org + '/custom-roles',
      { expectedVersion: await version(), roleId: null, name: 'D4 部门审批 ' + tag, permissions: ['purchasing.order.read', 'purchasing.order.approve'] })
    const grant = await governance<{ id: string }>(maker, org + '/role-grants', { expectedVersion: await version(), memberId: members.find(value => value.email === email)!.id,
      roleId: role.id, roleRevision: role.revision, scope: 'department', scopeId: baseline.department.id, startsOn: null, endsOn: null })
    await governance(reviewer, org + '/role-grants/' + grant.id, { expectedVersion: await version(), action: 'approve' })

    const values = await fixture(maker, tag)
    const order = await startOrder(maker, tag, values, baseline.department.id)
    const companyOrder = await startOrder(maker, tag + '-C', values, null)
    expect((await api(departmentReviewer, companyOrder.path)).status).toBe(404)
    await departmentReviewer.goto('/purchase-orders?' + workspace + '&order=' + companyOrder.id)
    await expect(departmentReviewer.getByTestId('order-live-version')).toHaveCount(0)
    await expect(departmentReviewer.getByRole('row').filter({ hasText: companyOrder.number })).toHaveCount(0)
    await orderAt(departmentReviewer, order.id)
    await departmentReviewer.getByTestId('order-approve').click()
    await expect(departmentReviewer.getByTestId('order-live-version')).toContainText('已批准')
    const approved = await read<PurchaseDetail>(reviewer, order.path)
    const input = { expectedVersion: approved.order.version, lineId: approved.lines[0]!.id, warehouseId, quantity: '8' }
    expect((await attempt(reviewer, order.path + '/receipts', { ...input, quantity: '11' })).status).toBe(409)
    const attempts = await Promise.all([attempt(reviewer, order.path + '/receipts', input), attempt(reviewer, order.path + '/receipts', input)])
    expect(attempts.map(value => value.status).sort()).toEqual([202, 409])
    const accepted = attempts.find(value => value.status === 202)!
    expect(accepted.headers.location).toBe(order.path + '/receipts')
    const { permitId } = JSON.parse(accepted.text) as { permitId: string }
    await expect.poll(async () => (await permitAt(reviewer, order.path, permitId))?.state).toBe('issued')
    await orderAt(reviewer, order.id)
    await expect(reviewer.getByTestId('order-close-receiving')).toBeDisabled()
    await reviewer.getByTestId('order-action-reason').fill('D4 取消并发收货余量')
    const tasks = await read<InventoryReceipt[]>(receiver, inventory + '/warehouses/' + warehouseId + '/receipts')
    const task = tasks.find(value => value.ticket.permitId === permitId)!
    const cancelled = responseFor(reviewer, order.path + '/receipts/' + permitId + '/cancel')
    const [stock] = await Promise.all([
      attempt(receiver, inventory + '/receipts/' + permitId + '/receive', { expectedRevision: task.revision, on: purchaseOn, quantity: '3' }),
      reviewer.getByTestId('stock-permit-cancel-' + permitId).click()
    ])
    expect([200, 409]).toContain(stock.status)
    const fenced = await cancelled
    expect([200, 409]).toContain(fenced.status())
    if (fenced.status() === 409) {
      await orderAt(reviewer, order.id)
      await reviewer.getByTestId('order-action-reason').fill('D4 回读后取消剩余许可')
      const confirmed = responseFor(reviewer, order.path + '/receipts/' + permitId + '/cancel')
      await reviewer.getByTestId('stock-permit-cancel-' + permitId).click()
      await success(confirmed, 200)
    }
    await expect.poll(async () => (await permitAt(reviewer, order.path, permitId))?.state).toBe('cancelled')
    expect((await permitAt(reviewer, order.path, permitId))?.executed).toBe(stock.status === 200 ? '3' : '0')
    const movements = await read<{ quantity: string }[]>(receiver, inventory + '/warehouses/' + warehouseId + '/movements?itemId=' + values.itemId)
    expect(movements.map(value => value.quantity)).toEqual(stock.status === 200 ? ['3'] : [])
    await orderAt(reviewer, order.id)
    await expect(reviewer.getByTestId('stock-permit-status-' + permitId)).toContainText('已取消余量')
    await reviewer.getByTestId('order-action-reason').fill('D4 关闭未签发余量')
    await reviewer.getByTestId('order-close-receiving').click()
    await expect(reviewer.getByTestId('order-live-version')).toContainText('已关闭')
    await screenshot(reviewer, 'live-closed-purchase.png')
    await orderAt(maker, companyOrder.id)
    await maker.getByTestId('order-withdraw').click()
    await expect(maker.getByTestId('order-live-version')).toContainText('草稿')
    await maker.getByTestId('order-action-reason').fill('D4 取消草稿')
    await maker.getByTestId('order-cancel-draft').click()
    await expect(maker.getByTestId('order-live-version')).toContainText('已取消')
  } finally {
    await Promise.all([reviewer, departmentReviewer].map(page => page.context().close()))
  }
})

const execAspire = promisify(execFile)
const appHost = resolve(repository, 'src/Hosting/Nexora.AppHost/Nexora.AppHost.csproj')
async function aspire(...args: string[]) {
  const invocation = [...args, '--apphost', appHost, '--non-interactive']
  const options = { cwd: repository, windowsHide: true, timeout: 120_000 }
  if (process.platform === 'win32') {
    const command = '& aspire ' + invocation.map(value => `'${value.replaceAll('\'', '\'\'')}'`).join(' ') + '\nexit $LASTEXITCODE'
    await execAspire('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(command, 'utf16le').toString('base64')], options)
  } else {
    await execAspire('aspire', invocation, options)
  }
}

test('D4 实收后的 Finance 消费恢复、RabbitMQ 传输恢复与暂估门禁', async ({ browser, page: maker, receiver }) => {
  test.skip(process.env.NEXORA_D4_FAULTS !== '1', '需在专用的本地 Aspire 实例运行')
  test.setTimeout(480_000)
  const reviewer = await actorPage(browser)
  const tag = randomUUID().slice(0, 8).toUpperCase()
  try {
    await Promise.all([login(maker, 'alice'), login(reviewer, 'bob')])
    const period = '2026-11-01'
    const periodPath = finance + '/ledger/periods/' + period
    const initialPeriod = await api(reviewer, periodPath)
    // A missing period blocks posting. Choose another unopened month after a previous local run.
    let closedPeriod = period
    if (initialPeriod.status === 200) {
      for (const year of [2027, 2028, 2029, 2030, 2031]) {
        const candidate = `${year}-11-01`
        if ((await api(reviewer, finance + '/ledger/periods/' + candidate)).status === 404) {
          closedPeriod = candidate
          break
        }
      }
    }
    expect((await api(reviewer, finance + '/ledger/periods/' + closedPeriod)).status).toBe(404)
    const values = await fixture(maker, tag)
    const order = await startOrder(maker, tag, values, baseline.department.id, '2')
    await orderAt(reviewer, order.id)
    await reviewer.getByTestId('order-approve').click()
    await expect(reviewer.getByTestId('order-live-version')).toContainText('已批准')
    const ids: string[] = []
    for (const dependency of ['finance', 'rabbitmq']) {
      await orderAt(reviewer, order.id)
      const permit = await issueThroughUi(reviewer, order.path, '1')
      let received: Awaited<ReturnType<typeof receiveThroughUi>>
      try {
        await aspire('resource', dependency, 'stop')
        await aspire('wait', dependency, '--status', 'down', '--timeout', '60')
        received = await receiveThroughUi(receiver, permit, '1', dependency === 'finance' ? purchaseOn : closedPeriod)
        await expect(receiver.getByTestId('permit-execute-' + permit)).toBeDisabled()
        const movements = await read<{ id: string }[]>(receiver, inventory + '/warehouses/' + warehouseId + '/movements?itemId=' + values.itemId)
        expect(movements.filter(value => value.id === received.result.id)).toHaveLength(1)
        if (dependency === 'rabbitmq') {
          expect((await permitAt(reviewer, order.path, permit))?.state).toBe('issued')
          expect((await read<AccrualReceipt[]>(reviewer, finance + '/trade/receipts')).some(value => value.fact.id === received.result.id)).toBe(false)
        }
      } finally {
        await aspire('resource', dependency, 'start')
        await aspire('wait', dependency === 'rabbitmq' ? 'gateway' : dependency, '--status', 'healthy', '--timeout', '90')
      }
      ids.push(received.result.id)
      await expect.poll(async () => (await permitAt(reviewer, order.path, permit))?.state, { timeout: 80_000 }).toBe('completed')
      const { operationId, ...payload } = received.payload
      expect((await command(receiver, inventory + '/receipts/' + permit + '/receive', payload, 200, 'POST', operationId)).id).toBe(received.result.id)
      const facts = async () => (await read<AccrualReceipt[]>(reviewer, finance + '/trade/receipts')).filter(value => value.fact.id === received.result.id)
      await expect.poll(async () => (await facts()).length, { timeout: 80_000 }).toBe(1)
      if (dependency === 'rabbitmq') {
        const fact = (await facts())[0]!
        expect(fact.posted).toBe(false)
        expect(fact.pendingReason).toBeTruthy()
        await reviewer.goto('/finance?tab=payables&' + workspace + '&order=' + order.id)
        await expect(reviewer.getByTestId('payables-receipts')).toContainText('等待暂估')
        const accrue = finance + '/trade/receipts/' + fact.fact.id + '/accrue'
        const blocked = responseFor(reviewer, accrue)
        await reviewer.getByTestId('accrue-' + fact.fact.id).click()
        expect((await blocked).status()).toBe(409)
        await screenshot(reviewer, 'live-accrual-pending.png')
        await command(reviewer, finance + '/ledger/periods/' + closedPeriod, { expectedVersion: 0, action: 'open', reason: 'D4 专用本地暂估恢复验收' })
        const retried = responseFor(reviewer, accrue)
        await reviewer.getByTestId('accrue-' + fact.fact.id).click()
        await success(retried, 200)
        await expect(reviewer.getByTestId('accrue-' + fact.fact.id)).toHaveCount(0)
      }
      await expect.poll(async () => (await facts())[0]?.posted, { timeout: 80_000 }).toBe(true)
      const fact = (await facts())[0]!
      const journal = await read<TradeJournal>(reviewer, finance + '/ledger/journals/' + fact.journalId)
      expect(sumDecimals(journal.lines.map(value => value.debit))).toBe('10')
      const month = fact.fact.on.slice(0, 7) + '-01'
      const journals = await read<{ id: string, sourceNumber: string }[]>(reviewer, finance + '/ledger/journals?month=' + month + '&pageSize=100')
      expect(journals.filter(value => value.sourceNumber === journal.journal.sourceNumber).map(value => value.id)).toEqual([fact.journalId])
    }
    const movements = await read<{ id: string }[]>(receiver, inventory + '/warehouses/' + warehouseId + '/movements?itemId=' + values.itemId)
    expect(movements.map(value => value.id).sort()).toEqual(ids.sort())
    await reviewer.goto('/finance?tab=payables&' + workspace + '&order=' + order.id)
    await expect(reviewer.getByTestId('payables-receipts').getByText('已暂估', { exact: true })).toHaveCount(2)
    await screenshot(reviewer, 'live-accrual-recovered.png')
  } finally {
    await reviewer.context().close()
  }
})

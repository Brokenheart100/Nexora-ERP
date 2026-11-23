import { expect, test, type Page } from '@playwright/test'
import { baseline, emailLogin, login } from './helpers'
import { changeBusiness, chooseOption, readBusiness, requestBusiness, uiChange } from './business-actions'
import { verifySalesReturn } from './d6-return-scenarios'
import type { StockOperation, StockReturn } from '../shared/types/inventory'
import type { InventoryReceipt, PurchaseDetail } from '../shared/types/purchasing'
import type { AccrualReceipt } from '../shared/types/trade'

const workspace = baseline.workspace.id
const inventory = `/bff/api/inventory/workspaces/${workspace}`
const master = `/bff/api/masterdata/workspaces/${workspace}`
const purchases = `/bff/api/purchasing/workspaces/${workspace}/orders`
const finance = `/bff/api/finance/workspaces/${workspace}/trade`
const source = baseline.warehouse.id
const wh = (id: string) => inventory + '/warehouses/' + id
const pageOf = (id: string, tab = 'warehouse-ops', query = '') => `/inventory?workspace=${workspace}&warehouse=${id}&tab=${tab}${query}`
const on = '2026-01-08'
type Movement = { id: string, quantity: string, cost: string, permitId: string }

async function chooseStockItem(page: Page, item: string, code: string) {
  for (let index = 1; ; index++) {
    const rows = await readBusiness<{ itemId: string }[]>(page, `${wh(source)}/positions?page=${index}&pageSize=20`)
    if (rows.some(row => row.itemId === item)) break
    expect(rows).toHaveLength(20)
    await page.getByRole('button', { name: '下一批商品' }).click()
  }
  await chooseOption(page, 'stock-operation-item', new RegExp(code + '|' + item))
}

async function seed(alice: Page, bob: Page, receiver: Page, code: string) {
  const itemRef = await readBusiness<{ categoryId: string, unitId: string }>(alice, master + '/items/' + baseline.product.id)
  const item = await changeBusiness(alice, master + '/items', {
    code: 'D6-' + code, name: 'D6 库存样例 ' + code, kind: 'product', tracksInventory: true,
    categoryId: itemRef.categoryId, unitId: itemRef.unitId
  }, 201)
  const order = await changeBusiness(alice, purchases, { number: 'D6-PO-' + code, draft: { supplierId: baseline.supplier.id,
    on, lines: [{ itemId: item.id, quantity: '8', unitPrice: '6' }] } }, 201)
  const path = purchases + '/' + order.id
  const sent = await changeBusiness(alice, path + '/decision', { expectedVersion: order.version, decision: 'submit' })
  const approved = await changeBusiness(bob, path + '/decision', { expectedVersion: sent.version, decision: 'approve' })
  const detail = await readBusiness<PurchaseDetail>(bob, path)
  const permit = await changeBusiness<{ permitId: string }>(bob, path + '/receipts', {
    expectedVersion: approved.version, warehouseId: source, lineId: detail.lines[0]!.id, quantity: '8'
  }, 202)
  let receipt: InventoryReceipt | undefined
  await expect.poll(async () => {
    receipt = (await readBusiness<InventoryReceipt[]>(receiver, wh(source) + '/receipts')).find(row => row.ticket.permitId === permit.permitId)
    return !!receipt
  }).toBe(true)
  const movement = await changeBusiness(receiver, inventory + '/receipts/' + permit.permitId + '/receive', { on, quantity: '8', expectedRevision: receipt!.revision })
  await expect.poll(async () => (await readBusiness<AccrualReceipt[]>(alice, finance + '/receipts')).some(row => row.fact.id === movement.id)).toBe(true)
  await changeBusiness(bob, finance + '/receipts/' + movement.id + '/accrue', {})
  return { item: item.id, movement: movement.id, permit: permit.permitId }
}

test('D6 真实库存调拨保留在途与源仓成本，部分采购退货可核对财务', async ({ browser }, testInfo) => {
  test.setTimeout(330_000)
  const alice = await browser.newPage(), bob = await browser.newPage(), receiver = await browser.newPage()
  const code = Date.now().toString(36).toUpperCase()
  try {
    await Promise.all([login(alice, 'alice'), login(bob, 'bob'), emailLogin(receiver, baseline.receiver.email)])
    const stock = await seed(alice, bob, receiver, code)
    await alice.goto(pageOf(source))
    await alice.getByTestId('warehouse-ops-add').click()
    await alice.getByTestId('warehouse-ops-code').fill('D6-WH-' + code)
    await alice.getByTestId('warehouse-ops-name').fill('D6 目标仓 ' + code)
    const dest = await uiChange(alice, inventory + '/warehouses', () => alice.getByTestId('warehouse-ops-save').click(), 201)
    await alice.goto(pageOf(dest.id))
    const org = '/bff/api/workspaces/' + workspace
    const current = await readBusiness<{ memberId: string }>(alice, org + '/access')
    const members = await readBusiness<{ id: string, email: string | null, subject: string }[]>(alice, org + '/members')
    const destinationReceiver = members.find(row => row.id === current.memberId)!
    await alice.getByTestId('warehouse-ops-assign').click()
    await chooseOption(alice, 'warehouse-ops-receiver', destinationReceiver.email || destinationReceiver.subject)
    await uiChange(alice, wh(dest.id) + '/receiver', () => alice.getByTestId('warehouse-ops-save').click(), 200, 'PUT')

    await receiver.goto(pageOf(source))
    await receiver.getByTestId('transfer-ops-new').click()
    await chooseStockItem(receiver, stock.item, code)
    await chooseOption(receiver, 'stock-operation-destination', 'D6-WH-' + code + ' D6 目标仓 ' + code)
    await receiver.getByTestId('stock-operation-date').fill(on)
    await receiver.getByTestId('stock-operation-quantity').fill('3')
    await receiver.getByTestId('stock-operation-reason').fill('D6 验证源仓成本')
    const transfer = await uiChange(receiver, wh(source) + '/stock-operations', () => receiver.getByTestId('stock-operation-submit').click(), 201)
    await expect(receiver.getByTestId('stock-operation-state')).toHaveText('待复核')
    await expect(receiver.getByTestId('stock-operation-confirm')).not.toBeVisible()

    await alice.goto(pageOf(source))
    await alice.getByTestId('stock-operation-' + transfer.id).getByRole('button', { name: '查看' }).click()
    const op = inventory + '/stock-operations/' + transfer.id
    const dispatched = await uiChange(alice, op + '/decision', () => alice.getByTestId('stock-operation-confirm').click())
    await expect(alice.getByTestId('stock-operation-state')).toHaveText('在途')
    await expect(alice.getByTestId('transfer-ops-cost')).toContainText('18')
    expect((await requestBusiness(bob, op + '/receive', { expectedVersion: dispatched.version, on })).status).toBe(403)
    await alice.goto(pageOf(dest.id))
    await alice.getByTestId('stock-operation-' + transfer.id).getByRole('button', { name: '查看' }).click()
    await alice.getByTestId('stock-operation-arrival').fill(on)
    await uiChange(alice, op + '/receive', () => alice.getByTestId('stock-operation-receive').click())
    await expect(alice.getByTestId('stock-operation-state')).toHaveText('已完成')
    const detail = await readBusiness<StockOperation>(alice, wh(dest.id) + '/stock-operations/' + transfer.id)
    expect(detail.transitCost).toBe('18')
    const [from, to] = await Promise.all([
      readBusiness<Movement[]>(alice, wh(source) + '/movements?itemId=' + stock.item),
      readBusiness<Movement[]>(alice, wh(dest.id) + '/movements?itemId=' + stock.item)
    ])
    expect(from.find(row => row.id === detail.movementId)).toMatchObject({ quantity: '-3', cost: '-18' })
    expect(to.find(row => row.id === detail.destinationMovementId)).toMatchObject({ quantity: '3', cost: '18' })
    expect((await requestBusiness(alice, op + '/receive', { expectedVersion: dispatched.version, on })).status).toBe(409)
    expect((await readBusiness<Movement[]>(alice, wh(dest.id) + '/movements?itemId=' + stock.item)).map(row => row.id)).toEqual(to.map(row => row.id))

    await receiver.goto(pageOf(source))
    await receiver.getByTestId('stocktake-ops-new').click()
    await chooseStockItem(receiver, stock.item, code)
    await receiver.getByTestId('stock-operation-date').fill(on)
    await receiver.getByTestId('stock-operation-quantity').fill('4')
    await receiver.getByTestId('stock-operation-reason').fill('D6 验证待确认取消')
    const count = await uiChange(receiver, wh(source) + '/stock-operations', () => receiver.getByTestId('stock-operation-submit').click(), 201)
    await uiChange(receiver, inventory + '/stock-operations/' + count.id + '/decision', () => receiver.getByTestId('stock-operation-cancel').click())
    await expect(receiver.getByTestId('stock-operation-state')).toHaveText('已取消')

    await receiver.goto(pageOf(source))
    await receiver.getByTestId('stocktake-ops-new').click()
    await chooseStockItem(receiver, stock.item, code)
    await receiver.getByTestId('stock-operation-date').fill(on)
    await receiver.getByTestId('stock-operation-quantity').fill('4')
    await receiver.getByTestId('stock-operation-reason').fill('D6 确认盘亏 1 件')
    const variance = await uiChange(receiver, wh(source) + '/stock-operations', () => receiver.getByTestId('stock-operation-submit').click(), 201)
    await alice.goto(pageOf(source))
    await alice.getByTestId('stock-operation-' + variance.id).getByRole('button', { name: '查看' }).click()
    await uiChange(alice, inventory + '/stock-operations/' + variance.id + '/decision', () => alice.getByTestId('stock-operation-confirm').click())
    await expect(alice.getByTestId('stock-operation-state')).toHaveText('已完成')
    const counted = await readBusiness<StockOperation>(alice, wh(source) + '/stock-operations/' + variance.id)
    expect((await readBusiness<Movement[]>(alice, wh(source) + '/movements?itemId=' + stock.item)).find(row => row.id === counted.movementId))
      .toMatchObject({ quantity: '-1', cost: '-6' })
    await expect.poll(async () => (await readBusiness<AccrualReceipt[]>(bob, finance + '/receipts'))
      .some(row => row.fact.id === counted.movementId && row.posted && row.journalId)).toBe(true)

    const warehouse = await readBusiness<{ canApproveReturns: boolean }>(bob, wh(source))
    expect(warehouse.canApproveReturns).toBe(true)
    expect((await readBusiness<InventoryReceipt[]>(bob, wh(source) + '/receipts')).some(row => row.ticket.permitId === stock.permit)).toBe(true)
    expect(await readBusiness<Movement[]>(bob, wh(source) + '/movements?itemId=' + stock.item)).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: stock.movement, permitId: stock.permit, quantity: '8' })
    ]))
    const observedReturns = bob.waitForResponse(response => new URL(response.url()).pathname === wh(source) + '/returns')
    await bob.goto(pageOf(source, 'movements', '&item=' + stock.item))
    expect((await observedReturns).status()).toBe(200)
    await expect(bob.getByTestId('movement-table')).toContainText(stock.permit)
    await bob.getByTestId('movement-return-' + stock.movement).click()
    await bob.getByTestId('stock-return-date').fill(on)
    await bob.getByTestId('stock-return-qty-1').fill('9')
    await bob.getByTestId('stock-return-reason').fill('D6 部分退货')
    await bob.getByTestId('stock-return-submit').click()
    await expect(bob.getByTestId('sales-operation-status')).toContainText('可退范围')
    await bob.getByTestId('stock-return-qty-1').fill('1')
    const returned = await uiChange(bob, inventory + '/movements/' + stock.movement + '/returns', () => bob.getByTestId('stock-return-submit').click())
    await expect(bob.getByTestId('stock-return-detail-status')).toHaveText('待仓库确认')
    await receiver.goto(pageOf(source, 'movements', '&item=' + stock.item))
    await receiver.getByTestId('stock-return-row-' + returned.id).getByRole('button', { name: '查看' }).click()
    const confirming = await uiChange(receiver, inventory + '/returns/' + returned.id + '/decision', () => receiver.getByTestId('stock-return-confirm').click())
    await expect(receiver.getByTestId('stock-return-detail-status')).toHaveText('仓库已确认')
    expect((await readBusiness<StockReturn[]>(receiver, wh(source) + '/returns')).find(row => row.id === returned.id)?.movementId).toBe(confirming.id)
    let accrual: AccrualReceipt | undefined
    await expect.poll(async () => {
      accrual = (await readBusiness<AccrualReceipt[]>(bob, finance + '/receipts')).find(row => row.fact.id === confirming.id)
      return Boolean(accrual)
    }).toBe(true)
    await bob.goto(`/finance?workspace=${workspace}&tab=payables&stockReturn=${confirming.id}`)
    const result = bob.getByTestId('accounting-return-' + confirming.id)
    if (!accrual?.posted) await uiChange(bob, finance + '/receipts/' + confirming.id + '/accrue', () => result.getByRole('button', { name: '处理未开票退货' }).click())
    await expect(result).toContainText('成本已入账')
    await verifySalesReturn(alice, bob, receiver, stock.item, on, code)
  } catch (failure) {
    const movements = await bob.getByTestId('inventory-movements').ariaSnapshot({ timeout: 1250 }).catch(() => '')
    if (movements) await testInfo.attach('库存流水', { body: movements, contentType: 'text/plain' })
    for (const [name, page] of [['Alice', alice], ['Bob', bob], ['仓库', receiver]] as const) {
      if (page.url().startsWith('https://localhost:7444/')) await testInfo.attach(name, { body: await page.locator('body').ariaSnapshot({ timeout: 1800 }).catch(() => ''), contentType: 'text/plain' })
    }
    throw failure
  } finally {
    await Promise.all([alice.close(), bob.close(), receiver.close()])
  }
})

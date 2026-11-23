import { expect, type Page } from '@playwright/test'
import { changeBusiness, chooseOption, readBusiness, requestBusiness, uiChange } from './business-actions'
import type { InventoryReceipt, PurchaseDetail } from '../shared/types/purchasing'
import type { AccrualReceipt, BankMovement, TradeDocument } from '../shared/types/trade'
import { compareDecimal } from '../shared/utils/decimal'

type Fixture = { bankId: string, warehouseId: string, categoryId: string, unitId: string, supplierId: string }

export async function verifyPaidSupplierReturn(maker: Page, reviewer: Page, receiver: Page, workspace: string, fixture: Fixture) {
  const on = '2026-01-05'
  const inventory = `/bff/api/inventory/workspaces/${workspace}`
  const warehouse = inventory + '/warehouses/' + fixture.warehouseId
  const trade = `/bff/api/finance/workspaces/${workspace}/trade`
  const documents = trade + '/documents'
  const member = await readBusiness<{ memberId: string }>(receiver, `/bff/api/workspaces/${workspace}/access`)
  const { version } = await readBusiness<{ version: number }>(maker, warehouse)
  await changeBusiness(maker, warehouse + '/receiver', { expectedVersion: version, memberId: member.memberId }, 200, 'PUT')
  const item = await changeBusiness(maker, `/bff/api/masterdata/workspaces/${workspace}/items`, {
    code: 'D6-SUP-RETURN', name: 'D6 供应商退款样例', kind: 'product', tracksInventory: true, categoryId: fixture.categoryId, unitId: fixture.unitId
  }, 201)
  const purchases = `/bff/api/purchasing/workspaces/${workspace}/orders`
  const po = await changeBusiness(maker, purchases, { number: 'D6-SUP-PO', draft: { supplierId: fixture.supplierId, on,
    lines: [{ itemId: item.id, quantity: '2', unitPrice: '6' }] } }, 201)
  const path = purchases + '/' + po.id
  const submitted = await changeBusiness(maker, path + '/decision', { expectedVersion: po.version, decision: 'submit' })
  const approved = await changeBusiness(reviewer, path + '/decision', { expectedVersion: submitted.version, decision: 'approve' })
  const { lines } = await readBusiness<PurchaseDetail>(reviewer, path)
  const { permitId } = await changeBusiness<{ permitId: string }>(reviewer, path + '/receipts', {
    expectedVersion: approved.version, warehouseId: fixture.warehouseId, lineId: lines[0]!.id, quantity: '2'
  }, 202)
  let receipt: InventoryReceipt | undefined
  await expect.poll(async () => {
    receipt = (await readBusiness<InventoryReceipt[]>(receiver, warehouse + '/receipts')).find(row => row.ticket.permitId === permitId)
    return !!receipt
  }).toBe(true)
  const move = await changeBusiness(receiver, inventory + '/receipts/' + permitId + '/receive', { on, quantity: '2', expectedRevision: receipt!.revision })
  await expect.poll(async () => (await readBusiness<AccrualReceipt[]>(maker, trade + '/receipts')).find(row => row.fact.id === move.id)?.posted).toBe(true)
  const post = async (terms: object) => {
    const doc = await changeBusiness(maker, documents, { terms: { on, memo: 'D6 已付款采购退货', ...terms } }, 201)
    await changeBusiness(reviewer, documents + '/' + doc.id + '/decision', { expectedVersion: doc.version, decision: 'approve' })
    return doc.id
  }
  const bill = await post({ kind: 1, number: 'D6-SUP-BILL', amount: '12', quantity: '2', partnerId: fixture.supplierId, sourceId: move.id })
  await post({ kind: 2, number: 'D6-SUP-PAY', amount: '12', quantity: '0', bankId: fixture.bankId, sourceId: bill })
  const request = await changeBusiness(reviewer, inventory + '/movements/' + move.id + '/returns', { on, reason: 'D6 已付款部分退货', quantity: '1' })
  const returned = await changeBusiness(receiver, inventory + '/returns/' + request.id + '/decision', { confirm: true })
  await expect.poll(async () => (await readBusiness<AccrualReceipt[]>(maker, trade + '/receipts')).find(row => row.fact.id === returned.id)?.posted).toBe(false)
  const financePage = `/finance?workspace=${workspace}&tab=payables&stockReturn=${returned.id}`
  const field = (id: string) => maker.getByTestId(id)
  await maker.goto(financePage)
  await field('accounting-return-' + returned.id).getByRole('button', { name: '新建贷项' }).click()
  await chooseOption(maker, 'return-accounting-settlement', 'D6-SUP-BILL')
  await field('return-accounting-number').fill('D6-SUP-CREDIT')
  await field('return-accounting-date').fill(on)
  const credit = await uiChange(maker, documents, () => field('return-accounting-submit').click(), 201)
  const approve = async (id: string) => {
    await reviewer.goto(financePage)
    const row = reviewer.getByTestId('return-accounting-document-' + id)
    await uiChange(reviewer, documents + '/' + id + '/decision', () => row.getByRole('button', { name: '复核通过并过账' }).click())
    await expect(row.getByRole('link', { name: '查看凭证' })).toBeVisible()
  }
  await approve(credit.id)
  const document = (id: string) => readBusiness<TradeDocument>(maker, documents + '/' + id)
  expect(compareDecimal((await document(credit.id)).recoverable, '6')).toBe(0)

  const closedOn = '2027-02-01'
  const period = `/bff/api/finance/workspaces/${workspace}/ledger/periods/${closedOn}`
  const movePeriod = (action: string, expectedVersion: string | number) =>
    changeBusiness(reviewer, period, { expectedVersion, action, reason: 'D6 验证已关闭期间' })
  const opened = await movePeriod('open', 0)
  const closing = await movePeriod('begin-close', opened.version)
  await movePeriod('close', closing.version)
  const blocked = await changeBusiness(maker, documents, { terms: { kind: 10, on: closedOn, number: 'D6-SUP-LOCKED', memo: '关账退款验证',
    amount: '6', quantity: '0', bankId: fixture.bankId, sourceId: credit.id } }, 201)
  const denied = await requestBusiness(reviewer, documents + '/' + blocked.id + '/decision', { expectedVersion: blocked.version, decision: 'approve' })
  expect(denied.status, denied.text).toBe(409)
  expect((await document(blocked.id)).journalId).toBeNull()
  await changeBusiness(maker, documents + '/' + blocked.id + '/decision', { expectedVersion: blocked.version, decision: 'cancel' })

  await maker.goto(financePage)
  await field('return-accounting-document-' + credit.id).getByRole('button', { name: '登记退款' }).click()
  await field('return-accounting-number').fill('D6-SUP-REFUND')
  await field('return-accounting-date').fill(on)
  const refund = await uiChange(maker, documents, () => field('return-accounting-submit').click(), 201)
  await approve(refund.id)
  expect(compareDecimal((await document(credit.id)).recoverable, '0')).toBe(0)
  const bank = await readBusiness<BankMovement[]>(maker, trade + '/banks/' + fixture.bankId + '/movements')
  expect(compareDecimal(bank.find(row => row.documentId === refund.id)!.amount, '6')).toBe(0)
}

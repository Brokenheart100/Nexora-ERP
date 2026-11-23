import { expect, type Page } from '@playwright/test'
import { baseline } from './helpers'
import { changeBusiness, chooseOption, readBusiness, requestBusiness, uiChange } from './business-actions'
import type { SalesDetail, warehouseShipmentSchema } from '../shared/types/sales'
import type { CustomerDocument, ShipmentAllowance } from '../shared/types/receivables'
import type { z } from 'zod'
import { compareDecimal } from '../shared/utils/decimal'

const workspace = baseline.workspace.id
const warehouse = baseline.warehouse.id
const inventory = `/bff/api/inventory/workspaces/${workspace}`
const finance = `/bff/api/finance/workspaces/${workspace}`
const ar = finance + '/receivables'
const sales = `/bff/api/sales/workspaces/${workspace}/orders`
const movementPage = (itemId: string) => `/inventory?workspace=${workspace}&warehouse=${warehouse}&tab=movements&item=${itemId}`
const accountPage = (movementId: string) => `/sales?workspace=${workspace}&tab=receivables&stockReturn=${movementId}`

export async function verifySalesReturn(maker: Page, reviewer: Page, receiver: Page, itemId: string, on: string, tag: string) {
  await changeBusiness(maker, finance + '/tax/classifications', { kind: 'item', resourceId: itemId, groupCode: 'D0-TAX', expectedVersion: 0 })
  const order = await changeBusiness(maker, sales, { number: 'D6-SO-' + tag, draft: { on, customerId: baseline.customer.id,
    lines: [{ itemId, quantity: '2', unitPrice: '10' }] } }, 201)
  const path = sales + '/' + order.id
  const submitted = await changeBusiness(maker, path + '/decision', { decision: 'submit', expectedVersion: order.version })
  const approved = await changeBusiness(reviewer, path + '/decision', { decision: 'approve', expectedVersion: submitted.version })
  const detail = await readBusiness<SalesDetail>(reviewer, path)
  const permit = (await changeBusiness<{ permitIds: string[] }>(reviewer, path + '/fulfillments', {
    warehouseId: warehouse, expectedVersion: approved.version, lines: [{ lineId: detail.lines[0]!.id, quantity: '2' }]
  }, 202)).permitIds[0]!
  let ready: z.infer<typeof warehouseShipmentSchema> | undefined
  await expect.poll(async () => {
    ready = (await readBusiness<z.infer<typeof warehouseShipmentSchema>[]>(receiver, inventory + '/warehouses/' + warehouse + '/shipments')).find(row => row.id === permit)
    return ready?.canShip
  }).toBe(true)
  const shipped = await changeBusiness(receiver, inventory + '/shipments/' + permit + '/ship', { expectedRevision: ready!.revision, on, quantity: '2' })
  await expect.poll(async () => (await readBusiness<ShipmentAllowance[]>(maker, ar + '/shipments')).find(row => row.id === shipped.id)?.posted).toBe(true)
  const documents = ar + '/documents'
  const submit = (draft: Record<string, unknown>) => changeBusiness(maker, documents, { draft: { on, ...draft } }, 201)
  const approve = (row: { id: string, version: string | number }) =>
    changeBusiness(reviewer, documents + '/' + row.id + '/decision', { expectedVersion: row.version, approve: true })
  const invoice = await submit({ kind: 'invoice', number: 'D6-INV-' + tag, lines: [{ shipmentId: shipped.id, quantity: '2' }] })
  await approve(invoice)
  const postedInvoice = await readBusiness<CustomerDocument>(maker, documents + '/' + invoice.id)
  const funds = await submit({ kind: 'receipt', number: 'D6-RC-' + tag, customerId: baseline.customer.id, bankId: baseline.bank.id, amount: postedInvoice.terms.total })
  await approve(funds)
  await approve(await submit({ kind: 'allocation', number: 'D6-ALLOC-' + tag, invoiceId: invoice.id, fundsId: funds.id, amount: postedInvoice.terms.total }))

  await reviewer.goto(movementPage(itemId))
  await reviewer.getByTestId('movement-return-' + shipped.id).click()
  await reviewer.getByTestId('stock-return-date').fill(on)
  await reviewer.getByTestId('stock-return-qty-1').fill('1')
  await reviewer.getByTestId('stock-return-reason').fill('D6 部分销售退货')
  const requested = await uiChange(reviewer, inventory + '/shipments/' + shipped.id + '/returns', () => reviewer.getByTestId('stock-return-submit').click())
  await receiver.goto(movementPage(itemId))
  await receiver.getByTestId('stock-return-row-' + requested.id).getByRole('button', { name: '查看' }).click()
  const decision = inventory + '/sales-returns/' + requested.id + '/decision'
  const returned = await uiChange(receiver, decision, () => receiver.getByTestId('stock-return-confirm').click())
  await expect(receiver.getByTestId('stock-return-detail-status')).toHaveText('仓库已确认')
  const duplicate = await requestBusiness(receiver, decision, { confirm: true })
  expect(duplicate.status).toBe(409)
  await expect.poll(async () => (await readBusiness<ShipmentAllowance[]>(maker, ar + '/shipments')).find(row => row.id === returned.id)?.creditable).toBe('1')

  await maker.goto(accountPage(returned.id))
  await maker.getByTestId('accounting-return-' + returned.id).getByRole('button', { name: '新建贷项' }).click()
  await chooseOption(maker, 'return-accounting-settlement', postedInvoice.terms.number)
  await maker.getByTestId('return-accounting-number').fill('D6-CREDIT-' + tag)
  await maker.getByTestId('return-accounting-date').fill(on)
  const credit = await uiChange(maker, documents, () => maker.getByTestId('return-accounting-submit').click(), 201)
  await reviewer.goto(accountPage(returned.id))
  const creditRow = reviewer.getByTestId('return-accounting-document-' + credit.id)
  await uiChange(reviewer, documents + '/' + credit.id + '/decision', () => creditRow.getByRole('button', { name: '复核通过并过账' }).click())
  await expect(creditRow).toContainText('已过账')
  const postedCredit = await readBusiness<CustomerDocument>(maker, documents + '/' + credit.id)
  expect(compareDecimal(postedCredit.openBalance, '11.3')).toBe(0)
  expect(postedCredit.terms.returnId).toBe(returned.id)

  const held = await submit({ kind: 'refund', on: '2027-01-01', number: 'D6-BLOCKED-' + tag, fundsId: credit.id, bankId: baseline.bank.id, amount: '1' })
  expect((await requestBusiness(reviewer, documents + '/' + held.id + '/decision', { expectedVersion: held.version, approve: true })).status).toBe(409)
  expect((await readBusiness<CustomerDocument>(maker, documents + '/' + held.id)).journalId).toBeNull()
  await changeBusiness(maker, documents + '/' + held.id + '/decision', { expectedVersion: held.version, approve: false })
  await maker.goto(accountPage(returned.id))
  await maker.getByTestId('return-accounting-document-' + credit.id).getByRole('button', { name: '登记退款' }).click()
  await maker.getByTestId('return-accounting-number').fill('D6-REFUND-' + tag)
  await maker.getByTestId('return-accounting-date').fill(on)
  const refund = await uiChange(maker, documents, () => maker.getByTestId('return-accounting-submit').click(), 201)
  await reviewer.goto(accountPage(returned.id))
  const refundRow = reviewer.getByTestId('return-accounting-document-' + refund.id)
  await uiChange(reviewer, documents + '/' + refund.id + '/decision', () => refundRow.getByRole('button', { name: '复核通过并过账' }).click())
  await expect(refundRow.getByRole('link', { name: '查看凭证' })).toBeVisible()
  expect(compareDecimal((await readBusiness<CustomerDocument>(maker, documents + '/' + credit.id)).openBalance, '0')).toBe(0)
  const moves = await readBusiness<{ id: string, quantity: string, cost: string }[]>(receiver, inventory + '/warehouses/' + warehouse + '/movements?itemId=' + itemId)
  expect(moves.find(row => row.id === returned.id)).toMatchObject({ quantity: '1', cost: '6' })
}

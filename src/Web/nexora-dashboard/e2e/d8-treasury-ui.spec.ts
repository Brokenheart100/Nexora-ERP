import { randomUUID } from 'node:crypto'
import { expect, test, type Page } from '@playwright/test'
import { api, baseline, emailLogin, login, origin } from './helpers'
import { changeBusiness, chooseOption, readBusiness, requestBusiness, uiChange } from './business-actions'
import { financePage } from './d7-accounting-scenarios'
import { amountIs, createBank, financeRoot, postTrade, verifyBanking } from './d8-bank-scenarios'
import type { InventoryReceipt, PurchaseDetail } from '../shared/types/purchasing'
import type { AccrualReceipt, BankMovement, TradeDocument, TradeJournal } from '../shared/types/trade'
import type { ReceiptDispatch } from '../shared/types/treasury'
import type { WireBank } from '../shared/types/prerequisites'

const workspace = baseline.workspace.id as string
const master = '/bff/api/masterdata/workspaces/' + workspace
const inventory = '/bff/api/inventory/workspaces/' + workspace
const finance = financeRoot(workspace)
const trade = finance + '/trade'
const documents = trade + '/documents'
const localMail = new URL(process.env.NEXORA_D8_MAILPIT_URL || 'http://127.0.0.1:8025')
const mailApi = (path: string) => new URL('/api/v1' + path, localMail)

async function verifyPaymentVoid(alice: Page, bob: Page, receiver: Page, tag: string, bank: WireBank) {
  await emailLogin(receiver, baseline.receiver.email)
  const on = '2026-01-10'
  const product = await readBusiness<{ categoryId: string, unitId: string }>(alice, master + '/items/' + baseline.product.id)
  const item = await changeBusiness(alice, master + '/items', {
    categoryId: product.categoryId, unitId: product.unitId, kind: 'product', tracksInventory: true, code: 'D8-SKU-' + tag, name: 'D8 付款联调商品'
  }, 201)
  const supplier = await changeBusiness(alice, master + '/partners', {
    code: 'D8-SUP-' + tag, profile: { name: 'D8 付款联调供应商', roles: ['supplier'], contacts: [] }
  }, 201)
  const purchasePath = '/bff/api/purchasing/workspaces/' + workspace + '/orders'
  const order = await changeBusiness(alice, purchasePath, { number: 'D8-PO-' + tag, draft: { on, supplierId: supplier.id,
    departmentId: baseline.department.id, lines: [{ itemId: item.id, quantity: '100', unitPrice: '10' }] } }, 201)
  const path = purchasePath + '/' + order.id
  const sent = await changeBusiness(alice, path + '/decision', { decision: 'submit', expectedVersion: order.version })
  const approved = await changeBusiness(bob, path + '/decision', { decision: 'approve', expectedVersion: sent.version })
  const orderDetail = await readBusiness<PurchaseDetail>(bob, path)
  const { permitId } = await changeBusiness<{ permitId: string }>(bob, path + '/receipts', {
    warehouseId: baseline.warehouse.id, lineId: orderDetail.lines[0]!.id, expectedVersion: approved.version, quantity: '100'
  }, 202)
  let receipt: InventoryReceipt | undefined
  await expect.poll(async () => {
    receipt = (await readBusiness<InventoryReceipt[]>(receiver, inventory + '/warehouses/' + baseline.warehouse.id + '/receipts'))
      .find(row => row.ticket.permitId === permitId)
    return !!receipt
  }).toBe(true)
  const stock = await changeBusiness(receiver, inventory + '/receipts/' + permitId + '/receive',
    { on, quantity: '100', expectedRevision: receipt!.revision })
  await expect.poll(async () => (await readBusiness<AccrualReceipt[]>(alice, trade + '/receipts')).find(row => row.fact.id === stock.id)?.posted).toBe(true)
  const assessed = await changeBusiness(alice, finance + '/tax/assessments', {
    on, groupCode: 'D0-TAX', itemId: item.id, partnerId: supplier.id, quantity: '100', unitPrice: '10', discount: '0', includesTax: false
  })
  const bill = await postTrade(alice, bob, workspace, { kind: 1, number: 'D8-BILL-' + tag, on, memo: 'D8 作废付款账单',
    amount: '1000', quantity: '100', partnerId: supplier.id,
    billReceipts: [{ receiptId: stock.id, quantity: '100', net: '1000', taxAssessmentId: assessed.id }] })
  amountIs(bill.outstanding, '1130')
  const payment = await postTrade(alice, bob, workspace, { kind: 2, number: 'D8-PAY-' + tag, on, memo: 'D8 部分支付',
    amount: '600', quantity: '0', sourceId: bill.id, bankId: bank.id })
  const billPath = financePage(workspace, 'payables', '&bill=' + bill.id)
  const payMoves = trade + '/banks/' + bank.id + '/movements'
  const old = (await readBusiness<BankMovement[]>(alice, payMoves)).find(row => row.documentId === payment.id)!
  amountIs(old.amount, '-600')
  const openPayment = async (page: Page, amount: string) => {
    await page.goto(billPath)
    await expect(page.getByTestId('bill-detail-outstanding')).toContainText(amount)
    await page.getByTestId('payment-open-' + payment.id).click()
  }
  await openPayment(alice, '530.00')
  await alice.getByTestId('payment-void-number').fill('D8-VOID-' + tag)
  await alice.getByTestId('payment-void-date').fill(on)
  await alice.getByTestId('payment-void-reason').fill('D8 银行原付款退回')
  const correction = await uiChange(alice, documents, () => alice.getByTestId('payment-void-submit').click(), 201)
  await expect(alice.getByTestId('payment-void-approve-' + correction.id)).toHaveCount(0)
  amountIs((await readBusiness<TradeDocument>(alice, documents + '/' + bill.id)).outstanding, '530')
  const decision = documents + '/' + correction.id + '/decision'
  expect((await requestBusiness(alice, decision, { expectedVersion: correction.version, decision: 'approve' })).status).toBe(403)
  await openPayment(bob, '530.00')
  await uiChange(bob, decision, () => bob.getByTestId('payment-void-approve-' + correction.id).click())
  await expect(bob.getByTestId('payment-detail-status')).toHaveText('已作废')
  await expect(bob.getByTestId('payment-reversal-balance')).toContainText('1,130.00')
  const reversal = await readBusiness<TradeDocument>(bob, documents + '/' + correction.id)
  expect(reversal.terms.sourceId).toBe(payment.id)
  expect((await readBusiness<TradeDocument>(bob, documents + '/' + payment.id)).reversedById).toBe(correction.id)
  amountIs((await readBusiness<TradeDocument>(bob, documents + '/' + bill.id)).outstanding, '1130')
  const journal = await readBusiness<TradeJournal>(bob, finance + '/ledger/journals/' + reversal.journalId)
  amountIs(journal.lines.find(row => row.accountId === bank.accountId)!.debit, '600')
  const moves = await readBusiness<BankMovement[]>(bob, payMoves)
  const entry = moves.find(row => row.documentId === correction.id)!
  expect(entry.reversesId).toBe(old.id)
  expect(moves.find(row => row.id === old.id)?.voided).toBe(true)
  amountIs(entry.amount, '600')
  await bob.getByRole('link', { name: '查看冲销单与资金流水' }).click()
  await expect(bob.getByTestId('treasury-flow-detail')).toContainText('D8-VOID-' + tag)
  await bob.getByTestId('treasury-flow-detail-original').click()
  await expect(bob.getByTestId('treasury-flow-detail')).toContainText('D8-PAY-' + tag)
}

type MailpitMessage = { ID: string, Attachments?: { FileName: string, ContentType: string }[] }
async function verifyDonation(alice: Page, bob: Page, tag: string, bank: WireBank) {
  const path = financePage(workspace, 'donations')
  const field = (id: string) => alice.getByTestId(id)
  const review = (id: string) => bob.getByTestId(id)
  const recipient = 'd8-donor-' + tag.toLowerCase() + '@example.invalid'
  expect(['127.0.0.1', 'localhost']).toContain(localMail.hostname)
  const capability = await readBusiness<{ invoiceMail: string, statutoryDonationReceipt: boolean }>(bob, finance + '/capabilities')
  expect(capability).toMatchObject({ invoiceMail: 'local-only', statutoryDonationReceipt: false })
  await changeBusiness(alice, master + '/partners', { code: 'D8-DONOR-' + tag,
    profile: { name: 'D8 联调捐赠人', roles: ['donor'], contacts: [{ name: '测试联系人', email: recipient }] } }, 201)
  await alice.goto(path)
  await field('donation-new').click()
  await chooseOption(alice, 'donation-form-donor', 'D8-DONOR-' + tag + ' · D8 联调捐赠人')
  await field('donation-form-number').fill('D8-DON-' + tag)
  await field('donation-form-date').fill('2026-01-11')
  await field('donation-form-amount').fill('200')
  await chooseOption(alice, 'donation-form-account', bank.code + ' · ' + bank.name)
  await field('donation-form-purpose').fill('D8 公益捐赠验收')
  const gift = await uiChange(alice, documents, () => field('donation-form-submit').click(), 201)
  await expect(field('donation-review-approve')).toBeDisabled()
  const decide = documents + '/' + gift.id + '/decision'
  expect((await requestBusiness(alice, decide, { expectedVersion: gift.version, decision: 'approve' })).status).toBe(403)
  await bob.goto(path)
  await review('donation-open-' + gift.id).click()
  await uiChange(bob, decide, () => review('donation-review-approve').click())
  const receipt = documents + '/' + gift.id + '/donation-receipt'
  const ordinary = await readBusiness<{ number: string, amount: string, donor: string, journalId: string }>(bob, receipt)
  amountIs(ordinary.amount, '200')
  expect(ordinary.donor).toBe('D8 联调捐赠人')
  await expect(review('donation-receipt-number')).toHaveText(ordinary.number)
  await expect(review('donation-journal')).toHaveText(ordinary.journalId)
  await expect(review('donation-fund-link')).toHaveAttribute('href', new RegExp(gift.id))
  const pdf = await bob.request.get((await review('donation-receipt-open').getAttribute('href'))!)
  expect(pdf.ok()).toBe(true)
  expect(pdf.headers()['content-type']).toContain('application/pdf')
  expect((await pdf.body()).subarray(0, 5).toString()).toBe('%PDF-')
  await expect(review('donation-ticket-capability')).toContainText('外部已开具')
  await review('donation-ticket-code').fill('00D8')
  await review('donation-ticket-number').fill('00' + tag)
  await review('donation-ticket-date').fill('2026-01-11')
  const ticket = await uiChange<{ id: string, number: string }>(bob, receipt + '/fiscal-tickets', () => review('donation-ticket-link').click(), 201)
  expect(ticket.number).toBe('00' + tag)
  await review('donation-ticket-open').click()
  await expect(review('donation-ticket-detail')).toContainText(ticket.id)
  const badContact = await requestBusiness(bob, receipt + '/dispatches', { recipient: 'not-on-record@example.invalid' })
  expect(badContact.status).toBe(403)
  const dispatch = (id: string) => readBusiness<ReceiptDispatch>(bob, receipt + '/dispatches/' + id)
  const queue = () => uiChange<ReceiptDispatch>(bob, receipt + '/dispatches', () => review('donation-mail-send').click(), 201)
  const waitState = (id: string, state: string) => expect.poll(async () => (await dispatch(id)).state).toBe(state)
  const send = await queue()
  expect(send.state).toBe('queued')
  await waitState(send.id, 'sent')
  const view = async (id: string) => {
    await bob.getByRole('button', { name: '刷新投递' }).click()
    await review('donation-dispatch-open-' + id).click()
    await expect(review('donation-dispatch-detail')).toBeVisible()
  }
  await view(send.id)
  const resend = await uiChange<ReceiptDispatch>(bob, receipt + '/dispatches/' + send.id + '/decision', () => review('donation-dispatch-resend').click())
  expect(resend.previousId).toBe(send.id)
  expect((await dispatch(send.id)).resentAsId).toBe(resend.id)
  await waitState(resend.id, 'sent')
  await review('donation-dispatch-close').click()

  const inbox = async () => {
    const url = mailApi('/search')
    url.searchParams.set('query', 'to:' + recipient)
    const response = await fetch(url)
    expect(response.ok).toBe(true)
    return ((await response.json()).messages ?? []) as MailpitMessage[]
  }
  await expect.poll(async () => (await inbox()).length).toBe(2)
  const messages = await inbox()
  for (const summary of messages) {
    const message = await (await fetch(mailApi('/message/' + summary.ID))).json() as MailpitMessage
    expect(message.Attachments).toEqual([expect.objectContaining({ ContentType: 'application/pdf', FileName: expect.stringMatching(/\.pdf$/i) })])
  }

  if (process.env.NEXORA_D8_MAILPIT_URL) {
    const chaos = mailApi('/chaos')
    const current = await (await fetch(chaos)).json()
    const setChaos = async (value: unknown) => {
      const result = await fetch(chaos, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) })
      expect(result.ok, await result.text()).toBe(true)
    }
    const reject = { Recipient: { Probability: 100, ErrorCode: 451 } }
    try {
      await setChaos(reject)
      const failed = await queue()
      await waitState(failed.id, 'failed')
      expect((await dispatch(failed.id)).detail).toContain('451')
      await setChaos(current)
      await view(failed.id)
      const retry = await uiChange<ReceiptDispatch>(bob, receipt + '/dispatches/' + failed.id + '/decision', () => review('donation-dispatch-retry').click())
      expect(retry.id).toBe(failed.id)
      expect(retry.attempt).toBe(2)
      await waitState(retry.id, 'sent')
      await review('donation-dispatch-close').click()
      await expect.poll(async () => (await inbox()).length).toBe(3)
      await setChaos(reject)
      const abandon = await queue()
      await waitState(abandon.id, 'failed')
      await view(abandon.id)
      const ended = await uiChange<ReceiptDispatch>(bob, receipt + '/dispatches/' + abandon.id + '/decision', () => review('donation-dispatch-abandon').click())
      expect(ended.state).toBe('abandoned')
      expect((await inbox()).length).toBe(3)
    } finally { await setChaos(current) }
  }
  expect((await api(bob, receipt + '/pdf')).status).toBe(200)
}

test('D8 原 Dashboard 资金、付款作废、银行对账与捐赠收据', async ({ page: alice, browser }) => {
  test.setTimeout(420_000)
  const bob = await browser.newPage({ baseURL: origin, locale: 'zh-CN' })
  const receiver = await browser.newPage({ baseURL: origin, locale: 'zh-CN' })
  const errors: string[] = []
  for (const page of [alice, bob, receiver]) page.on('pageerror', error => errors.push(error.message))
  const tag = randomUUID().slice(0, 8).toUpperCase()
  try {
    await Promise.all([login(alice, 'alice'), login(bob, 'bob')])
    const { bank, cash } = await test.step('资金账户、CSV 导入、拆分匹配与两期银行对账', async () => {
      const bank = await createBank(alice, workspace, 'D8-BANK-' + tag, 'D8 对账账户 ' + tag)
      const cash = await createBank(alice, workspace, 'D8-CASH-' + tag, 'D8 现金账户 ' + tag, 'cash')
      await verifyBanking(alice, bob, workspace, tag, bank, cash)
      const balance = await readBusiness<WireBank>(alice, trade + '/banks/' + bank.id)
      amountIs(balance.balance, '1350')
      return { bank, cash }
    })
    await test.step('供应商付款作废与账单余额回补', () => verifyPaymentVoid(alice, bob, receiver, tag, cash))
    await test.step('捐赠复核、真实 PDF、外部票据与本地邮件投递', () => verifyDonation(alice, bob, tag, bank))
    expect(errors).toEqual([])
  } finally {
    await bob.close()
    await receiver.close()
  }
})

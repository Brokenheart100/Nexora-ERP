import { expect, test, type Page } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import { api, baseline, emailLogin, login, origin } from './helpers'
import { changeBusiness, chooseOption, readBusiness, requestBusiness, uiChange } from './business-actions'
import { addRate, addTaxGroup, showPeriod, taxEntry, taxRoot } from './d10-tax-actions'
import { liveSales, prepareInvoicing } from './d9-invoice-scenarios'
import { financePage, saveAccount } from './d7-accounting-scenarios'
import { amountIs, postTrade } from './d8-bank-scenarios'
import type { TaxCalendar, TaxFiling, TaxSnapshot } from '../shared/types/tax'
import type { CustomerDocument } from '../shared/types/receivables'
import type { InventoryReceipt, PurchaseDetail } from '../shared/types/purchasing'
import type { AccrualReceipt } from '../shared/types/trade'

test.use({ trace: 'off', screenshot: 'off', video: 'off' })
const jan = '2026-01-10'
const feb = '2026-02-01'
type Fixture = Awaited<ReturnType<typeof prepareInvoicing>>

async function configureTax(maker: Page, fixture: Fixture) {
  const tax = taxRoot(fixture.workspace)
  const field = (id: string) => maker.getByTestId(id)
  await maker.goto(taxEntry(fixture.workspace))
  const first = await addRate(maker, tax, '0.13', '2026-01-01')
  const second = await addRate(maker, tax, '0.14', feb)
  await addTaxGroup(maker, tax)
  await field('tax-group-edit-D10-STD').click()
  await field('tax-group-name').fill('D10 标准税组 v2')
  const updated = await uiChange(maker, tax + '/groups', () => field('tax-group-save').click())
  expect(Number(updated.version)).toBe(2)
  expect((await requestBusiness(maker, tax + '/groups', { code: 'D10-STD', name: '失效版本', rateCodes: ['D10-VAT'], expectedVersion: 1 })).status).toBe(409)

  await chooseOption(maker, 'tax-binding-resource', /D9-SVC/)
  await chooseOption(maker, 'tax-binding-group', /D10-STD/)
  await uiChange(maker, tax + '/classifications', () => field('tax-binding-save').click())
  await expect(field('tax-binding-current')).toContainText('D10-STD · v2')
  await chooseOption(maker, 'tax-binding-kind', '往来单位')
  await chooseOption(maker, 'tax-binding-resource', /D9-CUS/)
  await chooseOption(maker, 'tax-binding-group', /D9-TAX/)
  await uiChange(maker, tax + '/classifications', () => field('tax-binding-save').click())
  await expect(field('tax-binding-current')).toContainText('D9-TAX · v1')

  await field('tax-assess-on').fill(jan)
  await field('tax-assess-price').fill('1130')
  await chooseOption(maker, 'tax-assess-item', /D9-SVC/)
  await chooseOption(maker, 'tax-assess-partner', /D9-CUS/)
  const assess = () => uiChange<TaxSnapshot>(maker, tax + '/assessments', () => field('tax-assess-save').click())
  const zero = await assess()
  expect(zero.groupSource).toBe('partner')
  amountIs(zero.amounts.tax, '0')

  await chooseOption(maker, 'tax-assess-group', /D10-STD/)
  await field('tax-assess-inclusive').click()
  await field('tax-assess-discount').fill('0.10')
  const original = await assess()
  expect(original.groupSource).toBe('explicit')
  expect(original.amounts.components?.[0]?.rateId).toBe(first.id)
  amountIs(original.amounts.net, '900')
  amountIs(original.amounts.tax, '117')
  amountIs(original.amounts.total, '1017')

  await field('tax-assess-on').fill(feb)
  await field('tax-assess-inclusive').click()
  await field('tax-assess-discount').fill('0')
  await field('tax-assess-price').fill('10.075')
  const later = await assess()
  expect(later.amounts.components?.[0]?.rateId).toBe(second.id)
  amountIs(later.amounts.net, '10.08')
  amountIs(later.amounts.tax, '1.41')
  amountIs(later.amounts.total, '11.49')

  await field('tax-assessment-id').fill(original.id)
  await maker.getByRole('button', { name: '查看税额快照' }).last().click()
  await expect(field('tax-assessment-detail')).toContainText(original.id)
  await expect(field('tax-assessment-detail')).toContainText('117.00')
  expect(await readBusiness<TaxSnapshot>(maker, tax + '/assessments/' + original.id)).toEqual(original)
  await maker.keyboard.press('Escape')
  await chooseOption(maker, 'tax-binding-group', /D10-STD/)
  await uiChange(maker, tax + '/classifications', () => field('tax-binding-save').click())
}

async function invoice(maker: Page, fixture: Fixture, on: string) {
  const { ar, input } = fixture
  const plan = await changeBusiness(maker, ar + '/schedules', {
    expectedVersion: 0, input: { ...input, quantity: '1', unitPrice: '100', nextOn: on, endsOn: on }
  })
  const { invoiceId } = await changeBusiness<{ invoiceId: string }>(maker, ar + '/schedules/' + plan.id + '/run', { on })
  expect(invoiceId).toBeTruthy()
  return readBusiness<CustomerDocument>(maker, ar + '/documents/' + invoiceId)
}

function approve(reviewer: Page, ar: string, doc: { id: string, version: string | number }) {
  return changeBusiness(reviewer, ar + '/documents/' + doc.id + '/decision', { expectedVersion: doc.version, approve: true })
}

async function changeCalendar(page: Page, tax: string, cycle: string, basis: string) {
  await page.getByTestId('tax-calendar-edit').click()
  await chooseOption(page, 'tax-calendar-cycle', cycle)
  await chooseOption(page, 'tax-calendar-basis', basis)
  await uiChange<TaxCalendar>(page, tax + '/calendar', () => page.getByTestId('tax-calendar-save').click(), 200, 'PUT')
  await expect(page.getByTestId('tax-calendar-state')).toContainText(basis)
}

async function verifyRecognition(maker: Page, reviewer: Page, fixture: Fixture, first: CustomerDocument) {
  const { workspace, finance, ar } = fixture
  const tax = taxRoot(workspace)
  const monthly = await showPeriod(maker, tax, jan)
  expect(monthly.current.period).toEqual({ from: '2026-01-01', through: '2026-01-31' })
  amountIs(monthly.current.output, '13')
  await changeCalendar(maker, tax, '季度', '收付实现制')
  const cash = await showPeriod(maker, tax, jan)
  expect(cash.current.period.through).toBe('2026-03-31')
  amountIs(cash.current.output, '0')

  const account = await saveAccount(maker, finance, { code: 'D10-BANK-CTL', name: 'D10 银行控制科目', category: 'asset', purpose: 'control' })
  const bank = await changeBusiness(maker, finance + '/trade/banks', { code: 'D10-BANK', name: 'D10 联调银行', kind: 'bank', accountId: account.id }, 201)
  const receipt = await changeBusiness(maker, ar + '/documents', { draft: {
    kind: 'receipt', number: 'D10-RECEIPT', on: jan, customerId: fixture.input.customerId, bankId: bank.id, amount: '56.50'
  } }, 201)
  await approve(reviewer, ar, receipt)
  amountIs((await showPeriod(maker, tax, jan)).current.output, '0')
  const allocation = await changeBusiness(maker, ar + '/documents', { draft: {
    kind: 'allocation', number: 'D10-ALLOCATION', on: jan, invoiceId: first.id, fundsId: receipt.id, amount: '56.50'
  } }, 201)
  await approve(reviewer, ar, allocation)
  const recognized = await showPeriod(maker, tax, jan)
  amountIs(recognized.current.output, '6.50')
  expect(recognized.current.sources[0]?.taxDocumentId).toBe(first.id)
  await maker.getByRole('button', { name: /过账来源/ }).click()
  await expect(maker.getByTestId('tax-period-sources')).toContainText('D10-ALLOCATION')
  await changeCalendar(maker, tax, '月度', '权责发生制')
  amountIs((await showPeriod(maker, tax, jan)).current.output, '13')
}

async function verifyFilings(maker: Page, reviewer: Page, fixture: Fixture) {
  const { workspace, ar, finance } = fixture
  const tax = taxRoot(workspace)
  const path = tax + '/periods/2026-01-01/filings'
  const field = (page: Page, id: string) => page.getByTestId(id)
  const start = async (page: Page, ref: string) => {
    await field(page, 'tax-filing-open').click()
    await field(page, 'tax-filing-reference').fill(ref)
  }
  await start(maker, 'D10-STALE')
  await expect(field(maker, 'tax-filing-lock')).toHaveCount(0)
  await approve(reviewer, ar, await invoice(maker, fixture, '2026-01-11'))
  await uiChange(maker, path, () => field(maker, 'tax-filing-submit').click(), 409)
  await field(maker, 'tax-filing-refresh').click()
  await expect(field(maker, 'tax-period-current')).toContainText('26')
  await start(maker, 'D10-ORIGINAL')
  const initial = await uiChange<TaxFiling>(maker, path, () => field(maker, 'tax-filing-submit').click(), 201)
  expect(initial.filing).toMatchObject({ version: 1, correctsId: null, lockBooks: false })
  amountIs(initial.snapshot.output, '26')
  await expect(field(maker, 'tax-filing-detail')).toContainText('D10-ORIGINAL')
  await expect(field(maker, 'tax-calendar-edit')).toHaveCount(0)

  await approve(reviewer, ar, await invoice(maker, fixture, '2026-01-12'))
  const waiting = await invoice(maker, fixture, '2026-01-13')
  await reviewer.goto(taxEntry(workspace))
  await showPeriod(reviewer, tax, jan)
  await expect(field(reviewer, 'tax-filing-difference')).toBeVisible()
  await start(reviewer, 'D10-CORRECTION')
  await expect(field(reviewer, 'tax-filing-submit')).toBeDisabled()
  await field(reviewer, 'tax-filing-reason').fill('补记一张原期间发票')
  await field(reviewer, 'tax-filing-lock').click()
  const corrected = await uiChange<TaxFiling>(reviewer, path, () => field(reviewer, 'tax-filing-submit').click(), 201)
  expect(corrected.filing).toMatchObject({ version: 2, correctsId: initial.filing.id, lockBooks: true })
  amountIs(corrected.snapshot.output, '39')
  await expect(field(reviewer, 'tax-filing-detail')).toContainText('补记一张原期间发票')
  await reviewer.keyboard.press('Escape')
  await field(reviewer, 'tax-filing-history-1').click()
  await expect(field(reviewer, 'tax-filing-detail')).toContainText('D10-ORIGINAL')
  expect(await readBusiness<TaxFiling>(reviewer, tax + '/filings/' + initial.filing.id)).toEqual(initial)
  expect((await api(maker, taxRoot(baseline.workspace.id) + '/filings/' + initial.filing.id)).status).toBe(404)
  expect((await readBusiness<TaxCalendar>(reviewer, tax + '/calendar')).lockedThrough).toBe('2026-01-31')

  const rejected = await requestBusiness(reviewer, ar + '/documents/' + waiting.id + '/decision', { expectedVersion: waiting.version, approve: true })
  expect([409, 412, 422]).toContain(rejected.status)
  expect(await readBusiness<CustomerDocument>(reviewer, ar + '/documents/' + waiting.id)).toMatchObject({ version: waiting.version, state: 'submitted', journalId: null })

  await changeBusiness(reviewer, finance + '/ledger/periods/' + feb, { expectedVersion: 0, action: 'open', reason: 'D10 锁账后下一期间' })
  const next = await invoice(maker, fixture, feb)
  await approve(reviewer, ar, next)
  const posted = await readBusiness<CustomerDocument>(reviewer, ar + '/documents/' + next.id)
  expect(posted.state).toBe('posted')
  amountIs(posted.terms.lines![0]!.tax, '14')
}

test('D10 新版 Dashboard 税率、单据快照和申报锁账', async ({ browser }) => {
  test.setTimeout(420_000)
  const owner = await browser.newPage({ baseURL: origin }), maker = await browser.newPage({ baseURL: origin }), reviewer = await browser.newPage({ baseURL: origin })
  try {
    const fixture = await prepareInvoicing(owner, maker, reviewer, 'D10')
    await test.step('配置日期版本与显式、伙伴和商品税组', () => configureTax(maker, fixture))
    const first = await invoice(maker, fixture, jan)
    await approve(reviewer, fixture.ar, first)
    await reviewer.goto(liveSales(fixture.workspace, 'invoices', first.id))
    const snapshot = reviewer.getByTestId('sales-line-tax-snapshot')
    await snapshot.getByRole('button', { name: '税项快照' }).click()
    await expect(snapshot).toContainText('D10-VAT')
    await expect(snapshot).toContainText('13%')
    await test.step('月度权责发生制、季度收付实现制与实际核销', () => verifyRecognition(maker, reviewer, fixture, first))
    await test.step('拒绝旧指纹、更正历史保留和过账锁账', () => verifyFilings(maker, reviewer, fixture))
  } finally {
    await Promise.all([owner, maker, reviewer].map(page => page.close()))
  }
})

test('D10 含税采购账单从匹配行回读原评估快照', async ({ browser }) => {
  const maker = await browser.newPage({ baseURL: origin }), reviewer = await browser.newPage({ baseURL: origin }), receiver = await browser.newPage({ baseURL: origin })
  try {
    await Promise.all([login(maker, 'alice'), login(reviewer, 'bob'), emailLogin(receiver, baseline.receiver.email)])
    const workspace = baseline.workspace.id as string
    const warehouse = baseline.warehouse.id
    const master = '/bff/api/masterdata/workspaces/' + workspace
    const inventory = '/bff/api/inventory/workspaces/' + workspace
    const tax = taxRoot(workspace)
    const tag = randomUUID().slice(0, 8).toUpperCase()
    const on = '2026-01-04'
    const baselineItem = await readBusiness<{ categoryId: string, unitId: string }>(maker, master + '/items/' + baseline.product.id)
    const item = await changeBusiness(maker, master + '/items', {
      code: 'D10-SKU-' + tag, name: 'D10 税务联调商品', kind: 'product', tracksInventory: true,
      categoryId: baselineItem.categoryId, unitId: baselineItem.unitId
    }, 201)
    const supplier = await changeBusiness(maker, master + '/partners', {
      code: 'D10-SUP-' + tag, profile: { name: 'D10 税务联调供应商', roles: ['supplier'], contacts: [] }
    }, 201)
    const orders = '/bff/api/purchasing/workspaces/' + workspace + '/orders'
    const order = await changeBusiness(maker, orders, { number: 'D10-PO-' + tag, draft: {
      on, supplierId: supplier.id, departmentId: baseline.department.id, lines: [{ itemId: item.id, quantity: '1', unitPrice: '10' }]
    } }, 201)
    const path = orders + '/' + order.id
    const sent = await changeBusiness(maker, path + '/decision', { decision: 'submit', expectedVersion: order.version })
    const approved = await changeBusiness(reviewer, path + '/decision', { decision: 'approve', expectedVersion: sent.version })
    const details = await readBusiness<PurchaseDetail>(reviewer, path)
    const permit = await changeBusiness<{ permitId: string }>(reviewer, path + '/receipts', {
      warehouseId: warehouse, lineId: details.lines[0]!.id, expectedVersion: approved.version, quantity: '1'
    }, 202)
    let ticket: InventoryReceipt | undefined
    await expect.poll(async () => {
      ticket = (await readBusiness<InventoryReceipt[]>(receiver, inventory + '/warehouses/' + warehouse + '/receipts'))
        .find(row => row.ticket.permitId === permit.permitId)
      return !!ticket
    }).toBe(true)
    const stock = await changeBusiness(receiver, inventory + '/receipts/' + permit.permitId + '/receive',
      { on, quantity: '1', expectedRevision: ticket!.revision })
    const accruals = '/bff/api/finance/workspaces/' + workspace + '/trade/receipts'
    await expect.poll(async () => (await readBusiness<AccrualReceipt[]>(maker, accruals)).find(row => row.fact.id === stock.id)?.posted).toBe(true)
    const snapshot = await changeBusiness<TaxSnapshot>(maker, tax + '/assessments', {
      on, groupCode: 'D0-TAX', itemId: item.id, partnerId: supplier.id, quantity: '1', unitPrice: '10', discount: '0', includesTax: false
    })
    const bill = await postTrade(maker, reviewer, workspace, { kind: 1, number: 'D10-BILL-' + tag,
      on, memo: 'D10 采购税额快照', amount: '10', quantity: '1', partnerId: supplier.id,
      billReceipts: [{ receiptId: stock.id, quantity: '1', net: '10', taxAssessmentId: snapshot.id }] })
    amountIs(bill.total, '11.30')
    await reviewer.goto(financePage(workspace, 'payables', '&bill=' + bill.id))
    await reviewer.getByTestId('bill-lines').getByTestId('tax-assessment-detail-open').click()
    const detail = reviewer.getByTestId('tax-assessment-detail')
    await expect(detail).toContainText(snapshot.id)
    await expect(detail).toContainText('13%')
    await expect(detail).toContainText('D0-TAX')
    await expect(detail).toContainText('1.30')
    expect(await readBusiness<TaxSnapshot>(reviewer, tax + '/assessments/' + snapshot.id)).toEqual(snapshot)
  } finally {
    await Promise.all([maker, reviewer, receiver].map(page => page.close()))
  }
})

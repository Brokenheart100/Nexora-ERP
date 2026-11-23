import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { expect, type Page } from '@playwright/test'
import type { InvoiceOccurrence, InvoiceSchedule, InvoiceScheduleInput } from '../shared/types/invoicing'
import type { CustomerDocument } from '../shared/types/receivables'
import { changeBusiness, chooseOption, readBusiness, requestBusiness, uiChange, type BusinessChange } from './business-actions'
import { financePage, saveAccount } from './d7-accounting-scenarios'
import { emailLogin, login, repository, write } from './helpers'

const run = promisify(execFile)
const date = '2026-01-10'
export const liveSales = (workspace: string, tab: string, invoice?: string) =>
  `/sales?workspace=${workspace}&tab=${tab}` + (invoice ? `&invoice=${invoice}` : '')

async function invite(owner: Page, member: Page, org: string, name: 'alice' | 'bob') {
  const { authorizationVersion } = await readBusiness<{ authorizationVersion: number }>(owner, org + '/access')
  const invitation = await changeBusiness<{ invitation: { id: string }, token: string }>(owner, org + '/invitations',
    { expectedVersion: authorizationVersion, email: name + '@nexora.invalid', role: 'WorkspaceOwner' }, 201)
  await changeBusiness(member, `/bff/api/invitations/${invitation.invitation.id}/redeem`, { token: invitation.token })
}

async function grant(member: Page, approver: Page, org: string, role: 'Accountant' | 'FinanceReviewer') {
  const access = () => readBusiness<{ authorizationVersion: number, memberId: string }>(member, org + '/access')
  const { authorizationVersion, memberId } = await access()
  const path = `${org}/members/${memberId}/finance-role`
  const proposal = await write(member, path, 'POST', { expectedVersion: authorizationVersion, action: 'propose', role, operationId: crypto.randomUUID() })
  expect(proposal.status, proposal.text).toBe(200)
  const approval = await write(approver, path, 'POST', { expectedVersion: (await access()).authorizationVersion, action: 'approve', operationId: crypto.randomUUID() })
  expect(approval.status, approval.text).toBe(200)
}

export async function prepareInvoicing(owner: Page, maker: Page, reviewer: Page, stage = 'D9') {
  const tag = Date.now().toString(36)
  const prefix = stage.toLowerCase()
  const recipient = `${prefix}-invoice-${tag}@example.invalid`
  await Promise.all([emailLogin(owner, `${prefix}-owner-${tag}@example.invalid`, true), login(maker, 'alice'), login(reviewer, 'bob')])
  const workspace = (await changeBusiness(owner, '/bff/api/workspaces', { name: stage + ' 发票联调 ' + tag }, 201)).id
  const org = '/bff/api/workspaces/' + workspace
  await invite(owner, maker, org, 'alice')
  await invite(owner, reviewer, org, 'bob')
  await grant(maker, reviewer, org, 'Accountant')
  await grant(reviewer, maker, org, 'FinanceReviewer')

  const finance = '/bff/api/finance/workspaces/' + workspace
  const ar = finance + '/receivables'
  const master = '/bff/api/masterdata/workspaces/' + workspace
  await maker.goto(financePage(workspace, 'workbench'))
  await maker.getByTestId('finance-book-start').fill('2026-01-01')
  await uiChange(maker, finance + '/book', () => maker.getByTestId('finance-book-initialize').click())
  await changeBusiness(reviewer, finance + '/ledger/periods/2026-01-01',
    { expectedVersion: 0, action: 'open', reason: 'D9 开票验证' })
  const account = async (code: string, category: string, purpose = 'posting') =>
    (await saveAccount(maker, finance, { code, name: code, category, purpose })).id
  await changeBusiness(maker, ar + '/setup', { accounts: {
    receivableAccountId: await account('D9-AR', 'asset', 'control'),
    advanceAccountId: await account('D9-ADV', 'liability', 'control'),
    revenueAccountId: await account('D9-REV', 'income'),
    outputTaxAccountId: await account('D9-TAX', 'liability', 'control'),
    costOfGoodsAccountId: await account('D9-COGS', 'expense')
  } })
  const category = await changeBusiness(maker, master + '/definitions', { kind: 'category', code: 'D9-SERVICES', name: '定期开票测试分类' }, 201)
  const unit = await changeBusiness(maker, master + '/definitions', { kind: 'unit', code: 'D9-TIME', name: '次' }, 201)
  const service = await changeBusiness(maker, master + '/items', { code: 'D9-SVC', name: '定期开票测试服务', kind: 'service',
    tracksInventory: false, categoryId: category.id, unitId: unit.id }, 201)
  const customer = await changeBusiness(maker, master + '/partners', { code: 'D9-CUS', profile: { name: '定期开票测试客户',
    roles: ['customer'], contacts: [{ name: '本地测试收件人', email: recipient }] } }, 201)
  const tax = finance + '/tax'
  await changeBusiness(maker, tax + '/rates', { code: 'D9-RATE', name: 'D9 免税测试税率', effectiveOn: '2026-01-01', rate: '0' })
  await changeBusiness(maker, tax + '/groups', { code: 'D9-TAX', name: 'D9 税组', expectedVersion: 0, rateCodes: ['D9-RATE'] })
  await changeBusiness(maker, tax + '/classifications', { kind: 'item', resourceId: service.id, groupCode: 'D9-TAX', expectedVersion: 0 })
  const input: InvoiceScheduleInput = { customerId: customer.id, serviceId: service.id, quantity: '2', unitPrice: '75',
    nextOn: date, endsOn: date, intervalMonths: 1, dueDays: 30 }
  return { workspace, finance, ar, recipient, input }
}

type Fixture = Awaited<ReturnType<typeof prepareInvoicing>>
type RunResult = BusinessChange & { invoiceId: string | null }
const conflict = [409, 412]

export async function verifyRecurring(maker: Page, fixture: Fixture) {
  const { workspace, ar, input } = fixture
  const schedules = ar + '/schedules'
  const field = (id: string) => maker.getByTestId(id)
  const future = { ...input, nextOn: '2098-01-31', endsOn: '2098-03-31' }
  await maker.goto(liveSales(workspace, 'recurring'))
  await field('recurring-new').click()
  await chooseOption(maker, 'recurring-form-customer', /D9-CUS/)
  await chooseOption(maker, 'recurring-form-service', /D9-SVC/)
  await field('recurring-form-qty').fill(input.quantity)
  await field('recurring-form-price').fill(input.unitPrice)
  await field('recurring-form-first').fill(future.nextOn)
  await field('recurring-form-end').fill(future.endsOn)
  const plan = await uiChange(maker, schedules, () => field('recurring-form-save').click())
  const path = schedules + '/' + plan.id
  const history = () => readBusiness<InvoiceOccurrence[]>(maker, path + '/occurrences')
  const original = (await readBusiness<InvoiceSchedule[]>(maker, schedules)).find(row => row.id === plan.id)!
  expect(original.preview).toEqual([future.nextOn, '2098-02-28', future.endsOn])
  expect(Date.parse(original.nextAtUtc ?? '')).toBeGreaterThan(Date.now())
  await expect(field('recurring-plan-next-utc')).toHaveText(original.nextAtUtc!)
  expect(conflict).toContain((await requestBusiness(maker, path + '/run', { on: future.nextOn })).status)

  await field('recurring-plan-edit').click()
  await field('recurring-form-qty').fill('3')
  const revised = await uiChange(maker, path, () => field('recurring-form-save').click(), 200, 'PUT')
  expect(Number(revised.version)).toBeGreaterThan(Number(plan.version))
  expect(conflict).toContain((await requestBusiness(maker, path, { expectedVersion: plan.version, input: future }, 'PUT')).status)
  expect(conflict).toContain((await requestBusiness(maker, path + '/skip', { expectedVersion: plan.version, on: future.nextOn })).status)
  await uiChange(maker, path + '/skip', () => field('recurring-plan-skip').click())
  expect(await history()).toEqual([expect.objectContaining({ on: future.nextOn, documentId: null, templateVersion: revised.version })])
  const skipped = await changeBusiness<RunResult>(maker, path + '/run', { on: future.nextOn })
  expect(skipped.invoiceId).toBeNull()

  const later = await changeBusiness(maker, schedules, { expectedVersion: 0, input: future })
  const laterPath = schedules + '/' + later.id
  await maker.reload()
  await field('recurring-open-' + later.id).click()
  const paused = await uiChange(maker, laterPath + '/pause', () => field('recurring-plan-toggle').click())
  await expect(field('recurring-plan-next-utc')).toHaveCount(0)
  const edited = await changeBusiness(maker, laterPath, { expectedVersion: paused.version, input }, 200, 'PUT')
  await expect(field('recurring-plan-toggle')).toContainText('恢复')
  // Reload the current version before resuming after the external edit.
  await maker.reload()
  await field('recurring-open-' + later.id).click()
  const resumed = await uiChange(maker, laterPath + '/pause', () => field('recurring-plan-toggle').click())
  expect(Number(resumed.version)).toBeGreaterThan(Number(edited.version))
  await field('recurring-plan-run-date').fill(input.nextOn)
  const generated = await uiChange<RunResult>(maker, laterPath + '/run', () => field('recurring-plan-run').click())
  expect(generated.invoiceId).toBeTruthy()
  const invoiceId = generated.invoiceId!
  await field('recurring-history-invoice-' + invoiceId).click()
  await expect(field('sales-invoice-delivery-live')).toBeVisible()
  if (process.env.NEXORA_D9_RESTART === '1') {
    const host = 'src/Hosting/Nexora.AppHost/Nexora.AppHost.csproj'
    const aspire = (...args: string[]) => {
      const options = [...args, '--apphost', host, '--non-interactive']
      return process.platform === 'win32'
        ? run('cmd.exe', ['/d', '/c', 'aspire', ...options], { cwd: repository })
        : run('aspire', options, { cwd: repository })
    }
    await aspire('resource', 'finance', 'restart')
    await aspire('wait', 'finance', '--timeout', '120')
  }
  const replay = await changeBusiness<RunResult>(maker, laterPath + '/run', { on: input.nextOn })
  expect(replay.invoiceId).toBe(invoiceId)
  await changeBusiness(maker, laterPath, { expectedVersion: replay.version, input: future }, 200, 'PUT')
  const saved = await readBusiness<InvoiceOccurrence[]>(maker, laterPath + '/occurrences')
  expect(saved).toEqual([expect.objectContaining({ on: input.nextOn, documentId: invoiceId, templateVersion: resumed.version })])
  expect(await history()).toEqual([expect.objectContaining({ on: future.nextOn, documentId: null, templateVersion: revised.version })])
  return invoiceId
}

export async function verifyNumbering(maker: Page, reviewer: Page, fixture: Fixture, historical: string) {
  const { ar, finance, input, workspace } = fixture
  const numbering = ar + '/invoice-numbering'
  const documents = ar + '/documents'
  const invoice = (page: Page, id: string) => readBusiness<CustomerDocument>(page, `${documents}/${id}`)
  const decide = (id: string) => `${documents}/${id}/decision`
  const preview = (on: string) => readBusiness<{ number: string }>(reviewer, `${numbering}/preview?on=${on}`)
  await reviewer.goto(liveSales(workspace, 'invoices', historical))
  await uiChange(reviewer, decide(historical), () => reviewer.getByTestId('sales-receivable-approve').click())
  const prior = await invoice(reviewer, historical)
  expect(prior.state).toBe('posted')
  expect(prior.terms.number).toMatch(/^R-/)

  await maker.goto(liveSales(workspace, 'invoice-delivery'))
  await maker.getByRole('tab', { name: '编号规则', exact: true }).click()
  await maker.getByTestId('invoice-number-pattern-live').fill('D9-{FY}-{####}')
  await maker.getByTestId('invoice-number-start-live').fill('101')
  await uiChange(maker, numbering, () => maker.getByTestId('invoice-number-save-live').click(), 200, 'PUT')
  const on = '2026-01-11'
  await maker.getByTestId('invoice-number-date-live').fill(on)
  await maker.getByTestId('invoice-number-preview-live').click()
  await expect(maker.getByTestId('invoice-number-value-live')).toContainText('D9-2026-0101')

  const generate = async (on: string) => {
    const plan = await changeBusiness(maker, ar + '/schedules', { expectedVersion: 0, input: { ...input, nextOn: on, endsOn: on } })
    const result = await changeBusiness<RunResult>(maker, `${ar}/schedules/${plan.id}/run`, { on })
    expect(result.invoiceId).toBeTruthy()
    return invoice(maker, result.invoiceId!)
  }
  const first = await generate(on)
  const second = await generate(on)
  const sameNumber = (await preview(on)).number
  const attempts = await Promise.all([first, second].map(row => requestBusiness(reviewer, decide(row.id), {
    expectedVersion: row.version, approve: true, expectedNumber: sameNumber
  })))
  const rejected = attempts.map(result => result.status).find(status => status !== 200)
  expect(attempts.filter(result => result.status === 200)).toHaveLength(1)
  expect(conflict).toContain(rejected)
  const [posted, waiting] = attempts[0]!.status === 200 ? [first, second] : [second, first]
  expect((await invoice(reviewer, posted.id)).terms.number).toBe(sameNumber)
  expect((await invoice(reviewer, waiting.id)).state).toBe('submitted')
  await reviewer.goto(liveSales(workspace, 'invoices', waiting.id))
  await reviewer.getByTestId('sales-invoice-preview-number').click()
  await expect(reviewer.getByTestId('sales-invoice-candidate')).toHaveText('D9-2026-0102')
  await uiChange(reviewer, decide(waiting.id), () => reviewer.getByTestId('sales-receivable-approve').click())
  expect((await invoice(reviewer, waiting.id)).terms.number).toBe('D9-2026-0102')

  const closedOn = '2026-02-01'
  let expectedVersion: number | string = 0
  for (const action of ['open', 'begin-close', 'close']) {
    const period = await changeBusiness(reviewer, `${finance}/ledger/periods/${closedOn}`, { expectedVersion, action, reason: 'D9 关账验证' })
    expectedVersion = period.version
  }
  const blocked = await generate(closedOn)
  const expectedNumber = (await preview(closedOn)).number
  const closed = await requestBusiness(reviewer, decide(blocked.id), { expectedVersion: blocked.version, approve: true, expectedNumber })
  expect(conflict).toContain(closed.status)
  expect(await invoice(reviewer, blocked.id)).toMatchObject({ state: 'submitted', version: blocked.version, journalId: null })
  expect((await preview(on)).number).toBe(expectedNumber)
  expect((await invoice(reviewer, historical)).terms.number).toBe(prior.terms.number)
  return { posted: posted.id, submitted: blocked.id }
}

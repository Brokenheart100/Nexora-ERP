import { expect, type Page } from '@playwright/test'
import { changeBusiness, chooseOption, readBusiness, requestBusiness, uiChange } from './business-actions'
import type { WireChart } from '../shared/types/prerequisites'
import type { fiscalYearSchema, OpeningBatch, subledgerPreviewSchema } from '../shared/types/ledger'
import type { z } from 'zod'
import { compareDecimal, sumDecimals } from '../shared/utils/decimal'

type Account = WireChart['accounts'][number]
const date = '2026-01-01'
export const financePage = (workspace: string, tab: string, query = '') => `/finance?workspace=${workspace}&tab=${tab}${query}`

export async function saveAccount(page: Page, root: string, account: { code: string, name: string, category: string, purpose?: string }) {
  const chart = await readBusiness<WireChart>(page, root + '/chart')
  await changeBusiness(page, root + '/chart/accounts', { expectedRevision: chart.revision, expectedVersion: null, account: { purpose: 'posting', ...account } })
  return (await readBusiness<WireChart>(page, root + '/chart')).accounts.find(row => row.code === account.code)!
}

export async function verifyOpeningSubledgers(maker: Page, reviewer: Page, workspace: string, equity: Account) {
  const master = `/bff/api/masterdata/workspaces/${workspace}`
  const inventory = `/bff/api/inventory/workspaces/${workspace}/warehouses`
  const root = `/bff/api/finance/workspaces/${workspace}`
  const batches = root + '/ledger/opening-subledgers'
  const account = async (code: string, category: string, purpose = 'posting') =>
    (await saveAccount(maker, root, { code, name: 'D7 ' + code, category, purpose })).id
  const mapping = {
    inventoryAccountId: await account('D7-INV', 'asset', 'control'),
    accrualAccountId: await account('D7-GRNI', 'liability', 'control'),
    payableAccountId: await account('D7-AP', 'liability', 'control'),
    inputTaxAccountId: await account('D7-INPUT', 'asset'),
    varianceAccountId: await account('D7-VAR', 'expense'),
    donationIncomeAccountId: await account('D7-DON', 'income'),
    supplierRecoveryAccountId: await account('D7-RECOVERY', 'asset', 'control')
  }
  await changeBusiness(maker, root + '/trade/setup', { accounts: mapping })
  await changeBusiness(maker, root + '/receivables/setup', { accounts: {
    receivableAccountId: await account('D7-AR', 'asset', 'control'),
    advanceAccountId: await account('D7-ADV', 'liability', 'control'),
    revenueAccountId: await account('D7-REV', 'income'),
    outputTaxAccountId: await account('D7-TAX', 'liability', 'control'),
    costOfGoodsAccountId: await account('D7-COGS', 'expense')
  } })
  const bank = await changeBusiness(maker, root + '/trade/banks', {
    code: 'D7-BANK', name: 'D7 期初账户', kind: 'bank', accountId: await account('D7-BANK-CTL', 'asset', 'control')
  }, 201)
  const category = await changeBusiness(maker, master + '/definitions', { kind: 'category', code: 'D7-GOODS', name: 'D7 期初商品分类' }, 201)
  const unit = await changeBusiness(maker, master + '/definitions', { kind: 'unit', code: 'D7-PIECE', name: '件' }, 201)
  const item = await changeBusiness(maker, master + '/items', { code: 'D7-SKU', name: 'D7 期初库存', kind: 'product',
    tracksInventory: true, categoryId: category.id, unitId: unit.id }, 201)
  const warehouse = await changeBusiness(maker, inventory, { code: 'D7-WH', name: 'D7 期初仓' }, 201)
  const supplier = await changeBusiness(maker, master + '/partners', { code: 'D7-SUP', profile: { name: 'D7 期初供应商', roles: ['supplier'], contacts: [] } }, 201)
  const customer = await changeBusiness(maker, master + '/partners', { code: 'D7-CUS', profile: { name: 'D7 期初客户', roles: ['customer'], contacts: [] } }, 201)

  const csv = [
    'Kind,Reference,ResourceId,WarehouseId,Quantity,Amount,DueOn',
    `stock,D7-INV,${item.id},${warehouse.id},2,20,`,
    `receivable,D7-AR,${customer.id},,,65,2025-12-15`,
    `payable,D7-AP,${supplier.id},,,41,2025-12-28`,
    `bank,D7-BANK,${bank.id},,,100,`
  ].join('\n')
  const field = (id: string) => maker.getByTestId(id)
  const previewInput = async () => {
    await maker.goto(financePage(workspace, 'opening'))
    await maker.getByRole('tab', { name: '期初子账', exact: true }).click()
    await chooseOption(maker, 'opening-subledger-equity', equity.code + ' ' + equity.name)
    await field('opening-subledger-file').fill(csv)
    return uiChange<z.infer<typeof subledgerPreviewSchema>>(maker, batches + '/preview', () => field('opening-subledger-preview').click())
  }
  const old = await previewInput()
  await account('D7-PREVIEW-CHANGE', 'asset')
  const stale = await requestBusiness(maker, batches, { equityAccountId: equity.id, file: csv, fileHash: old.fileHash, chartRevision: old.chartRevision })
  expect(stale.status, stale.text).toBe(409)
  const preview = await previewInput()
  expect(preview.errors).toEqual([])
  expect(preview.rows).toHaveLength(4)
  await expect(field('opening-subledger-preview-panel')).toContainText('D7-INV')
  const batch = await uiChange<OpeningBatch>(maker, batches, () => field('opening-subledger-submit').click(), 201)
  await expect(field('opening-batch-approve')).toHaveCount(0)
  const path = batches + '/' + batch.id
  const self = await requestBusiness(maker, path + '/decision', { expectedVersion: batch.version, decision: 'approve' })
  expect(self.status).toBe(403)
  const another = await requestBusiness(maker, batches, { equityAccountId: equity.id, file: csv, fileHash: preview.fileHash, chartRevision: preview.chartRevision })
  expect(another.status).toBe(409)
  await reviewer.goto(financePage(workspace, 'opening'))
  await reviewer.getByTestId('opening-batch-open-' + batch.id).click()
  const approved = await uiChange<OpeningBatch>(reviewer, path + '/decision', () => reviewer.getByTestId('opening-batch-approve').click())
  expect(approved.state).toBe('applyingstock')
  await expect.poll(async () => (await readBusiness<OpeningBatch>(reviewer, path)).state).toBe('posted')
  await reviewer.getByRole('button', { name: '读取最新状态' }).click()
  await expect(reviewer.getByTestId('opening-batch-state')).toHaveText('已过账')
  const posted = await readBusiness<OpeningBatch>(reviewer, path)
  expect(posted.checks).toHaveLength(4)
  expect(posted.checks.every(row => row.matched)).toBe(true)
  expect(posted.postings.filter(row => row.journalId)).toHaveLength(4)
  await expect(reviewer.getByRole('link', { name: '查看凭证' })).toHaveCount(4)
  await reviewer.getByRole('button', { name: '查看资金流水' }).click()
  await expect(reviewer.getByTestId('opening-bank-movement')).toContainText('金额 100')
  const pools = await readBusiness<{ itemId: string, quantity: string, value: string }[]>(maker, inventory + '/' + warehouse.id + '/positions')
  expect(pools.find(row => row.itemId === item.id)).toMatchObject({ quantity: '2', value: '20' })
  return { bankId: bank.id, warehouseId: warehouse.id, categoryId: category.id, unitId: unit.id, supplierId: supplier.id }
}

export async function verifyYearClose(maker: Page, reviewer: Page, workspace: string, equity: Account, januaryVersion: string | number) {
  const root = `/bff/api/finance/workspaces/${workspace}/ledger`
  const year = Number(date.slice(0, 4))
  const years = root + '/fiscal-years'
  const finance = root.replace(/\/ledger$/, '')
  const partners = root + '/partnerships/' + year
  const equityAccount = (code: string, name: string) => saveAccount(maker, finance, { code, name, category: 'equity' })
  const accounts = [] as { capital: Account, drawings: Account }[]
  for (const label of ['甲', '乙']) {
    const ordinal = accounts.length + 1
    accounts.push({ capital: await equityAccount('D7-CAP-' + ordinal, label + '资本'), drawings: await equityAccount('D7-DRAW-' + ordinal, label + '提款') })
  }
  await maker.goto(financePage(workspace, 'closing'))
  await maker.getByTestId('closing-fiscal-year').fill(String(year))
  await maker.getByRole('button', { name: '读取合伙分摊' }).click()
  for (const [index, { capital, drawings }] of accounts.entries()) {
    await maker.getByRole('button', { name: '添加合伙人' }).click()
    const row = maker.getByTestId('partnership-row-' + index)
    await row.getByRole('textbox', { name: '编码' }).fill('P' + (index + 1))
    await row.getByRole('textbox', { name: '名称' }).fill('D7 合伙人 ' + (index + 1))
    await row.getByRole('textbox', { name: '比例（0 到 1）' }).fill(index === 0 ? '0.6' : '0.4')
    await chooseOption(maker, 'partnership-capital-' + index, capital.code + ' ' + capital.name)
    await chooseOption(maker, 'partnership-drawings-' + index, drawings.code + ' ' + drawings.name)
  }
  await uiChange(maker, partners, () => maker.getByRole('button', { name: '保存分摊' }).click(), 200, 'PUT')
  await reviewer.goto(financePage(workspace, 'closing'))
  await expect(reviewer.getByTestId('ledger-readiness')).toContainText('待计价')
  await uiChange(reviewer, finance + '/readiness/backfill', () => reviewer.getByTestId('ledger-backfill').click())
  await expect(reviewer.getByTestId('ledger-backfill-result')).toContainText('已补记')

  const openPreview = async () => {
    await maker.goto(financePage(workspace, 'closing'))
    await maker.getByTestId('closing-fiscal-year').fill(String(year))
    await chooseOption(maker, 'closing-fiscal-equity', equity.code + ' ' + equity.name)
    await maker.getByTestId('closing-fiscal-preview').click()
  }
  const plan = maker.getByTestId('closing-fiscal-preview-panel')
  await openPreview()
  await expect(plan).toContainText('未关账月份')
  await expect(maker.getByTestId('closing-fiscal-prepare')).toBeDisabled()
  for (let month = 1; month <= 12; month++) {
    const path = `${root}/periods/${year}-${String(month).padStart(2, '0')}-01`
    const move = (action: string, expectedVersion: string | number) =>
      changeBusiness(reviewer, path, { expectedVersion, action, reason: 'D7 验证年结' })
    const opened = month === 1 ? januaryVersion : (await move('open', 0)).version
    const pending = await move('begin-close', opened)
    await move('close', pending.version)
  }
  await openPreview()
  await expect(plan).toContainText('D7 合伙人')
  await expect(plan).not.toContainText('未关账月份')
  const prepared = await uiChange<z.infer<typeof fiscalYearSchema>>(maker, years, () => maker.getByTestId('closing-fiscal-prepare').click())
  expect(prepared.report.partnerAllocations).toHaveLength(2)
  expect(compareDecimal(sumDecimals(prepared.report.partnerAllocations!.map(row => row.capital.balance)), prepared.report.netProfit)).toBe(0)
  expect(compareDecimal(prepared.report.netProfit, '0')).toBe(1)
  await reviewer.goto(financePage(workspace, 'closing'))
  const record = reviewer.getByTestId('closing-fiscal-record-' + prepared.id)
  const path = years + '/' + prepared.id + '/decision'
  const closed = await uiChange<z.infer<typeof fiscalYearSchema>>(reviewer, path, () => record.getByRole('button', { name: '复核并结转' }).click())
  expect(closed.state).toBe('closed')
  expect(closed.closingJournals).toHaveLength(2)
  await expect(record.getByRole('link', { name: '查看结转凭证' })).toHaveCount(2)
  await record.getByRole('textbox', { name: '重开原因' }).fill('D7 核对重开冲销')
  const reopened = await uiChange<z.infer<typeof fiscalYearSchema>>(reviewer, path, () => record.getByRole('button', { name: '重开财年' }).click())
  expect(reopened.state).toBe('reopened')
  expect(reopened.reopeningJournals).toHaveLength(2)
  await expect(record.getByRole('link', { name: '查看重开冲销凭证' })).toHaveCount(2)
}

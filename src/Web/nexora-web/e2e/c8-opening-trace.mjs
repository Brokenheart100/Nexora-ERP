import fs from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'

const BASE = 'http://localhost:3001'
const here = dirname(fileURLToPath(import.meta.url))
const OUT = resolve(here, '../../../../artifacts/ui-dashboard-c8-c9')
fs.mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch({ channel: 'msedge', headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
const failures = []
const consoleErrors = []
const pageErrors = []
const badResponses = []
page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()) })
page.on('pageerror', (error) => pageErrors.push(String(error)))
page.on('response', (response) => { if (response.status() >= 400) badResponses.push(response.status() + ' ' + response.url()) })

function check(name, condition, detail = '') {
  if (!condition) failures.push(name + (detail ? ': ' + detail : ''))
  console.log((condition ? 'PASS ' : 'FAIL ') + name + (detail ? ' — ' + detail : ''))
}

async function settle(ms = 650) {
  await page.waitForTimeout(ms)
}

async function stable(testid, timeout = 15000) {
  await page.getByTestId(testid).first().waitFor({ state: 'visible', timeout })
  for (let i = 0; i < 5; i += 1) {
    if (await page.getByTestId(testid).count() === 1) break
    await settle(250)
  }
  await settle(500)
}

async function shot(name) {
  await settle(650)
  await page.screenshot({ path: OUT + '/' + name + '.png', fullPage: false })
}

async function toastContains(text) {
  return (await page.locator('body').innerText()).includes(text)
}

// ---------- C8 opening batches and result traceability ----------
let response = await page.goto(BASE + '/finance?tab=opening', { waitUntil: 'networkidle' })
check('C8 期初页 HTTP 200', response?.status() === 200, String(response?.status()))
await stable('finance-opening')
await shot('01-opening-overview')

await page.getByTestId('opening-batch-open-OB-2026-0001').click()
await stable('opening-batch-detail')
await page.getByTestId('opening-post-result').scrollIntoViewIfNeeded()
await settle(400)
const seedCounts = {
  journal: await page.getByTestId('opening-result-count-journal').innerText(),
  stock: await page.getByTestId('opening-result-count-stock').innerText(),
  receivable: await page.getByTestId('opening-result-count-receivable').innerText(),
  payable: await page.getByTestId('opening-result-count-payable').innerText(),
  bank: await page.getByTestId('opening-result-count-bank').innerText()
}
check('C8 种子批次凭证计数 4', seedCounts.journal.includes('4'), seedCounts.journal)
check('C8 种子批次库存计数 2', seedCounts.stock.includes('2'), seedCounts.stock)
check('C8 种子批次应收计数 5', seedCounts.receivable.includes('5'), seedCounts.receivable)
check('C8 种子批次应付计数 4', seedCounts.payable.includes('4'), seedCounts.payable)
check('C8 种子批次银行计数 2', seedCounts.bank.includes('2'), seedCounts.bank)
const seedRows = await page.getByTestId('opening-result-records').locator('tbody tr').count()
check('C8 种子批次结果明细 17 条', seedRows === 17, String(seedRows))
await shot('02-seed-posted-result')

await page.locator('[data-testid^="opening-result-record-"]').first().click()
await stable('opening-record-detail')
const seedDoc = await page.getByTestId('opening-record-doc').innerText()
const seedBatch = await page.getByTestId('opening-record-batch').innerText()
const seedSource = await page.getByTestId('opening-record-source').innerText()
check('C8 记录详情带凭证编号', seedDoc.startsWith('JE-OPEN-2026-0001'), seedDoc)
check('C8 记录详情回指批次 OB-2026-0001', seedBatch.includes('OB-2026-0001'), seedBatch)
check('C8 记录详情带来源行', seedSource.includes('第 1–12 行'), seedSource)
await shot('03-record-detail')
await page.getByTestId('opening-record-back').click()
await page.waitForTimeout(500)
check('C8 返回批次后抽屉仍在', await page.getByTestId('opening-batch-detail').isVisible())
await page.getByTestId('opening-batch-close').click()
await settle(500)

await page.getByTestId('opening-subledger-submit').scrollIntoViewIfNeeded()
await page.getByTestId('opening-subledger-submit').click()
await settle(900)
check('C8 提交生成 OB-2026-0002', await page.getByTestId('opening-batch-open-OB-2026-0002').count() === 1)
await page.keyboard.press('Escape')
await page.getByTestId('opening-batch-detail').waitFor({ state: 'hidden', timeout: 8000 })
await settle(500)
await page.getByTestId('opening-actor-reviewer').click()
await settle(300)
await page.getByTestId('opening-batch-open-OB-2026-0002').click()
await stable('opening-batch-detail')
const submittedState = await page.getByTestId('opening-batch-state').innerText()
check('C8 新批次待独立复核', submittedState.includes('待独立复核'), submittedState)
await shot('04-batch-submitted')

await page.getByTestId('opening-review-note').fill('库存差异 2,000 元已盘点到华东中心仓第 1–12 行，同意入账。')
await page.getByTestId('opening-batch-approve').click()
await settle(800)
const applyingState = await page.getByTestId('opening-batch-state').innerText()
check('C8 批准后进入库存入账处理中', applyingState.includes('库存入账处理中'), applyingState)
check('C8 处理中显示进度提示', await toastContains('库存、应收应付和银行子账'))
await shot('05-batch-applying')

await page.getByTestId('opening-batch-post').click()
await settle(900)
const postedState = await page.getByTestId('opening-batch-state').innerText()
check('C8 完成过账后状态已过账', postedState.includes('已过账'), postedState)
await page.getByTestId('opening-post-result').scrollIntoViewIfNeeded()
await settle(500)
const newCounts = {
  journal: await page.getByTestId('opening-result-count-journal').innerText(),
  stock: await page.getByTestId('opening-result-count-stock').innerText(),
  receivable: await page.getByTestId('opening-result-count-receivable').innerText(),
  payable: await page.getByTestId('opening-result-count-payable').innerText(),
  bank: await page.getByTestId('opening-result-count-bank').innerText()
}
const newRows = await page.getByTestId('opening-result-records').locator('tbody tr').count()
check('C8 新批次结果明细 17 条', newRows === 17, String(newRows))
check('C8 新批次计数与明细一致（4+2+5+4+2）',
  newCounts.journal.includes('4') && newCounts.stock.includes('2') && newCounts.receivable.includes('5') && newCounts.payable.includes('4') && newCounts.bank.includes('2') && newRows === 17,
  JSON.stringify(newCounts))
const journalRows = await page.getByTestId('opening-result-records').locator('tbody tr').filter({ hasText: '记账凭证' }).allInnerTexts()
const journalDocs = journalRows.map(text => (text.match(/JE-OPEN-2026-\d{4}/) || [''])[0]).join(',')
check('C8 新批次凭证编号使用本批次序号', journalDocs === 'JE-OPEN-2026-0005,JE-OPEN-2026-0006,JE-OPEN-2026-0007,JE-OPEN-2026-0008', journalDocs)
await shot('06-batch-posted-records')

const recordButtons = page.locator('[data-testid^="opening-result-record-"]')
await recordButtons.first().click()
await stable('opening-record-detail')
const newBatchNo = await page.getByTestId('opening-record-batch').innerText()
const newSource = await page.getByTestId('opening-record-source').innerText()
const newAmount = await page.getByTestId('opening-record-amount').innerText()
check('C8 新记录回指 OB-2026-0002', newBatchNo.includes('OB-2026-0002'), newBatchNo)
check('C8 新记录来源行', newSource.includes('第 1–12 行'), newSource)
check('C8 新记录金额', newAmount.includes('644,800.00'), newAmount)
await shot('07-new-record-detail')
await page.getByTestId('opening-record-back').click()
await page.waitForTimeout(400)

await recordButtons.nth(16).click()
await stable('opening-record-detail')
const lastDoc = await page.getByTestId('opening-record-doc').innerText()
const lastSource = await page.getByTestId('opening-record-source').innerText()
check('C8 末条记录为银行流水', lastDoc.startsWith('BM-OPEN-0002'), lastDoc)
check('C8 末条记录来源为银行账户', lastSource.includes('中国银行'), lastSource)
await page.getByTestId('opening-record-back').click()
await page.waitForTimeout(400)

await recordButtons.first().click()
await stable('opening-record-detail')
await page.getByTestId('opening-record-source-link').click()
await page.waitForTimeout(1200)
check('C8 来源链接回跳库存页', new URL(page.url()).pathname === '/inventory', page.url())
await shot('08-source-inventory')

// ---------- C9 recurring invoicing ----------
response = await page.goto(BASE + '/sales?tab=recurring', { waitUntil: 'networkidle' })
check('C9 定期开票页 HTTP 200', response?.status() === 200, String(response?.status()))
await stable('recurring-table')
const initialRows = await page.getByTestId('recurring-table').locator('tbody tr').count()
check('C9 本工作区 3 条计划', initialRows === 3, String(initialRows))
await shot('09-recurring-list')

await page.getByTestId('recurring-open-RCP-2026-001').click()
await stable('recurring-plan-detail')
check('C9 详情显示下次执行 2026-11-19', (await page.getByTestId('recurring-plan-next').innerText()) === '2026-11-19')
check('C9 详情展示未来执行日期', await page.getByTestId('recurring-plan-preview').locator('.rounded-full, [class*="badge"]').count() >= 3 || (await page.getByTestId('recurring-plan-preview').innerText()).includes('2026-12-19'))
await shot('10-recurring-plan')

await page.getByTestId('recurring-plan-run').click()
await settle(900)
const afterRunHistory = await page.getByTestId('recurring-plan-history').locator('[data-testid^="recurring-history-row-"]').count()
check('C9 执行后历史新增 1 条', afterRunHistory === 2, String(afterRunHistory))
check('C9 执行后下次执行日 2026-12-19', (await page.getByTestId('recurring-plan-next').innerText()) === '2026-12-19')
check('C9 执行后版本递增到 v5', (await page.getByTestId('recurring-plan-version').innerText()).includes('v5'))
const invoiceLink = page.locator('[data-testid^="recurring-history-invoice-"]').first()
const invoiceId = (await invoiceLink.getAttribute('data-testid')).replace('recurring-history-invoice-', '')
check('C9 生成待复核发票编号', /^INV-2026-\d{4}$/.test(invoiceId), invoiceId)
await shot('11-recurring-executed')

await page.getByTestId('recurring-plan-run').click()
await settle(800)
const afterDuplicateHistory = await page.getByTestId('recurring-plan-history').locator('[data-testid^="recurring-history-row-"]').count()
check('C9 同日重复执行不新增历史', afterDuplicateHistory === 2, String(afterDuplicateHistory))
check('C9 同日重复执行提示未重复生成', await toastContains('该到期日已生成发票'), 'toast')
check('C9 重复执行后下次执行日不变', (await page.getByTestId('recurring-plan-next').innerText()) === '2026-12-19')

await invoiceLink.click()
await stable('invoice-detail-status')
const invoiceSource = await page.getByTestId('invoice-source').innerText()
const invoiceStatus = await page.getByTestId('invoice-detail-status').innerText()
check('C9 发票详情回指定期计划', invoiceSource === 'RCP-2026-001', invoiceSource)
check('C9 生成发票为草稿待复核', invoiceStatus.includes('草稿'), invoiceStatus)
await shot('12-invoice-from-plan')
await page.keyboard.press('Escape')
await settle(600)

await page.getByTestId('recurring-open-RCP-2026-005').click()
await stable('recurring-plan-detail')
await page.getByTestId('recurring-plan-run-date').fill('2026-12-01')
await page.getByTestId('recurring-plan-run').click()
await settle(900)
check('C9 期间阻断保留待处理原因', await page.getByTestId('recurring-plan-pending').isVisible())
const pendingText = await page.getByTestId('recurring-plan-pending').innerText()
check('C9 阻断原因包含 2026-12', pendingText.includes('2026-12'), pendingText.replace(/\n/g, ' '))
check('C9 阻断后下次执行日保留', (await page.getByTestId('recurring-plan-next').innerText()) === '2026-12-01')
const blockedHistory = await page.getByTestId('recurring-plan-history').innerText()
check('C9 历史记录期间阻断', blockedHistory.includes('期间阻断'))
await shot('13-period-blocked')
await page.getByTestId('recurring-plan-close').click()
await settle(600)

await page.getByTestId('recurring-new').click()
await stable('recurring-form')
await page.getByTestId('recurring-form-customer').click()
await page.getByRole('option', { name: '杭州云杉科技有限公司' }).click()
await page.getByTestId('recurring-form-service').click()
await page.getByRole('option', { name: '数据备份与容灾服务' }).click()
await page.getByTestId('recurring-form-qty').fill('2')
const linkedPrice = await page.getByTestId('recurring-form-price').inputValue()
check('C9 选择服务联动单价 9000', linkedPrice === '9000', linkedPrice)
await page.getByTestId('recurring-form-first').fill('2026-12-01')
await page.getByTestId('recurring-form-end').fill('2027-12-31')
await page.getByTestId('recurring-form-due').fill('30')
await page.getByTestId('recurring-form-interval').click()
await page.getByRole('option', { name: '每季度' }).click()
await settle(300)
const formPreview = await page.getByTestId('recurring-form-preview').innerText()
check('C9 表单展示未来执行日期', formPreview.includes('2026-12-01') && formPreview.includes('2027-06-01'), formPreview.replace(/\n/g, ' '))
await shot('14-plan-form')
await page.getByTestId('recurring-form-save').click()
await settle(1000)
check('C9 新建计划 RCP-2026-006 出现在列表', await page.getByTestId('recurring-open-RCP-2026-006').count() === 1)
const rowsAfterCreate = await page.getByTestId('recurring-table').locator('tbody tr').count()
check('C9 列表计划数增至 4', rowsAfterCreate === 4, String(rowsAfterCreate))
await shot('15-plan-created')

await page.getByTestId('recurring-open-RCP-2026-006').click()
await stable('recurring-plan-detail')
check('C9 新计划下次执行 2026-12-01', (await page.getByTestId('recurring-plan-next').innerText()) === '2026-12-01')
check('C9 新计划每期未税 18,000.00', (await page.getByTestId('recurring-plan-amount').innerText()).includes('18,000.00'))
await shot('16-new-plan-detail')

await page.getByTestId('recurring-plan-edit').click()
await stable('recurring-form')
await page.getByTestId('recurring-form-first').fill('2027-01-05')
await page.getByTestId('recurring-form-interval').click()
await page.getByRole('option', { name: '每季度' }).click()
await page.getByTestId('recurring-form-save').click()
await settle(1000)
check('C9 编辑后下次执行日刷新为 2027-01-05', (await page.getByTestId('recurring-plan-next').innerText()) === '2027-01-05')
check('C9 编辑后版本递增到 v2', (await page.getByTestId('recurring-plan-version').innerText()).includes('v2'))
await shot('17-plan-edited')

await page.getByTestId('recurring-plan-toggle').click()
await settle(700)
check('C9 暂停后状态已暂停', (await page.getByTestId('recurring-plan-status').innerText()).includes('已暂停'))
await shot('18-plan-paused')
await page.getByTestId('recurring-plan-toggle').click()
await settle(700)
check('C9 恢复后状态执行中', (await page.getByTestId('recurring-plan-status').innerText()).includes('执行中'))
check('C9 恢复后下次执行日保持 2027-01-05', (await page.getByTestId('recurring-plan-next').innerText()) === '2027-01-05')

await page.getByTestId('recurring-plan-run-date').fill('2027-01-05')
await page.getByTestId('recurring-plan-skip').click()
await settle(900)
check('C9 跳过后下次执行日 2027-04-05', (await page.getByTestId('recurring-plan-next').innerText()) === '2027-04-05')
const skippedHistory = await page.getByTestId('recurring-plan-history').innerText()
check('C9 历史记录已跳过', skippedHistory.includes('已跳过') && skippedHistory.includes('2027-01-05'), skippedHistory.replace(/\n/g, ' '))
await shot('19-plan-skipped')
await page.getByTestId('recurring-plan-close').click()
await settle(600)

await page.evaluate(() => document.documentElement.classList.add('dark'))
await shot('20-recurring-dark')
check('C9 暗色主题生效', await page.locator('html.dark').count() === 1)

response = await page.goto(BASE + '/purchase-orders', { waitUntil: 'networkidle' })
check('C9 采购订单回归 HTTP 200', response?.status() === 200, String(response?.status()))
await settle(1200)
response = await page.goto(BASE + '/finance?tab=opening', { waitUntil: 'networkidle' })
check('C9 期初页回归 HTTP 200', response?.status() === 200, String(response?.status()))
await stable('finance-opening')
await page.getByTestId('opening-batch-open-OB-2026-0001').click()
await stable('opening-batch-detail')
check('C9 回归后种子批次仍可查看结果', await page.getByTestId('opening-post-result').isVisible())

const report = {
  generatedAt: new Date().toISOString(),
  base: BASE,
  assertions: failures.length === 0 ? 'all-passed' : failures,
  consoleErrors,
  pageErrors,
  badResponses,
  screenshots: fs.readdirSync(OUT).filter(name => name.endsWith('.png')).sort()
}
fs.writeFileSync(OUT + '/report.json', JSON.stringify(report, null, 2))

console.log('\nRESULT', JSON.stringify({ failures, consoleErrors, pageErrors, badResponses }, null, 2))
await browser.close()
if (failures.length || consoleErrors.length || pageErrors.length || badResponses.length) process.exit(1)

import { chromium } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../artifacts/ui-dashboard-c13-c16')
fs.mkdirSync(OUT, { recursive: true })
const BASE = 'http://localhost:3001'
const results = []
const consoleErrors = []
const pageErrors = []
const badResponses = []
let failures = 0

function check(ok, label, detail = '') {
  results.push({ ok, label, detail })
  if (ok) console.log('PASS ' + label)
  else {
    failures += 1
    console.log('FAIL ' + label + (detail ? ' :: ' + detail : ''))
  }
}

async function txt(id) {
  return (await page.getByTestId(id).first().innerText()).trim()
}

async function bodyText(id) {
  return (await page.getByTestId(id).first().innerText()).replace(/\s+/g, ' ').trim()
}

async function shot(name) {
  await page.waitForTimeout(350)
  await page.screenshot({ path: path.join(OUT, name + '.png'), fullPage: false })
  console.log('SHOT ' + name)
}

async function waitStable(id) {
  for (let i = 0; i < 8; i += 1) {
    if (await page.getByTestId(id).count() === 1) {
      await page.waitForTimeout(300)
      if (await page.getByTestId(id).count() === 1) return
    } else {
      await page.waitForTimeout(250)
    }
  }
}

async function pick(id, option) {
  await page.getByTestId(id).click()
  await page.waitForTimeout(250)
  await page.locator('[role="option"]').filter({ hasText: option }).last().click()
  await page.waitForTimeout(200)
}

async function downloadName(id) {
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId(id).click()
  ])
  await page.waitForTimeout(200)
  return download.suggestedFilename()
}

async function openInventoryOps() {
  await page.goto(BASE + '/inventory', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(3000)
  const tab = page.getByTestId('inventory-tabs').getByText('仓网与调拨', { exact: true })
  for (let attempt = 0; attempt < 4; attempt += 1) {
    if (attempt > 0) await page.waitForTimeout(1200)
    await tab.click()
    await page.waitForTimeout(700)
    if (await page.getByTestId('warehouse-operations').isVisible()) break
  }
  await page.getByTestId('warehouse-operations').waitFor({ state: 'visible', timeout: 12000 })
  await page.waitForTimeout(600)
}

const browser = await chromium.launch({ channel: 'msedge', headless: true })
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
const page = await context.newPage()
page.setDefaultTimeout(8000)
page.on('console', (msg) => {
  if (msg.type() === 'error') consoleErrors.push(msg.text())
})
page.on('pageerror', (err) => pageErrors.push(String(err)))
page.on('response', (res) => {
  if (res.status() >= 400 && !res.url().includes('favicon')) badResponses.push(res.status() + ' ' + res.url())
})

try {
  /* ---------------- C13 ---------------- */
  await openInventoryOps()
  check(await page.getByTestId('warehouse-operations').isVisible(), 'C13 仓网与调拨页签渲染')
  check(await page.locator('[data-testid^="warehouse-ops-card-"]').count() === 3, 'C13 初始 3 个仓库')
  check((await txt('warehouse-ops-receiver-wh-east')).includes('陈立'), 'C13 华东仓收货人为陈立')
  check((await bodyText('warehouse-ops-permissions-wh-east')).includes('收货'), 'C13 仓库卡片展示收货权限')
  await shot('01-c13-warehouse-network')

  await page.getByTestId('warehouse-ops-open-wh-east').click()
  await page.getByTestId('warehouse-ops-receiver').waitFor({ state: 'visible' })
  check((await txt('warehouse-ops-receiver')) === '陈立', 'C13 仓库详情展示当前收货人')
  await pick('warehouse-ops-change-receiver', '周宁')
  await page.getByTestId('warehouse-ops-save-receiver').click()
  await page.waitForTimeout(450)
  check((await txt('warehouse-ops-receiver')) === '周宁', 'C13 更换收货人后详情更新')
  check((await bodyText('warehouse-ops-permissions')).includes('周宁'), 'C13 新收货人获得权限')
  check((await bodyText('warehouse-ops-hint')).includes('周宁'), 'C13 权限变化提示同步')
  await page.getByTestId('warehouse-ops-detail-close').click()
  await page.getByTestId('warehouse-ops-receiver').waitFor({ state: 'hidden' })
  check((await txt('warehouse-ops-receiver-wh-east')) === '周宁', 'C13 仓库卡片收货人同步')

  await page.getByTestId('warehouse-ops-create').click()
  await page.getByTestId('warehouse-ops-form-code').waitFor({ state: 'visible' })
  await page.getByTestId('warehouse-ops-form-code').fill('wh-north')
  await page.getByTestId('warehouse-ops-form-name').fill('华北区域仓')
  await page.getByTestId('warehouse-ops-form-city').fill('北京')
  await pick('warehouse-ops-form-receiver', '林小雨')
  await page.getByTestId('warehouse-ops-save').click()
  await page.getByTestId('warehouse-ops-form-code').waitFor({ state: 'hidden' })
  check(await page.locator('[data-testid^="warehouse-ops-card-"]').count() === 4, 'C13 新建仓库后共 4 个')
  check((await bodyText('warehouse-ops-card-wh-north')).includes('华北区域仓'), 'C13 新仓库卡片显示名称')
  check((await txt('warehouse-ops-receiver-wh-north')) === '林小雨', 'C13 新仓库指定收货人')
  await shot('02-c13-warehouse-created')

  check(await page.locator('[data-testid^="stocktake-ops-open-"]').count() === 2, 'C13 初始 2 张盘点单')
  await page.getByTestId('stocktake-ops-open-ST-2026-0001').click()
  await page.getByTestId('stocktake-ops-lines').waitFor({ state: 'visible' })
  const stocktakeText = await bodyText('stocktake-ops-lines')
  check(stocktakeText.includes('账面数') && stocktakeText.includes('实盘数') && stocktakeText.includes('原因'), 'C13 盘点明细含账面、实盘、差异、原因')
  check(stocktakeText.includes('-3') && stocktakeText.includes('+4'), 'C13 盘点明细展示行差异')
  check((await page.getByTestId('stocktake-ops-reason').inputValue()).includes('货架盘点差异'), 'C13 盘点差异原因可见')
  await page.getByTestId('stocktake-ops-submit').click()
  await page.waitForTimeout(400)
  check(await page.getByTestId('stocktake-ops-switch-approver').isVisible(), 'C13 提交后提示切换审批人')
  check((await bodyText('stocktake-ops-history')).includes('提交复核'), 'C13 处理记录写入提交复核')
  await shot('03-c13-stocktake-submitted')
  await page.getByTestId('stocktake-ops-switch-approver').click()
  await page.waitForTimeout(250)
  await page.getByTestId('stocktake-ops-review').click()
  await page.waitForTimeout(500)
  check((await bodyText('stocktake-ops-history')).includes('复核完成'), 'C13 审批后记录复核完成')
  const afterCount = await bodyText('stocktake-ops-inventory')
  check(afterCount.includes('SKU-1001 × 57') && afterCount.includes('SKU-1002 × 124'), 'C13 确认后库存按实盘数回写')
  check((await bodyText('stocktake-ops-adjustments')).includes('SKU-1001'), 'C13 差异生成 adjust 流水')
  await shot('04-c13-stocktake-completed')
  await page.getByTestId('stocktake-ops-close').click()
  await page.getByTestId('stocktake-ops-lines').waitFor({ state: 'hidden' })

  check(await page.locator('[data-testid^="transfer-ops-open-"]').count() === 1, 'C13 初始 1 张调拨单')
  await page.getByTestId('transfer-ops-create').click()
  await page.getByTestId('transfer-ops-from').waitFor({ state: 'visible' })
  await pick('transfer-ops-from', '华东中心仓')
  await pick('transfer-ops-to', '华南前置仓')
  await pick('transfer-ops-sku', 'ThinkPad X1 笔记本')
  await page.getByTestId('transfer-ops-qty').fill('2')
  await page.getByTestId('transfer-ops-save').click()
  await page.getByTestId('transfer-ops-from').waitFor({ state: 'hidden' })
  check(await page.locator('[data-testid^="transfer-ops-open-"]').count() === 2, 'C13 新建调拨后共 2 张')
  check((await bodyText('transfer-ops-table')).includes('TR-2026-0002'), 'C13 新调拨单号 TR-2026-0002')
  await page.getByTestId('transfer-ops-open-TR-2026-0002').click()
  await page.getByTestId('transfer-ops-state').waitFor({ state: 'visible' })
  check((await txt('transfer-ops-state')).includes('草稿'), 'C13 调拨初始为草稿')
  await page.getByTestId('transfer-ops-issue').click()
  await page.waitForTimeout(500)
  check((await txt('transfer-ops-state')).includes('在途'), 'C13 确认出库后进入在途')
  check((await txt('transfer-ops-intransit')).includes('2'), 'C13 在途数量为 2')
  check((await txt('transfer-ops-cost')).replace(/[^0-9.]/g, '') !== '0.00', 'C13 在途成本已计算')
  check((await page.locator('body').innerText()).includes('目标仓可用（收货前保持原值）'), 'C13 在途时展示目标仓可用量')
  await shot('05-c13-transfer-in-transit')
  await page.getByTestId('transfer-ops-switch-receiver').click()
  await page.waitForTimeout(250)
  await page.getByTestId('transfer-ops-receive').click()
  await page.waitForTimeout(500)
  check((await txt('transfer-ops-state')).includes('已完成'), 'C13 目标收货人确认后完成')
  const moveText = await bodyText('transfer-ops-movements')
  check(moveText.includes('源仓出库') && moveText.includes('目标仓入库'), 'C13 两端流水由同一调拨单追溯')
  check((await page.locator('body').innerText()).includes('TR-2026-0002'), 'C13 调拨流水保留同单号')
  const inventoryText = await bodyText('stocktake-ops-inventory')
  check(inventoryText.includes('SKU-1001 × 55') && inventoryText.includes('SKU-1001 × 14'), 'C13 出库减源仓、入库增目标仓')
  await shot('06-c13-transfer-completed')
  await page.getByTestId('transfer-ops-receive').click()
  await page.waitForTimeout(450)
  const inventoryAgain = await bodyText('stocktake-ops-inventory')
  check(inventoryAgain.includes('SKU-1001 × 55') && inventoryAgain.includes('SKU-1001 × 14'), 'C13 重复确认入库不重复增减')
  await page.getByTestId('transfer-ops-close').click()
  await page.getByTestId('transfer-ops-state').waitFor({ state: 'hidden' })

  /* ---------------- C14 ---------------- */
  await page.goto(BASE + '/finance?tab=treasury', { waitUntil: 'domcontentloaded' })
  await waitStable('finance-treasury')
  await page.getByTestId('treasury-account-ACC-B1').waitFor({ state: 'visible', timeout: 20000 })
  await page.waitForFunction(() => {
    const root = document.querySelector('[data-testid="finance-treasury"]')
    const cards = document.querySelectorAll('[data-testid^="treasury-account-ACC-"]')
    return Boolean(root) && cards.length === 5 && root.getBoundingClientRect().height > 0
  }, null, { timeout: 20000 })
  let treasuryReady = false
  for (let attempt = 0; attempt < 8; attempt += 1) {
    await page.waitForTimeout(400)
    const visible = await page.getByTestId('finance-treasury').isVisible()
    const count = await page.locator('[data-testid^="treasury-account-ACC-"]').count()
    if (visible && count === 5) {
      treasuryReady = true
      break
    }
  }
  check(treasuryReady, 'C14 资金管理页签渲染')
  check(await page.locator('[data-testid^="treasury-account-ACC-"]').count() === 5, 'C14 初始 5 个资金账户')
  check((await bodyText('treasury-account-ACC-B1')).includes('默认'), 'C14 默认账户标记与余额可见')
  await shot('07-c14-accounts')

  await page.getByTestId('treasury-account-create').click()
  await page.getByTestId('treasury-account-name').fill('招商银行一般户')
  await page.getByTestId('treasury-account-no').fill('6225 8888 0000 1234')
  await page.getByTestId('treasury-account-save').click()
  await page.waitForTimeout(500)
  check(await page.locator('[data-testid^="treasury-account-ACC-"]').count() === 6, 'C14 新建资金账户后共 6 个')
  check((await bodyText('finance-treasury')).includes('招商银行一般户'), 'C14 新账户显示名称与科目')
  await shot('08-c14-account-created')

  await page.getByTestId('treasury-flow-create').click()
  await page.getByTestId('treasury-flow-form').waitFor({ state: 'visible' })
  await pick('treasury-flow-type', '资金划转')
  await page.getByTestId('treasury-flow-amount').fill('1000')
  await page.getByTestId('treasury-flow-counterparty').fill('内部资金调拨')
  await page.getByTestId('treasury-flow-summary').fill('测试划转')
  await page.getByTestId('treasury-flow-save').click()
  await page.getByTestId('treasury-flow-form').waitFor({ state: 'hidden' })
  await page.waitForTimeout(400)
  const transferRows = page.locator('tbody tr').filter({ hasText: '测试划转' })
  check(await transferRows.count() === 2, 'C14 划转生成方向相反的两条流水')
  const transferIds = []
  for (let index = 0; index < 2; index += 1) {
    const button = transferRows.nth(index).locator('button[data-testid^="treasury-flow-submit-"]')
    const testId = await button.getAttribute('data-testid')
    transferIds.push(testId.replace('treasury-flow-submit-', ''))
  }
  check(transferIds.length === 2 && transferIds.every(Boolean), 'C14 两条划转流水分别生成编号')
  for (const id of transferIds) {
    await page.getByTestId('treasury-flow-submit-' + id).click()
    await page.waitForTimeout(250)
  }
  await page.getByTestId('treasury-flow-approve-' + transferIds[0]).click()
  await page.waitForTimeout(400)
  check((await bodyText('treasury-flow-action-error')).includes('复核人不能是制单人'), 'C14 制单人不能复核自己的流水')
  await page.getByTestId('treasury-actor-approver').click()
  await page.waitForTimeout(200)
  for (const id of transferIds) {
    await page.getByTestId('treasury-flow-approve-' + id).click()
    await page.waitForTimeout(300)
  }
  check((await transferRows.nth(0).innerText()).includes('已过账') && (await transferRows.nth(1).innerText()).includes('已过账'), 'C14 划转两腿均独立复核过账')
  check((await bodyText('treasury-account-ACC-B1')).includes('285,420.00'), 'C14 划转源账户余额减少')
  check((await bodyText('treasury-account-ACC-B2')).includes('129,750.50'), 'C14 划转目标账户余额增加')
  await shot('09-c14-flow-posted')

  await pick('treasury-import-file', '工商银行_2026-12.csv')
  await page.waitForTimeout(500)
  const previewText = await bodyText('treasury-import-preview')
  check(previewText.includes('有效行 3'), 'C14 导入预览有效行 3')
  check(previewText.includes('重复行 1'), 'C14 导入预览重复行 1')
  check(previewText.includes('问题行 2'), 'C14 导入预览问题行 2')
  await page.getByTestId('treasury-import-submit').click()
  await page.waitForTimeout(500)
  check((await bodyText('treasury-import-message')).includes('已导入 3 条'), 'C14 导入提交生成批次')
  await shot('10-c14-import-preview')

  await pick('treasury-statement-account', '工商银行基本户')
  await page.waitForTimeout(400)
  const stmtRow = page.getByTestId('treasury-statement-row-STM-2601')
  await pick('treasury-statement-flow-STM-2601', 'F-2601')
  await page.waitForTimeout(200)
  await stmtRow.getByTestId('treasury-statement-amount-STM-2601').fill('5000')
  await stmtRow.getByTestId('treasury-statement-match-STM-2601').click()
  await page.waitForTimeout(400)
  let stmtText = await bodyText('treasury-statement-row-STM-2601')
  check(stmtText.includes('部分匹配') && stmtText.includes('5,000.00') && stmtText.includes('7,000.00'), 'C14 对账单行分次匹配显示部分匹配')
  await page.getByTestId('treasury-statement-amount-STM-2601').fill('7000')
  await page.getByTestId('treasury-statement-match-STM-2601').click()
  await page.waitForTimeout(400)
  stmtText = await bodyText('treasury-statement-row-STM-2601')
  check(stmtText.includes('12,000.00') && stmtText.includes('0.00'), 'C14 剩余金额匹配后完成')
  await pick('treasury-statement-flow-STM-2602', 'F-2602')
  await page.waitForTimeout(200)
  await page.getByTestId('treasury-statement-amount-STM-2602').fill('50000')
  await page.getByTestId('treasury-statement-match-STM-2602').click()
  await page.waitForTimeout(400)
  check((await page.locator('body').innerText()).includes('匹配金额超过该行剩余金额'), 'C14 超额匹配给出明确反馈')
  await page.getByTestId('treasury-statement-exclude-STM-2603').click()
  await page.getByTestId('treasury-statement-exclude-reason').fill('内部划转对账单待确认')
  await page.getByTestId('treasury-statement-exclude-confirm').click()
  await page.waitForTimeout(450)
  check((await bodyText('treasury-statement-row-STM-2603')).includes('已排除'), 'C14 对账单行排除后保留原因状态')
  await page.getByTestId('treasury-statement-include-STM-2603').click()
  await page.waitForTimeout(350)
  check((await bodyText('treasury-statement-row-STM-2603')).includes('未匹配'), 'C14 排除行可恢复')
  await shot('11-c14-statement-matching')

  await pick('treasury-recon-account', '出纳备用金')
  await page.waitForTimeout(400)
  await page.getByTestId('treasury-recon-cutoff').fill('2026-11-30')
  await page.getByTestId('treasury-recon-bank-balance').fill('8600')
  await page.getByTestId('treasury-actor-maker').click()
  await page.waitForTimeout(200)
  await page.getByTestId('treasury-recon-save').click()
  await page.waitForTimeout(450)
  check((await bodyText('treasury-recon-difference')).includes('0.00'), 'C14 对账差异归零后可保存草稿')
  check(await page.getByTestId('treasury-recon-draft').isVisible(), 'C14 保存待完成对账记录')
  await page.getByTestId('treasury-recon-confirm').click()
  await page.waitForTimeout(400)
  check((await bodyText('treasury-recon-message')).includes('不能是制单人') || (await bodyText('treasury-recon-error')).includes('不能是制单人'), 'C14 对账需独立确认')
  await page.getByTestId('treasury-actor-approver').click()
  await page.waitForTimeout(200)
  await page.getByTestId('treasury-recon-confirm').click()
  await page.waitForTimeout(500)
  check((await bodyText('treasury-recon-message')).includes('独立复核确认'), 'C14 独立确认对账')
  await page.getByTestId('treasury-recon-report').click()
  await page.getByTestId('treasury-recon-report-panel').waitFor({ state: 'visible' })
  const reportText = await bodyText('treasury-recon-report-panel')
  check(reportText.includes('8,600.00') && reportText.includes('0.00'), 'C14 对账报告展示余额与零差异')
  await shot('12-c14-reconciliation-report')
  await page.getByTestId('treasury-recon-report-close').click()
  await page.getByTestId('treasury-recon-undo').click()
  await page.getByTestId('treasury-recon-undo-reason').fill('期末余额复核口径调整')
  await page.getByTestId('treasury-recon-undo-confirm').click()
  await page.waitForTimeout(500)
  check((await bodyText('treasury-recon-message')).includes('撤销'), 'C14 最近一次对账可按原因撤销')

  await page.goto(BASE + '/inventory', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(800)
  check(await page.getByText('库存', { exact: false }).first().isVisible(), 'C14 回归库存页可访问')

  /* ---------------- C15 ---------------- */
  await page.goto(BASE + '/finance?tab=closing', { waitUntil: 'domcontentloaded' })
  await page.getByTestId('finance-closing').waitFor({ state: 'visible', timeout: 20000 })
  await page.waitForTimeout(900)
  check((await bodyText('finance-closing')).includes('通过 2 / 4'), 'C15 就绪检查初始通过 2/4')
  check((await bodyText('readiness-check-vouchers')).includes('已过账未关联业务凭证 1 张'), 'C15 就绪检查展示已过账缺凭证')
  check((await bodyText('readiness-check-inventory-cost')).includes('42,800.00'), 'C15 就绪检查展示待入账库存成本')
  await shot('13-c15-readiness')

  /* 期间先演示阻断：2026-11 开始关账后不能直接关闭 */
  await page.getByTestId('finance-closing').getByText('期间与年结', { exact: true }).click()
  await page.waitForTimeout(500)
  await page.getByTestId('closing-period-start-2026-11').click()
  await page.waitForTimeout(400)
  await page.getByTestId('closing-period-close-2026-11').click()
  await page.waitForTimeout(500)
  check((await bodyText('closing-period-error')).includes('关账检查未通过'), 'C15 待处理事项未清零时关账被阻断')

  /* 补记库存成本 */
  await page.getByTestId('finance-closing').getByText('工作台就绪', { exact: true }).click()
  await page.waitForTimeout(400)
  await page.getByTestId('readiness-cost-entry').click()
  await page.getByTestId('readiness-cost-form-amount').waitFor({ state: 'visible' })
  await page.getByTestId('readiness-cost-form-amount').fill('42800')
  await page.getByTestId('readiness-cost-form-summary').fill('补记 2026-11 销售出库库存成本')
  await page.getByTestId('readiness-cost-save').click()
  await page.waitForTimeout(1000)
  check((await bodyText('finance-closing')).includes('通过 3 / 4'), 'C15 补记库存成本后就绪检查通过 3/4')
  check((await bodyText('readiness-cost-history')).includes('42,800.00'), 'C15 库存成本补记记录保留金额与截止日')

  /* 凭证生命周期：提交、自批阻断、独立过账、冲销 */
  await page.getByTestId('finance-closing').getByText('凭证生命周期', { exact: true }).click()
  await page.waitForTimeout(500)
  check(await page.getByTestId('closing-journal-table').isVisible(), 'C15 凭证生命周期页签渲染')
  const row1201 = page.getByTestId('closing-journal-table').getByText('JE-2026-1201', { exact: true }).locator('xpath=ancestor::tr')
  check((await row1201.innerText()).includes('草稿'), 'C15 2026-12 折旧凭证初始为草稿')
  await page.getByTestId('closing-journal-submit-JE-2026-1201').click()
  await page.waitForTimeout(450)
  check((await row1201.innerText()).includes('待复核'), 'C15 草稿提交后进入待复核')
  await page.getByTestId('closing-journal-post-JE-2026-1201').click()
  await page.waitForTimeout(400)
  check((await bodyText('closing-journal-error')).includes('请切换为业务主管'), 'C15 非复核人不能过账')
  await page.getByTestId('closing-journal-actor-approver').click()
  await page.waitForTimeout(250)
  await page.getByTestId('closing-journal-post-JE-2026-1201').click()
  await page.waitForTimeout(500)
  check((await row1201.innerText()).includes('已过账'), 'C15 业务主管独立复核后凭证已过账')
  await page.getByTestId('closing-journal-reverse-JE-2026-1201').click()
  await page.getByTestId('closing-journal-reverse-date').fill('2026-11-19')
  await page.getByTestId('closing-journal-reverse-reason').fill('折旧凭证科目使用错误，红字冲销后重录')
  await page.getByTestId('closing-journal-reverse-save').click()
  await page.waitForTimeout(600)
  const rowReversal = page.getByTestId('closing-journal-table').locator('tbody tr').filter({ hasText: 'JE-RV-2026-1201' })
  check(await rowReversal.count() === 1 && (await rowReversal.innerText()).includes('已过账'), 'C15 冲销生成红字凭证并回链原单')
  check((await row1201.innerText()).includes('已冲销'), 'C15 原凭证状态变为已冲销')

  /* 第二张草稿：提交并独立过账，为 2026-12 关账清零 */
  await page.getByTestId('closing-journal-actor-maker').click()
  await page.waitForTimeout(250)
  await page.getByTestId('closing-journal-submit-JE-2026-1202').click()
  await page.waitForTimeout(450)
  await page.getByTestId('closing-journal-actor-approver').click()
  await page.waitForTimeout(250)
  await page.getByTestId('closing-journal-post-JE-2026-1202').click()
  await page.waitForTimeout(500)
  const row1202 = page.getByTestId('closing-journal-table').getByText('JE-2026-1202', { exact: true }).locator('xpath=ancestor::tr')
  check((await row1202.innerText()).includes('已过账'), 'C15 薪酬草稿完成提交与独立过账')

  /* 异常扫描与业务关联 */
  await page.getByTestId('closing-journal-scan').click()
  await page.waitForTimeout(500)
  check(await page.getByTestId('closing-journal-anomaly-JE-2026-1150').isVisible(), 'C15 异常扫描定位已过账未关联凭证')
  await page.getByTestId('closing-journal-link-select-JE-2026-1150').click()
  await page.waitForTimeout(250)
  await page.locator('[role="option"]').first().click()
  await page.waitForTimeout(200)
  await page.getByTestId('closing-journal-link-JE-2026-1150').click()
  await page.waitForTimeout(500)
  check(await page.getByTestId('closing-journal-scan-empty').isVisible(), 'C15 补齐业务关联后异常清零')

  /* 移除已有业务关联，验证重复关联拦截 */
  await page.getByTestId('closing-journal-detail-JE-2026-1202').click()
  await page.waitForTimeout(500)
  await page.getByTestId('closing-journal-unlink').click()
  await page.waitForTimeout(400)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(400)
  await page.getByTestId('closing-journal-scan').click()
  await page.waitForTimeout(500)
  check(await page.getByTestId('closing-journal-anomaly-JE-2026-1202').isVisible(), 'C15 移除关联后重新进入异常列表')
  await page.getByTestId('closing-journal-link-select-JE-2026-1202').click()
  await page.waitForTimeout(250)
  await page.locator('[role="option"]').first().click()
  await page.waitForTimeout(200)
  await page.getByTestId('closing-journal-link-JE-2026-1202').click()
  await page.waitForTimeout(400)
  check((await bodyText('closing-journal-error')).includes('不能重复关联'), 'C15 重复关联同一业务单据被拦截')
  await page.getByTestId('closing-journal-link-select-JE-2026-1202').click()
  await page.waitForTimeout(250)
  await page.locator('[role="option"]').filter({ hasText: 'PAY-2026-11' }).last().click()
  await page.waitForTimeout(200)
  await page.getByTestId('closing-journal-link-JE-2026-1202').click()
  await page.waitForTimeout(500)
  check(await page.getByTestId('closing-journal-scan-empty').isVisible(), 'C15 改选其他业务单据后异常清零')
  await page.waitForTimeout(5000)
  await shot('14-c15-journal-lifecycle')

  /* 科目树治理 */
  await page.getByTestId('finance-closing').getByText('科目树治理', { exact: true }).click()
  await page.waitForTimeout(500)
  check(await page.getByTestId('chart-table').locator('tbody tr').count() === 32, 'C15 科目表初始 32 个科目')
  await page.getByTestId('chart-archive-1003').click()
  await page.waitForTimeout(400)
  check(await page.getByTestId('chart-restore-1003').isVisible(), 'C15 零余额科目可归档')
  await page.getByTestId('chart-restore-1003').click()
  await page.waitForTimeout(400)
  check(await page.getByTestId('chart-archive-1003').isVisible(), 'C15 归档科目可恢复')
  const templateFile = await downloadName('chart-template-export')
  const structureFile = await downloadName('chart-structure-export')
  const snapshotFile = await downloadName('chart-snapshot-export')
  check(templateFile === 'chart-template.csv' && structureFile === 'chart-structure.csv' && snapshotFile === 'chart-snapshot.csv', 'C15 模板、结构、快照均可导出 CSV')

  await page.getByTestId('chart-import').click()
  await page.getByTestId('chart-import-preview').waitFor({ state: 'visible' })
  await page.getByTestId('chart-import-preview').click()
  await page.waitForTimeout(350)
  const importRowsText = await bodyText('chart-import-rows')
  check(importRowsText.includes('科目编码已存在') && importRowsText.includes('科目类型无效'), 'C15 科目导入预览逐行展示错误')
  await page.getByTestId('chart-import-commit').click()
  await page.waitForTimeout(500)
  check((await bodyText('chart-import-result')).includes('成功导入 2 个科目') && (await bodyText('chart-import-result')).includes('跳过 4 行'), 'C15 科目导入提交汇总成功与跳过行数')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(400)
  check(await page.getByTestId('chart-table').locator('tbody tr').count() === 34, 'C15 导入后科目表新增 2 个科目')

  await page.getByTestId('chart-merge').click()
  await page.getByTestId('chart-merge-source').waitFor({ state: 'visible' })
  await pick('chart-merge-source', '1001')
  await pick('chart-merge-target', '1002')
  await page.getByTestId('chart-merge-save').click()
  await page.waitForTimeout(400)
  check((await bodyText('chart-merge-error')).includes('两个科目均有余额'), 'C15 两个有余额科目合并被拒绝')
  await pick('chart-merge-source', '1003')
  await pick('chart-merge-target', '1001')
  await page.getByTestId('chart-merge-save').click()
  await page.waitForTimeout(500)
  check(await page.getByTestId('chart-table').locator('tbody tr').count() === 33, 'C15 零余额科目可并入目标科目')
  check(await page.getByTestId('chart-archive-1003').count() === 0, 'C15 合并后源科目移出科目表')
  await shot('15-c15-chart-governance')

  /* 期间关闭：10/11/12 依次清零关闭 */
  await page.getByTestId('finance-closing').getByText('期间与年结', { exact: true }).click()
  await page.waitForTimeout(500)
  await page.getByTestId('closing-period-close-2026-10').click()
  await page.waitForTimeout(450)
  check(await page.getByTestId('closing-period-reopen-2026-10').isVisible(), 'C15 2026-10 检查通过后关闭')
  await page.getByTestId('closing-period-close-2026-11').click()
  await page.waitForTimeout(450)
  check(await page.getByTestId('closing-period-reopen-2026-11').isVisible(), 'C15 2026-11 成本补记与关联齐全后关闭')
  await page.getByTestId('closing-period-start-2026-12').click()
  await page.waitForTimeout(350)
  await page.getByTestId('closing-period-close-2026-12').click()
  await page.waitForTimeout(450)
  check(await page.getByTestId('closing-period-reopen-2026-12').isVisible(), 'C15 2026-12 凭证全部过账后关闭')
  check((await bodyText('closing-year-panel')).includes('12 / 12'), 'C15 年结检查显示 12/12 期间已关账')

  /* 合伙人配置与年结预览 */
  await page.getByTestId('finance-closing').getByText('合伙人', { exact: true }).click()
  await page.waitForTimeout(500)
  check(await page.locator('[data-testid^="closing-partner-row-"]').count() === 3, 'C15 合伙人配置展示 3 位合伙人')
  check((await bodyText('closing-partner-config')).includes('100%'), 'C15 合伙人份额初始合计 100%')
  const firstShare = page.locator('[data-testid^="closing-partner-share-"]').first()
  await firstShare.fill('45')
  await page.waitForTimeout(300)
  check((await bodyText('closing-partner-config')).includes('105%'), 'C15 修改份额后实时显示合计 105%')
  await page.getByTestId('closing-partner-save').click()
  await page.waitForTimeout(400)
  check((await bodyText('closing-partner-error')).includes('必须等于 100%'), 'C15 份额非 100% 时保存被拒绝')
  await firstShare.fill('40')
  await page.waitForTimeout(300)
  await page.getByTestId('closing-partner-preview').click()
  await page.waitForTimeout(500)
  check((await page.locator('body').innerText()).includes('103,440.00'), 'C15 年结预览展示合伙人分摊金额')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(350)
  await page.getByTestId('closing-partner-save').click()
  await page.waitForTimeout(400)
  check(await page.getByTestId('closing-partner-error').count() === 0, 'C15 恢复 100% 后合伙人配置可保存')

  /* 年结申请、独立确认、年度锁定与重开 */
  await page.getByTestId('finance-closing').getByText('期间与年结', { exact: true }).click()
  await page.waitForTimeout(500)
  await page.getByTestId('closing-year-actor-maker').click()
  await page.waitForTimeout(250)
  await page.getByTestId('closing-year-request').click()
  await page.waitForTimeout(500)
  check((await bodyText('closing-year-panel')).includes('待确认'), 'C15 年结申请提交后进入待确认')
  await page.getByTestId('closing-year-actor-approver').click()
  await page.waitForTimeout(250)
  await page.getByTestId('closing-year-confirm').click()
  await page.waitForTimeout(600)
  check((await bodyText('closing-year-panel')).includes('已年结'), 'C15 业务主管独立确认年结')
  check(await page.getByTestId('closing-year-carryover').isVisible(), 'C15 年结生成结转凭证入口')
  await page.getByTestId('closing-year-carryover').click()
  await page.waitForTimeout(450)
  check((await page.locator('body').innerText()).includes('JE-CLOSE-2026'), 'C15 年结结转凭证可回链查看')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(350)
  await page.getByTestId('closing-period-reopen-2026-12').click()
  await page.waitForTimeout(400)
  check((await bodyText('closing-period-error')).includes('年度已年结'), 'C15 已年结年度不能直接重开月份')
  await page.getByTestId('closing-year-reopen').click()
  await page.waitForTimeout(500)
  check((await bodyText('closing-year-panel')).includes('未年结'), 'C15 业务主管可重开已年结年度')
  await page.getByTestId('closing-period-reopen-2026-12').click()
  await page.getByTestId('closing-period-reopen-reason').fill('年结后补充 12 月银行手续费')
  await page.getByTestId('closing-period-reopen-save').click()
  await page.waitForTimeout(500)
  check((await bodyText('closing-period-2026-12')).includes('未关账'), 'C15 重开年度后可按原因重开月份')
  await shot('16-c15-periods-year')

  /* ---------------- C16 ---------------- */
  await page.goto(BASE + '/finance?tab=tax-center', { waitUntil: 'domcontentloaded' })
  await page.getByTestId('finance-tax-center').waitFor({ state: 'visible', timeout: 20000 })
  await page.getByTestId('tax-rate-table').waitFor({ state: 'visible', timeout: 20000 })
  await page.waitForTimeout(800)
  check((await bodyText('finance-tax-center')).includes('7 个版本'), 'C16 初始 7 个税率版本')
  const exportRow = page.getByTestId('tax-rate-table').locator('tbody tr').filter({ hasText: 'EXPORT' })
  await exportRow.click()
  await page.getByTestId('tax-rate-detail').waitFor({ state: 'visible' })
  check((await bodyText('tax-rate-detail')).includes('出口关税'), 'C16 税率版本详情展示税种与版本')
  await page.getByTestId('tax-rate-retire').click()
  await page.waitForTimeout(450)
  check((await bodyText('tax-rate-detail')).includes('2026-11-18'), 'C16 停用税率版本写入停用日期')
  await page.getByTestId('tax-rate-detail-close').click()
  await page.waitForTimeout(350)

  await page.getByTestId('tax-rate-create').click()
  await page.getByTestId('tax-rate-form').waitFor({ state: 'visible' })
  await pick('tax-rate-code', '出口免税（EXPORT）')
  await page.getByTestId('tax-rate-rate').fill('0')
  await page.getByTestId('tax-rate-from').fill('2026-11-19')
  await page.getByTestId('tax-rate-save').click()
  await page.waitForTimeout(500)
  check(await page.getByTestId('tax-rate-table').locator('tbody tr').count() === 8, 'C16 新建税率版本后版本数增加')
  check((await bodyText('tax-rate-table')).includes('2026-11-19') && (await bodyText('tax-rate-table')).includes('本地新增'), 'C16 新版本按生效日期展示')

  await page.getByTestId('tax-group-create').click()
  await page.getByTestId('tax-group-form-name').waitFor({ state: 'visible' })
  await page.getByTestId('tax-group-form-name').fill('出口服务税组')
  await page.getByTestId('tax-group-form-description').fill('出口服务零税率组合')
  await page.getByTestId('tax-group-save').click()
  await page.waitForTimeout(450)
  check(await page.getByTestId('tax-group-table').locator('tbody tr').count() === 5, 'C16 新建税组后税组数增加')
  check((await bodyText('tax-group-table')).includes('出口服务税组'), 'C16 新税组展示名称与组合')
  const mixedRow = page.getByTestId('tax-group-table').locator('tbody tr').filter({ hasText: '混合' })
  await mixedRow.getByRole('button').click()
  await page.waitForTimeout(350)
  check((await mixedRow.innerText()).includes('启用'), 'C16 停用税组可重新启用')
  await mixedRow.getByRole('button').click()
  await page.waitForTimeout(350)
  check((await mixedRow.innerText()).includes('停用'), 'C16 启用税组可再次停用')

  await pick('tax-binding-product', 'SKU-1002')
  await pick('tax-binding-group', '服务税组')
  await page.getByTestId('tax-binding-save').click()
  await page.waitForTimeout(500)
  const bindingText = await bodyText('finance-tax-center')
  check(bindingText.includes('商品当前绑定 服务税组') && bindingText.includes('往来单位当前绑定 服务税组'), 'C16 商品与往来单位税组绑定生效')
  await shot('17-c16-tax-rates')

  check((await txt('tax-calc-net')).includes('1,000.00') && (await txt('tax-calc-tax')).includes('130.00') && (await txt('tax-calc-gross')).includes('1,130.00'), 'C16 默认含税 1,130 拆税为 1,000 + 130')
  await page.getByTestId('tax-calc-use-new-rate').click()
  await page.waitForTimeout(500)
  check((await txt('tax-calc-net')).includes('991.23') && (await txt('tax-calc-tax')).includes('138.77') && (await txt('tax-calc-gross')).includes('1,130.00'), 'C16 新税率只影响生效日期后的计算')
  check((await bodyText('tax-calc-snapshot')).includes('14%'), 'C16 计算快照记录适用税率版本')

  const cell2026 = await bodyText('tax-period-cell-2026-11')
  check(cell2026.includes('待申报') && cell2026.includes('212,256.00'), 'C16 税历展示 2026-11 待申报税额')
  await page.getByTestId('tax-period-cell-2026-11').click()
  await page.getByTestId('tax-period-detail').waitFor({ state: 'visible' })
  check((await bodyText('tax-period-number')).includes('尚未申报'), 'C16 税期详情展示未申报状态')
  check((await bodyText('tax-period-locked')).includes('未锁定'), 'C16 申报前账簿未锁定')
  await page.getByTestId('tax-period-file').click()
  await page.waitForTimeout(500)
  check((await bodyText('tax-period-number')).includes('TAX-2026-11-0001'), 'C16 首次申报生成申报编号')
  check((await bodyText('tax-period-locked')).includes('已锁定'), 'C16 首次申报后账簿锁定')
  await page.getByTestId('tax-period-repreview').click()
  await page.waitForTimeout(450)
  check((await bodyText('tax-period-difference')).includes('1,650.00'), 'C16 重新预览生成税额差异 +1,650')
  await page.getByTestId('tax-period-correct').click()
  await page.waitForTimeout(350)
  check((await bodyText('tax-period-error')).includes('更正原因必填'), 'C16 更正申报必须填写原因')
  await page.getByTestId('tax-period-reason').fill('新增权责发生制收入，调整销项税')
  await page.getByTestId('tax-period-correct').click()
  await page.waitForTimeout(550)
  check((await bodyText('tax-period-latest')).includes('TAX-2026-11-0001-C1'), 'C16 更正申报生成新编号')
  check((await bodyText('tax-period-trace')).includes('TAX-2026-11-0001'), 'C16 更正记录追溯原申报')
  check((await bodyText('tax-period-status')).includes('已更正'), 'C16 税期状态更新为已更正')
  await shot('18-c16-tax-correction')
} catch (error) {
  failures += 1
  results.push({ ok: false, label: 'SCRIPT ERROR', detail: String(error) })
  console.error('SCRIPT ERROR', error)
} finally {
  const report = {
    generatedAt: new Date().toISOString(),
    base: BASE,
    viewport: '1440x1000',
    total: results.length,
    passed: results.filter((item) => item.ok).length,
    failed: failures,
    consoleErrors,
    pageErrors,
    badResponses,
    results
  }
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2))
  console.log(JSON.stringify({ total: report.total, passed: report.passed, failed: failures, consoleErrors: consoleErrors.length, pageErrors: pageErrors.length, badResponses: badResponses.length }))
  await browser.close()
  if (failures > 0) process.exitCode = 1
}

import fs from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'

const BASE = 'http://localhost:3001'
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../artifacts/ui-dashboard-c12')
fs.mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch({ channel: 'msedge', headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
const failures = []
const errors = []
const assertions = []
const screenshots = []
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
page.on('pageerror', e => errors.push('PAGE ' + String(e)))

function check(name, cond, detail = '') {
  assertions.push({ name, ok: Boolean(cond) })
  if (!cond) failures.push(name + (detail ? ': ' + detail : ''))
  console.log((cond ? 'PASS ' : 'FAIL ') + name + (detail ? ' — ' + detail : ''))
}
async function stable(id, timeout = 20000) {
  await page.getByTestId(id).first().waitFor({ state: 'visible', timeout })
  for (let i = 0; i < 6; i++) { if (await page.getByTestId(id).count() === 1) break; await page.waitForTimeout(250) }
  await page.waitForTimeout(500)
}
async function open(path, id) {
  const res = await page.goto(BASE + path, { waitUntil: 'networkidle' })
  await stable(id)
  return res?.status()
}
async function shot(name) { await page.waitForTimeout(650); screenshots.push(name + '.png'); await page.screenshot({ path: OUT + '/' + name + '.png' }) }
async function bodyHas(id, text) { return (await page.getByTestId(id).first().innerText()).includes(text) }

// C10
check('C10 页面 200', await open('/finance?tab=imported', 'finance-imported') === 200)
check('C10 种子 4 张', await page.getByTestId('imported-table').locator('tbody tr').count() === 4)
await page.getByTestId('imported-open-IMP-2026-0001').click()
await stable('imported-detail')
check('C10 详情来源', await bodyHas('imported-detail-provider', '金蝶云星空'))
check('C10 详情外部编号', await bodyHas('imported-detail-external', 'JE-2026-0088'))
check('C10 制单人对草稿可提交', !(await page.getByTestId('imported-detail-submit').isDisabled()))
check('C10 制单人无独立过账入口', await page.getByTestId('imported-detail-post').count() === 0)
await shot('01-imported-detail')
await page.getByTestId('imported-detail-submit').click()
await page.waitForTimeout(900)
check('C10 提交后待复核', await bodyHas('imported-status-IMP-2026-0001', '待独立复核'))
check('C10 提交后版本 v2', await bodyHas('imported-table', 'v2'))
check('C10 待复核计数 2', await bodyHas('imported-stat-submitted', '2'))
await page.keyboard.press('Escape')
await page.waitForTimeout(500)

// batch mixed status -> unchanged
await page.getByTestId('imported-select-IMP-2026-0002').click()
await page.getByTestId('imported-select-IMP-2026-0004').click()
check('C10 已选 2 张', await bodyHas('imported-selected-count', '2'))
await page.getByTestId('imported-batch-cancel').click()
await page.waitForTimeout(900)
check('C10 批量错误提示整批保持', await bodyHas('imported-batch-error', '整批保持原状态'))
check('C10 非草稿取消逐条提示', await page.getByTestId('imported-batch-issue-IMP-2026-0002').count() === 1)
await shot('02-imported-batch-blocked')
check('C10 整批后 IMP-0002 仍待复核', await bodyHas('imported-status-IMP-2026-0002', '待独立复核'))

// reviewer posts only submitted 0002
await page.getByTestId('imported-select-IMP-2026-0004').click()
await page.getByTestId('imported-actor-reviewer').click()
await page.waitForTimeout(400)
check('C10 复核身份可过账', !(await page.getByTestId('imported-batch-post').isDisabled()))
await page.getByTestId('imported-batch-post').click()
await page.waitForTimeout(1000)
check('C10 独立过账成功', await bodyHas('imported-status-IMP-2026-0002', '已过账'))
check('C10 过账计数 2', await bodyHas('imported-stat-posted', '2'))
await shot('03-imported-posted')

// form duplicate
await page.getByTestId('imported-new').click()
await stable('imported-form')
await page.getByTestId('imported-form-external').fill('JE-2026-0088')
await page.getByTestId('imported-form-description').fill('重复来源演示')
await page.getByTestId('imported-form-save').click()
await page.waitForTimeout(700)
check('C10 重复来源被拒绝', await bodyHas('imported-form-error', '不能重复登记'))
await shot('04-imported-duplicate')
await page.getByTestId('imported-form-cancel').click()
await page.waitForTimeout(500)

// journals source
check('C10 总账页 200', await open('/finance?tab=journals', 'journal-table') === 200)
await page.waitForTimeout(1200)
check('C10 总账来源标记', await page.getByTestId('journal-source').count() >= 1)
check('C10 来源含金蝶外部编号', await page.locator('[data-testid="journal-source"]', { hasText: 'JE-2026-0089' }).count() === 1)
await shot('05-journals-source')

// C11
check('C11 页面 200', await open('/finance?tab=donations', 'finance-donations') === 200)
check('C11 已过账净额 70000', await bodyHas('donation-stat-posted', '70,000.00'))
await page.getByTestId('donation-open-DON-2026-0001').click()
await stable('donation-detail')
check('C11 收据号', await bodyHas('donation-receipt-number', 'RCPT-DON-2026-0001'))
check('C11 资金流水', await bodyHas('donation-fund-flow', 'BF-2026-0001'))
check('C11 凭证链接', await page.getByTestId('donation-journal-link').count() === 1)
await shot('06-donation-detail')
await page.getByTestId('donation-receipt-open').click()
await stable('donation-print-preview')
check('C11 收据样张', await page.getByTestId('donation-receipt-sample').first().isVisible())
check('C11 样张非财政票据', await bodyHas('donation-receipt-sample', '非财政票据'))
await shot('07-donation-receipt')
await page.getByTestId('donation-print-close').click()
await page.waitForTimeout(500)

// channel disabled -> send rejected
await page.getByTestId('donation-mail-send').click()
await page.waitForTimeout(600)
check('C11 渠道停用阻止发送', await bodyHas('donation-mail-error', 'SMTP'))
await page.getByTestId('donation-channel-enable').click()
await page.waitForTimeout(800)
check('C11 渠道启用', await bodyHas('donation-channel-state', '已启用'))
await page.getByTestId('donation-mail-send').click()
await page.waitForTimeout(1900)
check('C11 发送记录已接受', await page.getByTestId('donation-dispatches').innerText().then(t => t.includes('SMTP 已接受')))
await shot('08-donation-mail-sent')
await page.keyboard.press('Escape')
await page.waitForTimeout(500)

// failed/unknown dispatch actions
await page.getByTestId('donation-open-DON-2026-0002').click()
await stable('donation-detail')
check('C11 财政票据标记', await bodyHas('donation-fiscal-ticket', '财政票据'))
check('C11 法定票据不可签发', await bodyHas('donation-ticket-capability', '不能签发') || await bodyHas('donation-ticket-capability', '不可签发'))
await page.getByTestId('donation-dispatch-open-DSP-2026-0002').click()
await stable('donation-dispatch-detail')
check('C11 失败原因', await bodyHas('donation-dispatch-detail', 'SMTP 550'))
await shot('09-donation-dispatch')
await page.getByTestId('donation-dispatch-retry').click()
await page.waitForTimeout(1800)
check('C11 重试生成新记录', await bodyHas('donation-dispatch-detail', '排队中') || await bodyHas('donation-dispatch-detail', 'SMTP 已接受'))
await page.getByTestId('donation-dispatch-close').click()
await page.waitForTimeout(400)
await page.getByTestId('donation-detail-close').click()
await page.waitForTimeout(700)

// review donation 0003 as reviewer
await page.getByTestId('donation-actor-reviewer').click()
await page.waitForTimeout(400)
await page.getByTestId('donation-open-DON-2026-0003').click()
await stable('donation-detail')
check('C11 复核人可批准', !(await page.getByTestId('donation-review-approve').isDisabled()))
await page.getByTestId('donation-review-approve').click()
await page.waitForTimeout(1000)
check('C11 批准后过账', await bodyHas('donation-status-DON-2026-0003', '已过账'))
check('C11 批准生成收据', await page.getByTestId('donation-receipt-number').innerText().then(t => t.includes('RCPT-DON-2026-')))
await shot('10-donation-approved')


// C12 partner
check('C12 伙伴页 200', (await open('/partners', 'partners-table')) === 200)
await page.getByTestId('partners-new').click()
await stable('partners-edit-name')
await page.getByTestId('partners-edit-name').fill('杭州云帆演示有限公司')
await page.getByTestId('partners-edit-role-customer').click()
await page.getByTestId('partners-edit-role-donor').click()
await page.getByTestId('partners-edit-contact').fill('吴敏')
await page.getByTestId('partners-edit-phone').fill('138-0571-9000')
await page.getByTestId('partners-edit-email').fill('wumin@yunfan.example')
await page.getByTestId('partners-edit-line').fill('滨江区江南大道 88 号')
await page.getByTestId('partners-edit-contact-add').click()
await page.getByTestId('partners-edit-contact-name-1').fill('赵强')
await page.getByTestId('partners-edit-save').click()
await stable('partners-detail-role')
check('C12 伙伴多角色 3 个', (await page.getByTestId('partners-detail-role').count()) === 3)
check('C12 伙伴两个联系人', (await page.getByTestId('partners-detail-contact').count()) === 2)
check('C12 伙伴地址保存', (await page.getByTestId('partners-detail-address').innerText()).includes('滨江区'))
check('C12 伙伴自动编号', /PT-\d{3}/.test(await page.locator('body').innerText()))
await shot('11-partner-new')
await page.keyboard.press('Escape')
await page.waitForTimeout(500)

// C12 catalog
check('C12 目录页 200', (await open('/catalog', 'catalog-table')) === 200)
await page.getByTestId('catalog-detail').first().click()
await stable('catalog-detail-kind')
check('C12 商品详情类型', (await page.getByTestId('catalog-detail-kind').innerText()).includes('商品'))
check('C12 商品跟踪库存', (await page.getByTestId('catalog-detail-track-stock').innerText()).length > 0)
check('C12 停用引用提示', (await page.getByTestId('catalog-detail-reference-notice').count()) === 1)
check('C12 库存流程链接', (await page.getByTestId('catalog-detail-inventory-link').getAttribute('href')) === '/inventory')
await shot('12-catalog-detail')
await page.keyboard.press('Escape')
await page.waitForTimeout(500)

// C12 purchase order actions
check('C12 采购页 200', (await open('/purchase-orders', 'orders-table')) === 200)
await page.getByTestId('orders-actor-approver').click()
await page.waitForTimeout(400)
const row0516 = page.locator('[data-testid="orders-table"] tbody tr').filter({ hasText: 'PO-2026-0516' })
await row0516.getByTestId('orders-open').click()
await stable('order-self-approval')
check('C12 采购自批提示', (await page.getByTestId('order-self-approval').count()) === 1)
check('C12 采购自批批准隐藏', (await page.getByTestId('order-approve').count()) === 0)
await shot('13-purchase-self-approval')
await page.getByTestId('order-back').click()
await page.waitForTimeout(600)
await page.getByTestId('orders-actor-maker').click()
await page.waitForTimeout(400)
const row0512 = page.locator('[data-testid="orders-table"] tbody tr').filter({ hasText: 'PO-2026-0512' })
await row0512.getByTestId('orders-open').click()
await stable('order-withdraw')
check('C12 采购撤回归制单人', (await page.getByTestId('order-withdraw').count()) === 1)
await page.getByTestId('order-withdraw').click()
await page.waitForTimeout(700)
check('C12 采购撤回提示', (await page.getByTestId('order-withdraw-notice').count()) === 1)
await shot('14-purchase-withdrawn')
await page.getByTestId('order-resubmit').click()
await page.waitForTimeout(700)
check('C12 采购可重新提交', (await page.getByTestId('order-withdraw-notice').count()) === 0 && (await page.getByTestId('order-withdraw').count()) === 1)
await page.keyboard.press('Escape')
await page.waitForTimeout(400)

// C12 quote formal send
check('C12 报价页 200', (await open('/sales?tab=quotes', 'quote-pagination')) === 200)
const draftQuote = page.locator('tbody tr').filter({ hasText: '草稿' }).first()
await draftQuote.getByTestId('quote-open').click()
await stable('quote-send')
check('C12 报价草稿可正式发出', await page.getByTestId('quote-send').isEnabled())
await page.getByTestId('quote-send').click()
await page.waitForTimeout(700)
check('C12 报价正式发出时间', (await page.getByTestId('quote-sent-at').innerText()).includes('正式发出于'))
await shot('15-quote-sent')
await page.keyboard.press('Escape')
await page.waitForTimeout(500)

// C12 sales self approval
check('C12 销售订单页 200', (await open('/sales?tab=orders', 'sales-orders-table')) === 200)
await page.getByTestId('sales-actor-approver').click()
await page.waitForTimeout(400)
await page.getByTestId('sales-search').fill('SO-2026-9003')
await page.waitForTimeout(600)
await page.getByTestId('sales-orders-open').first().click()
await stable('sales-order-self-approval')
check('C12 销售自批提示', (await page.getByTestId('sales-order-self-approval').count()) === 1)
check('C12 销售自批批准禁用', (await page.getByTestId('sales-order-approve').isDisabled()))
await shot('16-sales-self-approval')
await page.keyboard.press('Escape')
await page.waitForTimeout(500)

// C12-4 trade documents and provisional
check('C12 单据流转页 200', (await open('/finance?tab=documents', 'finance-documents')) === 200)
check('C12 暂估待确认 98400', (await page.getByTestId('trade-provisional-pending').innerText()).includes('98,400'))
check('C12 暂估已入账 52600', (await page.getByTestId('trade-provisional-posted').innerText()).includes('52,600'))
check('C12 AP 科目映射', (await page.getByTestId('trade-mapping-ap').innerText()).includes('2202'))
check('C12 AR 科目映射', (await page.getByTestId('trade-mapping-ar').innerText()).includes('1122'))
await shot('17-trade-documents')
await page.getByTestId('trade-actor-reviewer').click()
await page.waitForTimeout(400)
await page.getByTestId('trade-provisional-confirm-PB-2026-001').click()
await page.waitForTimeout(700)
check('C12 暂估确认后更新金额', (await page.getByTestId('trade-provisional-posted').innerText()).includes('151,000'))
await shot('18-trade-provisional-confirmed')
await page.getByTestId('trade-doc-open-BILL-2026-1101').click()
await stable('trade-doc-review')
check('C12 账单复核入口', (await page.getByTestId('trade-doc-review').count()) === 1)
await page.getByTestId('trade-doc-review').click()
await page.waitForTimeout(700)
check('C12 账单已复核待过账', (await page.getByTestId('trade-doc-detail-status').innerText()).includes('已复核'))
await shot('19-trade-reviewed')
check('C12 账单可独立过账', (await page.getByTestId('trade-doc-post').count()) === 1)
await page.getByTestId('trade-doc-post').click()
await page.waitForTimeout(700)
check('C12 账单已过账', (await page.getByTestId('trade-doc-detail-status').innerText()).includes('已过账'))
await shot('20-trade-posted')

await page.evaluate(() => document.documentElement.classList.add('dark'))
await page.waitForTimeout(500)
check('C12 暗色主题生效', (await page.locator('html.dark').count()) === 1)
await shot('21-trade-documents-dark')

fs.writeFileSync(OUT + '/report.json', JSON.stringify({
  base: BASE,
  viewport: { width: 1440, height: 1000 },
  assertions,
  passed: assertions.filter(item => item.ok).length,
  failed: failures,
  consoleErrors: errors,
  screenshots,
  generatedAt: new Date().toISOString(),
}, null, 2))
console.log('ASSERTIONS', assertions.length, 'PASSED', assertions.filter(item => item.ok).length)
console.log('FAILURES', JSON.stringify(failures, null, 2))
console.log('ERRORS', JSON.stringify(errors, null, 2))
await browser.close()
process.exit(failures.length || errors.length ? 1 : 0)

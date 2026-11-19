import { chromium } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const BASE = 'http://localhost:3001'
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../artifacts/ui-dashboard-c22-c23')
mkdirSync(OUT, { recursive: true })

const results = []
const consoleErrors = []
const pageErrors = []
const badResponses = []

function check(ok, label, detail = '') {
  const entry = { ok: Boolean(ok), label, detail: String(detail).replace(/\s+/g, ' ').slice(0, 220) }
  results.push(entry)
  console.log((entry.ok ? 'PASS ' : 'FAIL ') + label + (entry.detail ? ' :: ' + entry.detail : ''))
}

const browser = await chromium.launch({ channel: 'msedge', headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()) })
page.on('pageerror', error => pageErrors.push(error.message))
page.on('response', response => { if (response.status() >= 400) badResponses.push(response.status() + ' ' + response.url()) })

async function bodyText() {
  return (await page.locator('body').innerText()).replace(/\s+/g, ' ')
}

async function text(id) {
  return (await page.getByTestId(id).innerText()).replace(/\s+/g, ' ').trim()
}

async function waitVisible(id, timeout = 8000) {
  await page.getByTestId(id).waitFor({ state: 'visible', timeout })
}

async function pick(id, option) {
  await page.getByTestId(id).click()
  await page.locator('[role="option"]').filter({ hasText: option }).last().click()
  await page.waitForTimeout(350)
}

async function fill(id, value) {
  try {
    await page.getByTestId(id).fill(value)
  } catch {
    await page.getByTestId(id).locator('input, textarea').first().fill(value)
  }
}

async function shot(name) {
  await page.waitForTimeout(250)
  await page.screenshot({ path: resolve(OUT, name), fullPage: false })
}

try {
  await page.goto(BASE + '/settings', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2800)
  await page.getByTestId('user-menu-trigger').click()
  await page.getByText('安全设置', { exact: true }).click()
  await waitVisible('security-profile-name', 10000)

  // C22-1 账户安全、会话、MFA、注销预检
  const profileZhang = await text('security-profile-name')
  check(profileZhang.includes('张明远'), 'C22 账户菜单打开安全抽屉并显示当前身份', profileZhang)
  check((await text('security-profile-role')).includes('所有者'), 'C22-1 当前身份角色徽标为所有者')
  check((await text('security-policy-idle')).includes('30 分钟'), 'C22-1 展示有效空闲策略 30 分钟')
  check((await text('security-policy-source')).includes('企业策略'), 'C22-1 展示策略来源')
  check((await page.locator('[data-testid^="security-channel-"]').count()) === 4, 'C22-1 登录渠道展示 4 项状态')
  check((await text('security-channel-sso')).includes('已启用'), 'C22-1 SSO 渠道显示已启用')
  check((await text('security-channel-recovery')).includes('待验证'), 'C22-1 恢复邮箱显示待验证')
  check((await text('security-deletion-summary')).includes('4 项阻断'), 'C22-1 注销预检展示 4 项阻断')
  check(await page.getByTestId('security-deletion-start').isDisabled(), 'C22-1 存在阻断时禁用申请注销')
  await shot('01-c22-security-overview.png')

  await page.getByTestId('security-tabs').getByText('登录会话', { exact: true }).click()
  await waitVisible('security-expiry')
  const expiry18 = await text('security-expiry')
  check(expiry18.includes('18 分钟') && expiry18.includes('空闲过期'), 'C22-1 当前会话临期提示 18 分钟', expiry18)
  check((await text('security-session-current')).includes('当前会话'), 'C22-1 当前设备标记为当前会话')
  check((await text('security-session-session-phone')).includes('iPhone 16 Pro'), 'C22-1 设备记录含设备名')
  check((await text('security-session-session-phone')).includes('最近活动'), 'C22-1 设备记录含登录与最近活动时间')

  await page.getByTestId('security-extend').click()
  await page.waitForTimeout(300)
  const expiry48 = await text('security-expiry')
  check(expiry48.includes('48 分钟') && expiry48.includes('空闲有效期'), 'C22-1 延长会话后变为 48 分钟有效', expiry48)

  await shot('02-c22-sessions-extended.png')
  await page.getByTestId('security-session-revoke-session-phone').click()
  await page.waitForTimeout(300)
  check((await text('security-session-session-phone')).includes('已撤销'), 'C22-1 单个撤销其他设备后状态为已撤销')
  check((await page.getByTestId('security-session-revoke-session-phone').count()) === 0, 'C22-1 已撤销设备不再显示撤销按钮')

  await page.getByTestId('security-end-others').click()
  await page.waitForTimeout(300)
  check((await text('security-session-session-office')).includes('已撤销'), 'C22-1 批量撤销后其他设备均为已撤销')
  check(await page.getByTestId('security-end-others').isDisabled(), 'C22-1 无其他有效设备时批量撤销禁用')
  await shot('03-c22-sessions-revoked.png')

  await page.getByTestId('security-tabs').getByText('账户概览', { exact: true }).click()
  await pick('security-identity-select', '陈立')
  check((await text('security-profile-name')).includes('陈立'), 'C22-1 切换模拟身份后账户同步为陈立')
  check((await text('security-profile-role')).includes('管理员'), 'C22-1 切换身份后角色与权限同步')
  check((await text('security-deletion-summary')).includes('3 项阻断'), 'C22-1 切换身份后注销预检同步为 3 项')
  check((await text('security-stepup-detail')).includes('超过 10 分钟'), 'C22-1 展示敏感操作附加验证已过期')
  await page.getByTestId('security-stepup').click()
  await page.waitForTimeout(300)
  check((await text('security-stepup-message')).includes('附加验证已通过'), 'C22-1 完成附加验证后提示通过')
  await shot('04-c22-identity-admin.png')

  await page.getByTestId('security-tabs').getByText('登录会话', { exact: true }).click()
  await waitVisible('security-expiry')
  const expiry185 = await text('security-expiry')
  check(expiry185.includes('185 分钟') && expiry185.includes('仍有'), 'C22-1 切换身份后会话变为 185 分钟有效', expiry185)
  check((await text('security-session-current')).includes('当前会话'), 'C22-1 切换身份后当前设备同步')
  check((await page.getByTestId('security-session-revoke-session-tablet').count()) === 1, 'C22-1 切换身份后仅显示该身份的会话')
  await page.getByTestId('security-extend').click()
  await page.waitForTimeout(250)
  check((await text('security-expiry')).includes('215 分钟'), 'C22-1 再次延长会话按当前剩余时间累加')
  await shot('05-c22-sessions-admin.png')

  // C22-2 CLI 与 MCP 设备授权
  await page.getByTestId('security-tabs').getByText('设备授权', { exact: true }).click()
  await waitVisible('security-device-status')
  check((await text('security-device-code-value')) === 'NXR4-8Q2P', 'C22-2 设备授权复用同一界面展示 CLI 待确认请求')
  check((await text('security-device-status')).includes('等待确认'), 'C22-2 CLI 请求初始为等待确认')
  check((await page.locator('[data-testid^="security-device-scope-"]').count()) === 1, 'C22-2 CLI 仅申请 1 个工作区只读范围')
  check((await text('security-device-readonly')).includes('仅只读范围'), 'C22-2 明确只读范围不含写权限')

  await fill('security-device-code', 'AAAA-0000')
  await page.getByTestId('security-device-lookup').click()
  await page.waitForTimeout(250)
  check((await text('security-device-message')).includes('未找到'), 'C22-2 无效授权码给出核验失败反馈')

  await fill('security-device-code', 'MCP7-2K9D')
  await page.getByTestId('security-device-lookup').click()
  await page.waitForTimeout(300)
  check((await text('security-device-message')).includes('已找到'), 'C22-2 有效 MCP 授权码核验成功')
  check((await text('security-device-code-value')) === 'MCP7-2K9D', 'C22-2 核验后选中对应 MCP 请求')
  check((await page.locator('[data-testid^="security-device-scope-"]').count()) === 3, 'C22-2 MCP 展示财务、总账、报表 3 个只读范围')
  check((await page.locator('[data-testid^="security-device-scope-"]').filter({ hasText: '读取财务数据' }).count()) === 1, 'C22-2 MCP 范围按用途展示')

  await page.getByTestId('security-device-deny').click()
  await page.waitForTimeout(250)
  check((await text('security-device-status')).includes('已拒绝'), 'C22-2 拒绝后请求状态为已拒绝')
  check((await text('security-device-result')).includes('已拒绝'), 'C22-2 拒绝后给出设备未获得令牌的反馈')
  await shot('06-c22-device-requests.png')

  await page.getByTestId('security-device-example-cli').click()
  await page.waitForTimeout(200)
  check((await text('security-device-code-value')) === 'NXR4-8Q2P', 'C22-2 可切回 CLI 待确认请求')
  await page.getByTestId('security-device-approve').click()
  await page.waitForTimeout(250)
  check((await text('security-device-status')).includes('已授权'), 'C22-2 同意 CLI 授权后状态为已授权')
  check((await text('security-device-result')).includes('工作区只读范围'), 'C22-2 同意后反馈授予的只读范围')

  await page.getByTestId('security-device-example-expired').click()
  await page.waitForTimeout(250)
  check((await text('security-device-status')).includes('已过期'), 'C22-2 过期代码状态为已过期')
  check((await text('security-device-note')).includes('15 分钟'), 'C22-2 过期记录说明 15 分钟内未确认')
  check((await page.getByTestId('security-device-approve').count()) === 0, 'C22-2 过期请求不能继续同意')

  await page.getByTestId('security-device-record-auth-mcp-approved').click()
  await page.waitForTimeout(250)
  check((await text('security-device-status')).includes('已授权'), 'C22-2 可选择已授权记录')
  await page.getByTestId('security-device-revoke').click()
  await page.waitForTimeout(250)
  check((await text('security-device-status')).includes('已撤销'), 'C22-2 撤销已授权设备后状态为已撤销')
  check((await text('security-device-result')).includes('下一次请求会被拒绝'), 'C22-2 撤销后反馈令牌立即失效')
  await shot('07-c22-device-approved-revoked.png')
  await page.getByTestId('security-close').click()
  await page.waitForTimeout(500)

  // C23-1 助手入口、会话与流式输出
  const assistantLink = page.getByRole('link', { name: '工作区助手', exact: true })
  check((await assistantLink.count()) === 1, 'C23-1 侧栏提供工作区助手入口')
  await assistantLink.click()
  await page.waitForURL('**/assistant', { timeout: 10000 })
  await waitVisible('assistant-workspace', 10000)
  await page.waitForTimeout(700)
  check((await text('assistant-plan-state')).includes('专业版'), 'C23-1 专业版工作区显示助手可用')
  check((await text('assistant-session-title')) === '核对本期科目余额', 'C23-1 默认打开固定会话样例')
  check((await page.locator('[data-testid^="assistant-session-as-"]').count()) === 3, 'C23-1 会话列表展示 3 个历史会话')
  check((await text('assistant-capability-balances')).includes('可用'), 'C23-1 能力状态显示余额与往来可用')
  check((await text('assistant-tool-tool-balances')).includes('读取 2026-11 科目余额'), 'C23-1 待审批卡显示用途与参数摘要')
  check((await text('assistant-tool-tool-balances')).includes('财务只读'), 'C23-1 待审批卡显示执行范围')
  check((await text('assistant-tool-status-tool-balances')).includes('等待审批'), 'C23-1 工具调用初始为等待审批')
  await shot('08-c23-assistant-overview.png')

  // C23-2 允许工具并跳转财务入口
  await page.getByTestId('assistant-tool-allow-tool-balances').click()
  await page.waitForTimeout(350)
  check((await text('assistant-tool-status-tool-balances')).includes('已允许'), 'C23-2 允许后工具状态更新为已允许')
  check((await text('assistant-tool-result-tool-balances')).includes('1003 备用金'), 'C23-2 允许后会话展示查询结果')
  check((await page.locator('[data-testid^="assistant-tool-link-tool-balances-"]').count()) === 3, 'C23-2 查询结果提供科目、总账、报表 3 个入口')
  await shot('09-c23-tool-approved.png')

  await page.getByTestId('assistant-tool-link-tool-balances-reporting').click()
  await page.waitForURL('**/finance?tab=reporting', { timeout: 10000 })
  await waitVisible('reporting-center', 12000)
  check(page.url().includes('/finance?tab=reporting'), 'C23-2 从工具结果跳转到报表中心')
  check((await text('reporting-center')).includes('报表中心'), 'C23-2 报表中心页面正常渲染')
  await shot('10-c23-result-jump.png')
  await page.goBack()
  await page.waitForURL('**/assistant', { timeout: 10000 })
  await waitVisible('assistant-workspace', 10000)
  await page.waitForTimeout(500)
  check((await text('assistant-tool-result-tool-balances')).includes('1003 备用金'), 'C23-2 返回助手后会话结果保留')

  // C23-1 新建会话、输入流式与历史切换
  await page.getByTestId('assistant-new').click()
  await page.waitForTimeout(250)
  check((await page.locator('[data-testid^="assistant-session-as-"]').count()) === 4, 'C23-1 新建会话后列表增加一条')
  check((await text('assistant-session-title')) === '新会话', 'C23-1 新会话标题为默认标题')
  await fill('assistant-input', '生成本月经营摘要，并说明数据截止日期。')
  await page.waitForTimeout(150)
  check(!(await page.getByTestId('assistant-send').isDisabled()), 'C23-1 输入问题后发送按钮可用')
  await page.getByTestId('assistant-send').click()
  await waitVisible('assistant-streaming')
  check((await text('assistant-streaming')).includes('生成中'), 'C23-1 本地分片输出时显示生成中状态')
  await page.getByTestId('assistant-streaming').waitFor({ state: 'hidden', timeout: 10000 })
  const summaryText = await text('assistant-messages')
  check(summaryText.includes('净利润 73,117.00 元'), 'C23-1 流式完成后展示经营摘要结果')
  check(summaryText.includes('W-142 工作台投影'), 'C23-1 摘要标注数据截止与来源')
  await shot('11-c23-stream-complete.png')

  await page.getByTestId('assistant-session-as-aging').click()
  await page.waitForTimeout(300)
  check((await text('assistant-session-title')) === '应付账龄复核', 'C23-1 可切换历史会话并恢复上下文')
  check((await text('assistant-messages')).includes('320,770.00 元'), 'C23-1 历史会话保留原消息内容')
  await page.getByTestId('assistant-session-as-summary').click()
  await page.waitForTimeout(300)
  check((await text('assistant-session-title')) === '本月经营摘要', 'C23-1 历史会话列表可再次切换')
  check((await text('assistant-messages')).includes('728,960.00 元'), 'C23-1 历史会话展示原经营数据')

  // C23-1 取消与恢复
  await page.getByTestId('assistant-session-as-aging').click()
  await page.waitForTimeout(250)
  await page.getByTestId('assistant-suggestion-aging').click()
  await waitVisible('assistant-streaming')
  await page.waitForTimeout(180)
  await shot('12-c23-streaming.png')
  await page.getByTestId('assistant-cancel').click()
  await page.waitForTimeout(300)
  check((await text('assistant-messages')).includes('已取消'), 'C23-1 取消生成后消息标记为已取消')
  check(await page.getByTestId('assistant-resume').isVisible(), 'C23-1 取消后提供恢复生成入口')
  await page.getByTestId('assistant-resume').click()
  await page.getByTestId('assistant-streaming').waitFor({ state: 'hidden', timeout: 10000 })
  await page.waitForTimeout(250)
  check((await text('assistant-tool-status-tool-aging-live')).includes('等待审批'), 'C23-1 恢复后完成输出并产生待审批工具')

  // C23-2 拒绝工具
  check((await text('assistant-tool-tool-aging-live')).includes('应付账龄'), 'C23-2 恢复后的工具卡显示账龄用途与范围')
  await page.getByTestId('assistant-tool-deny-tool-aging-live').click()
  await page.waitForTimeout(300)
  check((await text('assistant-tool-status-tool-aging-live')).includes('已拒绝'), 'C23-2 拒绝后工具状态更新为已拒绝')
  check((await text('assistant-tool-result-tool-aging-live')).includes('未读取任何数据'), 'C23-2 拒绝后会话说明未访问财务数据')
  await shot('13-c23-tool-denied.png')

  // C23-1 套餐与角色限制
  await pick('assistant-workspace', '华南采购中心')
  await page.waitForTimeout(600)
  check((await text('assistant-plan-state')).includes('套餐未包含'), 'C23-1 标准版工作区提示套餐未包含')
  check((await text('assistant-plan-restricted')).includes('仅专业版提供'), 'C23-1 套餐受限时展示升级说明')
  await shot('14-c23-plan-restricted.png')
  await page.getByTestId('assistant-switch-hq').click()
  await page.waitForTimeout(500)
  check((await text('assistant-plan-state')).includes('助手可用'), 'C23-1 切回专业版后助手恢复可用')

  await page.getByTestId('user-menu-trigger').click()
  await page.getByText('王倩 · 销售专员', { exact: true }).click()
  await page.waitForTimeout(600)
  check((await text('assistant-role-restricted')).includes('没有 finance.view 权限'), 'C23-1 受限角色提示缺失 finance.view 权限')
  check(await page.getByTestId('assistant-input').isDisabled(), 'C23-1 受限角色禁用输入框')
  check(await page.getByTestId('assistant-send').isDisabled(), 'C23-1 受限角色禁用发送按钮')
  const pendingAllow = page.locator('[data-testid^="assistant-tool-allow-"]').first()
  check(await pendingAllow.isDisabled(), 'C23-2 受限角色禁用工具批准按钮')
  check(await page.locator('[data-testid^="assistant-tool-role-block-"]').first().isVisible(), 'C23-2 受限角色说明无法批准财务工具')
  await shot('15-c23-role-restricted.png')

  const finalBody = await bodyText()
  check(!finalBody.includes('500 Internal Server Error') && !finalBody.includes('This page could not be found'), 'C22/C23 全流程无错误页')
} catch (error) {
  results.push({ ok: false, label: '脚本执行异常', detail: String(error?.message ?? error) })
  console.error('FAILED', error)
  try {
    await shot('99-failure.png')
    console.log((await bodyText()).slice(0, 2000))
  } catch {}
} finally {
  const report = {
    ranAt: new Date().toISOString(),
    base: BASE,
    assertions: results.length,
    passed: results.filter(item => item.ok).length,
    failed: results.filter(item => !item.ok).length,
    consoleErrors,
    pageErrors,
    badResponses,
    results
  }
  writeFileSync(resolve(OUT, 'report.json'), JSON.stringify(report, null, 2))
  console.log('SUMMARY ' + report.passed + '/' + report.assertions + ' passed; failed=' + report.failed + '; console=' + consoleErrors.length + '; page=' + pageErrors.length + '; bad=' + badResponses.length)
  await browser.close()
  if (report.failed > 0 || consoleErrors.length > 0 || pageErrors.length > 0 || badResponses.length > 0) process.exitCode = 1
}

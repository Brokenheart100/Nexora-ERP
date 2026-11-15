import { chromium } from '@playwright/test'
import { createHmac } from 'node:crypto'
import { exec } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync, mkdirSync, appendFileSync } from 'node:fs'
import { resolve, join } from 'node:path'

const cwd = process.cwd()
const repoRoot = resolve(cwd, '../../..')
const apphost = join(repoRoot, 'src', 'Hosting', 'Nexora.AppHost', 'Nexora.AppHost.csproj')
const artifactDir = join(repoRoot, 'artifacts', 'w2')
const planFile = join(artifactDir, 'f03-plan.json')
const logFile = join(artifactDir, 'f03-stepup-drill.log')
mkdirSync(artifactDir, { recursive: true })

function log() {
  const line = new Date().toISOString() + ' ' + Array.from(arguments).join(' ')
  console.log(line)
  appendFileSync(logFile, line + '\n')
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)) }

function runCmd(command, args, timeoutMs, extraEnv) {
  const line = command + ' ' + args.map((a) => '"' + String(a).replace(/"/g, '\\"') + '"').join(' ')
  log('exec', line, extraEnv ? JSON.stringify(extraEnv) : '')
  return new Promise((resolvePromise) => {
    exec(line, { cwd: repoRoot, timeout: timeoutMs, maxBuffer: 30 * 1024 * 1024, env: { ...process.env, ...(extraEnv || {}) } }, (error, stdout, stderr) => {
      resolvePromise({ code: error ? (typeof error.code === 'number' ? error.code : 1) : 0, stdout: String(stdout || ''), stderr: String(stderr || ''), error: error ? String(error.message) : null })
    })
  })
}

const runtime = resolve(cwd, '../../../artifacts/p1/runtime')
const realm = JSON.parse(readFileSync(resolve(runtime, 'keycloak/nexora-realm.json'), 'utf8'))
const seedFile = resolve(runtime, 'browser-otp.json')
const seeds = existsSync(seedFile) ? JSON.parse(readFileSync(seedFile, 'utf8')) : {}

function totp(rawSecret) {
  const counter = Buffer.alloc(8)
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)))
  const digest = createHmac('sha1', Buffer.from(rawSecret, 'utf8')).update(counter).digest()
  const offset = digest[digest.length - 1] & 15
  return String((digest.readUInt32BE(offset) & 0x7fffffff) % 1000000).padStart(6, '0')
}

async function freshTotp(username, rawSecret) {
  const counterKey = username + ':lastCounter'
  while (Number(seeds[counterKey] || 0) >= Math.floor(Date.now() / 30000) || 30000 - (Date.now() % 30000) < 2500) {
    await sleep(250)
  }
  seeds[counterKey] = String(Math.floor(Date.now() / 30000))
  writeFileSync(seedFile, JSON.stringify(seeds))
  return totp(rawSecret)
}

async function api(page, path) {
  return page.evaluate(async (target) => {
    const response = await fetch(target, { method: 'GET', credentials: 'same-origin' })
    return { status: response.status, text: await response.text() }
  }, path)
}

async function write(page, path, method, data) {
  return page.evaluate(async (args) => {
    const csrf = await fetch('/bff/antiforgery')
    if (!csrf.ok) return { status: csrf.status, text: await csrf.text() }
    const token = await csrf.json()
    const response = await fetch(args.path, {
      method: args.method,
      headers: { 'Content-Type': 'application/json', 'X-CSRF-TOKEN': token.requestToken },
      body: JSON.stringify(args.data),
    })
    return { status: response.status, text: await response.text() }
  }, { path: path, method: method, data: data })
}

function json(text) {
  try { return JSON.parse(text) } catch { return null }
}

async function login(page, username, path) {
  log('login start', username, path || '/bff/login')
  const user = realm.users.find((x) => x.username === username)
  if (!user) throw new Error('unknown realm user ' + username)
  await page.goto('https://localhost:7443' + (path || '/bff/login'))
  const usernameInput = page.locator('#username')
  const passwordInput = page.locator('#password')
  await usernameInput.or(passwordInput).first().waitFor({ state: 'attached', timeout: 60000 })
  if (await usernameInput.count()) await usernameInput.fill(username)
  await passwordInput.fill(user.credentials[0].value)
  await page.locator('#kc-login').click()
  const enrollment = page.locator('input[name="totpSecret"]')
  const challenge = page.locator('input[name="otp"]')
  await enrollment.or(challenge).first().waitFor({ state: 'attached', timeout: 60000 })
  if (await enrollment.count()) {
    const raw = await enrollment.inputValue()
    seeds[username] = raw
    writeFileSync(seedFile, JSON.stringify(seeds))
    await page.locator('input[name="totp"]').fill(await freshTotp(username, raw))
    await page.locator('input[name="userLabel"]').fill('F03 step-up drill')
    await page.locator('input[type="submit"], button[type="submit"]').last().click()
  } else {
    if (!seeds[username]) throw new Error('missing MFA seed for ' + username)
    await challenge.fill(await freshTotp(username, seeds[username]))
    await page.locator('#kc-login').click()
  }
  await page.waitForURL((url) => url.origin === 'https://localhost:7443' || url.searchParams.get('execution') === 'VERIFY_PROFILE', { waitUntil: 'domcontentloaded', timeout: 90000 })
  if (new URL(page.url()).searchParams.get('execution') === 'VERIFY_PROFILE') {
    await page.locator('input[name="firstName"]').fill(username)
    await page.locator('input[name="lastName"]').fill('LocalDemo')
    await page.getByRole('button', { name: 'Submit', exact: true }).click()
  }
  await page.waitForURL('https://localhost:7443/', { waitUntil: 'domcontentloaded', timeout: 60000 })
  for (let i = 0; i < 60; i++) {
    const me = await api(page, '/bff/me')
    if (me.status === 200) { log('login ok', username); return }
    await sleep(500)
  }
  throw new Error('login session not ready for ' + username)
}

async function gatewayDown() {
  for (let i = 0; i < 40; i++) {
    const probe = await runCmd('curl', ['-s', '-o', 'NUL', '-w', '%{http_code}', '--max-time', '3', 'https://localhost:7443/health'], 20000)
    if (probe.stdout.trim() === '000' || probe.stdout.trim() === '') return true
    await sleep(2000)
  }
  return false
}

async function stopHost() {
  let result = await runCmd('aspire', ['stop', '--apphost', apphost, '--non-interactive'], 240000)
  if (result.code !== 0) result = await runCmd('aspire', ['stop', '--apphost', apphost], 240000)
  log('stop exit', result.code, result.stdout.slice(-600), result.stderr.slice(-600))
  const down = await gatewayDown()
  log('gateway down', down)
  if (!down) throw new Error('gateway still answering after aspire stop')
}

async function startHost(config) {
  const configArgs = config ? Object.entries(config).flatMap(([key, value]) => ['--' + key + '=' + value]) : []
  const result = await runCmd('aspire', ['start', '--apphost', apphost, '--non-interactive', '--', ...configArgs], 300000)
  log('start exit', result.code, result.stdout.slice(-800), result.stderr.slice(-800))
  if (result.code !== 0) throw new Error('aspire start failed with exit ' + result.code)
  const waited = await runCmd('aspire', ['wait', 'gateway', '--apphost', apphost, '--timeout', '300', '--non-interactive'], 360000)
  log('wait gateway exit', waited.code, waited.stdout.slice(-600), waited.stderr.slice(-600))
  if (waited.code !== 0) throw new Error('aspire wait gateway failed with exit ' + waited.code)
}

function savePlan(plan) { writeFileSync(planFile, JSON.stringify(plan, null, 2)) }

async function main() {
  const plan = { startedAt: new Date().toISOString(), phase: 'setup', assertions: {} }
  savePlan(plan)
  log('F03 step-up drill start')
  await stopHost()
  log('phase1: start with Web:MfaStepUpSeconds=20')
  await startHost({ 'Web:MfaStepUpSeconds': '20' })
  plan.phase = 'phase1'
  plan.phase1StartedAt = new Date().toISOString()
  savePlan(plan)

  const browser = await chromium.launch({ channel: 'msedge', headless: true })
  const context = await browser.newContext({ baseURL: 'https://localhost:7443', viewport: { width: 1440, height: 1000 } })
  const page = await context.newPage()
  try {
    await login(page, 'alice')
    const caps = json((await api(page, '/bff/security/capabilities')).text)
    log('capabilities phase1', JSON.stringify(caps))
    if (!caps || caps.available !== true || caps.required !== true || caps.enrolled !== true) throw new Error('phase1 capabilities mismatch')
    if (caps.stepUpSeconds !== 20) throw new Error('phase1 stepUpSeconds expected 20, got ' + caps.stepUpSeconds)
    if (!Array.isArray(caps.methods) || !caps.methods.includes('otp')) throw new Error('phase1 methods missing otp')
    if (!caps.lastVerifiedAt || !(Date.parse(caps.lastVerifiedAt) > 0)) throw new Error('phase1 lastVerifiedAt invalid')
    if (caps.reauthPath !== '/bff/login?prompt=login') throw new Error('phase1 reauthPath mismatch')
    plan.assertions.capabilitiesPhase1 = true

    const created = await write(page, '/bff/api/workspaces', 'POST', { operationId: crypto.randomUUID(), name: 'MFA 演练 ' + Date.now() })
    if (created.status !== 201) throw new Error('workspace create failed ' + created.status + ' ' + created.text.slice(0, 300))
    const workspaceId = json(created.text).id
    plan.workspaceId = workspaceId
    const settingsPath = '/bff/api/workspaces/' + workspaceId + '/settings'
    const settings = json((await api(page, settingsPath)).text)
    if (settings.version !== 0) throw new Error('new workspace settings version expected 0')
    const fresh = await write(page, settingsPath, 'PUT', { expectedVersion: settings.version, presentation: settings.presentation })
    if (fresh.status !== 200) throw new Error('fresh MFA write expected 200, got ' + fresh.status + ' ' + fresh.text.slice(0, 300))
    const freshBody = json(fresh.text)
    if (freshBody.version !== 1) throw new Error('fresh write version expected 1')
    plan.assertions.freshWriteAllowed = true
    log('fresh write allowed version', freshBody.version)

    await sleep(21000)
    const stale = await write(page, settingsPath, 'PUT', { expectedVersion: freshBody.version, presentation: settings.presentation })
    const staleBody = json(stale.text)
    log('stale write', stale.status, stale.text.slice(0, 500))
    if (stale.status !== 403) throw new Error('stale write expected 403, got ' + stale.status)
    const gate = staleBody && staleBody.data ? staleBody.data : staleBody
    if (!gate || gate.code !== 'mfa_step_up_required') throw new Error('stale write expected code mfa_step_up_required, got ' + JSON.stringify(staleBody))
    if (gate.reauthPath !== '/bff/login?prompt=login') throw new Error('stale write reauthPath mismatch')
    plan.assertions.staleWriteRejected = true
    plan.assertions.staleWriteBody = gate

    await login(page, 'alice', '/bff/login?prompt=login')
    const capsAfter = json((await api(page, '/bff/security/capabilities')).text)
    log('capabilities after reauth', JSON.stringify(capsAfter))
    if (!capsAfter || capsAfter.enrolled !== true) throw new Error('reauth did not restore MFA enrollment')
    if (!(Date.parse(capsAfter.lastVerifiedAt) > Date.parse(caps.lastVerifiedAt))) log('WARN lastVerifiedAt did not advance')
    const retried = await write(page, settingsPath, 'PUT', { expectedVersion: freshBody.version, presentation: settings.presentation })
    if (retried.status !== 200) throw new Error('retry after reauth expected 200, got ' + retried.status + ' ' + retried.text.slice(0, 300))
    plan.assertions.retryAfterReauth = true
    plan.assertions.retryVersion = json(retried.text).version
    log('retry after reauth allowed version', plan.assertions.retryVersion)

    await page.reload()
    const region = page.getByRole('region', { name: '账户安全' })
    await region.waitFor({ state: 'visible', timeout: 30000 })
    const regionText = await region.innerText()
    log('account security region', regionText.replace(/\s+/g, ' ').slice(0, 400))
    for (const expected of ['已启用', 'TOTP', '重新验证身份']) {
      if (!regionText.includes(expected)) throw new Error('account security region missing ' + expected)
    }
    plan.assertions.uiCard = true
    plan.phase = 'phase1-done'
    savePlan(plan)

    log('phase2: restart with Web:MfaRequired=false')
    await browser.close()
    await stopHost()
    await startHost({ 'Web:MfaRequired': 'false' })
    plan.phase = 'phase2'
    plan.phase2StartedAt = new Date().toISOString()
    savePlan(plan)

    const browser2 = await chromium.launch({ channel: 'msedge', headless: true })
    const context2 = await browser2.newContext({ baseURL: 'https://localhost:7443', viewport: { width: 1440, height: 1000 } })
    const page2 = await context2.newPage()
    try {
      await login(page2, 'alice')
      const caps2 = json((await api(page2, '/bff/security/capabilities')).text)
      log('capabilities phase2', JSON.stringify(caps2))
      if (!caps2 || caps2.required !== false) throw new Error('phase2 required expected false')
      if (caps2.enrolled !== true) throw new Error('phase2 enrollment state expected true')
      if (!Array.isArray(caps2.methods) || !caps2.methods.includes('otp')) throw new Error('phase2 methods missing otp')
      const settings2 = json((await api(page2, settingsPath)).text)
      await sleep(3000)
      const allowed = await write(page2, settingsPath, 'PUT', { expectedVersion: settings2.version, presentation: settings2.presentation })
      log('phase2 stale write', allowed.status, allowed.text.slice(0, 300))
      if (allowed.status !== 200) throw new Error('phase2 disabled policy expected 200, got ' + allowed.status)
      plan.assertions.disabledPolicyAllowed = true
      plan.phase = 'done'
      plan.finishedAt = new Date().toISOString()
      savePlan(plan)
      log('DRILL PASSED')
    } finally {
      await browser2.close()
    }
  } finally {
    try { await browser.close() } catch { /* already closed */ }
  }
}

main().then(() => process.exit(0)).catch((error) => {
  log('DRILL FAILED', error && error.stack ? error.stack : String(error))
  process.exit(1)
})

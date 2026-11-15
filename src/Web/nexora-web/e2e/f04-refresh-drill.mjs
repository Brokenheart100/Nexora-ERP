// F04 令牌刷新演练：登录后等待访问令牌过期（Keycloak accessTokenLifespan=300s），
// 验证 BFF 使用刷新令牌续期并让 /bff/me 与代理 API 继续可用。
import { chromium } from '@playwright/test'
import { createHmac } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const baseURL = 'https://localhost:7443'
const runtime = resolve('../../../artifacts/p1/runtime')
const realm = JSON.parse(readFileSync(resolve(runtime, 'keycloak/nexora-realm.json'), 'utf8'))
const seedFile = resolve(runtime, 'browser-otp.json')
const seeds = existsSync(seedFile) ? JSON.parse(readFileSync(seedFile, 'utf8')) : {}

function totp(rawSecret) {
  const counter = Buffer.alloc(8)
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000)))
  const digest = createHmac('sha1', Buffer.from(rawSecret, 'utf8')).update(counter).digest()
  const offset = digest[digest.length - 1] & 15
  return String((digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, '0')
}
async function freshTotp(username, rawSecret) {
  const counterKey = username + ':lastCounter'
  while (Number(seeds[counterKey] ?? 0) >= Math.floor(Date.now() / 30_000) || 30_000 - Date.now() % 30_000 < 2500)
    await new Promise(r => setTimeout(r, 250))
  seeds[counterKey] = String(Math.floor(Date.now() / 30_000))
  writeFileSync(seedFile, JSON.stringify(seeds))
  return totp(rawSecret)
}
async function api(page, path) {
  return page.evaluate(async (path) => {
    const response = await fetch(path, { credentials: 'same-origin' })
    return { status: response.status, text: await response.text() }
  }, path)
}
const sleep = ms => new Promise(r => setTimeout(r, ms))
const log = (message) => console.log(new Date().toISOString() + ' ' + message)

const browser = await chromium.launch({ channel: 'msedge', headless: true })
const context = await browser.newContext({ baseURL, ignoreHTTPSErrors: true })
const page = await context.newPage()
let failed = false
try {
  const user = realm.users.find(x => x.username === 'alice')
  if (!user) throw new Error('alice missing from realm')
  await page.goto('/bff/login')
  await page.locator('#username').fill('alice')
  await page.locator('#password').fill(user.credentials[0].value)
  await page.locator('#kc-login').click()
  const enrollment = page.locator('input[name="totpSecret"]')
  const challenge = page.locator('input[name="otp"]')
  await enrollment.or(challenge).first().waitFor({ timeout: 30000 })
  if (await enrollment.count()) {
    const raw = await enrollment.inputValue()
    seeds['alice'] = raw
    writeFileSync(seedFile, JSON.stringify(seeds))
    await page.locator('input[name="totp"]').fill(await freshTotp('alice', raw))
    await page.locator('input[name="userLabel"]').fill('F04 refresh drill')
    await page.locator('input[type="submit"], button[type="submit"]').last().click()
  } else {
    if (!seeds['alice']) throw new Error('alice MFA seed unavailable')
    await challenge.fill(await freshTotp('alice', seeds['alice']))
    await page.locator('#kc-login').click()
  }
  await page.waitForURL(url => url.origin === baseURL && url.pathname === '/', { waitUntil: 'domcontentloaded', timeout: 60000 })
  const loginAt = Date.now()
  const before = await api(page, '/bff/me')
  log('login complete; /bff/me=' + before.status)
  if (before.status !== 200) throw new Error('login did not establish session')

  const waitMs = 330_000
  log('waiting ' + Math.round(waitMs / 1000) + 's for access token expiry (lifespan 300s)')
  for (let elapsed = 60_000; elapsed <= waitMs; elapsed += 60_000) {
    await sleep(60_000)
    log('elapsed ' + Math.round((Date.now() - loginAt) / 1000) + 's')
  }
  const me = await api(page, '/bff/me')
  log('after expiry /bff/me=' + me.status)
  const workspaces = await api(page, '/bff/api/workspaces')
  log('after expiry /bff/api/workspaces=' + workspaces.status)
  const sessions = await api(page, '/bff/sessions')
  const parsed = sessions.status === 200 ? JSON.parse(sessions.text) : { sessions: [] }
  log('after expiry /bff/sessions=' + sessions.status + ' count=' + (parsed.sessions?.length ?? 0))
  if (me.status !== 200 || workspaces.status !== 200 || sessions.status !== 200) {
    failed = true
    throw new Error('session did not survive access token expiry')
  }
  log('PASS session refreshed after access token expiry')
} catch (error) {
  failed = true
  log('FAIL ' + (error instanceof Error ? error.message : String(error)))
} finally {
  await browser.close()
}
process.exit(failed ? 1 : 0)

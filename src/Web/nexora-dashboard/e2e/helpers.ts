import { createHmac } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, type Page } from '@playwright/test'

export const repository = resolve(import.meta.dirname, '../../../..')
export const runtime = resolve(repository, 'artifacts/p1/runtime')
export const baseline = JSON.parse(readFileSync(resolve(repository, 'artifacts/dashboard-d0/workspace.json'), 'utf8'))
export const origin = 'https://localhost:7444'

async function nextOtp(username: string) {
  const path = resolve(runtime, 'browser-otp.json')
  while (true) {
    const seeds = JSON.parse(readFileSync(path, 'utf8'))
    const counter = Math.floor(Date.now() / 30_000)
    if (Number(seeds[`${username}:lastCounter`] ?? 0) < counter && 30_000 - Date.now() % 30_000 > 2500) {
      seeds[`${username}:lastCounter`] = String(counter)
      writeFileSync(path, JSON.stringify(seeds))
      const bytes = Buffer.alloc(8)
      bytes.writeBigUInt64BE(BigInt(counter))
      const digest = createHmac('sha1', Buffer.from(seeds[username], 'utf8')).update(bytes).digest()
      return String((digest.readUInt32BE(digest.at(-1)! & 15) & 0x7fffffff) % 1_000_000).padStart(6, '0')
    }
    await new Promise(resolve => setTimeout(resolve, 250))
  }
}

export async function login(page: Page, username = 'alice') {
  const realm = JSON.parse(readFileSync(resolve(runtime, 'keycloak/nexora-realm.json'), 'utf8'))
  const user = realm.users.find((item: { username: string }) => item.username === username)
  await page.goto('/bff/login?prompt=login')
  await page.locator('#password').waitFor()
  if (await page.locator('#username').count()) await page.locator('#username').fill(username)
  await page.locator('#password').fill(user.credentials[0].value)
  await page.locator('#kc-login').click()
  await expect(page.locator('input[name="otp"]')).toBeVisible()
  await page.locator('input[name="otp"]').fill(await nextOtp(username))
  await page.locator('#kc-login').click()
  await page.waitForURL(url => url.origin === origin && url.pathname === '/', { waitUntil: 'domcontentloaded' })
  const identity = await api(page, '/bff/me')
  expect(identity.status, identity.text).toBe(200)
  expect(JSON.parse(identity.text).name).toBe(username)
}

export async function emailLogin(page: Page, email: string, register = false, join = false) {
  if (!email.endsWith('@example.invalid')) throw new Error('Only local captured mail is permitted')
  const mailboxUrl = 'http://localhost:8025/api/v1/search?query=' + encodeURIComponent('to:' + email)
  const previous = await (await fetch(mailboxUrl)).json()
  const latest = Math.max(0, ...(previous.messages ?? []).map((mail: { Created: string }) => Date.parse(mail.Created)))
  const cooldown = latest + 61_000 - Date.now()
  if (cooldown > 0) await new Promise(resolve => setTimeout(resolve, cooldown))
  await page.goto((register ? '/bff/register' : '/bff/email-login') + (join ? '?join=true' : ''))
  const form = page.locator('#otp-form')
  await form.getByLabel('邮箱', { exact: true }).fill(email)
  const sentAt = Date.now() - 1000
  await form.getByRole('button', { name: '发送验证码', exact: true }).click()
  let code = ''
  await expect.poll(async () => {
    const inbox = await (await fetch(mailboxUrl)).json()
    for (const mail of inbox.messages ?? []) {
      if (Date.parse(mail.Created) < sentAt) continue
      const detail = await (await fetch('http://localhost:8025/api/v1/message/' + mail.ID)).json()
      code = /\bCode:\s*(\d{6})\b/.exec([detail.Text, detail.HTML].join('\n'))?.[1] ?? ''
      if (code) return true
    }
    return false
  }, { timeout: 35_000 }).toBe(true)
  await form.getByLabel('六位验证码').fill(code)
  await form.getByRole('button', { name: '验证', exact: true }).click()
  try {
    await page.waitForURL(url => url.origin === origin && url.pathname === (join ? '/join' : '/'), { waitUntil: 'domcontentloaded' })
  } catch {
    throw new Error('Email flow ended at ' + new URL(page.url()).origin + new URL(page.url()).pathname + '; expected ' + (join ? '/join' : '/'))
  }
}

export async function api(page: Page, path: string, method = 'GET', data?: unknown, headers?: Record<string, string>) {
  return page.evaluate(async ({ path, method, data, headers }) => {
    const response = await fetch(path, { method, credentials: 'same-origin',
      headers: { ...(data ? { 'Content-Type': 'application/json' } : {}), ...headers },
      body: data ? JSON.stringify(data) : undefined })
    return { status: response.status, text: await response.text(), headers: Object.fromEntries(response.headers) }
  }, { path, method, data, headers })
}

export async function write(page: Page, path: string, method: 'POST' | 'PUT', data: object, headers?: Record<string, string>) {
  const csrf = await api(page, '/bff/antiforgery')
  expect(csrf.status).toBe(200)
  return api(page, path, method, data, { 'X-CSRF-TOKEN': JSON.parse(csrf.text).requestToken, ...headers })
}

// BFF verification is independent of the prototype's simulated identity menu.
export async function logout(page: Page) {
  const csrf = await api(page, '/bff/antiforgery')
  expect(csrf.status).toBe(200)
  const returned = page.waitForEvent('framenavigated', {
    predicate: frame => frame === page.mainFrame() && frame.url() === origin + '/'
  })
  await page.evaluate((token) => {
    const form = document.createElement('form')
    form.method = 'POST'
    form.action = '/bff/logout'
    const field = document.createElement('input')
    field.type = 'hidden'
    field.name = '__RequestVerificationToken'
    field.value = token
    form.appendChild(field)
    document.body.appendChild(form)
    form.submit()
  }, JSON.parse(csrf.text).requestToken)
  await returned
  await page.waitForLoadState('domcontentloaded')
  expect((await api(page, '/bff/me')).status).toBe(401)
}

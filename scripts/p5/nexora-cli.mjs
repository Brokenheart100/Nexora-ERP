#!/usr/bin/env node
// Nexora CLI: device authorization login, scoped read-only API calls and token revocation (F39).
import { createHash, randomBytes } from 'node:crypto'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

const base = (process.env.NEXORA_CLI_BASE || 'https://localhost:7443').replace(/\/$/, '')
const home = process.env.NEXORA_CLI_HOME || join(homedir(), '.nexora-cli')
const tokenFile = join(home, 'tokens.json')
const argv = process.argv.slice(2)
const command = argv[0] || 'help'
const options = new Map()
for (let index = 1; index < argv.length; index++) {
  if (!argv[index].startsWith('--')) continue
  const key = argv[index].slice(2)
  const next = argv[index + 1]
  if (next !== undefined && !next.startsWith('--')) { options.set(key, next); index++ }
  else options.set(key, 'true')
}

function emit(value) {
  process.stdout.write(JSON.stringify(value) + '\n')
}

async function request(path, init = {}) {
  const response = await fetch(base + path, {
    ...init,
    headers: { accept: 'application/json', ...(init.headers || {}) },
  })
  const text = await response.text()
  let body = null
  if (text) {
    try { body = JSON.parse(text) }
    catch { body = text }
  }
  return { status: response.status, body }
}

async function settings(flow = 'cli') {
  const result = await request('/bff/auth/' + flow)
  if (result.status !== 200) throw new Error('CLI authorization is unavailable: HTTP ' + result.status)
  return result.body
}

function loadTokens() {
  try { return JSON.parse(readFileSync(tokenFile, 'utf8')) }
  catch { return null }
}

function saveTokens(tokens) {
  mkdirSync(dirname(tokenFile), { recursive: true, mode: 0o700 })
  writeFileSync(tokenFile, JSON.stringify(tokens, null, 2) + '\n', { mode: 0o600 })
}

async function login() {
  const flow = options.get('client') === 'mcp' ? 'mcp' : 'cli'
  const config = await settings(flow)
  const verifier = randomBytes(48).toString('base64url')
  const challenge = createHash('sha256').update(verifier).digest('base64url')
  const start = await request(config.deviceEndpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ codeChallenge: challenge }),
  })
  if (start.status !== 200) throw new Error('Device authorization failed: ' + JSON.stringify(start.body))
  const grant = start.body
  emit({
    event: 'authorization_required',
    userCode: grant.userCode,
    verificationUrl: grant.verificationUrl,
    expiresIn: grant.expiresIn,
    interval: grant.interval,
  })
  const deadline = Date.now() + grant.expiresIn * 1000
  while (Date.now() < deadline) {
    await new Promise(done => setTimeout(done, grant.interval * 1000))
    const token = await request(config.tokenEndpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ deviceCode: grant.deviceCode, codeVerifier: verifier }),
    })
    if (token.status === 200 && token.body && token.body.access_token) {
      const expiresAt = Date.now() + (token.body.expires_in || 300) * 1000
      saveTokens({
        base,
        flow,
        accessToken: token.body.access_token,
        refreshToken: token.body.refresh_token,
        expiresAt,
        scope: token.body.scope,
      })
      emit({ event: 'authorized', client: flow, scope: token.body.scope, expiresAt: new Date(expiresAt).toISOString() })
      return
    }
    const error = token.body && token.body.error
    if (error === 'authorization_pending' || error === 'slow_down') continue
    if (error === 'access_denied') { emit({ event: 'denied' }); process.exitCode = 2; return }
    if (error === 'expired_token') { emit({ event: 'expired' }); process.exitCode = 3; return }
    throw new Error('Token request failed: ' + JSON.stringify(token.body))
  }
  emit({ event: 'expired' })
  process.exitCode = 3
}

async function call() {
  const path = options.get('path')
  if (!path) throw new Error('--path is required')
  const method = (options.get('method') || 'GET').toUpperCase()
  const payload = options.get('body')
  const stored = loadTokens()
  const token = options.get('token') || (stored && stored.accessToken)
  if (!token) throw new Error('Run nexora-cli login first.')
  const result = await request(path, {
    method,
    headers: { authorization: 'Bearer ' + token, ...(payload !== undefined ? { 'content-type': 'application/json' } : {}) },
    ...(payload !== undefined ? { body: payload } : {}),
  })
  emit({ event: 'call', status: result.status, body: result.body })
  if (result.status >= 400) process.exitCode = 4
}

async function logout() {
  const stored = loadTokens()
  if (!stored) { emit({ event: 'logged_out' }); return }
  const config = await settings(stored.flow === 'mcp' ? 'mcp' : 'cli')
  for (const [token, hint] of [[stored.refreshToken, 'refresh_token'], [stored.accessToken, 'access_token']]) {
    if (!token) continue
    await request(config.revokeEndpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token, tokenTypeHint: hint }),
    })
  }
  rmSync(tokenFile, { force: true })
  emit({ event: 'logged_out' })
}

try {
  if (command === 'login') await login()
  else if (command === 'call') await call()
  else if (command === 'logout') await logout()
  else if (command === 'help') {
    process.stdout.write('nexora-cli login [--client mcp] | call --path <path> [--method GET] [--body <json>] | logout\n')
  }
  else { emit({ event: 'error', message: 'Unknown command: ' + command }); process.exitCode = 1 }
}
catch (error) {
  emit({ event: 'error', message: error instanceof Error ? error.message : String(error) })
  process.exitCode = 1
}

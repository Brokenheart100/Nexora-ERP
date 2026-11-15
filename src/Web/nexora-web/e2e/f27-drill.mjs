import { chromium } from '@playwright/test'
import { createHmac } from 'node:crypto'
import { exec } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync, mkdirSync, appendFileSync } from 'node:fs'
import { resolve, join } from 'node:path'

const cwd = process.cwd()
const repoRoot = resolve(cwd, '../../..')
const apphost = join(repoRoot, 'src', 'Hosting', 'Nexora.AppHost', 'Nexora.AppHost.csproj')
const artifactDir = join(repoRoot, 'artifacts', 'w1')
const planFile = join(artifactDir, 'f27-plan.json')
const logFile = join(artifactDir, 'f27-drill.log')
mkdirSync(artifactDir, { recursive: true })

function log() {
  const line = new Date().toISOString() + ' ' + Array.from(arguments).join(' ')
  console.log(line)
  appendFileSync(logFile, line + '\n')
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)) }

function runCmd(command, args, timeoutMs) {
  const line = command + ' ' + args.map((a) => '"' + String(a).replace(/"/g, '\\"') + '"').join(' ')
  log('exec', line)
  return new Promise((resolvePromise) => {
    exec(line, { cwd: repoRoot, timeout: timeoutMs, maxBuffer: 30 * 1024 * 1024 }, (error, stdout, stderr) => {
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

async function api(page, path, method, data) {
  return page.evaluate(async (args) => {
    const init = { method: args.method, credentials: 'same-origin' }
    if (args.data !== undefined) {
      init.headers = { 'Content-Type': 'application/json' }
      init.body = JSON.stringify(args.data)
    }
    const response = await fetch(args.path, init)
    return { status: response.status, text: await response.text() }
  }, { path: path, method: method || 'GET', data: data })
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

async function login(page, username) {
  log('login start', username)
  const user = realm.users.find((x) => x.username === username)
  if (!user) throw new Error('unknown realm user ' + username)
  await page.goto('https://localhost:7443/bff/login')
  await page.locator('#username').fill(username)
  await page.locator('#password').fill(user.credentials[0].value)
  await page.locator('#kc-login').click()
  const enrollment = page.locator('input[name="totpSecret"]')
  const challenge = page.locator('input[name="otp"]')
  await enrollment.or(challenge).first().waitFor({ state: 'attached', timeout: 60000 })
  if (await enrollment.count()) {
    const raw = await enrollment.inputValue()
    seeds[username] = raw
    writeFileSync(seedFile, JSON.stringify(seeds))
    await page.locator('input[name="totp"]').fill(await freshTotp(username, raw))
    await page.locator('input[name="userLabel"]').fill('F27 downtime drill')
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
    if (me.status === 200) {
      log('login ok', username)
      return
    }
    await sleep(500)
  }
  throw new Error('login session not ready for ' + username)
}

const zones = [
  'Pacific/Kiritimati', 'Pacific/Auckland', 'Pacific/Chatham', 'Australia/Lord_Howe', 'Australia/Sydney',
  'Australia/Adelaide', 'Australia/Eucla', 'Asia/Tokyo', 'Asia/Seoul', 'Asia/Shanghai', 'Asia/Manila',
  'Asia/Singapore', 'Asia/Bangkok', 'Asia/Yangon', 'Asia/Dhaka', 'Asia/Kathmandu', 'Asia/Kolkata',
  'Asia/Karachi', 'Asia/Kabul', 'Asia/Tehran', 'Asia/Dubai', 'Europe/Moscow', 'Africa/Nairobi',
  'Europe/Berlin', 'Europe/London', 'Atlantic/Azores', 'America/Sao_Paulo', 'America/St_Johns',
  'America/Halifax', 'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
  'America/Anchorage', 'Pacific/Honolulu', 'Pacific/Midway', 'Pacific/Pago_Pago',
]

function localParts(zone, now) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  })
  const parts = fmt.formatToParts(now)
  const get = (type) => Number(parts.find((p) => p.type === type).value)
  return { y: get('year'), m: get('month'), d: get('day'), h: get('hour'), mi: get('minute') }
}

function pickZone() {
  const now = Date.now()
  const rows = []
  for (const zone of zones) {
    try {
      const p = localParts(zone, new Date(now))
      const localMs = Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi)
      const offsetMs = localMs - now
      const dueMs = Date.UTC(p.y, p.m - 1, p.d, 9, 0) - offsetMs
      const dueIn = (dueMs - now) / 60000
      rows.push({
        zone: zone,
        date: String(p.y) + '-' + String(p.m).padStart(2, '0') + '-' + String(p.d).padStart(2, '0'),
        localTime: String(p.h).padStart(2, '0') + ':' + String(p.mi).padStart(2, '0'),
        dueIn: dueIn,
        dueMs: dueMs,
      })
    } catch (error) {
      log('zone skipped', zone, String(error))
    }
  }
  const preferred = rows.filter((r) => r.dueIn >= 12 && r.dueIn <= 40).sort((a, b) => Math.abs(a.dueIn - 22) - Math.abs(b.dueIn - 22))
  if (preferred.length) return preferred[0]
  const fallback = rows.filter((r) => r.dueIn >= 4 && r.dueIn <= 90).sort((a, b) => Math.abs(a.dueIn - 20) - Math.abs(b.dueIn - 20))
  if (fallback.length) {
    log('WARNING fallback zone window', JSON.stringify(fallback[0]))
    return fallback[0]
  }
  throw new Error('no timezone yields a 09:00 local due inside the next 4-90 minutes')
}

function savePlan(plan) {
  writeFileSync(planFile, JSON.stringify(plan, null, 2))
}

function loadPlan() {
  if (!existsSync(planFile)) throw new Error('missing plan file ' + planFile)
  return JSON.parse(readFileSync(planFile, 'utf8'))
}

async function prep() {
  const browser = await chromium.launch({ channel: 'msedge', headless: true })
  const context = await browser.newContext({ baseURL: 'https://localhost:7443', viewport: { width: 1440, height: 1000 } })
  const page = await context.newPage()
  try {
    await login(page, 'alice')
    const wsRes = await api(page, '/bff/api/workspaces')
    if (wsRes.status !== 200) throw new Error('workspaces status ' + wsRes.status)
    const parsed = JSON.parse(wsRes.text)
    const workspaces = Array.isArray(parsed) ? parsed : (parsed.items || [])
    log('workspaces', workspaces.length)
    const preferred = workspaces.filter((w) => String(w.name).indexOf('销售闭环验收') === 0)
    preferred.sort((a, b) => String(b.name).localeCompare(String(a.name)))
    const candidates = preferred.concat(workspaces.filter((w) => preferred.indexOf(w) === -1))
    let chosen = null
    for (let index = 0; index < candidates.length && index < 16; index++) {
      const w = candidates[index]
      const org = '/bff/api/workspaces/' + w.id
      const finance = '/bff/api/finance/workspaces/' + w.id
      const master = '/bff/api/masterdata/workspaces/' + w.id
      const ar = finance + '/receivables'
      const settingsRes = await api(page, org + '/settings')
      if (settingsRes.status !== 200) { log('skip settings', w.id, settingsRes.status); continue }
      const settings = JSON.parse(settingsRes.text)
      if (!settings.canManage) { log('skip not manage', w.id); continue }
      const bookRes = await api(page, finance + '/book')
      if (bookRes.status !== 200) { log('skip book', w.id, bookRes.status); continue }
      const partnersRes = await api(page, master + '/partners')
      if (partnersRes.status !== 200) { log('skip partners', w.id, partnersRes.status); continue }
      const partnersParsed = JSON.parse(partnersRes.text)
      const partnerItems = Array.isArray(partnersParsed) ? partnersParsed : (partnersParsed.items || [])
      const customer = partnerItems.find((p) => p.isActive !== false && p.roles && p.roles.indexOf('customer') >= 0)
      if (!customer) { log('skip no customer', w.id); continue }
      const catalogRes = await api(page, master + '/catalog')
      if (catalogRes.status !== 200) { log('skip catalog', w.id, catalogRes.status); continue }
      const catalogParsed = JSON.parse(catalogRes.text)
      const catalogItems = catalogParsed.page && catalogParsed.page.items ? catalogParsed.page.items : (Array.isArray(catalogParsed) ? catalogParsed : (catalogParsed.items || []))
      const service = catalogItems.find((i) => i.isActive !== false && i.kind === 'service')
      if (!service) { log('skip no service', w.id); continue }
      const schedulesRes = await api(page, ar + '/schedules')
      if (schedulesRes.status !== 200) { log('skip schedules', w.id, schedulesRes.status); continue }
      const picked = pickZone()
      log('candidate', w.id, w.name, 'zone', picked.zone, 'local', picked.localTime, 'dueInMin', Math.round(picked.dueIn), 'nextOn', picked.date)
      const putSettings = await write(page, org + '/settings', 'PUT', {
        expectedVersion: settings.version,
        presentation: Object.assign({}, settings.presentation, { timeZone: picked.zone }),
      })
      if (putSettings.status !== 200) {
        log('settings put failed', w.id, putSettings.status, putSettings.text.slice(0, 400))
        continue
      }
      const created = await write(page, ar + '/schedules', 'POST', {
        operationId: crypto.randomUUID(),
        expectedVersion: 0,
        input: {
          customerId: customer.id, serviceId: service.id, quantity: '1', unitPrice: '50',
          nextOn: picked.date, endsOn: picked.date, intervalMonths: 1, dueDays: 15,
        },
      })
      if (created.status !== 200) {
        log('schedule create failed', w.id, created.status, created.text.slice(0, 500))
        await write(page, org + '/settings', 'PUT', { expectedVersion: settings.version + 1, presentation: settings.presentation })
        continue
      }
      const schedule = JSON.parse(created.text)
      chosen = {
        phase: 'prepared',
        preparedAt: new Date().toISOString(),
        workspaceId: w.id,
        workspaceName: w.name,
        customerId: customer.id,
        customerName: customer.profile && customer.profile.name ? customer.profile.name : customer.name,
        serviceId: service.id,
        scheduleId: schedule.id,
        scheduleVersion: schedule.version,
        zone: picked.zone,
        nextOn: picked.date,
        dueUtc: new Date(picked.dueMs).toISOString(),
        dueInMinutes: Math.round(picked.dueIn),
        settingsVersion: settings.version + 1,
      }
      break
    }
    if (!chosen) throw new Error('no candidate workspace satisfied the prerequisites')
    const occRes = await api(page, '/bff/api/finance/workspaces/' + chosen.workspaceId + '/receivables/schedules/' + chosen.scheduleId + '/occurrences')
    chosen.occurrencesBeforeStop = occRes.status === 200 ? JSON.parse(occRes.text).length : ('status ' + occRes.status)
    chosen.scheduleList = JSON.parse((await api(page, '/bff/api/finance/workspaces/' + chosen.workspaceId + '/receivables/schedules')).text)
      .filter((x) => x.id === chosen.scheduleId)
      .map((x) => ({ id: x.id, version: x.version, nextOn: x.nextOn, preview: x.preview, paused: x.paused }))
    savePlan(chosen)
    log('PREPARED ' + JSON.stringify(chosen))
  } finally {
    await browser.close()
  }
}

async function stop() {
  const plan = loadPlan()
  let result = await runCmd('aspire', ['stop', '--apphost', apphost, '--non-interactive'], 240000)
  if (result.code !== 0) {
    log('stop retry without non-interactive', result.code, result.stderr.slice(-600))
    result = await runCmd('aspire', ['stop', '--apphost', apphost], 240000)
  }
  log('stop exit', result.code, 'stdout', result.stdout.slice(-1000), 'stderr', result.stderr.slice(-1000))
  plan.stopAt = new Date().toISOString()
  plan.stopExitCode = result.code
  plan.stopStdout = result.stdout.slice(-2000)
  plan.phase = 'stopped'
  savePlan(plan)
  if (result.code !== 0) throw new Error('aspire stop failed with exit ' + result.code)
  let down = false
  for (let i = 0; i < 40; i++) {
    const probe = await runCmd('curl', ['-s', '-o', 'NUL', '-w', '%{http_code}', '--max-time', '3', 'https://localhost:7443/health'], 20000)
    if (probe.stdout.trim() === '000' || probe.stdout.trim() === '') { down = true; break }
    await sleep(2000)
  }
  log('gateway down confirmed', down)
  plan.gatewayDownConfirmed = down
  savePlan(plan)
  if (!down) throw new Error('gateway still answering after aspire stop')
}

async function waitDue() {
  const plan = loadPlan()
  const target = Date.parse(plan.dueUtc) + 90000
  log('waiting until due+90s', new Date(target).toISOString())
  while (Date.now() < target) {
    log('wait remaining seconds', Math.round((target - Date.now()) / 1000))
    await sleep(Math.min(15000, Math.max(1000, target - Date.now())))
  }
  plan.duePassedAt = new Date().toISOString()
  plan.phase = 'duePassed'
  savePlan(plan)
  log('DUE PASSED while host stopped')
}

async function start() {
  const plan = loadPlan()
  const t0 = new Date()
  let result = await runCmd('aspire', ['start', '--apphost', apphost, '--non-interactive'], 300000)
  log('start exit', result.code, 'stdout', result.stdout.slice(-1200), 'stderr', result.stderr.slice(-1000))
  if (result.code !== 0) throw new Error('aspire start failed with exit ' + result.code)
  result = await runCmd('aspire', ['wait', 'gateway', '--apphost', apphost, '--timeout', '300', '--non-interactive'], 360000)
  log('wait gateway exit', result.code, 'stdout', result.stdout.slice(-1000), 'stderr', result.stderr.slice(-1000))
  plan.startAt = t0.toISOString()
  plan.gatewayReadyAt = new Date().toISOString()
  plan.startExitCode = result.code
  plan.phase = 'started'
  savePlan(plan)
  if (result.code !== 0) throw new Error('aspire wait gateway failed with exit ' + result.code)
}

async function verify() {
  const plan = loadPlan()
  const browser = await chromium.launch({ channel: 'msedge', headless: true })
  const context = await browser.newContext({ baseURL: 'https://localhost:7443', viewport: { width: 1440, height: 1000 } })
  const page = await context.newPage()
  try {
    let loggedIn = false
    for (let attempt = 1; attempt <= 6 && !loggedIn; attempt++) {
      try {
        await login(page, 'alice')
        loggedIn = true
      } catch (error) {
        log('login attempt failed', attempt, String(error && error.message ? error.message : error))
        await sleep(10000)
        try { await page.goto('https://localhost:7443/bff/login') } catch { /* re-login retry */ }
      }
    }
    if (!loggedIn) throw new Error('re-login after restart failed')
    const finance = '/bff/api/finance/workspaces/' + plan.workspaceId
    const ar = finance + '/receivables'
    let financeReady = false
    for (let i = 0; i < 80; i++) {
      const book = await api(page, finance + '/book')
      if (book.status === 200) { financeReady = true; break }
      await sleep(3000)
    }
    if (!financeReady) throw new Error('finance service did not become ready')
    log('finance ready at', new Date().toISOString())
    const occPath = ar + '/schedules/' + plan.scheduleId + '/occurrences'
    let occurrences = []
    const deadline = Date.now() + 180000
    while (Date.now() < deadline) {
      const res = await api(page, occPath)
      if (res.status === 200) {
        occurrences = JSON.parse(res.text)
        if (occurrences.length >= 1) break
      } else {
        log('occurrences status', res.status, res.text.slice(0, 200))
      }
      await sleep(5000)
    }
    log('occurrences', JSON.stringify(occurrences))
    if (occurrences.length !== 1) throw new Error('expected exactly 1 occurrence after recovery, got ' + occurrences.length)
    const occurrence = occurrences[0]
    if (occurrence.on !== plan.nextOn) throw new Error('occurrence on mismatch: ' + occurrence.on + ' vs ' + plan.nextOn)
    if (Date.parse(occurrence.createdAtUtc) < Date.parse(plan.stopAt)) {
      throw new Error('occurrence created before host stop: ' + occurrence.createdAtUtc + ' < ' + plan.stopAt)
    }
    const expectedNumber = 'R-' + plan.scheduleId.replace(/-/g, '') + '-' + plan.nextOn.replace(/-/g, '')
    async function findInvoice(targetId, targetNumber) {
      const found = []
      for (let pageNo = 1; pageNo <= 10; pageNo++) {
        const res = await api(page, ar + '/documents?page=' + pageNo)
        if (res.status !== 200) throw new Error('documents status ' + res.status + ' page ' + pageNo)
        const parsed = JSON.parse(res.text)
        const rows = Array.isArray(parsed) ? parsed : (parsed.items || [])
        for (const row of rows) {
          if (String(row.id) === targetId || String(row.terms && row.terms.number) === targetNumber) found.push(row)
        }
        if (rows.length < 50) break
      }
      return found
    }
    const audit = ['tenantId', 'workspaceId', 'scheduleId', 'on', 'templateVersion', 'documentId', 'createdAtUtc']
    const missing = audit.filter((key) => occurrence[key] === undefined || occurrence[key] === null)
    if (missing.length) throw new Error('occurrence audit fields missing: ' + missing.join(','))
    const mine = await findInvoice(String(occurrence.documentId), expectedNumber)
    log('expected number', expectedNumber, 'documentId', occurrence.documentId, 'matching docs', JSON.stringify(mine.map((d) => ({ id: d.id, number: d.terms && d.terms.number, state: d.state, total: d.terms && d.terms.total }))))
    if (mine.length !== 1) throw new Error('expected exactly 1 recovered invoice, got ' + mine.length)
    const invoice = mine[0]
    if (String(invoice.terms && invoice.terms.number) !== expectedNumber) throw new Error('invoice number mismatch: ' + (invoice.terms && invoice.terms.number) + ' vs ' + expectedNumber)
    if (String(invoice.state) !== 'submitted') throw new Error('recovered invoice state ' + invoice.state)
    if (Number(invoice.terms && invoice.terms.total) !== 56.5) throw new Error('recovered invoice total ' + (invoice.terms && invoice.terms.total))
    await sleep(60000)
    const again = JSON.parse((await api(page, occPath)).text)
    const againMine = await findInvoice(String(occurrence.documentId), expectedNumber)
    if (again.length !== 1 || againMine.length !== 1) {
      throw new Error('duplicate after 60s: occurrences=' + again.length + ' invoices=' + againMine.length)
    }
    plan.verify = {
      verifiedAt: new Date().toISOString(),
      occurrence: occurrence,
      invoice: invoice,
      occurrencesAfter60s: again.length,
      invoicesAfter60s: againMine.length,
    }
    plan.phase = 'verified'
    savePlan(plan)
    log('VERIFIED ' + JSON.stringify(plan.verify))
  } finally {
    await browser.close()
  }
}

async function main() {
  const mode = process.argv[2] || 'run'
  log('drill mode', mode, 'cwd', cwd, 'repoRoot', repoRoot, 'apphost', apphost)
  if (mode === 'prep') { await prep(); return }
  if (mode === 'stop') { await stop(); return }
  if (mode === 'wait') { await waitDue(); return }
  if (mode === 'start') { await start(); return }
  if (mode === 'verify') { await verify(); return }
  if (mode === 'run') {
    await prep()
    await stop()
    await waitDue()
    await start()
    await verify()
    return
  }
  throw new Error('unknown mode ' + mode)
}

main().then(() => { log('DONE'); process.exit(0) }).catch((error) => {
  log('FAILED', String(error && error.stack ? error.stack : error))
  process.exit(1)
})

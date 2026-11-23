import { execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { promisify } from 'node:util'
import { expect, test, type Page, type Response } from '@playwright/test'
import { changeBusiness, readBusiness, uiChange, type BusinessChange } from './business-actions'
import { liveSales, prepareInvoicing } from './d9-invoice-scenarios'
import { api, baseline, completeEmailLogin, origin, repository, write } from './helpers'
import type { InvoiceDispatch } from '../shared/types/invoicing'
import type { PurchaseDetail, ReceiptPermit } from '../shared/types/purchasing'
import type { FinancialReport, ReportExport } from '../shared/types/reporting'
import type { RuntimeBuildInfo } from '../shared/utils/runtimeStatus'
import type { WireAccess, WireWorkspace } from '../shared/types/wire'
import type { InvitationReceipt } from '../shared/types/workspace-administration'

test.use({ trace: 'off', screenshot: 'off', video: 'off' })

const launch = promisify(execFile)
const appHost = resolve(repository, 'src/Hosting/Nexora.AppHost/Nexora.AppHost.csproj')
const sampleWorkspace: string = baseline.workspace.id
const orders = `/bff/api/purchasing/workspaces/${sampleWorkspace}/orders`

async function aspire(...args: string[]) {
  const invocation = [...args, '--apphost', appHost, '--non-interactive']
  const options = { cwd: repository, windowsHide: true, timeout: 90_000 }
  if (process.platform === 'win32') {
    const command = '& aspire ' + invocation.map(value => `'${value.replaceAll('\'', '\'\'')}'`).join(' ') + '\nexit $LASTEXITCODE'
    await launch('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(command, 'utf16le').toString('base64')], options)
  } else await launch('aspire', invocation, options)
}

async function pendingReceipt(maker: Page, reviewer: Page, tag: string) {
  const order = await changeBusiness(maker, orders, { number: 'D14-PO-' + tag, draft: {
    on: '2026-01-03', supplierId: baseline.supplier.id, lines: [{ itemId: baseline.product.id, quantity: '2', unitPrice: '10' }]
  } }, 201)
  const path = orders + '/' + order.id
  const sent = await changeBusiness(maker, path + '/decision', { decision: 'submit', expectedVersion: order.version })
  const approved = await changeBusiness(reviewer, path + '/decision', { decision: 'approve', expectedVersion: sent.version })
  const { lines } = await readBusiness<PurchaseDetail>(reviewer, path)
  const receiptPath = path + '/receipts'
  const { permitId } = await changeBusiness<{ permitId: string }>(reviewer, receiptPath,
    { lineId: lines[0]!.id, warehouseId: baseline.warehouse.id, quantity: '2', expectedVersion: approved.version }, 202)
  const permit = async () => (await readBusiness<{ permits: ReceiptPermit[] }>(reviewer, receiptPath)).permits.find(item => item.id === permitId)
  await expect.poll(async () => (await permit())?.state).toBe('issued')
  return { order, path, permit }
}

async function inviteThroughMail(owner: Page, guest: Page, workspace: string, email: string) {
  const root = '/bff/api/workspaces/' + workspace
  const access = await readBusiness<WireAccess>(owner, root + '/access')
  const result = await write(owner, root + '/invitations', 'POST', { email, role: 'WorkspaceReader', businessRoles: [], operationId: crypto.randomUUID() },
    { 'If-Match': `"${access.authorizationVersion}"` })
  expect(result.status).toBe(201)
  const receipt = JSON.parse(result.text) as InvitationReceipt
  const query = new URLSearchParams({ query: 'to:' + email })
  let link = ''
  await expect.poll(async () => {
    const { messages } = await (await fetch('http://localhost:8025/api/v1/search?' + query)).json()
    for (const mail of messages ?? []) {
      const message = await (await fetch('http://localhost:8025/api/v1/message/' + mail.ID)).json()
      const match = new RegExp('https://[^/\\s]+/join#' + receipt.invitation.id + '\\.[a-f0-9]{64}', 'i').exec(message.Text + '\n' + message.HTML)
      if (match) {
        link = match[0]
        return true
      }
    }
    return false
  }).toBe(true)
  expect(new URL(link).origin).toBe(origin)
  try {
    await guest.goto(link)
  } catch {
    throw new Error('本地邀请页导航失败')
  }
  await expect(guest).toHaveURL(origin + '/join')
  await guest.getByRole('link', { name: '注册', exact: true }).click()
  await completeEmailLogin(guest, email, '/join')
  await uiChange(guest, '/bff/api/invitations/' + receipt.invitation.id + '/redeem', () => guest.getByTestId('live-invitation-redeem').click())
  expect((await guest.request.get(root + '/access')).status()).toBe(200)
}

async function streamAssistant(page: Page, workspace: string) {
  const root = `/bff/api/assistant/workspaces/${workspace}`
  expect((await page.request.get(root + '/capabilities')).status()).toBe(200)
  const errors: string[] = []
  const report = (failure: Error) => errors.push(failure.name + ' ' + failure.message)
  page.on('pageerror', report)
  try {
    expect((await page.goto('/assistant?workspace=' + workspace))?.status()).toBe(200)
    await expect(page.getByTestId('live-assistant-history'), 'Assistant history loaded for the selected workspace').toBeVisible()
  } catch (error) {
    throw new Error('Assistant page did not load. Browser errors ' + errors.join(' | '), { cause: error })
  } finally {
    page.off('pageerror', report)
  }
  await page.getByTestId('live-assistant-prompt').fill('D14 产物联调')
  const [response] = await Promise.all([
    page.waitForResponse(response => new URL(response.url()).pathname === root + '/runs'),
    page.getByTestId('live-assistant-send').click()
  ])
  expect(response.status()).toBe(200)
  expect(await response.headerValue('content-type')).toContain('text/event-stream')
  expect(await response.headerValue('cache-control')).toContain('no-store')
  await expect(page.getByTestId('live-assistant-messages')).toContainText('已收到你的请求')
  await expect(page.getByTestId('live-assistant-cancel')).toBeHidden()
}

test('D14 独立 HTTPS 构建、双身份和首版暂停恢复', async ({ browser, request }, testInfo) => {
  test.setTimeout(480_000)
  const tag = crypto.randomUUID().slice(0, 8)
  const [owner, maker, reviewer, visitor] = await Promise.all(Array.from({ length: 4 }, () => browser.newPage({ baseURL: origin, locale: 'zh-CN' }))) as [Page, Page, Page, Page]
  const callbacks: number[] = []
  const callback = (response: Response) => {
    if (new URL(response.url()).origin === origin && new URL(response.url()).pathname === '/signin-oidc') callbacks.push(response.status())
  }
  maker.on('response', callback)
  reviewer.on('response', callback)
  try {
    const version = await visitor.request.get('/bff/version')
    expect(version.status()).toBe(200)
    const before: RuntimeBuildInfo = await version.json()
    expect(before.environment).toBe('d14-local')
    expect(before.buildId).toMatch(/^[a-f0-9]{64}$/)
    expect((await visitor.request.get('/health')).status()).toBe(200)
    const html = await visitor.request.get('/catalog')
    expect(html.status()).toBe(200)
    const script = /(?:href|src)="(\/_nuxt\/[^"?]+\.(?:js|css))"/.exec(await html.text())?.[1]
    expect(script).toBeTruthy()
    expect((await visitor.request.get(script!)).status()).toBe(200)
    const forbidden = await visitor.request.get('/bff/api/workspaces')
    expect(forbidden.status()).toBe(401)
    expect(forbidden.headers()['cache-control']).toContain('no-store')

    const fixture = await prepareInvoicing(owner, maker, reviewer, 'D14')
    expect(callbacks.length).toBeGreaterThanOrEqual(2)
    expect(callbacks.every(status => status >= 300 && status < 400)).toBe(true)
    const { finance, ar, workspace } = fixture
    const identity = async (page: Page) => JSON.parse((await api(page, '/bff/me')).text) as { name?: string }
    for (const [page, name] of [[maker, 'alice'], [reviewer, 'bob']] as const) {
      const me = await api(page, '/bff/me')
      expect(me.status).toBe(200)
      expect(JSON.parse(me.text)).toMatchObject({ name })
      expect(me.headers['cache-control']).toContain('no-store')
    }
    await streamAssistant(maker, workspace)

    const pending = await pendingReceipt(maker, reviewer, tag)
    await maker.goto(`/purchase-orders?workspace=${sampleWorkspace}&order=${pending.order.id}`)
    await expect(maker.getByTestId('order-live-version')).toContainText('收货中')
    await maker.reload()
    await expect(maker.getByTestId('order-live-version')).toContainText('收货中')
    await maker.keyboard.press('Escape')
    await expect(maker.getByTestId('order-live-version')).toBeHidden()
    const destination = await readBusiness<WireWorkspace>(maker, '/bff/api/workspaces/' + workspace)
    const workspaceToggle = maker.getByTestId('workspace-menu-trigger')
    await workspaceToggle.click()
    await maker.getByRole('menuitemcheckbox', { name: destination.name, exact: true }).click()
    await expect(workspaceToggle).toContainText(destination.name)

    const schedule = await changeBusiness(maker, ar + '/schedules', { expectedVersion: 0, input: fixture.input })
    const { invoiceId } = await changeBusiness<{ invoiceId: string }>(maker, `${ar}/schedules/${schedule.id}/run`, { on: fixture.input.nextOn })
    const invoice = `${ar}/documents/${invoiceId}`
    const document = await readBusiness<BusinessChange>(reviewer, invoice)
    await changeBusiness(reviewer, invoice + '/decision', { expectedVersion: document.version, approve: true })

    await reviewer.goto(liveSales(workspace, 'invoice-delivery', invoiceId))
    await reviewer.getByTestId('invoice-share-create-expiry').fill('60')
    await uiChange(reviewer, invoice + '/shares', () => reviewer.getByTestId('invoice-share-create').click())
    const share = await reviewer.getByTestId('invoice-share-link').inputValue()
    expect(new URL(share).origin).toBe(origin)
    try {
      await visitor.goto(share)
    } catch {
      throw new Error('公开发票页导航失败')
    }
    const [download, publicPdf] = await Promise.all([
      visitor.waitForEvent('download'),
      visitor.waitForResponse(response => new URL(response.url()).pathname === '/public/invoice-pdf'),
      visitor.getByTestId('public-invoice-download').click()
    ])
    expect(publicPdf.headers()['cache-control']).toBe('no-store')
    expect((await readFile(await download.path())).subarray(0, 5).toString()).toBe('%PDF-')
    expect(visitor.url()).toBe(origin + '/invoice-share')
    await inviteThroughMail(owner, visitor, workspace, 'd14-guest-' + tag + '@example.invalid')
    await owner.close()
    await visitor.close()

    const reportDay = fixture.input.nextOn
    const filter = { from: reportDay, through: reportDay, compare: false, basis: 'accrual' }
    const report = await readBusiness<FinancialReport>(maker, finance + '/reports/profit-and-loss?' + new URLSearchParams({ from: reportDay, through: reportDay }))
    const exports = finance + '/report-exports'
    const job = await changeBusiness<ReportExport>(maker, exports, { kind: 'profit-and-loss', watermark: report.watermark, ...filter }, 201)
    const exportPath = exports + '/' + job.id
    const hidden = await reviewer.request.get(exportPath)
    expect(hidden.status()).toBe(404)
    expect(hidden.headers()['cache-control']).toContain('no-store')
    const traceId: string = (await hidden.json()).traceId
    expect(traceId).toMatch(/^00-[a-f0-9]{32}-[a-f0-9]{16}-[a-f0-9]{2}$/)

    await reviewer.getByRole('tab', { name: '寄送记录', exact: true }).click()
    const mailPath = invoice + '/dispatches'
    const mail = await uiChange<InvoiceDispatch>(reviewer, mailPath, () => reviewer.getByTestId('invoice-mail-send-live').click(), 201)
    expect(mail.state).toBe('queued')
    const prior = await readBusiness<PurchaseDetail>(maker, pending.path)

    // The release tag above is required before touching the local Dashboard process.
    let pausedStatus: number | 'unreachable' = 0
    try {
      await aspire('resource', 'dashboard', 'stop')
      await expect.poll(async () => {
        const response = await request.get('/bff/version', { timeout: 2500 }).catch(() => null)
        pausedStatus = response?.status() ?? 'unreachable'
        return pausedStatus === 'unreachable' || pausedStatus >= 500
      }).toBe(true)
      expect((await request.get('https://localhost:7443/alive')).status()).toBe(200)
    } finally {
      await aspire('resource', 'dashboard', 'start')
      await aspire('wait', 'dashboard', '--timeout', '60')
    }

    await expect.poll(async () => (await request.get('/health', { timeout: 3000 }).catch(() => null))?.status(), { timeout: 60_000 }).toBe(200)
    const recovered = await readBusiness<RuntimeBuildInfo>(maker, '/bff/version')
    expect(recovered).toMatchObject({ buildId: before.buildId, version: before.version, environment: before.environment })
    expect(recovered.startedAt).not.toBe(before.startedAt)
    expect(await identity(maker)).toMatchObject({ name: 'alice' })
    expect(await identity(reviewer)).toMatchObject({ name: 'bob' })
    expect((await readBusiness<PurchaseDetail>(maker, pending.path)).order.version).toBe(prior.order.version)
    expect((await pending.permit())?.state).toBe('issued')
    await expect.poll(async () => (await readBusiness<ReportExport>(maker, exportPath)).completedAtUtc).not.toBeNull()
    expect((await readBusiness<ReportExport>(maker, exportPath)).watermark).toBe(job.watermark)
    expect((await maker.request.get(exportPath + '/file')).headers()['content-type']).toContain('text/csv')
    expect((await reviewer.request.get(exportPath)).status()).toBe(404)
    await expect.poll(async () => (await readBusiness<InvoiceDispatch>(reviewer, `${mailPath}/${mail.id}`)).state, { timeout: 60_000 }).toBe('sent')
    await expect.poll(async () => (await api(maker, '/bff/api/workspaces')).status).toBe(200)

    const evidence = { source: before, recovered, pausedStatus, authenticatedCallbacks: callbacks.length, traceId,
      readBack: ['signedInSessions', 'purchaseOrder', 'issuedReceiptPermit', 'reportExport', 'invoiceDispatch'] }
    await testInfo.attach('dashboard-release-evidence', { body: JSON.stringify(evidence, null, 2), contentType: 'application/json' })
  } finally {
    await Promise.all([owner, maker, reviewer, visitor].filter(page => !page.isClosed()).map(page => page.close()))
  }
})

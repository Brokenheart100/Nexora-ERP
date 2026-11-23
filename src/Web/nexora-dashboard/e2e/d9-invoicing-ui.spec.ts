import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { expect, test, type Page } from '@playwright/test'
import type { InvoiceDispatch, InvoiceShare } from '../shared/types/invoicing'
import { readBusiness, requestBusiness, uiChange } from './business-actions'
import { liveSales, prepareInvoicing, verifyNumbering, verifyRecurring } from './d9-invoice-scenarios'
import { origin } from './helpers'

test.use({ trace: 'off', screenshot: 'off', video: 'off' })

const run = promisify(execFile)
const publicPdf = '/public/invoice-pdf'
type Fixture = Awaited<ReturnType<typeof prepareInvoicing>>

async function openShare(visitor: Page, link: string) {
  try { await visitor.goto(link) } catch { throw new Error('公开发票页面导航失败。') }
  await expect(visitor.getByTestId('public-invoice-download')).toBeVisible()
  expect(new URL(visitor.url()).hash === '').toBe(true)
}

async function verifyDelivery(maker: Page, reviewer: Page, visitor: Page, fixture: Fixture, invoices: { posted: string, submitted: string }) {
  const { workspace, ar } = fixture
  const document = `${ar}/documents/${invoices.posted}`
  const draft = `${ar}/documents/${invoices.submitted}`
  const get = (id: string) => reviewer.getByTestId(id)
  const isPdf = (headers: Record<string, string>) => expect(headers['content-type']).toMatch(/^application\/pdf\b/)
  expect((await visitor.request.get(document + '/pdf')).status()).toBe(401)
  expect((await maker.request.get(draft + '/pdf')).status()).toBe(404)
  for (const page of [maker, reviewer]) {
    const sample = await page.request.get(draft + '/pdf?preview=true')
    expect(sample.status()).toBe(200)
    isPdf(sample.headers())
    expect(sample.headers()['content-disposition']).toMatch(/^inline/)
    expect((await sample.body()).subarray(0, 5).toString()).toBe('%PDF-')
  }
  await reviewer.goto(liveSales(workspace, 'invoice-delivery', invoices.posted))
  await get('invoice-pdf-preview-live').click()
  await expect(get('invoice-pdf-frame')).toBeVisible()
  const authenticated = await reviewer.request.get(document + '/pdf')
  expect(authenticated.status()).toBe(200)
  isPdf(authenticated.headers())
  expect(authenticated.headers()['content-disposition']).toMatch(/^attachment/)
  const download = reviewer.waitForEvent('download')
  await get('invoice-pdf-download-live').click()
  expect((await download).suggestedFilename()).toMatch(/\.pdf$/i)

  const create = async (minutes: string) => {
    await get('invoice-share-create-expiry').fill(minutes)
    const [response] = await Promise.all([
      reviewer.waitForResponse(result => new URL(result.url()).pathname === document + '/shares' && result.request().method() === 'POST'),
      get('invoice-share-create').click()
    ])
    expect(response.status()).toBe(200)
    const share: InvoiceShare = await response.json()
    const link = await get('invoice-share-link').inputValue()
    const url = new URL(link)
    expect(url.origin + url.pathname + url.search).toBe(origin + '/invoice-share')
    expect(/^#token=[0-9a-f]{64}$/i.test(url.hash)).toBe(true)
    expect(url.hash.slice(7) === share.token).toBe(true)
    const { operationId } = response.request().postDataJSON()
    return { share, link, operationId }
  }
  const expiring = await create('1')
  const current = await create('60')
  const replay = await requestBusiness(reviewer, document + '/shares', { lifetimeMinutes: 60 }, 'POST', current.operationId)
  expect(replay.status).toBe(200)
  expect(JSON.parse(replay.text).token == null).toBe(true)
  expect((await readBusiness<InvoiceShare[]>(reviewer, document + '/shares')).every(row => !row.token)).toBe(true)

  await openShare(visitor, current.link)
  const publicDownload = visitor.waitForEvent('download', { timeout: 15000 }).catch(() => null)
  const [response] = await Promise.all([
    visitor.waitForResponse(result => new URL(result.url()).pathname === publicPdf),
    visitor.getByTestId('public-invoice-download').click()
  ])
  expect(response.status()).toBe(200)
  isPdf(response.headers())
  expect(response.headers()).toMatchObject({ 'cache-control': 'no-store', 'referrer-policy': 'no-referrer', 'x-content-type-options': 'nosniff' })
  expect(response.headers()['content-disposition']).toMatch(/^attachment/)
  expect((await response.body()).subarray(0, 5).toString()).toBe('%PDF-')
  expect((await response.request().allHeaders()).cookie).toBeUndefined()
  expect((await publicDownload)?.suggestedFilename()).toMatch(/\.pdf$/i)
  expect((await visitor.request.post(publicPdf, { data: { token: 'a'.repeat(700) } })).status()).toBe(413)
  expect((await visitor.request.post(publicPdf, { data: { token: 'invalid' } })).status()).toBe(404)

  await reviewer.reload()
  await expect(get('invoice-share-link')).toHaveCount(0)
  await uiChange(reviewer, `${ar}/shares/${current.share.id}/revoke`, () => get('invoice-share-revoke-' + current.share.id).click())
  await expect(get('invoice-share-status-' + current.share.id)).toContainText('已撤销')
  await openShare(visitor, current.link)
  await visitor.getByTestId('public-invoice-download').click()
  await expect(visitor.getByTestId('public-invoice-status')).toContainText('已失效')
  return { visitor, ...expiring }
}

async function verifyInvoiceMail(reviewer: Page, fixture: Fixture, invoice: string, mailpit: URL, container: string) {
  const { workspace, finance, ar, recipient } = fixture
  expect((await readBusiness<{ invoiceMail: string }>(reviewer, finance + '/capabilities')).invoiceMail).toBe('local-only')
  expect(mailpit.hostname).toBe('127.0.0.1')
  expect(container).toMatch(/^nexora-d9-mailpit-\d+$/)
  const path = `${ar}/documents/${invoice}/dispatches`
  const mailApi = (suffix: string) => new URL('/api/v1/' + suffix, mailpit)
  const controls = (id: string) => reviewer.getByTestId(id)
  await reviewer.goto(liveSales(workspace, 'invoice-delivery', invoice))
  await reviewer.getByRole('tab', { name: '寄送记录', exact: true }).click()
  await expect(controls('invoice-mail-channel-live')).toHaveText('本地邮件通道')

  const queue = async () => {
    const [response] = await Promise.all([
      reviewer.waitForResponse(result => new URL(result.url()).pathname === path && result.request().method() === 'POST'),
      controls('invoice-mail-send-live').click()
    ])
    expect(response.status()).toBe(201)
    const item: InvoiceDispatch = await response.json()
    expect(item).toMatchObject({ invoiceId: invoice, recipient, state: 'queued' })
    expect(response.headers().location).toBe(`${path}/${item.id}`)
    await expect(controls('invoice-mail-detail-live')).toContainText(item.id)
    return item
  }
  const dispatch = (id: string) => readBusiness<InvoiceDispatch>(reviewer, `${path}/${id}`)
  const waitState = (id: string, state: InvoiceDispatch['state']) =>
    expect.poll(async () => (await dispatch(id)).state, { timeout: 65_000 }).toBe(state)
  const view = async (id: string) => {
    await reviewer.getByRole('button', { name: '刷新寄送记录', exact: true }).click()
    await controls('invoice-mail-open-' + id).click()
  }
  const decision = (id: string, action: string) => uiChange<InvoiceDispatch>(reviewer, `${ar}/dispatches/${id}/decision`,
    () => controls(`invoice-mail-${action}-live`).click())
  const first = await queue()
  await waitState(first.id, 'sent')

  const chaos = mailApi('chaos')
  const current = await (await fetch(chaos)).json()
  const configure = async (input: unknown) => {
    const response = await fetch(chaos, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) })
    expect(response.ok).toBe(true)
  }
  const reject = { Recipient: { Probability: 100, ErrorCode: 451 } }
  try {
    await configure(reject)
    const failed = await queue()
    await waitState(failed.id, 'failed')
    expect((await dispatch(failed.id)).detail).toContain('451')
    await configure(current)
    await view(failed.id)
    const retry = await decision(failed.id, 'retry')
    expect(retry).toMatchObject({ id: failed.id, attempt: 2 })
    await waitState(retry.id, 'sent')

    await configure(reject)
    const stopped = await queue()
    await waitState(stopped.id, 'failed')
    await view(stopped.id)
    expect((await decision(stopped.id, 'abandon')).state).toBe('abandoned')
  } finally { await configure(current) }

  const unknown = await (async () => {
    await run('docker', ['pause', container])
    try {
      const item = await queue()
      await waitState(item.id, 'unknown')
      return item
    } finally { await run('docker', ['unpause', container]) }
  })()
  await view(unknown.id)
  await expect(controls('invoice-mail-detail-live')).toContainText('结果未知')
  await expect(controls('invoice-mail-retry-live')).toHaveCount(0)
  const resent = await decision(unknown.id, 'resend')
  expect(resent.id).not.toBe(unknown.id)
  expect(resent.previousId).toBe(unknown.id)
  expect((await dispatch(unknown.id)).resentAsId).toBe(resent.id)
  await waitState(resent.id, 'sent')

  const search = mailApi('search')
  search.searchParams.set('query', 'to:' + recipient)
  const messages = async () => ((await (await fetch(search)).json()).messages ?? []) as { ID: string }[]
  await expect.poll(async () => (await messages()).length).toBe(3)
  for (const summary of await messages()) {
    const message = await (await fetch(mailApi(`message/${summary.ID}`))).json()
    expect(message.Attachments).toEqual([expect.objectContaining({ ContentType: 'application/pdf', FileName: expect.stringMatching(/\.pdf$/i) })])
  }
}

test('D9 原 Dashboard 定期开票、编号、PDF 分享与真实邮件投递', async ({ browser }) => {
  test.setTimeout(480_000)
  const [owner, maker, reviewer, visitor] = await Promise.all(Array.from({ length: 4 }, () => browser.newPage({ baseURL: origin, locale: 'zh-CN' })))
  let loggedShareToken = false
  visitor!.on('console', message => { loggedShareToken ||= /#token=[0-9a-f]{64}/i.test(message.text()) })
  try {
    const fixture = await test.step('独立工作区和应收开票前置', () => prepareInvoicing(owner!, maker!, reviewer!))
    const first = await test.step('定期计划版本、跳过、执行、恢复和历史', () => verifyRecurring(maker!, fixture))
    const invoices = await test.step('并发编号、关账和历史快照', () => verifyNumbering(maker!, reviewer!, fixture, first))
    const expiring = await test.step('授权预览下载、匿名下载、令牌一次返回和撤销', () => verifyDelivery(maker!, reviewer!, visitor!, fixture, invoices))
    const mailpit = process.env.NEXORA_D9_MAILPIT_URL
    const container = process.env.NEXORA_D9_MAILPIT_NAME
    if (mailpit && container)
      await test.step('本地邮件回读、失败重试、放弃与未知结果重寄', () => verifyInvoiceMail(reviewer!, fixture, invoices.posted, new URL(mailpit), container))
    else test.info().annotations.push({ type: 'coverage', description: '需设置独立 Mailpit 配置才能验证投递故障恢复' })
    await test.step('实际到期后拒绝匿名下载', async () => {
      await expect.poll(() => Date.now(), { timeout: 65_000 }).toBeGreaterThanOrEqual(Date.parse(expiring.share.expiresAtUtc))
      await openShare(expiring.visitor, expiring.link)
      await expiring.visitor.getByTestId('public-invoice-download').click()
      await expect(expiring.visitor.getByTestId('public-invoice-status')).toContainText('已失效')
    })
    expect(loggedShareToken).toBe(false)
  } finally { await Promise.all([owner, maker, reviewer, visitor].map(page => page?.close())) }
})

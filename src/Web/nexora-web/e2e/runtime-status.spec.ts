import { expect, test, type Page } from '@playwright/test'

const statusPattern = '**/bff/status'
const versionPattern = '**/bff/version'

function runtimeStatus(state: string, message = '') {
  return { state, message, since: '2026-11-14T10:00:00.000Z', checkedAt: new Date().toISOString() }
}

function buildInfo(buildId: string, version = '0.2.0') {
  return { version, buildId, startedAt: '2026-11-14T10:00:00.000Z', environment: 'Development' }
}

/** Publishes a mutable status payload so a test can switch states mid-page. */
async function mockStatus(page: Page, initial = runtimeStatus('running')) {
  const current = { payload: initial }
  await page.route(statusPattern, route => route.fulfill({ json: current.payload }))
  return (next: ReturnType<typeof runtimeStatus>) => { current.payload = next }
}

async function mockVersion(page: Page, initial = buildInfo('build-1')) {
  const current = { payload: initial }
  await page.route(versionPattern, route => route.fulfill({ json: current.payload }))
  return (next: ReturnType<typeof buildInfo>) => { current.payload = next }
}

/** Renders a small form on every document load so draft capture and restore survive a reload. */
async function installDraftForm(page: Page) {
  await page.addInitScript(() => {
    window.addEventListener('DOMContentLoaded', () => {
      const form = document.createElement('form')
      form.innerHTML = '<label>E2E note<input name="e2eNote"></label><textarea name="e2eMemo"></textarea>'
      document.body.append(form)
    })
  })
}

async function refreshNow(page: Page) {
  await page.evaluate(() => {
    document.dispatchEvent(new Event('visibilitychange'))
    window.dispatchEvent(new Event('focus'))
  })
}

/** Waits until the plugin finished its first status and version polls. */
async function waitForInitialPoll(page: Page, go: () => Promise<unknown>) {
  const options = { timeout: 60_000 }
  const status = page.waitForResponse(statusPattern, options)
  const version = page.waitForResponse(versionPattern, options)
  await go()
  await Promise.all([status, version])
}

test('status overlay blocks the page, keeps the draft and restores it after recovery', async ({ page }) => {
  const setStatus = await mockStatus(page)
  await mockVersion(page)
  await installDraftForm(page)

  await waitForInitialPoll(page, () => page.goto('/'))
  await expect(page.locator('a[href="/bff/email-login"]').first()).toBeVisible()

  const note = page.locator('[name="e2eNote"]')
  await note.fill('华东客户 · 待发订单')
  await page.locator('[name="e2eMemo"]').fill('先联系仓库确认库存')

  setStatus(runtimeStatus('maintenance', '数据库版本升级，预计 20 分钟后恢复。'))
  await refreshNow(page)

  const overlay = page.getByTestId('status-overlay')
  await expect(overlay).toBeVisible()
  await expect(overlay).toHaveAttribute('data-state', 'maintenance')
  await expect(overlay).toContainText('维护中')
  await expect(overlay).toContainText('数据库版本升级，预计 20 分钟后恢复。')
  await expect(overlay.getByRole('button', { name: /立即重试|Retry now/ })).toBeVisible()
  await expect(page.locator('body')).toHaveClass(/nx-scroll-lock/)

  const stored = await page.evaluate(() => sessionStorage.getItem('nexora:form-draft:/'))
  expect(stored).toContain('华东客户 · 待发订单')

  setStatus(runtimeStatus('running'))
  await page.reload()
  await expect(page.getByTestId('status-overlay')).toHaveCount(0)
  await expect(page.locator('[name="e2eNote"]')).toHaveValue('华东客户 · 待发订单')
  await expect(page.locator('[name="e2eMemo"]')).toHaveValue('先联系仓库确认库存')
  expect(await page.evaluate(() => sessionStorage.getItem('nexora:form-draft:/'))).toBeNull()
})

test('status overlay reports startup and leaves through retry', async ({ page }) => {
  const setStatus = await mockStatus(page)
  await mockVersion(page)

  await waitForInitialPoll(page, () => page.goto('/'))
  setStatus(runtimeStatus('starting'))
  await refreshNow(page)

  const overlay = page.getByTestId('status-overlay')
  await expect(overlay).toBeVisible()
  await expect(overlay).toHaveAttribute('data-state', 'starting')
  await expect(overlay).toContainText('正在启动')

  setStatus(runtimeStatus('running'))
  await overlay.getByRole('button', { name: /立即重试|Retry now/ }).click()
  await expect(overlay).toHaveCount(0)
})

test('a new build id offers a reload notice that can be snoozed', async ({ page }) => {
  await mockStatus(page)
  const setVersion = await mockVersion(page, buildInfo('build-1', '0.1.0'))

  await waitForInitialPoll(page, () => page.goto('/'))
  await expect(page.getByTestId('version-notice')).toHaveCount(0)

  setVersion(buildInfo('build-2', '0.2.0'))
  await refreshNow(page)

  const notice = page.getByTestId('version-notice')
  await expect(notice).toBeVisible()
  await expect(notice).toContainText('0.2.0')

  await notice.getByRole('button', { name: /稍后提醒|Remind me later/ }).click()
  await expect(notice).toHaveCount(0)

  await refreshNow(page)
  await expect(notice).toHaveCount(0)
})

import { expect, test } from '@playwright/test'

async function mockSession(page: import('@playwright/test').Page) {
  await page.route('**/bff/me', route => route.fulfill({ json: { name: '验收员', subject: 'e2e' } }))
  await page.route('**/bff/api/workspaces', route => route.fulfill({ json: [] }))
  await page.route('**/bff/api/reports/workspaces/*', route => route.fulfill({ json: { status: 'pending' } }))
}

test.describe('PWA', () => {
  test('exposes the web app manifest and activates the service worker', async ({ page }) => {
    await mockSession(page)
    await page.goto('/manifest.webmanifest')
    const manifest = JSON.parse(await page.evaluate(() => document.body.innerText)) as { display: string; icons: { sizes: string }[] }
    expect(manifest.display).toBe('standalone')
    expect(manifest.icons.some((icon) => icon.sizes === '512x512')).toBeTruthy()

    await page.goto('/?pwa=1')
    await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', '/manifest.webmanifest')
    await page.waitForFunction(async () => {
      await navigator.serviceWorker.ready
      return navigator.serviceWorker.controller !== null
    })
    const state = await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.ready
      return { scope: registration.scope, controlled: navigator.serviceWorker.controller !== null }
    })
    expect(state.scope).toContain('/')
    expect(state.controlled).toBeTruthy()
  })

  test('offers installation and remembers a dismissal', async ({ page }) => {
    await mockSession(page)
    await page.goto('/?pwa=1')
    await expect(page.getByText('验收员')).toBeVisible()
    await page.evaluate(() => {
      const event = new Event('beforeinstallprompt') as Event & {
        prompt?: () => Promise<void>
        userChoice?: Promise<{ outcome: string, platform: string }>
      }
      event.prompt = async () => {}
      event.userChoice = Promise.resolve({ outcome: 'dismissed', platform: 'web' })
      window.dispatchEvent(event)
    })

    const prompt = page.getByTestId('install-prompt')
    await expect(prompt).toBeVisible()
    await prompt.getByRole('button', { name: '以后再说' }).click()
    await expect(prompt).toBeHidden()
    const dismissed = await page.evaluate(() => localStorage.getItem('nexora:pwa-install-dismissed'))
    expect(Number(dismissed)).toBeGreaterThan(0)

    await page.reload()
    await expect(page.getByTestId('install-prompt')).toBeHidden()
  })

  test('serves the cached shell offline and recovers when the network returns', async ({ page, context }) => {
    await mockSession(page)
    await page.goto('/?pwa=1')
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready
    })
    await page.reload()
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null)
    await expect(page.getByRole('heading', { name: '管理你的企业工作区' })).toBeVisible()
    await page.waitForTimeout(1500)
    await page.reload()
    await page.waitForLoadState('load')

    await context.setOffline(true)
    const response = await page.reload()
    expect(response?.fromServiceWorker()).toBe(true)
    await expect(page.locator('#__nuxt')).toBeVisible()
    await expect(page.getByTestId('offline-notice')).toHaveAttribute('data-state', 'offline')

    await context.setOffline(false)
    await page.waitForFunction(() => navigator.onLine)
    await expect(page.getByTestId('offline-notice')).toHaveAttribute('data-state', 'online', { timeout: 15_000 })
    const online = await page.reload()
    expect(online?.status()).toBe(200)
    await expect(page.getByRole('heading', { name: '管理你的企业工作区' })).toBeVisible()
  })
})

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  INSTALL_COOLDOWN_MS,
  isInstallDismissed,
  isStandalone,
  shouldOfferInstall,
  swEnabled,
} from '../app/utils/pwa'

const root = process.cwd() + '/'
const manifest = JSON.parse(readFileSync(root + 'public/manifest.webmanifest', 'utf8')) as {
  display: string
  start_url: string
  icons: { sizes: string; type: string; purpose?: string }[]
}

describe('pwa manifest and worker', () => {
  it('declares a standalone app with installable icons', () => {
    expect(manifest.display).toBe('standalone')
    expect(manifest.start_url).toBe('/')
    expect(manifest.icons).toEqual(expect.arrayContaining([
      expect.objectContaining({ sizes: '192x192', type: 'image/png' }),
      expect.objectContaining({ sizes: '512x512', type: 'image/png' }),
      expect.objectContaining({ sizes: '512x512', purpose: 'maskable' }),
    ]))
  })

  it('keeps authentication traffic and private data out of the shell cache', () => {
    const worker = readFileSync(root + 'public/sw.js', 'utf8')
    expect(worker).toContain("const PRIVATE_PATHS = ['/bff/login', '/bff/logout'")
    expect(worker).toContain("url.pathname.startsWith('/bff/api/')")
    expect(worker).toContain("event.data === 'NEXORA_CLEAR_DATA'")
    expect(worker).toContain('caches.delete(DATA_CACHE)')
    expect(worker).toContain('navigation(request)')
  })
})

describe('install prompt policy', () => {
  it('treats both display-mode and iOS standalone as installed', () => {
    expect(isStandalone(true, false)).toBe(true)
    expect(isStandalone(false, true)).toBe(true)
    expect(isStandalone(false, false)).toBe(false)
  })

  it('expires a dismissal after the cooldown', () => {
    const now = Date.UTC(2026, 10, 14)
    expect(isInstallDismissed(String(now - 1000), now)).toBe(true)
    expect(isInstallDismissed(String(now - INSTALL_COOLDOWN_MS - 1), now)).toBe(false)
    expect(isInstallDismissed(null, now)).toBe(false)
    expect(isInstallDismissed('not-a-number', now)).toBe(false)
  })

  it('hides the offer when unsupported, installed or recently dismissed', () => {
    expect(shouldOfferInstall({ supported: true, standalone: false, dismissed: false })).toBe(true)
    expect(shouldOfferInstall({ supported: false, standalone: false, dismissed: false })).toBe(false)
    expect(shouldOfferInstall({ supported: true, standalone: true, dismissed: false })).toBe(false)
    expect(shouldOfferInstall({ supported: true, standalone: false, dismissed: true })).toBe(false)
  })

  it('registers the worker in production and on the development opt-in', () => {
    expect(swEnabled(false, '')).toBe(true)
    expect(swEnabled(true, '')).toBe(false)
    expect(swEnabled(true, '?pwa=1')).toBe(true)
  })
})

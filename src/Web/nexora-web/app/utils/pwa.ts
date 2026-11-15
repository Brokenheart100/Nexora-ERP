export const INSTALL_DISMISS_KEY = 'nexora:pwa-install-dismissed'
export const INSTALL_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000
export const INSTALL_AVAILABLE_EVENT = 'nexora:install-available'

export interface InstallChoice {
  outcome: 'accepted' | 'dismissed'
  platform?: string
}

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<InstallChoice>
}

let deferredPrompt: BeforeInstallPromptEvent | null = null

export function captureInstallPrompt(): void {
  if (typeof window === 'undefined') return
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault()
    deferredPrompt = event as BeforeInstallPromptEvent
    window.dispatchEvent(new Event(INSTALL_AVAILABLE_EVENT))
  })
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null
  })
}

export function pendingInstallPrompt(): BeforeInstallPromptEvent | null {
  return deferredPrompt
}

export function consumeInstallPrompt(): BeforeInstallPromptEvent | null {
  const event = deferredPrompt
  deferredPrompt = null
  return event
}

export function isStandalone(displayMode: boolean, iosStandalone: boolean): boolean {
  return displayMode || iosStandalone
}

export function isInstallDismissed(stored: string | null, now: number, cooldown = INSTALL_COOLDOWN_MS): boolean {
  const at = Number(stored)
  return Number.isFinite(at) && at > 0 && now - at < cooldown
}

export function shouldOfferInstall(options: { supported: boolean; standalone: boolean; dismissed: boolean }): boolean {
  return options.supported && !options.standalone && !options.dismissed
}

export function swEnabled(dev: boolean, search: string): boolean {
  if (!dev) return true
  return new URLSearchParams(search).get('pwa') === '1'
}

import { captureInstallPrompt, swEnabled } from '~/utils/pwa'

export default defineNuxtPlugin(() => {
  captureInstallPrompt()
  if (!('serviceWorker' in navigator)) return
  if (!swEnabled(import.meta.dev, window.location.search)) return
  navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch((error: unknown) => {
    console.warn('[pwa] service worker registration failed', error)
  })
})

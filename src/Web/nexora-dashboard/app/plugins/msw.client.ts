export default defineNuxtPlugin({
  name: 'msw',
  enforce: 'pre',
  async setup() {
    const config = useRuntimeConfig()
    if (!config.public.apiMocking) return
    if (!import.meta.dev || config.public.dataMode !== 'mock') throw new Error('MSW requires the explicit mock development environment.')
    const [{ setupWorker }, { createDashboardHandlers }] = await Promise.all([import('msw/browser'), import('~/mocks/api/handlers')])
    const worker = setupWorker(...createDashboardHandlers({ scenario: () => new URL(location.href).searchParams.get('mockCase') ?? 'normal' }))
    await worker.start({ quiet: true, onUnhandledFrame: 'bypass' })
    if (import.meta.hot) import.meta.hot.dispose(() => worker.stop())
  }
})

export default defineNuxtPlugin({
  name: 'msw',
  enforce: 'pre',
  async setup() {
    const config = useRuntimeConfig()
    if (!config.public.apiMocking) return
    if (!import.meta.dev || config.public.dataMode !== 'mock') throw new Error('MSW requires the explicit mock development environment.')
    const [{ setupWorker }, { createDashboardHandlers }] = await Promise.all([import('msw/browser'), import('~/mocks/api/handlers')])
    const scenario = () => {
      const selected = new URL(location.href).searchParams.get('mockCase')
      if (selected && /^d[4-9]/.test(selected)) sessionStorage.setItem('nexora:msw:scenario', selected)
      else if (selected !== null) sessionStorage.removeItem('nexora:msw:scenario')
      return selected ?? sessionStorage.getItem('nexora:msw:scenario') ?? 'normal'
    }
    const worker = setupWorker(...createDashboardHandlers({ scenario, storage: sessionStorage }))
    await worker.start({ quiet: true, onUnhandledFrame: 'bypass' })
    if (import.meta.hot) import.meta.hot.dispose(() => worker.stop())
  }
})

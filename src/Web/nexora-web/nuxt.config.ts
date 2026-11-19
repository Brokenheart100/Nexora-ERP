export default defineNuxtConfig({
  compatibilityDate: '2026-11-06',
  ssr: false,
  devtools: { enabled: false },
  // Run `pnpm typecheck` explicitly in CI. The Vite checker splits paths containing spaces on Windows.
  typescript: { strict: true },
  components: [{ path: '~/components', pathPrefix: false }],
  imports: { dirs: ['~/composables/**', '~/utils/**'] },
  runtimeConfig: {
    bff: { issuer: '', clientSecret: '', sessionKey: '', previousSessionKey: '', redisUrl: '', gatewayUrl: '', mfaEnabled: true, mfaRequired: true, mfaStepUpSeconds: 300, cliClientId: 'nexora-cli', cliScopes: 'openid nexora.cli', mcpClientId: 'nexora-mcp', mcpScopes: 'openid nexora.mcp' },
    public: { bffOrigin: '', statusPollMs: 10000, versionPollMs: 60000 },
  },
  modules: ['@nuxt/eslint', '@nuxt/ui', '@pinia/nuxt', '@nuxtjs/i18n', '@nuxtjs/color-mode', '@nuxt/test-utils/module'],
  css: ['~/assets/css/main.css'],
  icon: { mode: 'svg' },
  app: {
    head: {
      title: 'Nexora ERP',
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
        { name: 'theme-color', content: '#0d1829' },
        { name: 'apple-mobile-web-app-capable', content: 'yes' },
        { name: 'apple-mobile-web-app-title', content: 'Nexora' },
      ],
      link: [
        { rel: 'manifest', href: '/manifest.webmanifest' },
        { rel: 'icon', type: 'image/svg+xml', href: '/icons/nexora.svg' },
        { rel: 'apple-touch-icon', href: '/icons/nexora-192.png' },
      ],
    },
  },
  colorMode: {
    classSuffix: '',
    preference: 'system',
    fallback: 'light',
    storage: 'cookie',
    storageKey: 'nexora-color-mode',
  },
  i18n: {
    strategy: 'no_prefix',
    defaultLocale: 'zh-CN',
    detectBrowserLanguage: false,
    locales: [
      { code: 'zh-CN', language: 'zh-CN', name: '简体中文', file: 'zh-CN.json' },
      { code: 'en', language: 'en', name: 'English', file: 'en.json' },
    ],
  },
})

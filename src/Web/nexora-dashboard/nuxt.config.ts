// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: [
    '@nuxt/eslint',
    '@pinia/nuxt',
    '@vueuse/nuxt',
    '@nuxt/ui',
    '@nuxt/fonts',
    '@nuxtjs/i18n',
    ...(process.env.NODE_ENV === 'development' ? ['@nuxt/hints'] : [])
  ],
  $env: {
    msw: {
      buildDir: '.nuxt-msw',
      devServer: { port: 3003 },
      runtimeConfig: { public: { apiMocking: true } },
      nitro: { output: { dir: '.output-msw-dev' } }
    }
  },
  ssr: false,
  imports: { dirs: ['~/composables/**', '~/utils/**'] },

  devtools: {
    enabled: false
  },

  app: {
    pageTransition: {
      name: 'nx-page',
      mode: 'out-in'
    }
  },

  css: ['~/assets/css/main.css'],
  runtimeConfig: {
    bff: {
      issuer: '', clientSecret: '', sessionKey: '', previousSessionKey: '', redisUrl: '', gatewayUrl: '',
      mfaEnabled: true, mfaRequired: true, mfaStepUpSeconds: 300,
      cliClientId: 'nexora-cli', cliScopes: 'openid nexora.cli', mcpClientId: 'nexora-mcp', mcpScopes: 'openid nexora.mcp'
    },
    public: { dataMode: 'mock', bffOrigin: '', apiMocking: false }
  },
  buildDir: process.env.NODE_ENV === 'production'
    ? (process.env.NUXT_PUBLIC_DATA_MODE === 'live' ? '.nuxt-live-build' : '.nuxt-build')
    : (process.env.NUXT_PUBLIC_DATA_MODE === 'live' ? '.nuxt-live' : '.nuxt'),

  devServer: {
    port: 3001,
    host: 'localhost'
  },

  compatibilityDate: '2026-06-30',
  nitro: {
    output: {
      dir: process.env.NODE_ENV === 'production'
        ? (process.env.NUXT_PUBLIC_DATA_MODE === 'live' ? '.output-live' : '.output')
        : (process.env.NUXT_PUBLIC_DATA_MODE === 'live' ? '.output-live-dev' : '.output-dev')
    }
  },
  typescript: { strict: true },

  eslint: {
    config: {
      stylistic: {
        commaDangle: 'never',
        braceStyle: '1tbs'
      }
    }
  },

  fonts: {
    defaults: {
      preload: true,
      weights: [400, 500, 600, 700],
      styles: ['normal'],
      subsets: ['latin']
    },
    families: [{
      name: 'IBM Plex Sans',
      provider: 'google',
      preload: true
    }]
  },

  i18n: {
    defaultLocale: 'zh-CN',
    strategy: 'no_prefix',
    detectBrowserLanguage: {
      useCookie: true,
      cookieKey: 'nexora-locale',
      redirectOn: 'root',
      alwaysRedirect: false,
      fallbackLocale: 'zh-CN'
    },
    locales: [
      { code: 'zh-CN', name: '简体中文', language: 'zh-CN', file: 'zh-CN.json' },
      { code: 'en', name: 'English', language: 'en', file: 'en.json' }
    ]
  }
})

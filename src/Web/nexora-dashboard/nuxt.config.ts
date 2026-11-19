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

  devServer: {
    port: 3001,
    host: 'localhost'
  },

  compatibilityDate: '2026-06-30',

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

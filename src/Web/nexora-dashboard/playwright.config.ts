import { defineConfig } from '@playwright/test'

const releaseDrill = process.env.NEXORA_D14_RELEASE === '1'

export default defineConfig({
  webServer: { command: releaseDrill ? 'node .output/server/index.mjs' : 'pnpm dev', url: 'http://localhost:3001', reuseExistingServer: !releaseDrill, timeout: 60_000,
    env: { NUXT_PUBLIC_DATA_MODE: 'mock', NUXT_PUBLIC_BFF_ORIGIN: '', ...(releaseDrill ? { NODE_ENV: 'production', NITRO_HOST: 'localhost', NITRO_PORT: '3001' } : {}) } },
  testDir: './e2e', fullyParallel: false, workers: 1, timeout: 180_000,
  testIgnore: ['msw.spec.ts', '*.msw.spec.ts', ...(releaseDrill ? [] : ['d14-release-ui.spec.ts'])],
  expect: { timeout: 30_000 },
  outputDir: releaseDrill ? '../../../artifacts/p1/runtime/dashboard-d14-browser' : '../../../artifacts/p1/runtime/dashboard-browser',
  reporter: [['list'], ['json', { outputFile: releaseDrill ? '../../../artifacts/p1/runtime/dashboard-d14-browser-results.json' : '../../../artifacts/p1/runtime/dashboard-browser-results.json' }]],
  use: { baseURL: 'https://localhost:7444', channel: 'msedge', headless: true, locale: 'zh-CN',
    actionTimeout: 15_000, navigationTimeout: 30_000, viewport: { width: 1440, height: 1000 } }
})

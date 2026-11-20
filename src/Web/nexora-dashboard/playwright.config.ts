import { defineConfig } from '@playwright/test'

export default defineConfig({
  webServer: { command: 'pnpm dev', url: 'http://localhost:3001', reuseExistingServer: true, timeout: 60_000,
    env: { NUXT_PUBLIC_DATA_MODE: 'mock', NUXT_PUBLIC_BFF_ORIGIN: '' } },
  testDir: './e2e', fullyParallel: false, workers: 1, timeout: 180_000,
  testIgnore: 'msw.spec.ts',
  expect: { timeout: 30_000 },
  outputDir: '../../../artifacts/p1/runtime/dashboard-browser',
  reporter: [['list'], ['json', { outputFile: '../../../artifacts/p1/runtime/dashboard-browser-results.json' }]],
  use: { baseURL: 'https://localhost:7444', channel: 'msedge', headless: true,
    actionTimeout: 15_000, navigationTimeout: 30_000, viewport: { width: 1440, height: 1000 } }
})

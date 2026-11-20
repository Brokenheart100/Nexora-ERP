import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e', testMatch: 'msw.spec.ts', fullyParallel: false, workers: 1,
  timeout: 90_000, expect: { timeout: 15_000 },
  webServer: { command: 'pnpm dev:msw', url: 'http://localhost:3003', reuseExistingServer: true, timeout: 90_000 },
  outputDir: '../../../artifacts/p1/runtime/dashboard-msw-browser',
  reporter: [['list'], ['json', { outputFile: '../../../artifacts/p1/runtime/dashboard-msw-results.json' }]],
  use: { baseURL: 'http://localhost:3003', channel: 'msedge', headless: true, viewport: { width: 1440, height: 1000 } }
})

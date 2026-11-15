import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e', fullyParallel: false, workers: 1, timeout: 120_000,
  expect: { timeout: 30_000 },
  outputDir: '../../../artifacts/p1/runtime/browser',
  reporter: [['list'], ['json', { outputFile: '../../../artifacts/p1/browser-results.json' }]],
  use: { baseURL: 'https://localhost:7443', channel: 'msedge', headless: true,
    actionTimeout: 15_000, navigationTimeout: 20_000, viewport: { width: 1440, height: 1000 } },
})

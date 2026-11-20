import { defineVitestConfig } from '@nuxt/test-utils/config'

export default defineVitestConfig({
  test: {
    maxWorkers: 2,
    environment: 'nuxt',
    include: ['test/**/*.test.ts'],
    hookTimeout: 60_000,
    testTimeout: 30_000
  }
})

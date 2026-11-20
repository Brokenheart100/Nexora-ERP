import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { appendFileSync, existsSync, readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { request } from 'node:http'
import { expect, test } from '@playwright/test'
import { login, repository, runtime } from './helpers'
import { dashboardEnvironment } from './runtime'

function localSessionGet(url: string, headers: Record<string, string>) {
  return new Promise<{ status: number, text: string }>((resolve, reject) => {
    const req = request(url, { headers }, (response) => {
      const chunks: Buffer[] = []
      response.on('data', chunk => chunks.push(chunk))
      response.on('end', () => resolve({ status: response.statusCode!, text: Buffer.concat(chunks).toString('utf8') }))
    })
    req.on('error', reject)
    req.end()
  })
}

async function productionServer(overrides: Record<string, string>) {
  const reservation = createServer()
  await new Promise<void>(resolve => reservation.listen(0, '127.0.0.1', resolve))
  const port = (reservation.address() as { port: number }).port
  await new Promise<void>(resolve => reservation.close(() => resolve()))
  const child = spawn(process.execPath, ['.output-live/server/index.mjs'], {
    cwd: resolve(repository, 'src/Web/nexora-dashboard'), windowsHide: true,
    env: { ...process.env, ...dashboardEnvironment(), NODE_ENV: 'production',
      NITRO_HOST: '127.0.0.1', NITRO_PORT: String(port), ...overrides }, stdio: ['ignore', 'pipe', 'pipe']
  })
  child.stderr.on('data', (chunk: Buffer) => appendFileSync(resolve(runtime, 'dashboard-production-startup.stderr.log'), chunk))
  try {
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Production BFF did not start within budget')), 15_000)
      const fail = () => {
        clearTimeout(timeout)
        reject(new Error('Production BFF rejected its startup configuration'))
      }
      child.once('error', fail)
      child.once('exit', fail)
      child.stdout.on('data', (chunk: Buffer) => {
        if (chunk.toString().includes('Listening on')) {
          clearTimeout(timeout)
          child.removeListener('exit', fail)
          resolve()
        }
      })
    })
  } catch (error) {
    child.kill('SIGTERM')
    throw error
  }
  return { url: `http://127.0.0.1:${port}`, close: async () => {
    if (child.exitCode !== null) return
    const exited = new Promise<void>(resolve => child.once('exit', () => resolve()))
    child.kill('SIGTERM')
    await exited
  } }
}

test('独立生产产物验证会话、私有配置与 Redis 不可用；缺配置拒绝启动', async ({ page }) => {
  expect(existsSync(resolve(repository, 'src/Web/nexora-dashboard/.output-live/server/index.mjs')), 'Build live output before production verification.').toBe(true)
  await login(page)
  const env = dashboardEnvironment()
  const session = (await page.context().cookies()).find(cookie => cookie.name === '__Host-NexoraDashboard.Session')!
  const headers = { Host: 'localhost:7444', Cookie: session.name + '=' + session.value }
  const running = await productionServer({})
  try {
    expect((await fetch(running.url + '/health')).status).toBe(200)
    const me = await localSessionGet(running.url + '/bff/me', headers)
    expect(me.status).toBe(200)
    expect(JSON.parse(me.text).name).toBe('alice')
    const html = await (await fetch(running.url + '/')).text()
    const publicRoot = resolve(repository, 'src/Web/nexora-dashboard/.output-live/public')
    const client = readdirSync(publicRoot, { recursive: true, withFileTypes: true })
      .filter(entry => entry.isFile() && /\.(?:js|json|html)$/.test(entry.name))
      .map(entry => readFileSync(resolve(entry.parentPath, entry.name), 'utf8')).join('\n')
    for (const name of ['NUXT_BFF_CLIENT_SECRET', 'NUXT_BFF_SESSION_KEY', 'NUXT_BFF_REDIS_URL']) {
      expect(html.includes(env[name]!)).toBe(false)
      expect(client.includes(env[name]!)).toBe(false)
    }
  } finally { await running.close() }
  const unavailable = await productionServer({ NUXT_BFF_REDIS_URL: 'redis://127.0.0.1:1' })
  try {
    expect((await fetch(unavailable.url + '/alive')).status).toBe(200)
    expect((await fetch(unavailable.url + '/health')).status).toBe(503)
    expect((await localSessionGet(unavailable.url + '/bff/me', headers)).status).toBe(503)
  } finally { await unavailable.close() }
  await expect(productionServer({ NUXT_BFF_CLIENT_SECRET: '' })).rejects.toThrow('startup configuration')
  await expect(productionServer({ NUXT_PUBLIC_API_MOCKING: 'true' })).rejects.toThrow('startup configuration')
})

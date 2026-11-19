import { execFile, spawn, type ChildProcess } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { once } from 'node:events'
import { existsSync } from 'node:fs'
import { request } from 'node:http'
import { createServer } from 'node:net'
import { resolve } from 'node:path'
import { promisify } from 'node:util'
import type { BrowserContext } from '@playwright/test'

const run = promisify(execFile)
const appHost = resolve('../../../src/Hosting/Nexora.AppHost/Nexora.AppHost.csproj')
const origin = 'https://localhost:7443'
const sessionCookie = '__Host-Nexora.Session'
const csrfCookie = '__Host-Nexora.Csrf'

export async function localBffNode() {
  if (!existsSync('.output/server/index.mjs')) throw new Error('Build nexora-web before the second BFF node drill.')
  const [{ stdout: resources }, { stdout: secrets }] = await Promise.all([
    run('pwsh', ['-NoProfile', '-CommandWithArgs', 'aspire @args; exit $LASTEXITCODE',
      'describe', 'web', '--apphost', appHost, '--format', 'Json'], { windowsHide: true }),
    run('dotnet', ['user-secrets', 'list', '--project', appHost], { windowsHide: true }),
  ]).catch(() => { throw new Error('Could not load the local AppHost environment for the second BFF node.') })
  const web = (JSON.parse(resources) as { resources: { displayName: string; environment: Record<string, string | null> }[] })
    .resources.find(resource => resource.displayName === 'web')
  if (!web || web.environment.NUXT_PUBLIC_BFF_ORIGIN !== origin)
    throw new Error('The second node drill requires the local AppHost and its development origin.')
  const secret = (key: string) => secrets.split(/\r?\n/).find(line => line.startsWith('Parameters:' + key + ' = '))
    ?.split(' = ').slice(1).join(' = ')
  const portProbe = createServer()
  await new Promise<void>((resolvePort, reject) => {
    portProbe.once('error', reject)
    portProbe.listen(0, '127.0.0.1', resolvePort)
  })
  const port = (portProbe.address() as { port: number }).port
  await new Promise<void>(resolvePort => portProbe.close(() => resolvePort()))
  const config = Object.fromEntries(Object.entries(web.environment).flatMap(([key, value]) =>
    value && (key.startsWith('NUXT_BFF_') || key === 'NODE_EXTRA_CA_CERTS') ? [[key, value]] : []))
  const clientSecret = secret('bff-client-secret')
  const sessionKey = secret('bff-session-key')
  if (!clientSecret || !sessionKey) throw new Error('Local generated BFF parameters are missing from AppHost user secrets.')
  const env = {
    ...process.env, ...config, NUXT_PUBLIC_BFF_ORIGIN: origin, NUXT_BFF_CLIENT_SECRET: clientSecret,
    NUXT_BFF_SESSION_KEY: sessionKey, NITRO_HOST: '127.0.0.1', NITRO_PORT: String(port),
  }
  let node: ChildProcess | undefined

  async function stop() {
    if (node && node.exitCode === null && node.signalCode === null) {
      const stopped = once(node, 'exit')
      node.kill()
      await stopped
    }
    node = undefined
  }
  async function start(rotated = false) {
    const environment = rotated ? {
      ...env, NUXT_BFF_SESSION_KEY: randomBytes(32).toString('hex'), NUXT_BFF_PREVIOUS_SESSION_KEY: sessionKey,
    } : env
    node = spawn(process.execPath, ['.output/server/index.mjs'], { env: environment, stdio: 'ignore', windowsHide: true })
    try {
      for (let attempt = 0; attempt < 40; attempt++) {
        const probe = await call('/alive').catch(() => null)
        if (probe?.status === 200) return
        await new Promise(resolveWait => setTimeout(resolveWait, 250))
      }
      throw new Error('The second local BFF node did not start.')
    } catch (error) {
      await stop()
      throw error
    }
  }
  function call(path: string, cookie?: string, csrf?: string) {
    return new Promise<{ status: number; text: string }>((resolveCall, reject) => {
      const client = request({
        hostname: '127.0.0.1', port, path, method: csrf ? 'POST' : 'GET',
        headers: { host: 'localhost:7443', ...(cookie ? { cookie } : {}),
          ...(csrf ? { 'x-csrf-token': csrf, origin } : {}) },
      }, response => {
        response.setEncoding('utf8')
        let text = ''
        response.on('data', chunk => { text += chunk })
        response.on('end', () => resolveCall({ status: response.statusCode ?? 0, text }))
        response.on('error', reject)
      })
      client.setTimeout(5_000, () => client.destroy(new Error('Second BFF node timed out.')))
      client.on('error', reject)
      client.end()
    })
  }
  async function cookie(context: BrowserContext) {
    const cookies = (await context.cookies(origin)).filter(item => item.name === sessionCookie || item.name === csrfCookie)
    if (!cookies.some(item => item.name === sessionCookie)) throw new Error('The browser did not create a BFF session.')
    return cookies.map(item => item.name + '=' + item.value).join('; ')
  }
  return { start, stop, call, cookie }
}

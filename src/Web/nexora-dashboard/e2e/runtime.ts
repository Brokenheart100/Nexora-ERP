// Local fault injection uses only this AppHost's protected development configuration.
import { execFileSync } from 'node:child_process'
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createClient } from 'redis'
import type { Page } from '@playwright/test'
import { repository } from './helpers'

export function legacyWebEnabled() {
  const described = JSON.parse(execFileSync('pwsh', ['-NoProfile', '-Command', 'aspire describe gateway --apphost src/Hosting/Nexora.AppHost/Nexora.AppHost.csproj --format Json --non-interactive'], { cwd: repository, encoding: 'utf8', windowsHide: true }))
  const env: Record<string, string> = described.resources[0].environment
  return Object.entries(env).some(([key, value]) => /^services__web__/i.test(key) && !!value)
}

export function dashboardEnvironment(): Record<string, string> {
  const project = 'src/Hosting/Nexora.AppHost/Nexora.AppHost.csproj'
  const described = JSON.parse(execFileSync('pwsh', ['-NoProfile', '-Command', 'aspire describe dashboard --apphost src/Hosting/Nexora.AppHost/Nexora.AppHost.csproj --format Json --non-interactive'], { cwd: repository, encoding: 'utf8', windowsHide: true }))
  const source = readFileSync(resolve(repository, project), 'utf8')
  const id = /<UserSecretsId>(.*?)<\/UserSecretsId>/.exec(source)![1]!
  const secrets = JSON.parse(readFileSync(resolve(process.env.APPDATA!, 'Microsoft/UserSecrets', id, 'secrets.json'), 'utf8').replace(/^\uFEFF/, ''))
  return { ...described.resources[0].environment,
    NUXT_BFF_CLIENT_SECRET: secrets['Parameters:dashboard-bff-client-secret'],
    NUXT_BFF_SESSION_KEY: secrets['Parameters:dashboard-bff-session-key'] }
}

export interface LocalTicket { subject: string, accessToken: string, expiresAt: number, refreshToken?: string, mfaAt?: number }
export async function localTicket(page: Page, change?: (ticket: LocalTicket) => void): Promise<LocalTicket> {
  const env = dashboardEnvironment()
  const handle = (await page.context().cookies()).find(cookie => cookie.name === '__Host-NexoraDashboard.Session')!.value
  const client = createClient({ url: env.NUXT_BFF_REDIS_URL,
    socket: { tls: true, ca: readFileSync(env.NODE_EXTRA_CA_CERTS!), reconnectStrategy: false, connectTimeout: 3000 } })
  client.on('error', () => {})
  try {
    await client.connect()
    const key = 'nexora:dashboard:session:' + handle
    const packed = Buffer.from((await client.get(key))!, 'base64url')
    const encryptionKey = createHash('sha256').update('nexora:dashboard:session:v1\0').update(env.NUXT_BFF_SESSION_KEY!).digest()
    const decipher = createDecipheriv('aes-256-gcm', encryptionKey, packed.subarray(0, 12))
    decipher.setAAD(Buffer.from(handle))
    decipher.setAuthTag(packed.subarray(12, 28))
    const ticket = JSON.parse(Buffer.concat([decipher.update(packed.subarray(28)), decipher.final()]).toString('utf8')) as LocalTicket
    if (change) {
      change(ticket)
      const iv = randomBytes(12)
      const cipher = createCipheriv('aes-256-gcm', encryptionKey, iv)
      cipher.setAAD(Buffer.from(handle))
      const encrypted = Buffer.concat([cipher.update(JSON.stringify(ticket)), cipher.final()])
      await client.set(key, Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64url'), { KEEPTTL: true })
    }
    return ticket
  } finally { if (client.isOpen) client.destroy() }
}

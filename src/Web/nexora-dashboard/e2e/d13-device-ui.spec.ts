import { spawn } from 'node:child_process'
import { mkdtemp, readFile, rm, rmdir } from 'node:fs/promises'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import { expect, test, type Page } from '@playwright/test'
import { baseline, emailLogin, login, origin, repository, runtime } from './helpers'
import { changeBusiness } from './business-actions'
import type { WireWorkspace } from '../shared/types/wire'

test.use({ trace: 'off', video: 'off', screenshot: 'off' })
type CliEvent = { event: string, verificationUrl?: string, userCode?: string, status?: number, scope?: string, body?: unknown }

function runCli(home: string, args: string[]) {
  const lines: CliEvent[] = []
  const child = spawn(process.execPath, [join(repository, 'scripts/p5/nexora-cli.mjs'), ...args], {
    cwd: repository, windowsHide: true, env: { ...process.env, NEXORA_CLI_BASE: origin, NEXORA_CLI_HOME: home }, stdio: ['ignore', 'pipe', 'ignore']
  })
  createInterface({ input: child.stdout }).on('line', (line) => {
    try {
      lines.push(JSON.parse(line) as CliEvent)
    } catch { /* CLI output is JSON Lines. */ }
  })
  const exit = new Promise<number | null>((resolve, reject) => {
    child.once('close', resolve)
    child.once('error', reject)
  })
  return { lines, child, exit }
}

async function auth(page: Page, home: string, flow: 'cli' | 'mcp', approve: boolean) {
  const cli = runCli(home, ['login', '--client', flow])
  try {
    await expect.poll(() => cli.lines.some(item => item.event === 'authorization_required')).toBe(true)
    const requested = cli.lines.find(item => item.event === 'authorization_required')!
    const url = new URL(requested.verificationUrl!)
    expect(url.origin).toBe(origin)
    expect(url.pathname).toBe('/' + flow + '/authorize')
    await page.goto(url.href)
    await expect(page.getByTestId('device-user-code')).toHaveValue(requested.userCode!)
    await page.getByTestId('verify-device').click()
    // Keycloak owns the browser approval form.
    const choice = approve ? '#kc-accept, input[name="accept"], button[name="accept"]' : '#kc-decline, #kc-cancel, input[name="cancel"], button[name="cancel"]'
    await page.locator(choice).first().click()
    const expected = approve ? 'authorized' : 'denied'
    await expect.poll(() => cli.lines.some(item => item.event === expected), { timeout: 45_000 }).toBe(true)
    expect(await cli.exit).toBe(approve ? 0 : 2)
    if (approve) expect(cli.lines.find(item => item.event === 'authorized')?.scope).toContain('nexora.' + flow)
  } finally {
    if (cli.child.exitCode === null && cli.child.signalCode === null) cli.child.kill()
    await cli.exit.catch(() => {})
  }
}

async function call(home: string, path: string, options?: object) {
  const cli = runCli(home, ['call', '--path', path, ...(options ? ['--method', 'POST', '--body', JSON.stringify(options)] : [])])
  await cli.exit
  const result = cli.lines.find(item => item.event === 'call')
  expect(result?.status).toBeDefined()
  return result!
}

async function withDeviceClient(run: (home: string, tokenFile: string) => Promise<void>) {
  const home = await mkdtemp(join(runtime, 'd13-device-cli-'))
  const tokenFile = join(home, 'tokens.json')
  try {
    await run(home, tokenFile)
  } finally {
    await rm(tokenFile, { force: true })
    await rmdir(home)
  }
}

test('D13 CLI 与 MCP 真实设备同意、拒绝、用途及撤销', async ({ page }) => {
  test.setTimeout(240_000)
  await withDeviceClient(async (home, tokenFile) => {
    await login(page, 'bob')
    await auth(page, home, 'cli', true)
    expect((await call(home, '/api/cli/workspaces')).status).toBe(200)
    expect((await call(home, '/api/workspaces')).status).toBe(403)
    const rpc = { jsonrpc: '2.0', id: 1, method: 'tools/list' }
    expect((await call(home, '/mcp', rpc)).status).toBe(403)

    let active = JSON.parse(await readFile(tokenFile, 'utf8')).accessToken as string
    expect(await runCli(home, ['logout']).exit).toBe(0)
    const revoked = await fetch(origin + '/api/cli/workspaces', { headers: { Authorization: 'Bearer ' + active } })
    expect([401, 403]).toContain(revoked.status)

    await auth(page, home, 'mcp', true)
    expect((await call(home, '/mcp', rpc)).status).toBe(200)
    const report = await call(home, '/mcp', { jsonrpc: '2.0', id: 2, method: 'tools/call',
      params: { name: 'finance_list_accounts', arguments: { workspaceId: baseline.workspace.id } } })
    expect(report.status).toBe(200)
    expect((report.body as { result?: { isError?: boolean } }).result?.isError).toBe(false)
    expect((await call(home, '/api/cli/workspaces')).status).toBe(403)
    expect((await call(home, '/api/workspaces')).status).toBe(403)
    active = JSON.parse(await readFile(tokenFile, 'utf8')).accessToken as string
    expect(await runCli(home, ['logout']).exit).toBe(0)
    const denied = await fetch(origin + '/mcp', { method: 'POST', headers: { 'Authorization': 'Bearer ' + active, 'content-type': 'application/json' }, body: JSON.stringify(rpc) })
    expect([401, 403]).toContain(denied.status)

    await auth(page, home, 'cli', false)
  })
})

test('D13 MCP 财务工具检查调用者工作区的套餐权益', async ({ page }) => {
  const owner = 'd13-mcp-' + crypto.randomUUID().slice(0, 8)
  await emailLogin(page, owner + '@example.invalid', true)
  await expect(page.getByTestId('user-menu-trigger')).toHaveAttribute('aria-label', new RegExp(owner))
  const workspace = await changeBusiness<WireWorkspace>(page, '/bff/api/workspaces', { name: 'D13 MCP ' + owner }, 201)
  await changeBusiness(page, '/bff/api/workspaces/' + workspace.id + '/billing/subscription', { planCode: 'free' })
  await withDeviceClient(async (home) => {
    await auth(page, home, 'mcp', true)
    const response = await call(home, '/mcp', { jsonrpc: '2.0', id: 3, method: 'tools/call',
      params: { name: 'finance_list_invoices', arguments: { workspaceId: workspace.id } } })
    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({ result: { isError: true, content: [{ text: 'The workspace plan does not include the required module.' }] } })
    expect(await runCli(home, ['logout']).exit).toBe(0)
  })
})

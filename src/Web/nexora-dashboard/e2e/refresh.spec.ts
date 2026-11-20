import { expect, test } from '@playwright/test'
import { api, baseline, login, write } from './helpers'
import { localTicket } from './runtime'

test('加密会话、API audience、并发刷新、附加验证与刷新失效', async ({ page }) => {
  await login(page)
  const before = await localTicket(page)
  const claims = JSON.parse(Buffer.from(before.accessToken.split('.')[1]!, 'base64url').toString('utf8'))
  expect([claims.aud].flat()).toContain('nexora-api')
  expect(claims.azp).toBe('nexora-dashboard-bff')
  await localTicket(page, (ticket) => {
    ticket.expiresAt = Date.now() - 1000
  })
  const responses = await Promise.all([api(page, '/bff/me'), api(page, '/bff/me'), api(page, '/bff/me')])
  expect(responses.map(response => response.status)).toEqual([200, 200, 200])
  const refreshed = await localTicket(page)
  expect(refreshed.subject).toBe(before.subject)
  expect(refreshed.expiresAt).toBeGreaterThan(Date.now() + 60_000)
  await localTicket(page, (ticket) => {
    ticket.mfaAt = Date.now() - 600_000
  })
  const stale = await write(page, `/bff/api/workspaces/${baseline.workspace.id}/settings`, 'PUT', {})
  expect(stale.status).toBe(403)
  expect(JSON.parse(stale.text).data.code).toBe('mfa_step_up_required')
  const withQuery = await write(page, `/bff/api/workspaces/${baseline.workspace.id}/settings?source=dashboard`, 'PUT', {})
  expect(withQuery.status).toBe(403)
  expect(JSON.parse(withQuery.text).data.code).toBe('mfa_step_up_required')
  await login(page)
  const fresh = JSON.parse((await api(page, '/bff/security/capabilities')).text)
  expect(Date.parse(fresh.lastVerifiedAt)).toBeGreaterThan(Date.now() - 60_000)
  await localTicket(page, (ticket) => {
    ticket.expiresAt = Date.now() - 1000
    ticket.refreshToken = 'invalid-local-fault'
  })
  expect((await api(page, '/bff/me')).status).toBe(401)
  expect((await page.context().cookies()).some(cookie => cookie.name === '__Host-NexoraDashboard.Session')).toBe(false)
})

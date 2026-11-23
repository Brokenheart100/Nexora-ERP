// @vitest-environment node
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { setupServer } from 'msw/node'
import { createDashboardHandlers } from '../app/mocks/api/handlers'

let scenario = 'normal'
const server = setupServer(...createDashboardHandlers({ scenario: () => scenario }))
const origin = 'http://nexora-session.test'
const cookie = 'nexora-msw-session=' + Date.now()
beforeAll(() => server.listen({ onUnhandledFrame: 'error' }))
afterEach(() => {
  scenario = 'normal'
})
afterAll(() => server.close())

describe('MSW session contract used by the original UI', () => {
  it('distinguishes a guest, a signed-in session and an unavailable service', async () => {
    expect((await fetch(origin + '/bff/me')).status).toBe(401)
    const response = await fetch(origin + '/bff/me', { headers: { Cookie: cookie } })
    expect(await response.json()).toEqual({ subject: 'msw-demo-maker', name: 'MSW 演示账号' })
    scenario = 'session-unavailable'
    expect((await fetch(origin + '/bff/me', { headers: { Cookie: cookie } })).status).toBe(503)
  })

  it.each(['login', 'email-login', 'register'])('returns %s to the original invitation route', async (entry) => {
    const response = await fetch(`${origin}/bff/${entry}?returnTo=${encodeURIComponent('/join?invite=local-example')}`, { redirect: 'manual' })
    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toBe(origin + '/join?invite=local-example')
    expect(response.headers.get('set-cookie')).toContain('nexora-msw-session=')
  })

  it('requires CSRF for logout and returns trusted MFA capability fields', async () => {
    const capabilities = await fetch(origin + '/bff/security/capabilities', { headers: { Cookie: cookie } })
    expect(await capabilities.json()).toMatchObject({ enrolled: true, reauthPath: '/bff/login?prompt=login' })
    expect((await fetch(origin + '/bff/logout', { method: 'POST', headers: { Cookie: cookie } })).status).toBe(400)
    const body = new URLSearchParams({ __RequestVerificationToken: 'msw-only-csrf' })
    const response = await fetch(origin + '/bff/logout', { method: 'POST', headers: { Cookie: cookie }, body, redirect: 'manual' })
    expect(response.status).toBe(303)
    expect(response.headers.get('set-cookie')).toContain('Max-Age=0')
  })

  it('keeps GET logout read-only, matching the real BFF', async () => {
    const response = await fetch(origin + '/bff/logout', { headers: { Cookie: cookie }, redirect: 'manual' })
    expect(response.status).toBe(302)
    expect(response.headers.get('set-cookie')).toBeNull()
  })
})

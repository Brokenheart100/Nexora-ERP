import { http, HttpResponse } from 'msw/http'
import { loginDestination } from '../../../shared/utils/auth-navigation'

const cookieName = 'nexora-msw-session'
const csrf = 'msw-only-csrf'

export function mockIdentity(scenario: string) {
  if (scenario === 'other-account') return { subject: 'msw-bob', name: 'MSW Bob' }
  if (/^d[4-9]-reviewer/.test(scenario) || scenario === 'd7-delay') return { subject: 'msw-reviewer', name: 'MSW 独立复核人' }
  if (/^(d4|d5)-receiver$/.test(scenario) || scenario === 'd6-source') return { subject: 'msw-receiver', name: 'MSW 仓库收货人' }
  if (scenario === 'd6-destination') return { subject: 'msw-destination', name: 'MSW 目标仓执行人' }
  return { subject: 'msw-demo-maker', name: 'MSW 演示账号' }
}

/** Simulated session only. These cookies never authenticate the real BFF. */
export function createSessionHandlers(scenario: () => string, workspaceId: string) {
  const signedIn = (cookies: Record<string, string>) => Number(cookies[cookieName]) > 0
  const activity = new Map<string, number>()
  const lastSeen = (cookies: Record<string, string>) => activity.get(cookies[cookieName]!) ?? Number(cookies[cookieName])
  const guest = () => HttpResponse.json({ message: 'Sign in required' }, { status: 401 })
  const redirect = (path: string, cookie: string, status = 302) => new HttpResponse(null, {
    status, headers: { 'Location': path, 'Set-Cookie': `${cookieName}=${cookie}; Path=/; SameSite=Lax` }
  })
  return [
    http.get('*/bff/me', ({ cookies }) => {
      if (scenario() === 'session-unavailable') return HttpResponse.json({ message: 'Session service unavailable' }, { status: 503 })
      if (scenario() === 'session-expired' || !signedIn(cookies)) return guest()
      return HttpResponse.json(mockIdentity(scenario()))
    }),
    ...['login', 'email-login', 'register'].map(entry => http.get(`*/bff/${entry}`, ({ request }) => {
      const url = new URL(request.url)
      const destination = loginDestination(url.searchParams.get('returnTo') ?? (url.searchParams.get('join') === 'true' ? '/join' : '/'))
      return redirect(new URL(destination, url.origin).href, `${Date.now()}; Max-Age=3600`)
    })),
    http.get('*/bff/security/capabilities', ({ cookies }) => signedIn(cookies)
      ? HttpResponse.json(scenario() === 'd13-mfa-disabled'
          ? { available: false, required: false, enrolled: false, methods: [], stepUpSeconds: 300, lastVerifiedAt: null, reauthPath: '/bff/login?prompt=login' }
          : { available: true, required: true, enrolled: true, methods: ['otp'], stepUpSeconds: 300,
              lastVerifiedAt: new Date(Number(cookies[cookieName])).toISOString(), reauthPath: '/bff/login?prompt=login' })
      : guest()),
    http.get('*/bff/session-policy', ({ cookies }) => signedIn(cookies)
      ? HttpResponse.json({
          idleTimeoutMinutes: 30, lastSeenAt: lastSeen(cookies), workspaceCount: 1, checkedAt: new Date().toISOString(),
          cached: false, stale: false, unavailable: false, sources: [{ workspaceId, workspaceName: 'MSW 采购演示公司', idleTimeoutMinutes: 30 }]
        })
      : guest()),
    http.post('*/bff/sessions/activity', ({ request, cookies }) => {
      if (!signedIn(cookies)) return guest()
      if (request.headers.get('X-CSRF-TOKEN') !== csrf) return HttpResponse.json({ message: 'Invalid CSRF token' }, { status: 400 })
      const at = Date.now()
      activity.set(cookies[cookieName]!, at)
      return HttpResponse.json({ lastSeenAt: at, idleTimeoutMinutes: 30 })
    }),
    http.get('*/bff/sessions', ({ cookies }) => signedIn(cookies)
      ? HttpResponse.json({ sessions: [{
          id: 'msw-current-session-01', userAgent: 'Mozilla/5.0 (Windows NT 10.0) Edg/120.0', current: true,
          createdAt: Number(cookies[cookieName]), lastSeenAt: lastSeen(cookies), expiresAt: Number(cookies[cookieName]) + 3_600_000
        }] })
      : guest()),
    http.get('*/bff/api/account/deletion-preflight', ({ cookies }) => signedIn(cookies)
      ? HttpResponse.json({
          blockers: [{ code: 'last-active-administrator', workspaceId, workspaceName: 'MSW 采购演示公司' }], requiresRetentionReview: true
        })
      : guest()),
    http.get('*/bff/antiforgery', ({ cookies }) => signedIn(cookies) ? HttpResponse.json({ requestToken: csrf }) : guest()),
    http.post('*/bff/logout', async ({ request, cookies }) => {
      if (!signedIn(cookies)) return guest()
      const token = request.headers.get('X-CSRF-TOKEN') ?? new URLSearchParams(await request.text()).get('__RequestVerificationToken')
      if (token !== csrf) return HttpResponse.json({ message: 'Invalid CSRF token' }, { status: 400 })
      return redirect(new URL('/', request.url).href, '; Max-Age=0', 303)
    }),
    http.get('*/bff/logout', ({ request }) => new HttpResponse(null, {
      status: 302, headers: { Location: new URL('/', request.url).href }
    }))
  ]
}

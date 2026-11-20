import { createError, defineEventHandler, getHeader, proxyRequest, readRawBody, setResponseHeader } from 'h3'
import type { H3Event } from 'h3'
import { bffConfig } from '../../../utils/runtime/bff-config'
import { requireCsrf } from '../../../utils/auth/bff-csrf'
import { requireFreshBffSession } from '../../../utils/auth/bff-oidc'
import { evaluateMfaGate } from '../../../utils/auth/bff-mfa'
import { businessRouteAllowed } from '../../../utils/proxy/business-routes'

const safeMethods = new Set(['GET', 'HEAD', 'OPTIONS'])
const documentOrderPath = /^\/api\/(?:sales|purchasing)\/workspaces\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/orders$/i
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const emptyUuid = '00000000-0000-0000-0000-000000000000'

function operationIdOf(raw: string | undefined, idempotencyKey?: string): string | undefined {
  if (!raw) return undefined
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return undefined
    const legacy = Object.entries(parsed).findLast(([name]) => name.toLowerCase() === 'operationid')?.[1]
    if (idempotencyKey === undefined) return typeof legacy === 'string' && legacy ? legacy : undefined

    const field = idempotencyKey.trim()
    const key = field.startsWith('"') && field.endsWith('"') ? field.slice(1, -1) : field
    if (!uuid.test(key) || key === emptyUuid) return undefined
    if (legacy != null && (typeof legacy !== 'string' || legacy.toLowerCase() !== key.toLowerCase())) return undefined
    return key.toLowerCase()
  } catch { return undefined }
}
const forwardedHeaders = ['accept', 'content-type', 'idempotency-key', 'if-match', 'if-none-match', 'range', 'traceparent', 'tracestate']

export default defineEventHandler(async (event) => {
  const path = event.path.slice('/bff'.length)
  const pathname = path.split('?')[0]!
  if (!businessRouteAllowed(event.method, pathname))
    throw createError({ statusCode: 404, statusMessage: 'API route not published' })
  if (!safeMethods.has(event.method)) await requireCsrf(event)
  const session = await requireFreshBffSession(event)
  const { gateway, mfa } = bffConfig(event)
  const gate = evaluateMfaGate(mfa, session, event.method, pathname)
  if (!gate.allowed)
    throw createError({ statusCode: 403, statusMessage: 'Multi-factor verification required', data: { code: gate.code, reauthPath: '/bff/login?prompt=login' } })
  const target = new URL(gateway.origin + path)
  if (!target.pathname.startsWith('/api/') || target.origin !== gateway.origin || /%(?:2f|5c)/i.test(target.pathname))
    throw createError({ statusCode: 400, statusMessage: 'Invalid API route' })

  const documentOrder = event.method === 'POST' ? documentOrderPath.exec(target.pathname) : null
  if (documentOrder) return reserveAndProxyDocumentOrder(event, target, session.accessToken, documentOrder[1]!, getHeader(event, 'idempotency-key'))

  return proxyRequest(event, target.href, {
    streamRequest: true,
    fetchOptions: { redirect: 'manual' },
    fetch: async (input, init) => {
      const headers = new Headers({ Authorization: 'Bearer ' + session.accessToken })
      for (const name of forwardedHeaders) {
        const value = getHeader(event, name)
        if (value !== undefined) headers.set(name, value)
      }
      const response = await fetch(input, { ...init, headers })
      return browserApiResponse(response)
    },
    onResponse: (event) => {
      setResponseHeader(event, 'Cache-Control', 'no-store')
    }
  })
})

// Reserve quota with the operation ID the order endpoint uses, then forward the original request.
async function reserveAndProxyDocumentOrder(
  event: H3Event,
  target: URL,
  accessToken: string,
  workspaceId: string,
  idempotencyKey: string | undefined
): Promise<Response> {
  const raw = await readRawBody(event)
  const operationId = operationIdOf(raw, idempotencyKey)
  if (idempotencyKey !== undefined && !operationId) {
    return Response.json({
      status: 400, title: 'Invalid order request', code: target.pathname.startsWith('/api/sales/') ? 'sales.invalid_request' : 'request.invalid',
      detail: 'Provide one non-empty UUID in Idempotency-Key. If operationId is also supplied, the values must agree.'
    }, { status: 400, headers: { 'content-type': 'application/problem+json', 'cache-control': 'no-store' } })
  }
  if (operationId) {
    try {
      const reservation = await fetch(gatewayOrigin(event) + '/api/workspaces/' + workspaceId + '/billing/usage/documents', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + accessToken, 'content-type': 'application/json' },
        body: JSON.stringify({ operationId, count: 1 }),
        redirect: 'manual'
      })
      if (!reservation.ok) {
        setResponseHeader(event, 'Cache-Control', 'no-store')
        return browserApiResponse(reservation)
      }
    } catch {
      throw createError({ statusCode: 503, statusMessage: 'Document quota could not be confirmed' })
    }
  }
  const headers = new Headers({ Authorization: 'Bearer ' + accessToken })
  for (const name of forwardedHeaders) {
    const value = getHeader(event, name)
    if (value !== undefined) headers.set(name, value)
  }
  headers.set('content-type', getHeader(event, 'content-type') ?? 'application/json')
  const response = await fetch(target.href, { method: 'POST', headers, body: raw ?? undefined, redirect: 'manual' })
  setResponseHeader(event, 'Cache-Control', 'no-store')
  return browserApiResponse(response)
}

function browserApiResponse(response: Response): Response {
  const headers = new Headers(response.headers)
  headers.delete('set-cookie')
  const location = headers.get('location')
  if ((response.status === 201 || response.status === 202) && location?.startsWith('/api/'))
    headers.set('location', '/bff' + location)
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers })
}

function gatewayOrigin(event: H3Event): string {
  return bffConfig(event).gateway.origin
}

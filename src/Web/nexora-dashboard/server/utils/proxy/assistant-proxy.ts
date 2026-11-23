import { randomUUID } from 'node:crypto'
import { createError, getHeader, readRawBody, type H3Event } from 'h3'
import { withBffRedis } from '../session/bff-redis'

async function demandAssistantAccess(target: URL, workspace: string, token: string) {
  let response: Response
  try {
    response = await fetch(new URL(`/api/workspaces/${workspace}/billing/entitlements`, target.origin), {
      headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' }, redirect: 'error', signal: AbortSignal.timeout(5000)
    })
  } catch {
    throw createError({ statusCode: 503, statusMessage: 'Workspace entitlements unavailable' })
  }
  if ([403, 404].includes(response.status)) throw createError({ statusCode: 404, statusMessage: 'Workspace not found' })
  const result = await response.json().catch(() => null) as { modules?: unknown } | null
  if (!response.ok || !Array.isArray(result?.modules)) throw createError({ statusCode: 503, statusMessage: 'Workspace entitlements unavailable' })
  if (!result.modules.includes('assistant')) {
    throw createError({ statusCode: 403, statusMessage: 'Workspace plan does not include Assistant', data: { code: 'module.not_in_plan' } })
  }
}

export async function proxyAssistant(event: H3Event, target: URL, token: string, match: RegExpExecArray) {
  const [, workspace, relative, execution, action] = match
  await demandAssistantAccess(target, workspace!, token)
  const stream = relative === 'runs' || action === 'resume'
  const isDecision = action === 'approve' || action === 'reject'
  const leaseKey = isDecision ? 'nexora:dashboard:assistant-decision:' + workspace!.toLowerCase() + ':' + execution!.toLowerCase() : undefined
  const requestHeaders = new Headers({ Authorization: 'Bearer ' + token,
    Accept: stream ? 'text/event-stream, application/problem+json' : 'application/json, application/problem+json' })
  const body = event.method === 'POST' ? await readRawBody(event) : undefined
  if (event.method === 'POST') requestHeaders.set('Content-Type', 'application/json')
  for (const name of ['traceparent', 'tracestate']) {
    const value = getHeader(event, name)
    if (value) requestHeaders.set(name, value)
  }

  const lease = randomUUID()
  if (leaseKey && !await withBffRedis(event, redis => redis.set(leaseKey, lease, { NX: true, EX: 30 }))) {
    throw createError({ statusCode: 409, statusMessage: 'An approval decision is in progress', data: { code: 'assistant.decision_pending' } })
  }
  const connection = new AbortController()
  const res = event.node.res
  const disconnect = () => {
    if (!res.writableEnded) connection.abort()
  }
  if (stream) res.once('close', disconnect)
  let upstream: Response
  try {
    upstream = await fetch(target, { method: event.method, headers: requestHeaders, body: body ?? undefined, redirect: 'error',
      signal: stream ? AbortSignal.any([connection.signal, AbortSignal.timeout(125_000)]) : AbortSignal.timeout(10_000) })
  } catch {
    if (stream) res.off('close', disconnect)
    // Keep a decision lease until expiry when the upstream result is unknown.
    throw createError({ statusCode: 503, statusMessage: 'Assistant service unavailable' })
  }
  if (leaseKey) {
    await withBffRedis(event, redis => redis.eval(`
      if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) end
      return 0
    `, { keys: [leaseKey], arguments: [lease] })).catch(() => {})
  }
  const responseHeaders = new Headers({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' })
  for (const name of ['content-type', 'retry-after', 'traceparent']) {
    const value = upstream.headers.get(name)
    if (value) responseHeaders.set(name, value)
  }
  return new Response(upstream.body, { status: upstream.status, headers: responseHeaders })
}

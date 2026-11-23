import { describe, expect, it } from 'vitest'
import { RequestScope, ScopeChangedError } from '../app/utils/api/scope'
import { ApiFailure, createApiClient, PendingResultError, ResultUnknownError } from '../app/utils/api/client'

const initial = { mode: 'live', subject: 'alice', workspaceId: 'one', authorizationVersion: '1' }
const response = (status: number, data: unknown, headers = {}) => ({ status, data, headers: new Headers(headers) })

describe('identity scoped API requests', () => {
  it('aborts and rejects a late response after switching workspace', async () => {
    const scope = new RequestScope(initial)
    let finish!: (value: ReturnType<typeof response>) => void
    const api = createApiClient(scope, () => new Promise((resolve) => {
      finish = resolve
    }))
    const pending = api.get('/bff/api/workspaces')
    const old = scope.capture()
    scope.change({ ...initial, workspaceId: 'two' })
    expect(old.signal.aborted).toBe(true)
    finish(response(200, ['old workspace']))
    await expect(pending).rejects.toBeInstanceOf(ScopeChangedError)
    expect(scope.key('catalog')).toContain('two')
  })

  it('parses ProblemDetails and Nitro MFA failures without retrying writes', async () => {
    const scope = new RequestScope(initial)
    const api = createApiClient(scope, async () => response(403, { data: { code: 'mfa_step_up_required', reauthPath: '/bff/login?prompt=login' } }))
    await expect(api.get('/bff/api/workspaces')).rejects.toMatchObject({ status: 403, code: 'mfa_step_up_required', kind: 'mfa' })
    const failure = new ApiFailure(response(412, { code: 'masterdata.precondition_failed', traceId: 'trace-one' }))
    expect(failure.kind).toBe('version')
    expect(failure.traceId).toBe('trace-one')
  })

  it('coalesces double submits, preserves the operation ID and requires readback after response loss', async () => {
    let writes = 0
    let release!: () => void
    const scope = new RequestScope(initial)
    const api = createApiClient(scope, async (_url, options) => {
      if (options.method === 'GET') return response(200, { requestToken: 'csrf' })
      writes++
      if (writes === 1) {
        await new Promise<void>((resolve) => {
          release = resolve
        })
        throw new TypeError('response lost')
      }
      return response(200, { name: 'saved' })
    })
    const op = api.createWrite('/bff/api/items/one', { name: 'saved' }, { method: 'PUT', etag: '"1"', idempotent: true })
    const first = op.send()
    const second = op.send()
    await Promise.resolve()
    await Promise.resolve()
    release()
    await expect(first).rejects.toBeInstanceOf(ResultUnknownError)
    await expect(second).rejects.toBeInstanceOf(ResultUnknownError)
    expect(writes).toBe(1)
    const id = op.operationId
    await expect(op.send()).rejects.toBeInstanceOf(ResultUnknownError)
    await op.readBack(async () => ({ applied: false }))
    await op.retryExplicitly()
    expect(op.operationId).toBe(id)
    expect(writes).toBe(2)
    scope.change({ ...initial, subject: 'bob' })
    await expect(op.retryExplicitly()).rejects.toBeInstanceOf(ScopeChangedError)
  })

  it('stops 202 queries on completion, total budget, cancellation and scope change', async () => {
    const scope = new RequestScope(initial)
    let reads = 0
    const api = createApiClient(scope, async () => response(++reads === 1 ? 202 : 200, {}, { 'Retry-After': '0' }))
    expect((await api.poll('/bff/api/status', { complete: result => result.status === 200, budgetMs: 1000 })).status).toBe(200)
    expect(reads).toBe(2)
    let aborted = false
    const slow = createApiClient(scope, (_path, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => {
        aborted = true
        reject(new DOMException('aborted', 'AbortError'))
      })
    }))
    await expect(slow.poll('/bff/api/status', { complete: () => false, budgetMs: 30 })).rejects.toBeInstanceOf(PendingResultError)
    expect(aborted).toBe(true)
    const cancel = new AbortController()
    const pending = slow.poll('/bff/api/status', { complete: () => false, signal: cancel.signal })
    cancel.abort()
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    const changed = slow.poll('/bff/api/status', { complete: () => false })
    scope.change({ ...initial, authorizationVersion: '2' })
    await expect(changed).rejects.toBeInstanceOf(ScopeChangedError)
  })

  it('sends a revision and CSRF without an operation ID for writes without idempotency support', async () => {
    const scope = new RequestScope(initial)
    const api = createApiClient(scope, async (path, options) => {
      if (path === '/bff/antiforgery') return response(200, { requestToken: 'csrf' })
      expect(options).toMatchObject({ method: 'PUT', headers: { 'If-Match': '"3"', 'X-CSRF-TOKEN': 'csrf' }, body: { name: '新品牌' } })
      expect(options.headers).not.toHaveProperty('Idempotency-Key')
      expect(options.body).not.toHaveProperty('operationId')
      return response(200, {}, { 'Content-Type': 'application/json' })
    })
    const operation = api.createWrite('/bff/api/workspaces/one/settings', { name: '新品牌' }, { method: 'PUT', etag: '"3"', idempotent: false })
    await expect(operation.send()).resolves.toMatchObject({ status: 200 })
  })

  it('retains binary headers and treats a non-JSON write response as unknown', async () => {
    const scope = new RequestScope(initial)
    const api = createApiClient(scope, async (_path, options) => options.method === 'GET'
      ? response(200, options.responseType === 'blob' ? new Blob(['csv']) : { requestToken: 'csrf' }, { 'ETag': '"7"', 'Content-Disposition': 'attachment; filename=report.csv' })
      : response(200, '<html>gateway down</html>', { 'Content-Type': 'text/html' }))
    expect((await api.get('/bff/api/report.csv', { responseType: 'blob' })).headers.get('Content-Disposition')).toContain('report.csv')
    const operation = api.createWrite('/bff/api/items', { name: 'once' })
    await expect(operation.send()).rejects.toBeInstanceOf(ResultUnknownError)
    expect(operation.state).toBe('unknown')
    await operation.readBack(async () => ({ applied: false }))
    expect(operation.retryAvailable).toBe(false)
    await expect(operation.retryExplicitly()).rejects.toBeInstanceOf(ResultUnknownError)
  })
})

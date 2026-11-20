import { afterEach, expect, it, vi } from 'vitest'
import { createApiClient, ResultUnknownError } from '../app/utils/api/client'
import { RequestScope } from '../app/utils/api/scope'

afterEach(() => vi.useRealTimers())
it('bounds a read even when the transport is given a workspace cancellation signal', async () => {
  vi.useFakeTimers()
  const transport = vi.fn((_path, options) => new Promise<never>((_resolve, reject) => options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true })))
  const api = createApiClient(new RequestScope({ mode: 'live', subject: 'alice', workspaceId: 'one', authorizationVersion: '1' }), transport)
  const pending = expect(api.get('/bff/api/finance/workspaces/one/trade/receipts')).rejects.toThrow('请求超时')
  await vi.advanceTimersByTimeAsync(10000)
  await pending
  expect(transport).toHaveBeenCalledTimes(1)
})
it('keeps a timed out write unknown and never sends it again automatically', async () => {
  vi.useFakeTimers()
  const transport = vi.fn(async (path, options) => {
    if (path === '/bff/antiforgery') return { status: 200, data: { requestToken: 'csrf' }, headers: new Headers() }
    return new Promise<never>((_resolve, reject) => options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true }))
  })
  const api = createApiClient(new RequestScope({ mode: 'live', subject: 'alice', workspaceId: 'one', authorizationVersion: '1' }), transport)
  const operation = api.createWrite('/bff/api/trade/documents', { amount: '600' }, { idempotent: true })
  const pending = expect(operation.send()).rejects.toBeInstanceOf(ResultUnknownError)
  await vi.advanceTimersByTimeAsync(10000)
  await pending
  expect(operation.state).toBe('unknown')
  expect(operation.retryAvailable).toBe(false)
  expect(transport).toHaveBeenCalledTimes(2)
})

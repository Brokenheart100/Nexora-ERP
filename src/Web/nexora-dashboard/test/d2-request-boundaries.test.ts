import { describe, expect, it, vi } from 'vitest'
import { ApiFailure, createApiClient } from '../app/utils/api/client'
import { RequestScope, ScopeChangedError } from '../app/utils/api/scope'

const identity = { mode: 'live', subject: 'alice', workspaceId: 'one', authorizationVersion: '1' }
const response = (status: number) => ({ status, data: {}, headers: new Headers() })

describe('D2 request ownership boundaries', () => {
  it('does not revive an old write after leaving and returning to the same workspace', async () => {
    const scope = new RequestScope(identity)
    const transport = vi.fn(async () => response(200))
    const api = createApiClient(scope, transport)
    const write = api.createWrite('/bff/api/items/one', { name: 'original' })
    scope.change({ ...identity, workspaceId: 'two' })
    scope.change(identity)
    await expect(write.send()).rejects.toBeInstanceOf(ScopeChangedError)
    expect(transport).not.toHaveBeenCalled()
  })

  it('rejects an externally cancelled read even if the transport completes late', async () => {
    let finish!: (value: ReturnType<typeof response>) => void
    const api = createApiClient(new RequestScope(identity), () => new Promise((resolve) => {
      finish = resolve
    }))
    const controller = new AbortController()
    const pending = api.get('/bff/api/items', { signal: controller.signal })
    controller.abort()
    finish(response(200))
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('keeps the original 401 error when notifying the identity owner', async () => {
    const scope = new RequestScope(identity)
    const onFailure = vi.fn(() => scope.change({ ...identity, subject: '' }))
    const api = createApiClient(scope, async () => response(401), { onFailure })
    await expect(api.get('/bff/api/workspaces')).rejects.toBeInstanceOf(ApiFailure)
    expect(onFailure).toHaveBeenCalledTimes(1)
    expect(scope.identity.subject).toBe('')
  })
})

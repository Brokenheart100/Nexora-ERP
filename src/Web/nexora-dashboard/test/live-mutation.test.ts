import { describe, expect, it, vi } from 'vitest'
import { ApiFailure, createApiClient } from '../app/utils/api/client'
import { RequestScope } from '../app/utils/api/scope'
import { useLiveMutation } from '../app/composables/useLiveMutation'

describe('live forms preserve unknown submissions', () => {
  it('keeps the original submission until readback and explicit retry', async () => {
    const ids: string[] = []
    const client = createApiClient(new RequestScope({ mode: 'live', subject: 'one', workspaceId: 'one', authorizationVersion: '1' }), async (_path, options) => {
      if (options.method === 'GET') return { status: 200, data: { requestToken: 'csrf' }, headers: new Headers() }
      ids.push(options.headers['Idempotency-Key']!)
      if (ids.length === 1) throw new TypeError('response lost')
      return { status: 201, data: { id: 'created', version: 1 }, headers: new Headers() }
    })
    const form = useLiveMutation<{ id: string, version: number }>()
    const make = vi.fn(() => client.createWrite<{ id: string, version: number }>('/bff/api/items', { name: 'original' }, { idempotent: true }))
    expect(await form.run(make)).toBeNull()
    expect(form.unknown.value).toBe(true)
    expect(await form.run(make)).toBeNull()
    expect(make).toHaveBeenCalledTimes(1)
    await form.check(async () => {
      throw new ApiFailure({ status: 503, data: {}, headers: new Headers() })
    })
    expect(form.unknown.value).toBe(true)
    expect(await form.check(async () => null)).toBeNull()
    expect(form.operation.value?.retryAvailable).toBe(true)
    expect((await form.retry())?.data.id).toBe('created')
    expect(ids).toHaveLength(2)
    expect(ids[1]).toBe(ids[0])
  })
})

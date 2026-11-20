import { expect, it } from 'vitest'
import { createApiClient } from '../app/utils/api/client'
import { RequestScope } from '../app/utils/api/scope'
import { changeSchema } from '../shared/types/purchasing'

it('keeps an invalid successful write receipt unknown rather than permitting a new submission', async () => {
  const client = createApiClient(new RequestScope({ mode: 'live', subject: 'one', workspaceId: 'one', authorizationVersion: '1' }), async (_path, options) => ({ status: options.method === 'GET' ? 200 : 201, data: options.method === 'GET' ? { requestToken: 'csrf' } : {}, headers: new Headers() }))
  const operation = client.createWrite('/bff/api/orders', {}, { idempotent: true, parse: data => changeSchema.parse(data) })
  await expect(operation.send()).rejects.toThrow('结果待确认')
  expect(operation.state).toBe('unknown')
})

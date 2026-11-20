import { describe, expect, it } from 'vitest'
import { businessRouteAllowed } from '../server/utils/proxy/business-routes'

describe('BFF business route boundary', () => {
  const id = '11111111-1111-4111-8111-111111111111'

  it('allows published methods and UUID-scoped business paths', () => {
    expect(businessRouteAllowed('GET', '/api/workspaces')).toBe(true)
    expect(businessRouteAllowed('POST', '/api/workspaces')).toBe(true)
    expect(businessRouteAllowed('GET', `/api/masterdata/workspaces/${id}/catalog`)).toBe(true)
    expect(businessRouteAllowed('PUT', `/api/masterdata/workspaces/${id}/items/${id}`)).toBe(true)
  })

  it('rejects methods and paths outside the published web contracts', () => {
    for (const path of ['/api/admin', '/api/cli/workspaces', '/api/workspaces/not-a-uuid', '/api//workspaces', '/api/workspaces/../admin', '/api/workspaces%2fadmin', '//example.com/api/workspaces'])
      expect(businessRouteAllowed('GET', path), path).toBe(false)
    expect(businessRouteAllowed('DELETE', '/api/workspaces')).toBe(false)
    expect(businessRouteAllowed('TRACE', '/api/workspaces')).toBe(false)
  })
})

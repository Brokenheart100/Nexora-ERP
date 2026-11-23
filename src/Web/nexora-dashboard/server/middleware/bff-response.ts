import { createError, defineEventHandler, getHeader, setResponseHeader } from 'h3'
import { bffConfig } from '../utils/runtime/bff-config'

export default defineEventHandler((event) => {
  const path = event.path.split('?')[0]
  if (path === '/invoice-share' || path === '/invoice-share/' || path === '/cli/authorize' || path === '/mcp/authorize') {
    setResponseHeader(event, 'Cache-Control', 'no-store')
    setResponseHeader(event, 'Referrer-Policy', 'no-referrer')
    setResponseHeader(event, 'X-Content-Type-Options', 'nosniff')
  }
  if (path === '/bff' || path?.startsWith('/bff/')
    || path === '/signin-oidc' || path === '/signout-oidc' || path === '/signout-callback-oidc') {
    setResponseHeader(event, 'Cache-Control', 'no-store')
    setResponseHeader(event, 'Referrer-Policy', 'no-referrer')
    if (getHeader(event, 'host') !== bffConfig(event).origin.host)
      throw createError({ statusCode: 404, statusMessage: 'Route not found' })
  }
})

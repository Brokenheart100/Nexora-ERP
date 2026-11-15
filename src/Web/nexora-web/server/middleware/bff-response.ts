import { createError, defineEventHandler, getHeader, setResponseHeader } from 'h3'
import { bffConfig } from '../utils/bff-config'

export default defineEventHandler((event) => {
  const path = event.path.split('?')[0]
  if (path === '/bff' || path?.startsWith('/bff/') ||
      path === '/signin-oidc' || path === '/signout-oidc' || path === '/signout-callback-oidc') {
    setResponseHeader(event, 'Cache-Control', 'no-store')
    setResponseHeader(event, 'Referrer-Policy', 'no-referrer')
    if (getHeader(event, 'host') !== bffConfig(event).origin.host)
      throw createError({ statusCode: 404, statusMessage: 'Route not found' })
  }
})

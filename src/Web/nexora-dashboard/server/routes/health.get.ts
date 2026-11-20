import { createError, defineEventHandler, setResponseHeader } from 'h3'
import { bffConfig } from '../utils/runtime/bff-config'
import { withBffRedis } from '../utils/session/bff-redis'

export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'Cache-Control', 'no-store')
  if (useRuntimeConfig(event).public.dataMode === 'mock') return { status: 'Healthy', mode: 'mock' }
  const { issuer, gateway } = bffConfig(event)
  try {
    await Promise.all([
      withBffRedis(event, redis => redis.ping()),
      fetch(issuer.href.replace(/\/$/, '') + '/.well-known/openid-configuration', {
        signal: AbortSignal.timeout(3000), redirect: 'error'
      }).then(async (response) => {
        await response.body?.cancel()
        if (!response.ok) throw new Error('Identity provider unavailable')
      }),
      fetch(new URL('/alive', gateway), { signal: AbortSignal.timeout(3000), redirect: 'error' }).then(async (response) => {
        await response.body?.cancel()
        if (!response.ok) throw new Error('Business Gateway unavailable')
      })
    ])
    return { status: 'Healthy' }
  } catch {
    throw createError({ statusCode: 503, statusMessage: 'Web session service unavailable' })
  }
})

import { createError, defineEventHandler, setResponseHeader } from 'h3'
import { bffConfig } from '../utils/runtime/bff-config'
import { withBffRedis } from '../utils/session/bff-redis'

export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'Cache-Control', 'no-store')
  const { issuer } = bffConfig(event)
  try {
    await Promise.all([
      withBffRedis(event, redis => redis.ping()),
      fetch(issuer.href.replace(/\/$/, '') + '/.well-known/openid-configuration', {
        signal: AbortSignal.timeout(3000), redirect: 'error',
      }).then(async (response) => {
        await response.body?.cancel()
        if (!response.ok) throw new Error('Identity provider unavailable')
      }),
    ])
    return { status: 'Healthy' }
  } catch {
    throw createError({ statusCode: 503, statusMessage: 'Web session service unavailable' })
  }
})

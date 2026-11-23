import { createError, defineEventHandler, getQuery, setHeader } from 'h3'
import { sessionHandle } from '../../utils/session/bff-session'
import { enforceSessionIdle, fetchSessionPolicy } from '../../utils/session/bff-session-policy'
import { requireFreshBffSession } from '../../utils/auth/bff-oidc'

export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'no-store')
  const session = await requireFreshBffSession(event)
  const handle = sessionHandle(event)
  if (!handle) throw createError({ statusCode: 401, statusMessage: 'Sign in required' })
  const policy = await fetchSessionPolicy(event, session, getQuery(event).refresh === '1')
  const lastSeenAt = await enforceSessionIdle(event, handle, policy)
  return { ...policy, lastSeenAt }
})

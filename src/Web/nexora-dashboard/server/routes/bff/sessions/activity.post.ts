import { createError, defineEventHandler, setHeader } from 'h3'
import { requireCsrf } from '../../../utils/auth/bff-csrf'
import { sessionHandle, touchBffSession } from '../../../utils/session/bff-session'
import { fetchSessionPolicy } from '../../../utils/session/bff-session-policy'
import { requireFreshBffSession } from '../../../utils/auth/bff-oidc'

export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'no-store')
  await requireCsrf(event)
  const session = await requireFreshBffSession(event)
  const handle = sessionHandle(event)
  if (!handle) throw createError({ statusCode: 401, statusMessage: 'Sign in required' })
  const policy = await fetchSessionPolicy(event, session)
  const lastSeenAt = await touchBffSession(event, handle, session, policy.idleTimeoutMinutes)
  return { lastSeenAt, idleTimeoutMinutes: policy.idleTimeoutMinutes }
})

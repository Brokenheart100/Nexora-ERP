import { createError, defineEventHandler, setHeader } from 'h3'
import { requireCsrf } from '../../../utils/auth/bff-csrf'
import { readBffSession, sessionHandle, touchBffSession } from '../../../utils/session/bff-session'
import { enforceSessionIdle, fetchSessionPolicy } from '../../../utils/session/bff-session-policy'

export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'no-store')
  await requireCsrf(event)
  const session = await readBffSession(event)
  const handle = sessionHandle(event)
  if (!session || !handle) throw createError({ statusCode: 401, statusMessage: 'Sign in required' })
  const policy = await fetchSessionPolicy(event, session)
  await enforceSessionIdle(event, handle, policy)
  const lastSeenAt = await touchBffSession(event, handle, session, true)
  return { lastSeenAt, idleTimeoutMinutes: policy.idleTimeoutMinutes }
})

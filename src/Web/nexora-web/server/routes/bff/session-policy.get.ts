import { createError, defineEventHandler, getQuery, setHeader } from 'h3'
import { readBffSession, sessionHandle } from '../../utils/bff-session'
import { enforceSessionIdle, fetchSessionPolicy } from '../../utils/bff-session-policy'

export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'no-store')
  const session = await readBffSession(event)
  const handle = sessionHandle(event)
  if (!session || !handle) throw createError({ statusCode: 401, statusMessage: 'Sign in required' })
  const policy = await fetchSessionPolicy(event, session, getQuery(event).refresh === '1')
  const lastSeenAt = await enforceSessionIdle(event, handle, policy)
  return { ...policy, lastSeenAt }
})

import { defineEventHandler } from 'h3'
import { requireFreshBffSession } from '../../utils/auth/bff-oidc'
import { listBffSessions, sessionHandle } from '../../utils/session/bff-session'

export default defineEventHandler(async (event) => {
  const session = await requireFreshBffSession(event)
  const handle = sessionHandle(event)
  if (!handle) return { sessions: [] }
  return { sessions: await listBffSessions(event, session, handle) }
})

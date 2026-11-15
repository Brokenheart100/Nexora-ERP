import { defineEventHandler } from 'h3'
import { requireFreshBffSession } from '../../../utils/bff-oidc'
import { requireCsrf } from '../../../utils/bff-csrf'
import { revokeOtherBffSessions, sessionHandle } from '../../../utils/bff-session'

export default defineEventHandler(async (event) => {
  await requireCsrf(event)
  const session = await requireFreshBffSession(event)
  const handle = sessionHandle(event)
  if (!handle) return { revoked: 0 }
  return { revoked: await revokeOtherBffSessions(event, session, handle) }
})

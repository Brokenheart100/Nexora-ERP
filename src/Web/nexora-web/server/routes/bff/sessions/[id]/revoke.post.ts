import { createError, defineEventHandler, getRouterParam } from 'h3'
import { requireFreshBffSession } from '../../../../utils/auth/bff-oidc'
import { requireCsrf } from '../../../../utils/auth/bff-csrf'
import { revokeBffSession, sessionHandle } from '../../../../utils/session/bff-session'

export default defineEventHandler(async (event) => {
  await requireCsrf(event)
  const session = await requireFreshBffSession(event)
  const id = getRouterParam(event, 'id')
  if (!id || !/^[\w-]{22}$/.test(id)) throw createError({ statusCode: 400, statusMessage: 'Invalid session id' })
  const result = await revokeBffSession(event, session.subject, id, sessionHandle(event))
  if (!result.revoked) throw createError({ statusCode: 404, statusMessage: 'Session not found' })
  return result
})

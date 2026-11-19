import { defineEventHandler, sendRedirect } from 'h3'
import { bffConfig } from '../../utils/runtime/bff-config'
import { requireFreshBffSession } from '../../utils/auth/bff-oidc'

export default defineEventHandler(async (event) => {
  await requireFreshBffSession(event)
  return sendRedirect(event, bffConfig(event).issuer.href.replace(/\/$/, '') + '/account/')
})

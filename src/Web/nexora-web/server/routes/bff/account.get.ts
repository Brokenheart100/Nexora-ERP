import { defineEventHandler, sendRedirect } from 'h3'
import { bffConfig } from '../../utils/bff-config'
import { requireFreshBffSession } from '../../utils/bff-oidc'

export default defineEventHandler(async (event) => {
  await requireFreshBffSession(event)
  return sendRedirect(event, bffConfig(event).issuer.href.replace(/\/$/, '') + '/account/')
})

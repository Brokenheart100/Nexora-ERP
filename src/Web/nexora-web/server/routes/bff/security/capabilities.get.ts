import { defineEventHandler } from 'h3'
import { bffConfig } from '../../../utils/bff-config'
import { securityCapabilities } from '../../../utils/bff-mfa'
import { requireFreshBffSession } from '../../../utils/bff-oidc'

export default defineEventHandler(async (event) => {
  const session = await requireFreshBffSession(event)
  return securityCapabilities(bffConfig(event).mfa, session)
})

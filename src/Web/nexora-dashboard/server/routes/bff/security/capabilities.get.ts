import { defineEventHandler } from 'h3'
import { bffConfig } from '../../../utils/runtime/bff-config'
import { securityCapabilities } from '../../../utils/auth/bff-mfa'
import { requireFreshBffSession } from '../../../utils/auth/bff-oidc'

export default defineEventHandler(async (event) => {
  const session = await requireFreshBffSession(event)
  return securityCapabilities(bffConfig(event).mfa, session)
})

import { defineEventHandler } from 'h3'
import { bffConfig } from '../../../../utils/runtime/bff-config'
import { scopeFor } from '../../../../utils/auth/bff-cli'

export default defineEventHandler((event) => {
  const settings = bffConfig(event)
  return {
    clientId: settings.mcp.clientId,
    scopes: scopeFor('mcp', settings.mcp.scopes),
    authorizationPage: '/cli/authorize',
    deviceEndpoint: '/bff/auth/mcp/device',
    tokenEndpoint: '/bff/auth/mcp/token',
    revokeEndpoint: '/bff/auth/mcp/revoke',
    verificationEndpoint: '/bff/auth/mcp/verification',
  }
})

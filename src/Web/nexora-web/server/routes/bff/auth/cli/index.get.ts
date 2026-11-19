import { defineEventHandler } from 'h3'
import { bffConfig } from '../../../../utils/runtime/bff-config'
import { cliScope } from '../../../../utils/auth/bff-cli'

export default defineEventHandler((event) => {
  const settings = bffConfig(event)
  return {
    clientId: settings.cli.clientId,
    scopes: cliScope(settings.cli.scopes),
    authorizationPage: '/cli/authorize',
    deviceEndpoint: '/bff/auth/cli/device',
    tokenEndpoint: '/bff/auth/cli/token',
    revokeEndpoint: '/bff/auth/cli/revoke',
    verificationEndpoint: '/bff/auth/cli/verification',
  }
})

import { createError, defineEventHandler, getQuery } from 'h3'
import { bffConfig } from '../../../../utils/bff-config'
import { keycloakVerificationUrl, verificationPageUrl } from '../../../../utils/bff-cli'

export default defineEventHandler((event) => {
  const code = getQuery(event).user_code
  if (typeof code !== 'string' || !code.trim())
    throw createError({ statusCode: 400, statusMessage: 'A user code is required' })
  const settings = bffConfig(event)
  return {
    userCode: code.trim(),
    url: keycloakVerificationUrl(settings.issuer, code.trim()),
    page: verificationPageUrl(settings.origin, code.trim()),
  }
})

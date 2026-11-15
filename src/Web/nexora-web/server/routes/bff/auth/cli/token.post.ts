import { createError, defineEventHandler, readBody, setResponseStatus } from 'h3'
import { exchangeDeviceCode, isCodeVerifier } from '../../../../utils/bff-cli'

export default defineEventHandler(async (event) => {
  const body = await readBody<{ deviceCode?: unknown, codeVerifier?: unknown }>(event).catch(() => undefined)
  const deviceCode = typeof body?.deviceCode === 'string' ? body.deviceCode : ''
  const verifier = body?.codeVerifier
  if (!deviceCode || !isCodeVerifier(verifier))
    throw createError({ statusCode: 400, statusMessage: 'A device code and PKCE verifier are required' })
  const result = await exchangeDeviceCode(event, deviceCode, verifier)
  setResponseStatus(event, result.status)
  return result.body
})

import { createError, defineEventHandler, readBody } from 'h3'
import { deviceAuthorization, isCodeChallenge } from '../../../../utils/bff-cli'

export default defineEventHandler(async (event) => {
  const body = await readBody<{ codeChallenge?: unknown }>(event).catch(() => undefined)
  const challenge = body?.codeChallenge
  if (!isCodeChallenge(challenge))
    throw createError({ statusCode: 400, statusMessage: 'A PKCE code challenge is required' })
  return deviceAuthorization(event, challenge, 'mcp')
})

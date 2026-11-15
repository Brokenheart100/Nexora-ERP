import { createError, defineEventHandler, readBody, sendNoContent } from 'h3'
import { revokeCliToken } from '../../../../utils/bff-cli'

export default defineEventHandler(async (event) => {
  const body = await readBody<{ token?: unknown, tokenTypeHint?: unknown }>(event).catch(() => undefined)
  const token = typeof body?.token === 'string' ? body.token.trim() : ''
  if (!token)
    throw createError({ statusCode: 400, statusMessage: 'A token is required' })
  const hint = body?.tokenTypeHint === 'refresh_token' ? 'refresh_token' : 'access_token'
  await revokeCliToken(event, token, hint)
  return sendNoContent(event)
})

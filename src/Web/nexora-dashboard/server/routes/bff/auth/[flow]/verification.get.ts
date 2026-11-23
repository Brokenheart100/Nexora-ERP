import { createError, defineEventHandler, getQuery, getRouterParam, sendRedirect } from 'h3'
import { deviceClientSchema, deviceUserCodeSchema } from '../../../../../shared/types/device-authorization'
import { deviceVerificationUrl } from '../../../../utils/auth/bff-device'

export default defineEventHandler((event) => {
  if (!deviceClientSchema.safeParse(getRouterParam(event, 'flow')).success) throw createError({ statusCode: 404, statusMessage: 'Device client not found' })
  const code = deviceUserCodeSchema.safeParse(getQuery(event).user_code)
  if (!code.success) throw createError({ statusCode: 400, statusMessage: 'Invalid device user code' })
  return sendRedirect(event, deviceVerificationUrl(event, code.data))
})

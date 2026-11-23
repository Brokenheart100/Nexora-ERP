import { createError, defineEventHandler, getRouterParam } from 'h3'
import { z } from 'zod'
import { deviceClientSchema } from '../../../../../shared/types/device-authorization'
import { handleDeviceRequest } from '../../../../utils/auth/bff-device'

const actionSchema = z.enum(['device', 'token', 'revoke'])

export default defineEventHandler((event) => {
  const client = deviceClientSchema.safeParse(getRouterParam(event, 'flow'))
  const action = actionSchema.safeParse(getRouterParam(event, 'action'))
  if (!client.success || !action.success) throw createError({ statusCode: 404, statusMessage: 'Device route not found' })
  return handleDeviceRequest(event, client.data, action.data)
})

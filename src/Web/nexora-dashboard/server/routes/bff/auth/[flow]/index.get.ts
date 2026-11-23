import { createError, defineEventHandler, getRouterParam } from 'h3'
import { deviceClientSchema } from '../../../../../shared/types/device-authorization'
import { deviceSettings } from '../../../../utils/auth/bff-device'

export default defineEventHandler((event) => {
  const client = deviceClientSchema.safeParse(getRouterParam(event, 'flow'))
  if (!client.success) throw createError({ statusCode: 404, statusMessage: 'Device client not found' })
  return deviceSettings(event, client.data)
})

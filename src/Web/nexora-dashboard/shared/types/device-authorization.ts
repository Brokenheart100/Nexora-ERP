import { z } from 'zod'

export const deviceClientSchema = z.enum(['cli', 'mcp'])
export type DeviceClient = z.infer<typeof deviceClientSchema>

export const deviceUserCodeSchema = z.string().trim().toUpperCase().regex(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/)

export function deviceAuthorizationPath(client: DeviceClient) {
  return '/bff/auth/' + client
}

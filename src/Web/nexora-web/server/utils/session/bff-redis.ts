import type { H3Event } from 'h3'
import { createError } from 'h3'
import { createClient } from 'redis'
import { bffConfig } from '../runtime/bff-config'

type RedisClient = ReturnType<typeof createClient>
type SessionCommands = Pick<RedisClient,
  'get' | 'getDel' | 'set' | 'del' | 'expire' | 'exists' | 'multi' | 'ping' | 'eval'
  | 'hGetAll' | 'hSet' | 'zAdd' | 'zRem' | 'zScore' | 'zRangeByScore'>
let connection: Promise<RedisClient> | undefined
let activeClient: RedisClient | undefined
let closed = false

async function connect(event: H3Event) {
  if (closed) throw new Error('Session store is shutting down')
  const client = createClient({
    url: bffConfig(event).redisUrl,
    socket: { connectTimeout: 2000, reconnectStrategy: false },
    disableOfflineQueue: true,
  })
  activeClient = client
  client.on('error', () => {
    // Redis error messages can include connection details.
  })
  try {
    await client.connect()
    return client
  } catch (error) {
    if (client.isOpen) client.destroy()
    throw error
  }
}

export async function withBffRedis<T>(event: H3Event, operation: (redis: SessionCommands) => Promise<T>) {
  try {
    connection ??= connect(event).catch((error) => {
      connection = undefined
      throw error
    })
    const client = await connection
    if (!client.isReady) {
      connection = undefined
      if (client.isOpen) client.destroy()
      throw new Error('Session store disconnected')
    }
    return await operation(client.withCommandOptions({ abortSignal: AbortSignal.timeout(3000) }))
  } catch {
    throw createError({ statusCode: 503, statusMessage: 'Web session service unavailable' })
  }
}

export function closeBffRedis() {
  closed = true
  if (activeClient?.isOpen) activeClient.destroy()
}

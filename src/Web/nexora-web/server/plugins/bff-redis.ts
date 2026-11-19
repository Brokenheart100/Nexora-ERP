import { closeBffRedis } from '../utils/session/bff-redis'

export default defineNitroPlugin((nitro) => {
  nitro.hooks.hook('close', closeBffRedis)
})

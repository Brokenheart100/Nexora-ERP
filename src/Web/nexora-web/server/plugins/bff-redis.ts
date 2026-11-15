import { closeBffRedis } from '../utils/bff-redis'

export default defineNitroPlugin((nitro) => {
  nitro.hooks.hook('close', closeBffRedis)
})

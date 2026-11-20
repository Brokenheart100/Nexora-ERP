export default defineNitroPlugin(() => {
  const config = useRuntimeConfig()
  if (config.public.apiMocking && (!import.meta.dev || config.public.dataMode !== 'mock')) throw new Error('MSW is limited to mock development.')
  if (!['mock', 'live'].includes(config.public.dataMode)) throw new Error('Dashboard data mode must be mock or live')
  if (config.public.dataMode === 'live') {
    const { bff } = config
    if (!config.public.bffOrigin || !bff.issuer || !bff.gatewayUrl || !bff.redisUrl || !bff.clientSecret || bff.sessionKey.length < 32)
      throw new Error('Live dashboard requires its BFF identity, session store and Gateway configuration')
  }
})

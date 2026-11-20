export default defineNuxtPlugin(() => {
  const config = useRuntimeConfig().public
  if (config.dataMode !== 'live') return
  const origin = URL.parse(config.bffOrigin)
  if (!origin || origin.protocol !== 'https:' || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash)
    throw createError({ statusCode: 503, statusMessage: 'Dashboard entry unavailable' })
  if (window.location.origin !== origin.origin)
    window.location.replace(origin.origin + window.location.pathname + window.location.search + window.location.hash)
})

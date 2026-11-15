export default defineNuxtRouteMiddleware(() => {
  const { bffOrigin } = useRuntimeConfig().public
  if (import.meta.server || !bffOrigin) return

  const destination = new URL(bffOrigin)
  const current = window.location
  if (current.origin === destination.origin) return

  destination.pathname = current.pathname
  destination.search = current.search
  destination.hash = current.hash
  return navigateTo(destination.href, { external: true, replace: true })
})

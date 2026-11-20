export default defineNuxtPlugin(() => {
  if (window.location.pathname !== '/join') return
  const fragment = window.location.hash.slice(1)
  if (/^[0-9a-f-]{36}\.[0-9a-f]{64}$/i.test(fragment)) {
    sessionStorage.setItem('nexora-dashboard.pending-invitation', fragment)
    history.replaceState(history.state, '', '/join')
  }
})

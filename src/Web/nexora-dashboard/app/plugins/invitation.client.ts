import { parseInvitationFragment, pendingInvitationKey } from '#shared/utils/invitation-navigation'

export default defineNuxtPlugin(() => {
  if (window.location.pathname !== '/join') return
  const fragment = window.location.hash.slice(1)
  if (parseInvitationFragment(fragment)) {
    sessionStorage.setItem(pendingInvitationKey, fragment)
    history.replaceState(history.state, '', '/join')
  }
})

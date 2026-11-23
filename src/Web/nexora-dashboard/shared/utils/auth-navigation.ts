import { parseInvitationFragment } from './invitation-navigation'

const destinations = new Set([
  '/', '/catalog', '/partners', '/definitions', '/purchase-orders', '/purchase-audit',
  '/sales', '/inventory', '/finance', '/change-log', '/assistant', '/settings', '/setup', '/join'
])

/** Authentication returns only to an existing UI route, including its invitation query. */
export function loginDestination(value: unknown): string {
  if (typeof value !== 'string' || value.length > 2048 || !value.startsWith('/') || value.startsWith('//')) return '/'
  if ([...value].some(character => character === '\\' || character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) return '/'
  const url = new URL(value, 'https://nexora.invalid')
  if (url.origin !== 'https://nexora.invalid' || !destinations.has(url.pathname)) return '/'
  const hash = url.pathname === '/join' && parseInvitationFragment(url.hash.slice(1)) ? '' : url.hash
  return url.pathname + url.search + hash
}

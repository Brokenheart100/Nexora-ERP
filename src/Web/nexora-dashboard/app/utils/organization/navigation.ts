import type { WireAccess, WireEntitlements } from '#shared/types/wire'
import { canAccessRoute, hasPermission } from '~/utils/api/access'

export function usesConnectedBusinessData(path: string, tab: unknown) {
  return ['/catalog', '/definitions', '/partners', '/purchase-orders', '/inventory', '/settings', '/setup', '/join', '/change-log', '/purchase-audit', '/assistant'].includes(path)
    || (path === '/finance' && tab === 'payables')
}

/** Translate the original UI routes to the existing authorization policy. */
export function canVisitWorkspacePage(path: string, access: WireAccess | null, entitlements: WireEntitlements | null, resources?: { warehouseVisible: boolean }) {
  if (path === '/' || path === '/join') return true
  if (!access || !entitlements) return false
  if (['/settings', '/setup'].includes(path)) return entitlements.modules.includes('company') && hasPermission(access, 'organization.workspace.read')
  if (path === '/change-log' || path === '/purchase-audit') return entitlements.modules.includes('audit') && hasPermission(access, 'organization.audit.read')
  if (path === '/assistant') return entitlements.modules.includes('assistant') && hasPermission(access, 'organization.workspace.read')
  const target = path === '/definitions' ? '/catalog' : path
  return canAccessRoute(target, access, entitlements.modules, resources)
}

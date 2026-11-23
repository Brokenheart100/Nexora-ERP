interface Grant { permission: string, departmentId: string | null, warehouseId: string | null, startsOn: string | null, endsOn: string | null }
interface Access { permissions: string[], scopedPermissions?: Grant[] | null }

export const liveRoutes = [
  { to: '/', label: '工作台', icon: 'i-carbon-dashboard', module: 'company', permissions: ['organization.workspace.read'] },
  { to: '/catalog', label: '商品目录', icon: 'i-carbon-catalog', module: 'catalog', permissions: ['masterdata.catalog.read'] },
  { to: '/partners', label: '往来单位', icon: 'i-carbon-customer', module: 'partners', permissions: ['masterdata.partner.read'] },
  { to: '/purchase-orders', label: '采购', icon: 'i-carbon-purchase', module: 'purchasing', permissions: ['purchasing.order.read', 'purchasing.order.read-own', 'purchasing.order.create', 'purchasing.order.approve'] },
  { to: '/sales', label: '销售', icon: 'i-carbon-shopping-cart', module: 'sales', permissions: ['sales.order.read', 'sales.order.read-own', 'sales.order.create', 'sales.order.approve', 'finance.ledger.read'] },
  { to: '/inventory', label: '库存', icon: 'i-carbon-inventory-management', module: 'inventory', permissions: ['inventory.stock.read', 'inventory.warehouse.manage'] },
  { to: '/finance', label: '财务', icon: 'i-carbon-finance', module: 'book', permissions: ['finance.ledger.read', 'finance.accounts.manage', 'finance.tax.manage'] },
  { to: '/setup', label: '交易前置配置', icon: 'i-carbon-settings', module: 'book', permissions: ['organization.workspace.read'] }
]

export function hasPermission(access: Access | null, permission: string, resource?: { departmentId?: string, warehouseId?: string, on?: string }) {
  if (!access) return false
  if (access.permissions.includes(permission)) return true
  if (!resource) return false
  return (access.scopedPermissions ?? []).some(grant => grant.permission === permission
    && (resource.departmentId !== undefined
      ? grant.departmentId === resource.departmentId && grant.warehouseId === null
      : resource.warehouseId !== undefined
        ? grant.warehouseId === resource.warehouseId && grant.departmentId === null
        : !!resource.on && !!grant.startsOn && !!grant.endsOn && grant.departmentId === null && grant.warehouseId === null)
      && (!resource.on || ((!grant.startsOn || resource.on >= grant.startsOn) && (!grant.endsOn || resource.on <= grant.endsOn))))
}

export function canAccessRoute(path: string, access: Access | null, modules: readonly string[], resources?: { warehouseVisible: boolean }) {
  const route = liveRoutes.find(item => item.to === path)
  return !!route && !!access && modules.includes(route.module) && ((path === '/inventory' && resources?.warehouseVisible)
    || route.permissions.some(permission => access.permissions.includes(permission) || (access.scopedPermissions ?? []).some(grant => grant.permission === permission)))
}

export function permittedDepartments<T extends { id: string, isActive?: boolean }>(access: Access | null, departments: T[], permission: string, on?: string) {
  return departments.filter(department => department.isActive !== false && hasPermission(access, permission, { departmentId: department.id, on }))
}

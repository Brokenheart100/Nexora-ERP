import { z } from 'zod'
import type { AuditEntry, ChangeSource, RecordChange } from '#shared/types/workspace-audit'

export const auditSourceNames: Record<ChangeSource, string> = { organization: '组织', purchasing: '采购', sales: '销售', finance: '财务', masterdata: '主数据', inventory: '库存' }

export function displaySnapshot(value: string | null | undefined) {
  if (!value) return '—'
  try {
    // Decode JSON string tokens without rounding numeric values in financial snapshots.
    return value.replace(/"(?:[^"\\]|\\.)*"/g, token => JSON.stringify(JSON.parse(token)))
  } catch {
    return value
  }
}

const organizationTabs: Record<string, string> = {
  Workspace: 'company', WorkspacePreferences: 'company', WorkspaceMember: 'members', WorkspaceInvitation: 'invitations',
  WorkspaceDepartment: 'departments', WorkspaceCustomRole: 'roles', WorkspaceRoleGrant: 'governance', BillingInvoice: 'billing'
}

function entityLink(source: ChangeSource, entity: string, id: string, workspace: string, snapshot?: { IsQuote?: boolean, WarehouseId?: string }) {
  if (!z.uuid().safeParse(id).success) return null
  const query = { workspace }
  if (source === 'organization' && Object.hasOwn(organizationTabs, entity)) return { path: '/settings', query: { ...query, tab: organizationTabs[entity] } }
  if (source === 'purchasing' && entity === 'PurchaseOrder') return { path: '/purchase-orders', query: { ...query, order: id } }
  if (source === 'sales' && entity === 'SalesOrder') return { path: '/sales', query: { ...query, [snapshot?.IsQuote ? 'quote' : 'order']: id } }
  if (source === 'finance' && entity === 'Journal') return { path: '/finance', query: { ...query, tab: 'journals', journal: id } }
  if (source === 'finance' && entity === 'CustomerDocument') return { path: '/sales', query: { ...query, tab: 'receivables', document: id } }
  if (source === 'masterdata' && entity === 'Item') return { path: '/catalog', query: { ...query, item: id } }
  if (source === 'masterdata' && entity === 'Partner') return { path: '/partners', query: { ...query, partner: id } }
  if (source === 'inventory' && entity === 'StockMovement' && z.uuid().safeParse(snapshot?.WarehouseId).success) {
    return { path: '/inventory', query: { ...query, tab: 'movements', movement: id, warehouse: snapshot?.WarehouseId } }
  }
  return null
}

export function recordChangeLink(row: RecordChange, workspace: string) {
  if (row.workspaceId !== workspace || row.operation === 'deleted') return null
  let snapshot
  if (row.service === 'sales' || row.service === 'inventory') {
    try {
      snapshot = z.object({ IsQuote: z.boolean().optional(), WarehouseId: z.string().optional() }).safeParse(JSON.parse(row.afterJson ?? '{}')).data
    } catch { return null }
  }
  return entityLink(row.service, row.entityName, row.entityId, workspace, snapshot)
}

export function auditEntryLink(row: AuditEntry, workspace: string) {
  if (!row.targetId) return null
  if (row.source === 'purchasing') return entityLink('purchasing', 'PurchaseOrder', row.targetId, workspace)
  if (row.source === 'sales' && (row.action !== 'sales.created' && row.action !== 'sales.edited')) {
    return entityLink('sales', 'SalesOrder', row.targetId, workspace, { IsQuote: row.action === 'sales.issue-quote' })
  }
  if (row.source === 'finance' && row.action.startsWith('journal.') && !row.action.startsWith('journal.link.')) {
    return entityLink('finance', 'Journal', row.targetId, workspace)
  }
  if (row.source === 'organization') {
    const prefix = row.action.split('.')[0] ?? ''
    const entities: Record<string, string> = { 'membership': 'WorkspaceMember', 'invitation': 'WorkspaceInvitation', 'custom-role': 'WorkspaceRoleGrant', 'department': 'WorkspaceDepartment', 'workspace': 'Workspace', 'company-settings': 'WorkspacePreferences', 'billing': 'BillingInvoice' }
    if (Object.hasOwn(entities, prefix)) return entityLink('organization', entities[prefix]!, row.targetId, workspace)
  }
  return null
}

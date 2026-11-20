import { hasPermission } from '../api/access'
import { subtractDecimal, sumDecimals } from '#shared/utils/decimal'

export type PurchaseDecision = 'submit' | 'withdraw' | 'return' | 'approve' | 'cancel'
export function purchaseActions(order: { state: string, isMaker: boolean, departmentId?: string | null }, access: Parameters<typeof hasPermission>[0]) {
  const resource = order.departmentId ? { departmentId: order.departmentId } : undefined
  const allows = (permission: string) => hasPermission(access, 'purchasing.order.' + permission, resource)
  const actions: ('edit' | PurchaseDecision)[] = []
  if (order.isMaker && order.state === 'draft') {
    if (allows('create')) actions.push('edit')
    if (allows('submit')) actions.push('submit', 'cancel')
  }
  if (order.state === 'submitted') {
    if (order.isMaker && allows('submit')) actions.push('withdraw')
    if (!order.isMaker && allows('approve')) actions.push('return', 'approve')
  }
  return actions
}
export function remainingAllowance(quantity: string, lineId: string, permits: { lineId: string, quantity: string, executed: string, state: string }[]) {
  return subtractDecimal(quantity, sumDecimals(permits.filter(permit => permit.lineId === lineId).map(permit => permit.state === 'cancelled' ? permit.executed : permit.quantity)))
}
export const purchaseStateLabels: Record<string, string> = { draft: '草稿', submitted: '待审批', approved: '已批准', cancelled: '已取消', receiving: '收货中', received: '已收齐', closed: '已关闭' }
export const permitStateLabels: Record<string, string> = { dispatching: '签发同步中', issued: '待收货', cancelling: '取消确认中', cancelled: '已取消余量', completed: '已收齐' }

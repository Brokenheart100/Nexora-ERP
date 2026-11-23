import type { FinancePrerequisites, Probe } from '#shared/types/prerequisites'
import type { WireAccess, WireDepartment } from '#shared/types/wire'
import { hasPermission } from '~/utils/api/access'

function check<T>(key: string, label: string, probe: Probe<T>, ready: (data: T) => boolean) {
  return probe.state === 'ready'
    ? { key, label, state: ready(probe.data) ? 'ready' : 'missing', detail: ready(probe.data) ? '已核对当前配置' : '尚缺少适用配置' }
    : { key, label, state: probe.state, detail: probe.message }
}
export function assessPrerequisites(value: FinancePrerequisites, on: string) {
  return [
    check('book', '账簿', value.book, data => !!data.settings),
    check('chart', '科目表', value.chart, data => data.accounts.some(account => !account.isArchived)),
    check('ledger', '业务日期对应开放期间', value.ledger, data => data.periods.some(period => period.month.slice(0, 7) === on.slice(0, 7) && period.state.toLowerCase() === 'open')),
    check('trade', '应付科目映射', value.trade, data => !!data.setup),
    check('receivables', '应收科目映射', value.receivables, data => !!data.accounts),
    check('banks', '资金账户', value.banks, data => data.length > 0),
    check('tax', '当前税组及税率', value.tax, data => data.groups.length > 0 && data.rates.some(rate => rate.effectiveOn <= on))
  ]
}
export function permittedOrderDepartments(departments: WireDepartment[], access: WireAccess | null, flow: 'purchasing' | 'sales', on: string) {
  if (!access) return []
  const permissions = [flow + '.order.read', flow + '.order.read-own']
  return departments.filter(department => permissions.some(permission => hasPermission(access, permission, { departmentId: department.id, on })))
}

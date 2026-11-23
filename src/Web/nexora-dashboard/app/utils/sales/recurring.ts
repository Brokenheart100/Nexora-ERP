import type { InvoiceOccurrence, InvoiceSchedule } from '#shared/types/invoicing'
import { multiplyDecimals } from '#shared/utils/decimal'
import type { RecurringInvoiceOccurrence, RecurringInvoicePlan } from '~/mocks'
import { displayDecimal } from '~/utils/api/decimal-display'

export type RecurringRow = Omit<RecurringInvoicePlan, 'quantity' | 'unitPrice' | 'intervalMonths' | 'version'> & {
  quantity: string | number
  unitPrice: string | number
  intervalMonths: number
  version: InvoiceSchedule['version']
  customerId?: string
  timeZone?: string
  nextAtUtc?: string
}
export type RecurringHistoryRow = Omit<RecurringInvoiceOccurrence, 'version'> & { version: InvoiceOccurrence['templateVersion'] }

export function scheduleRow(schedule: InvoiceSchedule, workspaceId: string): RecurringRow {
  const { terms } = schedule
  return {
    id: schedule.id, workspaceId, version: schedule.version, status: schedule.paused ? 'paused' : 'active',
    customerId: terms.customerId, customerName: terms.customerName, serviceId: terms.serviceId, serviceName: terms.serviceName,
    quantity: terms.quantity, unitPrice: terms.unitPrice, intervalMonths: terms.intervalMonths, dueDays: terms.dueDays,
    firstOn: schedule.nextOn ?? '', nextRunAt: schedule.nextOn, lastRunAt: schedule.lastOn,
    endsOn: terms.endsOn ?? undefined, pendingReason: schedule.pendingReason ?? undefined,
    timeZone: terms.brand.timeZone, nextAtUtc: schedule.nextAtUtc ?? undefined, owner: '', createdAt: '', updatedAt: ''
  }
}

export function historyRow(item: InvoiceOccurrence, workspaceId: string): RecurringHistoryRow {
  return { id: item.scheduleId + ':' + item.on, planId: item.scheduleId, workspaceId, scheduledOn: item.on,
    status: item.documentId ? 'executed' : 'skipped', invoiceId: item.documentId ?? undefined,
    version: item.templateVersion, actedAt: item.createdAtUtc }
}

export function recurringNet(row: Pick<RecurringRow, 'quantity' | 'unitPrice'>) {
  return typeof row.quantity === 'string' || typeof row.unitPrice === 'string'
    ? displayDecimal(multiplyDecimals(String(row.quantity), String(row.unitPrice)))
    : formatMoney(row.quantity * row.unitPrice)
}

import { z } from 'zod'
import { customerDocumentSchema, invoiceNumberPreviewSchema, shipmentAllowanceSchema } from '#shared/types/receivables'
import { receivableSchema, tradeSchema } from '#shared/types/prerequisites'
import { agingSchema } from '#shared/types/trade'
import { invoiceDispatchSchema, invoiceNumberingSchema, invoiceOccurrenceSchema, invoiceScheduleSchema, invoiceShareSchema } from '#shared/types/invoicing'
import { useDashboardApi } from './useDashboardApi'

export const receivablesPath = (workspaceId: string) => `/bff/api/finance/workspaces/${workspaceId}/receivables`

export function useReceivablesApi() {
  const api = useDashboardApi()
  async function read<T>(workspaceId: string, path: string, schema: z.ZodType<T>, signal?: AbortSignal) {
    return schema.parse((await api.get(receivablesPath(workspaceId) + path, { signal })).data)
  }
  return {
    home: (id: string, signal?: AbortSignal) => read(id, '', receivableSchema, signal),
    shipments: (id: string, page: number, signal?: AbortSignal) => read(id, `/shipments?page=${page}`, z.array(shipmentAllowanceSchema), signal),
    documents: (id: string, page: number, signal?: AbortSignal) => read(id, `/documents?page=${page}`, z.array(customerDocumentSchema), signal),
    invoices: (id: string, page: number, signal?: AbortSignal) => read(id, `/invoices?page=${page}`, z.array(customerDocumentSchema), signal),
    detail: (id: string, document: string, signal?: AbortSignal) => read(id, `/documents/${document}`, customerDocumentSchema, signal),
    preview: (id: string, on: string, signal?: AbortSignal) => read(id, `/invoice-numbering/preview?${new URLSearchParams({ on })}`, invoiceNumberPreviewSchema, signal),
    numbering: (id: string, signal?: AbortSignal) => read(id, '/invoice-numbering', invoiceNumberingSchema, signal),
    schedules: (id: string, page: number, signal?: AbortSignal) => read(id, `/schedules?page=${page}`, z.array(invoiceScheduleSchema), signal),
    occurrences: (id: string, scheduleId: string, page: number, signal?: AbortSignal) =>
      read(id, `/schedules/${scheduleId}/occurrences?page=${page}`, z.array(invoiceOccurrenceSchema), signal),
    shares: (id: string, invoiceId: string, signal?: AbortSignal) => read(id, `/documents/${invoiceId}/shares`, z.array(invoiceShareSchema.omit({ token: true })), signal),
    dispatches: (id: string, invoiceId: string, signal?: AbortSignal) => read(id, `/documents/${invoiceId}/dispatches`, z.array(invoiceDispatchSchema), signal),
    dispatch: (id: string, invoiceId: string, dispatchId: string, signal?: AbortSignal) =>
      read(id, `/documents/${invoiceId}/dispatches/${dispatchId}`, invoiceDispatchSchema, signal),
    pdf: async (id: string, invoiceId: string, signal?: AbortSignal) =>
      (await api.get<Blob>(receivablesPath(id) + `/documents/${invoiceId}/pdf?preview=true`, { signal, responseType: 'blob' })).data,
    banks: async (id: string, signal?: AbortSignal) =>
      tradeSchema.parse((await api.get(`/bff/api/finance/workspaces/${id}/trade`, { signal })).data).banks,
    aging: async (id: string, through: string, signal?: AbortSignal) => agingSchema.parse(
      (await api.get(`/bff/api/finance/workspaces/${id}/reporting/aging/receivables?${new URLSearchParams({ through, page: '1', pageSize: '20' })}`, { signal })).data)
  }
}

import { z } from 'zod'
import { bankSchema } from '#shared/types/prerequisites'
import { bankMovementSchema } from '#shared/types/trade'
import { bankCsvPreviewSchema, bankImportSchema, donationReceiptSchema, financeCapabilitiesSchema, fiscalTicketSchema,
  receiptDispatchSchema, reconciliationReportSchema, reconciliationSchema, statementLineSchema, statementMatchSchema, type BankCsvMapping } from '#shared/types/treasury'
import { useDashboardApi } from './useDashboardApi'
import { financePath } from './useLedgerApi'

export const tradePath = (workspace: string) => financePath(workspace) + '/trade'
export const receiptPath = (workspace: string, donation: string) => tradePath(workspace) + `/documents/${donation}/donation-receipt`

export function useTreasuryApi() {
  const api = useDashboardApi()
  async function read<T>(path: string, schema: z.ZodType<T>, signal?: AbortSignal) {
    return schema.parse((await api.get(path, { signal })).data)
  }
  function preview<T>(path: string, data: Record<string, unknown>, schema: z.ZodType<T>) {
    return api.createWrite(path, data, { parse: value => schema.parse(value) }).send()
  }
  const bank = (workspace: string, id: string) => tradePath(workspace) + `/banks/${id}`
  return {
    banks: (workspace: string, page: number, signal?: AbortSignal) => read(tradePath(workspace) + `/banks?page=${page}`, z.array(bankSchema), signal),
    bank: (workspace: string, id: string, signal?: AbortSignal) => read(bank(workspace, id), bankSchema, signal),
    movements: (workspace: string, id: string, page: number, signal?: AbortSignal) =>
      read(bank(workspace, id) + `/movements?page=${page}`, z.array(bankMovementSchema), signal),
    importPreview: (workspace: string, bankId: string, file: string, mapping: BankCsvMapping) =>
      preview(tradePath(workspace) + '/imports/preview', { bankId, file, mapping }, bankCsvPreviewSchema),
    importStatus: (workspace: string, id: string, signal?: AbortSignal) => read(tradePath(workspace) + `/imports/${id}`, bankImportSchema, signal),
    statement: (workspace: string, id: string, page: number, signal?: AbortSignal) =>
      read(bank(workspace, id) + `/statement?page=${page}`, z.array(statementLineSchema), signal),
    matches: (workspace: string, id: string, signal?: AbortSignal) =>
      read(tradePath(workspace) + `/statement/${id}/matches`, z.array(statementMatchSchema), signal),
    reconciliations: (workspace: string, id: string, signal?: AbortSignal) => read(bank(workspace, id) + '/reconciliations', z.array(reconciliationSchema), signal),
    reconciliationPreview: (workspace: string, id: string, through: string, statementBalance: string) =>
      preview(bank(workspace, id) + '/reconciliations/preview', { through, statementBalance }, reconciliationReportSchema),
    capabilities: (workspace: string, signal?: AbortSignal) => read(financePath(workspace) + '/capabilities', financeCapabilitiesSchema, signal),
    receipt: (workspace: string, id: string, signal?: AbortSignal) => read(receiptPath(workspace, id), donationReceiptSchema, signal),
    fiscalTickets: (workspace: string, id: string, signal?: AbortSignal) => read(receiptPath(workspace, id) + '/fiscal-tickets', z.array(fiscalTicketSchema), signal),
    fiscalTicket: (workspace: string, id: string, ticket: string, signal?: AbortSignal) => read(receiptPath(workspace, id) + `/fiscal-tickets/${ticket}`, fiscalTicketSchema, signal),
    dispatches: (workspace: string, id: string, signal?: AbortSignal) => read(receiptPath(workspace, id) + '/dispatches', z.array(receiptDispatchSchema), signal),
    dispatch: async (workspace: string, id: string, dispatch: string, signal?: AbortSignal) => {
      const response = await api.get(receiptPath(workspace, id) + `/dispatches/${dispatch}`, { signal })
      return { value: receiptDispatchSchema.parse(response.data), etag: response.headers.get('etag') ?? undefined }
    }
  }
}

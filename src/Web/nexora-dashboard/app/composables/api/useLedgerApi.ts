import { z } from 'zod'
import { bookSchema, chartSchema, ledgerSchema } from '#shared/types/prerequisites'
import {
  chartImportStatusSchema, journalSummarySchema, ledgerJournalSchema, trialBalanceSchema,
  journalLinkSchema, journalScanSchema, subledgerBatchSchema, periodDetailSchema,
  readinessSchema, fiscalYearSchema, fiscalYearPreviewSchema, partnershipSchema
} from '#shared/types/ledger'
import { useDashboardApi } from './useDashboardApi'

export const financePath = (id: string) => `/bff/api/finance/workspaces/${id}`

export function useLedgerApi() {
  const api = useDashboardApi()
  async function read<T>(workspace: string, path: string, schema: z.ZodType<T>, signal?: AbortSignal) {
    return schema.parse((await api.get(financePath(workspace) + path, { signal })).data)
  }
  return {
    book: (id: string, signal?: AbortSignal) => read(id, '/book', bookSchema, signal),
    chart: (id: string, signal?: AbortSignal) => read(id, '/chart', chartSchema, signal),
    ledger: (id: string, signal?: AbortSignal) => read(id, '/ledger', ledgerSchema, signal),
    chartImport: (id: string, preview: string) => read(id, '/chart/imports/' + preview, chartImportStatusSchema),
    chartExport: (id: string, kind: 'template' | 'structure' | 'snapshot') => read(id, '/chart/exports/' + kind, z.record(z.string(), z.unknown())),
    journals: (id: string, page: number, signal?: AbortSignal) =>
      read(id, '/ledger/journals?page=' + page + '&pageSize=50', z.array(journalSummarySchema), signal),
    journal: (id: string, journal: string, signal?: AbortSignal) => read(id, '/ledger/journals/' + journal, ledgerJournalSchema, signal),
    balance: (id: string, on: string, signal?: AbortSignal) => read(id, '/ledger/trial-balance/' + on, trialBalanceSchema, signal),
    links: (id: string, page: number, journal?: string, signal?: AbortSignal) => read(id,
      '/ledger/links?' + new URLSearchParams({ page: String(page), ...(journal ? { journalId: journal } : {}) }), z.array(journalLinkSchema), signal),
    scan: (id: string, signal?: AbortSignal) => read(id, '/ledger/links/scan', journalScanSchema, signal),
    batches: (id: string, signal?: AbortSignal) => read(id, '/ledger/opening-subledgers', z.array(subledgerBatchSchema), signal),
    batch: (id: string, batch: string, signal?: AbortSignal) => read(id, '/ledger/opening-subledgers/' + batch, subledgerBatchSchema, signal),
    readiness: (id: string, signal?: AbortSignal) => read(id, '/readiness', readinessSchema, signal),
    period: (id: string, month: string, signal?: AbortSignal) => read(id, '/ledger/periods/' + month, periodDetailSchema, signal),
    years: (id: string, signal?: AbortSignal) => read(id, '/ledger/fiscal-years', z.array(fiscalYearSchema), signal),
    yearPreview: (id: string, year: number, account: string, signal?: AbortSignal) =>
      read(id, '/ledger/fiscal-years/preview?' + new URLSearchParams({ year: String(year), equityAccountId: account }), fiscalYearPreviewSchema, signal),
    partnership: (id: string, year: number, signal?: AbortSignal) => read(id, '/ledger/partnerships/' + year, partnershipSchema, signal),
    preview: async <T>(id: string, path: string, input: Record<string, unknown>, schema: z.ZodType<T>) =>
      (await api.createWrite(financePath(id) + path, input, { parse: value => schema.parse(value) }).send()).data
  }
}

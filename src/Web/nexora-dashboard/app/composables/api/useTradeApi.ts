import { z } from 'zod'
import { tradeSchema } from '#shared/types/prerequisites'
import { changeSchema } from '#shared/types/purchasing'
import { accrualSchema, agingSchema, bankMovementSchema, partnerLedgerSchema, taxSnapshotSchema, tradeDocumentSchema, tradeJournalSchema } from '#shared/types/trade'
import type { WireWorkspace } from '#shared/types/wire'
import { useDashboardApi } from './useDashboardApi'

export function useTradeApi() {
  const api = useDashboardApi()
  const root = (id: string) => `/bff/api/finance/workspaces/${id}`
  async function read<T>(id: string, path: string, schema: z.ZodType<T>, signal?: AbortSignal) {
    return schema.parse((await api.get(root(id) + path, { signal })).data)
  }
  return {
    home: (id: string) => read(id, '/trade', tradeSchema),
    receipts: (id: string, page = 1) => read(id, `/trade/receipts?page=${page}`, z.array(accrualSchema)),
    documents: (id: string, page = 1) => read(id, `/trade/documents?page=${page}`, z.array(tradeDocumentSchema)),
    bills: (id: string, page = 1) => read(id, `/trade/bills?page=${page}`, z.array(tradeDocumentSchema)),
    document: (id: string, documentId: string) => read(id, `/trade/documents/${documentId}`, tradeDocumentSchema),
    submit: (id: string, terms: Record<string, unknown>) => api.createWrite(root(id) + '/trade/documents', { terms }, { idempotent: true, parse: data => changeSchema.parse(data) }),
    decide: (id: string, documentId: string, version: WireWorkspace['version'], decision: 'approve' | 'cancel') => api.createWrite(root(id) + `/trade/documents/${documentId}/decision`, { expectedVersion: version, decision }, { idempotent: true, parse: data => changeSchema.parse(data) }),
    accrue: (id: string, receiptId: string) => api.createWrite(root(id) + `/trade/receipts/${receiptId}/accrue`, {}, { idempotent: true, parse: data => changeSchema.parse(data) }),
    assess: (id: string, input: { on: string, groupCode: string, itemId: string, partnerId: string, quantity: string, unitPrice: string }) => api.createWrite(root(id) + '/tax/assessments', { ...input, discount: '0', includesTax: false }, { idempotent: true, parse: data => taxSnapshotSchema.parse(data) }),
    bankMovements: (id: string, bankId: string, page = 1) => read(id, `/trade/banks/${bankId}/movements?page=${page}`, z.array(bankMovementSchema)),
    partnerLedger: (id: string, partnerId: string, from: string, through: string, page = 1) => read(id, `/reporting/partner-ledgers/payables/${partnerId}?${new URLSearchParams({ from, through, page: String(page), pageSize: '20' })}`, partnerLedgerSchema),
    aging: (id: string, through: string) => read(id, `/reporting/aging/payables?${new URLSearchParams({ through, page: '1', pageSize: '20' })}`, agingSchema),
    journal: (id: string, journalId: string) => read(id, `/ledger/journals/${journalId}`, tradeJournalSchema)
  }
}

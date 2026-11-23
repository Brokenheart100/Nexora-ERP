import { z } from 'zod'
import { useScopedSubmission } from '~/composables/api/useScopedSubmission'
import { tradePath } from '~/composables/api/useTreasuryApi'
import { changeReceiptSchema } from '#shared/types/wire'
import { bankImportResultSchema, fiscalTicketSchema, receiptDispatchSchema, reconciliationSchema } from '#shared/types/treasury'

const response = z.union([bankImportResultSchema, reconciliationSchema, fiscalTicketSchema, receiptDispatchSchema, changeReceiptSchema])

export function useTreasuryWrite(namespace: string, enabled: () => boolean, workspace: () => string) {
  const submission = useScopedSubmission('finance.' + namespace, enabled, response.parse)
  const blocked = computed(() => submission.mutation.busy || !!submission.record)
  const path = (part: string) => tradePath(workspace()) + part
  const send = (action: string, part: string, payload: Record<string, unknown>, options?: { resourceId?: string, etag?: string }) =>
    submission.send(action, path(part), payload, options)
  return reactive({ submission, blocked, send })
}

export type TreasuryWrite = ReturnType<typeof useTreasuryWrite>

import type { ZodType } from 'zod'
import { taxCalendarSchema, taxFilingSchema, taxPeriodSchema, taxSnapshotSchema } from '#shared/types/tax'
import type { ChangeReceipt } from '#shared/types/wire'
import type { SavedSubmission } from '~/utils/api/submission'
import { useDashboardApi } from './useDashboardApi'
import { useFinanceSetupApi } from './useFinanceSetupApi'
import { financePath } from './useLedgerApi'
import { useWorkspaceQuery } from './useWorkspaceQuery'
import { useScopedSubmission } from './useScopedSubmission'

export const taxPath = (workspace: string) => financePath(workspace) + '/tax'

export function useTaxApi() {
  const api = useDashboardApi()
  async function read<T>(workspace: string, path: string, schema: ZodType<T>, signal?: AbortSignal) {
    return schema.parse((await api.get(taxPath(workspace) + path, { signal })).data)
  }
  return {
    assessment: (workspace: string, id: string, signal?: AbortSignal) => read(workspace, '/assessments/' + id, taxSnapshotSchema, signal),
    calendar: (workspace: string, signal?: AbortSignal) => read(workspace, '/calendar', taxCalendarSchema, signal),
    period: (workspace: string, on: string, signal?: AbortSignal) => read(workspace, '/periods/' + on, taxPeriodSchema, signal),
    filing: (workspace: string, id: string, signal?: AbortSignal) => read(workspace, '/filings/' + id, taxFilingSchema, signal)
  }
}

export function useTaxSetup() {
  const api = useFinanceSetupApi()
  return useWorkspaceQuery('tax-setup', '/finance', api.taxes)
}

export function useTaxSubmission<T = ChangeReceipt>(namespace: string, allowed: () => boolean, parse?: (value: unknown) => T,
  read?: (saved: SavedSubmission) => Promise<unknown>) {
  const api = useFinanceSetupApi()
  const submission = useScopedSubmission(namespace, allowed, parse)
  async function checkCurrent() {
    if (!submission.mutation.unknown) submission.resume()
    await submission.check(async (saved) => {
      await (read ? read(saved) : api.taxes(saved.workspaceId))
      // Setup, period and calendar reads do not identify the original operation.
      return null
    })
  }
  return Object.assign(submission, { checkCurrent })
}

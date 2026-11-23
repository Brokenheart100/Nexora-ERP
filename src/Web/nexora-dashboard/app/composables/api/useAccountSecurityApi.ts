import { z } from 'zod'
import { deletionReviewSchema, sessionActivitySchema, sessionListSchema, sessionPolicySchema } from '#shared/types/auth'
import { useDashboardApi } from './useDashboardApi'

export function useAccountSecurityApi() {
  const api = useDashboardApi('account')
  async function read<T>(path: string, schema: z.ZodType<T>, signal?: AbortSignal) {
    return schema.parse((await api.get(path, { signal })).data)
  }
  return {
    sessions: (signal?: AbortSignal) => read('/bff/sessions', sessionListSchema, signal),
    policy: (refresh = false) => read('/bff/session-policy' + (refresh ? '?refresh=1' : ''), sessionPolicySchema),
    activity: () => api.createWrite('/bff/sessions/activity', {}, { idempotent: false, parse: sessionActivitySchema.parse }).send(),
    revoke: (id: string) => api.createWrite('/bff/sessions/' + id + '/revoke', {}, { idempotent: false,
      parse: z.object({ revoked: z.boolean(), current: z.boolean() }).parse }),
    revokeOthers: () => api.createWrite('/bff/sessions/revoke-others', {}, { idempotent: false,
      parse: z.object({ revoked: z.number().int().nonnegative() }).parse }),
    deletionReview: () => read('/bff/api/account/deletion-preflight', deletionReviewSchema)
  }
}

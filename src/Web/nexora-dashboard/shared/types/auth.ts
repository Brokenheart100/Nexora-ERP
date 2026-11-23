import { z } from 'zod'

export const securityCapabilitiesSchema = z.object({
  available: z.boolean(), required: z.boolean(), enrolled: z.boolean(), methods: z.array(z.string()),
  stepUpSeconds: z.number().nonnegative(), lastVerifiedAt: z.iso.datetime().nullable(),
  reauthPath: z.literal('/bff/login?prompt=login')
})
export const csrfTokenSchema = z.object({ requestToken: z.string().min(1) })
export type SessionSecurity = z.infer<typeof securityCapabilitiesSchema>

const eventTime = z.number().int().nonnegative()
const idleMinutes = z.number().int().min(1).max(480)
export const sessionPolicySchema = z.object({
  idleTimeoutMinutes: idleMinutes, lastSeenAt: eventTime, workspaceCount: z.number().int().nonnegative(), checkedAt: z.string(),
  cached: z.boolean(), stale: z.boolean(), unavailable: z.boolean(),
  sources: z.array(z.object({ workspaceId: z.uuid(), workspaceName: z.string(), idleTimeoutMinutes: idleMinutes }))
})
export const sessionActivitySchema = sessionPolicySchema.pick({ lastSeenAt: true, idleTimeoutMinutes: true })
export const sessionSummarySchema = z.object({
  id: z.string().regex(/^[\w-]{22}$/), userAgent: z.string(), current: z.boolean(),
  createdAt: eventTime, lastSeenAt: eventTime, expiresAt: eventTime
})
export const sessionListSchema = z.object({ sessions: z.array(sessionSummarySchema) })
export const deletionReviewSchema = z.object({
  blockers: z.array(z.object({ code: z.string(), workspaceId: z.uuid().nullish(), workspaceName: z.string().nullish() })),
  requiresRetentionReview: z.boolean()
})
export type SessionPolicy = z.infer<typeof sessionPolicySchema>
export type SessionSummary = z.infer<typeof sessionSummarySchema>
export type DeletionReview = z.infer<typeof deletionReviewSchema>

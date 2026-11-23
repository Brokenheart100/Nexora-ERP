import { z } from 'zod'
import { revision } from './wire'

export const auditSources = ['organization', 'purchasing', 'sales', 'finance'] as const
export const changeSources = [...auditSources, 'masterdata', 'inventory'] as const
export type AuditSource = typeof auditSources[number]
export type ChangeSource = typeof changeSources[number]

const entry = z.object({
  id: z.uuid(), source: z.enum(auditSources), action: z.string(), actorIssuer: z.string(), actorSubject: z.string(),
  targetId: z.uuid().nullish(), version: revision.nullish(), operationId: z.uuid().nullish(), occurredAtUtc: z.string()
})
const change = z.object({
  id: z.uuid(), service: z.enum(changeSources), entityName: z.string(), entityId: z.string(), operation: z.string(),
  tenantId: z.uuid(), workspaceId: z.uuid(), actorIssuer: z.string(), actorSubject: z.string(), occurredAtUtc: z.string(),
  changedProperties: z.string().nullish(), beforeJson: z.string().nullish(), afterJson: z.string().nullish()
})
export const auditPageSchema = z.object({ entries: z.array(entry), hasMore: z.boolean(), retentionDays: z.number() })
export const recordChangePageSchema = z.object({ changes: z.array(change), hasMore: z.boolean(), retentionDays: z.number() })
export type AuditEntry = z.infer<typeof entry>
export type RecordChange = z.infer<typeof change>

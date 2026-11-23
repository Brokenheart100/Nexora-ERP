import { z } from 'zod'

const recoverySchema = z.object({
  subject: z.string().min(1), workspaceId: z.uuid(), itemId: z.uuid(), operationId: z.uuid(),
  etag: z.string().min(1).max(200), createdAt: z.number().finite().nonnegative(),
  state: z.enum(['unknown', 'mfa']).default('unknown'),
  payload: z.object({ name: z.string().trim().min(1).max(160), categoryId: z.uuid(), isActive: z.boolean() })
})
export type CatalogRecovery = z.input<typeof recoverySchema>

/** One unresolved submission per identity and workspace. Contains draft fields, never tokens. */
export function createCatalogRecoveryStore(storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>) {
  const key = (subject: string, workspaceId: string) => 'nexora:dashboard:catalog-recovery:' + JSON.stringify([subject, workspaceId])
  function read(subject: string, workspaceId: string): CatalogRecovery | null {
    try {
      const value = storage.getItem(key(subject, workspaceId))
      if (!value) return null
      const parsed = recoverySchema.safeParse(JSON.parse(value))
      return parsed.success && parsed.data.subject === subject && parsed.data.workspaceId === workspaceId ? parsed.data : null
    } catch { return null }
  }
  function save(record: CatalogRecovery) {
    const valid = recoverySchema.parse(record)
    const old = read(valid.subject, valid.workspaceId)
    if (old && old.operationId !== valid.operationId) throw new Error('仍有待确认提交，请先查询原操作。')
    if (old && JSON.stringify([old.itemId, old.etag, old.payload]) !== JSON.stringify([valid.itemId, valid.etag, valid.payload]))
      throw new Error('原提交内容已冻结，请先核对原操作。')
    storage.setItem(key(valid.subject, valid.workspaceId), JSON.stringify(valid))
  }
  function remove(subject: string, workspaceId: string, operationId: string) {
    if (read(subject, workspaceId)?.operationId === operationId) storage.removeItem(key(subject, workspaceId))
  }
  return { read, save, remove }
}

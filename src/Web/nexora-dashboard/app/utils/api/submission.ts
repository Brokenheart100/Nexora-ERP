import { z } from 'zod'

const resourceId = '[0-9a-f-]{36}'
const writePaths: Record<string, RegExp> = {
  masterdata: new RegExp('^(items|definitions|partners)(/' + resourceId + ')?$'),
  purchasing: new RegExp('^orders(/' + resourceId + '(/decision|/receipts(/close|/' + resourceId + '/cancel)?)?)?$'),
  sales: new RegExp('^orders(/' + resourceId + '(/decision|/convert|/fulfillments(/close|/' + resourceId + '/cancel)?)?)?$'),
  inventory: new RegExp('^(receipts/' + resourceId + '/receive|shipments/' + resourceId + '/(ship|returns)|movements/' + resourceId + '/returns'
    + '|(returns|sales-returns)/' + resourceId + '/decision|warehouses(/' + resourceId + '/(receiver|stock-operations))?'
    + '|stock-operations/' + resourceId + '/(decision|receive))$'),
  finance: new RegExp('^(receivables/(setup|invoice-numbering|documents(/' + resourceId + '(/(decision|shares|dispatches))?)?'
    + '|schedules(/' + resourceId + '(/(pause|run|skip))?)?|shares/' + resourceId + '/revoke|dispatches/' + resourceId + '/decision)'
    + '|tax/(rates|groups|classifications|assessments|calendar|periods/[0-9]{4}-[0-9]{2}-[0-9]{2}/filings)'
    + '|report-exports(/' + resourceId + '/rebuild)?'
    + '|trade/(setup|documents(/' + resourceId + '(/decision|/donation-receipt/(fiscal-tickets|dispatches(/' + resourceId + '/decision)?))?)?'
    + '|receipts/' + resourceId + '/accrue|banks(/' + resourceId + '/(default|reconciliations))?'
    + '|imports/' + resourceId + '/commit|statement/' + resourceId + '/(matches|exclude)|matches/' + resourceId + '/release'
    + '|reconciliations/' + resourceId + '/decision)'
    + '|book|chart/(accounts|imports/' + resourceId + '/commit)|readiness/backfill'
    + '|ledger/(journals(/(' + resourceId + '(/(decision|reversal))?|imported(/batch-decision)?))?'
    + '|links(/' + resourceId + '/delete)?|opening-balances/import|opening-subledgers(/' + resourceId + '/decision)?'
    + '|periods/[0-9]{4}-[0-9]{2}-[0-9]{2}|fiscal-years(/' + resourceId + '/decision)?|partnerships/[0-9]{4}))$')
}
const savedSchema = z.object({ subject: z.string().min(1), workspaceId: z.uuid(), operationId: z.uuid(),
  action: z.string().min(1), path: z.string(), method: z.enum(['POST', 'PUT']), etag: z.string().optional(), resourceId: z.uuid().optional(), warehouseId: z.uuid().optional(),
  payload: z.record(z.string(), z.unknown()), draft: z.record(z.string(), z.unknown()).optional(), state: z.enum(['unknown', 'mfa']) }).refine((value) => {
  const match = /^\/bff\/api\/([^/]+)\/workspaces\/([^/]+)\/(.+)$/.exec(value.path)
  return !!match && match[2] === value.workspaceId && writePaths[match[1]!]?.test(match[3]!) === true
}, '提交路径与工作区或服务不一致。')
export type SavedSubmission = z.infer<typeof savedSchema>

export function createSubmissionStore(namespace: string, storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>) {
  const key = (subject: string, workspace: string) => 'nexora:dashboard:submission:' + JSON.stringify([namespace, subject, workspace])
  function read(subject: string, workspaceId: string): SavedSubmission | null {
    try {
      const raw = storage.getItem(key(subject, workspaceId))
      if (!raw || raw.length > 2_000_000) return null
      const value = savedSchema.parse(JSON.parse(raw))
      return value.subject === subject && value.workspaceId === workspaceId ? value : null
    } catch { return null }
  }
  function save(input: SavedSubmission) {
    const value = savedSchema.parse(input)
    const old = read(value.subject, value.workspaceId)
    const frozen = (record: SavedSubmission) => JSON.stringify({ ...record, state: 'unknown' })
    if (old && frozen(old) !== frozen(value)) throw new Error('仍有待确认的原提交，请先核对结果。')
    storage.setItem(key(value.subject, value.workspaceId), JSON.stringify(value))
  }
  function remove(subject: string, workspaceId: string, operationId: string) {
    if (read(subject, workspaceId)?.operationId === operationId) storage.removeItem(key(subject, workspaceId))
  }
  return { read, save, remove }
}

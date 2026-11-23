import { http, HttpResponse } from 'msw/http'
import { z } from 'zod'
import { tradeAccountsSchema, receivableAccountsSchema, type TradeAccounts, type ReceivableAccounts } from '../../../shared/types/prerequisites'
import { tradeMappingFields, receivableMappingFields, mappingCandidates } from '../../utils/api/account-mappings'
import { problem, mockWorkspaceId, mockSecondWorkspaceId, type CatalogFixture } from './catalog'

const receiptSchema = z.object({ operationId: z.uuid(), workspaceId: z.uuid(), subject: z.string().default('msw-demo-maker'), area: z.enum(['trade', 'receivables']), fingerprint: z.string() })
const stateSchema = z.object({ trade: z.record(z.string(), tradeAccountsSchema), receivables: z.record(z.string(), receivableAccountsSchema), operations: z.array(receiptSchema) })
export function createPrerequisiteHandlers(context: CatalogFixture, storage?: Pick<Storage, 'getItem' | 'setItem'>) {
  const id = (index: number) => `77777777-7777-4777-8777-${String(index).padStart(12, '0')}`
  const fields = [...tradeMappingFields, ...receivableMappingFields]
  const accounts = fields.map((field, index) => ({ id: id(index + 1), code: 'D3-' + String(index + 1).padStart(2, '0'), name: field.label,
    category: field.category, purpose: field.purpose, isArchived: false, isUsed: false, parentCode: null, version: 1 }))
  const bank = { id: '66666666-6666-4666-8666-000000000001', accountId: '66666666-6666-4666-8666-000000000002', code: 'MSW-BANK', name: '演示银行', kind: 'bank', balance: '1400', isDefault: true, version: 1 }
  const workspaceAccounts = (workspace: unknown) => workspace === mockSecondWorkspaceId ? accounts.map((account, index) => ({ ...account, id: id(1000 + index) })) : accounts
  const workspaceBank = (workspace: unknown) => workspace === mockSecondWorkspaceId ? { ...bank, id: id(1500), accountId: id(1501) } : bank

  let state: z.infer<typeof stateSchema> = { trade: {}, receivables: {}, operations: [] }
  const stateKey = 'nexora:msw:prerequisites'
  try {
    const value = storage?.getItem(stateKey)
    if (value) state = stateSchema.parse(JSON.parse(value))
  } catch {
    /* Invalid developer fixtures start fresh. */
  }
  const persist = () => storage?.setItem(stateKey, JSON.stringify(state))
  const root = '*/bff/api/finance/workspaces/:workspaceId'
  const denied = () => problem(403, 'finance.forbidden', '当前身份无财务读取权限。')
  function read(workspace: unknown, data: Record<string, unknown> | Record<string, unknown>[]) {
    if (!context.allowed(workspace)) return problem(404, 'resource.not_found', '当前工作区不存在。')
    if (context.scenario() === 'finance-denied') return denied()
    if (context.scenario() === 'finance-unavailable') return problem(503, 'dependency.unavailable', '财务服务暂不可用。')
    return HttpResponse.json(data)
  }
  async function configure(request: Request, workspace: unknown, area: 'trade' | 'receivables') {
    if (!context.allowed(workspace)) return problem(404, 'resource.not_found', '工作区不存在。')
    if (!context.editable()) return denied()
    if (request.headers.get('X-CSRF-TOKEN') !== 'msw-only-csrf') return problem(400, 'csrf.invalid', '写入校验失败。')
    const body = await request.json() as { operationId: string, accounts: TradeAccounts & ReceivableAccounts }
    if (!z.uuid().safeParse(body.operationId).success || request.headers.get('idempotency-key') !== body.operationId) return problem(400, 'idempotency.invalid', '操作标识无效。')
    const fingerprint = JSON.stringify(body.accounts)
    const old = state.operations.find(value => value.workspaceId === workspace && value.subject === context.subject() && value.operationId === body.operationId)
    if (old) return old.area === area && old.fingerprint === fingerprint ? HttpResponse.json({ id: workspace, version: 1 }) : problem(409, 'idempotency.conflict', '原键对应另一份提交。')
    if (state[area][String(workspace)]) return problem(409, 'setup.already_configured', '映射已配置，当前只读。')
    const parsed = (area === 'trade' ? tradeAccountsSchema : receivableAccountsSchema).safeParse(body.accounts)
    if (!parsed.success) return problem(400, 'validation.failed', '请选择完整科目映射。')
    const ids = Object.values(parsed.data).filter((value): value is string => typeof value === 'string')
    if (new Set(ids).size !== ids.length) return problem(400, 'validation.failed', '映射各项必须使用不同科目。')
    for (const field of area === 'trade' ? tradeMappingFields : receivableMappingFields) {
      const value = (parsed.data as Record<string, string | null>)[field.key]
      if (!value && field.optional) continue
      if (!mappingCandidates(workspaceAccounts(workspace), field, [workspaceBank(workspace).accountId]).some(account => account.id === value)) return problem(400, 'account.invalid', '科目分类、用途或工作区不匹配。')
    }
    if (area === 'trade') state.trade[String(workspace)] = parsed.data as TradeAccounts
    else state.receivables[String(workspace)] = parsed.data as ReceivableAccounts
    state.operations.push({ operationId: body.operationId, workspaceId: String(workspace), subject: context.subject(), area, fingerprint })
    persist()
    if (context.scenario() === 'finance-unknown') return HttpResponse.error()
    return HttpResponse.json({ id: workspace, version: 1 })
  }
  const warehouses = [mockWorkspaceId, mockSecondWorkspaceId].map((workspace, index) => ({ workspace,
    value: { id: id(80 + index), code: index ? 'MSW-OTHER-WH' : 'MSW-WH', name: index ? '另一工作区仓库' : 'MSW 当前仓库', receiverId: id(90), version: 1,
      canReceive: context.editable(), canReadStock: context.editable(), canApproveReturns: false, canApproveSalesReturns: false } }))
  return [
    http.get('*/bff/api/workspaces/:workspaceId/departments', ({ params }) => context.allowed(params.workspaceId) ? HttpResponse.json([{ id: id(70), name: 'MSW 采购部门' }, { id: id(71), name: 'MSW 销售部门' }]) : problem(404, 'resource.not_found', '工作区不存在。')),
    http.get('*/bff/api/inventory/workspaces/:workspaceId/warehouses', ({ params }) => context.allowed(params.workspaceId)
      ? HttpResponse.json({ canManage: false, warehouses: warehouses.filter(value => value.workspace === params.workspaceId).map(value => value.value) })
      : problem(404, 'resource.not_found', '工作区不存在。')),
    ...['', '/reference'].map(tail => http.get('*/bff/api/inventory/workspaces/:workspaceId/warehouses/:id' + tail, ({ params }) => {
      const warehouse = context.allowed(params.workspaceId) ? warehouses.find(value => value.workspace === params.workspaceId && value.value.id === params.id) : null
      return warehouse ? HttpResponse.json(warehouse.value) : problem(404, 'resource.not_found', '仓库不属于当前工作区。')
    })),
    http.get(root + '/book', ({ params }) => read(params.workspaceId, { isPersonal: false, canInitialize: context.editable(), settings: context.scenario() === 'finance-missing-book'
      ? null
      : { baseCurrency: 'CNY', minorUnits: 2, startsOn: '2026-01-01', fiscalYearStartMonth: 1, template: 'company' }, accounts: workspaceAccounts(params.workspaceId) })),
    http.get(root + '/chart', ({ params }) => read(params.workspaceId, { revision: 1, canManage: context.editable(), canImport: false, canExport: false, accounts: workspaceAccounts(params.workspaceId) })),
    http.get(root + '/ledger', ({ params }) => read(params.workspaceId, { currency: 'CNY', minorUnits: 2, startsOn: '2026-01-01', canDraft: true, canPost: false, canReverse: false, canManagePeriods: false,
      periods: [{ month: '2026-01', state: context.scenario() === 'finance-closed' ? 'closed' : 'open', version: 1, closingWatermark: null }] })),
    http.get(root + '/trade', ({ params }) => read(params.workspaceId, { currency: 'CNY', minorUnits: 2, canConfigure: context.editable(), canSubmit: true, canApprove: false,
      setup: state.trade[String(params.workspaceId)] ? { ...state.trade[String(params.workspaceId)], version: 1 } : null, banks: [workspaceBank(params.workspaceId)] })),
    http.get(root + '/receivables', ({ params }) => read(params.workspaceId, { currency: 'CNY', fiscalNumbering: false, canConfigure: context.editable(), canDraft: true, canPost: false, accounts: state.receivables[String(params.workspaceId)] ?? null })),
    http.get(root + '/trade/banks', ({ params }) => read(params.workspaceId, context.scenario() === 'finance-missing-bank' ? [] : [workspaceBank(params.workspaceId)])),
    http.get(root + '/tax', ({ params }) => read(params.workspaceId, { canManage: false, groups: context.scenario() === 'finance-missing-tax' ? [] : [{ code: 'MSW-VAT13', name: '演示 13% 税组', version: 1, rateCodes: ['VAT13'] }],
      rates: [{ id: id(60), code: 'VAT13', name: '演示税率', effectiveOn: '2026-01-01', rate: '0.13' }], classifications: [] })),
    http.post(root + '/trade/setup', ({ request, params }) => configure(request, params.workspaceId, 'trade')),
    http.post(root + '/receivables/setup', ({ request, params }) => configure(request, params.workspaceId, 'receivables'))
  ]
}

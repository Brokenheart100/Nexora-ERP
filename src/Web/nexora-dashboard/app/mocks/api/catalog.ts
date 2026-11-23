import { delay } from 'msw'
import { http, HttpResponse } from 'msw/http'
import { z } from 'zod'
import { itemSchema, type WireItem } from '../../../shared/types/wire'
import { definitionSchema, partnerDetailSchema } from '../../../shared/types/masterdata'
import { mockIdentity } from './session'

export const mockWorkspaceId = '11111111-1111-4111-8111-111111111111'
export const mockItemId = '11111111-1111-4111-8111-111111111112'
export const mockSecondWorkspaceId = '11111111-1111-4111-8111-111111119111'
const secondItemId = '11111111-1111-4111-8111-111111119112'
export const tenantId = '22222222-2222-4222-8222-222222222222'
const categoryId = '11111111-1111-4111-8111-111111111113'
const unitId = '11111111-1111-4111-8111-111111111114'
const otherCategory = '11111111-1111-4111-8111-111111119113'
const otherUnit = '11111111-1111-4111-8111-111111119114'
const draftSchema = z.object({ operationId: z.uuid(), name: z.string().trim().min(1).max(160), categoryId: z.uuid(), isActive: z.boolean() })
const receiptSchema = z.object({ operationId: z.uuid(), workspaceId: z.uuid(), subject: z.string(), fingerprint: z.string(), id: z.uuid(), version: z.number(), action: z.string().default('catalog.item.revised') })
const databaseSchema = z.object({ items: z.array(itemSchema), receipts: z.array(receiptSchema), flags: z.array(z.string()), mfaAfter: z.number().optional(),
  definitions: z.array(definitionSchema.extend({ workspaceId: z.uuid() })).default([]), partners: z.array(partnerDetailSchema.extend({ workspaceId: z.uuid() })).default([]),
  itemWorkspaces: z.record(z.string(), z.string()).default({}) })

export function problem(status: number, code: string, detail: string, errors?: Record<string, string[]>) {
  return HttpResponse.json({ type: 'about:blank', title: detail, detail, code, status, traceId: 'msw-catalog', ...(errors ? { errors } : {}) },
    { status, headers: { 'Content-Type': 'application/problem+json' } })
}

export function createCatalogHandlers(options: { scenario: () => string, storage?: Pick<Storage, 'getItem' | 'setItem'> }) {
  const scenario = options.scenario
  const definitions: z.infer<typeof definitionSchema>[] = [
    { id: categoryId, code: 'MSW-GOODS', name: '演示商品分类', kind: 'category', isActive: true, version: 1 },
    { id: unitId, code: 'MSW-PCS', name: '件', kind: 'unit', isActive: true, version: 1 }
  ]
  const otherDefinitions = [{ ...definitions[0]!, id: otherCategory, name: '另一工作区分类' }, { ...definitions[1]!, id: otherUnit }]
  const primary: WireItem = { id: mockItemId, code: 'MSW-SKU-001', name: 'MSW 演示商品', kind: 'product', tracksInventory: true,
    categoryId, unitId, isActive: true, version: 1 }
  const initial = Array.from({ length: 12 }, (_, index) => index === 0
    ? primary
    : { ...primary,
        id: `11111111-1111-4111-8111-${111111112000 + index}`, code: `MSW-SKU-${String(index + 1).padStart(3, '0')}`, name: `MSW 演示商品 ${index + 1}` })
  initial.push({ ...primary, id: secondItemId, code: 'MSW-OTHER-001', name: 'MSW 另一工作区商品', categoryId: otherCategory, unitId: otherUnit })
  let db: z.infer<typeof databaseSchema> = { items: initial, receipts: [], flags: [], definitions: [], partners: [], itemWorkspaces: {} }
  const databaseKey = 'nexora:msw:catalog-database'
  try {
    const stored = options.storage?.getItem(databaseKey)
    if (stored) db = databaseSchema.parse(JSON.parse(stored))
  } catch { /* Invalid developer fixtures start with a clean simulated server. */ }
  if (!db.definitions.length) db.definitions = [...definitions.map(value => ({ ...value, workspaceId: mockWorkspaceId })), ...otherDefinitions.map(value => ({ ...value, workspaceId: mockSecondWorkspaceId }))]
  const persist = () => options.storage?.setItem(databaseKey, JSON.stringify(db))
  const subject = () => mockIdentity(scenario()).subject
  const allowed = (id: unknown) => id === mockSecondWorkspaceId || (id === mockWorkspaceId && subject() !== 'msw-bob')
  const missing = () => problem(404, 'resource.not_found', '当前工作区没有此资源。')
  const belongs = (item: WireItem, id: unknown) => id === (db.itemWorkspaces[item.id] ?? (item.id === secondItemId ? mockSecondWorkspaceId : mockWorkspaceId))
  const find = (workspace: unknown, id: unknown) => allowed(workspace) ? db.items.find(item => item.id === id && belongs(item, workspace)) : undefined
  const editable = () => !['read-only', 'permission-change', 'd4-read-only'].includes(scenario())
  const salesPermissions = () => {
    if (!scenario().startsWith('d5')) return []
    if (scenario() === 'd5-reviewer') return ['sales.order.read', 'sales.order.approve']
    if (['d5-read-only', 'd5-receiver'].includes(scenario())) return ['sales.order.read']
    return ['sales.order.read', 'sales.order.create', 'sales.order.submit', ...(scenario() === 'd5-dual' ? ['sales.order.approve'] : [])]
  }
  const workspaces = [mockWorkspaceId, mockSecondWorkspaceId].map(id => ({ id, tenantId,
    name: id === mockWorkspaceId ? 'MSW 采购演示公司' : 'MSW 另一工作区', countryCode: 'CN', baseCurrency: 'CNY', version: 1, isPersonal: false }))
  const permissions = () => ['organization.workspace.read', 'masterdata.catalog.read', 'masterdata.partner.read', ...salesPermissions(), ...(scenario().startsWith('d4') ? ['purchasing.order.read', 'inventory.stock.read', 'finance.ledger.read'] : []),
    ...(scenario().startsWith('d11') ? ['purchasing.order.approve', 'reports.workspace.read'] : []),
    ...(scenario().startsWith('d12') ? ['organization.workspace.manage', 'organization.billing.read', 'organization.billing.manage', 'organization.audit.read'] : []),
    ...(editable() ? ['masterdata.item.manage', 'masterdata.partner.manage', 'finance.ledger.read', 'inventory.stock.read', 'purchasing.order.read', 'sales.order.read', ...(scenario().startsWith('d4-reviewer') ? ['purchasing.order.approve'] : ['purchasing.order.create', 'purchasing.order.submit'])] : [])]
  const handlers = [
    http.get('*/bff/api/me', () => HttpResponse.json({ id: tenantId, issuer: 'https://identity.example.invalid', subject: subject(), verifiedEmail: 'msw-demo@example.invalid', isActive: true })),
    http.get('*/bff/api/workspaces', () => HttpResponse.json(workspaces.filter(item => allowed(item.id)))),
    http.get('*/bff/api/workspaces/:id', ({ params }) => allowed(params.id) ? HttpResponse.json(workspaces.find(item => item.id === params.id)) : missing()),
    http.get('*/bff/api/workspaces/:id/access', ({ params }) => allowed(params.id)
      ? HttpResponse.json({ workspaceId: params.id, tenantId, memberId: tenantId, authorizationVersion: scenario() === 'permission-change' ? 2 : 1,
          role: editable() ? 'PurchasingOperator' : 'Reader', isPersonal: false, permissions: permissions(), scopedPermissions: [], departmentIds: [] })
      : missing()),
    http.get('*/bff/api/workspaces/:id/authorization/:permission', ({ params }) => allowed(params.id) && permissions().includes(String(params.permission))
      ? HttpResponse.json({ workspaceId: params.id, tenantId, memberId: tenantId, authorizationVersion: 1, role: 'PurchasingOperator', isPersonal: false, permissions: permissions() })
      : problem(403, 'organization.forbidden', '当前身份无此权限。')),
    http.get('*/bff/api/workspaces/:id/departments', ({ params }) => allowed(params.id) ? HttpResponse.json([]) : missing()),
    http.get('*/bff/api/workspaces/:id/billing/entitlements', ({ params }) => allowed(params.id)
      ? HttpResponse.json({
          workspaceId: params.id, planCode: 'pro', planName: 'MSW 演示', effectivePlanCode: 'pro', status: 'active',
          modules: ['company', 'catalog', 'partners', 'purchasing', 'inventory', 'book', 'reports', 'aging', ...(/^d[569]/.test(scenario()) ? ['sales', 'receivables'] : []), ...(scenario().startsWith('d12') ? ['audit'] : [])], warnings: [], periodEndUtc: null,
          usage: { workspaces: 2, workspacesLimit: 10, members: 3, membersLimit: 20, documentsThisMonth: 0, documentsLimit: 1000, period: '2026-11' }
        })
      : missing()),
    http.get('*/bff/api/inventory/workspaces/:id/warehouses', ({ params }) => allowed(params.id) ? HttpResponse.json({ canManage: false, warehouses: [] }) : missing()),
    http.get('*/bff/api/masterdata/workspaces/:id/catalog', async ({ params, request }) => {
      if (!allowed(params.id)) return missing()
      if (scenario() === 'forbidden') return problem(403, 'masterdata.forbidden', '当前身份无权读取目录。')
      if (scenario() === 'unavailable') return problem(503, 'dependency.unavailable', '商品服务暂不可用。')
      if (scenario() === 'slow') await delay(1500)
      const url = new URL(request.url)
      const page = Math.max(1, Number(url.searchParams.get('page')) || 1)
      const size = Math.min(100, Math.max(1, Number(url.searchParams.get('pageSize')) || 20))
      const items = scenario() === 'empty' ? [] : db.items.filter(item => belongs(item, params.id))
      return HttpResponse.json({ definitions: db.definitions.filter(value => value.workspaceId === params.id),
        page: { items: items.slice((page - 1) * size, page * size), hasMore: items.length > page * size }, canManage: editable() })
    }),
    http.get('*/bff/api/masterdata/workspaces/:id/items/:itemId', ({ params }) => {
      const item = find(params.id, params.itemId)
      return item ? HttpResponse.json(item, { headers: { ETag: `"${item.version}"` } }) : missing()
    }),
    http.get('*/bff/api/masterdata/workspaces/:id/items/:itemId/reference', ({ params, request }) => {
      const item = find(params.id, params.itemId)
      const category = db.definitions.find(value => value.id === item?.categoryId && value.workspaceId === params.id)
      const unit = db.definitions.find(value => value.id === item?.unitId && value.workspaceId === params.id)
      if (!item) return missing()
      const inventory = new URL(request.url).searchParams.get('inventory') === 'true'
      return item.isActive && category?.isActive && unit?.isActive && (!inventory || (item.kind === 'product' && item.tracksInventory))
        ? HttpResponse.json({ item, category, unit })
        : problem(409, 'masterdata.state_conflict', '商品或引用定义不适用于当前用途。')
    }),
    http.put('*/bff/api/masterdata/workspaces/:id/items/:itemId', async ({ params, request, cookies }) => {
      const item = find(params.id, params.itemId)
      if (!item) return missing()
      if (!editable()) return problem(403, 'masterdata.forbidden', '当前身份不能维护商品。')
      if (request.headers.get('X-CSRF-TOKEN') !== 'msw-only-csrf') return problem(400, 'csrf.invalid', '写入校验失败。')
      const parsed = draftSchema.safeParse(await request.json())
      if (!parsed.success) return problem(400, 'validation.failed', '商品字段无效。', { Name: ['请输入有效名称。'] })
      const body = parsed.data
      if (request.headers.get('idempotency-key') !== body.operationId) return problem(400, 'idempotency.invalid', '操作标识不一致。')
      if (scenario() === 'validation') return problem(400, 'validation.failed', '名称未通过校验。', { Name: ['名称未通过校验。'] })
      if (scenario() === 'mfa') {
        db.mfaAfter ??= Date.now()
        persist()
        if (Number(cookies['nexora-msw-session']) <= db.mfaAfter) return HttpResponse.json({ data: { code: 'mfa_step_up_required', reauthPath: '/bff/login?prompt=login' } }, { status: 403 })
      }
      const fingerprint = JSON.stringify([body.name, body.categoryId, body.isActive, request.headers.get('if-match')])
      const old = db.receipts.find(value => value.operationId === body.operationId && value.workspaceId === params.id && value.subject === subject())
      if (old) return old.fingerprint === fingerprint ? HttpResponse.json({ id: old.id, version: old.version }) : problem(409, 'idempotency.conflict', '原操作标识已绑定其他输入。')
      if (scenario() === 'key-conflict') return problem(409, 'idempotency.conflict', '操作标识与请求不一致。')
      if (scenario() === 'conflict' && !db.flags.includes('conflict')) {
        db.flags.push('conflict')
        item.version = Number(item.version) + 1
        item.name = 'MSW 其他操作者已修改'
        persist()
      }
      if (request.headers.get('if-match') !== `"${item.version}"`) return problem(412, 'masterdata.precondition_failed', '记录版本已变更。')
      if (scenario() === 'retry-before-write' && !db.flags.includes(body.operationId)) {
        db.flags.push(body.operationId)
        persist()
        return HttpResponse.error()
      }
      const category = db.definitions.find(value => value.id === body.categoryId && value.kind === 'category' && value.workspaceId === params.id)
      if (!category)
        return problem(400, 'masterdata.validation', '请选择当前工作区的有效分类。')
      if (body.isActive && !category.isActive) return problem(409, 'masterdata.state_conflict', '分类已停用。')
      Object.assign(item, { name: body.name, categoryId: body.categoryId, isActive: body.isActive, version: Number(item.version) + 1 })
      const receipt = { operationId: body.operationId, subject: subject(), workspaceId: String(params.id), fingerprint, id: item.id, version: Number(item.version), action: 'catalog.item.revised' }
      db.receipts.push(receipt)
      persist()
      if (['unknown-write', 'audit-unavailable'].includes(scenario()) && !db.flags.includes(body.operationId)) {
        db.flags.push(body.operationId)
        persist()
        return HttpResponse.error()
      }
      return HttpResponse.json({ id: receipt.id, version: receipt.version })
    }),
    http.get('*/bff/api/masterdata/workspaces/:id/record-changes', ({ params }) => {
      if (!allowed(params.id)) return missing()
      if (scenario() === 'audit-unavailable' && !db.flags.includes('audit-unavailable')) {
        db.flags.push('audit-unavailable')
        persist()
        return problem(503, 'dependency.unavailable', '回执查询暂不可用，请稍后核对。')
      }
      return HttpResponse.json({
        changes: db.receipts.filter(value => value.workspaceId === params.id && value.subject === subject()).map(value => ({ actorSubject: value.subject,
          afterJson: JSON.stringify({ OperationId: value.operationId, ResourceId: value.id, ResourceVersion: value.version, Action: value.action }) }))
      })
    })
  ]
  return { handlers, item: db.items.find(value => value.id === mockItemId)!, db, persist, allowed, editable, subject, scenario, salesPermissions, find }
}
export type CatalogFixture = ReturnType<typeof createCatalogHandlers>

import { delay } from 'msw'
import { http, HttpResponse } from 'msw/http'
import { createPurchaseHandlers } from './purchasing'
import { createFinanceHandlers } from './finance'

export const mockWorkspaceId = '11111111-1111-4111-8111-111111111111'
export const mockItemId = '11111111-1111-4111-8111-111111111112'
const tenantId = '22222222-2222-4222-8222-222222222222'
const memberId = '33333333-3333-4333-8333-333333333333'
const categoryId = '11111111-1111-4111-8111-111111111113'
const unitId = '11111111-1111-4111-8111-111111111114'
const permissions = ['organization.workspace.read', 'masterdata.catalog.read', 'masterdata.item.manage', 'masterdata.partner.read', 'masterdata.partner.manage',
  'purchasing.order.read', 'purchasing.order.create', 'purchasing.order.submit', 'finance.ledger.read', 'finance.accounts.manage', 'inventory.stock.read']
const workspace = { id: mockWorkspaceId, tenantId, name: 'MSW 采购演示公司', countryCode: 'CN', baseCurrency: 'CNY', version: 1, isPersonal: false }
const access = { workspaceId: mockWorkspaceId, tenantId, memberId, authorizationVersion: 1, role: 'PurchasingOperator', isPersonal: false, permissions, scopedPermissions: [], departmentIds: [] }
const modules = ['company', 'catalog', 'partners', 'purchasing', 'inventory', 'book', 'reports', 'aging']
const definitions = [{ id: categoryId, code: 'MSW-GOODS', name: '演示商品分类', kind: 'category', isActive: true, version: 1 },
  { id: unitId, code: 'MSW-PCS', name: '件', kind: 'unit', isActive: true, version: 1 }]

export function mockProblem(status: number, code: string, detail: string) {
  return HttpResponse.json({ type: 'about:blank', title: detail, status, code, detail, traceId: 'msw-demo' }, { status, headers: { 'Content-Type': 'application/problem+json' } })
}

export function createDashboardHandlers(options: { scenario?: () => string } = {}) {
  const scenario = options.scenario ?? (() => 'normal')
  const item = { id: mockItemId, code: 'MSW-SKU-001', name: 'MSW 演示商品', kind: 'product', tracksInventory: true, categoryId, unitId, isActive: true, version: 1 }
  let conflicted = false
  const receipts = new Map<string, { id: string, version: number }>()
  const scoped = (id: unknown) => id === mockWorkspaceId
  const missing = () => mockProblem(404, 'resource.not_found', '当前模拟工作区没有此资源。')
  return [
    ...createFinanceHandlers({ workspaceId: mockWorkspaceId, itemId: mockItemId, scenario }),
    ...createPurchaseHandlers({ workspaceId: mockWorkspaceId, scenario, item }),
    http.get('*/bff/me', () => HttpResponse.json({ subject: 'msw-demo-maker', name: 'MSW 演示账号' })),
    http.get('*/bff/antiforgery', () => HttpResponse.json({ requestToken: 'msw-only-csrf' })),
    http.get('*/bff/api/me', () => HttpResponse.json({ id: memberId, issuer: 'https://identity.example.invalid', subject: 'msw-demo-maker', verifiedEmail: 'msw-demo@example.invalid', isActive: true })),
    http.get('*/bff/api/workspaces', () => HttpResponse.json([workspace])),
    http.get('*/bff/api/workspaces/:id', ({ params }) => scoped(params.id) ? HttpResponse.json(workspace) : missing()),
    http.get('*/bff/api/workspaces/:id/access', ({ params }) => scoped(params.id) ? HttpResponse.json(access) : missing()),
    http.get('*/bff/api/workspaces/:id/authorization/:permission', ({ params }) => scoped(params.id) && permissions.includes(String(params.permission)) ? HttpResponse.json(access) : mockProblem(403, 'organization.forbidden', '当前模拟身份无此权限。')),
    http.get('*/bff/api/workspaces/:id/departments', ({ params }) => scoped(params.id) ? HttpResponse.json([]) : missing()),
    http.get('*/bff/api/workspaces/:id/billing/entitlements', ({ params }) => scoped(params.id)
      ? HttpResponse.json({ workspaceId: mockWorkspaceId, planCode: 'pro', planName: 'MSW 演示', effectivePlanCode: 'pro', status: 'active', modules, warnings: [], periodEndUtc: null,
          usage: { workspaces: 1, workspacesLimit: 10, members: 3, membersLimit: 20, documentsThisMonth: 0, documentsLimit: 1000, period: '2026-11' } })
      : missing()),
    http.get('*/bff/api/inventory/workspaces/:id/warehouses', ({ params }) => scoped(params.id) ? HttpResponse.json({ canManage: false, warehouses: [] }) : missing()),
    http.get('*/bff/api/masterdata/workspaces/:id/catalog', async ({ params }) => {
      if (!scoped(params.id)) return missing()
      if (scenario() === 'forbidden') return mockProblem(403, 'masterdata.forbidden', '模拟：当前身份无权读取目录。')
      if (scenario() === 'unavailable') return mockProblem(503, 'dependency.unavailable', '模拟：服务暂不可用。')
      if (scenario() === 'slow') await delay(1500)
      return HttpResponse.json({ definitions, page: { items: scenario() === 'empty' ? [] : [item], hasMore: false }, canManage: true })
    }),
    http.get('*/bff/api/masterdata/workspaces/:id/items/:itemId', ({ params }) => scoped(params.id) && params.itemId === item.id ? HttpResponse.json(item, { headers: { ETag: `"${item.version}"` } }) : missing()),
    http.get('*/bff/api/masterdata/workspaces/:id/items/:itemId/reference', ({ params }) => scoped(params.id) && params.itemId === item.id ? HttpResponse.json({ item, category: definitions[0], unit: definitions[1] }) : missing()),
    http.put('*/bff/api/masterdata/workspaces/:id/items/:itemId', async ({ params, request }) => {
      if (!scoped(params.id) || params.itemId !== item.id) return missing()
      const body = await request.json() as { operationId: string, name: string, categoryId: string, isActive: boolean }
      const replay = receipts.get(body.operationId)
      if (replay) return HttpResponse.json(replay)
      if (scenario() === 'conflict' && !conflicted) {
        conflicted = true
        item.version++
        item.name = 'MSW 其他操作者已修改'
        return mockProblem(412, 'masterdata.precondition_failed', '记录版本已变更。')
      }
      if (request.headers.get('If-Match') !== `"${item.version}"`) return mockProblem(412, 'masterdata.precondition_failed', '记录版本已变更。')
      Object.assign(item, { name: body.name, categoryId: body.categoryId, isActive: body.isActive, version: item.version + 1 })
      const result = { id: item.id, version: item.version }
      receipts.set(body.operationId, result)
      return HttpResponse.json(result)
    }),
    http.get('*/bff/api/masterdata/workspaces/:id/record-changes', () => HttpResponse.json({ changes: [] })),
    http.all('*/bff/*', () => mockProblem(501, 'mock.not_implemented', '此模拟场景尚未配置此接口。'))
  ]
}

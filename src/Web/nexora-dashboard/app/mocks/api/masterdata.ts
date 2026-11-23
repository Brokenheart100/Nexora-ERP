import { http, HttpResponse } from 'msw/http'
import { z } from 'zod'
import { definitionInputSchema, itemInputSchema, partnerInputSchema, partnerRoleSchema, contactSchema } from '../../../shared/types/masterdata'
import { problem, type CatalogFixture } from './catalog'

const profileSchema = z.object({ name: z.string().trim().min(1).max(160), roles: z.array(partnerRoleSchema).min(1),
  taxNumber: z.string().nullable(), address: z.string().nullable(), contacts: z.array(contactSchema).max(20) })
export function createMasterDataHandlers(context: CatalogFixture) {
  const root = '*/bff/api/masterdata/workspaces/:workspaceId'
  const missing = () => problem(404, 'resource.not_found', '当前工作区不存在此资源。')
  const definitions = (workspace: unknown) => context.db.definitions.filter(value => value.workspaceId === workspace)
  const partners = (workspace: unknown) => context.db.partners.filter(value => value.workspaceId === workspace)
  type Change = { id: string, version: number }
  async function mutate(request: Request, workspace: unknown, action: string, apply: (body: Record<string, unknown>) => Change | Response) {
    if (!context.allowed(workspace)) return missing()
    if (!context.editable()) return problem(403, 'masterdata.forbidden', '当前身份无维护权限。')
    if (request.headers.get('X-CSRF-TOKEN') !== 'msw-only-csrf') return problem(400, 'csrf.invalid', '写入校验失败。')
    const body = await request.json() as Record<string, unknown>
    const operationId = z.uuid().safeParse(body.operationId)
    if (!operationId.success || request.headers.get('idempotency-key') !== operationId.data) return problem(400, 'idempotency.invalid', '操作标识无效。')
    const fingerprint = JSON.stringify([new URL(request.url).pathname, body, request.headers.get('if-match')])
    const old = context.db.receipts.find(value => value.operationId === operationId.data && value.workspaceId === workspace && value.subject === context.subject())
    if (old) return old.fingerprint === fingerprint
      ? HttpResponse.json({ id: old.id, version: old.version }, { status: request.method === 'POST' ? 201 : 200,
          headers: request.method === 'POST' ? { Location: new URL(request.url).pathname + '/' + old.id } : {} })
      : problem(409, 'idempotency.conflict', '原键已绑定其他请求。')
    try {
      const value = apply(body)
      if (value instanceof Response) return value
      context.db.receipts.push({ ...value, action, operationId: operationId.data, workspaceId: String(workspace), subject: context.subject(), fingerprint })
      context.persist()
      if (context.scenario() === 'masterdata-unknown' && !context.db.flags.includes(operationId.data)) {
        context.db.flags.push(operationId.data)
        context.persist()
        return HttpResponse.error()
      }
      return HttpResponse.json(value, { status: request.method === 'POST' ? 201 : 200,
        headers: request.method === 'POST' ? { Location: new URL(request.url).pathname + '/' + value.id } : {} })
    } catch (error) {
      return problem(400, 'validation.failed', error instanceof z.ZodError ? error.issues[0]?.message ?? '字段无效。' : '引用或字段无效。')
    }
  }
  return [
    http.get(root + '/definitions/:id', ({ params }) => {
      const value = context.allowed(params.workspaceId) ? definitions(params.workspaceId).find(item => item.id === params.id) : null
      return value ? HttpResponse.json(value, { headers: { ETag: `"${value.version}"` } }) : missing()
    }),
    http.post(root + '/definitions', ({ params, request }) => mutate(request, params.workspaceId, 'catalog.definition.created', (body) => {
      const input = definitionInputSchema.parse({ ...body, isActive: true })
      if (definitions(params.workspaceId).some(value => value.code === input.code.toUpperCase() && value.kind === input.kind)) return problem(409, 'code.conflict', '编码已存在。')
      const value = { id: crypto.randomUUID(), ...input, code: input.code.toUpperCase(), version: 1, workspaceId: String(params.workspaceId) }
      context.db.definitions.push(value)
      return { id: value.id, version: 1 }
    })),
    http.put(root + '/definitions/:id', ({ params, request }) => mutate(request, params.workspaceId, 'catalog.definition.revised', (body) => {
      const value = definitions(params.workspaceId).find(item => item.id === params.id)
      if (!value) return missing()
      if (request.headers.get('if-match') !== `"${value.version}"`) return problem(412, 'precondition.failed', '定义版本已变化。')
      const input = definitionInputSchema.pick({ name: true, isActive: true }).parse(body)
      Object.assign(value, input, { version: Number(value.version) + 1 })
      return { id: value.id, version: Number(value.version) }
    })),
    http.post(root + '/items', ({ params, request }) => mutate(request, params.workspaceId, 'catalog.item.created', (body) => {
      const input = itemInputSchema.parse({ ...body, isActive: true })
      const category = definitions(params.workspaceId).find(value => value.id === input.categoryId && value.kind === 'category')
      const unit = definitions(params.workspaceId).find(value => value.id === input.unitId && value.kind === 'unit')
      if (!category || !unit) return problem(400, 'masterdata.validation', '请选择当前工作区的有效分类与单位。')
      if (!category.isActive || !unit.isActive) return problem(409, 'masterdata.state_conflict', '分类或单位已停用。')
      if (context.db.items.some(value => value.code === input.code.toUpperCase())) return problem(409, 'code.conflict', '商品编码已存在。')
      const item = { ...input, code: input.code.toUpperCase(), id: crypto.randomUUID(), version: 1 }
      context.db.items.unshift(item)
      context.db.itemWorkspaces[item.id] = String(params.workspaceId)
      return { id: item.id, version: 1 }
    })),
    http.get(root + '/partners', ({ params, request }) => {
      if (!context.allowed(params.workspaceId)) return missing()
      const url = new URL(request.url), page = Math.max(1, Number(url.searchParams.get('page')) || 1), size = Math.min(100, Number(url.searchParams.get('pageSize')) || 20)
      const role = url.searchParams.get('role')
      const items = partners(params.workspaceId).filter(value => !role || value.roles.includes(role as 'customer'))
      return HttpResponse.json({ items: items.slice((page - 1) * size, page * size), hasMore: items.length > page * size, canManage: context.editable() })
    }),
    http.get(root + '/partners/:id', ({ params }) => {
      const value = context.allowed(params.workspaceId) ? partners(params.workspaceId).find(item => item.id === params.id) : null
      return value ? HttpResponse.json(value, { headers: { ETag: `"${value.version}"` } }) : missing()
    }),
    http.get(root + '/partners/:id/reference', ({ params, request }) => {
      const value = context.allowed(params.workspaceId) ? partners(params.workspaceId).find(item => item.id === params.id) : null
      const role = new URL(request.url).searchParams.get('role')
      if (!partnerRoleSchema.safeParse(role).success) return problem(400, 'masterdata.validation', '伙伴角色无效。')
      if (!value) return missing()
      return value.isActive && value.roles.includes(role as 'customer')
        ? HttpResponse.json({ id: value.id, code: value.code, name: value.name, role, version: value.version })
        : problem(409, 'masterdata.state_conflict', '伙伴已停用或缺少所选角色。')
    }),
    http.post(root + '/partners', ({ params, request }) => mutate(request, params.workspaceId, 'partner.created', (body) => {
      const profile = profileSchema.parse(body.profile), code = partnerInputSchema.shape.code.parse(body.code).toUpperCase()
      if (partners(params.workspaceId).some(value => value.code === code)) return problem(409, 'code.conflict', '伙伴编码已存在。')
      const value = { ...profile, contacts: profile.contacts.map(contact => ({ ...contact, id: contact.id ?? crypto.randomUUID() })),
        code, id: crypto.randomUUID(), isActive: true, version: 1, workspaceId: String(params.workspaceId) }
      context.db.partners.unshift(value)
      return { id: value.id, version: 1 }
    })),
    http.put(root + '/partners/:id', ({ params, request }) => mutate(request, params.workspaceId, 'partner.revised', (body) => {
      const value = partners(params.workspaceId).find(item => item.id === params.id)
      if (!value) return missing()
      if (request.headers.get('if-match') !== `"${value.version}"`) return problem(412, 'precondition.failed', '伙伴版本已变化。')
      const profile = profileSchema.parse(body.profile), isActive = z.boolean().parse(body.isActive)
      Object.assign(value, profile, { isActive, contacts: profile.contacts.map(contact => ({ ...contact, id: contact.id ?? crypto.randomUUID() })), version: Number(value.version) + 1 })
      return { id: value.id, version: Number(value.version) }
    }))
  ]
}

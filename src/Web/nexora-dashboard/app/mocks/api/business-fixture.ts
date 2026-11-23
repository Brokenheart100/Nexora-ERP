import { HttpResponse } from 'msw/http'
import { z } from 'zod'
import { mockWorkspaceId, problem, type CatalogFixture } from './catalog'

type SavedWrite = { fingerprint: string, status: number, data: object }
type Store = Pick<Storage, 'getItem' | 'setItem'>

export function createBusinessFixture<T extends object>(catalog: CatalogFixture, stage: string, initial: T, storage?: Store, storeId = stage) {
  const key = 'nexora:msw:' + storeId
  let state = initial
  let operations: Record<string, SavedWrite> = {}
  try {
    const saved = storage?.getItem(key)
    if (saved) ({ state, operations } = JSON.parse(saved))
  } catch { /* An invalid stored fixture starts empty. */ }
  const active = () => catalog.scenario().startsWith(stage)
  const save = () => storage?.setItem(key, JSON.stringify({ state, operations }))
  const missing = () => problem(404, 'resource.not_found', '当前工作区没有此记录。')
  const forbidden = () => problem(403, 'resource.forbidden', '当前身份无权执行该操作。')
  const conflict = (message: string) => problem(409, 'resource.state_conflict', message)
  const stale = () => problem(412, 'resource.version_changed', '记录版本已变化，请刷新。')
  function read(workspace: unknown, query: () => object | Response) {
    if (!active()) return undefined
    if (workspace !== mockWorkspaceId) return missing()
    const result = query()
    return result instanceof Response ? result : HttpResponse.json(result)
  }
  async function write(workspace: unknown, request: Request, apply: (body: Record<string, unknown>) => object | Response,
    status: number | ((data: object) => number) = 200, remember: (data: object) => object = data => data) {
    if (!active()) return undefined
    if (workspace !== mockWorkspaceId) return missing()
    if (request.headers.get('x-csrf-token') !== 'msw-only-csrf') return problem(400, 'csrf.invalid', '写入校验失败。')
    const input = z.record(z.string(), z.unknown()).safeParse(await request.json().catch(() => null))
    if (!input.success || !z.uuid().safeParse(input.data.operationId).success || input.data.operationId !== request.headers.get('idempotency-key'))
      return problem(400, 'idempotency.invalid', '操作标识无效。')
    const key = catalog.subject() + ':' + input.data.operationId
    const fingerprint = JSON.stringify([request.method, new URL(request.url).pathname, input.data])
    const prior = operations[key]
    if (prior) return prior.fingerprint === fingerprint ? HttpResponse.json(prior.data, { status: prior.status }) : conflict('幂等键已用于其他操作。')
    const data = apply(input.data)
    if (data instanceof Response) return data
    const resultStatus = typeof status === 'function' ? status(data) : status
    operations[key] = { fingerprint, status: resultStatus, data: structuredClone(remember(data)) }
    save()
    return HttpResponse.json(data, { status: resultStatus })
  }
  return { state, active, save, missing, forbidden, conflict, stale, read, write }
}

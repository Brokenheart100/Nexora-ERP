import type { RequestScope } from './scope'
import { ScopeChangedError } from './scope'

export interface ApiResponse<T> { status: number, data: T, headers: Headers }
export interface WriteOperation<T> {
  readonly operationId: string
  state: 'ready' | 'pending' | 'confirmed' | 'rejected' | 'unknown'
  result: ApiResponse<T> | undefined
  readonly retryAvailable: boolean
  send(): Promise<ApiResponse<T>>
  readBack(read: () => Promise<{ applied: false } | { applied: true, result: ApiResponse<T> }>): Promise<boolean>
  retryExplicitly(): Promise<ApiResponse<T>>
}
export interface TransportOptions { method: 'GET' | 'POST' | 'PUT', headers: Record<string, string>, body?: Record<string, unknown>, signal: AbortSignal, responseType?: 'json' | 'blob' }
export type ApiTransport = (path: string, options: TransportOptions) => Promise<ApiResponse<unknown>>
type JsonObject = Record<string, unknown>
const object = (value: unknown): JsonObject => value && typeof value === 'object' && !Array.isArray(value) ? value as JsonObject : {}

export class ApiFailure extends Error {
  status: number
  code: string
  traceId: string
  errors: Record<string, string[]>
  kind: 'session' | 'mfa' | 'permission' | 'version' | 'conflict' | 'validation' | 'unavailable' | 'unexpected'

  constructor(response: ApiResponse<unknown>) {
    const top = object(response.data)
    const problem = typeof top.code === 'string' ? top : { ...top, ...object(top.data) }
    super(typeof problem.detail === 'string' ? problem.detail : typeof problem.statusMessage === 'string' ? problem.statusMessage : '请求未完成，请核对当前状态。')
    this.status = response.status
    this.code = typeof problem.code === 'string' ? problem.code : `http.${response.status}`
    this.traceId = typeof problem.traceId === 'string' ? problem.traceId : ''
    this.errors = Object.fromEntries(Object.entries(object(problem.errors)).filter((entry): entry is [string, string[]] => Array.isArray(entry[1]) && entry[1].every(x => typeof x === 'string')))
    this.kind = response.status === 401
      ? 'session'
      : this.code.startsWith('mfa_')
        ? 'mfa'
        : [403, 404].includes(response.status)
            ? 'permission'
            : response.status === 412 ? 'version' : response.status === 409 ? 'conflict' : response.status === 400 ? 'validation' : response.status >= 500 ? 'unavailable' : 'unexpected'
  }
}

export class ResultUnknownError extends Error {
  constructor() { super('结果待确认。请先读取当前记录，再决定是否重试原操作。') }
}
export class PendingResultError extends Error {
  constructor(public location: string) { super('仍在处理中，可稍后从原入口查询。') }
}

export function createApiClient(scope: RequestScope, transport: ApiTransport, events: { onFailure?: (failure: ApiFailure) => void } = {}) {
  async function request<T>(path: string, options: Partial<Omit<TransportOptions, 'signal'>> & { signal?: AbortSignal } = {}): Promise<ApiResponse<T>> {
    if (!path.startsWith('/bff/') || path.startsWith('//') || /[%\\]/.test(path.split('?')[0]!)) throw new Error('仅支持同源 BFF 请求。')
    const captured = scope.capture()
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(new DOMException('请求超时，请刷新读取当前状态。', 'TimeoutError')), 10000)
    const abort = () => controller.abort()
    const signals = [captured.signal, options.signal].filter((signal): signal is AbortSignal => !!signal)
    for (const signal of signals) {
      if (signal.aborted) controller.abort()
      signal.addEventListener('abort', abort, { once: true })
    }
    try {
      const result = await transport(path, { method: options.method ?? 'GET', headers: options.headers ?? {}, body: options.body, responseType: options.responseType, signal: controller.signal })
      scope.demand(captured)
      controller.signal.throwIfAborted()
      if (result.status < 200 || result.status >= 300) throw new ApiFailure(result)
      const contentType = result.headers.get('content-type')
      if (options.responseType !== 'blob' && result.status !== 204 && contentType && !/\bapplication\/(?:[\w.-]+\+)?json\b/i.test(contentType)) throw new Error('服务器返回了无法确认的响应。')
      return result as ApiResponse<T>
    } catch (error) {
      scope.demand(captured)
      if (error instanceof ApiFailure) events.onFailure?.(error)
      if (controller.signal.reason instanceof DOMException && controller.signal.reason.name === 'TimeoutError') throw new Error(controller.signal.reason.message, { cause: error })
      throw error
    } finally {
      clearTimeout(timeout)
      for (const signal of signals) signal.removeEventListener('abort', abort)
    }
  }

  function createWrite<T>(path: string, payload: JsonObject, options: { method?: 'POST' | 'PUT', etag?: string, operationId?: string, idempotent?: boolean, parse?: (data: unknown) => T } = {}): WriteOperation<T> {
    const identity = scope.key('write-owner')
    const owner = scope.capture()
    const operationId = options.operationId ?? (typeof payload.operationId === 'string' ? payload.operationId : crypto.randomUUID())
    if (payload.operationId && payload.operationId !== operationId) throw new Error('幂等操作标识不一致。')
    const useIdempotencyHeader = options.idempotent !== false
    const body = JSON.parse(JSON.stringify(useIdempotencyHeader ? { ...payload, operationId } : payload)) as JsonObject
    let flight: Promise<ApiResponse<T>> | undefined
    let readChecked = false
    const operation = {
      operationId,
      state: 'ready' as 'ready' | 'pending' | 'confirmed' | 'rejected' | 'unknown',
      result: undefined as ApiResponse<T> | undefined,
      get retryAvailable(): boolean { return options.idempotent === true && operation.state === 'unknown' && readChecked },
      async send(): Promise<ApiResponse<T>> {
        scope.demand(owner)
        if (identity !== scope.key('write-owner')) throw new ScopeChangedError()
        if (flight) return flight
        if (operation.state === 'confirmed') return operation.result!
        if (operation.state === 'unknown') throw new ResultUnknownError()
        operation.state = 'pending'
        flight = (async () => {
          try {
            const csrf = await request<{ requestToken: string }>('/bff/antiforgery')
            if (typeof csrf.data.requestToken !== 'string') throw new Error('会话校验响应无效。')
            const response = await request<T>(path, {
              method: options.method ?? 'POST', body,
              headers: { 'X-CSRF-TOKEN': csrf.data.requestToken, ...(useIdempotencyHeader ? { 'Idempotency-Key': operationId } : {}), ...(options.etag ? { 'If-Match': options.etag } : {}) }
            })
            if (options.parse) response.data = options.parse(response.data)
            operation.result = response
            operation.state = 'confirmed'
            return response
          } catch (error) {
            const definite = error instanceof ApiFailure && error.status >= 400 && error.status < 500
            operation.state = definite ? 'rejected' : 'unknown'
            if (definite || error instanceof ScopeChangedError) throw error
            throw new ResultUnknownError()
          } finally { flight = undefined }
        })()
        return flight
      },
      async readBack(read: () => Promise<{ applied: false } | { applied: true, result: ApiResponse<T> }>) {
        scope.demand(owner)
        if (identity !== scope.key('write-owner')) throw new ScopeChangedError()
        const captured = scope.capture()
        const value = await read()
        scope.demand(captured)
        readChecked = true
        if (value.applied) {
          operation.state = 'confirmed'
          operation.result = value.result
        }
        return value.applied
      },
      async retryExplicitly() {
        scope.demand(owner)
        if (identity !== scope.key('write-owner')) throw new ScopeChangedError()
        if (!operation.retryAvailable) throw new ResultUnknownError()
        readChecked = false
        operation.state = 'ready'
        return operation.send()
      }
    }
    return operation
  }

  async function poll<T>(location: string, options: { complete: (response: ApiResponse<T>) => boolean, budgetMs?: number, signal?: AbortSignal }) {
    if (!location.startsWith('/bff/api/') || location.includes('://')) throw new Error('异步结果必须通过同源业务入口查询。')
    const captured = scope.capture()
    const budget = new AbortController()
    const timeout = setTimeout(() => budget.abort(), options.budgetMs ?? 15000)
    const external = options.signal
    const cancel = () => budget.abort()
    external?.addEventListener('abort', cancel, { once: true })
    if (external?.aborted) budget.abort()
    try {
      while (!budget.signal.aborted) {
        scope.demand(captured)
        const result = await request<T>(location, { signal: budget.signal })
        if (budget.signal.aborted) break
        if (options.complete(result)) return result
        const header = result.headers.get('retry-after')
        const milliseconds = header && /^\d+$/.test(header) ? Number(header) * 1000 : header ? Date.parse(header) - Date.now() : 500
        const wait = Math.max(50, Math.min(Number.isFinite(milliseconds) ? milliseconds : 500, 5000))
        await new Promise<void>((resolve, reject) => {
          const signals = [captured.signal, budget.signal]
          const cleanup = () => signals.forEach(signal => signal.removeEventListener('abort', abort))
          const timer = setTimeout(() => {
            cleanup()
            resolve()
          }, wait)
          const abort = () => {
            clearTimeout(timer)
            cleanup()
            reject(new DOMException('Query cancelled', 'AbortError'))
          }
          for (const signal of signals) {
            if (signal.aborted) {
              abort()
              return
            }
            signal.addEventListener('abort', abort, { once: true })
          }
        })
      }
    } catch (error) {
      scope.demand(captured)
      if (!budget.signal.aborted) throw error
    } finally {
      clearTimeout(timeout)
      external?.removeEventListener('abort', cancel)
    }
    if (external?.aborted) throw new DOMException('Query cancelled', 'AbortError')
    throw new PendingResultError(location)
  }

  return { scope, get: <T>(path: string, options?: { signal?: AbortSignal, responseType?: 'json' | 'blob' }) => request<T>(path, options), createWrite, poll }
}

export type DashboardApi = ReturnType<typeof createApiClient>

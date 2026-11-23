import type { z } from 'zod'
import { assistantCapabilitiesSchema, assistantDecisionSchema, assistantDetailSchema, assistantHistorySchema, type AssistantEvent } from '#shared/types/assistant'
import { csrfTokenSchema } from '#shared/types/auth'
import { ApiFailure } from '~/utils/api/client'
import { consumeAssistantStream } from '~/utils/assistant/stream'
import { useDashboardApi } from './useDashboardApi'

export const assistantPath = (workspace: string) => '/bff/api/assistant/workspaces/' + workspace

export function useAssistantApi() {
  const api = useDashboardApi()
  const auth = useAuthSessionStore()
  async function read<T>(workspace: string, path: string, schema: z.ZodType<T>, signal?: AbortSignal) {
    return schema.parse((await api.get(assistantPath(workspace) + path, { signal })).data)
  }

  async function stream(workspace: string, path: string, input: object, receive: (event: AssistantEvent) => void, signal: AbortSignal) {
    const scope = api.scope.capture()
    const active = AbortSignal.any([scope.signal, signal, AbortSignal.timeout(130_000)])
    const csrf = csrfTokenSchema.parse((await api.get('/bff/antiforgery', { signal: active })).data)
    const response = await fetch(assistantPath(workspace) + path, {
      method: 'POST', credentials: 'same-origin', redirect: 'error', cache: 'no-store', signal: active,
      headers: { 'Accept': 'text/event-stream, application/problem+json', 'Content-Type': 'application/json', 'X-CSRF-TOKEN': csrf.requestToken },
      body: JSON.stringify(input)
    })
    api.scope.demand(scope)
    if (!response.ok) {
      const failure = new ApiFailure({ status: response.status, data: await response.json().catch(() => null), headers: response.headers })
      if (failure.status === 401) auth.expire(failure.code === 'session.idle_timeout' ? 'auth.idleTimeout' : '')
      throw failure
    }
    if (!response.body || !response.headers.get('content-type')?.startsWith('text/event-stream')) throw new Error('助手未返回可读的流式响应。')
    await consumeAssistantStream(response.body, (event) => {
      api.scope.demand(scope)
      active.throwIfAborted()
      receive(event)
    })
  }

  return {
    capabilities: (id: string, signal?: AbortSignal) => read(id, '/capabilities', assistantCapabilitiesSchema, signal),
    history: (id: string, signal?: AbortSignal) => read(id, '/sessions?limit=20', assistantHistorySchema, signal),
    detail: (id: string, conversation: string, signal?: AbortSignal) => read(id, '/sessions/' + conversation, assistantDetailSchema, signal),
    run: (id: string, conversation: string | null, message: string, receive: (event: AssistantEvent) => void, signal: AbortSignal) =>
      stream(id, '/runs', { sessionId: conversation, message }, receive, signal),
    resume: (id: string, execution: string, receive: (event: AssistantEvent) => void, signal: AbortSignal) =>
      stream(id, '/executions/' + execution + '/resume', {}, receive, signal),
    decide: (id: string, execution: string, action: 'cancel' | 'approve' | 'reject') => api.createWrite(assistantPath(id) + '/executions/' + execution + '/' + action, {}, {
      idempotent: false, parse: assistantDecisionSchema.parse
    }).send()
  }
}

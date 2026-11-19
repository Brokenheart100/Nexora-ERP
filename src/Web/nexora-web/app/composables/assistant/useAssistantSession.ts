import { appendDelta, parseSseChunk } from '~/utils/assistant/assistantStream'

interface AssistantToolCall {
  id: string
  name: string
  arguments: string
  status: string
  requiresApproval: boolean
  result?: string | null
}

interface AssistantMessage {
  id: string
  role: string
  content: string
  status: string
  atUtc: string
  tool?: AssistantToolCall | null
}

interface AssistantSessionSummary {
  id: string
  title: string
  createdAtUtc: string
  updatedAtUtc: string
  messageCount: number
  lastMessage: string
}

interface AssistantCapabilities {
  provider: string
  model: string
  configured: boolean
  tools: { name: string, description: string, requiresApproval: boolean }[]
}

export function useAssistantSession(workspaceId: () => string) {
  const base = computed(() => `/bff/api/assistant/workspaces/${workspaceId()}`)
  const sessions = ref<AssistantSessionSummary[]>([])
  const messages = ref<AssistantMessage[]>([])
  const capabilities = ref<AssistantCapabilities | null>(null)
  const sessionId = ref<string | null>(null)
  const executionId = ref<string | null>(null)
  const input = ref('')
  const busy = ref(false)
  const error = ref('')
  const notice = ref('')
  const resumable = ref(false)

  function detailOf(failure: unknown) {
    const data = (failure as { data?: { detail?: string, title?: string, code?: string } }).data
    return data?.detail || data?.title || (data?.code ? `请求被拒绝：${data.code}` : '')
  }

  async function csrfToken() {
    const result = await $fetch<{ requestToken: string }>('/bff/antiforgery', { retry: 0 })
    return result.requestToken
  }

  async function load() {
    error.value = ''
    try {
      const [caps, list] = await Promise.all([
        $fetch<AssistantCapabilities>(`${base.value}/capabilities`, { retry: 0 }),
        $fetch<{ sessions: AssistantSessionSummary[] }>(`${base.value}/sessions`, { retry: 0 }),
      ])
      capabilities.value = caps
      sessions.value = list.sessions
    }
    catch (failure) {
      error.value = detailOf(failure) || '无法加载 AI 助手。'
    }
  }

  async function refreshSessions() {
    try {
      const list = await $fetch<{ sessions: AssistantSessionSummary[] }>(`${base.value}/sessions`, { retry: 0 })
      sessions.value = list.sessions
    }
    catch {
      // The conversation stays usable even when the history refresh fails.
    }
  }

  async function openSession(id: string) {
    error.value = ''
    try {
      const result = await $fetch<{ session: { id: string, title: string, messages: AssistantMessage[] } }>(
        `${base.value}/sessions/${id}`, { retry: 0 },
      )
      sessionId.value = result.session.id
      messages.value = result.session.messages
      executionId.value = null
      resumable.value = false
      notice.value = ''
    }
    catch (failure) {
      error.value = detailOf(failure) || '无法加载会话。'
    }
  }

  function newSession() {
    sessionId.value = null
    messages.value = []
    executionId.value = null
    resumable.value = false
    error.value = ''
    notice.value = ''
  }

  function handleEvent(name: string, data: Record<string, unknown>) {
    if (name === 'session') {
      if (typeof data.sessionId === 'string') sessionId.value = data.sessionId
      if (typeof data.executionId === 'string') executionId.value = data.executionId
      const id = executionId.value
      if (id && !messages.value.some(message => message.id === id)) {
        messages.value.push({
          id, role: 'assistant', content: '', status: 'streaming', atUtc: new Date().toISOString(),
        })
      }
      return
    }
    const draft = messages.value.find(message => message.id === executionId.value)
    if (name === 'delta') {
      if (draft) draft.content = appendDelta(draft.content, data.text)
      return
    }
    if (name === 'tool_call' || name === 'approval_required') {
      const tool = data.tool as AssistantToolCall | undefined
      if (tool && draft) {
        draft.tool = tool
        if (name === 'approval_required') draft.status = 'pending_approval'
      }
      return
    }
    if (name === 'tool_result') {
      const tool = data.tool as AssistantToolCall | undefined
      if (draft) {
        if (tool) draft.tool = tool
        if (typeof data.summary === 'string') draft.content = data.summary
      }
      return
    }
    if (name === 'canceled') {
      if (draft) {
        if (typeof data.content === 'string') draft.content = data.content
        draft.status = 'canceled'
      }
      resumable.value = true
      return
    }
    if (name === 'done') {
      if (draft) {
        draft.status = typeof data.status === 'string' ? data.status : 'complete'
        if (typeof data.content === 'string' && data.content) draft.content = data.content
      }
      if (draft?.status !== 'pending_approval') resumable.value = false
    }
  }

  async function stream(path: string, body: object | null) {
    const token = await csrfToken()
    const response = await fetch(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'X-CSRF-TOKEN': token },
      body: body ? JSON.stringify(body) : undefined,
    })
    if (!response.ok) {
      let message = `请求失败（HTTP ${response.status}）。`
      try {
        const payload = await response.json() as { detail?: string, title?: string, code?: string }
        message = payload.detail || payload.title || (payload.code ? `请求被拒绝：${payload.code}` : message)
      }
      catch {
        // Keep the generic HTTP message when the error body is not JSON.
      }
      throw new Error(message)
    }
    const reader = response.body?.getReader()
    if (!reader) throw new Error('响应没有可读取的数据流。')
    const decoder = new TextDecoder()
    let buffer = ''
    for (;;) {
      const chunk = await reader.read()
      if (chunk.done) break
      buffer += decoder.decode(chunk.value, { stream: true })
      const parsed = parseSseChunk(buffer)
      buffer = parsed.rest
      for (const event of parsed.events) handleEvent(event.event, event.data)
    }
  }

  async function send() {
    const message = input.value.trim()
    if (!message || busy.value) return
    busy.value = true
    error.value = ''
    notice.value = ''
    resumable.value = false
    messages.value.push({
      id: `local-${Date.now()}`, role: 'user', content: message, status: 'complete', atUtc: new Date().toISOString(),
    })
    input.value = ''
    try {
      await stream(`${base.value}/runs`, { sessionId: sessionId.value, message })
    }
    catch (failure) {
      error.value = failure instanceof Error ? failure.message : '助手运行失败。'
    }
    finally {
      busy.value = false
      void refreshSessions()
    }
  }

  async function cancel() {
    if (!executionId.value) return
    try {
      const token = await csrfToken()
      await $fetch(`${base.value}/executions/${executionId.value}/cancel`, {
        method: 'POST', headers: { 'X-CSRF-TOKEN': token }, retry: 0,
      })
      notice.value = '已请求取消，等待助手停止…'
    }
    catch (failure) {
      error.value = detailOf(failure) || '取消失败。'
    }
  }

  async function resume() {
    if (!executionId.value || busy.value) return
    busy.value = true
    error.value = ''
    notice.value = ''
    try {
      await stream(`${base.value}/executions/${executionId.value}/resume`, null)
      resumable.value = false
    }
    catch (failure) {
      error.value = failure instanceof Error ? failure.message : '恢复生成失败。'
    }
    finally {
      busy.value = false
      void refreshSessions()
    }
  }

  async function approve() {
    if (!executionId.value || busy.value) return
    busy.value = true
    error.value = ''
    try {
      const token = await csrfToken()
      await $fetch(`${base.value}/executions/${executionId.value}/approve`, {
        method: 'POST', headers: { 'X-CSRF-TOKEN': token }, retry: 0,
      })
      if (sessionId.value) await openSession(sessionId.value)
      notice.value = '工具调用已批准并执行。'
      await refreshSessions()
    }
    catch (failure) {
      error.value = detailOf(failure) || '批准失败。'
    }
    finally {
      busy.value = false
    }
  }

  async function reject() {
    if (!executionId.value || busy.value) return
    busy.value = true
    error.value = ''
    try {
      const token = await csrfToken()
      await $fetch(`${base.value}/executions/${executionId.value}/reject`, {
        method: 'POST', headers: { 'X-CSRF-TOKEN': token }, retry: 0,
      })
      if (sessionId.value) await openSession(sessionId.value)
      notice.value = '工具调用已拒绝，未执行任何操作。'
      await refreshSessions()
    }
    catch (failure) {
      error.value = detailOf(failure) || '拒绝失败。'
    }
    finally {
      busy.value = false
    }
  }

  onMounted(load)

  return {
    sessions, messages, capabilities, sessionId, executionId, input, busy, error, notice, resumable,
    load, openSession, newSession, send, cancel, resume, approve, reject,
  }
}

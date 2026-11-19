import { defineStore } from 'pinia'
import type { AssistantReply, AssistantSession, AssistantTool } from '~/mocks'
import { assistantReplies, assistantSessions, assistantToolResult } from '~/mocks'

function cloneSessions() {
  return assistantSessions.map(session => ({
    ...session,
    messages: session.messages.map(message => ({
      ...message,
      tool: message.tool ? { ...message.tool } : undefined
    }))
  }))
}

function nowLabel() {
  return '刚刚'
}

function replyKeyFor(text: string): keyof typeof assistantReplies {
  if (text.includes('账龄')) return 'aging'
  if (text.includes('摘要') || text.includes('经营')) return 'summary'
  return 'balances'
}

/**
 * 工作区助手的纯前端会话：本地分片流式输出、取消与恢复、工具调用逐次审批。
 * 回复文本与工具结果来自 app/mocks/assistant.ts 的固定样例。
 */
export const useAssistantStore = defineStore('assistant', () => {
  const sessions = ref<AssistantSession[]>(cloneSessions())
  const activeId = ref('as-balances')
  const isStreaming = ref(false)
  const streamingSessionId = ref('')
  const canResume = ref(false)
  let timer: ReturnType<typeof setInterval> | null = null
  let streamState: { sessionId: string, messageId: string, reply: AssistantReply, cursor: number } | null = null

  const activeSession = computed(() => sessions.value.find(session => session.id === activeId.value) ?? sessions.value[0]!)
  const messages = computed(() => activeSession.value?.messages ?? [])
  const pendingTools = computed(() => messages.value.filter(message => message.tool?.status === 'pending').map(message => message.tool!))

  function clearTimer() {
    if (timer) {
      clearInterval(timer)
      timer = null
    }
  }

  function selectSession(id: string) {
    if (isStreaming.value) return
    if (sessions.value.some(session => session.id === id)) activeId.value = id
  }

  function createSession() {
    const id = 'as-' + Date.now()
    sessions.value.unshift({
      id,
      title: '新会话',
      updatedAt: nowLabel(),
      messages: []
    })
    activeId.value = id
    canResume.value = false
  }

  function appendToolMessage(session: AssistantSession, tool: AssistantTool) {
    session.messages.push({
      id: 'msg-tool-' + Date.now(),
      role: 'tool',
      content: '',
      status: 'complete',
      at: nowLabel(),
      tool
    })
  }

  function finishStream() {
    if (!streamState) return
    const session = sessions.value.find(item => item.id === streamState?.sessionId)
    const message = session?.messages.find(item => item.id === streamState?.messageId)
    if (!session || !message) {
      clearTimer()
      isStreaming.value = false
      return
    }
    message.content = streamState.reply.text
    message.status = 'complete'
    if (streamState.reply.tool) {
      appendToolMessage(session, { ...streamState.reply.tool })
    }
    session.updatedAt = nowLabel()
    isStreaming.value = false
    streamingSessionId.value = ''
    canResume.value = false
    clearTimer()
  }

  function tick() {
    if (!streamState) return
    const session = sessions.value.find(item => item.id === streamState?.sessionId)
    const message = session?.messages.find(item => item.id === streamState?.messageId)
    if (!session || !message) {
      clearTimer()
      isStreaming.value = false
      return
    }
    const next = Math.min(streamState.reply.text.length, streamState.cursor + 3)
    message.content = streamState.reply.text.slice(0, next)
    streamState.cursor = next
    if (next >= streamState.reply.text.length) finishStream()
  }

  function startStream(session: AssistantSession, messageId: string, reply: AssistantReply) {
    streamState = { sessionId: session.id, messageId, reply, cursor: 0 }
    isStreaming.value = true
    streamingSessionId.value = session.id
    canResume.value = false
    clearTimer()
    timer = setInterval(tick, 45)
  }

  function send(text: string) {
    const content = text.trim()
    if (!content || isStreaming.value) return
    const session = activeSession.value
    if (!session) return
    session.messages.push({
      id: 'msg-user-' + Date.now(),
      role: 'user',
      content,
      status: 'complete',
      at: nowLabel()
    })
    const assistantId = 'msg-assistant-' + Date.now()
    session.messages.push({
      id: assistantId,
      role: 'assistant',
      content: '',
      status: 'streaming',
      at: nowLabel()
    })
    session.updatedAt = nowLabel()
    const reply = assistantReplies[replyKeyFor(content)] ?? assistantReplies.balances!
    startStream(session, assistantId, reply)
  }

  function cancel() {
    if (!streamState) return
    const session = sessions.value.find(item => item.id === streamState?.sessionId)
    const message = session?.messages.find(item => item.id === streamState?.messageId)
    if (!message) return
    message.status = 'cancelled'
    clearTimer()
    isStreaming.value = false
    streamingSessionId.value = ''
    canResume.value = true
  }

  function resume() {
    if (!streamState || isStreaming.value) return
    const session = sessions.value.find(item => item.id === streamState?.sessionId)
    const message = session?.messages.find(item => item.id === streamState?.messageId)
    if (!session || !message) return
    if (streamState.cursor >= streamState.reply.text.length) {
      message.content = streamState.reply.text
      finishStream()
      return
    }
    message.status = 'streaming'
    isStreaming.value = true
    streamingSessionId.value = session.id
    canResume.value = false
    timer = setInterval(tick, 45)
  }

  function findTool(toolId: string) {
    for (const session of sessions.value) {
      for (const message of session.messages) {
        if (message.tool?.id === toolId) return { session, message, tool: message.tool }
      }
    }
    return null
  }

  function approveTool(toolId: string) {
    const found = findTool(toolId)
    if (!found || found.tool.status !== 'pending') return
    found.tool.status = 'approved'
    const result = assistantToolResult(found.tool)
    found.tool.resultLines = result.lines
    found.tool.links = result.links
    found.session.messages.push({
      id: 'msg-approved-' + Date.now(),
      role: 'assistant',
      content: '工具已执行，只读结果已返回当前会话；可继续追问或从结果链接跳转到对应页面。',
      status: 'complete',
      at: nowLabel()
    })
    found.session.updatedAt = nowLabel()
  }

  function denyTool(toolId: string) {
    const found = findTool(toolId)
    if (!found || found.tool.status !== 'pending') return
    found.tool.status = 'denied'
    found.tool.resultLines = ['已拒绝本次工具调用，未读取任何数据。']
    found.tool.links = []
    found.session.messages.push({
      id: 'msg-denied-' + Date.now(),
      role: 'assistant',
      content: '已拒绝工具调用，未访问财务数据。你可以换一种问法，或手动打开相关页面。',
      status: 'complete',
      at: nowLabel()
    })
    found.session.updatedAt = nowLabel()
  }

  function reset() {
    clearTimer()
    sessions.value = cloneSessions()
    activeId.value = 'as-balances'
    isStreaming.value = false
    streamingSessionId.value = ''
    canResume.value = false
    streamState = null
  }

  return {
    sessions,
    activeId,
    activeSession,
    messages,
    pendingTools,
    isStreaming,
    streamingSessionId,
    canResume,
    selectSession,
    createSession,
    send,
    cancel,
    resume,
    approveTool,
    denyTool,
    reset
  }
})

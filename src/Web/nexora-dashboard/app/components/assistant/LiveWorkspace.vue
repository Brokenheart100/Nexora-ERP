<script setup lang="ts">
import { assistantPromptMaxLength, type AssistantEvent, type AssistantMessage } from '#shared/types/assistant'
import { useAssistantApi } from '~/composables/api/useAssistantApi'
import { ApiFailure } from '~/utils/api/client'

const api = useAssistantApi()
const capabilities = useWorkspaceQuery('assistant-capabilities', '/assistant', api.capabilities)
const history = useWorkspaceQuery('assistant-sessions', '/assistant', api.history)
const selectedId = ref('')
const detail = useWorkspaceQuery('assistant-session', '/assistant', (workspace, signal) => selectedId.value
  ? api.detail(workspace, selectedId.value, signal)
  : Promise.resolve(null), () => selectedId.value)
const draft = ref('')
const error = ref('')
const running = ref(false)
const deciding = ref(false)
const pending = ref<{ reply: AssistantMessage, prompt?: AssistantMessage } | null>(null)
const streamController = shallowRef<AbortController | null>(null)
const workspace = () => history.session.activeWorkspaceId
const messages = computed(() => {
  const saved = detail.data?.session.messages ?? []
  const overlay = pending.value
  if (!overlay) return saved
  if (saved.some(message => message.id === overlay.reply.id)) {
    return saved.map(message => message.id === overlay.reply.id ? overlay.reply : message)
  }
  return [...saved, ...(overlay.prompt ? [overlay.prompt] : []), overlay.reply]
})
const planMissing = computed(() => history.session.access && history.session.entitlements && !history.session.entitlements.modules.includes('assistant'))
const writable = computed(() => capabilities.enabled && capabilities.data?.configured && !running.value && !deciding.value)
const execution = ref('')
const statusLabels: Record<string, string> = {
  streaming: '生成中', pending_approval: '等待审批', complete: '已完成', canceled: '已取消', failed: '执行失败',
  interrupted: '连接中断', executed: '已执行', pending: '待处理', rejected: '已拒绝'
}

function clear() {
  streamController.value?.abort()
  streamController.value = null
  running.value = deciding.value = false
  execution.value = selectedId.value = draft.value = error.value = ''
  pending.value = null
}
watch(() => history.owner, clear, { flush: 'sync' })
onScopeDispose(clear)

function select(id: string) {
  if (running.value || deciding.value) return
  selectedId.value = id
  pending.value = null
  error.value = ''
}

async function refreshConversation() {
  await Promise.all([history.refresh(), detail.refresh()])
}

function eventReceived(frame: AssistantEvent) {
  const overlay = pending.value
  if (!overlay) return
  if (frame.event === 'session') {
    selectedId.value = frame.data.sessionId
    execution.value = overlay.reply.id = frame.data.executionId
    return
  }
  if ('executionId' in frame.data && frame.data.executionId !== execution.value) return
  if (frame.event === 'delta') overlay.reply.content += frame.data.text
  if (frame.event === 'tool_call' || frame.event === 'tool_result' || frame.event === 'approval_required') overlay.reply.tool = frame.data.tool
  if (frame.event === 'approval_required') overlay.reply.status = 'pending_approval'
  if (frame.event === 'done' || frame.event === 'canceled') {
    overlay.reply.status = frame.event === 'done' ? frame.data.status : 'canceled'
    overlay.reply.content = frame.data.content ?? overlay.reply.content
  }
}

async function generate(prompt?: string, resume?: AssistantMessage) {
  if (!writable.value || (!prompt && !resume)) return
  const owner = history.owner
  const controller = new AbortController()
  const now = new Date().toISOString()
  streamController.value = controller
  running.value = true
  execution.value = ''
  error.value = ''
  pending.value = {
    reply: { id: resume?.id ?? crypto.randomUUID(), role: 'assistant', content: resume?.content ?? '', status: 'streaming', atUtc: now },
    prompt: prompt ? { id: crypto.randomUUID(), role: 'user', content: prompt, status: 'complete', atUtc: now } : undefined
  }
  if (prompt) draft.value = ''
  try {
    if (resume) await api.resume(workspace(), resume.id, eventReceived, controller.signal)
    else await api.run(workspace(), selectedId.value || null, prompt!, eventReceived, controller.signal)
  } catch (failure) {
    if (owner !== history.owner || streamController.value !== controller) return
    if (!controller.signal.aborted) {
      error.value = failure instanceof ApiFailure ? failure.message : '连接已中断。请刷新会话核对服务器记录。'
      if (prompt && failure instanceof ApiFailure && failure.status >= 400 && failure.status < 500) draft.value = prompt
      if (pending.value) pending.value.reply.status = 'interrupted'
    }
  } finally {
    if (owner === history.owner && streamController.value === controller) {
      await refreshConversation()
      if (owner === history.owner && streamController.value === controller) {
        if (controller.signal.aborted || !execution.value || detail.data?.session.messages.some(row => row.id === execution.value)) pending.value = null
        streamController.value = null
        running.value = false
      }
    }
  }
}

async function decide(id: string, action: 'cancel' | 'approve' | 'reject') {
  if (!history.enabled || deciding.value || (running.value && action !== 'cancel')) return
  const owner = history.owner
  error.value = ''
  deciding.value = true
  try {
    const { data } = await api.decide(workspace(), id, action)
    if (owner === history.owner && action === 'cancel' && data.status === 'canceled') streamController.value?.abort()
  } catch (failure) {
    if (owner === history.owner) error.value = failure instanceof ApiFailure && failure.status === 409
      ? '这项工具审批已变更，已重新读取会话。'
      : failure instanceof Error ? failure.message : '操作结果待确认。'
  } finally {
    if (owner === history.owner) {
      await refreshConversation()
      if (owner === history.owner) deciding.value = false
    }
  }
}
</script>

<template>
  <div data-testid="live-assistant" class="space-y-3">
    <USkeleton v-if="history.loading && !history.enabled" class="h-20 w-full" />
    <UAlert
      v-else-if="!history.enabled"
      :title="planMissing ? '当前套餐未包含工作区助手' : '请选择有权访问的工作区'"
      color="warning"
      variant="subtle"
      data-testid="live-assistant-unavailable"
    >
      <template v-if="planMissing && history.session.canVisit('/settings')" #actions>
        <UButton
          :to="{ path: '/settings', query: { workspace: workspace(), tab: 'billing' } }"
          label="查看套餐"
          size="sm"
          color="neutral"
          variant="outline"
        />
      </template>
    </UAlert>
    <template v-else>
      <SettingsAdministrationQueryState :query="capabilities" />
      <UAlert
        v-if="capabilities.data && !capabilities.data.configured"
        title="助手提供方尚未配置"
        color="warning"
        variant="subtle"
      />
      <div class="grid items-start gap-3 lg:grid-cols-[minmax(12rem,16rem)_minmax(0,1fr)]">
        <UCard>
          <template #header>
            <div class="flex flex-wrap items-center justify-between gap-2">
              <h2 class="font-medium">
                历史会话
              </h2>
              <UButton
                label="新会话"
                size="sm"
                color="neutral"
                variant="outline"
                :disabled="running || deciding"
                data-testid="live-assistant-new"
                @click="select('')"
              />
            </div>
          </template>
          <SettingsAdministrationQueryState :query="history" />
          <div v-if="history.data" class="space-y-1" data-testid="live-assistant-history">
            <p v-if="!history.data.sessions.length" class="text-sm text-muted">
              当前工作区暂无会话记录。
            </p>
            <UButton
              v-for="item in history.data.sessions"
              :key="item.id"
              block
              color="neutral"
              :variant="selectedId === item.id ? 'soft' : 'ghost'"
              class="justify-start text-left"
              :disabled="running || deciding"
              :data-testid="'live-assistant-session-' + item.id"
              @click="select(item.id)"
            >
              <span class="min-w-0">
                <span class="block truncate">{{ item.title }}</span>
                <span class="block truncate text-xs text-muted">{{ item.lastMessage }}</span>
              </span>
            </UButton>
          </div>
        </UCard>

        <UCard class="min-w-0">
          <template #header>
            <div class="flex flex-wrap items-center justify-between gap-2">
              <h2 class="font-medium">
                {{ detail.data?.session.title ?? '新会话' }}
              </h2>
              <div class="flex flex-wrap items-center gap-2">
                <UBadge
                  v-if="capabilities.data"
                  :label="capabilities.data.model"
                  color="neutral"
                  variant="subtle"
                />
                <UButton
                  v-if="running"
                  label="停止生成"
                  size="sm"
                  color="neutral"
                  variant="outline"
                  :disabled="!execution || deciding"
                  data-testid="live-assistant-cancel"
                  @click="decide(execution, 'cancel')"
                />
                <UButton
                  v-else
                  label="刷新会话"
                  size="sm"
                  color="neutral"
                  variant="outline"
                  :disabled="deciding"
                  data-testid="live-assistant-refresh"
                  @click="refreshConversation"
                />
              </div>
            </div>
          </template>
          <div class="space-y-3">
            <UAlert
              v-if="error"
              :title="error"
              color="warning"
              variant="subtle"
              data-testid="live-assistant-error"
            />
            <SettingsAdministrationQueryState v-if="selectedId && !running" :query="detail" />
            <div
              v-if="messages.length"
              class="max-h-[55vh] space-y-2 overflow-auto"
              aria-live="polite"
              data-testid="live-assistant-messages"
            >
              <article
                v-for="message in messages"
                :key="message.id"
                class="rounded border border-default p-3"
                :data-testid="'live-assistant-message-' + message.id"
              >
                <div class="mb-1 flex flex-wrap items-center gap-2">
                  <span class="text-sm font-medium">{{ message.role === 'user' ? '你' : message.role === 'tool' ? '工具结果' : '助手' }}</span>
                  <UBadge
                    v-if="message.role !== 'user'"
                    :label="statusLabels[message.status] ?? message.status"
                    size="sm"
                    color="neutral"
                    variant="subtle"
                  />
                </div>
                <p v-if="message.content" class="whitespace-pre-wrap break-words text-sm">
                  {{ message.content }}
                </p>
                <div v-if="message.tool" class="mt-2 space-y-2 border-t border-default pt-2">
                  <p class="text-sm font-medium">
                    {{ message.tool.name }} · {{ statusLabels[message.tool.status] ?? message.tool.status }}
                  </p>
                  <pre class="whitespace-pre-wrap break-all text-xs text-muted">{{ message.tool.arguments }}</pre>
                  <p v-if="message.tool.result && message.tool.result !== message.content" class="text-sm">
                    {{ message.tool.result }}
                  </p>
                  <div v-if="message.status === 'pending_approval' && message.tool.status === 'pending' && message.tool.requiresApproval" class="flex gap-2">
                    <UButton
                      label="批准执行"
                      size="sm"
                      :disabled="!writable"
                      data-testid="live-assistant-approve"
                      @click="decide(message.id, 'approve')"
                    />
                    <UButton
                      label="拒绝执行"
                      size="sm"
                      color="neutral"
                      variant="outline"
                      :disabled="!writable"
                      data-testid="live-assistant-reject"
                      @click="decide(message.id, 'reject')"
                    />
                  </div>
                </div>
                <UButton
                  v-if="message.role === 'assistant' && message.status === 'canceled'"
                  label="恢复生成"
                  size="sm"
                  color="neutral"
                  variant="outline"
                  class="mt-2"
                  :disabled="!writable"
                  data-testid="live-assistant-resume"
                  @click="generate(undefined, message)"
                />
              </article>
            </div>
            <UEmpty v-else-if="!detail.loading" title="发送消息开始会话" icon="i-carbon-chat" />
          </div>
          <template #footer>
            <form class="space-y-2" @submit.prevent="generate(draft.trim())">
              <UFormField label="发给工作区助手" required>
                <UTextarea
                  v-model="draft"
                  :maxlength="assistantPromptMaxLength"
                  :rows="3"
                  class="w-full"
                  data-testid="live-assistant-prompt"
                />
              </UFormField>
              <UButton
                type="submit"
                label="发送"
                :disabled="!draft.trim() || !writable"
                data-testid="live-assistant-send"
              />
            </form>
          </template>
        </UCard>
      </div>
      <UCard v-if="capabilities.data?.tools.length">
        <template #header>
          <h2 class="font-medium">
            可用工具
          </h2>
        </template>
        <ul class="grid gap-3 text-sm sm:grid-cols-2">
          <li v-for="tool in capabilities.data.tools" :key="tool.name">
            <p class="font-medium">
              {{ tool.name }}<span v-if="tool.requiresApproval" class="text-xs text-muted"> · 需审批</span>
            </p>
            <p class="text-muted">
              {{ tool.description }}
            </p>
          </li>
        </ul>
      </UCard>
    </template>
  </div>
</template>

<script setup lang="ts">
import { assistantStatusLabel } from '~/utils/assistant/assistantStream'

const props = defineProps<{ workspaceId: string }>()
const {
  sessions, messages, capabilities, sessionId, executionId, input, busy, error, notice, resumable,
  load, openSession, newSession, send, cancel, resume, approve, reject,
} = useAssistantSession(() => props.workspaceId)

function formatTime(value: string) {
  return new Date(value).toLocaleString('zh-CN', { hour12: false })
}

function roleLabel(role: string) {
  return role === 'user' ? '你' : role === 'tool' ? '工具' : '助手'
}
</script>

<template>
  <section class="assistant rounded-nx border border-nx-border bg-nx-surface p-6 shadow-nx-sm">
    <header class="assistant-head">
      <div>
        <h2><UIcon class="mr-2 inline-block size-[1.08em] align-[-0.16em] text-nx-primary" name="i-lucide-sparkles" aria-hidden="true" />AI 助手</h2>
        <p class="mt-2 text-[12px] leading-[1.62] text-nx-ink-3">
          会话按工作区与用户隔离，工具调用使用你当前的权限。当前模型：
          <strong>{{ capabilities ? capabilities.provider : '加载中' }}</strong>
          <span v-if="capabilities"> · {{ capabilities.model }}<span v-if="!capabilities.configured">（未配置外部模型，使用本地确定性测试模型）</span></span>
        </p>
      </div>
      <div class="mb-3 mt-2 flex flex-wrap gap-2">
        <UButton variant="outline" color="neutral" size="sm" type="button" :disabled="busy" @click="load">刷新</UButton>
        <UButton variant="outline" color="neutral" size="sm" type="button" :disabled="busy" @click="newSession">新会话</UButton>
      </div>
    </header>

    <UAlert v-if="error" role="alert" color="error" icon="i-lucide-circle-alert" :description="error" />
    <UAlert v-if="notice" role="status" :description="notice" />

    <div class="assistant-body">
      <aside class="assistant-sessions" data-testid="assistant-sessions" aria-label="会话历史">
        <h3>会话历史</h3>
        <p v-if="!sessions.length" class="mt-2 text-[12px] leading-[1.62] text-nx-ink-3">暂无历史会话。</p>
        <ul>
          <li v-for="session in sessions" :key="session.id">
            <button type="button" :class="{ current: session.id === sessionId }" :disabled="busy"
              @click="openSession(session.id)">
              <span class="session-title">{{ session.title }}</span>
              <span class="session-meta">{{ formatTime(session.updatedAtUtc) }} · {{ session.messageCount }} 条</span>
            </button>
          </li>
        </ul>
      </aside>

      <div class="assistant-main">
        <ol class="assistant-messages" aria-live="polite">
          <li v-for="message in messages" :key="message.id" :data-role="message.role">
            <div class="message-head">
              <span class="message-role">{{ roleLabel(message.role) }}</span>
              <span class="message-status">{{ assistantStatusLabel(message.status) }}</span>
            </div>
            <p v-if="message.content" class="message-content">{{ message.content }}</p>
            <p v-else-if="message.status === 'streaming'" class="message-content streaming">正在生成…</p>
            <div v-if="message.tool" class="tool-card">
              <p>
                <strong>工具 {{ message.tool.name }}</strong>
                · {{ message.tool.status === 'pending' ? '等待审批' : message.tool.status }}
              </p>
              <p class="mt-2 text-[12px] leading-[1.62] text-nx-ink-3">参数：{{ message.tool.arguments }}</p>
              <div v-if="message.tool.status === 'pending'" class="mb-3 mt-2 flex flex-wrap gap-2">
                <UButton type="button" :disabled="busy" @click="approve">批准执行</UButton>
                <UButton variant="outline" color="neutral" size="sm" type="button" :disabled="busy" @click="reject">拒绝</UButton>
              </div>
            </div>
          </li>
          <li v-if="!messages.length" class="empty">
            <p class="mt-2 text-[12px] leading-[1.62] text-nx-ink-3">
              输入消息开始对话。示例：
              <button type="button" class="link" @click="input = '请读取本期试算平衡'">请读取本期试算平衡</button>
              或
              <button type="button" class="link" @click="input = '记录一条会话备注：下周复核应收'">记录一条会话备注</button>。
            </p>
          </li>
        </ol>

        <form class="assistant-input" @submit.prevent="send">
          <label class="sr-only" for="assistant-message">消息</label>
          <UTextarea id="assistant-message" :model-value="input" :rows="3" maxlength="4000" :disabled="busy"
            placeholder="向助手提问；工具调用将使用你当前的权限。"
            @update:model-value="value => input = String(value)" />
          <div class="mb-3 mt-2 flex flex-wrap gap-2">
            <UButton type="submit" :disabled="busy || !input.trim()">发送</UButton>
            <UButton v-if="busy" variant="outline" color="neutral" size="sm" type="button" :disabled="!executionId" @click="cancel">取消</UButton>
            <UButton v-if="resumable && !busy" variant="outline" color="neutral" size="sm" type="button" @click="resume">恢复生成</UButton>
          </div>
        </form>
      </div>
    </div>
  </section>
</template>

<style scoped>
.assistant-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}

.assistant-body {
  display: grid;
  grid-template-columns: 240px minmax(0, 1fr);
  gap: 18px;
  margin-top: 14px;
}

.assistant-sessions h3 {
  margin: 0 0 8px;
  font-size: 14px;
}

.assistant-sessions ul {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.assistant-sessions button {
  display: flex;
  flex-direction: column;
  gap: 4px;
  width: 100%;
  padding: 8px 10px;
  text-align: left;
  background: transparent;
  border: 1px solid var(--nx-border);
  border-radius: var(--nx-radius-sm);
  color: inherit;
  cursor: pointer;
}

.assistant-sessions button.current {
  border-color: var(--nx-primary);
  background: var(--nx-primary-soft);
}

.session-title {
  font-weight: 600;
}

.session-meta {
  font-size: 12px;
  color: var(--nx-ink);
  opacity: 0.65;
}

.assistant-messages {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 220px;
  max-height: 460px;
  margin: 0;
  padding: 0;
  overflow-y: auto;
  list-style: none;
}

.assistant-messages li {
  padding: 10px 12px;
  background: var(--nx-surface);
  border: 1px solid var(--nx-border);
  border-radius: var(--nx-radius-sm);
}

.assistant-messages li[data-role='user'] {
  background: var(--nx-surface-muted);
}

.message-head {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  opacity: 0.7;
}

.message-content {
  margin: 6px 0 0;
  white-space: pre-wrap;
}

.message-content.streaming {
  opacity: 0.6;
}

.tool-card {
  margin-top: 8px;
  padding: 8px 10px;
  border: 1px dashed var(--nx-border);
  border-radius: var(--nx-radius-sm);
}

.tool-card p {
  margin: 0 0 6px;
}

.assistant-input {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 14px;
}

.link {
  padding: 0;
  background: none;
  border: 0;
  color: var(--nx-primary);
  text-decoration: underline;
  cursor: pointer;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
  border: 0;
}

@media (max-width: 900px) {
  .assistant-body {
    grid-template-columns: 1fr;
  }
}
</style>

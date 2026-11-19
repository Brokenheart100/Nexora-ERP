<script setup lang="ts">
import { assistantSuggestions } from '~/mocks'
import { useAssistantStore } from '~/stores/assistant'

const props = defineProps<{ roleRestricted: boolean }>()

const assistant = useAssistantStore()
const input = ref('')
const messagesEl = ref<HTMLElement | null>(null)

const canSend = computed(() => !props.roleRestricted && !assistant.isStreaming && input.value.trim().length > 0)

function scrollToBottom() {
  nextTick(() => {
    if (messagesEl.value) messagesEl.value.scrollTop = messagesEl.value.scrollHeight
  })
}

watch(() => assistant.messages.map(message => message.content).join('|').length, scrollToBottom)

function sendMessage() {
  if (!canSend.value) return
  const text = input.value
  input.value = ''
  assistant.send(text)
  scrollToBottom()
}

function useSuggestion(prompt: string) {
  input.value = prompt
  sendMessage()
}
</script>

<template>
  <section class="flex min-h-0 flex-col rounded-sm border border-default">
    <div class="flex items-center justify-between gap-2 border-b border-default p-3">
      <div class="min-w-0">
        <h2 class="truncate text-sm font-semibold text-highlighted" data-testid="assistant-session-title">
          {{ assistant.activeSession?.title }}
        </h2>
        <p class="text-xs text-muted">
          {{ assistant.activeSession?.updatedAt }} · 固定知识样例，不调用外部模型
        </p>
      </div>
      <UBadge
        v-if="assistant.isStreaming"
        label="生成中"
        color="warning"
        variant="subtle"
        size="sm"
        data-testid="assistant-streaming"
      />
    </div>

    <div ref="messagesEl" class="min-h-0 flex-1 space-y-3 overflow-y-auto p-3" data-testid="assistant-messages">
      <div v-if="assistant.messages.length === 0" class="rounded-sm border border-dashed border-default p-8 text-center text-sm text-muted">
        输入问题或选择一个样例问题开始。
      </div>
      <template v-for="message in assistant.messages" :key="message.id">
        <div v-if="message.role === 'user'" class="flex justify-end" :data-testid="'assistant-msg-' + message.id">
          <div class="max-w-[82%] rounded-sm bg-primary/10 px-3 py-2">
            <p class="whitespace-pre-wrap text-sm text-highlighted">
              {{ message.content }}
            </p>
            <p class="mt-1 text-right text-[11px] text-dimmed">
              {{ message.at }}
            </p>
          </div>
        </div>
        <div v-else-if="message.role === 'assistant'" class="flex justify-start" :data-testid="'assistant-msg-' + message.id">
          <div class="max-w-[88%]">
            <div class="rounded-sm border border-default bg-elevated/40 px-3 py-2">
              <p class="whitespace-pre-wrap text-sm text-toned">
                {{ message.content }}<span v-if="message.status === 'streaming'" class="ml-0.5 inline-block h-3 w-1 animate-pulse bg-primary align-middle" />
              </p>
              <div class="mt-2 flex items-center gap-2">
                <span class="text-[11px] text-dimmed">{{ message.at }}</span>
                <UBadge
                  v-if="message.status === 'cancelled'"
                  label="已取消"
                  color="warning"
                  variant="subtle"
                  size="sm"
                />
              </div>
            </div>
          </div>
        </div>
        <AssistantToolCard
          v-else-if="message.tool"
          :tool="message.tool"
          :role-restricted="roleRestricted"
        />
      </template>
    </div>

    <div class="border-t border-default p-3">
      <div class="mb-2 flex flex-wrap gap-2">
        <UButton
          v-for="suggestion in assistantSuggestions"
          :key="suggestion.key"
          size="xs"
          color="neutral"
          variant="subtle"
          :label="suggestion.label"
          :disabled="roleRestricted || assistant.isStreaming"
          :data-testid="'assistant-suggestion-' + suggestion.key"
          @click="useSuggestion(suggestion.prompt)"
        />
      </div>
      <div class="flex items-end gap-2">
        <UTextarea
          v-model="input"
          :rows="2"
          :disabled="roleRestricted"
          placeholder="询问余额、账龄或经营摘要…"
          class="flex-1"
          data-testid="assistant-input"
          @keydown.enter.exact.prevent="sendMessage"
        />
        <div class="flex flex-col gap-1">
          <UButton
            v-if="!assistant.isStreaming"
            size="sm"
            color="primary"
            icon="i-carbon-send"
            label="发送"
            :disabled="!canSend"
            data-testid="assistant-send"
            @click="sendMessage"
          />
          <UButton
            v-else
            size="sm"
            color="neutral"
            variant="subtle"
            label="取消生成"
            data-testid="assistant-cancel"
            @click="assistant.cancel"
          />
          <UButton
            v-if="assistant.canResume && !assistant.isStreaming"
            size="sm"
            color="primary"
            variant="subtle"
            label="恢复生成"
            data-testid="assistant-resume"
            @click="assistant.resume"
          />
        </div>
      </div>
      <p class="mt-2 text-[11px] text-dimmed">
        本地分片输出，约 1–2 秒完成；工具调用需逐次审批，结果可跳回科目、总账或报表。
      </p>
    </div>
  </section>
</template>

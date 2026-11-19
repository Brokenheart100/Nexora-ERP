<script setup lang="ts">
import { useAssistantStore } from '~/stores/assistant'

const assistant = useAssistantStore()
</script>

<template>
  <aside class="flex min-h-0 flex-col rounded-sm border border-default">
    <div class="flex items-center justify-between border-b border-default p-3">
      <div>
        <h2 class="text-sm font-semibold text-highlighted">
          会话
        </h2>
        <p class="text-xs text-muted">
          {{ assistant.sessions.length }} 个历史会话
        </p>
      </div>
      <UButton
        size="xs"
        color="primary"
        variant="subtle"
        icon="i-carbon-add"
        label="新建"
        data-testid="assistant-new"
        @click="assistant.createSession"
      />
    </div>
    <div class="min-h-0 flex-1 space-y-1 overflow-y-auto p-2">
      <button
        v-for="item in assistant.sessions"
        :key="item.id"
        type="button"
        class="w-full rounded-sm border p-2 text-left transition"
        :class="item.id === assistant.activeId ? 'border-primary/40 bg-primary/5' : 'border-transparent hover:bg-elevated/70'"
        :data-testid="'assistant-session-' + item.id"
        @click="assistant.selectSession(item.id)"
      >
        <span class="block truncate text-xs font-medium text-highlighted">{{ item.title }}</span>
        <span class="mt-1 block text-[11px] text-dimmed">{{ item.updatedAt }} · {{ item.messages.length }} 条消息</span>
      </button>
    </div>
    <div class="border-t border-default p-3 text-[11px] text-dimmed">
      会话仅保存在当前页面，刷新后恢复固定样例。
    </div>
  </aside>
</template>

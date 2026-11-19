<script setup lang="ts">
import type { AssistantTool } from '~/mocks'
import { assistantToolStatusLabels } from '~/mocks'
import { useAssistantStore } from '~/stores/assistant'

defineProps<{
  tool: AssistantTool
  roleRestricted: boolean
}>()

const assistant = useAssistantStore()

const toolColors = { pending: 'warning', approved: 'success', denied: 'neutral' } as const
</script>

<template>
  <div
    class="rounded-sm border p-3"
    :class="tool.status === 'pending' ? 'border-warning/40 bg-warning/5' : 'border-default bg-elevated/30'"
    :data-testid="'assistant-tool-' + tool.id"
  >
    <div class="flex flex-wrap items-start justify-between gap-2">
      <div class="min-w-0">
        <div class="flex flex-wrap items-center gap-2">
          <UIcon name="i-carbon-tool-kit" class="size-4 text-muted" />
          <p class="text-sm font-medium text-highlighted">
            {{ tool.title }}
          </p>
          <UBadge
            :label="assistantToolStatusLabels[tool.status]"
            :color="toolColors[tool.status]"
            variant="subtle"
            size="sm"
            :data-testid="'assistant-tool-status-' + tool.id"
          />
        </div>
        <p class="mt-1 text-xs text-muted">
          {{ tool.purpose }}
        </p>
      </div>
      <span class="font-mono text-[11px] text-dimmed">{{ tool.name }}</span>
    </div>
    <div class="mt-2 rounded-sm bg-elevated/70 p-2 text-[11px] text-toned">
      <p class="font-mono">
        {{ tool.arguments }}
      </p>
      <p class="mt-1 text-dimmed">
        {{ tool.scope }}
      </p>
    </div>
    <div v-if="tool.resultLines?.length" class="mt-2 space-y-1" :data-testid="'assistant-tool-result-' + tool.id">
      <p v-for="line in tool.resultLines" :key="line" class="text-xs text-toned">
        {{ line }}
      </p>
    </div>
    <div v-if="tool.links?.length" class="mt-2 flex flex-wrap gap-2">
      <UButton
        v-for="link in tool.links"
        :key="link.to"
        :to="link.to"
        size="xs"
        color="primary"
        variant="subtle"
        :label="link.label"
        :data-testid="'assistant-tool-link-' + tool.id + '-' + link.to.split('=')[1]"
      />
    </div>
    <div v-if="tool.status === 'pending'" class="mt-3 space-y-2">
      <p
        v-if="roleRestricted"
        class="text-[11px] text-warning"
        :data-testid="'assistant-tool-role-block-' + tool.id"
      >
        当前角色没有 finance.view 权限，无法批准该工具调用；可拒绝或切换身份后重试。
      </p>
      <div class="flex flex-wrap gap-2">
        <UButton
          size="xs"
          color="primary"
          label="允许执行"
          :disabled="roleRestricted"
          :data-testid="'assistant-tool-allow-' + tool.id"
          @click="assistant.approveTool(tool.id)"
        />
        <UButton
          size="xs"
          color="neutral"
          variant="subtle"
          label="拒绝"
          :data-testid="'assistant-tool-deny-' + tool.id"
          @click="assistant.denyTool(tool.id)"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { BadgeColor, ChangeEntityType, ChangeEntry } from '~/mocks'
import { changeEntityLabels } from '~/mocks'

const props = withDefaults(defineProps<{
  entries: ChangeEntry[]
  compact?: boolean
  emptyTitle?: string
  emptyDescription?: string
}>(), {
  compact: false,
  emptyTitle: '暂无变更记录',
  emptyDescription: '完成一次创建或编辑后，变更会记录在这里。'
})

const entityColors: Record<ChangeEntityType, BadgeColor> = {
  'product': 'primary',
  'partner': 'secondary',
  'purchase-order': 'info',
  'sales-order': 'warning',
  'invoice': 'success',
  'definition': 'neutral'
}

// 按动作关键词挑选图标；模拟数据里的动作文案为中文短语。
function actionIcon(action: string): string {
  if (/创建|新增/.test(action)) return 'i-carbon-add'
  if (/归档/.test(action)) return 'i-carbon-archive'
  if (/恢复/.test(action)) return 'i-carbon-renew'
  if (/审批通过|收货|回款|开具/.test(action)) return 'i-carbon-checkmark'
  if (/提交/.test(action)) return 'i-carbon-send'
  if (/驳回|取消|删除|停用/.test(action)) return 'i-carbon-close'
  if (/更新|编辑|调整/.test(action)) return 'i-carbon-edit'
  return 'i-carbon-time'
}
</script>

<template>
  <div data-testid="change-log-timeline">
    <div v-if="!props.entries.length" data-testid="change-log-empty">
      <slot name="empty">
        <UEmpty
          icon="i-carbon-time"
          :title="props.emptyTitle"
          :description="props.emptyDescription"
        />
      </slot>
    </div>
    <ol v-else class="space-y-0">
      <li
        v-for="(entry, index) in props.entries"
        :key="entry.id"
        class="flex gap-2.5"
        data-testid="change-log-entry"
      >
        <div class="flex flex-col items-center" aria-hidden="true">
          <span class="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border border-default bg-elevated text-muted">
            <UIcon :name="actionIcon(entry.action)" class="size-3.5" />
          </span>
          <span
            v-if="index < props.entries.length - 1"
            class="mt-1 flex-1 border-l border-default"
          />
        </div>
        <div class="min-w-0 flex-1" :class="props.compact ? 'pb-3' : 'pb-5'">
          <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
            <UBadge
              :color="entityColors[entry.entityType]"
              variant="subtle"
              size="sm"
              :label="changeEntityLabels[entry.entityType]"
            />
            <span class="text-xs font-medium text-default">{{ entry.action }}</span>
            <span class="min-w-0 truncate text-xs text-muted">{{ entry.entityName }}</span>
            <span class="ml-auto shrink-0 text-[11px] tabular-nums text-muted">{{ entry.at }}</span>
          </div>
          <p class="mt-1 text-xs leading-5 text-muted">
            {{ entry.summary }}
          </p>
          <p class="mt-0.5 text-[11px] text-dimmed">
            操作者：{{ entry.actor }} · <span class="font-mono">{{ entry.entityId }}</span>
          </p>
        </div>
      </li>
    </ol>
  </div>
</template>

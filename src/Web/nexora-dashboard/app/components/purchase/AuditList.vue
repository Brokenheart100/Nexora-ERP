<script setup lang="ts">
import type { PurchaseAuditEntry } from '~/mocks'

defineProps<{ entries: PurchaseAuditEntry[] }>()

function actionColor(action: string): 'success' | 'error' | 'warning' | 'neutral' {
  if (action.includes('驳回') || action.includes('取消')) return 'error'
  if (action.includes('通过') || action.includes('关闭')) return 'success'
  if (action.includes('提交') || action.includes('创建') || action.includes('收货')) return 'warning'
  return 'neutral'
}
</script>

<template>
  <div data-testid="order-audit">
    <ul v-if="entries.length" class="space-y-0">
      <li
        v-for="entry in entries"
        :key="entry.id"
        class="flex flex-wrap items-start gap-x-2 gap-y-1 border-b border-default py-2 first:pt-0 last:border-b-0 last:pb-0"
        data-testid="order-audit-entry"
      >
        <UBadge
          :color="actionColor(entry.action)"
          variant="subtle"
          size="sm"
          :label="entry.action"
        />
        <span class="text-xs font-medium text-default">{{ entry.actor }}</span>
        <span class="text-[11px] tabular-nums text-muted">{{ entry.at }}</span>
        <p class="w-full text-xs text-muted">
          {{ entry.detail }}
        </p>
      </li>
    </ul>
    <p v-else class="text-xs text-muted" data-testid="order-audit-empty">
      暂无审计记录
    </p>
  </div>
</template>

<script setup lang="ts">
import type { TimelineItem } from '@nuxt/ui'

const { open, items, unread, markAllRead, markRead } = useNotifications()

const timelineItems = computed<TimelineItem[]>(() => items.value.map(item => ({
  date: item.at,
  title: item.title,
  description: item.source + ' · ' + item.description,
  icon: item.icon,
  value: item.id,
  to: item.to
})))

function isUnread(item: TimelineItem) {
  return unread.value.some(entry => entry.id === item.value)
}

function readItem(item: TimelineItem) {
  markRead(String(item.value))
}

async function selectItem(_event: Event, item: TimelineItem) {
  markRead(String(item.value))
  const target = typeof item.to === 'string' ? item.to : '/'
  open.value = false
  await navigateTo(target)
}
</script>

<template>
  <USlideover
    v-model:open="open"
    title="通知"
    description="公告、采购/销售待审批、库存预警与最近单据（本地模拟数据）"
    :ui="{ content: 'sm:max-w-md' }"
    data-testid="notification-slideover"
  >
    <template #body>
      <UTimeline
        v-if="timelineItems.length"
        :items="timelineItems"
        size="sm"
        color="primary"
        @select="selectItem"
      >
        <template #title="{ item }">
          <span class="flex items-center justify-between gap-2">
            <span class="flex min-w-0 items-center gap-1.5">
              <span
                v-if="isUnread(item)"
                class="size-1.5 shrink-0 rounded-full bg-primary"
                aria-label="未读"
              />
              <span class="truncate">{{ item.title }}</span>
            </span>
            <UButton
              v-if="isUnread(item)"
              icon="i-carbon-checkmark"
              color="neutral"
              variant="ghost"
              size="xs"
              aria-label="标为已读"
              data-testid="notification-read-one"
              @click.stop="readItem(item)"
            />
          </span>
        </template>
      </UTimeline>
      <UEmpty
        v-else
        icon="i-carbon-notification"
        title="暂无通知"
        description="当前工作区没有需要处理的事项"
      />
    </template>

    <template #footer>
      <div class="flex w-full items-center justify-between gap-2">
        <div class="flex items-center gap-2">
          <UButton
            label="全部标记已读"
            icon="i-carbon-checkmark"
            color="neutral"
            variant="ghost"
            size="sm"
            :disabled="unread.length === 0"
            data-testid="notification-read-all"
            @click="markAllRead"
          />
          <span class="text-xs text-dimmed">{{ unread.length }} 条未读</span>
        </div>
        <UButton
          label="关闭"
          color="neutral"
          variant="outline"
          size="sm"
          @click="open = false"
        />
      </div>
    </template>
  </USlideover>
</template>

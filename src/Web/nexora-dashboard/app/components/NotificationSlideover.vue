<script setup lang="ts">
import type { TimelineItem } from '@nuxt/ui'

const { t } = useI18n()
const { notificationSourceLabel } = useMockLabels()
const { open, items, unread, markAllRead, markRead } = useNotifications()

const timelineItems = computed<TimelineItem[]>(() => items.value.map(item => ({
  date: item.at,
  title: item.title,
  description: notificationSourceLabel(item.source) + ' · ' + item.description,
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
    :title="t('notifications.title')"
    :description="t('notifications.description')"
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
              <span v-if="isUnread(item)" class="size-1.5 shrink-0 rounded-full bg-primary" :aria-label="t('notifications.unread')" />
              <span class="truncate">{{ item.title }}</span>
            </span>
            <UButton
              v-if="isUnread(item)"
              icon="i-carbon-checkmark"
              color="neutral"
              variant="ghost"
              size="xs"
              :aria-label="t('notifications.readOne')"
              data-testid="notification-read-one"
              @click.stop="readItem(item)"
            />
          </span>
        </template>
      </UTimeline>
      <UEmpty
        v-else
        icon="i-carbon-notification"
        :title="t('notifications.emptyTitle')"
        :description="t('notifications.emptyDescription')"
      />
    </template>

    <template #footer>
      <div class="flex w-full items-center justify-between gap-2">
        <div class="flex items-center gap-2">
          <UButton
            :label="t('notifications.markAll')"
            icon="i-carbon-checkmark"
            color="neutral"
            variant="ghost"
            size="sm"
            :disabled="unread.length === 0"
            data-testid="notification-read-all"
            @click="markAllRead"
          />
          <span class="text-xs text-dimmed">{{ t('notifications.unreadCount', { count: unread.length }) }}</span>
        </div>
        <UButton
          :label="t('notifications.close')"
          color="neutral"
          variant="outline"
          size="sm"
          @click="open = false"
        />
      </div>
    </template>
  </USlideover>
</template>

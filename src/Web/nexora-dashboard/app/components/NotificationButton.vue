<script setup lang="ts">
const { open, unread } = useNotifications()
</script>

<template>
  <UChip
    :show="unread.length > 0"
    :text="unread.length > 9 ? '9+' : unread.length"
    color="primary"
    size="sm"
    position="top-right"
    :inset="false"
  >
    <UTooltip text="通知" :content="{ side: 'bottom' }">
      <UButton
        icon="i-carbon-notification"
        color="neutral"
        variant="ghost"
        size="sm"
        aria-label="查看通知"
        data-testid="notification-button"
        @click="open = true"
      />
    </UTooltip>
  </UChip>
</template>

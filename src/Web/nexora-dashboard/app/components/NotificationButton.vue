<script setup lang="ts">
const { open, unread } = useNotifications()
const { t } = useI18n()
const auth = useAuthSessionStore()
</script>

<template>
  <UChip
    v-if="!auth.connected || auth.user"
    :show="unread.length > 0"
    :text="unread.length > 9 ? '9+' : unread.length"
    color="primary"
    size="sm"
    position="top-right"
    :inset="false"
  >
    <UTooltip :text="t('shell.notifications')" :content="{ side: 'bottom' }">
      <UButton
        icon="i-carbon-notification"
        color="neutral"
        variant="ghost"
        size="sm"
        :aria-label="t('shell.viewNotifications')"
        data-testid="notification-button"
        @click="open = true"
      />
    </UTooltip>
  </UChip>
</template>

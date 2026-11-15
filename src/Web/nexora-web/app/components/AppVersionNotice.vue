<script setup lang="ts">
const { t } = useI18n()
const { version, updateAvailable, dismiss, reload } = useBuildVersion()
</script>

<template>
  <Teleport to="body">
    <div v-if="updateAvailable" class="version-notice" role="status" data-testid="version-notice">
      <UIcon name="i-lucide-git-commit-horizontal" aria-hidden="true" />
      <div class="version-text">
        <strong>{{ t('version.title') }}</strong>
        <span>{{ t('version.body', { version }) }}</span>
      </div>
      <div class="version-actions">
        <UButton size="xs" icon="i-lucide-rotate-cw" @click="reload">{{ t('version.reload') }}</UButton>
        <UButton size="xs" variant="ghost" color="neutral" @click="dismiss">{{ t('version.later') }}</UButton>
      </div>
    </div>
  </Teleport>
</template>

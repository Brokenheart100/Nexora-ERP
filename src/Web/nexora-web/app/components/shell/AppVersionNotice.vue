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

<style scoped>
.version-notice {
  position: fixed;
  right: 22px;
  bottom: 22px;
  z-index: 70;
  display: flex;
  gap: 12px;
  align-items: flex-start;
  width: min(440px, calc(100vw - 32px));
  padding: 14px 16px;
  background: var(--nx-surface);
  border: 1px solid #d8e2f3;
  border-radius: 14px;
  box-shadow: 0 18px 40px -22px rgba(15, 27, 45, 0.45);
  animation: nx-rise 0.22s ease-out;
}

.version-notice > .iconify {
  flex: 0 0 auto;
  margin-top: 2px;
  font-size: 18px;
  color: var(--nx-primary);
}

.version-text {
  display: grid;
  flex: 1;
  gap: 2px;
  min-width: 0;
}

.version-text strong {
  font-size: 13px;
  color: var(--nx-ink);
}

.version-text span {
  font-size: 12px;
  line-height: 1.55;
  color: var(--nx-ink-3);
}

.version-actions {
  display: flex;
  flex: 0 0 auto;
  gap: 6px;
  align-items: center;
}

@keyframes nx-rise {
  from {
    opacity: 0;
    transform: translateY(8px);
  }

  to {
    opacity: 1;
    transform: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .version-notice {
    animation: none;
  }
}
</style>

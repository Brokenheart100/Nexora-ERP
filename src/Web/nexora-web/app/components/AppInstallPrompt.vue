<script setup lang="ts">
import {
  INSTALL_AVAILABLE_EVENT,
  INSTALL_DISMISS_KEY,
  consumeInstallPrompt,
  isInstallDismissed,
  isStandalone,
  pendingInstallPrompt,
  shouldOfferInstall,
} from '~/utils/pwa'

const { t } = useI18n()
const visible = ref(false)

function standaloneMode() {
  const display = window.matchMedia('(display-mode: standalone)').matches
  const ios = (navigator as Navigator & { standalone?: boolean }).standalone === true
  return isStandalone(display, ios)
}

function refresh() {
  if (typeof window === 'undefined') return
  visible.value = shouldOfferInstall({
    supported: pendingInstallPrompt() !== null,
    standalone: standaloneMode(),
    dismissed: isInstallDismissed(localStorage.getItem(INSTALL_DISMISS_KEY), Date.now()),
  })
}

function dismiss() {
  localStorage.setItem(INSTALL_DISMISS_KEY, String(Date.now()))
  visible.value = false
}

async function install() {
  const prompt = consumeInstallPrompt()
  if (!prompt) {
    visible.value = false
    return
  }
  await prompt.prompt()
  const choice = await prompt.userChoice.catch(() => ({ outcome: 'dismissed' as const }))
  if (choice.outcome === 'accepted') visible.value = false
  else dismiss()
}

function removeListeners() {
  window.removeEventListener(INSTALL_AVAILABLE_EVENT, refresh)
  window.removeEventListener('appinstalled', dismiss)
}

onMounted(() => {
  refresh()
  window.addEventListener(INSTALL_AVAILABLE_EVENT, refresh)
  window.addEventListener('appinstalled', dismiss)
})
onBeforeUnmount(removeListeners)
</script>

<template>
  <aside v-if="visible" class="install-prompt" data-testid="install-prompt" role="dialog" aria-labelledby="nexora-install-title">
    <span class="install-icon" aria-hidden="true"><UIcon name="i-lucide-monitor-down" /></span>
    <div class="install-copy">
      <strong id="nexora-install-title">{{ t('pwa.installTitle') }}</strong>
      <p>{{ t('pwa.installBody') }}</p>
    </div>
    <div class="install-actions">
      <UButton size="sm" @click="install">{{ t('pwa.install') }}</UButton>
      <UButton size="sm" color="neutral" variant="ghost" @click="dismiss">{{ t('pwa.later') }}</UButton>
    </div>
  </aside>
</template>

<style scoped>
.install-prompt {
  position: fixed;
  bottom: calc(20px + env(safe-area-inset-bottom, 0px));
  left: calc(24px + env(safe-area-inset-left, 0px));
  z-index: 60;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 10px 12px;
  width: min(380px, calc(100vw - 32px));
  padding: 14px 16px;
  color: var(--nx-ink);
  background: var(--nx-surface);
  border: 1px solid var(--nx-border);
  border-radius: var(--nx-radius);
  box-shadow: var(--nx-shadow-md);
}

.install-icon {
  display: grid;
  width: 36px;
  height: 36px;
  place-items: center;
  font-size: 18px;
  color: var(--nx-primary);
  background: var(--nx-primary-soft);
  border-radius: 10px;
}

.install-copy strong {
  display: block;
  font-size: 13.5px;
}

.install-copy p {
  margin: 4px 0 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--nx-ink-3);
}

.install-actions {
  display: flex;
  grid-column: 2;
  gap: 8px;
  align-items: center;
  justify-content: flex-end;
}

@media (max-width: 550px) {
  .install-prompt {
    right: calc(16px + env(safe-area-inset-right, 0px));
    bottom: calc(12px + env(safe-area-inset-bottom, 0px));
    left: calc(16px + env(safe-area-inset-left, 0px));
    width: auto;
  }
}
</style>

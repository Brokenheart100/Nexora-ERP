<script setup lang="ts">
const { t } = useI18n()
const online = ref(true)
const recovered = ref(false)
let timer: ReturnType<typeof setTimeout> | undefined

function clearTimer() {
  if (timer) clearTimeout(timer)
  timer = undefined
}

function markOffline() {
  clearTimer()
  online.value = false
  recovered.value = false
}

function markOnline() {
  online.value = true
  recovered.value = true
  clearTimer()
  timer = setTimeout(() => {
    recovered.value = false
  }, 4000)
}

onMounted(() => {
  online.value = navigator.onLine
  window.addEventListener('offline', markOffline)
  window.addEventListener('online', markOnline)
})
onBeforeUnmount(() => {
  window.removeEventListener('offline', markOffline)
  window.removeEventListener('online', markOnline)
  clearTimer()
})
</script>

<template>
  <div
 v-if="!online || recovered" class="offline-notice" :data-state="online ? 'online' : 'offline'"
    role="status" aria-live="polite" data-testid="offline-notice">
    <UIcon :name="online ? 'i-lucide-wifi' : 'i-lucide-wifi-off'" aria-hidden="true" />
    <span>{{ online ? t('pwa.restored') : t('pwa.offline') }}</span>
  </div>
</template>

<style scoped>
.offline-notice {
  position: fixed;
  top: calc(12px + env(safe-area-inset-top, 0px));
  left: 50%;
  z-index: 85;
  display: inline-flex;
  gap: 8px;
  align-items: center;
  max-width: calc(100vw - 24px);
  padding: 9px 14px;
  font-size: 12.5px;
  color: #7a4c08;
  background: #fff7e8;
  border: 1px solid #f0d9ac;
  border-radius: 999px;
  box-shadow: var(--nx-shadow-sm);
  transform: translateX(-50%);
}

.offline-notice[data-state="online"] {
  color: var(--nx-success);
  background: var(--nx-success-soft);
  border-color: #bfe6d6;
}

.offline-notice svg {
  width: 15px;
  height: 15px;
}
</style>

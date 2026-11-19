<script setup lang="ts">
import { clearDraft, captureDraft, isDraftRestorable, readDraft, restoreDraft, saveDraft } from '~/utils/shell/formDrafts'
import { pageLoadId } from '~/utils/shell/pageLoad'
import { runtimeStateKey } from '#shared/utils/runtimeStatus'

const { t, locale } = useI18n()
const route = useRoute()
const { status, blocked, checkedAt, refresh } = useRuntimeStatus()
const retrying = ref(false)
const restoreAttempts = ref(0)
let capturedHere = false

const title = computed(() => t(runtimeStateKey(status.value.state, 'title')))
const body = computed(() => status.value.message || t(runtimeStateKey(status.value.state, 'body')))
const since = computed(() => formatTime(status.value.since))
const checked = computed(() => formatTime(checkedAt.value))

function formatTime(value: string | number): string {
  if (!value) return ''
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleString(locale.value === 'en' ? 'en-US' : 'zh-CN')
}

function storage(): Storage | null {
  try {
    return window.sessionStorage
  } catch {
    return null
  }
}

function captureCurrentForm(): void {
  const store = storage()
  if (!store) return
  const draft = captureDraft(document, route.path, pageLoadId)
  if (draft.fields.length === 0) return
  saveDraft(store, draft)
  capturedHere = true
}

function restoreSavedForm(): void {
  const store = storage()
  if (!store) return
  const draft = readDraft(store, route.path)
  if (!draft || !isDraftRestorable(draft, pageLoadId)) return
  if (restoreDraft(document, draft, pageLoadId) > 0) {
    clearDraft(store, route.path)
    return
  }
  if (restoreAttempts.value < 20) {
    restoreAttempts.value += 1
    window.setTimeout(restoreSavedForm, 150)
  }
}

function focusOverlay(): void {
  nextTick(() => {
    document.querySelector<HTMLElement>('[data-testid="status-overlay"] button')?.focus()
  })
}

async function retry(): Promise<void> {
  retrying.value = true
  try {
    await refresh()
  } finally {
    retrying.value = false
  }
}

onMounted(() => {
  restoreSavedForm()
})

watch(blocked, (value, previous) => {
  if (value) {
    captureCurrentForm()
    focusOverlay()
    return
  }
  if (!previous) return
  if (capturedHere) {
    const store = storage()
    if (store) clearDraft(store, route.path)
    capturedHere = false
    return
  }
  restoreAttempts.value = 0
  restoreSavedForm()
})

watch(blocked, (value) => {
  document.body.classList.toggle('nx-scroll-lock', value)
}, { immediate: true })

onBeforeUnmount(() => {
  document.body.classList.remove('nx-scroll-lock')
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="blocked"
      class="status-overlay"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="runtime-status-title"
      data-testid="status-overlay"
      :data-state="status.state"
    >
      <div class="status-card">
        <span class="status-orbit" aria-hidden="true"><span /></span>
        <p class="status-eyebrow">{{ t('runtime.title') }}</p>
        <h2 id="runtime-status-title">{{ title }}</h2>
        <p class="status-body">{{ body }}</p>
        <p v-if="since" class="status-since">{{ t('runtime.since', { time: since }) }}</p>
        <p class="status-hint">{{ t('runtime.draftHint') }}</p>
        <UButton icon="i-lucide-refresh-cw" :loading="retrying" @click="retry">{{ t('runtime.retry') }}</UButton>
        <p v-if="checked" class="status-checked">{{ t('runtime.checkedAt', { time: checked }) }}</p>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.status-overlay {
  position: fixed;
  inset: 0;
  z-index: 90;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgba(13, 24, 41, 0.6);
  backdrop-filter: blur(6px);
}

.status-card {
  display: grid;
  gap: 8px;
  justify-items: center;
  width: min(500px, 100%);
  padding: 30px 30px 24px;
  text-align: center;
  background: var(--nx-surface);
  border-radius: var(--nx-radius);
  box-shadow: 0 30px 70px -30px rgba(9, 18, 33, 0.6);
  animation: nx-rise 0.2s ease-out;
}

.status-orbit {
  position: relative;
  display: block;
  width: 46px;
  height: 46px;
  margin-bottom: 4px;
  border: 3px solid #dbe6f8;
  border-top-color: var(--nx-primary);
  border-radius: 50%;
  animation: nx-spin 1.1s linear infinite;
}

.status-overlay[data-state="updating"] .status-orbit {
  border-top-color: var(--nx-primary-strong);
}

.status-overlay[data-state="maintenance"] .status-orbit {
  border-top-color: var(--nx-warning);
  animation-duration: 2.6s;
}

.status-eyebrow {
  margin: 0;
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.14em;
  color: var(--nx-ink-4);
  text-transform: uppercase;
}

.status-card h2 {
  margin: 0;
  font-size: 20px;
  letter-spacing: -0.015em;
  color: var(--nx-ink);
}

.status-body {
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
  color: var(--nx-ink-2);
}

.status-since,
.status-checked {
  margin: 0;
  font-size: 11.5px;
  color: var(--nx-ink-4);
}

.status-hint {
  margin: 2px 0 8px;
  font-size: 11.5px;
  line-height: 1.55;
  color: var(--nx-ink-3);
}

:global(body.nx-scroll-lock) {
  overflow: hidden;
}

@keyframes nx-spin {
  to {
    transform: rotate(360deg);
  }
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
  .status-orbit {
    animation: none;
  }

  .status-card {
    animation: none;
  }
}
</style>

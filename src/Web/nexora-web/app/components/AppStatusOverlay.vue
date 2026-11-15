<script setup lang="ts">
import { clearDraft, captureDraft, isDraftRestorable, readDraft, restoreDraft, saveDraft } from '~/utils/formDrafts'
import { pageLoadId } from '~/utils/pageLoad'
import { runtimeStateKey } from '~/utils/runtimeStatus'

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

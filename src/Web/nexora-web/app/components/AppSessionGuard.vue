<script setup lang="ts">
import { sessionSourceSummary, type SessionPolicy } from '~/utils/sessionPolicy'

const store = useWorkspaceStore()
const notice = ref('')
let noticeTimer: ReturnType<typeof setTimeout> | undefined

const {
  warning, remainingText, sourceSummary, start, stop, refresh, recordActivity, continueSession,
} = useSessionPolicy({
  onExpired: () => { void store.logout() },
  onPolicyChanged: (next: SessionPolicy) => {
    notice.value = '自动登出策略已更新为 ' + next.idleTimeoutMinutes + ' 分钟，来源：' + sessionSourceSummary(next)
    if (noticeTimer) clearTimeout(noticeTimer)
    noticeTimer = setTimeout(() => { notice.value = '' }, 8000)
  },
})

function onActivity() {
  recordActivity()
}
function onVisibility() {
  if (document.visibilityState === 'visible') refresh()
}
function closeNotice() {
  notice.value = ''
  if (noticeTimer) clearTimeout(noticeTimer)
}

onMounted(() => {
  if (store.user) start()
  window.addEventListener('pointerdown', onActivity, { passive: true })
  window.addEventListener('keydown', onActivity)
  window.addEventListener('scroll', onActivity, { passive: true, capture: true })
  document.addEventListener('visibilitychange', onVisibility)
})
onBeforeUnmount(() => {
  stop()
  if (noticeTimer) clearTimeout(noticeTimer)
  window.removeEventListener('pointerdown', onActivity)
  window.removeEventListener('keydown', onActivity)
  window.removeEventListener('scroll', onActivity, { capture: true })
  document.removeEventListener('visibilitychange', onVisibility)
})
watch(() => store.user, user => { if (user) start(); else stop() })
watch(() => store.loggingOut, loggingOut => { if (loggingOut) stop() })
</script>

<template>
  <Transition name="session-fade">
    <aside v-if="warning" class="session-idle-warning" role="alert" data-testid="session-idle-warning">
      <UIcon class="session-idle-icon" name="i-lucide-hourglass" aria-hidden="true" />
      <div class="session-idle-copy">
        <strong>登录即将超时</strong>
        <p>因工作区闲置策略，{{ remainingText }} 后将自动退出。取最短值：{{ sourceSummary }}</p>
      </div>
      <button class="primary" type="button" @click="continueSession">继续使用</button>
    </aside>
  </Transition>
  <Transition name="session-fade">
    <aside v-if="notice" class="session-policy-notice" role="status">
      <span>{{ notice }}</span>
      <button class="quiet" type="button" @click="closeNotice">关闭</button>
    </aside>
  </Transition>
</template>

<style scoped>
.session-idle-warning,
.session-policy-notice {
  position: fixed;
  left: 50%;
  bottom: max(22px, env(safe-area-inset-bottom));
  transform: translateX(-50%);
  z-index: 80;
  display: flex;
  align-items: center;
  gap: 12px;
  width: min(680px, calc(100vw - 32px));
  padding: 14px 16px;
  border: 1px solid var(--nx-border-strong);
  border-radius: var(--nx-radius-sm);
  background: var(--nx-surface);
  box-shadow: var(--nx-shadow-md);
  color: var(--nx-ink);
}
.session-idle-warning {
  border-color: #e5c583;
  background: var(--nx-warning-soft);
}
.session-idle-icon {
  flex: none;
  width: 22px;
  height: 22px;
  color: var(--nx-warning);
}
.session-idle-copy {
  flex: 1;
  min-width: 0;
}
.session-idle-copy strong {
  display: block;
  margin-bottom: 2px;
  font-size: 14px;
}
.session-idle-copy p {
  margin: 0;
  color: var(--nx-ink-2);
  font-size: 13px;
}
.session-policy-notice {
  bottom: max(22px, env(safe-area-inset-bottom));
  z-index: 79;
  justify-content: space-between;
  font-size: 13px;
}
.session-idle-warning .primary {
  flex: none;
  white-space: nowrap;
}
.session-fade-enter-active,
.session-fade-leave-active {
  transition: opacity 0.18s ease, transform 0.18s ease;
}
.session-fade-enter-from,
.session-fade-leave-to {
  opacity: 0;
  transform: translate(-50%, 8px);
}
html.dark .session-idle-warning {
  border-color: #6b5422;
  background: #2b2418;
}
html.dark .session-idle-copy p {
  color: var(--nx-ink-3);
}
@media (max-width: 560px) {
  .session-idle-warning {
    align-items: flex-start;
    flex-wrap: wrap;
  }
  .session-idle-warning .primary {
    width: 100%;
  }
}
</style>

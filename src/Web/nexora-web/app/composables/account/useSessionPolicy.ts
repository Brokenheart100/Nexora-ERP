import { computed, ref, shallowRef } from 'vue'
import type { SessionActivity, SessionPolicy } from '~/utils/account/sessionPolicy'
import {
  formatIdleRemaining, idleDeadline, idleRemaining, idleWarningWindow, sessionIdleError,
  sessionPolicyKey, sessionUnauthorized,
} from '~/utils/account/sessionPolicy'

interface Options {
  onExpired: () => void
  onPolicyChanged?: (policy: SessionPolicy, previous: SessionPolicy) => void
}

const policyPollMs = 30_000
const heartbeatMs = 60_000

export function useSessionPolicy(options: Options) {
  const store = useWorkspaceStore()
  const policy = shallowRef<SessionPolicy>()
  const serverSeenAt = ref(0)
  const localSeenAt = ref(Date.now())
  const now = ref(Date.now())
  const error = ref('')
  const started = ref(false)

  let countdown: ReturnType<typeof setInterval> | undefined
  let poll: ReturnType<typeof setInterval> | undefined
  let lastHeartbeat = 0
  let csrfToken = ''
  let expired = false

  const lastSeenAt = computed(() => Math.max(serverSeenAt.value, localSeenAt.value))
  const deadline = computed(() => policy.value ? idleDeadline(lastSeenAt.value, policy.value.idleTimeoutMinutes) : 0)
  const remaining = computed(() => policy.value ? idleRemaining(deadline.value, now.value) : 0)
  const remainingText = computed(() => formatIdleRemaining(remaining.value))
  const warning = computed(() => Boolean(policy.value) && !store.loggingOut
    && remaining.value > 0 && remaining.value <= idleWarningWindow(policy.value!.idleTimeoutMinutes))
  const sourceSummary = computed(() => {
    if (!policy.value) return ''
    if (!policy.value.sources.length)
      return policy.value.unavailable ? '策略服务暂不可用，按默认 30 分钟执行' : '默认 30 分钟'
    return policy.value.sources
      .map(source => source.workspaceName + '（' + source.idleTimeoutMinutes + ' 分钟）')
      .join('、')
  })

  function stop() {
    started.value = false
    if (countdown) clearInterval(countdown)
    if (poll) clearInterval(poll)
    countdown = undefined
    poll = undefined
  }

  function expire() {
    if (expired) return
    expired = true
    stop()
    options.onExpired()
  }

  async function fetchPolicy(refresh: boolean) {
    if (!started.value) return
    try {
      const data = await $fetch<SessionPolicy>('/bff/session-policy' + (refresh ? '?refresh=1' : ''), { retry: 0 })
      if (!started.value) return
      const previous = policy.value
      const previousKey = previous ? sessionPolicyKey(previous) : ''
      policy.value = data
      serverSeenAt.value = Math.max(serverSeenAt.value, Number(data.lastSeenAt) || Date.now())
      localSeenAt.value = Math.max(localSeenAt.value, serverSeenAt.value)
      now.value = Date.now()
      error.value = ''
      if (previous && previousKey && sessionPolicyKey(data) !== previousKey)
        options.onPolicyChanged?.(data, previous)
    } catch (failure) {
      if (sessionIdleError(failure)) {
        expire()
        return
      }
      if (sessionUnauthorized(failure)) {
        // 预览/测试环境可能没有真实 BFF 会话；不要因为策略轮询失败而误退出。
        stop()
        return
      }
      error.value = '暂时无法读取自动登出策略。'
    }
  }

  async function csrf() {
    if (csrfToken) return csrfToken
    const data = await $fetch<{ requestToken: string }>('/bff/antiforgery', { retry: 0 })
    csrfToken = data.requestToken
    return csrfToken
  }

  async function sendActivity(retry = true) {
    try {
      const token = await csrf()
      const result = await $fetch<SessionActivity>('/bff/sessions/activity', {
        method: 'POST',
        headers: { 'X-CSRF-TOKEN': token },
        retry: 0,
      })
      serverSeenAt.value = Math.max(serverSeenAt.value, Number(result.lastSeenAt) || Date.now())
      localSeenAt.value = Math.max(localSeenAt.value, serverSeenAt.value)
      lastHeartbeat = Date.now()
      return true
    } catch (failure) {
      if (sessionIdleError(failure)) {
        expire()
        return false
      }
      if ((failure as { statusCode?: number })?.statusCode === 400 && retry) {
        csrfToken = ''
        return sendActivity(false)
      }
      return false
    }
  }

  function recordActivity() {
    if (!started.value || !store.user || store.loggingOut) return
    const time = Date.now()
    localSeenAt.value = Math.max(localSeenAt.value, time)
    if (time - lastHeartbeat >= heartbeatMs) {
      lastHeartbeat = time
      void sendActivity()
    }
  }

  async function continueSession() {
    if (!started.value) return
    localSeenAt.value = Math.max(localSeenAt.value, Date.now())
    await sendActivity()
  }

  function tick() {
    now.value = Date.now()
    if (policy.value && remaining.value <= 0) expire()
  }

  function start() {
    if (started.value || !store.user || store.loggingOut) return
    started.value = true
    expired = false
    serverSeenAt.value = 0
    localSeenAt.value = 0
    now.value = Date.now()
    void fetchPolicy(true)
    poll = setInterval(() => { void fetchPolicy(false) }, policyPollMs)
    countdown = setInterval(tick, 1000)
  }

  function refresh() {
    now.value = Date.now()
    if (started.value) void fetchPolicy(true)
  }

  return {
    policy,
    started,
    remaining,
    remainingText,
    warning,
    sourceSummary,
    error,
    start,
    stop,
    refresh,
    recordActivity,
    continueSession,
  }
}

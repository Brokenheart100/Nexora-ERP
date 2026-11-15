<script setup lang="ts">
import { sessionSourceSummary, type SessionPolicy } from '~/utils/sessionPolicy'
interface SessionView {
  id: string
  createdAt: number
  lastSeenAt: number
  userAgent: string
  expiresAt: number
  current: boolean
}
const sessions = shallowRef<SessionView[]>([])
const policy = shallowRef<SessionPolicy>()
const busy = ref(false)
const error = ref('')

function device(agent: string) {
  const browser = /Edg\//.test(agent) ? 'Edge' : /Firefox\//.test(agent) ? 'Firefox' : /Chrome\//.test(agent) ? 'Chrome' : /Safari\//.test(agent) ? 'Safari' : '浏览器'
  const system = /Windows/.test(agent) ? 'Windows' : /Android/.test(agent) ? 'Android' : /iPhone|iPad/.test(agent) ? 'iOS' : /Mac OS X/.test(agent) ? 'macOS' : /Linux/.test(agent) ? 'Linux' : '未知系统'
  return browser + ' · ' + system
}
function when(value: number) {
  return value ? new Date(value).toLocaleString('zh-CN') : '—'
}
async function load() {
  busy.value = true; error.value = ''
  try {
    const [data, loadedPolicy] = await Promise.all([
      $fetch<{ sessions: SessionView[] }>('/bff/sessions', { retry: 0 }),
      $fetch<SessionPolicy>('/bff/session-policy?refresh=1', { retry: 0 }).catch(() => undefined),
    ])
    sessions.value = Array.isArray(data.sessions) ? data.sessions : []
    policy.value = loadedPolicy
  } catch { error.value = '暂时无法读取设备会话。' }
  finally { busy.value = false }
}
async function csrfToken() {
  const data = await $fetch<{ requestToken: string }>('/bff/antiforgery', { retry: 0 })
  return data.requestToken
}
async function revoke(id: string) {
  busy.value = true; error.value = ''
  try {
    await $fetch('/bff/sessions/' + encodeURIComponent(id) + '/revoke', {
      method: 'POST', headers: { 'X-CSRF-TOKEN': await csrfToken() },
    })
    await load()
  } catch { error.value = '暂时无法撤销该设备会话。' }
  finally { busy.value = false }
}
async function revokeOthers() {
  busy.value = true; error.value = ''
  try {
    await $fetch('/bff/sessions/revoke-others', {
      method: 'POST', headers: { 'X-CSRF-TOKEN': await csrfToken() },
    })
    await load()
  } catch { error.value = '暂时无法撤销其他设备会话。' }
  finally { busy.value = false }
}
onMounted(load)
</script>

<template>
  <section class="card" aria-label="设备与会话">
    <h2><UIcon class="heading-icon" name="i-lucide-monitor-smartphone" aria-hidden="true" />设备与会话</h2>
    <p class="hint">这里列出使用当前账号登录的浏览器会话。撤销后该设备立即退出，需要重新验证身份。</p>
    <p v-if="policy" class="hint" data-testid="session-policy">
      自动登出：闲置 {{ policy.idleTimeoutMinutes }} 分钟后退出；策略来源：{{ sessionSourceSummary(policy) }}。
      <span v-if="policy.stale">（当前显示上次读取的策略）</span>
    </p>
    <p><a class="quiet" href="/bff/account" target="_blank" rel="noopener noreferrer">管理账号资料与登录凭据</a></p>
    <button class="quiet" type="button" :disabled="busy" @click="revokeOthers">撤销其他设备</button>
    <ul v-if="sessions.length">
      <li v-for="session in sessions" :key="session.id">
        <strong>{{ device(session.userAgent) }}</strong>
        <span v-if="session.current" class="status-pill" data-tone="ok">当前设备</span>
        <p class="hint">最近活动 {{ when(session.lastSeenAt) }} · 登录于 {{ when(session.createdAt) }}</p>
        <button v-if="!session.current" class="quiet" type="button" :disabled="busy" @click="revoke(session.id)">撤销</button>
      </li>
    </ul>
    <p v-else-if="!busy" class="hint">当前没有可显示的其他会话。</p>
    <UAlert v-if="error" role="alert" color="error" icon="i-lucide-circle-alert" :description="error" />
  </section>
</template>

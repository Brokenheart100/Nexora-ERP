<script setup lang="ts">
import type { SessionSummary } from '#shared/types/auth'
import { useAccountSecurityApi } from '~/composables/api/useAccountSecurityApi'
import { useBrowserSessionPolicy } from '~/composables/useBrowserSessionPolicy'
import { useAdministrationMutation } from '~/composables/settings/useAdministration'
import { ApiFailure } from '~/utils/api/client'

const auth = useAuthSessionStore()
const toast = useToast()
const api = useAccountSecurityApi()
const { snapshot, loading: checkingPolicy, problem: policyError, refresh } = useBrowserSessionPolicy()
const rows = shallowRef<SessionSummary[]>([])
const problem = ref('')
const loading = ref(false)
const target = shallowRef<SessionSummary | 'others' | null>(null)
const open = ref(false)
const mutation = useAdministrationMutation<{ revoked: boolean | number }>(() => auth.user?.subject ?? '')
const format = (time: number) => time > 0 ? new Date(time).toLocaleString() : '—'

async function readSessions() {
  if (loading.value || !auth.user) return
  const subject = auth.user.subject
  loading.value = true
  problem.value = ''
  try {
    const result = await api.sessions()
    if (subject === auth.user?.subject) rows.value = result.sessions
  } catch (failure) {
    if (subject !== auth.user?.subject) return
    problem.value = failure instanceof ApiFailure ? failure.message : '无法读取登录会话。'
    throw failure
  } finally {
    loading.value = false
  }
}

function reload() {
  void readSessions().catch(() => {})
}
onMounted(reload)

function ask(item: SessionSummary | 'others') {
  target.value = item
  open.value = true
}

async function revoke() {
  const item = target.value
  if (!item) return
  open.value = false
  await mutation.run(() => item === 'others' ? api.revokeOthers() : api.revoke(item.id), (response) => {
    toast.add({ title: typeof response.revoked === 'number' ? `已撤销 ${response.revoked} 个其他会话` : '会话已撤销', color: 'success' })
    reload()
  })
}

function label(item: SessionSummary) {
  const agent = item.userAgent
  const browser = /Edg\//.test(agent) ? 'Edge' : /Firefox\//.test(agent) ? 'Firefox' : /Chrome\//.test(agent) ? 'Chrome' : /Safari\//.test(agent) ? 'Safari' : '浏览器'
  const platform = /Windows/.test(agent) ? 'Windows' : /Android/.test(agent) ? 'Android' : /iPhone|iPad/.test(agent) ? 'iOS' : /Macintosh/.test(agent) ? 'macOS' : /Linux/.test(agent) ? 'Linux' : ''
  return [browser, platform].filter(Boolean).join(' · ')
}
</script>

<template>
  <div class="space-y-4" data-testid="live-security-sessions">
    <UCard>
      <template #header>
        <div class="flex flex-wrap items-center justify-between gap-2">
          <h3 class="font-medium">
            空闲会话策略
          </h3>
          <UButton
            label="读取最新策略"
            color="neutral"
            variant="outline"
            size="sm"
            :loading="checkingPolicy"
            @click="refresh(true)"
          />
        </div>
      </template>
      <UAlert
        v-if="policyError"
        :title="policyError"
        color="warning"
        variant="subtle"
      />
      <div v-if="snapshot" class="space-y-2 text-sm" data-testid="live-session-policy">
        <p class="font-medium">
          空闲 {{ snapshot.idleTimeoutMinutes }} 分钟后退出
        </p>
        <p class="text-muted">
          上次活动 {{ format(snapshot.lastSeenAt) }} · 空闲到期 {{ format(snapshot.lastSeenAt + snapshot.idleTimeoutMinutes * 60_000) }}
        </p>
        <p class="text-muted">
          {{ snapshot.stale ? '使用最近可用的策略' : '策略已核对' }} · {{ snapshot.workspaceCount }} 个工作区
        </p>
        <ul v-if="snapshot.sources.length" class="space-y-1">
          <li v-for="source in snapshot.sources" :key="source.workspaceId">
            {{ source.workspaceName }} · {{ source.idleTimeoutMinutes }} 分钟
          </li>
        </ul>
        <p v-if="snapshot.unavailable" class="text-warning">
          暂时无法确认工作区策略。
        </p>
      </div>
      <USkeleton v-else-if="checkingPolicy" class="h-12 w-full" />
    </UCard>

    <div class="flex flex-wrap items-center gap-2">
      <UButton
        label="刷新会话"
        color="neutral"
        variant="outline"
        size="sm"
        :loading="loading"
        @click="reload"
      />
      <UButton
        label="撤销其他所有设备"
        color="error"
        variant="outline"
        size="sm"
        :disabled="!rows.some(item => !item.current) || mutation.busy || mutation.unknown"
        data-testid="live-revoke-others"
        @click="ask('others')"
      />
    </div>
    <UAlert
      v-if="problem"
      :title="problem"
      color="error"
      variant="subtle"
    />
    <SettingsAdministrationStatus :state="mutation" @refresh="mutation.readCurrent(readSessions)" @acknowledge="mutation.acknowledge" />
    <UEmpty v-if="!rows.length && !loading && !problem" title="没有可显示的会话" icon="i-carbon-screen" />
    <UCard v-for="item in rows" :key="item.id" :data-testid="'live-session-' + item.id">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div class="space-y-1">
          <p class="text-sm font-medium">
            {{ label(item) }} <UBadge
              v-if="item.current"
              label="当前会话"
              variant="subtle"
              size="sm"
            />
          </p>
          <p class="text-xs text-muted">
            登录 {{ format(item.createdAt) }} · 最近活动 {{ format(item.lastSeenAt) }} · 会话上限 {{ format(item.expiresAt) }}
          </p>
        </div>
        <UButton
          v-if="!item.current"
          label="撤销"
          color="error"
          variant="ghost"
          size="sm"
          :disabled="mutation.busy || mutation.unknown"
          @click="ask(item)"
        />
      </div>
    </UCard>
    <UModal v-model:open="open" :title="target === 'others' ? '撤销其他所有设备' : '撤销所选会话'" description="被撤销的设备下次访问时需要重新登录。">
      <template #footer>
        <UButton
          label="返回"
          color="neutral"
          variant="outline"
          @click="open = false"
        />
        <UButton
          label="确认撤销"
          color="error"
          data-testid="live-confirm-session-revoke"
          @click="revoke"
        />
      </template>
    </UModal>
  </div>
</template>

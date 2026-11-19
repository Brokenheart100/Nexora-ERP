<script setup lang="ts">
import type { DemoSession } from '~/mocks'
import { useSessionStore } from '~/stores/session'

const session = useSessionStore()
const toast = useToast()

const expiryHeadline = computed(() => {
  const current = session.currentSession
  if (!current) return ''
  return current.status === 'expiring'
    ? '当前会话将在 ' + current.expiresInMinutes + ' 分钟后空闲过期'
    : '当前会话仍有 ' + current.expiresInMinutes + ' 分钟空闲有效期'
})

const sessionStatusLabels: Record<DemoSession['status'], string> = {
  active: '有效',
  expiring: '即将过期',
  revoked: '已撤销'
}

const sessionStatusColors: Record<DemoSession['status'], 'success' | 'warning' | 'neutral'> = {
  active: 'success',
  expiring: 'warning',
  revoked: 'neutral'
}

function revoke(item: DemoSession) {
  if (session.revokeSession(item.id)) {
    toast.add({ title: '设备已撤销', description: item.device + ' 的下一次请求会被拒绝。', color: 'success', icon: 'i-carbon-checkmark' })
  }
}

function endOtherSessions() {
  const count = session.endOtherSessions()
  toast.add({
    title: count > 0 ? '已撤销 ' + count + ' 个其他设备' : '没有可撤销的其他设备',
    description: count > 0 ? '当前会话保留，其他设备需要重新登录。' : '仅当前会话仍处于有效状态。',
    color: count > 0 ? 'success' : 'neutral',
    icon: 'i-carbon-checkmark'
  })
}

function extendCurrentSession() {
  session.extendCurrentSession()
  toast.add({ title: '会话已延长', description: '当前会话空闲有效期已延长 30 分钟。', color: 'success', icon: 'i-carbon-time' })
}
</script>

<template>
  <div class="space-y-4">
    <UAlert
      v-if="session.currentSession"
      :color="session.currentSession.status === 'expiring' ? 'warning' : 'neutral'"
      variant="subtle"
      icon="i-carbon-time"
      :title="expiryHeadline"
      :description="'到期时间 ' + session.currentSession.expiresAt + '；可在操作后延长，不需要重新登录。'"
      data-testid="security-expiry"
    >
      <template #actions>
        <UButton
          size="xs"
          color="warning"
          variant="subtle"
          label="延长会话"
          data-testid="security-extend"
          @click="extendCurrentSession"
        />
      </template>
    </UAlert>

    <div class="flex flex-wrap items-center justify-between gap-2">
      <div>
        <h3 class="text-sm font-semibold text-highlighted">
          登录设备
        </h3>
        <p class="text-xs text-muted">
          共 {{ session.sessions.length }} 条记录，{{ session.activeSessions.length }} 台有效；撤销后设备需重新登录。
        </p>
      </div>
      <UButton
        size="sm"
        color="error"
        variant="subtle"
        icon="i-carbon-close-outline"
        :disabled="session.otherActiveSessions.length === 0"
        label="撤销其他所有设备"
        data-testid="security-end-others"
        @click="endOtherSessions"
      />
    </div>

    <div class="space-y-2">
      <div
        v-for="item in session.sessions"
        :key="item.id"
        class="rounded-sm border border-default p-3"
        :data-testid="'security-session-' + item.id"
      >
        <div class="flex flex-wrap items-start gap-3">
          <div class="rounded-sm bg-elevated p-2">
            <UIcon :name="item.device.includes('iPhone') ? 'i-carbon-phone' : 'i-carbon-screen'" class="size-4 text-muted" />
          </div>
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-2">
              <p class="text-sm font-medium text-highlighted">
                {{ item.device }}
              </p>
              <UBadge
                v-if="item.current"
                label="当前会话"
                color="primary"
                variant="subtle"
                size="sm"
                data-testid="security-session-current"
              />
              <UBadge
                :label="sessionStatusLabels[item.status]"
                :color="sessionStatusColors[item.status]"
                variant="subtle"
                size="sm"
              />
            </div>
            <p class="mt-1 text-xs text-muted">
              {{ item.browser }} · {{ item.location }}
            </p>
            <p class="mt-1 text-xs text-dimmed">
              登录 {{ item.loginAt }} · 最近活动 {{ item.lastActiveAt }} · 到期 {{ item.expiresAt }}
            </p>
          </div>
          <UButton
            v-if="!item.current && item.status !== 'revoked'"
            size="xs"
            color="error"
            variant="subtle"
            label="撤销"
            :data-testid="'security-session-revoke-' + item.id"
            @click="revoke(item)"
          />
          <UBadge
            v-else-if="item.status === 'revoked'"
            label="已撤销"
            color="neutral"
            variant="subtle"
            size="sm"
          />
        </div>
      </div>
    </div>
  </div>
</template>

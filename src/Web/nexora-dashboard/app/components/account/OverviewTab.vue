<script setup lang="ts">
import type { SecurityProfile } from '~/mocks'
import { useSessionStore } from '~/stores/session'

const props = defineProps<{ profile: SecurityProfile }>()

const session = useSessionStore()
const stepUpMessage = ref('')

const blockedChecks = computed(() => props.profile.deletionChecks.filter(check => check.state === 'blocked'))

const channelStatusLabels = {
  enabled: '已启用',
  pending: '待验证',
  unavailable: '不可用'
} as const

const channelStatusColors = {
  enabled: 'success',
  pending: 'warning',
  unavailable: 'neutral'
} as const

function verifyStepUp() {
  if (session.verifyStepUp()) {
    stepUpMessage.value = '附加验证已通过，10 分钟内可执行付款账户变更与全量导出。'
    useToast().add({ title: '附加验证通过', description: stepUpMessage.value, color: 'success', icon: 'i-carbon-fingerprint-recognition' })
  } else {
    stepUpMessage.value = '当前账户未启用 MFA，无法完成附加验证。'
  }
}
</script>

<template>
  <div class="grid gap-4 lg:grid-cols-2">
    <section class="rounded-sm border border-default p-4" data-testid="security-channels">
      <div class="mb-3 flex items-center justify-between">
        <h3 class="text-sm font-semibold text-highlighted">
          登录渠道
        </h3>
        <span class="text-xs text-dimmed">随身份切换</span>
      </div>
      <div class="space-y-3">
        <div
          v-for="channel in profile.channels"
          :key="channel.id"
          class="flex items-start gap-3"
          :data-testid="'security-channel-' + channel.id"
        >
          <UIcon :name="channel.icon" class="mt-0.5 size-4 text-muted" />
          <div class="min-w-0 flex-1">
            <p class="text-sm text-highlighted">
              {{ channel.label }}
            </p>
            <p class="text-xs text-muted">
              {{ channel.detail }}
            </p>
          </div>
          <UBadge
            :label="channelStatusLabels[channel.state]"
            :color="channelStatusColors[channel.state]"
            variant="subtle"
            size="sm"
          />
        </div>
      </div>
    </section>

    <section class="rounded-sm border border-default p-4" data-testid="security-policy">
      <div class="mb-3 flex items-center justify-between">
        <h3 class="text-sm font-semibold text-highlighted">
          会话与空闲策略
        </h3>
        <UBadge
          label="企业策略"
          color="neutral"
          variant="subtle"
          size="sm"
          data-testid="security-policy-source"
        />
      </div>
      <dl class="space-y-3 text-sm">
        <div class="flex items-start justify-between gap-3">
          <dt class="text-muted">
            空闲超时
          </dt>
          <dd class="text-right text-toned" data-testid="security-policy-idle">
            30 分钟 · 超时后要求重新验证
          </dd>
        </div>
        <div class="flex items-start justify-between gap-3">
          <dt class="text-muted">
            绝对有效期
          </dt>
          <dd class="text-right text-toned">
            7 天
          </dd>
        </div>
        <div class="flex items-start justify-between gap-3">
          <dt class="text-muted">
            敏感操作
          </dt>
          <dd class="text-right text-toned">
            付款账户变更、全量导出需附加验证
          </dd>
        </div>
        <div class="flex items-start justify-between gap-3">
          <dt class="text-muted">
            设备上限
          </dt>
          <dd class="text-right text-toned">
            5 台 · 当前 {{ session.activeSessions.length }} 台有效
          </dd>
        </div>
      </dl>
      <p class="mt-3 border-t border-default pt-3 text-xs text-dimmed">
        来源：华东总部安全策略 · 安全管理员陈立 · 2026-10-28 生效
      </p>
    </section>

    <section class="rounded-sm border border-default p-4" data-testid="security-mfa-card">
      <div class="mb-3 flex items-center justify-between">
        <h3 class="text-sm font-semibold text-highlighted">
          多因素认证
        </h3>
        <UBadge
          :color="profile.stepUpVerified ? 'success' : 'warning'"
          :label="profile.stepUpVerified ? '附加验证有效' : '需附加验证'"
          variant="subtle"
          size="sm"
        />
      </div>
      <div class="flex flex-wrap gap-2">
        <UBadge
          v-for="method in profile.mfaMethods"
          :key="method"
          :label="method"
          color="neutral"
          variant="subtle"
          size="sm"
        />
      </div>
      <p class="mt-3 text-xs text-muted" data-testid="security-stepup-detail">
        {{ profile.stepUpDetail }}
      </p>
      <UButton
        class="mt-3"
        size="xs"
        color="neutral"
        variant="subtle"
        icon="i-carbon-fingerprint-recognition"
        label="执行附加验证"
        data-testid="security-stepup"
        @click="verifyStepUp"
      />
      <p v-if="stepUpMessage" class="mt-2 text-xs text-success" data-testid="security-stepup-message">
        {{ stepUpMessage }}
      </p>
    </section>

    <section class="rounded-sm border border-default p-4" data-testid="security-deletion">
      <div class="mb-3 flex items-center justify-between">
        <h3 class="text-sm font-semibold text-highlighted">
          账户管理与注销预检
        </h3>
        <UBadge
          :label="blockedChecks.length + ' 项阻断'"
          color="error"
          variant="subtle"
          size="sm"
          data-testid="security-deletion-summary"
        />
      </div>
      <div class="space-y-2">
        <div
          v-for="check in profile.deletionChecks"
          :key="check.id"
          class="rounded-sm bg-elevated/60 p-2.5"
          :data-testid="'security-deletion-' + check.id"
        >
          <div class="flex items-center gap-2">
            <UIcon :name="check.state === 'blocked' ? 'i-carbon-close-filled' : 'i-carbon-checkmark-filled'" :class="check.state === 'blocked' ? 'text-error' : 'text-success'" class="size-3.5" />
            <span class="text-xs font-medium text-highlighted">{{ check.label }}</span>
            <span class="text-xs text-dimmed">{{ check.state === 'blocked' ? '阻断' : '通过' }}</span>
          </div>
          <p class="mt-1 pl-5 text-xs text-muted">
            {{ check.detail }}
          </p>
        </div>
      </div>
      <div class="mt-3 flex items-center justify-between gap-2">
        <p class="text-xs text-dimmed">
          阻断项清零后可提交注销；本演示不会删除数据。
        </p>
        <UButton
          size="xs"
          color="error"
          variant="subtle"
          label="申请注销"
          disabled
          data-testid="security-deletion-start"
        />
      </div>
    </section>
  </div>
</template>

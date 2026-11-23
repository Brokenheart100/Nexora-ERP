<script setup lang="ts">
import { useSessionStore } from '~/stores/session'
import { useUiStore } from '~/stores/ui'

const ui = useUiStore()
const auth = useAuthSessionStore()
const session = useSessionStore()
const toast = useToast()
const { t } = useI18n()

const tab = ref('overview')

const open = computed({
  get: () => ui.accountSecurityOpen,
  set: (value: boolean) => {
    ui.accountSecurityOpen = value
  }
})

const tabs = [
  { label: '账户概览', value: 'overview', icon: 'i-carbon-user-profile' },
  { label: '登录会话', value: 'sessions', icon: 'i-carbon-screen' },
  { label: '设备授权', value: 'devices', icon: 'i-carbon-terminal' }
]

const profile = computed(() => session.profile)

function switchIdentity(key: string) {
  session.switchIdentity(String(key))
  toast.add({
    title: '已切换演示身份',
    description: session.user.name + ' · ' + (session.user.roleLabel ?? session.user.title) + '；会话、安全能力与注销预检已同步。',
    color: 'success',
    icon: 'i-carbon-user-switch'
  })
}
</script>

<template>
  <USlideover
    v-model:open="open"
    :title="t('shell.security.title')"
    :description="auth.connected ? '管理身份验证、浏览器会话与设备授权。' : t('shell.security.description')"
    :ui="{ content: 'sm:max-w-4xl' }"
    data-testid="security-slideover"
  >
    <template #body>
      <template v-if="auth.connected">
        <AccountLiveSecurity v-if="auth.user" :key="auth.user.subject" />
        <UAlert
          v-else
          :title="auth.error ? t(auth.error) : t('auth.guest')"
          color="warning"
          variant="subtle"
        />
      </template>
      <div v-else class="space-y-4">
        <section class="rounded-sm border border-default p-4">
          <div class="flex flex-wrap items-start gap-4">
            <UAvatar :alt="session.user.name" :icon="session.user.avatarIcon" size="lg" />
            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-center gap-2">
                <p class="font-medium text-highlighted" data-testid="security-profile-name">
                  {{ session.user.name }} · {{ session.user.title }}
                </p>
                <UBadge
                  :label="session.user.roleLabel ?? profile.roleLabel"
                  color="primary"
                  variant="subtle"
                  size="sm"
                  data-testid="security-profile-role"
                />
              </div>
              <p class="truncate text-xs text-muted">
                {{ session.user.email }}
              </p>
              <p class="mt-1 text-xs text-dimmed">
                登录渠道：{{ profile.channels.filter(channel => channel.state === 'enabled').length }} 个已启用 · 上次登录 {{ session.user.lastLoginAt }}
              </p>
            </div>
            <div class="w-64">
              <label class="mb-1 block text-xs text-muted">切换模拟身份</label>
              <USelect
                :model-value="session.profileKey"
                :items="session.identityOptions"
                size="sm"
                data-testid="security-identity-select"
                @update:model-value="switchIdentity"
              />
            </div>
          </div>
        </section>

        <div class="flex items-center justify-between gap-3">
          <UTabs
            v-model="tab"
            :items="tabs"
            :content="false"
            size="sm"
            data-testid="security-tabs"
          />
          <UBadge
            :color="session.user.mfaEnabled ? 'success' : 'warning'"
            :label="session.user.mfaEnabled ? 'MFA 已启用' : 'MFA 未启用'"
            variant="subtle"
            size="sm"
            data-testid="security-mfa"
          />
        </div>

        <AccountOverviewTab
          v-if="tab === 'overview'"
          :key="session.profileKey"
          :profile="profile"
        />
        <AccountSessionsTab v-else-if="tab === 'sessions'" :key="session.profileKey" />
        <AccountDevicesTab v-else :key="session.profileKey" />
      </div>
    </template>

    <template #footer>
      <div class="flex w-full justify-end">
        <UButton
          color="neutral"
          variant="subtle"
          label="关闭"
          data-testid="security-close"
          @click="open = false"
        />
      </div>
    </template>
  </USlideover>
</template>

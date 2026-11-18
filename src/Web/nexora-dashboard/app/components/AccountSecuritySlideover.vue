<script setup lang="ts">
import type { DemoSession } from '~/mocks'
import { useSessionStore } from '~/stores/session'
import { useUiStore } from '~/stores/ui'

const ui = useUiStore()
const session = useSessionStore()
const toast = useToast()

const open = computed({
  get: () => ui.accountSecurityOpen,
  set: (value: boolean) => {
    ui.accountSecurityOpen = value
  }
})

const otherSessions = computed(() => session.sessions.filter(item => !item.current))

function sessionIcon(item: DemoSession) {
  return item.current ? 'i-carbon-screen' : 'i-carbon-screen'
}

function endOtherSessions() {
  session.endOtherSessions()
  toast.add({
    title: '已结束其他会话（演示）',
    description: '本地原型只移除模拟会话，不影响真实登录。',
    color: 'success',
    icon: 'i-carbon-checkmark'
  })
}

const securityActions = [
  { title: '修改密码', description: '更新账户密码与登录提醒', icon: 'i-carbon-locked' },
  { title: '重新绑定 MFA', description: '更换身份验证器或恢复码', icon: 'i-carbon-settings' },
  { title: '查看登录历史', description: '最近 30 天的登录与设备记录', icon: 'i-carbon-information' }
]

function demoAction(label: string) {
  toast.add({
    title: label + '（演示）',
    description: '纯 UI 阶段不提供账户操作，这里只展示入口。',
    color: 'neutral',
    icon: 'i-carbon-information'
  })
}
</script>

<template>
  <USlideover
    v-model:open="open"
    title="账户与安全"
    description="账户、MFA 与登录会话均为本地模拟数据，只读演示"
    :ui="{ content: 'sm:max-w-lg' }"
    data-testid="security-slideover"
  >
    <template #body>
      <div class="space-y-4">
        <div class="flex items-center gap-3 rounded-sm border border-default p-4">
          <UAvatar :alt="session.user.name" :icon="session.user.avatarIcon" size="lg" />
          <div class="min-w-0 flex-1">
            <p class="font-medium text-highlighted">
              {{ session.user.name }} · {{ session.user.title }}
            </p>
            <p class="truncate text-xs text-muted">
              {{ session.user.email }}
            </p>
            <p class="mt-1 text-xs text-dimmed">
              上次登录 {{ session.user.lastLoginAt }}
            </p>
          </div>
          <UBadge
            :color="session.user.mfaEnabled ? 'success' : 'warning'"
            :label="session.user.mfaEnabled ? 'MFA 已启用' : 'MFA 未启用'"
            variant="subtle"
            size="sm"
            data-testid="security-mfa"
          />
        </div>

        <UCard :ui="{ body: 'p-0 sm:p-0' }">
          <template #header>
            <div class="flex items-center justify-between gap-2">
              <div>
                <h3 class="font-medium text-highlighted">
                  登录会话
                </h3>
                <p class="text-xs text-muted">
                  共 {{ session.sessions.length }} 个，当前设备标记为当前会话
                </p>
              </div>
              <UIcon name="i-carbon-locked" class="size-4 text-muted" />
            </div>
          </template>

          <ul class="divide-y divide-default">
            <li
              v-for="item in session.sessions"
              :key="item.id"
              class="flex items-start gap-3 px-4 py-3"
              data-testid="security-session"
            >
              <UIcon :name="sessionIcon(item)" class="mt-0.5 size-4 shrink-0 text-muted" />
              <div class="min-w-0 flex-1">
                <p class="flex flex-wrap items-center gap-2 text-sm font-medium text-highlighted">
                  {{ item.device }}
                  <UBadge
                    v-if="item.current"
                    label="当前会话"
                    color="primary"
                    variant="subtle"
                    size="sm"
                  />
                </p>
                <p class="text-xs text-muted">
                  {{ item.browser }} · {{ item.location }}
                </p>
                <p class="text-xs text-dimmed">
                  {{ item.lastActiveAt }}
                </p>
              </div>
            </li>
          </ul>
        </UCard>

        <UCard>
          <template #header>
            <h3 class="font-medium text-highlighted">
              安全设置
            </h3>
          </template>
          <div class="space-y-2">
            <div
              v-for="action in securityActions"
              :key="action.title"
              class="flex items-start justify-between gap-3 rounded-sm border border-default px-3 py-2.5"
            >
              <div class="flex min-w-0 items-start gap-2">
                <UIcon :name="action.icon" class="mt-0.5 size-4 shrink-0 text-muted" />
                <div class="min-w-0">
                  <p class="text-sm text-highlighted">
                    {{ action.title }}
                  </p>
                  <p class="text-xs text-muted">
                    {{ action.description }}
                  </p>
                </div>
              </div>
              <UButton
                label="打开"
                color="neutral"
                variant="ghost"
                size="xs"
                @click="demoAction(action.title)"
              />
            </div>
          </div>
        </UCard>
      </div>
    </template>

    <template #footer>
      <div class="flex w-full items-center justify-between gap-2">
        <UButton
          label="结束其他会话"
          icon="i-carbon-close"
          color="neutral"
          variant="ghost"
          size="sm"
          :disabled="otherSessions.length === 0"
          data-testid="security-end-others"
          @click="endOtherSessions"
        />
        <UButton
          label="关闭"
          color="neutral"
          variant="outline"
          size="sm"
          @click="open = false"
        />
      </div>
    </template>
  </USlideover>
</template>

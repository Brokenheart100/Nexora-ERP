<script setup lang="ts">
import { useAssistantStore } from '~/stores/assistant'
import { useSessionStore } from '~/stores/session'
import { useWorkspaceStore } from '~/stores/workspace'

const assistant = useAssistantStore()
const session = useSessionStore()
const workspaceStore = useWorkspaceStore()
const { workspace } = useMockWorkspace()

const planAvailable = computed(() => workspace.value.plan === '专业版')
const roleRestricted = computed(() => !session.can('finance.view'))

const workspaceItems = computed(() => workspaceStore.workspaces.map(item => ({
  label: item.name + ' · ' + item.plan,
  value: item.id
})))

const workspaceOption = computed({
  get: () => workspace.value.id,
  set: (value: string) => workspaceStore.setWorkspace(value)
})

function switchWorkspace(value: string) {
  workspaceStore.setWorkspace(String(value))
}

onBeforeUnmount(() => {
  if (assistant.isStreaming) assistant.cancel()
})
</script>

<template>
  <div class="contents">
    <UDashboardPanel id="assistant">
      <template #header>
        <UDashboardNavbar title="工作区助手">
          <template #leading>
            <UDashboardSidebarCollapse />
          </template>
          <template #right>
            <UBadge
              label="本地模拟 · 不连接模型"
              color="neutral"
              variant="subtle"
              size="sm"
            />
            <NotificationButton />
          </template>
        </UDashboardNavbar>

        <UDashboardToolbar :ui="{ root: 'flex-wrap gap-3 py-2.5' }">
          <template #left>
            <USelect
              :model-value="workspaceOption"
              :items="workspaceItems"
              size="sm"
              class="w-72"
              data-testid="assistant-workspace"
              @update:model-value="switchWorkspace"
            />
            <UBadge
              :label="planAvailable ? '助手可用 · ' + workspace.plan : '套餐未包含 · ' + workspace.plan"
              :color="planAvailable ? 'success' : 'neutral'"
              variant="subtle"
              size="sm"
              data-testid="assistant-plan-state"
            />
          </template>
          <template #right>
            <p class="text-xs text-muted">
              会话、流式输出与工具审批均为本地演示
            </p>
          </template>
        </UDashboardToolbar>
      </template>

      <template #body>
        <AppBreadcrumb current="工作区助手" class="mb-3" />

        <div v-if="!planAvailable" class="rounded-sm border border-default bg-elevated/40 p-6" data-testid="assistant-plan-restricted">
          <div class="flex items-start gap-4">
            <div class="rounded-sm bg-neutral-500/10 p-3">
              <UIcon name="i-carbon-locked" class="size-6 text-muted" />
            </div>
            <div class="min-w-0 flex-1">
              <h2 class="text-base font-semibold text-highlighted">
                当前工作区未包含工作区助手
              </h2>
              <p class="mt-1 text-sm text-muted">
                {{ workspace.name }} 使用 {{ workspace.plan }}，仅专业版提供助手会话与只读财务工具。升级套餐后可在此查看会话历史与能力状态。
              </p>
              <div class="mt-4 flex flex-wrap gap-2">
                <UButton
                  to="/settings?tab=billing"
                  size="sm"
                  color="primary"
                  label="查看套餐与升级"
                  data-testid="assistant-upgrade"
                />
                <UButton
                  size="sm"
                  color="neutral"
                  variant="subtle"
                  label="切换到华东总部"
                  data-testid="assistant-switch-hq"
                  @click="switchWorkspace('ws-hq')"
                />
              </div>
            </div>
          </div>
        </div>

        <template v-else>
          <UAlert
            v-if="roleRestricted"
            class="mb-3"
            color="warning"
            variant="subtle"
            icon="i-carbon-user-role"
            title="当前角色仅可读取目录与伙伴"
            :description="'身份 ' + session.user.name + '（' + (session.user.roleLabel ?? session.user.title) + '）没有 finance.view 权限，财务工具与财务问题不可用。切换为财务或管理员身份后重试。'"
            data-testid="assistant-role-restricted"
          />

          <div class="grid min-h-[620px] gap-3 xl:grid-cols-[260px_minmax(0,1fr)_300px]">
            <AssistantSessionList />
            <AssistantConversationPanel :key="workspace.id" :role-restricted="roleRestricted" />
            <AssistantCapabilityPanel :plan-available="planAvailable" :role-restricted="roleRestricted" />
          </div>
        </template>
      </template>
    </UDashboardPanel>
  </div>
</template>

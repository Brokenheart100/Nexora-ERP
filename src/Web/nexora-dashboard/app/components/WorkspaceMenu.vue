<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import { useAuthSessionStore } from '~/stores/authSession'
import { useLiveSessionStore } from '~/stores/liveSession'

defineProps<{
  collapsed?: boolean
}>()

const { t } = useI18n()
const prototype = useMockWorkspace()
const { workspaces, activeWorkspaceId } = prototype
const auth = useAuthSessionStore()
const session = useLiveSessionStore()
const route = useRoute()
const router = useRouter()
const workspace = computed(() => auth.connected
  ? { name: session.workspace?.name
    ?? (!auth.user ? '请先登录' : session.loading ? '正在读取工作区' : session.error || session.denied ? '工作区不可用' : '尚无工作区') }
  : prototype.workspace.value)

const governanceOpen = ref(false)
const governanceIntent = ref('overview')
const governanceSession = ref(0)
let governanceSessionSeq = 0

function openGovernance(intent: string) {
  governanceIntent.value = intent
  governanceSessionSeq += 1
  governanceSession.value = governanceSessionSeq
  governanceOpen.value = true
}

const items = computed<DropdownMenuItem[][]>(() => {
  if (auth.connected) return [
    session.workspaces.map(item => ({ label: item.name, icon: 'i-carbon-enterprise', type: 'checkbox' as const,
      checked: session.activeWorkspaceId === item.id, async onSelect() {
        await session.selectWorkspace(item.id)
        if (session.activeWorkspaceId === item.id) await router.replace({ query: { ...route.query, workspace: item.id } })
      } })),
    [{ label: '刷新工作区与权限', icon: 'i-carbon-renew', disabled: !auth.user || session.loading,
      onSelect: () => session.load(session.activeWorkspaceId || undefined) }],
    [
      { label: '新建企业工作区', icon: 'i-carbon-add-alt', disabled: !auth.user, onSelect: () => openGovernance('create-company') },
      ...(!session.workspaces.some(item => item.isPersonal) ? [{ label: '新建个人工作区', icon: 'i-carbon-user-multiple', disabled: !auth.user || session.loading, onSelect: () => openGovernance('create-personal') }] : []),
      ...(session.canVisit('/settings') ? [{ label: '工作区设置', icon: 'i-carbon-settings', to: { path: '/settings', query: { workspace: session.activeWorkspaceId } } }] : [])
    ]
  ]
  return [
    workspaces.map(item => ({
      label: item.name,
      icon: 'i-carbon-enterprise',
      type: 'checkbox' as const,
      checked: item.id === activeWorkspaceId.value,
      onSelect() {
        activeWorkspaceId.value = item.id
      }
    })),
    [{
      label: t('shell.currentWorkspace', { plan: prototype.workspace.value.plan }),
      icon: 'i-carbon-checkmark-filled',
      disabled: true
    }],
    [
      {
        label: '工作区操作',
        type: 'label'
      },
      {
        label: '工作区与权限治理',
        icon: 'i-carbon-flow',
        onSelect() {
          openGovernance('overview')
        }
      },
      {
        label: '新建企业工作区',
        icon: 'i-carbon-add-alt',
        onSelect() {
          openGovernance('create-company')
        }
      },
      {
        label: '新建个人工作区',
        icon: 'i-carbon-user-multiple',
        onSelect() {
          openGovernance('create-personal')
        }
      },
      {
        label: '个人账本链接',
        icon: 'i-carbon-link',
        onSelect() {
          openGovernance('link-ledger')
        }
      }
    ]
  ]
})
</script>

<template>
  <div class="w-full">
    <UDropdownMenu
      :items="items"
      :content="{ align: 'start', collisionPadding: 12 }"
      :ui="{ content: collapsed ? 'w-64' : 'w-72' }"
    >
      <UButton
        color="neutral"
        variant="ghost"
        block
        :square="collapsed"
        class="justify-start px-2 data-[state=open]:bg-elevated"
        :ui="{ base: 'min-w-0' }"
        :aria-label="workspace.name"
        :title="workspace.name"
        data-testid="workspace-menu-trigger"
      >
        <template #leading>
          <span class="flex size-7 shrink-0 items-center justify-center rounded-sm bg-primary text-[11px] font-semibold text-inverted">
            NX
          </span>
        </template>

        <span v-if="!collapsed" class="min-w-0 flex-1 truncate text-left text-sm font-medium text-highlighted">
          {{ workspace.name }}
        </span>

        <template v-if="!collapsed" #trailing>
          <UIcon name="i-carbon-chevron-down" class="size-4 shrink-0 text-dimmed" />
        </template>
      </UButton>
    </UDropdownMenu>
  </div>

  <UModal v-if="auth.connected" v-model:open="governanceOpen" :title="governanceIntent === 'create-personal' ? '新建个人工作区' : '新建企业工作区'">
    <template #body>
      <SettingsLiveWorkspaceCreate v-if="governanceOpen"
                                   :key="governanceSession"
                                   :personal="governanceIntent === 'create-personal'"
                                   @created="governanceOpen = false" />
    </template>
  </UModal>

  <USlideover v-if="!auth.connected" v-model:open="governanceOpen" :ui="{ content: 'w-full sm:max-w-[1440px]' }">
    <template #header>
      <div class="flex w-full items-center justify-between gap-2">
        <div>
          <p class="text-sm font-semibold text-highlighted">
            工作区与权限治理
          </p>
          <p class="text-xs text-muted">
            演示数据仅保存在本浏览器，刷新后恢复种子。
          </p>
        </div>
        <UButton
          color="neutral"
          variant="ghost"
          icon="i-carbon-close"
          label="关闭"
          data-testid="workspace-governance-close"
          @click="governanceOpen = false"
        />
      </div>
    </template>
    <template #body>
      <SettingsGovernanceCenter :key="governanceSession" :initial-intent="governanceIntent" />
    </template>
  </USlideover>
</template>

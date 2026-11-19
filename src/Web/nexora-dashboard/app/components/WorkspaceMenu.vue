<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'

defineProps<{
  collapsed?: boolean
}>()

const { t } = useI18n()
const { workspaces, workspace, activeWorkspaceId } = useMockWorkspace()

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

const items = computed<DropdownMenuItem[][]>(() => [
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
    label: t('shell.currentWorkspace', { plan: workspace.value.plan }),
    icon: 'i-carbon-checkmark-filled',
    disabled: true
  }],
  [
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
])
</script>

<template>
  <div class="space-y-1">
    <UDropdownMenu
      :items="items"
      :content="{ align: 'start', collisionPadding: 12 }"
      :ui="{ content: collapsed ? 'w-56' : 'w-(--reka-dropdown-menu-trigger-width)' }"
    >
      <UButton
        color="neutral"
        variant="ghost"
        block
        :square="collapsed"
        class="justify-start px-2 data-[state=open]:bg-elevated"
        :ui="{ base: 'min-w-0' }"
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

    <div v-if="!collapsed" class="flex items-center gap-1 px-1">
      <UButton
        size="xs"
        color="neutral"
        variant="ghost"
        icon="i-carbon-flow"
        aria-label="工作区与权限治理"
        data-testid="workspace-governance-open"
        @click="openGovernance('overview')"
      />
      <UButton
        size="xs"
        color="neutral"
        variant="ghost"
        icon="i-carbon-add-alt"
        aria-label="新建企业工作区"
        data-testid="workspace-create-company"
        @click="openGovernance('create-company')"
      />
      <UButton
        size="xs"
        color="neutral"
        variant="ghost"
        icon="i-carbon-user-multiple"
        aria-label="新建个人工作区"
        data-testid="workspace-create-personal"
        @click="openGovernance('create-personal')"
      />
      <UButton
        size="xs"
        color="neutral"
        variant="ghost"
        icon="i-carbon-link"
        aria-label="个人账本链接"
        data-testid="workspace-ledger-link"
        @click="openGovernance('link-ledger')"
      />
    </div>
  </div>

  <USlideover v-model:open="governanceOpen" :ui="{ content: 'w-full sm:max-w-[1440px]' }">
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

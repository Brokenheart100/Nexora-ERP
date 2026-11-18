<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'

defineProps<{
  collapsed?: boolean
}>()

const { workspaces, workspace, activeWorkspaceId } = useMockWorkspace()

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
    label: '当前工作区：' + workspace.value.plan,
    icon: 'i-carbon-checkmark-filled',
    disabled: true
  }]
])
</script>

<template>
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
</template>

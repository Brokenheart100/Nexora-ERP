<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import { useSessionStore } from '~/stores/session'
import { useUiStore } from '~/stores/ui'

defineProps<{
  collapsed?: boolean
}>()

const session = useSessionStore()
const ui = useUiStore()
const colorMode = useColorMode()
const user = computed(() => session.user)

const items = computed<DropdownMenuItem[][]>(() => [
  [{
    label: user.value.name + ' · ' + user.value.title,
    avatar: { alt: user.value.name, icon: user.value.avatarIcon },
    type: 'label'
  }],
  [{
    label: 'MFA 已启用 · ' + session.sessions.length + ' 个登录会话',
    icon: 'i-carbon-locked',
    type: 'label'
  }],
  [{
    label: '账户与设置',
    icon: 'i-carbon-settings',
    to: '/settings'
  }, {
    label: '安全设置',
    icon: 'i-carbon-locked',
    onSelect: () => {
      ui.accountSecurityOpen = true
    }
  }],
  [{
    label: '主题',
    type: 'label'
  }, {
    label: '浅色',
    icon: 'i-carbon-light',
    type: 'checkbox',
    checked: colorMode.value === 'light',
    onSelect: () => {
      colorMode.preference = 'light'
    }
  }, {
    label: '深色',
    icon: 'i-carbon-moon',
    type: 'checkbox',
    checked: colorMode.value === 'dark',
    onSelect: () => {
      colorMode.preference = 'dark'
    }
  }, {
    label: '跟随系统',
    icon: 'i-carbon-screen',
    type: 'checkbox',
    checked: colorMode.value === 'system',
    onSelect: () => {
      colorMode.preference = 'system'
    }
  }],
  [{
    label: '本地 UI 原型 · 模拟数据',
    icon: 'i-carbon-information',
    disabled: true
  }]
])
</script>

<template>
  <UDropdownMenu :items="items" :ui="{ content: 'w-56' }">
    <UButton
      color="neutral"
      variant="ghost"
      :class="collapsed ? 'justify-center' : 'w-full justify-start'"
      :square="collapsed"
    >
      <UAvatar
        :alt="user.name"
        :icon="user.avatarIcon"
        size="2xs"
        :ui="{ icon: 'size-3' }"
      />
      <span v-if="!collapsed" class="min-w-0 text-left leading-tight">
        <span class="block truncate text-[13px] font-medium text-highlighted">{{ user.name }}</span>
        <span class="block truncate text-[11px] text-muted">{{ user.title }}</span>
      </span>
    </UButton>
  </UDropdownMenu>
</template>

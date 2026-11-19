<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import { useSessionStore } from '~/stores/session'
import { useUiStore } from '~/stores/ui'

const props = defineProps<{
  collapsed?: boolean
}>()

const session = useSessionStore()
const ui = useUiStore()
const colorMode = useColorMode()
const { t } = useI18n()
const { locale, localeOptions, changeLocale } = useLocaleSwitch()
const user = computed(() => session.user)

const items = computed<DropdownMenuItem[][]>(() => {
  const sections: DropdownMenuItem[][] = [
    [{
      label: user.value.name + ' · ' + user.value.title,
      avatar: { alt: user.value.name, icon: user.value.avatarIcon },
      type: 'label'
    }],
    [{
      label: t('shell.mfa', { count: session.activeSessions.length }),
      icon: 'i-carbon-locked',
      type: 'label'
    }, {
      label: '当前身份：' + (session.user.roleLabel ?? session.user.title),
      icon: 'i-carbon-user-role',
      type: 'label'
    }],
    [{
      label: '演示身份',
      type: 'label'
    }, ...session.identityOptions.map(option => ({
      label: option.label,
      icon: 'i-carbon-user-switch',
      type: 'checkbox' as const,
      checked: session.profileKey === option.value,
      onSelect: () => session.switchIdentity(option.value)
    }))],
    [{
      label: t('shell.accountSettings'),
      icon: 'i-carbon-settings',
      to: '/settings'
    }, {
      label: t('shell.securitySettings'),
      icon: 'i-carbon-locked',
      onSelect: () => {
        ui.accountSecurityOpen = true
      }
    }],
    [{
      label: t('shell.theme'),
      type: 'label'
    }, {
      label: t('shell.themeLight'),
      icon: 'i-carbon-light',
      type: 'checkbox',
      checked: colorMode.value === 'light',
      onSelect: () => {
        colorMode.preference = 'light'
      }
    }, {
      label: t('shell.themeDark'),
      icon: 'i-carbon-moon',
      type: 'checkbox',
      checked: colorMode.value === 'dark',
      onSelect: () => {
        colorMode.preference = 'dark'
      }
    }, {
      label: t('shell.themeSystem'),
      icon: 'i-carbon-screen',
      type: 'checkbox',
      checked: colorMode.value === 'system',
      onSelect: () => {
        colorMode.preference = 'system'
      }
    }]
  ]

  if (props.collapsed) {
    sections.push([{
      label: t('shell.language'),
      type: 'label'
    }])
    sections.push(localeOptions.map(option => ({
      label: option.label,
      icon: 'i-carbon-language',
      type: 'checkbox' as const,
      checked: locale.value === option.value,
      onSelect: () => changeLocale(option.value)
    })))
  }

  sections.push([{
    label: t('shell.prototypeNote'),
    icon: 'i-carbon-information',
    disabled: true
  }])

  return sections
})
</script>

<template>
  <UDropdownMenu :items="items" :ui="{ content: 'w-56' }">
    <UButton
      color="neutral"
      variant="ghost"
      :class="collapsed ? 'justify-center' : 'w-full justify-start'"
      :square="collapsed"
      data-testid="user-menu-trigger"
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

<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import { useSessionStore } from '~/stores/session'
import { useUiStore } from '~/stores/ui'
import { useAuthSessionStore } from '~/stores/authSession'
import { loginDestination } from '#shared/utils/auth-navigation'
import { usesConnectedBusinessData } from '~/utils/organization/navigation'

const props = defineProps<{
  collapsed?: boolean
}>()

const session = useSessionStore()
const auth = useAuthSessionStore()
const route = useRoute()
const ui = useUiStore()
const colorMode = useColorMode()
const { t } = useI18n()
const { locale, localeOptions, changeLocale } = useLocaleSwitch()
const user = computed(() => auth.connected
  ? {
      name: auth.user ? auth.user.name || auth.user.subject : t(auth.error ? 'auth.unavailable' : auth.loading ? 'auth.loading' : 'auth.guest'),
      title: t(usesConnectedBusinessData(route.path, route.query.tab) ? auth.simulated ? 'auth.catalogMock' : 'auth.catalogLive' : auth.simulated ? 'auth.simulated' : 'auth.connected'),
      avatarIcon: 'i-carbon-user-avatar'
    }
  : session.user)

function loginPath(entry: 'login' | 'email-login' | 'register', reauth = false) {
  return `/bff/${entry}?${reauth ? 'prompt=login&' : ''}returnTo=${encodeURIComponent(loginDestination(route.fullPath))}`
}

const items = computed<DropdownMenuItem[][]>(() => {
  const sections: DropdownMenuItem[][] = [
    [{
      label: user.value.name + ' · ' + user.value.title,
      avatar: { alt: user.value.name, icon: user.value.avatarIcon },
      type: 'label'
    }]
  ]
  if (!auth.connected) sections.push(
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
    }))]
  )
  else {
    if (auth.user) sections.push([...(auth.security?.available
      ? [{
          label: t(auth.security?.enrolled ? 'auth.mfaVerified' : 'auth.mfaPending'),
          icon: 'i-carbon-locked',
          type: 'label' as const
        }, {
          label: t('auth.reauthenticate'),
          icon: 'i-carbon-fingerprint-recognition',
          to: loginPath('login', true),
          external: true
        }]
      : []), {
      label: t('auth.signOut'),
      icon: 'i-carbon-logout',
      disabled: auth.loggingOut,
      onSelect: () => auth.logout()
    }])
    else sections.push([
      { label: t('auth.signIn'), icon: 'i-carbon-login', to: loginPath('login'), external: true },
      { label: t('auth.emailLogin'), icon: 'i-carbon-email', to: loginPath('email-login'), external: true },
      { label: t('auth.register'), icon: 'i-carbon-user-follow', to: loginPath('register'), external: true }
    ])
    if (auth.error) sections.push([{
      label: t(auth.error), icon: 'i-carbon-warning', type: 'label'
    }, {
      label: t('auth.retry'), icon: 'i-carbon-renew', onSelect: () => auth.refresh()
    }])
  }
  sections.push(
    [{
      label: t('shell.accountSettings'),
      icon: 'i-carbon-settings',
      to: '/settings'
    }, {
      label: t('shell.securitySettings'),
      icon: 'i-carbon-locked',
      disabled: auth.connected && !auth.user,
      onSelect() { ui.accountSecurityOpen = true }
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
  )

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
      :loading="auth.connected && auth.loading"
      :aria-label="user.name"
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

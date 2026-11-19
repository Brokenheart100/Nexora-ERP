<script setup lang="ts">
const { t, locale, setLocale } = useI18n()
const store = useWorkspaceStore()
const { user, displayName, loggingOut, logoutError, selected } = storeToRefs(store)
const route = useRoute()
const navOpen = ref(false)
const companyPath = computed(() => user.value && selected.value && !selected.value.isPersonal
  ? '/companies/' + selected.value.id : '')
const companySection = computed(() => {
  if (!companyPath.value) return ''
  if (route.path === companyPath.value + '/members') return 'app.teamMembers'
  if (route.path === companyPath.value + '/roles') return 'app.rolesPermissions'
  if (route.path === companyPath.value + '/billing') return 'app.billing'
  return ''
})

const localeOptions = [
  { label: '简体中文', value: 'zh-CN' },
  { label: 'English', value: 'en' },
]
const localeModel = computed({
  get: () => locale.value,
  set: (value: string) => changeLocale(value),
})

function changeLocale(value: string) {
  if (value === 'zh-CN' || value === 'en') void setLocale(value)
}
function closeNavigation() {
  navOpen.value = false
}
</script>

<template>
  <div class="shell nx" :class="{ 'nav-open': navOpen }">
    <aside aria-label="应用导航">
      <div class="brand">
        <span class="brand-mark" aria-hidden="true">N</span>
        <span class="brand-word">{{ t('app.name') }}</span>
      </div>
      <p class="caption">{{ t('app.tagline') }}</p>
      <nav aria-label="主导航">
        <p class="nav-label">{{ t('app.nav') }}</p>
        <NuxtLink to="/" @click="closeNavigation">
          <UIcon name="i-lucide-layout-grid" aria-hidden="true" />
          <span>{{ t('app.workspace') }}</span>
        </NuxtLink>
        <template v-if="companyPath">
          <p class="nav-label">{{ selected?.name }}</p>
          <NuxtLink :to="companyPath + '/members'" @click="closeNavigation">
            <UIcon name="i-lucide-users-round" aria-hidden="true" />
            <span>{{ t('app.teamMembers') }}</span>
          </NuxtLink>
          <NuxtLink :to="companyPath + '/roles'" @click="closeNavigation">
            <UIcon name="i-lucide-shield-check" aria-hidden="true" />
            <span>{{ t('app.rolesPermissions') }}</span>
          </NuxtLink>
          <NuxtLink :to="companyPath + '/billing'" @click="closeNavigation">
            <UIcon name="i-lucide-receipt" aria-hidden="true" />
            <span>{{ t('app.billing') }}</span>
          </NuxtLink>
        </template>
      </nav>
      <div class="side-foot">
        <p class="phase"><span class="phase-dot" aria-hidden="true" />{{ t('app.phase') }}</p>
        <p class="side-meta">{{ t('app.meta') }}</p>
      </div>
    </aside>

    <button
v-if="navOpen" class="nav-scrim" type="button" :aria-label="t('header.closeNav')"
      @click="closeNavigation" />

    <main>
      <header data-testid="app-header">
        <div class="crumbs">
          <button class="nav-toggle" type="button" :aria-label="t('header.openNav')" @click="navOpen = true">
            <UIcon name="i-lucide-menu" aria-hidden="true" />
          </button>
          <UIcon class="crumb-icon" name="i-lucide-building" aria-hidden="true" />
          <span class="crumb-home-label">{{ t('header.organization') }}</span>
          <span class="crumb-sep">/</span>
          <span class="crumb-current">{{ t(companySection || 'header.workspace') }}</span>
        </div>

        <div v-if="user" class="user">
          <UColorModeButton class="theme-toggle" :aria-label="t('header.theme')" />
          <USelect
            v-model="localeModel" class="locale-switch" :items="localeOptions" icon="i-lucide-languages"
            :aria-label="t('header.language')" size="sm" variant="outline" color="neutral" />
          <span class="avatar" aria-hidden="true">{{ (displayName || t('header.userFallback')).slice(0, 1) }}</span>
          <span class="user-name">{{ displayName || t('header.userFallback') }}</span>
          <UButton variant="outline" color="neutral" size="sm" type="button" :disabled="loggingOut" @click="store.logout">
            {{ loggingOut ? t('header.loggingOut') : t('header.logout') }}
          </UButton>
        </div>
      </header>
      <UAlert v-if="logoutError" class="mt-4" role="alert" color="error" icon="i-lucide-circle-alert" :description="t(`status.${logoutError}`)" />
      <slot />
    </main>
  </div>
</template>

<style scoped src="~/assets/css/shell/sidebar.css"></style>
<style scoped src="~/assets/css/shell/toolbar.css"></style>
<style scoped src="~/assets/css/shell/adaptation.css"></style>
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

<style scoped>
:global(:root) {
  --nx-safe-top: env(safe-area-inset-top, 0px);
  --nx-safe-right: env(safe-area-inset-right, 0px);
  --nx-safe-bottom: env(safe-area-inset-bottom, 0px);
  --nx-safe-left: env(safe-area-inset-left, 0px);
}

.shell {
  display: grid;
  grid-template-columns: 264px minmax(0, 1fr);
  min-height: 100vh;
  min-height: 100dvh;
}

/* Sidebar */
.shell > aside {
  position: sticky;
  top: 0;
  z-index: 40;
  display: flex;
  flex-direction: column;
  height: 100vh;
  height: 100dvh;
  padding: 26px 20px 24px;
  overflow: hidden;
  color: #c9d5e8;
  background:
    radial-gradient(420px 260px at 18% 0%, rgba(72, 110, 196, 0.34), transparent 66%),
    linear-gradient(180deg, #0b1626 0%, #0f1d32 52%, #0b1728 100%);
}

.shell > aside::before {
  position: absolute;
  inset: 0;
  pointer-events: none;
  content: "";
  background-image:
    linear-gradient(rgba(148, 178, 230, 0.055) 1px, transparent 1px),
    linear-gradient(90deg, rgba(148, 178, 230, 0.055) 1px, transparent 1px);
  background-size: 42px 42px;
  mask-image: linear-gradient(180deg, rgba(0, 0, 0, 0.7), transparent 74%);
}

.shell > aside > * {
  position: relative;
  z-index: 1;
}

.brand {
  display: flex;
  align-items: center;
  gap: 11px;
  font-family: var(--nx-display);
  font-size: 22px;
  font-weight: 800;
  letter-spacing: 0.12em;
  color: #fff;
}

.brand-mark {
  display: grid;
  flex: 0 0 auto;
  width: 38px;
  height: 38px;
  place-items: center;
  font-size: 19px;
  font-weight: 800;
  letter-spacing: 0;
  color: #fff;
  background: linear-gradient(145deg, #6f97f2 0%, #315fc0 58%, #24478f 100%);
  border: 1px solid rgba(255, 255, 255, 0.22);
  border-radius: 11px;
  box-shadow:
    0 8px 18px -8px rgba(31, 70, 160, 0.9),
    inset 0 1px 0 rgba(255, 255, 255, 0.24);
}

.brand-word {
  font-size: 19px;
  letter-spacing: 0.16em;
}

.caption {
  margin: 12px 0 0 49px;
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 0.16em;
  color: #7b8dab;
}

.shell > aside nav {
  display: grid;
  gap: 6px;
  margin-top: 38px;
}

.nav-label {
  margin: 0 0 6px 12px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.2em;
  color: #667a9a;
  text-transform: uppercase;
}

.shell > aside nav a {
  display: flex;
  gap: 10px;
  align-items: center;
  padding: 10px 12px;
  font-size: 13px;
  font-weight: 600;
  color: #c3d1e6;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 10px;
  transition:
    color 0.16s ease,
    background 0.16s ease,
    border-color 0.16s ease;
}

.shell > aside nav a svg {
  flex: 0 0 auto;
  width: 17px;
  height: 17px;
  color: #8fa6c8;
}

.shell > aside nav a:hover {
  color: #fff;
  background: rgba(120, 155, 214, 0.1);
}

.shell > aside nav a[aria-current="page"] {
  color: #fff;
  background: linear-gradient(90deg, rgba(84, 128, 226, 0.3), rgba(84, 128, 226, 0.08));
  border-color: rgba(130, 166, 240, 0.24);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08);
}

.shell > aside nav a[aria-current="page"] svg {
  color: #a8c2ff;
}

.side-foot {
  padding-top: 18px;
  margin-top: auto;
  border-top: 1px solid rgba(151, 178, 219, 0.14);
}

.phase {
  display: inline-flex;
  gap: 8px;
  align-items: center;
  padding: 6px 10px;
  margin: 0;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  color: #a9bddb;
  background: rgba(120, 155, 214, 0.1);
  border: 1px solid rgba(151, 178, 219, 0.16);
  border-radius: 999px;
}

.phase-dot {
  width: 6px;
  height: 6px;
  background: #56d6af;
  border-radius: 50%;
  box-shadow: 0 0 0 3px rgba(86, 214, 175, 0.14);
}

.side-meta {
  margin: 12px 0 0;
  font-size: 10.5px;
  letter-spacing: 0.12em;
  color: #5f7291;
}

/* Main column */
.shell > main {
  width: 100%;
  min-width: 0;
  padding: 0 40px 76px;
  margin: 0;
}

.shell > main > header {
  position: sticky;
  top: 0;
  z-index: 30;
  display: flex;
  gap: 18px;
  align-items: center;
  justify-content: space-between;
  height: 70px;
  padding: 0 40px;
  margin: 0 -40px;
  font-size: 12.5px;
  color: var(--nx-ink-3);
  background: rgba(245, 247, 251, 0.78);
  border-bottom: 1px solid rgba(222, 228, 238, 0.85);
  backdrop-filter: blur(16px) saturate(140%);
}

.crumbs {
  display: flex;
  gap: 8px;
  align-items: center;
  min-width: 0;
}

.crumbs svg {
  width: 15px;
  height: 15px;
  color: #9aa9bd;
}

.crumb-sep {
  color: #b9c4d3;
}

.crumb-current {
  font-weight: 600;
  color: #1c2c43;
}

.user {
  display: flex;
  gap: 10px;
  align-items: center;
  flex: 0 0 auto;
}

.avatar {
  display: grid;
  width: 32px;
  height: 32px;
  place-items: center;
  font-size: 12px;
  font-weight: 700;
  color: #fff;
  text-transform: uppercase;
  background: linear-gradient(145deg, #5a86e0, #2d56ab);
  border: 1px solid rgba(255, 255, 255, 0.35);
  border-radius: 50%;
  box-shadow: 0 4px 10px -4px rgba(36, 76, 158, 0.7);
}

.user-name {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--nx-ink-2);
}

.nav-toggle {
  display: none;
  place-items: center;
  width: 34px;
  height: 34px;
  padding: 0;
  color: var(--nx-ink-2);
  background: #fff;
  border: 1px solid var(--nx-border);
  border-radius: 9px;
  box-shadow: 0 1px 2px rgba(16, 24, 40, 0.04);
}

.nav-toggle svg {
  width: 18px;
  height: 18px;
}

.nav-scrim {
  display: none;
}

/* Theme and locale controls */
.theme-toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  padding: 0;
  color: var(--nx-ink-3);
  background: #fff;
  border: 1px solid var(--nx-border);
  border-radius: 9px;
  box-shadow: 0 1px 2px rgba(16, 24, 40, 0.04);
}

.theme-toggle:hover {
  color: var(--nx-primary);
  border-color: #c8d7ee;
}

.theme-toggle :deep(svg) {
  width: 15px;
  height: 15px;
}

.locale-switch {
  min-width: 132px;
}

/* Responsive shell */
@media (max-width: 1180px) {
  .shell {
    grid-template-columns: 238px minmax(0, 1fr);
  }

  .shell > aside {
    padding: 24px 16px 20px;
  }

  .shell > main {
    padding-right: 28px;
    padding-left: 28px;
  }

  .shell > main > header {
    padding: 0 28px;
    margin: 0 -28px;
  }
}

@media (max-width: 980px) {
  .shell {
    grid-template-columns: minmax(0, 1fr);
  }

  .shell > aside {
    position: fixed;
    top: 0;
    left: 0;
    z-index: 60;
    width: min(84vw, 292px);
    padding: 24px 18px 20px;
    box-shadow: 24px 0 60px -20px rgba(6, 15, 30, 0.55);
    transform: translateX(-102%);
    visibility: hidden;
    transition:
      transform 0.24s ease,
      visibility 0.24s ease;
  }

  .shell.nav-open > aside {
    transform: translateX(0);
    visibility: visible;
  }

  .nav-scrim {
    position: fixed;
    inset: 0;
    z-index: 55;
    display: block;
    width: 100%;
    height: 100%;
    padding: 0;
    background: rgba(8, 16, 30, 0.42);
    border: 0;
    backdrop-filter: blur(2px);
  }

  .nav-toggle {
    display: grid;
  }
}

@media (max-width: 700px) {
  .shell > main {
    padding: 0 16px 48px;
  }

  .shell > main > header {
    height: 62px;
    padding: 0 16px;
    margin: 0 -16px;
  }

  .user-name {
    display: none;
  }

  .crumbs .crumb-sep,
  .crumbs .crumb-home-label {
    display: none;
  }
}

@media (max-width: 550px) {
  .locale-switch {
    display: none;
  }

  .theme-toggle {
    display: inline-flex;
  }
}

@media (max-width: 420px) {
  .brand-word {
    font-size: 17px;
  }
}

/* Dark theme */
html.dark .shell > aside {
  background:
    radial-gradient(420px 260px at 18% 0%, rgba(52, 86, 158, 0.3), transparent 66%),
    linear-gradient(180deg, #060d18 0%, #0a1526 52%, #060e1a 100%);
}

html.dark .shell > main > header {
  background: rgba(8, 16, 29, 0.82);
  border-bottom-color: var(--nx-border);
}

html.dark .crumb-current {
  color: var(--nx-ink);
}

html.dark .side-meta {
  color: var(--nx-ink-3);
}

html.dark .theme-toggle,
html.dark .nav-toggle {
  color: #c7d6ef;
  background: #132036;
  border-color: var(--nx-border-strong);
}

html.dark .theme-toggle:hover,
html.dark .nav-toggle:hover {
  color: #e8eef9;
  background: #182842;
  border-color: #3a5278;
}

html.dark .nav-scrim {
  background: rgba(0, 0, 0, 0.62);
}

/* PWA safe areas (must stay last so they win over the responsive padding) */
@supports (padding: env(safe-area-inset-top)) {
  .shell > aside {
    height: 100vh;
    height: 100dvh;
    padding-top: calc(26px + var(--nx-safe-top));
    padding-bottom: calc(24px + var(--nx-safe-bottom));
    padding-left: calc(20px + var(--nx-safe-left));
  }

  .shell > main {
    padding-right: calc(40px + var(--nx-safe-right));
    padding-bottom: calc(76px + var(--nx-safe-bottom));
    padding-left: calc(40px + var(--nx-safe-left));
  }

  .shell > main > header {
    height: calc(70px + var(--nx-safe-top));
    padding: var(--nx-safe-top) calc(40px + var(--nx-safe-right)) 0 calc(40px + var(--nx-safe-left));
    margin: 0 calc(-40px - var(--nx-safe-right)) 0 calc(-40px - var(--nx-safe-left));
  }

  @media (max-width: 700px) {
    .shell > main {
      padding: 0 calc(16px + var(--nx-safe-right)) calc(48px + var(--nx-safe-bottom)) calc(16px + var(--nx-safe-left));
    }

    .shell > main > header {
      height: calc(62px + var(--nx-safe-top));
      padding: var(--nx-safe-top) calc(16px + var(--nx-safe-right)) 0 calc(16px + var(--nx-safe-left));
      margin: 0 calc(-16px - var(--nx-safe-right)) 0 calc(-16px - var(--nx-safe-left));
    }
  }
}
</style>
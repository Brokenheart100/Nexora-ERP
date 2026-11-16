<script setup lang="ts">
import type { BillingEntitlements } from '~/utils/billing'
import type { Workspace } from '~/utils/workspace'
import { moduleAllowed } from '~/utils/billing'
import { moduleIcons } from '~/utils/icons'

const { t, locale } = useI18n()
const store = useWorkspaceStore()
const {
  user, workspaces, selected, projection, messageKey,
  busy, accepting, loggingOut, personalWorkspaces,
} = storeToRefs(store)

const name = ref('')
const personal = ref(false)
const invitationCode = ref('')
const ssoHint = useCookie<boolean>('__Host-Nexora.SsoHint', { readonly: true })
const isLocalDevelopment = import.meta.dev
const route = useRoute()

type ModuleId =
  | 'home' | 'dashboard' | 'company' | 'book' | 'reports' | 'aging' | 'partners'
  | 'catalog' | 'inventory' | 'purchasing' | 'sales' | 'receivables' | 'audit' | 'assistant'

interface ConsoleModule {
  id: ModuleId
  label: string
}

const active = ref<ModuleId>('home')
const query = ref('')
const entitlements = ref<BillingEntitlements | null>(null)

const companyCount = computed(() => workspaces.value.filter(workspace => !workspace.isPersonal).length)
const filteredWorkspaces = computed(() => {
  const keyword = query.value.trim().toLowerCase()
  if (!keyword) return workspaces.value
  return workspaces.value.filter((workspace) => {
    const name = workspaceLabel(workspace, t('common.untitledWorkspace')).toLowerCase()
    return name.includes(keyword)
      || workspace.baseCurrency.toLowerCase().includes(keyword)
      || workspace.countryCode.toLowerCase().includes(keyword)
  })
})

const modules = computed<ConsoleModule[]>(() => {
  const items: ConsoleModule[] = [
    { id: 'home', label: 'workspaces.console.home' },
  ]
  if (!selected.value) return items
  items.push({ id: 'dashboard', label: 'workspaces.console.dashboard' })
  const isPersonal = selected.value.isPersonal
  if (!isPersonal) {
    items.push({ id: 'company', label: 'workspaces.console.company' })
  }
  items.push(
    { id: 'book', label: 'workspaces.console.book' },
    { id: 'reports', label: 'workspaces.console.reports' },
    { id: 'aging', label: 'workspaces.console.aging' },
    { id: 'partners', label: 'workspaces.console.partners' },
    { id: 'catalog', label: 'workspaces.console.catalog' },
    { id: 'inventory', label: 'workspaces.console.inventory' },
  )
  if (!isPersonal) {
    items.push(
      { id: 'purchasing', label: 'workspaces.console.purchasing' },
      { id: 'sales', label: 'workspaces.console.sales' },
      { id: 'receivables', label: 'workspaces.console.receivables' },
      { id: 'audit', label: 'workspaces.console.audit' },
      { id: 'assistant', label: 'workspaces.console.assistant' },
    )
  }
  return items.filter(item => item.id === 'home' || item.id === 'dashboard' || item.id === 'company'
    || moduleAllowed(entitlements.value, item.id))
})

watch(() => selected.value?.id, () => {
  active.value = 'home'
})

watch(() => selected.value?.id, async (id) => {
  entitlements.value = null
  if (!id || selected.value?.isPersonal) return
  try {
    entitlements.value = await $fetch<BillingEntitlements>('/bff/api/workspaces/' + id + '/billing/entitlements', { retry: 0 })
  } catch { entitlements.value = null }
}, { immediate: true })

watch(modules, (items) => {
  if (!items.some(item => item.id === active.value)) active.value = 'home'
})

const message = computed(() => messageKey.value ? t('status.' + messageKey.value) : '')
const workspaceName = (workspace: Workspace | null | undefined) =>
  workspaceLabel(workspace, t('common.untitledWorkspace'))

onMounted(async () => {
  if (!store.loaded) await store.load()
  const requested = typeof route.query.workspace === 'string' ? route.query.workspace : ''
  if (requested) store.navigateToWorkspace(requested)
})

async function create() {
  const personalWorkspace = personal.value
  if (!await store.create(name.value, personalWorkspace)) return
  name.value = ''
  const created = selected.value
  if (!personalWorkspace && created) await navigateTo('/companies/' + created.id + '/setup')
}

function openSetup() {
  if (selected.value && !selected.value.isPersonal)
    return navigateTo('/companies/' + selected.value.id + '/setup')
}

function openModule(id: ModuleId) {
  active.value = id
}
async function acceptInvitation() {
  if (await store.acceptInvitation(invitationCode.value)) invitationCode.value = ''
}
</script>

<template>
  <section v-if="!user || active === 'home' || !selected" class="hero">
    <div class="hero-copy">
      <p class="eyebrow">{{ t('workspaces.eyebrow') }}</p>
      <h1>{{ t('workspaces.title') }}</h1>
      <p class="hero-sub">{{ t('workspaces.subtitle') }}</p>
    </div>
    <div v-if="user" class="hero-stats">
      <div class="hero-stat">
        <UIcon name="i-lucide-layers" aria-hidden="true" />
        <span>{{ t('workspaces.stats.workspaces') }}</span>
        <strong>{{ workspaces.length }}</strong>
      </div>
      <div class="hero-stat">
        <UIcon name="i-lucide-building" aria-hidden="true" />
        <span>{{ t('workspaces.stats.companies') }}</span>
        <strong>{{ companyCount }}</strong>
      </div>
      <div class="hero-stat">
        <UIcon name="i-lucide-user-round" aria-hidden="true" />
        <span>{{ t('workspaces.stats.personal') }}</span>
        <strong>{{ personalWorkspaces.length }}</strong>
      </div>
      <div class="hero-stat">
        <UIcon name="i-lucide-coins" aria-hidden="true" />
        <span>{{ t('workspaces.stats.currency') }}</span>
        <strong>{{ selected?.baseCurrency ?? 'CNY' }}</strong>
      </div>
    </div>
  </section>

  <section v-if="!user" class="login-card">
    <h2><UIcon class="mr-2 inline-block size-[1.08em] align-[-0.16em] text-nx-primary" name="i-lucide-log-in" aria-hidden="true" />{{ t('workspaces.login.title') }}</h2>
    <p>{{ t('workspaces.login.body') }}</p>
    <div class="login-actions">
      <a class="inline-flex items-center justify-center gap-[7px] whitespace-nowrap rounded-[10px] bg-nx-primary px-[17px] py-[9px] text-[13px] font-semibold text-white transition hover:bg-nx-primary-strong" href="/bff/email-login">{{ t('workspaces.login.action') }}</a>
      <a class="inline-flex items-center gap-1.5 whitespace-nowrap rounded-[9px] border border-nx-border bg-nx-surface px-3 py-[7px] text-[12px] font-semibold text-nx-ink-2 shadow-nx-sm transition-colors hover:border-nx-border-strong hover:bg-nx-surface-muted hover:text-nx-primary-strong" href="/bff/register">{{ t('workspaces.login.register') }}</a>
      <UButton variant="outline" color="neutral" size="sm" to="/pricing" data-testid="choose-plan-first">先选套餐再注册</UButton>
      <a v-if="isLocalDevelopment" class="inline-flex items-center gap-1.5 whitespace-nowrap rounded-[9px] border border-nx-border bg-nx-surface px-3 py-[7px] text-[12px] font-semibold text-nx-ink-2 shadow-nx-sm transition-colors hover:border-nx-border-strong hover:bg-nx-surface-muted hover:text-nx-primary-strong" href="/bff/login">{{ t('workspaces.login.demo') }}</a>
      <UButton v-if="ssoHint" variant="outline" color="neutral" size="sm" type="button" :disabled="loggingOut" @click="store.logout">
        {{ loggingOut ? t('header.loggingOut') : t('workspaces.login.logout') }}
      </UButton>
    </div>
  </section>

  <section v-else class="console">
    <div class="console-bar">
      <div class="console-workspace">
        <span class="ws-badge" aria-hidden="true">{{ (selected ? workspaceName(selected) : 'N').slice(0, 1) }}</span>
        <div class="console-workspace-text">
          <span>{{ t('workspaces.console.current') }}</span>
          <strong>{{ selected ? workspaceName(selected) : t('workspaces.console.unselected') }}</strong>
        </div>
        <span v-if="selected" class="console-chip">
          {{ selected.isPersonal ? t('workspaces.list.personal') : t('workspaces.list.company') }}
        </span>
        <span v-if="selected && !selected.isPersonal && entitlements" class="console-chip plan-chip"
          data-testid="workspace-plan">{{ entitlements.planName }}</span>
      </div>
      <nav v-if="selected" class="console-tabs" role="tablist" :aria-label="t('workspaces.console.modules')">
        <button v-for="item in modules" :id="'console-tab-' + item.id" :key="item.id" type="button" role="tab"
          class="console-tab" :aria-selected="active === item.id" aria-controls="console-panel"
          :data-testid="'module-' + item.id" @click="active = item.id">
          <UIcon :name="moduleIcons[item.id]" aria-hidden="true" />
          <span>{{ t(item.label) }}</span>
        </button>
      </nav>
    </div>

    <div id="console-panel" class="console-panel" role="tabpanel" :aria-labelledby="'console-tab-' + active">
      <template v-if="active === 'home' || !selected">
        <div class="deck">
          <section class="create-card rounded-nx border border-nx-border bg-nx-surface p-6 shadow-nx-sm">
            <h2><UIcon class="mr-2 inline-block size-[1.08em] align-[-0.16em] text-nx-primary" name="i-lucide-square-plus" aria-hidden="true" />{{ t('workspaces.create.title') }}</h2>
            <p class="card-sub">{{ t('workspaces.create.subtitle') }}</p>
            <form @submit.prevent="create">
              <UCheckbox v-model="personal" :disabled="busy" :label="t('workspaces.create.personal')" class="personal-option" />
              <p class="personal-hint">{{ t('workspaces.create.personalHint') }}</p>
              <UFormField :label="personal ? t('workspaces.create.personalName') : t('workspaces.create.companyName')">
                <div class="flex items-stretch gap-2.5">
                  <UInput id="name" v-model="name" required maxlength="160" size="lg" class="flex-1 min-w-0"
                    :placeholder="t('workspaces.create.namePlaceholder')" />
                  <UButton type="submit" color="primary" icon="i-lucide-plus" :loading="busy" :disabled="busy">
                    {{ busy ? t('workspaces.create.busy') : t('workspaces.create.submit') }}
                  </UButton>
                </div>
              </UFormField>
              <p class="mt-2 text-[12px] leading-[1.62] text-nx-ink-3">{{ t('workspaces.create.hint') }}</p>
            </form>
          </section>

          <section class="join-card rounded-nx border border-nx-border bg-nx-surface p-6 shadow-nx-sm">
            <h2><UIcon class="mr-2 inline-block size-[1.08em] align-[-0.16em] text-nx-primary" name="i-lucide-ticket" aria-hidden="true" />{{ t('workspaces.join.title') }}</h2>
            <p class="card-sub">{{ t('workspaces.join.subtitle') }}</p>
            <form @submit.prevent="acceptInvitation">
              <UFormField :label="t('workspaces.join.code')">
                <div class="flex flex-col items-stretch gap-2.5">
                  <UInput id="invitation-code" v-model="invitationCode" required autocomplete="off" size="lg"
                    :placeholder="t('workspaces.join.placeholder')" />
                  <UButton type="submit" color="primary" icon="i-lucide-ticket-check" :loading="accepting" :disabled="accepting">
                    {{ t('workspaces.join.submit') }}
                  </UButton>
                </div>
              </UFormField>
            </form>
          </section>
          <UAlert v-if="message" role="status" aria-live="polite" class="deck-wide" :description="message" />

          <section class="workspace-card rounded-nx border border-nx-border bg-nx-surface p-6 shadow-nx-sm">
            <div class="card-head">
              <h2><UIcon class="mr-2 inline-block size-[1.08em] align-[-0.16em] text-nx-primary" name="i-lucide-layers" aria-hidden="true" />{{ t('workspaces.list.title') }} <small>{{ filteredWorkspaces.length }} / {{ workspaces.length
                  }}</small></h2>
              <div class="list-tools">
                <UInput v-model="query" class="ws-search" size="sm" icon="i-lucide-search"
                  :placeholder="t('workspaces.list.search')" :aria-label="t('workspaces.list.search')" />
                <span class="card-hint">{{ t('workspaces.list.hint') }}</span>
              </div>
            </div>
            <p v-if="!workspaces.length" class="mt-2 text-[12px] leading-[1.62] text-nx-ink-3">{{ t('workspaces.list.empty') }}</p>
            <p v-else-if="!filteredWorkspaces.length" class="mt-2 text-[12px] leading-[1.62] text-nx-ink-3">{{ t('workspaces.list.noMatch') }}</p>
            <div v-else class="workspace-list">
              <button v-for="workspace in filteredWorkspaces" :key="workspace.id" class="workspace"
                :aria-current="selected?.id === workspace.id ? 'true' : undefined" @click="store.select(workspace)">
                <span class="ws-badge" aria-hidden="true">{{ workspaceName(workspace).slice(0, 1) }}</span>
                <span class="ws-main">
                  <strong>{{ workspaceName(workspace) }}</strong>
                  <span>{{ workspace.isPersonal ? t('workspaces.list.personal') : t('workspaces.list.company') }} · {{
                    workspace.baseCurrency }} · {{ workspace.countryCode }}</span>
                </span>
                <UIcon class="ws-arrow" name="i-lucide-arrow-up-right" aria-hidden="true" />
              </button>
            </div>
          </section>

          <div class="rail">
            <div class="overview-card rounded-nx border border-nx-border bg-nx-surface p-6 shadow-nx-sm">
              <div class="card-head">
                <h2><UIcon class="mr-2 inline-block size-[1.08em] align-[-0.16em] text-nx-primary" name="i-lucide-gauge" aria-hidden="true" />{{ t('workspaces.overview.title') }}</h2>
              </div>
              <template v-if="selected">
                <div class="overview-hero">
                  <span class="ws-badge lg" aria-hidden="true">{{ workspaceName(selected).slice(0, 1) }}</span>
                  <div>
                    <h3>{{ workspaceName(selected) }}</h3>
                    <p>{{ selected.isPersonal ? t('workspaces.list.personal') : t('workspaces.list.company') }}</p>
                  </div>
                </div>
                <dl>
                  <dt>{{ t('workspaces.overview.currency') }}</dt>
                  <dd>{{ selected.baseCurrency }}</dd>
                  <dt>{{ t('workspaces.overview.region') }}</dt>
                  <dd>{{ selected.countryCode }}</dd>
                  <dt>{{ t('workspaces.overview.projection') }}</dt>
                  <dd class="status-pill" :data-tone="projection ? 'ok' : 'pending'">
                    <span class="status-dot" aria-hidden="true" />{{ projection ? t('workspaces.overview.synced') :
                      t('workspaces.overview.pending') }}
                  </dd>
                </dl>
                <p v-if="projection" class="mt-2 text-[12px] leading-[1.62] text-nx-ink-3">
                  {{ t('workspaces.overview.updated', {
                    time: new Date(projection.projectedAtUtc).toLocaleString(locale
                      === 'en' ? 'en-US' : 'zh-CN') }) }}
                </p>
                <UButton class="mt-2.5" variant="outline" color="neutral" size="sm" type="button" icon="i-lucide-refresh-cw" @click="store.select(selected)">{{ t('workspaces.overview.refresh')
                  }}</UButton>
                <UButton v-if="selected && !selected.isPersonal" class="mt-2.5" variant="outline" color="neutral" size="sm" type="button" icon="i-lucide-list-checks" @click="openSetup">
                  初始化向导
                </UButton>
              </template>
              <div v-else class="empty-state">
                <span class="empty-icon" aria-hidden="true"><UIcon name="i-lucide-inbox" /></span>
                <p class="mt-2 text-[12px] leading-[1.62] text-nx-ink-3">{{ t('workspaces.overview.empty') }}</p>
              </div>
              <WorkspaceCapabilities v-if="selected" :key="'capabilities-' + selected.id" :workspace-id="selected.id" class="deck-card" />
            </div>
          </div>

          <AccountDeletionReview :key="user?.subject ?? 'account'" class="deck-wide deck-card" />
          <AccountSessions :key="'sessions-' + (user?.subject ?? 'account')" class="deck-wide deck-card" />
          <AccountSecurity class="deck-wide deck-card" />
        </div>
      </template>

      <WorkspaceDashboard v-else-if="active === 'dashboard' && selected" :key="'dashboard-' + selected.id"
        :workspace-id="selected.id" :workspace-name="workspaceName(selected)" @open="openModule" />
      <WorkspaceCompanySettings v-else-if="active === 'company' && selected && !selected.isPersonal"
        :key="'settings-' + selected.id" :workspace-id="selected.id" :personal-workspaces="personalWorkspaces"
        @navigate="store.navigateToWorkspace" />
      <WorkspaceBook v-else-if="active === 'book' && selected" :key="'book-' + selected.id"
        :workspace-id="selected.id" />
      <WorkspaceFinancialReports v-else-if="active === 'reports' && selected" :key="'reports-' + selected.id"
        :workspace-id="selected.id" :workspace-name="workspaceName(selected)" />
      <WorkspaceAging v-else-if="active === 'aging' && selected" :key="'aging-' + selected.id"
        :workspace-id="selected.id" />
      <WorkspacePartners v-else-if="active === 'partners' && selected" :key="'partners-' + selected.id"
        :workspace-id="selected.id" />
      <WorkspaceCatalog v-else-if="active === 'catalog' && selected" :key="'catalog-' + selected.id"
        :workspace-id="selected.id" />
      <WorkspaceInventory v-else-if="active === 'inventory' && selected" :key="'inventory-' + selected.id"
        :workspace-id="selected.id" />
      <WorkspacePurchasing v-else-if="active === 'purchasing' && selected && !selected.isPersonal"
        :key="'purchasing-' + selected.id" :workspace-id="selected.id" />
      <WorkspaceSales v-else-if="active === 'sales' && selected && !selected.isPersonal" :key="'sales-' + selected.id"
        :workspace-id="selected.id" />
      <WorkspaceReceivables v-else-if="active === 'receivables' && selected && !selected.isPersonal"
        :key="'receivables-' + selected.id" :workspace-id="selected.id" />
      <WorkspaceAudit v-else-if="active === 'audit' && selected && !selected.isPersonal"
        :key="'audit-' + selected.id" :workspace-id="selected.id" />
      <WorkspaceAssistant v-else-if="active === 'assistant' && selected && !selected.isPersonal"
        :key="'assistant-' + selected.id" :workspace-id="selected.id" />
    </div>
  </section>
</template>

<style scoped>
.console {
  margin-top: 6px;
}

.console-bar {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 16px;
  padding: 12px 14px 12px 18px;
  background: var(--nx-surface);
  border: 1px solid var(--nx-border);
  border-radius: var(--nx-radius);
  box-shadow: var(--nx-shadow-sm);
  margin-bottom: 18px;
}

.console-workspace {
  display: flex;
  flex: 0 1 auto;
  align-items: center;
  gap: 10px;
  min-width: 0;
  max-width: 340px;
  padding-bottom: 0;
  border-bottom: 0;
}

.console-workspace-text {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.console-workspace-text>span {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--nx-ink-4);
}

.console-workspace-text>strong {
  font-size: 15px;
  line-height: 1.3;
  color: var(--nx-ink);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.console-chip {
  flex: none;
  padding: 3px 10px;
  border-radius: 999px;
  background: var(--nx-primary-soft);
  color: var(--nx-primary-strong);
  font-size: 12px;
  font-weight: 600;
}

.console-tabs {
  display: flex;
  flex: 1 1 auto;
  flex-wrap: wrap;
  gap: 3px;
  justify-content: flex-end;
  padding: 5px;
  background: var(--nx-surface-muted);
  border: 1px solid var(--nx-border);
  border-radius: 16px;
}

.console-tab {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  padding: 7px 11px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--nx-ink-2);
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  line-height: 1.2;
  white-space: nowrap;
  cursor: pointer;
  transition: background 0.16s ease, color 0.16s ease, box-shadow 0.16s ease;
}

.console-tab:hover {
  background: var(--nx-surface);
  color: var(--nx-ink);
}

.console-tab[aria-selected='true'] {
  background: var(--nx-primary);
  color: #fff;
  box-shadow: 0 6px 16px rgba(47, 95, 191, 0.24);
}

html.dark .console-tab[aria-selected='true'] {
  color: #08101d;
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.35);
}

.console-tab svg {
  width: 15px;
  height: 15px;
  margin-right: 5px;
  opacity: 0.92;
}

.console-tab:focus-visible {
  outline: 2px solid var(--nx-primary);
  outline-offset: 2px;
}

.console-panel {
  display: flex;
  flex-direction: column;
  gap: 16px;
  animation: console-in 0.18s ease-out;
}

.console-panel>* {
  min-width: 0;
}

@keyframes console-in {
  from {
    opacity: 0;
    transform: translateY(4px);
  }

  to {
    opacity: 1;
    transform: none;
  }
}

@media (max-width: 640px) {
  .console-bar {
    flex-direction: column;
    align-items: stretch;
    padding: 12px;
    gap: 10px;
  }

  .console-tab {
    padding: 7px 12px;
    font-size: 13px;
  }
}

/* Hero ------------------------------------------------------------------- */
.eyebrow {
  display: flex;
  gap: 10px;
  align-items: center;
  margin: 0;
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.22em;
  color: #476aae;
}

.eyebrow::before {
  display: block;
  width: 24px;
  height: 1px;
  content: "";
  background: linear-gradient(90deg, #7292d4, transparent);
}

/* Workspace hero --------------------------------------------------------- */
.hero {
  position: relative;
  display: flex;
  gap: 44px;
  align-items: flex-end;
  justify-content: space-between;
  padding: 32px 36px;
  margin: 22px 0 20px;
  overflow: hidden;
  background:
    radial-gradient(680px 240px at 88% -10%, rgba(72, 114, 214, 0.16), transparent 68%),
    linear-gradient(135deg, rgba(255, 255, 255, 0.95), rgba(243, 247, 255, 0.9));
  border: 1px solid var(--nx-border);
  border-radius: calc(var(--nx-radius) + 4px);
  box-shadow: var(--nx-shadow-sm);
}

.hero::before {
  position: absolute;
  inset: 0;
  pointer-events: none;
  content: "";
  background-image:
    linear-gradient(rgba(64, 104, 180, 0.055) 1px, transparent 1px),
    linear-gradient(90deg, rgba(64, 104, 180, 0.055) 1px, transparent 1px);
  background-size: 46px 46px;
  mask-image: radial-gradient(560px 240px at 94% 4%, #000, transparent 78%);
}

.hero > * {
  position: relative;
  z-index: 1;
}

.hero-copy {
  min-width: 0;
}

.hero h1 {
  margin: 13px 0 10px;
  font-size: clamp(30px, 3vw, 43px);
  font-weight: 760;
  letter-spacing: -0.04em;
}

.hero-sub {
  max-width: 66ch;
  margin: 0;
  font-size: 14.5px;
  line-height: 1.7;
  color: #5f6f88;
}

.hero-stats {
  display: grid;
  flex: 0 0 auto;
  grid-template-columns: repeat(4, minmax(112px, 1fr));
  gap: 12px;
  align-items: stretch;
}

.hero-stat {
  min-width: 112px;
  padding: 14px 17px 13px;
  background: rgba(255, 255, 255, 0.76);
  border: 1px solid rgba(220, 227, 239, 0.95);
  border-radius: 14px;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.8);
  backdrop-filter: blur(12px);
}

.hero-stat svg {
  width: 15px;
  height: 15px;
  margin-bottom: 7px;
  color: #6f8ec7;
}

.hero-stat span {
  display: block;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.1em;
  color: var(--nx-ink-4);
}

.hero-stat strong {
  display: block;
  margin-top: 2px;
  font-family: var(--nx-display);
  font-size: 23px;
  font-weight: 700;
  color: #14243b;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.025em;
}

/* Workspace deck --------------------------------------------------------- */
.deck {
  display: grid;
  grid-template-columns: repeat(12, minmax(0, 1fr));
  gap: 18px;
  margin-top: 8px;
}

.deck > .create-card {
  grid-column: span 7;
}

.deck > .join-card {
  grid-column: span 5;
}

.deck > .workspace-card {
  grid-column: span 8;
  min-height: 540px;
}

.deck > .rail {
  display: grid;
  grid-column: span 4;
  gap: 18px;
  align-content: start;
}

.deck > .deck-wide {
  grid-column: 1 / -1;
}

.deck > .create-card,
.deck > .join-card,
.deck > .workspace-card,
.deck .overview-card,
.deck :deep(.deck-card) {
  padding: 26px;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.92), rgba(251, 252, 255, 0.94)),
    var(--nx-surface);
}

.deck :deep(h2) {
  margin-bottom: 6px;
}

.card-sub {
  margin: 0 0 20px;
  font-size: 12.5px;
  color: var(--nx-ink-3);
}

.join-card {
  display: flex;
  flex-direction: column;
}

.join-card form {
  margin-top: 4px;
}

.join-card .formrow {
  flex-direction: column;
  align-items: stretch;
}

.join-card .formrow :deep(input) {
  width: 100%;
  max-width: none;
}

.personal-option {
  display: inline-flex;
  gap: 10px;
  align-items: center;
  width: fit-content;
  padding: 11px 14px;
  margin: 0 0 18px;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--nx-ink-2);
  cursor: pointer;
  background: var(--nx-surface-muted);
  border: 1px solid var(--nx-border);
  border-radius: 11px;
  transition:
    border-color 0.16s ease,
    background 0.16s ease;
}

.personal-option:hover {
  background: #f4f8ff;
  border-color: #c9d8f2;
}

.personal-option input {
  margin: 0;
}

.personal-hint {
  margin: -8px 0 18px !important;
  font-size: 11.5px !important;
  color: var(--nx-ink-4) !important;
}

/* Workspace library ------------------------------------------------------ */
.workspace-card .card-head {
  align-items: center;
  gap: 16px;
  margin-bottom: 14px;
}

.list-tools {
  display: flex;
  flex: 0 0 auto;
  flex-wrap: wrap;
  gap: 10px 14px;
  align-items: center;
  justify-content: flex-end;
}

.ws-search {
  width: 250px;
}

.card-head {
  display: flex;
  gap: 12px;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 8px;
}

.card-head h2 {
  margin: 0;
}

.card-hint {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.06em;
  color: var(--nx-ink-4);
}

.workspace-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 8px;
  max-height: 520px;
  padding: 2px 6px 2px 2px;
  margin-top: 4px;
  overflow-y: auto;
  scrollbar-width: thin;
}

.workspace-list::-webkit-scrollbar {
  width: 8px;
}

.workspace-list::-webkit-scrollbar-thumb {
  background: #d7e0ee;
  border-radius: 999px;
}

.workspace {
  display: flex;
  gap: 12px;
  align-items: center;
  width: 100%;
  min-width: 0;
  padding: 12px;
  text-align: left;
  background: var(--nx-surface-muted);
  border: 1px solid var(--nx-border);
  border-radius: 12px;
  transition:
    background 0.16s ease,
    border-color 0.16s ease,
    transform 0.16s ease,
    box-shadow 0.16s ease;
}

.workspace:hover {
  background: #f8faff;
  border-color: #c9d8f2;
  box-shadow: 0 8px 18px -14px rgba(47, 95, 191, 0.55);
  transform: translateY(-1px);
}

.workspace[aria-current="true"] {
  background: var(--nx-primary-soft);
  border-color: #b9cff3;
  box-shadow: inset 0 0 0 1px rgba(47, 95, 191, 0.18);
}

.workspace[aria-current="true"] strong {
  color: var(--nx-primary-strong);
}

.ws-badge {
  display: grid;
  flex: 0 0 auto;
  width: 34px;
  height: 34px;
  place-items: center;
  font-family: var(--nx-display);
  font-size: 13px;
  font-weight: 700;
  color: #3b5d9b;
  background: linear-gradient(145deg, #eef4ff, #dfe9fb);
  border: 1px solid #dbe6f7;
  border-radius: 10px;
}

.ws-badge.lg {
  width: 42px;
  height: 42px;
  font-size: 15px;
  border-radius: 12px;
}

.ws-main {
  display: grid;
  flex: 1;
  gap: 1px;
  min-width: 0;
}

.ws-main strong {
  overflow: hidden;
  font-size: 13.5px;
  font-weight: 650;
  color: #182841;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ws-main > span {
  font-size: 11.5px;
  color: var(--nx-ink-4);
}

.ws-arrow {
  flex: 0 0 auto;
  font-size: 15px;
  color: #a9b8cc;
  transition:
    color 0.16s ease,
    transform 0.16s ease;
}

.workspace:hover .ws-arrow {
  color: var(--nx-primary);
  transform: translateX(2px);
}

.overview-hero {
  display: flex;
  gap: 12px;
  align-items: center;
  padding: 4px 0 16px;
  margin-bottom: 4px;
  border-bottom: 1px dashed #e8edf5;
}

.overview-hero h3 {
  margin: 0;
  font-size: 17px;
  letter-spacing: -0.015em;
}

.overview-hero p {
  margin: 1px 0 0;
  font-size: 11.5px;
  color: var(--nx-ink-4);
}

.overview-card :deep(dl) {
  display: grid;
  grid-template-columns: minmax(92px, auto) minmax(0, 1fr);
  gap: 9px 16px;
  margin: 14px 0;
  font-size: 13px;
}

.overview-card :deep(dt) {
  color: var(--nx-ink-3);
}

.overview-card :deep(dd) {
  margin: 0;
  font-weight: 600;
  color: var(--nx-ink-2);
}

.status-pill {
  display: inline-flex;
  gap: 6px;
  align-items: center;
  padding: 3px 9px 3px 7px;
  font-size: 11.5px;
  font-weight: 600;
  color: var(--nx-success);
  background: var(--nx-success-soft);
  border: 1px solid rgba(13, 138, 99, 0.16);
  border-radius: 999px;
}

.status-pill[data-tone="pending"] {
  color: var(--nx-warning);
  background: var(--nx-warning-soft);
  border-color: rgba(168, 106, 18, 0.16);
}

.status-dot {
  width: 6px;
  height: 6px;
  background: currentColor;
  border-radius: 50%;
  box-shadow: 0 0 0 3px color-mix(in srgb, currentColor 13%, transparent);
}

.empty-state {
  display: grid;
  gap: 8px;
  place-items: center;
  min-height: 176px;
  padding: 20px;
  margin-top: 8px;
  text-align: center;
  background: #fafbfe;
  border: 1px dashed #dde5f0;
  border-radius: 12px;
}

.empty-state .empty-icon {
  display: grid;
  width: 40px;
  height: 40px;
  place-items: center;
  font-size: 18px;
  color: #9db4d7;
  background: #f1f5fc;
  border: 1px solid #e4ebf6;
  border-radius: 12px;
}

/* Login state ------------------------------------------------------------ */
.login-card {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 12px 18px;
  align-items: center;
  max-width: 520px;
  padding: 17px 20px;
  margin-top: 14px;
  background: var(--nx-surface);
  border: 1px solid var(--nx-border);
  border-radius: var(--nx-radius);
  box-shadow: var(--nx-shadow-sm);
  transition: border-color 0.16s ease, box-shadow 0.16s ease;
}

.login-card:hover {
  border-color: #d8e1ee;
  box-shadow: var(--nx-shadow-md);
}

.login-card > * {
  grid-column: 1 / -1;
  min-width: 0;
}

.login-card > h2 {
  grid-column: 1;
  margin: 0;
}

.login-card > h2::before {
  display: inline-block;
  width: 3px;
  height: 13px;
  margin-right: 9px;
  vertical-align: -1px;
  content: "";
  background: linear-gradient(180deg, #7aa0ea, #2f5fbf);
  border-radius: 2px;
}

html.dark .login-card:hover {
  border-color: var(--nx-border-strong);
}

@media (max-width: 700px) {
  .login-card {
    padding: 15px 16px;
    border-radius: 14px;
  }
}

@media (max-width: 420px) {
  .login-card > h2 {
    font-size: 15px;
  }
}

.login-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

/* Responsive ------------------------------------------------------------- */
@media (max-width: 980px) {
  .deck {
    grid-template-columns: minmax(0, 1fr);
  }

  .deck > .create-card,
  .deck > .join-card,
  .deck > .workspace-card,
  .deck > .rail {
    grid-column: 1 / -1;
  }
}

/* Dark theme ------------------------------------------------------------- */
html.dark .hero-stat {
  background: rgba(16, 26, 43, 0.72);
  border-color: var(--nx-border);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
}

html.dark .hero-stat svg {
  color: #8fb0ef;
}

html.dark .hero-stat strong {
  color: var(--nx-ink);
}

html.dark .hero {
  background:
    radial-gradient(680px 240px at 88% -10%, rgba(52, 91, 173, 0.24), transparent 68%),
    linear-gradient(135deg, rgba(16, 26, 43, 0.96), rgba(13, 23, 39, 0.92));
  border-color: var(--nx-border);
}

html.dark .hero::before {
  background-image:
    linear-gradient(rgba(148, 178, 230, 0.05) 1px, transparent 1px),
    linear-gradient(90deg, rgba(148, 178, 230, 0.05) 1px, transparent 1px);
}

html.dark .hero-sub {
  color: var(--nx-ink-3);
}

html.dark .eyebrow {
  color: #8fb0ef;
}

html.dark .card-sub,
html.dark .card-hint {
  color: var(--nx-ink-3);
}

html.dark .deck > .create-card,
html.dark .deck > .join-card,
html.dark .deck > .workspace-card,
html.dark .deck .overview-card,
html.dark .deck :deep(.deck-card) {
  background: var(--nx-surface);
  border-color: var(--nx-border);
}

html.dark .workspace:hover {
  background: #16243a;
}

html.dark .ws-main strong {
  color: #e4ecf8;
}

html.dark .ws-main > span {
  color: #8fa2bd;
}

html.dark .ws-badge {
  color: #a9c4f2;
  background: linear-gradient(145deg, #1b2c46, #16243a);
  border-color: #2a3d5c;
}

html.dark .workspace[aria-current="true"] {
  background: #172a47;
  border-color: #2f4a73;
}

html.dark .status-pill {
  background: var(--nx-success-soft);
  border-color: #1e4a3b;
}

html.dark .status-pill[data-tone="pending"] {
  background: var(--nx-warning-soft);
  border-color: #4a3a1e;
}

html.dark .empty-state {
  background: var(--nx-surface-muted);
  border-color: var(--nx-border);
}

@media (max-width: 700px) {
  .hero-stats {
    display: none;
  }

  .deck {
    gap: 14px;
  }

  .deck > .create-card,
  .deck > .join-card,
  .deck > .workspace-card,
  .deck .overview-card,
  .deck :deep(.deck-card) {
    padding: 19px;
  }

  .overview-card :deep(dl) {
    grid-template-columns: minmax(88px, auto) minmax(0, 1fr);
  }
}

</style>

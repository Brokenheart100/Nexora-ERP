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

  <section v-if="!user" class="card login-card">
    <h2><UIcon class="heading-icon" name="i-lucide-log-in" aria-hidden="true" />{{ t('workspaces.login.title') }}</h2>
    <p>{{ t('workspaces.login.body') }}</p>
    <div class="login-actions">
      <a class="primary" href="/bff/email-login">{{ t('workspaces.login.action') }}</a>
      <a class="quiet" href="/bff/register">{{ t('workspaces.login.register') }}</a>
      <NuxtLink class="quiet" to="/pricing" data-testid="choose-plan-first">先选套餐再注册</NuxtLink>
      <a v-if="isLocalDevelopment" class="quiet" href="/bff/login">{{ t('workspaces.login.demo') }}</a>
      <UButton v-if="ssoHint" class="quiet" type="button" :disabled="loggingOut" @click="store.logout">
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
          <section class="card create-card">
            <h2><UIcon class="heading-icon" name="i-lucide-square-plus" aria-hidden="true" />{{ t('workspaces.create.title') }}</h2>
            <p class="card-sub">{{ t('workspaces.create.subtitle') }}</p>
            <form @submit.prevent="create">
              <label class="personal-option">
                <input v-model="personal" type="checkbox" :disabled="busy">
                {{ t('workspaces.create.personal') }}
              </label>
              <p class="personal-hint">{{ t('workspaces.create.personalHint') }}</p>
              <label for="name">{{ personal ? t('workspaces.create.personalName') : t('workspaces.create.companyName')
                }}</label>
              <div class="formrow">
                <UInput id="name" v-model="name" required maxlength="160" size="lg"
                  :placeholder="t('workspaces.create.namePlaceholder')" />
                <UButton type="submit" class="primary" icon="i-lucide-plus" :loading="busy" :disabled="busy">
                  {{ busy ? t('workspaces.create.busy') : t('workspaces.create.submit') }}
                </UButton>
              </div>
              <p class="hint">{{ t('workspaces.create.hint') }}</p>
            </form>
          </section>

          <section class="card join-card">
            <h2><UIcon class="heading-icon" name="i-lucide-ticket" aria-hidden="true" />{{ t('workspaces.join.title') }}</h2>
            <p class="card-sub">{{ t('workspaces.join.subtitle') }}</p>
            <form @submit.prevent="acceptInvitation">
              <label for="invitation-code">{{ t('workspaces.join.code') }}</label>
              <div class="formrow">
                <UInput id="invitation-code" v-model="invitationCode" required autocomplete="off" size="lg"
                  :placeholder="t('workspaces.join.placeholder')" />
                <UButton type="submit" class="primary" icon="i-lucide-ticket-check" :loading="accepting" :disabled="accepting">
                  {{ t('workspaces.join.submit') }}
                </UButton>
              </div>
            </form>
          </section>
          <UAlert v-if="message" role="status" aria-live="polite" class="deck-wide" :description="message" />

          <section class="card workspace-card">
            <div class="card-head">
              <h2><UIcon class="heading-icon" name="i-lucide-layers" aria-hidden="true" />{{ t('workspaces.list.title') }} <small>{{ filteredWorkspaces.length }} / {{ workspaces.length
                  }}</small></h2>
              <div class="list-tools">
                <UInput v-model="query" class="ws-search" size="sm" icon="i-lucide-search"
                  :placeholder="t('workspaces.list.search')" :aria-label="t('workspaces.list.search')" />
                <span class="card-hint">{{ t('workspaces.list.hint') }}</span>
              </div>
            </div>
            <p v-if="!workspaces.length" class="hint">{{ t('workspaces.list.empty') }}</p>
            <p v-else-if="!filteredWorkspaces.length" class="hint">{{ t('workspaces.list.noMatch') }}</p>
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
            <div class="card overview-card">
              <div class="card-head">
                <h2><UIcon class="heading-icon" name="i-lucide-gauge" aria-hidden="true" />{{ t('workspaces.overview.title') }}</h2>
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
                <p v-if="projection" class="hint">
                  {{ t('workspaces.overview.updated', {
                    time: new Date(projection.projectedAtUtc).toLocaleString(locale
                      === 'en' ? 'en-US' : 'zh-CN') }) }}
                </p>
                <UButton class="quiet" type="button" icon="i-lucide-refresh-cw" @click="store.select(selected)">{{ t('workspaces.overview.refresh')
                  }}</UButton>
                <UButton v-if="selected && !selected.isPersonal" class="quiet" type="button" icon="i-lucide-list-checks" @click="openSetup">
                  初始化向导
                </UButton>
              </template>
              <div v-else class="empty-state">
                <span class="empty-icon" aria-hidden="true"><UIcon name="i-lucide-inbox" /></span>
                <p class="hint">{{ t('workspaces.overview.empty') }}</p>
              </div>
              <WorkspaceCapabilities v-if="selected" :key="'capabilities-' + selected.id" :workspace-id="selected.id" />
            </div>
          </div>

          <AccountDeletionReview :key="user?.subject ?? 'account'" class="deck-wide" />
          <AccountSessions :key="'sessions-' + (user?.subject ?? 'account')" class="deck-wide" />
          <AccountSecurity class="deck-wide" />
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

:global(html.dark) .console-tab[aria-selected='true'] {
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
</style>

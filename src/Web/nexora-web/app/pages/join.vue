<script setup lang="ts">
import { invitationCodeSchema } from '~/utils/workspace/workspace'

const { t } = useI18n()
const store = useWorkspaceStore()
const { user, accepting } = storeToRefs(store)
const code = ref('')
const ready = ref(false)
const failed = ref(false)
const storageKey = 'nexora.pending-workspace-invitation'

onMounted(async () => {
  const fragment = window.location.hash.slice(1)
  if (fragment) {
    const invitation = invitationCodeSchema.safeParse(fragment)
    if (invitation.success) sessionStorage.setItem(storageKey, invitation.data)
    else sessionStorage.removeItem(storageKey)
    history.replaceState(history.state, '', '/join')
  }
  code.value = sessionStorage.getItem(storageKey) ?? ''
  await store.load()
  ready.value = true
})

async function join() {
  failed.value = false
  if (!await store.acceptInvitation(code.value)) {
    failed.value = true
    return
  }
  sessionStorage.removeItem(storageKey)
  await navigateTo('/')
}
</script>

<template>
  <section v-if="ready" class="invitation-card max-w-130">
    <h1>
      <UIcon class="mr-2 inline-block size-[1.08em] align-[-0.16em] text-nx-primary" name="i-lucide-mail-open"
        aria-hidden="true" />{{ t('invitation.title') }}
    </h1>
    <p v-if="!code">{{ t('invitation.missing') }}</p>
    <template v-else>
      <p>{{ t('invitation.useInvitedEmail') }}</p>
      <div class="flex flex-wrap gap-2.5">
        <UButton v-if="user" color="primary" type="button" :disabled="accepting" @click="join">
          {{ t('invitation.accept') }}
        </UButton>
        <a class="inline-flex items-center gap-1.5 whitespace-nowrap rounded-[9px] border border-nx-border bg-nx-surface px-3 py-[7px] text-[12px] font-semibold text-nx-ink-2 shadow-nx-sm transition-colors hover:border-nx-border-strong hover:bg-nx-surface-muted hover:text-nx-primary-strong"
          href="/bff/email-login?join=true">{{ user ? t('invitation.switchAccount') : t('workspaces.login.action')
          }}</a>
        <a v-if="!user"
          class="inline-flex items-center gap-1.5 whitespace-nowrap rounded-[9px] border border-nx-border bg-nx-surface px-3 py-[7px] text-[12px] font-semibold text-nx-ink-2 shadow-nx-sm transition-colors hover:border-nx-border-strong hover:bg-nx-surface-muted hover:text-nx-primary-strong"
          href="/bff/register?join=true">{{ t('workspaces.login.register') }}</a>
      </div>
      <UAlert v-if="failed" role="alert" color="error" icon="i-lucide-circle-alert"
        :description="t('status.invitationFailed')" />
    </template>
    <NuxtLink to="/">{{ t('invitation.home') }}</NuxtLink>
  </section>
</template>

<style scoped>
.invitation-card {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 12px 18px;
  align-items: center;
  padding: 17px 20px;
  margin-top: 14px;
  background: var(--nx-surface);
  border: 1px solid var(--nx-border);
  border-radius: var(--nx-radius);
  box-shadow: var(--nx-shadow-sm);
  transition: border-color 0.16s ease, box-shadow 0.16s ease;
}

.invitation-card:hover {
  border-color: #d8e1ee;
  box-shadow: var(--nx-shadow-md)
}

.invitation-card>* {
  grid-column: 1 / -1;
  min-width: 0
}

html.dark .invitation-card:hover {
  border-color: var(--nx-border-strong)
}

@media (max-width: 700px) {
  .invitation-card {
    padding: 15px 16px;
    border-radius: 14px
  }
}
</style>

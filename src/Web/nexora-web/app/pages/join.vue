<script setup lang="ts">
import { invitationCodeSchema } from '~/utils/workspace'

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
  <section v-if="ready" class="card max-w-[520px]">
    <h1><UIcon class="mr-2 inline-block size-[1.08em] align-[-0.16em] text-nx-primary" name="i-lucide-mail-open" aria-hidden="true" />{{ t('invitation.title') }}</h1>
    <p v-if="!code">{{ t('invitation.missing') }}</p>
    <template v-else>
      <p>{{ t('invitation.useInvitedEmail') }}</p>
      <div class="flex flex-wrap gap-[10px]">
        <UButton v-if="user" color="primary" type="button" :disabled="accepting" @click="join">
          {{ t('invitation.accept') }}
        </UButton>
        <a class="inline-flex items-center gap-1.5 whitespace-nowrap rounded-[9px] border border-nx-border bg-nx-surface px-3 py-[7px] text-[12px] font-semibold text-nx-ink-2 shadow-nx-sm transition-colors hover:border-nx-border-strong hover:bg-nx-surface-muted hover:text-nx-primary-strong" href="/bff/email-login?join=true">{{ user ? t('invitation.switchAccount') : t('workspaces.login.action') }}</a>
        <a v-if="!user" class="inline-flex items-center gap-1.5 whitespace-nowrap rounded-[9px] border border-nx-border bg-nx-surface px-3 py-[7px] text-[12px] font-semibold text-nx-ink-2 shadow-nx-sm transition-colors hover:border-nx-border-strong hover:bg-nx-surface-muted hover:text-nx-primary-strong" href="/bff/register?join=true">{{ t('workspaces.login.register') }}</a>
      </div>
      <UAlert v-if="failed" role="alert" color="error" icon="i-lucide-circle-alert" :description="t('status.invitationFailed')" />
    </template>
    <NuxtLink to="/">{{ t('invitation.home') }}</NuxtLink>
  </section>
</template>

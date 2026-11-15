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
  <section v-if="ready" class="card login-card">
    <h1><UIcon class="heading-icon" name="i-lucide-mail-open" aria-hidden="true" />{{ t('invitation.title') }}</h1>
    <p v-if="!code">{{ t('invitation.missing') }}</p>
    <template v-else>
      <p>{{ t('invitation.useInvitedEmail') }}</p>
      <div class="login-actions">
        <UButton v-if="user" class="primary" type="button" :disabled="accepting" @click="join">
          {{ t('invitation.accept') }}
        </UButton>
        <a class="quiet" href="/bff/email-login?join=true">{{ user ? t('invitation.switchAccount') : t('workspaces.login.action') }}</a>
        <a v-if="!user" class="quiet" href="/bff/register?join=true">{{ t('workspaces.login.register') }}</a>
      </div>
      <UAlert v-if="failed" role="alert" color="error" icon="i-lucide-circle-alert" :description="t('status.invitationFailed')" />
    </template>
    <NuxtLink to="/">{{ t('invitation.home') }}</NuxtLink>
  </section>
</template>

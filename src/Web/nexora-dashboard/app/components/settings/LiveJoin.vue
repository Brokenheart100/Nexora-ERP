<script setup lang="ts">
import { useAdministration, useAdministrationMutation } from '~/composables/settings/useAdministration'
import type { z } from 'zod'
import type { governanceChangeSchema } from '#shared/types/workspace-administration'
import { ApiFailure } from '~/utils/api/client'
import { pendingInvitationKey, parseInvitationFragment } from '#shared/utils/invitation-navigation'

const { auth, session, api } = useAdministration('account')
const mutation = useAdministrationMutation<z.infer<typeof governanceChangeSchema>>(() => auth.user?.subject ?? '')
const fragment = ref<ReturnType<typeof parseInvitationFragment>>(null)
const ready = ref(false)
const route = useRoute()

function capture() {
  const link = parseInvitationFragment(window.location.hash.slice(1))
  if (link) {
    sessionStorage.setItem(pendingInvitationKey, link.id + '.' + link.token)
    history.replaceState(history.state, '', '/join')
  }
  fragment.value = link ?? parseInvitationFragment(sessionStorage.getItem(pendingInvitationKey))
  ready.value = true
}
onMounted(capture)
watch(() => route.hash, () => {
  if (import.meta.client) capture()
})

function clear() {
  sessionStorage.removeItem(pendingInvitationKey)
  fragment.value = null
}

async function redeem() {
  const value = fragment.value
  if (!auth.user || !value) return
  await mutation.run(() => api.redeem(value.id, value.token), async (receipt) => {
    clear()
    await session.load(receipt.workspaceId)
    await navigateTo({ path: '/', query: { workspace: receipt.workspaceId } })
  })
}

const mismatch = computed(() => mutation.failure instanceof ApiFailure && [403, 409].includes(mutation.failure.status))
</script>

<template>
  <div class="max-w-xl space-y-4" data-testid="live-invitation-join">
    <USkeleton v-if="!ready || !auth.ready" class="h-24" />
    <UCard v-else>
      <template #header>
        <h2 class="font-medium">
          接受工作区邀请
        </h2>
      </template>
      <div class="space-y-4">
        <UAlert
          color="neutral"
          variant="subtle"
          icon="i-carbon-email"
          :title="auth.user ? '登录成功，当前邀请尚未接受' : '请先登录以继续处理邀请'"
          :description="auth.user ? (fragment ? '请确认当前账号与受邀邮箱一致。' : '请通过收到的邀请链接打开此页。') : '使用收到邀请的邮箱登录，登录后将回到此页。'"
          data-testid="invitation-login-status"
        />
        <div v-if="!auth.user" class="flex flex-wrap gap-2">
          <UButton to="/bff/email-login?returnTo=%2Fjoin" external label="邮箱登录" />
          <UButton
            to="/bff/register?returnTo=%2Fjoin"
            external
            label="注册"
            color="neutral"
            variant="outline"
          />
          <UButton
            to="/bff/login?returnTo=%2Fjoin"
            external
            label="账号登录"
            color="neutral"
            variant="outline"
          />
        </div>
        <div v-else-if="fragment" class="flex flex-wrap gap-2">
          <UButton
            label="接受邀请"
            :loading="mutation.busy"
            :disabled="mutation.unknown || mutation.confirmed"
            data-testid="live-invitation-redeem"
            @click="redeem"
          />
          <UButton
            v-if="mismatch"
            to="/bff/login?prompt=login&returnTo=%2Fjoin"
            external
            label="切换账号"
            color="neutral"
            variant="outline"
          />
          <UButton
            label="放弃接受"
            color="neutral"
            variant="ghost"
            :disabled="mutation.busy || mutation.unknown"
            @click="clear"
          />
        </div>
        <SettingsAdministrationStatus :state="mutation" @refresh="mutation.readCurrent(() => session.load())" @acknowledge="mutation.acknowledge" />
        <div v-if="mutation.reviewed" class="flex flex-wrap gap-2">
          <UButton
            v-for="item in session.workspaces"
            :key="item.id"
            :to="{ path: '/', query: { workspace: item.id } }"
            :label="item.name"
            color="neutral"
            variant="outline"
            @click="clear"
          />
        </div>
      </div>
    </UCard>
  </div>
</template>

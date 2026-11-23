<script setup lang="ts">
import { useAdministration, useAdministrationMutation } from '~/composables/settings/useAdministration'
import type { personalLinkSchema } from '#shared/types/workspace-administration'
import type { z } from 'zod'

defineProps<{ canManage: boolean }>()
const { session, api, owner, workspace } = useAdministration()
const links = useWorkspaceQuery('personal-links', '/settings', api.links)
const mutation = useAdministrationMutation<z.infer<typeof personalLinkSchema>>(owner)
const personal = computed(() => session.workspaces.filter(item => item.isPersonal))
const linked = (id: string) => links.data?.some(link => link.personalWorkspaceId === id && link.isLinked) === true
</script>

<template>
  <UCard data-testid="live-personal-links">
    <template #header>
      <p class="font-medium">
        个人账本链接
      </p>
    </template>
    <div class="space-y-3">
      <SettingsAdministrationQueryState :query="links" />
      <template v-if="links.data">
        <p v-if="!personal.length" class="text-sm text-muted">
          可从工作区菜单创建个人工作区。
        </p>
        <div v-for="item in personal" :key="item.id" class="flex flex-wrap items-center justify-between gap-2 border-b border-default py-2">
          <span>{{ item.name }}</span>
          <UButton
            v-if="canManage || linked(item.id)"
            color="neutral"
            variant="outline"
            size="sm"
            :label="linked(item.id) ? '解除链接' : '链接'"
            :disabled="mutation.unknown || mutation.busy"
            @click="mutation.run(() => api.personalLink(workspace(), item.id, !linked(item.id)), links.refresh)"
          />
        </div>
      </template>
      <SettingsAdministrationStatus :state="mutation" @refresh="mutation.readCurrent(links.refresh)" @acknowledge="mutation.acknowledge" />
    </div>
  </UCard>
</template>

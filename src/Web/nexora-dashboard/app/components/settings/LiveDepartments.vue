<script setup lang="ts">
import { useAdministration, useAdministrationMutation, useAdministrationVersion } from '~/composables/settings/useAdministration'
import type { WireDepartment } from '#shared/types/wire'

const { api, owner, workspace, allows } = useAdministration()
const departments = useWorkspaceQuery('workspace-departments', '/settings', api.departments)
const revision = useAdministrationVersion()
const mutation = useAdministrationMutation<WireDepartment>(owner)
const name = ref('')
watch(owner, () => {
  name.value = ''
}, { flush: 'sync' })

async function refresh() {
  await Promise.all([departments.refresh(), revision.refresh()])
  if (!departments.data || !revision.data) throw new Error(departments.problem || revision.problem || '读取部门失败。')
}

function add() {
  const version = revision.data?.authorizationVersion
  if (!name.value.trim() || version === undefined) return
  return mutation.run(() => api.addDepartment(workspace(), version, name.value.trim()), async () => {
    name.value = ''
    await Promise.all([departments.refresh(), revision.refresh()])
  })
}
</script>

<template>
  <div class="space-y-4" data-testid="live-departments">
    <SettingsAdministrationQueryState :query="departments" />
    <SettingsAdministrationQueryState v-if="revision.problem" :query="revision" />
    <UCard v-if="departments.data">
      <template #header>
        <p class="font-medium">
          工作区部门
        </p>
      </template>
      <div class="space-y-4">
        <form v-if="allows('business-roles.manage')" class="flex flex-wrap items-end gap-2" @submit.prevent="add">
          <UFormField label="部门名称" required>
            <UInput
              v-model="name"
              required
              maxlength="80"
              data-testid="live-department-name"
            />
          </UFormField>
          <UButton
            type="submit"
            label="创建部门"
            :loading="mutation.busy"
            :disabled="!name.trim() || !revision.data || mutation.unknown"
            data-testid="live-department-create"
          />
        </form>
        <SettingsAdministrationStatus :state="mutation" @refresh="mutation.readCurrent(refresh)" @acknowledge="mutation.acknowledge" />
        <ul v-if="departments.data.length" class="divide-y divide-default">
          <li v-for="item in departments.data" :key="item.id" class="py-2 text-sm">
            {{ item.name }}
          </li>
        </ul>
        <UEmpty v-else icon="i-carbon-tree-view-alt" title="当前工作区没有部门" />
      </div>
    </UCard>
  </div>
</template>

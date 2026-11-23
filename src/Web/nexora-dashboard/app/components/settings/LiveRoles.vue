<script setup lang="ts">
import { useAdministration, useAdministrationMutation, useAdministrationVersion } from '~/composables/settings/useAdministration'
import type { CustomRole } from '#shared/types/workspace-administration'
import { roleName } from '~/utils/organization/governance'

const { api, owner, workspace, allows } = useAdministration()
const catalog = useWorkspaceQuery('custom-roles', '/settings', api.customRoles)
const roles = useWorkspaceQuery('administration-roles', '/settings', (id, signal) => allows('roles.assign') ? api.roles(id, signal) : Promise.resolve(null))
const version = useAdministrationVersion()
const mutation = useAdministrationMutation<CustomRole>(owner)
const selected = ref('')
const draft = reactive({ name: '', permissions: [] as string[] })
const canManage = computed(() => allows('business-roles.manage'))

function edit(role?: CustomRole) {
  selected.value = role?.id ?? ''
  draft.name = role?.name ?? ''
  draft.permissions = role ? [...role.permissions] : []
}
watch(owner, () => edit(), { flush: 'sync' })

async function refresh() {
  await Promise.all([catalog.refresh(), version.refresh()])
  if (!catalog.data || !version.data) throw new Error(catalog.problem || version.problem || '读取角色失败。')
}

function save() {
  const revision = version.data?.authorizationVersion
  if (revision === undefined || !draft.name.trim() || !draft.permissions.length) return
  return mutation.run(() => api.saveCustomRole(workspace(), revision, { roleId: selected.value || null, name: draft.name.trim(), permissions: draft.permissions }), async (role) => {
    edit(role)
    await Promise.all([catalog.refresh(), version.refresh()])
  })
}
</script>

<template>
  <div class="space-y-4" data-testid="live-roles">
    <SettingsAdministrationQueryState :query="catalog" />
    <SettingsAdministrationQueryState v-if="roles.problem" :query="roles" />
    <SettingsAdministrationQueryState v-if="version.problem" :query="version" />
    <UCard v-if="catalog.data">
      <template #header>
        <div class="flex flex-wrap items-center justify-between gap-2">
          <p class="font-medium">
            自定义角色
          </p>
          <UButton
            v-if="canManage"
            label="新建角色"
            color="neutral"
            variant="outline"
            size="sm"
            :disabled="mutation.busy || mutation.unknown"
            @click="edit()"
          />
        </div>
      </template>
      <div class="space-y-4">
        <ul v-if="catalog.data.roles.length" class="divide-y divide-default">
          <li v-for="role in catalog.data.roles" :key="role.id" class="flex flex-wrap items-start justify-between gap-2 py-2">
            <div>
              <p class="text-sm font-medium">
                {{ role.name }} · 版本 {{ role.revision }}
              </p><p class="break-all text-xs text-muted">
                {{ role.permissions.join(' · ') }}
              </p>
            </div>
            <UButton
              v-if="canManage"
              label="修订"
              size="sm"
              color="neutral"
              variant="outline"
              :disabled="mutation.unknown || mutation.busy"
              :data-testid="'live-role-edit-' + role.id"
              @click="edit(role)"
            />
          </li>
        </ul>
        <p v-else class="text-sm text-muted">
          当前工作区没有自定义角色。
        </p>
        <form v-if="canManage" class="space-y-3" @submit.prevent="save">
          <UFormField :label="selected ? '修订角色名称' : '新角色名称'" required>
            <UInput
              v-model="draft.name"
              required
              maxlength="80"
              data-testid="live-role-name"
            />
          </UFormField>
          <UFormField label="可委派权限" required>
            <UCheckboxGroup v-model="draft.permissions" :items="catalog.data.permissions.map(permission => ({ label: permission.code, value: permission.code, description: permission.scopes.join(' · ') }))" :disabled="mutation.unknown || mutation.busy" />
          </UFormField>
          <UButton
            type="submit"
            :label="selected ? '保存新版本' : '创建角色'"
            :loading="mutation.busy"
            :disabled="!draft.name.trim() || !draft.permissions.length || !version.data || mutation.unknown"
            data-testid="live-role-save"
          />
        </form>
        <SettingsAdministrationStatus :state="mutation" @refresh="mutation.readCurrent(refresh)" @acknowledge="mutation.acknowledge" />
      </div>
    </UCard>
    <UCard v-if="roles.data">
      <template #header>
        <p class="font-medium">
          内置角色
        </p>
      </template>
      <div class="grid gap-3 sm:grid-cols-2">
        <details v-for="role in roles.data" :key="role.code" class="text-sm">
          <summary class="cursor-pointer">
            {{ roleName(role.code) }}
          </summary>
          <p class="mt-2 break-all text-xs text-muted">
            {{ role.permissions.join(' · ') }}
          </p>
        </details>
      </div>
    </UCard>
  </div>
</template>

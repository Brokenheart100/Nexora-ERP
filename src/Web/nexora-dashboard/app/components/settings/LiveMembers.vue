<script setup lang="ts">
import { useAdministration, useAdministrationMutation, useAdministrationVersion } from '~/composables/settings/useAdministration'
import type { TableColumn } from '@nuxt/ui'
import type { z } from 'zod'
import type { governanceChangeSchema, OrganizationMember } from '#shared/types/workspace-administration'
import { executionAreas, organizationRoleChoices, roleName } from '~/utils/organization/governance'
import { administrationPageSize } from '~/composables/api/useWorkspaceAdministration'

const { session, api, owner, workspace, allows } = useAdministration()
const page = ref(1)
const members = useWorkspaceQuery('administration-members', '/settings', (id, signal) => api.members(id, page.value, signal), () => page.value)
const roles = useWorkspaceQuery('administration-roles', '/settings', (id, signal) => allows('roles.assign') ? api.roles(id, signal) : Promise.resolve(null))
const revision = useAdministrationVersion()
const mutation = useAdministrationMutation<z.infer<typeof governanceChangeSchema>>(owner)
const selectedId = ref('')
const selected = computed(() => members.data?.find(member => member.id === selectedId.value))
const modalOpen = ref(false)
const draft = reactive({ role: 'WorkspaceReader', isActive: true })
const proposed = ref<Record<string, string>>({})
const assigning = computed(() => allows('roles.assign'))
const managing = computed(() => allows('business-roles.manage'))
const ownerRole = computed(() => session.access?.role === 'WorkspaceOwner')
const columns: TableColumn<OrganizationMember>[] = [
  { id: 'member', header: '成员' }, { id: 'role', header: '组织角色' }, { id: 'active', header: '状态' }, { id: 'actions', header: '' }
]
const blocked = computed(() => mutation.busy || mutation.unknown || !revision.data)

function open(member: OrganizationMember) {
  selectedId.value = member.id
  draft.role = member.role
  draft.isActive = member.isActive
  proposed.value = Object.fromEntries(executionAreas.map(area => [area.id, member[area.current] ?? '']))
  modalOpen.value = true
}

watch(owner, () => {
  page.value = 1
  selectedId.value = ''
  modalOpen.value = false
  proposed.value = {}
}, { flush: 'sync' })

async function refresh() {
  await Promise.all([members.refresh(), revision.refresh()])
  if (!members.data || !revision.data) throw new Error(members.problem || revision.problem || '读取成员或授权版本失败。')
}

async function change(body: Record<string, unknown>, area?: 'business-roles' | (typeof executionAreas)[number]['id']) {
  const member = selected.value
  const version = revision.data?.authorizationVersion
  if (!member || version === undefined || blocked.value) return
  await mutation.run(() => api.memberChange(workspace(), member.id, version, body, area), async () => {
    if (member.id === session.access?.memberId) await session.refreshAccess()
    else await Promise.all([members.refresh(), revision.refresh()])
  })
}

function submitBusiness() {
  return change({ action: 'submit', businessRoles: Object.values(proposed.value).filter(Boolean) }, 'business-roles')
}
</script>

<template>
  <div class="space-y-4" data-testid="live-members">
    <SettingsAdministrationQueryState :query="members" />
    <SettingsAdministrationQueryState v-if="roles.problem" :query="roles" />
    <SettingsAdministrationQueryState v-if="revision.problem" :query="revision" />
    <UCard v-if="members.data">
      <UTable :data="members.data" :columns="columns" empty="当前页没有成员">
        <template #member-cell="{ row }">
          {{ row.original.email || row.original.subject }}
        </template>
        <template #role-cell="{ row }">
          {{ roleName(row.original.role) }}
        </template>
        <template #active-cell="{ row }">
          <UBadge :color="row.original.isActive ? 'success' : 'neutral'" variant="subtle" :label="row.original.isActive ? '在用' : '已停用'" />
        </template>
        <template #actions-cell="{ row }">
          <UButton
            label="查看成员"
            size="sm"
            color="neutral"
            variant="outline"
            :data-testid="'live-member-' + row.original.id"
            @click="open(row.original)"
          />
        </template>
      </UTable>
      <template #footer>
        <div class="flex items-center gap-2">
          <UButton
            label="上一页"
            size="sm"
            color="neutral"
            variant="outline"
            :disabled="page === 1"
            @click="page--"
          />
          <span class="text-sm text-muted">第 {{ page }} 页</span>
          <UButton
            label="下一页"
            size="sm"
            color="neutral"
            variant="outline"
            :disabled="members.data.length < administrationPageSize"
            @click="page++"
          />
        </div>
      </template>
    </UCard>
    <USlideover v-model:open="modalOpen" :title="selected?.email || selected?.subject || '成员详情'" :dismissible="!mutation.busy && !mutation.unknown">
      <template #body>
        <div v-if="selected" class="space-y-6">
          <SettingsAdministrationStatus :state="mutation" @refresh="mutation.readCurrent(refresh)" @acknowledge="mutation.acknowledge" />
          <form v-if="assigning" class="space-y-3" @submit.prevent="change({ ...draft })">
            <UFormField label="组织角色">
              <USelect v-model="draft.role" :items="organizationRoleChoices(roles.data, ownerRole || selected.role === 'WorkspaceOwner')" class="w-full" />
            </UFormField>
            <USwitch v-model="draft.isActive" label="启用成员" data-testid="live-member-active" />
            <UButton
              type="submit"
              label="保存成员"
              :loading="mutation.busy"
              :disabled="blocked"
              data-testid="live-member-save"
            />
          </form>
          <div v-else class="text-sm">
            {{ roleName(selected.role) }} · {{ selected.isActive ? '在用' : '已停用' }}
          </div>
          <USeparator label="业务角色" />
          <div v-for="area in executionAreas" :key="area.id" class="space-y-2 border-b border-default pb-3">
            <p class="text-sm font-medium">
              {{ area.label }} · {{ roleName(selected[area.current]) }}
            </p>
            <p v-if="selected[area.proposed]" class="text-xs text-muted">
              待批准 {{ roleName(selected[area.proposed]) }}
            </p>
            <div v-if="selected.isActive && allows(area.permission)" class="flex flex-wrap gap-2">
              <UButton
                v-if="proposed[area.id]"
                label="提交单项申请"
                variant="outline"
                size="sm"
                :disabled="blocked"
                @click="change({ action: 'propose', role: proposed[area.id] }, area.id)"
              />
              <UButton
                v-if="selected[area.proposed] && selected.id !== session.access?.memberId"
                label="批准单项"
                size="sm"
                :disabled="blocked"
                @click="change({ action: 'approve' }, area.id)"
              />
              <UButton
                v-if="selected[area.current] || selected[area.proposed]"
                label="撤销单项"
                color="neutral"
                variant="outline"
                size="sm"
                :disabled="blocked"
                @click="change({ action: 'revoke' }, area.id)"
              />
            </div>
          </div>
          <SettingsExecutionRoleFields v-if="managing || executionAreas.some(area => allows(area.permission))" v-model="proposed" :roles="roles.data" />
          <template v-if="managing && selected.isActive">
            <p v-if="selected.proposedBusinessRoles" class="text-sm text-muted">
              组合申请 · {{ selected.proposedBusinessRoles.map(roleName).join('、') || '清空业务角色' }} · {{ selected.businessRoleProposalExpiresAtUtc || '' }}
            </p>
            <div class="flex flex-wrap gap-2">
              <UButton label="提交组合申请" :disabled="blocked" @click="submitBusiness" />
              <UButton
                v-if="selected.proposedBusinessRoles && selected.businessRoleProposerId !== session.access?.memberId && selected.id !== session.access?.memberId"
                label="批准组合申请"
                :disabled="blocked"
                @click="change({ action: 'approve' }, 'business-roles')"
              />
              <UButton
                v-if="selected.proposedBusinessRoles"
                label="取消组合申请"
                color="neutral"
                variant="outline"
                :disabled="blocked"
                @click="change({ action: 'cancel' }, 'business-roles')"
              />
            </div>
          </template>
        </div>
      </template>
    </USlideover>
  </div>
</template>

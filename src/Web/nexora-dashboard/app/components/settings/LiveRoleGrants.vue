<script setup lang="ts">
import { useAdministration, useAdministrationMutation, useAdministrationVersion } from '~/composables/settings/useAdministration'
import { z } from 'zod'
import type { RoleGrant } from '#shared/types/workspace-administration'

const { api, owner, workspace, allows, session } = useAdministration()
const inventory = useInventoryApi()
const version = useAdministrationVersion()
const catalog = useWorkspaceQuery('custom-roles', '/settings', api.customRoles)
const grants = useWorkspaceQuery('custom-role-grants', '/settings', api.grants)
const members = useWorkspaceQuery('role-grant-members', '/settings', (id, signal) => api.members(id, undefined, signal))
const departments = useWorkspaceQuery('workspace-departments', '/settings', api.departments)
const draft = reactive({ member: '', role: '', scope: '', scopeId: '', startsOn: '', endsOn: '' })
const warehouses = useWorkspaceQuery('role-grant-warehouses', '/settings', (id, signal) => draft.scope === 'warehouse' ? inventory.warehouses(id, signal) : Promise.resolve(null), () => draft.scope === 'warehouse')
const mutation = useAdministrationMutation<RoleGrant>(owner)
const last = ref<RoleGrant | null>(null)
const canManage = computed(() => allows('business-roles.manage'))
const role = computed(() => catalog.data?.roles.find(value => value.id === draft.role))
const scopeNames: Record<string, string> = { company: '公司', department: '部门', warehouse: '仓库', period: '会计期间' }
const stateNames: Record<string, string> = { Pending: '待批准', Active: '已批准', Expired: '已过期', Revoked: '已撤销' }
const scopes = computed(() => role.value
  ? Object.entries(scopeNames).filter(([scope]) => role.value!.permissions.every(code =>
      catalog.data?.permissions.some(permission => permission.code === code && permission.scopes.includes(scope))))
      .map(([value, label]) => ({ value, label }))
  : [])
const resources = computed(() => (draft.scope === 'warehouse' ? warehouses.data?.warehouses : departments.data) ?? [])
const blocked = computed(() => mutation.busy || mutation.unknown || !version.data)
const memberName = (id: string) => members.data?.find(member => member.id === id)?.email || members.data?.find(member => member.id === id)?.subject || id
const grantRole = (id: string) => catalog.data?.roles.find(r => r.id === id)?.name ?? id
const canApprove = (grant: RoleGrant) => !!session.access?.memberId && grant.state === 'Pending'
  && ![grant.memberId, grant.requestedBy, grant.firstApprovedBy].includes(session.access.memberId)
const resourceNeeded = computed(() => draft.scope === 'department' || draft.scope === 'warehouse')
const validDates = computed(() => draft.scope !== 'period' || (z.iso.date().safeParse(draft.startsOn).success
  && z.iso.date().safeParse(draft.endsOn).success && draft.startsOn <= draft.endsOn))
const valid = computed(() => draft.member && role.value && scopes.value.some(item => item.value === draft.scope)
  && (!resourceNeeded.value || resources.value.some(item => item.id === draft.scopeId)) && validDates.value)

watch(() => draft.role, () => {
  draft.scope = ''
})
watch(() => draft.scope, () => {
  draft.scopeId = ''
  draft.startsOn = ''
  draft.endsOn = ''
})
watch(owner, () => {
  Object.assign(draft, { member: '', role: '', scope: '', scopeId: '', startsOn: '', endsOn: '' })
  last.value = null
}, { flush: 'sync' })

async function refresh() {
  await Promise.all([grants.refresh(), version.refresh(), catalog.refresh(), members.refresh(), departments.refresh()])
  if (!grants.data || !version.data || !catalog.data) throw new Error(grants.problem || version.problem || catalog.problem || '读取授权失败。')
}

async function updated(grant: RoleGrant) {
  last.value = grant
  if (grant.memberId === session.access?.memberId && grant.state !== 'Pending') await session.refreshAccess()
  else await Promise.all([grants.refresh(), version.refresh()])
}

function request() {
  if (!valid.value || !role.value || !version.data) return
  const revision = version.data.authorizationVersion
  const body = { memberId: draft.member, roleId: role.value.id, roleRevision: role.value.revision, scope: draft.scope,
    scopeId: resourceNeeded.value ? draft.scopeId : null, startsOn: draft.startsOn || null, endsOn: draft.endsOn || null }
  return mutation.run(() => api.grant(workspace(), revision, body), updated)
}

function decide(grant: RoleGrant, action: 'approve' | 'revoke') {
  const revision = version.data?.authorizationVersion
  if (revision === undefined) return
  return mutation.run(() => api.decideGrant(workspace(), grant.id, revision, action), updated)
}
</script>

<template>
  <div class="space-y-4" data-testid="live-role-grants">
    <SettingsAdministrationQueryState :query="grants" />
    <SettingsAdministrationQueryState v-for="(query, index) in [catalog, members, version, departments, warehouses].filter(item => item.problem)" :key="index" :query="query" />
    <UCard v-if="canManage && catalog.data && members.data">
      <template #header>
        <p class="font-medium">
          申请范围授权
        </p>
      </template>
      <form class="space-y-3" @submit.prevent="request">
        <div class="grid gap-3 sm:grid-cols-2">
          <UFormField label="成员" required>
            <USelectMenu
              v-model="draft.member"
              value-key="value"
              :items="members.data.filter(item => item.isActive && item.id !== session.access?.memberId).map(item => ({ value: item.id, label: item.email || item.subject }))"
              placeholder="选择成员"
              class="w-full"
              data-testid="live-grant-member"
            />
          </UFormField>
          <UFormField label="角色版本" required>
            <USelect
              v-model="draft.role"
              :items="catalog.data.roles.map(item => ({ value: item.id, label: item.name + ' · 版本 ' + item.revision }))"
              placeholder="选择角色"
              class="w-full"
              data-testid="live-grant-role"
            />
          </UFormField>
          <UFormField label="授权范围" required>
            <USelect
              v-model="draft.scope"
              :items="scopes"
              :disabled="!role"
              placeholder="选择范围"
              class="w-full"
              data-testid="live-grant-scope"
            />
          </UFormField>
          <UFormField v-if="resourceNeeded" :label="scopeNames[draft.scope]" required>
            <USelect
              v-model="draft.scopeId"
              :items="resources.map(item => ({ value: item.id, label: item.name }))"
              placeholder="选择资源"
              class="w-full"
              data-testid="live-grant-resource"
            />
          </UFormField>
          <template v-if="draft.scope === 'period'">
            <UFormField label="起始日期" required>
              <UInput
                v-model="draft.startsOn"
                type="date"
                required
                data-testid="live-grant-start"
              />
            </UFormField>
            <UFormField label="结束日期" required>
              <UInput
                v-model="draft.endsOn"
                type="date"
                required
                data-testid="live-grant-end"
              />
            </UFormField>
          </template>
        </div>
        <UButton
          type="submit"
          label="提交授权申请"
          :disabled="!valid || blocked"
          :loading="mutation.busy"
          data-testid="live-grant-submit"
        />
      </form>
    </UCard>
    <SettingsAdministrationStatus :state="mutation" @refresh="mutation.readCurrent(refresh)" @acknowledge="mutation.acknowledge" />
    <UAlert
      v-if="last?.state === 'Revoked'"
      color="success"
      variant="subtle"
      :title="grantRole(last.roleId) + ' 的授权已撤销'"
    />
    <UCard v-if="grants.data">
      <template #header>
        <p class="font-medium">
          范围授权
        </p>
      </template>
      <ul v-if="grants.data.length" class="divide-y divide-default">
        <li
          v-for="item in grants.data"
          :key="item.id"
          class="flex flex-wrap items-start justify-between gap-3 py-3"
          :data-testid="'live-grant-' + item.id"
        >
          <div class="min-w-0 space-y-1">
            <p class="text-sm font-medium">
              {{ grantRole(item.roleId) }} · 版本 {{ item.roleRevision }} · {{ memberName(item.memberId) }}
            </p>
            <p class="break-all text-xs text-muted">
              {{ scopeNames[item.scope] ?? item.scope }}{{ item.scopeId ? ' · ' + (departments.data?.find(resource => resource.id === item.scopeId)?.name ?? warehouses.data?.warehouses.find(resource => resource.id === item.scopeId)?.name ?? item.scopeId) : '' }}{{ item.startsOn ? ' · ' + item.startsOn + ' 至 ' + item.endsOn : '' }}
            </p>
            <p class="text-xs text-muted">
              {{ stateNames[item.state] ?? item.state }} · 已批准 {{ item.approvalCount }}/{{ item.requiredApprovals }}<template v-if="item.state === 'Pending'">
                · 申请有效期至 {{ item.expiresAtUtc }}
              </template>
            </p>
            <p class="break-all text-xs text-muted">
              {{ item.permissions.join(' · ') }}
            </p>
          </div>
          <div v-if="canManage" class="flex gap-2">
            <UButton
              v-if="canApprove(item)"
              size="sm"
              label="批准授权"
              :disabled="blocked"
              @click="decide(item, 'approve')"
            />
            <UButton
              v-if="['Pending', 'Active'].includes(item.state)"
              size="sm"
              color="error"
              variant="outline"
              label="撤销授权"
              :disabled="blocked"
              @click="decide(item, 'revoke')"
            />
          </div>
        </li>
      </ul>
      <UEmpty v-else icon="i-carbon-user-role" title="当前工作区没有范围授权" />
    </UCard>
  </div>
</template>

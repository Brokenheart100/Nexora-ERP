<script setup lang="ts">
import { useAdministration, useAdministrationMutation, useAdministrationVersion } from '~/composables/settings/useAdministration'
import type { TableColumn } from '@nuxt/ui'
import type { InvitationReceipt, OrganizationInvitation } from '#shared/types/workspace-administration'
import { administrationPageSize } from '~/composables/api/useWorkspaceAdministration'
import { inviteStateLabel, organizationRoleChoices, roleName } from '~/utils/organization/governance'
import { parseInvitationFragment } from '#shared/utils/invitation-navigation'

const { api, session, owner, workspace, allows } = useAdministration()
const toast = useToast()
const revision = useAdministrationVersion()
const page = ref(1)
const selected = ref('')
const invitations = useWorkspaceQuery('workspace-invitations', '/settings', (id, signal) => api.invites(id, page.value, signal), () => page.value)
const detail = useWorkspaceQuery('workspace-invitation', '/settings', (id, signal) => selected.value ? api.invitation(id, selected.value, signal) : Promise.resolve(null), () => selected.value)
const roles = useWorkspaceQuery('administration-roles', '/settings', (id, signal) => allows('roles.assign') ? api.roles(id, signal) : Promise.resolve(null))
const mutation = useAdministrationMutation<unknown>(owner)
const email = ref('')
const role = ref('WorkspaceReader')
const businessRoles = ref<Record<string, string>>({})
const receipt = ref<InvitationReceipt | null>(null)
const blocked = computed(() => mutation.busy || mutation.unknown || !revision.data)
const columns: TableColumn<OrganizationInvitation>[] = [
  { accessorKey: 'email', header: '邮箱' }, { id: 'role', header: '角色' }, { id: 'state', header: '状态' }, { id: 'actions', header: '' }
]

function show(id: string) {
  if (receipt.value?.invitation.id !== id) receipt.value = null
  selected.value = id
}
watch(owner, () => {
  page.value = 1
  selected.value = ''
  receipt.value = null
  email.value = ''
  businessRoles.value = {}
  role.value = 'WorkspaceReader'
}, { flush: 'sync' })

async function refresh() {
  await Promise.all([invitations.refresh(), revision.refresh(), detail.refresh()])
  if (!invitations.data || !revision.data || (selected.value && !detail.data)) throw new Error(invitations.problem || revision.problem || detail.problem || '读取邀请失败。')
}

async function handleReceipt(value: unknown) {
  const result = value as InvitationReceipt
  receipt.value = result
  selected.value = result.invitation.id
  email.value = ''
  await Promise.all([invitations.refresh(), detail.refresh(), revision.refresh()])
}

function send() {
  const version = revision.data?.authorizationVersion
  if (version === undefined || !email.value.trim()) return
  receipt.value = null
  return mutation.run(() => api.invite(workspace(), version, {
    email: email.value.trim(), role: role.value, businessRoles: Object.values(businessRoles.value).filter(Boolean)
  }), handleReceipt)
}

function decide(action: 'approve' | 'revoke') {
  const invitation = detail.data
  const version = revision.data?.authorizationVersion
  if (!invitation || version === undefined) return
  receipt.value = null
  return action === 'approve'
    ? mutation.run(() => api.approveInvitation(workspace(), invitation.id, version), handleReceipt)
    : mutation.run(() => api.revokeInvitation(workspace(), invitation.id, version), () => Promise.all([invitations.refresh(), detail.refresh(), revision.refresh()]))
}

async function copyLink() {
  if (!receipt.value) return
  const value = receipt.value.invitation.id + '.' + receipt.value.token
  if (!parseInvitationFragment(value)) return
  try {
    await navigator.clipboard.writeText(location.origin + '/join#' + value)
    toast.add({ title: '已复制邀请链接', color: 'success' })
  } catch {
    toast.add({ title: '复制失败，请使用邀请邮件中的链接。', color: 'warning' })
  }
}
</script>

<template>
  <div class="space-y-4" data-testid="live-invitations">
    <SettingsAdministrationQueryState :query="invitations" />
    <SettingsAdministrationQueryState v-if="revision.problem" :query="revision" />
    <SettingsAdministrationStatus :state="mutation" @refresh="mutation.readCurrent(refresh)" @acknowledge="mutation.acknowledge" />
    <UCard v-if="invitations.data && allows('members.invite')">
      <template #header>
        <p class="font-medium">
          发送邀请
        </p>
      </template>
      <form class="space-y-3" @submit.prevent="send">
        <div class="grid gap-3 sm:grid-cols-2">
          <UFormField label="受邀邮箱" required>
            <UInput
              v-model="email"
              type="email"
              required
              maxlength="254"
              class="w-full"
              data-testid="live-invitation-email"
            />
          </UFormField>
          <UFormField label="组织角色" required>
            <USelect
              v-model="role"
              :items="organizationRoleChoices(roles.data, session.access?.role === 'WorkspaceOwner')"
              class="w-full"
              data-testid="live-invitation-role"
            />
          </UFormField>
        </div>
        <SettingsExecutionRoleFields v-if="allows('business-roles.manage')" v-model="businessRoles" :roles="roles.data" />
        <UButton
          type="submit"
          label="创建邀请"
          :disabled="blocked || !email.trim()"
          :loading="mutation.busy"
          data-testid="live-invitation-create"
        />
      </form>
    </UCard>
    <UCard v-if="invitations.data">
      <UTable :data="invitations.data" :columns="columns" empty="当前页没有邀请">
        <template #role-cell="{ row }">
          {{ roleName(row.original.role) }}
        </template>
        <template #state-cell="{ row }">
          <UBadge :label="inviteStateLabel(row.original.state)" color="neutral" variant="subtle" />
        </template>
        <template #actions-cell="{ row }">
          <UButton
            label="查看邀请"
            color="neutral"
            variant="outline"
            size="sm"
            :disabled="mutation.busy || mutation.unknown"
            :data-testid="'live-invitation-' + row.original.id"
            @click="show(row.original.id)"
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
            :disabled="invitations.data.length < administrationPageSize"
            @click="page++"
          />
        </div>
      </template>
    </UCard>
    <SettingsAdministrationQueryState v-if="selected" :query="detail" />
    <UCard v-if="detail.data" data-testid="live-invitation-detail">
      <template #header>
        <p class="font-medium">
          {{ detail.data.email }}
        </p>
      </template>
      <div class="space-y-3">
        <p class="text-sm">
          {{ inviteStateLabel(detail.data.state) }} · {{ roleName(detail.data.role) }}
        </p>
        <p class="text-sm text-muted">
          有效期至 {{ detail.data.expiresAtUtc }}
        </p>
        <p v-if="detail.data.businessRoles?.length" class="text-sm text-muted">
          业务角色 {{ detail.data.businessRoles.map(roleName).join('、') }}
        </p>
        <p v-if="receipt?.mailStatus" class="text-sm" data-testid="live-invitation-mail-status">
          {{ receipt.mailStatus === 'Sent' ? '邀请邮件已发送' : receipt.mailStatus === 'Unknown' ? '邮件发送结果待确认' : '邮件发送未完成，可复制邀请链接' }}
        </p>
        <div class="flex flex-wrap gap-2">
          <UButton
            v-if="receipt?.token && detail.data.state === 'Pending'"
            label="复制邀请链接"
            color="neutral"
            variant="outline"
            size="sm"
            @click="copyLink"
          />
          <UButton
            v-if="detail.data.state === 'PendingApproval' && allows('business-roles.manage') && detail.data.inviterMemberId !== session.access?.memberId"
            label="批准邀请"
            size="sm"
            :disabled="blocked"
            data-testid="live-invitation-approve"
            @click="decide('approve')"
          />
          <UButton
            v-if="['Pending', 'PendingApproval'].includes(detail.data.state) && allows('invitations.revoke')"
            label="撤销邀请"
            color="error"
            variant="outline"
            size="sm"
            :disabled="blocked"
            data-testid="live-invitation-revoke"
            @click="decide('revoke')"
          />
        </div>
      </div>
    </UCard>
  </div>
</template>

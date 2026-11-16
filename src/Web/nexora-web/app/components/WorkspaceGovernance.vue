<script setup lang="ts">
import type { WorkspaceAccess, WorkspaceInvitation, WorkspaceMember, WorkspaceRole } from '~/utils/workspaceGovernance'

type IssuedInvitation = { invitation: WorkspaceInvitation; token: string; mailStatus?: string }

const props = defineProps<{ workspaceId: string }>()
const store = useWorkspaceStore()
const base = `/bff/api/workspaces/${props.workspaceId}`
const access = shallowRef<WorkspaceAccess | null>(null)
const members = shallowRef<WorkspaceMember[]>([])
const invitations = shallowRef<WorkspaceInvitation[]>([])
const businessRoles = shallowRef<WorkspaceRole[]>([])
const email = ref('')
const role = ref('WorkspaceReader')
const selection = ref<string[]>([])
const code = ref('')
const busy = ref(true)
const notice = ref('')
const invitationStates: Record<string, string> = {
  PendingApproval: '待审批', Pending: '待兑换', Accepted: '已加入', Revoked: '已撤销', Expired: '已过期',
}
const can = (permission: string) => access.value?.permissions.includes(permission) ?? false
const isOwner = computed(() => access.value?.role === 'WorkspaceOwner')
const canManageBusinessRoles = computed(() => can('organization.business-roles.manage'))
const availableRoles = computed(() => isOwner.value
  ? ['WorkspaceOwner', 'AccessAdministrator', 'WorkspaceReader'] : ['WorkspaceReader'])
const availableRoleOptions = computed(() =>
  availableRoles.value.map(code => ({ label: workspaceRoleName(code), value: code })))
const lastOwner = (member: WorkspaceMember) => member.isActive && member.role === 'WorkspaceOwner'
  && members.value.filter(item => item.isActive && item.role === 'WorkspaceOwner').length === 1
const canEdit = (member: WorkspaceMember) =>
  can('organization.roles.assign') && (isOwner.value || member.role === 'WorkspaceReader')
let invitationIntent: { operationId: string; fingerprint: string } | undefined

async function refresh() {
  try {
    access.value = await $fetch<WorkspaceAccess>(base + '/access', { retry: 0 })
    const [currentMembers, currentInvitations, catalog] = await Promise.all([
      can('organization.members.read') ? $fetch<WorkspaceMember[]>(base + '/members', { retry: 0 }) : [],
      can('organization.members.invite') ? $fetch<WorkspaceInvitation[]>(base + '/invitations', { retry: 0 }) : [],
      canManageBusinessRoles.value ? loadWorkspaceRoleCatalog(props.workspaceId) : [],
    ])
    members.value = currentMembers
    invitations.value = currentInvitations
    businessRoles.value = catalog.filter(item => item.area)
    if (!canManageBusinessRoles.value) selection.value = []
    if (!availableRoles.value.includes(role.value)) role.value = 'WorkspaceReader'
    if (!can('organization.members.invite')) code.value = ''
  } catch (error) {
    access.value = null
    members.value = []
    invitations.value = []
    businessRoles.value = []
    code.value = ''
    throw error
  }
}

async function write<T>(path: string, body: object): Promise<T> {
  const expectedVersion = access.value!.authorizationVersion
  const csrf = await $fetch<{ requestToken: string }>('/bff/antiforgery', { retry: 0 })
  return $fetch<T>(base + path, {
    method: 'POST', body: { ...body, expectedVersion }, headers: { 'X-CSRF-TOKEN': csrf.requestToken }, retry: 0,
  })
}

async function run(action?: () => Promise<void>) {
  busy.value = true
  notice.value = ''
  try {
    if (action) await action()
    await refresh()
  } catch {
    if (action) {
      try { await refresh() } catch { /* Clear privileged data when access is lost. */ }
    }
    notice.value = '操作未完成或尚未确认。请核对当前成员、邀请状态和你的权限。'
  } finally {
    busy.value = false
  }
}

function showInvitation(result: IssuedInvitation) {
  code.value = result.token ? `${result.invitation.id}.${result.token}` : ''
  if (!result.token) notice.value = '邀请已提交，等待另一位所有者批准后发送邮件。'
  else if (result.mailStatus === 'Sent') notice.value = '邀请邮件已发送。'
  else if (result.mailStatus === 'Unknown') notice.value = '邀请已创建。请先核对收件箱，也可以手动分享邀请码。'
  else notice.value = '邀请已创建。邮件未发送，可手动分享邀请码。'
}

async function invite() {
  await run(async () => {
    const request = {
      email: email.value.trim().toLowerCase(),
      role: role.value,
      businessRoles: [...selection.value].sort(),
    }
    const fingerprint = JSON.stringify(request)
    if (invitationIntent?.fingerprint !== fingerprint)
      invitationIntent = { fingerprint, operationId: crypto.randomUUID() }
    const result = await write<IssuedInvitation>('/invitations', { ...request, operationId: invitationIntent.operationId })
    invitationIntent = undefined
    email.value = ''
    selection.value = []
    showInvitation(result)
  })
}

async function save(member: WorkspaceMember, nextRole: string, isActive: boolean) {
  await run(async () => {
    await write(`/members/${member.id}`, { role: nextRole, isActive })
    notice.value = '成员权限已更新。'
    if (member.id === access.value?.memberId) await store.load()
  })
}

async function editBusinessRoles(member: WorkspaceMember, action: string, roles?: string[]) {
  await run(async () => {
    await write(`/members/${member.id}/business-roles`, { action, businessRoles: roles })
    notice.value = '业务角色已更新，请查看成员的授权状态。'
  })
}

async function resolveLegacyProposal(member: WorkspaceMember, area: string, action: string) {
  await run(async () => {
    await write(`/members/${member.id}/${area}`, { action })
    notice.value = '业务角色已更新，请查看成员的授权状态。'
  })
}

async function approve(invitation: WorkspaceInvitation) {
  await run(async () => showInvitation(await write<IssuedInvitation>(`/invitations/${invitation.id}/approve`, {})))
}

async function revoke(invitation: WorkspaceInvitation) {
  await run(async () => {
    await write(`/invitations/${invitation.id}/revoke`, {})
    invitationIntent = undefined
    code.value = ''
    notice.value = '邀请已撤销。'
  })
}

onMounted(() => run())
</script>

<template>
  <section class="governance rounded-nx border border-nx-border bg-nx-surface p-6 shadow-nx-sm" aria-label="工作区成员与授权">
    <div class="section-top">
      <p v-if="access" class="mt-2 text-[12px] leading-[1.62] text-nx-ink-3">{{ workspaceRoleName(access.role) }} · 当前公司</p>
      <UButton variant="outline" color="neutral" size="sm" type="button" :disabled="busy" @click="run()">刷新权限与成员</UButton>
    </div>
    <UAlert v-if="notice" role="status" :description="notice" />
    <p v-if="access && !can('organization.members.read')" class="mt-2 text-[12px] leading-[1.62] text-nx-ink-3">成员管理由工作区所有者或访问管理员负责。</p>

    <form v-if="can('organization.members.invite')" class="invite-form" @submit.prevent="invite">
      <h2><UIcon class="mr-2 inline-block size-[1.08em] align-[-0.16em] text-nx-primary" name="i-lucide-user-plus" aria-hidden="true" />邀请成员</h2>
      <div class="invite-fields">
        <UFormField label="受邀邮箱" name="inviteEmail">
          <UInput id="invite-email" :model-value="email" type="email" required maxlength="254"
            placeholder="member@example.com" class="w-full"
            @update:model-value="value => email = String(value)" />
        </UFormField>
        <div class="invite-role">
          <UFormField label="邀请角色" name="inviteRole">
            <USelect id="invite-role" :model-value="role" :items="availableRoleOptions"
              @update:model-value="value => role = String(value)" />
          </UFormField>
        </div>
      </div>
      <WorkspaceBusinessRolePicker
v-if="canManageBusinessRoles" v-model="selection"
        :roles="businessRoles" :disabled="busy" show-presets />
      <p v-if="selection.length" class="mt-2 text-[12px] leading-[1.62] text-nx-ink-3">业务角色邀请须由另一位工作区所有者批准，批准后才会发送邮件。</p>
      <UButton color="primary" type="submit" :disabled="busy">创建邀请</UButton>
    </form>

    <div v-if="code" class="invitation-code">
      <UFormField label="一次性邀请码" name="issuedCode">
        <UInput id="issued-code" :model-value="code" readonly autocomplete="off" class="w-full" />
      </UFormField>
      <UButton variant="outline" color="neutral" size="sm" type="button" @click="code = ''">隐藏邀请码</UButton>
    </div>

    <section v-if="access && can('organization.members.read')">
      <h2><UIcon class="mr-2 inline-block size-[1.08em] align-[-0.16em] text-nx-primary" name="i-lucide-users-round" aria-hidden="true" />成员列表</h2>
      <WorkspaceMemberEditor
v-for="member in members" :key="member.id" :member="member" :access="access"
        :available-roles="availableRoles" :business-roles="businessRoles" :can-edit="canEdit(member)"
        :can-manage-business-roles="canManageBusinessRoles" :last-owner="lastOwner(member)" :busy="busy"
        @save="(nextRole, active) => save(member, nextRole, active)"
        @business="(action, roles) => editBusinessRoles(member, action, roles)"
        @legacy="(area, action) => resolveLegacyProposal(member, area, action)" />
    </section>

    <WorkspaceScopedRoleGrants
v-if="access && can('organization.roles.assign')" :workspace-id="workspaceId"
      :access="access" :members="members" :busy="busy" @changed="run()" />

    <section v-if="can('organization.members.invite')">
      <h2><UIcon class="mr-2 inline-block size-[1.08em] align-[-0.16em] text-nx-primary" name="i-lucide-mail-check" aria-hidden="true" />邀请记录</h2>
      <p v-if="!invitations.length" class="mt-2 text-[12px] leading-[1.62] text-nx-ink-3">暂无邀请。</p>
      <article v-for="invitation in invitations" :key="invitation.id" class="invitation-row" :data-email="invitation.email">
        <div>
          <strong>{{ invitation.email }}</strong>
          <p class="mt-2 text-[12px] leading-[1.62] text-nx-ink-3">{{ workspaceRoleName(invitation.role) }} · {{ invitationStates[invitation.state] }}</p>
          <p class="mt-2 text-[12px] leading-[1.62] text-nx-ink-3">{{ businessRoleNames(invitation.businessRoles) }} · {{ new Date(invitation.expiresAtUtc).toLocaleString('zh-CN') }}</p>
        </div>
        <UButton
v-if="canManageBusinessRoles && invitation.state === 'PendingApproval' && invitation.inviterMemberId !== access?.memberId"
          variant="outline" color="neutral" size="xs" type="button" :disabled="busy" @click="approve(invitation)">批准邀请</UButton>
        <UButton
v-if="['PendingApproval', 'Pending'].includes(invitation.state) &&
          (isOwner || invitation.role === 'WorkspaceReader' && !invitation.businessRoles?.length)"
          variant="outline" color="neutral" size="xs" type="button" :disabled="busy" @click="revoke(invitation)">撤销邀请</UButton>
      </article>
    </section>
  </section>
</template>

<style scoped>
.governance { display: grid; gap: 20px; }
.section-top, .invite-fields, .invitation-row { display: flex; align-items: center; flex-wrap: wrap; gap: 12px; }
.section-top { justify-content: space-between; padding-bottom: 4px; }
.section-top p { margin: 0; }
.invite-form { display: grid; justify-items: start; gap: 12px; margin: 6px 0 18px; }
.invite-fields { align-items: end; width: 100%; }
.invite-role { display: grid; gap: 5px; }
.invite-fields > :first-child { flex: 1; min-width: min(220px, 100%); }
.invite-form fieldset { width: 100%; }
.invitation-code { display: grid; gap: 8px; justify-items: start; }
.invitation-row { padding: 12px 0; margin: 8px 0; background: #fbfcfe; border: 1px solid #edf1f7; border-top: 1px solid var(--nx-border); border-radius: 12px; overflow-wrap: anywhere; }
.invitation-row > div { flex: 1; min-width: min(220px, 100%); }
.invitation-row p { margin: 4px 0; }
/* Phase 5: scoped equivalents of the removed global article rules. */
article p { font-size: 12.5px; color: var(--nx-ink-3) }
</style>

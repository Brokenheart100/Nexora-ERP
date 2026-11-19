<script setup lang="ts">
import type { WorkspaceAccess, WorkspaceMember, WorkspaceRole } from '~/utils/organization/workspaceGovernance'

const props = defineProps<{
  member: WorkspaceMember
  access: WorkspaceAccess
  availableRoles: string[]
  businessRoles: WorkspaceRole[]
  canEdit: boolean
  canManageBusinessRoles: boolean
  lastOwner: boolean
  busy: boolean
}>()
const emit = defineEmits<{
  save: [role: string, active: boolean]
  business: [action: 'submit' | 'approve' | 'cancel', roles?: string[]]
  legacy: [area: string, action: 'approve' | 'revoke']
}>()
const editing = ref(false)
const role = ref(props.member.role)
const active = ref(props.member.isActive)
const selection = ref(memberBusinessRoles(props.member))
const current = computed(() => memberBusinessRoles(props.member))
const pending = computed(() => props.member.proposedBusinessRoles)
const legacy = computed(() => [
  { area: 'finance-role', role: props.member.proposedFinanceRole },
  { area: 'purchase-role', role: props.member.proposedPurchaseRole },
  { area: 'sales-role', role: props.member.proposedSalesRole },
].find(item => item.role))
const proposalCurrent = computed(() => props.member.businessRoleProposalVersion === props.access.authorizationVersion
  && Date.parse(props.member.businessRoleProposalExpiresAtUtc ?? '') > Date.now())
const canApprove = computed(() => proposalCurrent.value && props.member.businessRoleProposerId !== props.access.memberId
  && props.member.id !== props.access.memberId)
const changed = computed(() => selection.value.length !== current.value.length
  || selection.value.some(code => !current.value.includes(code)))
const addsRole = computed(() => selection.value.some(code => !current.value.includes(code)))
const availableRoleOptions = computed(() => props.availableRoles.map(code => ({ label: workspaceRoleName(code), value: code })))

function open() {
  role.value = props.member.role
  active.value = props.member.isActive
  selection.value = [...(pending.value ?? current.value)]
  editing.value = true
}

watch(() => props.member, () => { editing.value = false })
</script>

<template>
  <article class="member-row" :data-subject="member.subject">
    <div class="summary">
      <div>
        <strong>{{ member.email ?? member.subject }}</strong>
        <p class="mt-2 text-[12px] leading-[1.62] text-nx-ink-3">{{ member.isActive ? '有效成员' : '已停用' }} · {{ workspaceRoleName(member.role) }}</p>
        <p class="mt-2 text-[12px] leading-[1.62] text-nx-ink-3">{{ businessRoleNames(current) }}</p>
      </div>
      <UButton
v-if="!editing && (canEdit || canManageBusinessRoles && member.isActive)"
        variant="outline" color="neutral" size="xs" type="button" :disabled="busy" @click="open">编辑权限</UButton>
    </div>

    <div v-if="canManageBusinessRoles && pending" class="pending">
      <span>{{ proposalCurrent ? '待审批' : '申请已失效，请重新提交' }} · {{ businessRoleNames(pending) }}</span>
      <UButton v-if="canApprove" variant="outline" color="neutral" size="xs" type="button" :disabled="busy" @click="emit('business', 'approve')">批准业务角色</UButton>
      <UButton variant="outline" color="neutral" size="xs" type="button" :disabled="busy" @click="emit('business', 'cancel')">撤销申请</UButton>
    </div>
    <div v-else-if="canManageBusinessRoles && legacy?.role" class="pending">
      <span>{{ proposalCurrent ? '待审批' : '申请已失效，请重新提交' }} · {{ workspaceRoleName(legacy.role) }}</span>
      <UButton
v-if="canApprove" variant="outline" color="neutral" size="xs" type="button" :disabled="busy"
        @click="emit('legacy', legacy.area, 'approve')">批准业务角色</UButton>
      <UButton variant="outline" color="neutral" size="xs" type="button" :disabled="busy" @click="emit('legacy', legacy.area, 'revoke')">撤销申请</UButton>
    </div>

    <div v-if="editing" class="editor">
      <form v-if="canEdit" class="governance-edit" @submit.prevent="emit('save', role, active)">
        <UFormField label="成员角色" name="memberRole">
          <USelect :model-value="role" :items="availableRoleOptions" :disabled="busy"
            @update:model-value="value => role = String(value)" />
        </UFormField>
        <UCheckbox v-model="active" label="启用" :disabled="busy" />
        <UButton variant="outline" color="neutral" size="sm" type="submit" :disabled="busy">保存成员</UButton>
        <p v-if="lastOwner" class="mt-2 text-[12px] leading-[1.62] text-nx-ink-3">工作区须至少保留一位有效所有者。</p>
        <p v-if="current.length" class="mt-2 text-[12px] leading-[1.62] text-nx-ink-3">更改成员角色或停用成员会清除已授予的业务角色。</p>
      </form>
      <form v-if="canManageBusinessRoles && member.isActive" @submit.prevent="emit('business', 'submit', selection)">
        <WorkspaceBusinessRolePicker v-model="selection" :roles="businessRoles" :disabled="busy" />
        <UButton color="primary" type="submit" :disabled="busy || !changed">{{ addsRole ? '提交业务角色申请' : '保存业务角色' }}</UButton>
      </form>
      <UButton variant="outline" color="neutral" size="sm" type="button" :disabled="busy" @click="editing = false">关闭编辑</UButton>
    </div>
  </article>
</template>

<style scoped>
.member-row { padding: 16px 0; margin: 8px 0; background: #fbfcfe; border: 1px solid #edf1f7; border-top: 1px solid var(--nx-border); border-radius: 12px }
html.dark .member-row { background: var(--nx-surface-muted); border-color: var(--nx-border) }
html.dark .member-row:last-child { border-bottom-color: #edf1f7 }
.summary { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; flex-wrap: wrap; overflow-wrap: anywhere; }
.summary p { margin: 4px 0; }
.pending, .governance-edit { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin-block: 8px; }
.governance-edit .hint { flex-basis: 100%; margin: 0; }
.editor { display: grid; justify-items: start; gap: 12px; padding: 14px; background: var(--nx-surface-muted); border-radius: 8px; }
.editor form { width: 100%; }
.editor form > .primary { margin-top: 10px; }
/* Phase 5: scoped equivalents of the removed global article rules. */
article p { margin: 0; font-size: 12.5px; color: var(--nx-ink-3) }
</style>

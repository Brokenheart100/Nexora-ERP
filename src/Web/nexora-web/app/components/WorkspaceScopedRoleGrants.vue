<script setup lang="ts">
import type { CustomRole, Department, PermissionOption, RoleGrant, WorkspaceAccess, WorkspaceMember } from '~/utils/workspaceGovernance'

interface Warehouse { id: string; code: string; name: string }
const props = defineProps<{ workspaceId: string; access: WorkspaceAccess; members: WorkspaceMember[]; busy: boolean }>()
const emit = defineEmits<{ changed: [] }>()
const roles = shallowRef<CustomRole[]>([])
const permissions = shallowRef<PermissionOption[]>([])
const departments = shallowRef<Department[]>([])
const warehouses = shallowRef<Warehouse[]>([])
const grants = shallowRef<RoleGrant[]>([])
const memberId = ref('')
const roleId = ref('')
const scope = ref('company')
const scopeId = ref('')
const startsOn = ref('')
const endsOn = ref('')
const departmentName = ref('')
const pending = ref(false)
const status = ref('')
const base = `/bff/api/workspaces/${props.workspaceId}`
const canManage = computed(() => props.access.permissions.includes('organization.business-roles.manage'))
const isBusy = computed(() => pending.value || props.busy)
const selected = computed(() => roles.value.find(role => role.id === roleId.value))
const scopeOptions = computed(() => Object.keys(roleScopeNames).filter(kind => selected.value?.permissions.every(code =>
  permissions.value.find(option => option.code === code)?.scopes.includes(kind))))
const scopeResources = computed(() => scope.value === 'department' ? departments.value
  : scope.value === 'warehouse' ? warehouses.value : [])
const periodScoped = computed(() => scope.value === 'period')
const memberOptions = computed(() => props.members.filter(member => member.isActive).map(member => ({
  label: memberName(member.id), value: member.id,
})))
const roleOptions = computed(() => roles.value.map(role => ({ label: `${role.name} · v${role.revision}`, value: role.id })))
const scopeKindOptions = computed(() => scopeOptions.value.map(kind => ({ label: roleScopeNames[kind], value: kind })))
const scopeResourceOptions = computed(() => scopeResources.value.map(resource => ({ label: resource.name, value: resource.id })))
const scopePlaceholder = computed(() => scope.value === 'department' ? '选择部门' : '选择仓库')

watch(roleId, () => { scope.value = 'company'; scopeId.value = ''; startsOn.value = ''; endsOn.value = '' })
watch(scope, () => { scopeId.value = '' })

function memberName(id: string) {
  const member = props.members.find(item => item.id === id)
  return member?.email ?? member?.subject ?? id
}

function scopeName(grant: RoleGrant) {
  const department = departments.value.find(resource => resource.id === grant.scopeId)?.name
  const warehouse = warehouses.value.find(resource => resource.id === grant.scopeId)?.name
  return roleGrantScopeName(grant, department, warehouse)
}

function approvable(grant: RoleGrant) {
  return grant.state === 'Pending' && grant.requestedBy !== props.access.memberId &&
    grant.memberId !== props.access.memberId && roles.value.some(role => role.id === grant.roleId && role.revision === grant.roleRevision)
}

async function load() {
  const [catalog, directory, assignments, stock] = await Promise.all([
    loadCustomRoles(props.workspaceId),
    loadDepartments(props.workspaceId),
    $fetch<RoleGrant[]>(base + '/role-grants', { retry: 0 }),
    canManage.value ? $fetch<{ warehouses: Warehouse[] }>(`/bff/api/inventory/workspaces/${props.workspaceId}/warehouses`, { retry: 0 })
      : { warehouses: [] },
  ])
  roles.value = catalog.roles
  permissions.value = catalog.permissions
  departments.value = directory
  grants.value = assignments
  warehouses.value = stock.warehouses
}

async function run(action?: () => Promise<void>) {
  if (pending.value) return
  pending.value = true
  if (action) status.value = ''
  try {
    if (action) await action()
    await load()
  } catch {
    status.value = '操作未完成。请刷新并核对角色、范围和授权状态。'
  } finally {
    if (action) emit('changed')
    pending.value = false
  }
}

function addDepartment() {
  return run(async () => {
    await writeGovernance(props.workspaceId, '/departments', props.access.authorizationVersion, { name: departmentName.value })
    departmentName.value = ''
    status.value = '部门已创建。'
  })
}

function request() {
  return run(async () => {
    await writeGovernance(props.workspaceId, '/role-grants', props.access.authorizationVersion, {
      memberId: memberId.value, roleId: roleId.value, roleRevision: selected.value?.revision,
      scope: scope.value, scopeId: scopeId.value || null,
      startsOn: periodScoped.value ? startsOn.value || null : null,
      endsOn: periodScoped.value ? endsOn.value || null : null,
    })
    status.value = '已提交，等待另一位所有者审批。'
  })
}

function decide(grant: RoleGrant, action: 'approve' | 'revoke') {
  return run(async () => {
    await writeGovernance(props.workspaceId, '/role-grants/' + grant.id, props.access.authorizationVersion, { action })
    if (action === 'revoke') status.value = '角色授权已撤销。'
    else if (grant.requiredApprovals > 1 && grant.approvalCount + 1 < grant.requiredApprovals)
      status.value = `已记录审批，仍需 ${grant.requiredApprovals - grant.approvalCount - 1} 位所有者批准。`
    else status.value = '角色授权已生效。'
  })
}

watch(() => props.access.authorizationVersion, () => { void run() })
onMounted(() => run())
</script>

<template>
  <section class="scoped-grants" aria-label="自定义角色授权">
    <h2><UIcon class="mr-2 inline-block size-[1.08em] align-[-0.16em] text-nx-primary" name="i-lucide-key-round" aria-hidden="true" />自定义角色授权</h2>
    <UAlert v-if="status" role="status" :description="status" />
    <form v-if="canManage" class="scope-form" @submit.prevent="addDepartment">
      <UFormField label="新部门名称" name="departmentName">
        <UInput :model-value="departmentName" maxlength="80" required :disabled="isBusy"
          @update:model-value="value => departmentName = String(value).trim()" />
      </UFormField>
      <UButton variant="outline" color="neutral" size="sm" type="submit" :disabled="isBusy">创建部门</UButton>
    </form>
    <form v-if="canManage && roles.length" class="scope-form" @submit.prevent="request">
      <UFormField label="授权成员" name="grantMember">
        <USelect :model-value="memberId" :items="memberOptions" placeholder="选择成员" :disabled="isBusy"
          @update:model-value="value => memberId = String(value)" />
      </UFormField>
      <UFormField label="授权角色" name="grantRole">
        <USelect :model-value="roleId" :items="roleOptions" placeholder="选择角色" :disabled="isBusy"
          @update:model-value="value => roleId = String(value)" />
      </UFormField>
      <UFormField label="数据范围" name="grantScope">
        <USelect :model-value="scope" :items="scopeKindOptions" :disabled="isBusy || !selected"
          @update:model-value="value => scope = String(value)" />
      </UFormField>
      <UFormField v-if="scope === 'department' || scope === 'warehouse'" label="范围对象" name="grantScopeId">
        <USelect :model-value="scopeId" :items="scopeResourceOptions" :placeholder="scopePlaceholder" :disabled="isBusy"
          @update:model-value="value => scopeId = String(value)" />
      </UFormField>
      <template v-if="periodScoped">
        <UFormField label="期间开始" name="grantStartsOn">
          <input v-model="startsOn" data-testid="grant-starts-on" type="date" required :disabled="isBusy">
        </UFormField>
        <UFormField label="期间结束" name="grantEndsOn">
          <input v-model="endsOn" data-testid="grant-ends-on" type="date" required :disabled="isBusy">
        </UFormField>
      </template>
      <p v-if="periodScoped" class="mt-2 text-[12px] leading-[1.62] text-nx-ink-3">财务期间授权最长 60 个月；期间外的凭证与报表不可读取或过账。</p>
      <UButton color="primary" type="submit" :disabled="isBusy || !memberId || !selected || (periodScoped && (!startsOn || !endsOn))">提交角色授权</UButton>
    </form>
    <p v-else-if="canManage && !roles.length" class="mt-2 text-[12px] leading-[1.62] text-nx-ink-3">在侧栏「角色与权限」创建自定义角色后，可在此分配。</p>
    <article v-for="grant in grants" :key="grant.id" class="grant" :data-grant-id="grant.id">
      <div>
        <strong>{{ roles.find(role => role.id === grant.roleId)?.name }} · v{{ grant.roleRevision }}</strong>
        <p>{{ memberName(grant.memberId) }} · {{ scopeName(grant) }} ·
          {{ roleGrantApprovalName(grant) }}</p>
        <details><summary>查看授权权限</summary><ul><li v-for="permission in grant.permissions" :key="permission">{{ permission }}</li></ul></details>
      </div>
      <UButton
v-if="canManage && approvable(grant)" variant="outline" color="neutral" size="xs" type="button" :disabled="isBusy"
        @click="decide(grant, 'approve')">批准角色授权</UButton>
      <UButton v-if="canManage" variant="outline" color="neutral" size="xs" type="button" :disabled="isBusy" @click="decide(grant, 'revoke')">撤销角色授权</UButton>
    </article>
  </section>
</template>

<style scoped>
.scoped-grants { display: grid; gap: 12px; }
.scope-form, .grant { display: flex; align-items: end; flex-wrap: wrap; gap: 10px; }
.grant { border-top: 1px solid var(--nx-border); padding: 12px 0; }
.grant > div { flex: 1; overflow-wrap: anywhere; }
.grant p { margin: 4px 0; }
</style>

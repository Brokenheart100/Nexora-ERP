<script setup lang="ts">
import type { Permission, RoleAccessRequest, RoleScope } from '~/mocks'
import {
  accessRequestStatusColors,
  accessRequestStatusLabels,
  financePeriods,
  permissionGroups,
  permissionLabels,
  warehouses
} from '~/mocks'

const toast = useToast()
const org = useOrganizationStore()
const session = useSessionStore()
const { activeWorkspaceId } = useMockWorkspace()

const selectedRoleId = ref('role-buyer')
const selectedRole = computed(() => org.roleRows.find(item => item.id === selectedRoleId.value) ?? org.roleRows[0]!)
const isOwner = computed(() => selectedRole.value.permissions.includes('*'))
const allPermissions = permissionGroups.flatMap(group => group.permissions)
const draft = ref<Permission[]>(isOwner.value ? allPermissions : (selectedRole.value.permissions as Permission[]))

watch(selectedRoleId, () => {
  draft.value = isOwner.value ? [...allPermissions] : (selectedRole.value.permissions as Permission[])
  requestOpen.value = false
  requestError.value = ''
})

const memberCountOfRole = (roleId: string) => org.memberRows.filter(item => item.roleId === roleId).length
const checked = (permission: Permission) => isOwner.value || draft.value.includes(permission)
const dirty = computed(() => {
  if (isOwner.value) return false
  const saved = [...selectedRole.value.permissions].sort().join('|')
  return [...draft.value].sort().join('|') !== saved
})

function togglePermission(permission: Permission, value: boolean | 'indeterminate') {
  if (isOwner.value) return
  if (value === true) {
    draft.value = [...new Set([...draft.value, permission])]
  } else {
    draft.value = draft.value.filter(item => item !== permission)
  }
}

const groupState = (permissions: Permission[]) => {
  const count = permissions.filter(item => checked(item)).length
  return {
    all: count === permissions.length,
    some: count > 0 && count < permissions.length
  }
}

function toggleGroup(permissions: Permission[], value: boolean | 'indeterminate') {
  if (isOwner.value) return
  if (value === true) {
    draft.value = [...new Set([...draft.value, ...permissions])]
  } else {
    draft.value = draft.value.filter(item => !permissions.includes(item))
  }
}

function savePermissions() {
  org.updateRolePermissions(selectedRoleId.value, draft.value)
  org.recordAudit(activeWorkspaceId.value, session.user.name, '更新角色权限', selectedRole.value.name)
  toast.add({
    title: '角色权限已保存',
    description: selectedRole.value.name + ' · 仅影响本地预览',
    color: 'success',
    icon: 'i-carbon-checkmark'
  })
}

function resetDraft() {
  draft.value = isOwner.value ? [...allPermissions] : [...(selectedRole.value.permissions as Permission[])]
}

type DemoIdentity = 'requester' | 'approver'
const identity = ref<DemoIdentity>('requester')
const requester = computed(() => org.memberRows.find(item => item.id === 'u-1001')!)
const approver = computed(() => org.memberRows.find(item => item.id === 'u-1004')!)
const actor = computed(() => identity.value === 'requester' ? requester.value : approver.value)
const isApprover = computed(() => identity.value === 'approver')

const roleScope = computed(() => org.scopeOf(selectedRoleId.value))
const roleRequests = computed(() => org.accessRequestRows.filter(item => item.roleId === selectedRoleId.value))
const pendingCount = computed(() => roleRequests.value.filter(item => item.status === 'pending').length)
const pendingColor = computed<'warning' | 'neutral'>(() => pendingCount.value > 0 ? 'warning' : 'neutral')

function roleName(roleId: string) {
  return org.roleRows.find(item => item.id === roleId)?.name ?? roleId
}

function departmentName(id: string) {
  return org.departmentRows.find(item => item.id === id)?.name ?? id
}

function warehouseName(id: string) {
  return warehouses.find(item => item.id === id)?.name ?? id
}

function periodLabel(id: string) {
  const period = financePeriods.find(item => item.id === id)?.period
  return period ? period.slice(5) + ' 月' : id
}

function scopeText(ids: string[], label: (id: string) => string) {
  return ids.length ? ids.map(label).join('、') : '未选择'
}

const periodSummary = computed(() => {
  const ids = roleScope.value.periodIds
  if (ids.length === financePeriods.length) return '1–12 月（全年）'
  return ids.map(periodLabel).join('、') || '未选择'
})

const requestOpen = ref(false)
const requestError = ref('')
const requestReason = ref('')
const requestScope = reactive<RoleScope>({ departmentIds: [], warehouseIds: [], periodIds: [] })

function toggleScope(kind: keyof RoleScope, id: string) {
  const list = requestScope[kind]
  const index = list.indexOf(id)
  if (index >= 0) list.splice(index, 1)
  else list.push(id)
}

function scopeSelected(kind: keyof RoleScope, id: string) {
  return requestScope[kind].includes(id)
}

function openRequest() {
  if (isApprover.value) return
  requestScope.departmentIds = [...roleScope.value.departmentIds]
  requestScope.warehouseIds = [...roleScope.value.warehouseIds]
  requestScope.periodIds = [...roleScope.value.periodIds]
  requestReason.value = ''
  requestError.value = ''
  requestOpen.value = true
}

function submitRequest() {
  const result = org.submitAccessRequest({
    workspaceId: activeWorkspaceId.value,
    roleId: selectedRoleId.value,
    requesterId: requester.value.id,
    requesterName: requester.value.name,
    scope: {
      departmentIds: [...requestScope.departmentIds],
      warehouseIds: [...requestScope.warehouseIds],
      periodIds: [...requestScope.periodIds]
    },
    reason: requestReason.value
  })
  if (!result.ok) {
    requestError.value = result.message
    return
  }
  requestOpen.value = false
  toast.add({
    title: '授权申请已提交',
    description: result.request?.id + ' · 等待独立审批',
    color: 'success',
    icon: 'i-carbon-send'
  })
}

const rejectOpen = ref(false)
const rejectTarget = ref<RoleAccessRequest | null>(null)
const rejectNote = ref('')
const rejectError = ref('')

function openReject(request: RoleAccessRequest) {
  rejectTarget.value = request
  rejectNote.value = ''
  rejectError.value = ''
  rejectOpen.value = true
}

function submitReject() {
  if (!rejectTarget.value) return
  const result = org.rejectAccessRequest(
    rejectTarget.value.id,
    actor.value.id,
    actor.value.name,
    rejectNote.value
  )
  if (!result.ok) {
    rejectError.value = result.message
    return
  }
  rejectOpen.value = false
  toast.add({ title: '已拒绝授权申请', description: rejectTarget.value.id, color: 'neutral', icon: 'i-carbon-close' })
}

function approveRequest(request: RoleAccessRequest) {
  const result = org.approveAccessRequest(request.id, actor.value.id, actor.value.name)
  if (!result.ok) {
    toast.add({ title: '无法批准', description: result.message, color: 'error', icon: 'i-carbon-warning' })
    return
  }
  toast.add({
    title: '授权申请已批准',
    description: '角色数据范围已更新。',
    color: 'success',
    icon: 'i-carbon-checkmark'
  })
}

function canApprove(request: RoleAccessRequest) {
  return request.status === 'pending' && isApprover.value && request.requesterId !== actor.value.id
}

function requestTime(request: RoleAccessRequest) {
  return request.decidedAt ?? request.requestedAt
}

function decisionNote(request: RoleAccessRequest) {
  const decision = request.decisions[request.decisions.length - 1]
  return decision?.note ?? ''
}

watch(identity, (value) => {
  if (value === 'approver') {
    requestOpen.value = false
    requestError.value = ''
  }
})
</script>

<template>
  <div class="space-y-4" data-testid="settings-roles">
    <div class="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)]">
      <UCard :ui="{ body: 'p-2 sm:p-2' }">
        <template #header>
          <div class="flex items-center justify-between gap-2">
            <h3 class="text-sm font-semibold text-highlighted">
              角色
            </h3>
            <UBadge color="neutral" variant="subtle" size="sm">
              {{ org.roleRows.length }}
            </UBadge>
          </div>
        </template>
        <div class="space-y-1" data-testid="roles-list">
          <button
            v-for="role in org.roleRows"
            :key="role.id"
            type="button"
            class="w-full rounded-sm border px-3 py-2.5 text-left transition-colors"
            :class="role.id === selectedRoleId
              ? 'border-primary bg-primary/5'
              : 'border-transparent hover:border-default hover:bg-elevated/60'"
            :data-testid="'roles-role-' + role.id"
            @click="selectedRoleId = role.id"
          >
            <div class="flex items-center justify-between gap-2">
              <span class="text-sm font-medium text-highlighted">{{ role.name }}</span>
              <UBadge
                v-if="role.id === 'role-owner'"
                color="primary"
                variant="subtle"
                size="sm"
              >
                全部权限
              </UBadge>
              <span v-else class="text-xs text-muted">{{ memberCountOfRole(role.id) }} 人</span>
            </div>
            <p class="mt-0.5 text-xs text-muted">
              {{ role.description }}
            </p>
          </button>
        </div>
        <template #footer>
          <p class="text-xs text-muted">
            成员的角色在「成员」页签调整；这里定义角色拥有的权限与数据范围。
          </p>
        </template>
      </UCard>

      <UCard :ui="{ body: 'p-0 sm:p-0' }">
        <template #header>
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 class="text-sm font-semibold text-highlighted">
                权限矩阵 · {{ selectedRole.name }}
              </h3>
              <p class="mt-0.5 text-xs text-muted">
                {{ isOwner ? '所有者固定拥有全部权限，不可编辑。' : '勾选后保存，仅作用于本地演示状态。' }}
              </p>
            </div>
            <div class="flex gap-2">
              <UButton
                label="还原"
                color="neutral"
                variant="ghost"
                size="sm"
                :disabled="!dirty"
                data-testid="roles-reset"
                @click="resetDraft"
              />
              <UButton
                label="保存权限"
                icon="i-carbon-save"
                size="sm"
                :disabled="!dirty"
                data-testid="roles-save"
                @click="savePermissions"
              />
            </div>
          </div>
        </template>

        <div class="divide-y divide-default" data-testid="roles-matrix">
          <section v-for="group in permissionGroups" :key="group.id" class="px-4 py-3 sm:px-5">
            <div class="mb-2 flex items-center justify-between gap-2">
              <h4 class="text-xs font-semibold uppercase tracking-wide text-muted">
                {{ group.label }}
              </h4>
              <UCheckbox
                :model-value="groupState(group.permissions).all"
                :indeterminate="groupState(group.permissions).some"
                :disabled="isOwner"
                :label="'全选'"
                size="sm"
                :data-testid="'roles-group-' + group.id"
                @update:model-value="value => toggleGroup(group.permissions, value)"
              />
            </div>
            <div class="grid gap-2 sm:grid-cols-2">
              <UCheckbox
                v-for="permission in group.permissions"
                :key="permission"
                :model-value="checked(permission)"
                :disabled="isOwner"
                :label="permissionLabels[permission]"
                :description="permission"
                size="sm"
                :data-testid="'role-permission-' + permission"
                @update:model-value="value => togglePermission(permission, value)"
              />
            </div>
          </section>
        </div>
      </UCard>
    </div>

    <UCard :ui="{ body: 'p-0 sm:p-0' }" data-testid="role-authorization">
      <template #header>
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 class="text-sm font-semibold text-highlighted">
              授权范围与审批 · {{ selectedRole.name }}
            </h3>
            <p class="mt-0.5 text-xs text-muted">
              范围决定角色在哪些部门、仓库和财务期间内可见与操作；变更需独立审批，申请人不能自批。
            </p>
          </div>
          <div class="flex items-center gap-2 rounded-sm border border-default p-1" data-testid="roles-identity">
            <button
              type="button"
              class="rounded-sm px-2.5 py-1.5 text-xs transition-colors"
              :class="identity === 'requester' ? 'bg-primary text-inverted' : 'text-muted hover:bg-elevated'"
              :aria-pressed="identity === 'requester'"
              :data-active="identity === 'requester'"
              data-testid="roles-identity-requester"
              @click="identity = 'requester'"
            >
              张明远 · 采购员
            </button>
            <button
              type="button"
              class="rounded-sm px-2.5 py-1.5 text-xs transition-colors"
              :class="identity === 'approver' ? 'bg-primary text-inverted' : 'text-muted hover:bg-elevated'"
              :aria-pressed="identity === 'approver'"
              :data-active="identity === 'approver'"
              data-testid="roles-identity-approver"
              @click="identity = 'approver'"
            >
              陈立 · 所有者
            </button>
          </div>
        </div>
      </template>

      <div class="space-y-4 p-4 sm:p-5">
        <UAlert
          color="neutral"
          variant="subtle"
          icon="i-carbon-user-identification"
          :title="'当前身份：' + actor.name + '（' + roleName(actor.roleId) + '）'"
          :description="isApprover
            ? '审批人可批准或拒绝他人申请，不能以自己的身份提交申请。'
            : '制单人可以提交范围申请，但不能审批任何申请，包括自己的申请。'"
          data-testid="roles-identity-hint"
        />

        <div>
          <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h4 class="text-xs font-semibold uppercase tracking-wide text-muted">
              当前数据范围
            </h4>
            <div class="flex items-center gap-2">
              <UBadge
                :color="pendingColor"
                variant="subtle"
                size="sm"
                data-testid="role-pending-count"
              >
                {{ pendingCount }} 条待审批
              </UBadge>
              <UButton
                label="申请扩展范围"
                icon="i-carbon-add"
                size="sm"
                :disabled="isApprover"
                data-testid="access-request-new"
                @click="openRequest"
              />
            </div>
          </div>
          <div class="grid gap-3 md:grid-cols-3">
            <div class="rounded-sm border border-default bg-elevated/30 p-3" data-testid="role-scope-departments">
              <div class="flex items-center justify-between gap-2">
                <p class="text-xs font-medium text-highlighted">
                  部门
                </p>
                <span class="text-[11px] text-muted">{{ roleScope.departmentIds.length }} 个</span>
              </div>
              <p class="mt-1 text-xs text-muted">
                {{ scopeText(roleScope.departmentIds, departmentName) }}
              </p>
            </div>
            <div class="rounded-sm border border-default bg-elevated/30 p-3" data-testid="role-scope-warehouses">
              <div class="flex items-center justify-between gap-2">
                <p class="text-xs font-medium text-highlighted">
                  仓库
                </p>
                <span class="text-[11px] text-muted">{{ roleScope.warehouseIds.length }} 个</span>
              </div>
              <p class="mt-1 text-xs text-muted">
                {{ scopeText(roleScope.warehouseIds, warehouseName) }}
              </p>
            </div>
            <div class="rounded-sm border border-default bg-elevated/30 p-3" data-testid="role-scope-periods">
              <div class="flex items-center justify-between gap-2">
                <p class="text-xs font-medium text-highlighted">
                  财务期间
                </p>
                <span class="text-[11px] text-muted">{{ roleScope.periodIds.length }} 个</span>
              </div>
              <p class="mt-1 text-xs text-muted">
                {{ periodSummary }}
              </p>
            </div>
          </div>
        </div>

        <div>
          <div class="mb-2 flex items-center justify-between gap-2">
            <h4 class="text-xs font-semibold uppercase tracking-wide text-muted">
              授权申请
            </h4>
            <span class="text-[11px] text-muted">{{ roleRequests.length }} 条记录</span>
          </div>
          <div class="divide-y divide-default rounded-sm border border-default" data-testid="access-requests">
            <div
              v-for="request in roleRequests"
              :key="request.id"
              class="grid gap-3 px-4 py-3 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_auto]"
              :data-testid="'access-request-' + request.id"
            >
              <div class="min-w-0">
                <div class="flex flex-wrap items-center gap-2">
                  <span class="font-mono text-xs font-medium text-highlighted">{{ request.id }}</span>
                  <UBadge
                    :color="accessRequestStatusColors[request.status]"
                    variant="subtle"
                    size="sm"
                    :data-testid="'access-request-status-' + request.id"
                  >
                    {{ accessRequestStatusLabels[request.status] }}
                  </UBadge>
                  <span class="text-[11px] text-muted">{{ roleName(request.roleId) }}</span>
                </div>
                <p class="mt-1 text-xs text-default">
                  {{ request.reason }}
                </p>
                <div class="mt-2 grid gap-1 text-[11px] text-muted sm:grid-cols-3">
                  <span>部门：{{ scopeText(request.scope.departmentIds, departmentName) }}</span>
                  <span>仓库：{{ scopeText(request.scope.warehouseIds, warehouseName) }}</span>
                  <span>期间：{{ scopeText(request.scope.periodIds, periodLabel) }}</span>
                </div>
                <p v-if="decisionNote(request)" class="mt-1 text-[11px] text-muted">
                  审批意见：{{ decisionNote(request) }}
                </p>
              </div>
              <div class="text-[11px] text-muted">
                <p>申请人：{{ request.requesterName }}</p>
                <p class="mt-0.5">
                  {{ request.status === 'pending' ? '提交于 ' : '处理于 ' }}{{ requestTime(request) }}
                </p>
                <p v-if="request.decisions.length" class="mt-0.5">
                  审批人：{{ request.decisions[request.decisions.length - 1]?.actorName }}
                </p>
              </div>
              <div class="flex items-start justify-end">
                <template v-if="request.status === 'pending'">
                  <div v-if="isApprover" class="flex gap-2">
                    <UButton
                      label="批准"
                      size="xs"
                      icon="i-carbon-checkmark"
                      :disabled="!canApprove(request)"
                      :data-testid="'access-approve-' + request.id"
                      @click="approveRequest(request)"
                    />
                    <UButton
                      label="拒绝"
                      color="error"
                      variant="outline"
                      size="xs"
                      :disabled="!canApprove(request)"
                      :data-testid="'access-reject-' + request.id"
                      @click="openReject(request)"
                    />
                  </div>
                  <p v-else class="max-w-36 text-right text-[11px] text-muted">
                    切换为审批人陈立后可处理
                  </p>
                </template>
                <p v-else class="text-right text-[11px] text-muted">
                  {{ request.decisions[0]?.actorName }} · {{ accessRequestStatusLabels[request.status] }}
                </p>
              </div>
            </div>
            <div v-if="!roleRequests.length" class="px-4 py-8 text-center text-xs text-muted" data-testid="access-requests-empty">
              该角色暂无授权申请。
            </div>
          </div>
        </div>
      </div>
    </UCard>

    <USlideover v-model:open="requestOpen" title="申请扩展数据范围" description="提交后需工作区所有者独立审批">
      <template #body>
        <div class="space-y-4" data-testid="access-request-form">
          <div class="rounded-sm border border-default bg-elevated/30 p-3 text-xs text-muted">
            <p>申请人：{{ requester.name }} · 角色：{{ selectedRole.name }}</p>
            <p class="mt-1">
              勾选需要新增的范围。已有范围会保留，批准后自动并入角色。
            </p>
          </div>
          <UAlert
            v-if="requestError"
            color="error"
            variant="subtle"
            icon="i-carbon-warning"
            :title="requestError"
            data-testid="access-request-error"
          />

          <div>
            <p class="mb-2 text-xs font-medium text-highlighted">
              部门
            </p>
            <div class="flex flex-wrap gap-2">
              <button
                v-for="department in org.departmentRows"
                :key="department.id"
                type="button"
                class="rounded-sm border px-2.5 py-1.5 text-xs transition-colors"
                :class="scopeSelected('departmentIds', department.id)
                  ? 'border-primary bg-primary/5 text-primary'
                  : 'border-default text-muted hover:bg-elevated'"
                :aria-pressed="scopeSelected('departmentIds', department.id)"
                :data-testid="'access-scope-department-' + department.id"
                @click="toggleScope('departmentIds', department.id)"
              >
                {{ department.name }}
              </button>
            </div>
          </div>

          <div>
            <p class="mb-2 text-xs font-medium text-highlighted">
              仓库
            </p>
            <div class="flex flex-wrap gap-2">
              <button
                v-for="warehouse in warehouses"
                :key="warehouse.id"
                type="button"
                class="rounded-sm border px-2.5 py-1.5 text-xs transition-colors disabled:opacity-50"
                :class="scopeSelected('warehouseIds', warehouse.id)
                  ? 'border-primary bg-primary/5 text-primary'
                  : 'border-default text-muted hover:bg-elevated'"
                :disabled="warehouse.status !== 'active'"
                :aria-pressed="scopeSelected('warehouseIds', warehouse.id)"
                :data-testid="'access-scope-warehouse-' + warehouse.id"
                @click="toggleScope('warehouseIds', warehouse.id)"
              >
                {{ warehouse.name }}
              </button>
            </div>
          </div>

          <div>
            <p class="mb-2 text-xs font-medium text-highlighted">
              财务期间
            </p>
            <div class="flex flex-wrap gap-2">
              <button
                v-for="period in financePeriods"
                :key="period.id"
                type="button"
                class="rounded-sm border px-2.5 py-1.5 text-xs transition-colors"
                :class="scopeSelected('periodIds', period.id)
                  ? 'border-primary bg-primary/5 text-primary'
                  : 'border-default text-muted hover:bg-elevated'"
                :aria-pressed="scopeSelected('periodIds', period.id)"
                :data-testid="'access-scope-period-' + period.id"
                @click="toggleScope('periodIds', period.id)"
              >
                {{ period.period }}
              </button>
            </div>
          </div>

          <UFormField label="申请原因" required>
            <UTextarea
              v-model="requestReason"
              :rows="3"
              placeholder="说明业务场景、需要这些范围的原因和使用时长"
              class="w-full"
              data-testid="access-request-reason"
            />
          </UFormField>
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton
            label="取消"
            color="neutral"
            variant="ghost"
            data-testid="access-request-cancel"
            @click="requestOpen = false"
          />
          <UButton
            label="提交申请"
            icon="i-carbon-send"
            data-testid="access-request-submit"
            @click="submitRequest"
          />
        </div>
      </template>
    </USlideover>

    <UModal v-model:open="rejectOpen" title="拒绝授权申请" description="拒绝原因会记录在申请与审计日志中">
      <template #body>
        <div class="space-y-3" data-testid="access-reject-form">
          <p class="text-xs text-muted">
            申请：{{ rejectTarget?.id }} · {{ rejectTarget?.requesterName }} · {{ rejectTarget ? roleName(rejectTarget.roleId) : '' }}
          </p>
          <UAlert
            v-if="rejectError"
            color="error"
            variant="subtle"
            icon="i-carbon-warning"
            :title="rejectError"
            data-testid="access-reject-error"
          />
          <UFormField label="拒绝原因" required>
            <UTextarea
              v-model="rejectNote"
              :rows="3"
              placeholder="说明不适用的原因，便于申请人调整后重新提交"
              class="w-full"
              data-testid="access-reject-note"
            />
          </UFormField>
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton
            label="取消"
            color="neutral"
            variant="ghost"
            data-testid="access-reject-cancel"
            @click="rejectOpen = false"
          />
          <UButton
            label="确认拒绝"
            color="error"
            data-testid="access-reject-submit"
            @click="submitReject"
          />
        </div>
      </template>
    </UModal>
  </div>
</template>

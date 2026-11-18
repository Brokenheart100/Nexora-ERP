<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { Member } from '~/mocks'
import { memberStatusColors, memberStatusLabels } from '~/mocks'

const toast = useToast()
const org = useOrganizationStore()
const session = useSessionStore()
const { activeWorkspaceId } = useMockWorkspace()

const keyword = ref('')
const roleFilter = ref('all')
const departmentFilter = ref('all')
const statusFilter = ref('all')

const roleOptions = computed(() => org.roleRows.map(role => ({ label: role.name, value: role.id })))
const departmentOptions = computed(() => org.departmentRows.map(item => ({ label: item.name, value: item.id })))
const roleName = (id: string) => org.roleRows.find(item => item.id === id)?.name ?? '未分配'
const departmentName = (id: string) => org.departmentRows.find(item => item.id === id)?.name ?? '未分配'

const filteredRows = computed(() => {
  const term = keyword.value.trim().toLowerCase()
  return org.memberRows.filter((member) => {
    if (roleFilter.value !== 'all' && member.roleId !== roleFilter.value) return false
    if (departmentFilter.value !== 'all' && member.departmentId !== departmentFilter.value) return false
    if (statusFilter.value !== 'all' && member.status !== statusFilter.value) return false
    if (!term) return true
    return [member.name, member.email, member.phone].some(value => value.toLowerCase().includes(term))
  })
})

const activeCount = computed(() => org.memberRows.filter(item => item.status === 'active').length)
const invitedCount = computed(() => org.memberRows.filter(item => item.status === 'invited').length)
const hasFilters = computed(
  () => Boolean(keyword.value.trim()) || roleFilter.value !== 'all' || departmentFilter.value !== 'all' || statusFilter.value !== 'all'
)

function resetFilters() {
  keyword.value = ''
  roleFilter.value = 'all'
  departmentFilter.value = 'all'
  statusFilter.value = 'all'
}

const columns: TableColumn<Member>[] = [
  { accessorKey: 'name', header: '成员', id: 'name' },
  { accessorKey: 'roleId', header: '角色', id: 'role' },
  { accessorKey: 'departmentId', header: '部门', id: 'department' },
  { accessorKey: 'status', header: '状态', id: 'status' },
  { accessorKey: 'joinedAt', header: '加入日期', id: 'joinedAt' },
  { id: 'actions', header: '操作' }
]

function changeRole(member: Member, roleIdValue: string) {
  org.updateMemberRole(member.id, roleIdValue)
  org.recordAudit(activeWorkspaceId.value, session.user.name, '更新成员角色', member.name)
  toast.add({ title: `${member.name} 的角色已更新`, description: `现为${roleName(roleIdValue)}`, color: 'success', icon: 'i-carbon-user-role' })
}

function changeDepartment(member: Member, departmentId: string) {
  org.updateMemberDepartment(member.id, departmentId)
  org.recordAudit(activeWorkspaceId.value, session.user.name, '调整成员部门', member.name)
  toast.add({ title: '成员部门已更新', description: `${member.name} → ${departmentName(departmentId)}`, color: 'success', icon: 'i-carbon-tree-view-alt' })
}

function toggleMember(member: Member) {
  const next = org.toggleMemberStatus(member.id)
  org.recordAudit(activeWorkspaceId.value, session.user.name, next === 'active' ? '恢复成员' : '停用成员', member.name)
  toast.add({
    title: next === 'active' ? '成员已恢复' : '成员已停用',
    description: member.name + ' · 仅影响本地预览',
    color: next === 'active' ? 'success' : 'neutral',
    icon: next === 'active' ? 'i-carbon-user-follow' : 'i-carbon-user-x'
  })
}

const inviteOpen = ref(false)
const inviteForm = reactive({ emails: '', roleId: 'role-viewer', departmentId: 'dept-sales' })
const parsedEmails = computed(() =>
  [...new Set(inviteForm.emails.split(/[\s,;]+/).map(item => item.trim().toLowerCase()).filter(Boolean))]
)
const invalidEmails = computed(() => parsedEmails.value.filter(item => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(item)))

function openInvite() {
  inviteForm.emails = ''
  inviteForm.roleId = 'role-viewer'
  inviteForm.departmentId = 'dept-sales'
  inviteOpen.value = true
}

function submitInvite() {
  const emails = parsedEmails.value.filter(item => !invalidEmails.value.includes(item))
  const accepted = org.inviteMembers(emails, inviteForm.roleId, inviteForm.departmentId)
  if (!accepted.length) {
    toast.add({ title: '没有新的有效邮箱', description: '已存在或待接受的邮箱会被跳过。', color: 'warning', icon: 'i-carbon-information' })
    return
  }
  org.recordAudit(activeWorkspaceId.value, session.user.name, '批量邀请成员', accepted.length + ' 人')
  toast.add({
    title: '邀请已创建',
    description: `已向 ${accepted.length} 个邮箱生成邀请链接，仅用于本地演示。`,
    color: 'success',
    icon: 'i-carbon-send-alt'
  })
  inviteOpen.value = false
}
</script>

<template>
  <div class="space-y-4" data-testid="settings-members">
    <UCard :ui="{ body: 'p-0 sm:p-0' }">
      <template #header>
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 class="text-sm font-semibold text-highlighted">
              成员
            </h3>
            <p class="mt-0.5 text-xs text-muted">
              共 {{ org.memberRows.length }} 人 · 在职 {{ activeCount }} · 待接受 {{ invitedCount }}
            </p>
          </div>
          <UButton
            icon="i-carbon-user-multiple"
            label="批量邀请"
            data-testid="members-invite"
            @click="openInvite"
          />
        </div>
      </template>

      <div class="flex flex-wrap items-center gap-2 border-b border-default px-4 py-3">
        <UInput
          v-model="keyword"
          icon="i-carbon-search"
          placeholder="搜索姓名、邮箱或手机号"
          class="w-64"
          data-testid="members-search"
        />
        <USelect
          v-model="roleFilter"
          :items="[{ label: '全部角色', value: 'all' }, ...roleOptions]"
          class="w-36"
          data-testid="members-role-filter"
        />
        <USelect
          v-model="departmentFilter"
          :items="[{ label: '全部部门', value: 'all' }, ...departmentOptions]"
          class="w-36"
          data-testid="members-department-filter"
        />
        <USelect
          v-model="statusFilter"
          :items="[
            { label: '全部状态', value: 'all' },
            { label: '在职', value: 'active' },
            { label: '待接受邀请', value: 'invited' },
            { label: '已停用', value: 'disabled' }
          ]"
          class="w-36"
          data-testid="members-status-filter"
        />
        <UButton
          v-if="hasFilters"
          label="清空筛选"
          color="neutral"
          variant="ghost"
          size="sm"
          icon="i-carbon-close"
          data-testid="members-clear-filters"
          @click="resetFilters"
        />
        <span class="ml-auto text-xs text-muted">当前 {{ filteredRows.length }} 人</span>
      </div>

      <ResizableTable
        :data="filteredRows"
        :columns="columns"
        class="nx-table"
        :ui="{ th: 'py-2.5', td: 'py-3' }"
        data-testid="members-table"
      >
        <template #name-cell="{ row }">
          <div class="flex items-center gap-2.5">
            <UAvatar :alt="row.original.name" size="sm" :ui="{ fallback: 'text-[11px]' }" />
            <div class="min-w-0">
              <p class="truncate text-sm font-medium text-highlighted">
                {{ row.original.name }}
              </p>
              <p class="truncate text-xs text-muted">
                {{ row.original.email }}
              </p>
            </div>
          </div>
        </template>
        <template #role-cell="{ row }">
          <USelect
            :model-value="row.original.roleId"
            :items="roleOptions"
            size="sm"
            class="w-32"
            :data-testid="'members-role-' + row.original.id"
            @update:model-value="value => changeRole(row.original, String(value))"
          />
        </template>
        <template #department-cell="{ row }">
          <USelect
            :model-value="row.original.departmentId"
            :items="departmentOptions"
            size="sm"
            class="w-32"
            :data-testid="'members-department-' + row.original.id"
            @update:model-value="value => changeDepartment(row.original, String(value))"
          />
        </template>
        <template #status-cell="{ row }">
          <UBadge
            :color="memberStatusColors[row.original.status]"
            variant="subtle"
            size="sm"
            :label="memberStatusLabels[row.original.status]"
          />
        </template>
        <template #joinedAt-cell="{ row }">
          <span class="font-mono text-xs text-muted">{{ row.original.joinedAt }}</span>
        </template>
        <template #actions-cell="{ row }">
          <UButton
            :icon="row.original.status === 'active' ? 'i-carbon-user-x' : 'i-carbon-user-follow'"
            color="neutral"
            variant="ghost"
            size="xs"
            :label="row.original.status === 'active' ? '停用' : '恢复'"
            :data-testid="'members-toggle-' + row.original.id"
            @click="toggleMember(row.original)"
          />
        </template>
        <template #empty>
          <UEmpty
            variant="naked"
            icon="i-carbon-search"
            title="没有匹配的成员"
            description="调整关键词或筛选条件后重试"
            :actions="[{ label: '清空筛选', color: 'neutral', variant: 'outline', size: 'sm', onClick: resetFilters }]"
          />
        </template>
      </ResizableTable>
    </UCard>

    <UModal v-model:open="inviteOpen" title="批量邀请成员" :ui="{ content: 'sm:max-w-lg' }">
      <template #body>
        <div class="space-y-4" data-testid="members-invite-dialog">
          <UFormField
            label="邮箱地址"
            name="emails"
            required
            help="支持换行、逗号或分号分隔，最多一次 10 个"
          >
            <UTextarea
              v-model="inviteForm.emails"
              :rows="4"
              class="w-full"
              placeholder="alice@example.com&#10;bob@example.com"
              data-testid="members-invite-emails"
            />
          </UFormField>
          <div class="grid gap-4 sm:grid-cols-2">
            <UFormField label="默认角色" name="roleId">
              <USelect
                v-model="inviteForm.roleId"
                :items="roleOptions"
                class="w-full"
                data-testid="members-invite-role"
              />
            </UFormField>
            <UFormField label="默认部门" name="departmentId">
              <USelect
                v-model="inviteForm.departmentId"
                :items="departmentOptions"
                class="w-full"
                data-testid="members-invite-department"
              />
            </UFormField>
          </div>
          <div class="flex flex-wrap gap-2 text-xs">
            <UBadge color="neutral" variant="subtle">
              识别 {{ parsedEmails.length }} 个邮箱
            </UBadge>
            <UBadge v-if="invalidEmails.length" color="warning" variant="subtle">
              格式异常 {{ invalidEmails.length }} 个
            </UBadge>
          </div>
          <UAlert
            color="info"
            variant="soft"
            icon="i-carbon-information"
            title="演示范围"
            description="邀请不会发送真实邮件，只在本页生成待接受状态与邀请记录。"
          />
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton
            label="取消"
            color="neutral"
            variant="ghost"
            data-testid="members-invite-cancel"
            @click="inviteOpen = false"
          />
          <UButton
            label="发送邀请"
            icon="i-carbon-send-alt"
            :disabled="!parsedEmails.length || invalidEmails.length > 0"
            data-testid="members-invite-submit"
            @click="submitInvite"
          />
        </div>
      </template>
    </UModal>
  </div>
</template>

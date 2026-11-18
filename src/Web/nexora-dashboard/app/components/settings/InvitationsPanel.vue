<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { Invitation } from '~/mocks'
import { invitationStatusColors, invitationStatusLabels } from '~/mocks'

const toast = useToast()
const org = useOrganizationStore()
const session = useSessionStore()
const { activeWorkspaceId } = useMockWorkspace()

const statusFilter = ref<'all' | 'pending' | 'accepted' | 'expired'>('all')
const roleName = (id: string) => org.roleRows.find(item => item.id === id)?.name ?? '未分配'
const roleOptions = computed(() => org.roleRows.map(role => ({ label: role.name, value: role.id })))

const rows = computed(() =>
  statusFilter.value === 'all'
    ? org.invitationRows
    : org.invitationRows.filter(item => item.status === statusFilter.value)
)
const pendingCount = computed(() => org.invitationRows.filter(item => item.status === 'pending').length)
const acceptedCount = computed(() => org.invitationRows.filter(item => item.status === 'accepted').length)
const expiredCount = computed(() => org.invitationRows.filter(item => item.status === 'expired').length)

const columns: TableColumn<Invitation>[] = [
  { accessorKey: 'email', header: '邮箱', id: 'email' },
  { accessorKey: 'roleId', header: '角色', id: 'role' },
  { accessorKey: 'status', header: '状态', id: 'status' },
  { accessorKey: 'sentAt', header: '发送时间', id: 'sentAt' },
  { accessorKey: 'expiresAt', header: '过期时间', id: 'expiresAt' },
  { id: 'actions', header: '操作' }
]

const createOpen = ref(false)
const createForm = reactive({ email: '', roleId: 'role-viewer' })
const createValid = computed(() => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(createForm.email.trim()))

function openCreate() {
  createForm.email = ''
  createForm.roleId = 'role-viewer'
  createOpen.value = true
}

function submitCreate() {
  if (!createValid.value) return
  org.sendInvitation(createForm.email, createForm.roleId)
  org.recordAudit(activeWorkspaceId.value, session.user.name, '创建邀请', createForm.email)
  toast.add({
    title: '邀请已创建',
    description: createForm.email + ' · 仅生成本地邀请记录',
    color: 'success',
    icon: 'i-carbon-send-alt'
  })
  createOpen.value = false
}

async function copyLink(invitation: Invitation) {
  const link = 'https://nexora.example/join?invite=' + invitation.id
  try {
    await navigator.clipboard.writeText(link)
    toast.add({ title: '邀请链接已复制', description: link, color: 'success', icon: 'i-carbon-copy' })
  } catch {
    toast.add({ title: '复制失败', description: '当前浏览器不允许访问剪贴板，请手动复制。', color: 'warning', icon: 'i-carbon-warning-alt' })
  }
}

function resend(invitation: Invitation) {
  org.resendInvitation(invitation.id)
  org.recordAudit(activeWorkspaceId.value, session.user.name, '重发邀请', invitation.email)
  toast.add({ title: '邀请已重发', description: '过期时间顺延至 2026-12-02', color: 'success', icon: 'i-carbon-send-alt' })
}

const revokeTarget = ref<Invitation | null>(null)
const revokeOpen = ref(false)
function askRevoke(invitation: Invitation) {
  revokeTarget.value = invitation
  revokeOpen.value = true
}
function confirmRevoke() {
  if (!revokeTarget.value) return
  org.revokeInvitation(revokeTarget.value.id)
  org.recordAudit(activeWorkspaceId.value, session.user.name, '撤销邀请', revokeTarget.value.email)
  toast.add({ title: '邀请已撤销', description: revokeTarget.value.email, color: 'neutral', icon: 'i-carbon-trash-can' })
  revokeOpen.value = false
  revokeTarget.value = null
}
</script>

<template>
  <div class="space-y-4" data-testid="settings-invitations">
    <UCard :ui="{ body: 'p-0 sm:p-0' }">
      <template #header>
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 class="text-sm font-semibold text-highlighted">
              邀请
            </h3>
            <p class="mt-0.5 text-xs text-muted">
              待接受 {{ pendingCount }} · 已接受 {{ acceptedCount }} · 已过期 {{ expiredCount }}
            </p>
          </div>
          <UButton
            icon="i-carbon-add"
            label="创建邀请"
            data-testid="invitations-create"
            @click="openCreate"
          />
        </div>
      </template>

      <div class="flex flex-wrap items-center gap-2 border-b border-default px-4 py-3">
        <USelect
          v-model="statusFilter"
          :items="[
            { label: '全部状态', value: 'all' },
            { label: '待接受', value: 'pending' },
            { label: '已接受', value: 'accepted' },
            { label: '已过期', value: 'expired' }
          ]"
          class="w-36"
          data-testid="invitations-status-filter"
        />
        <span class="ml-auto text-xs text-muted">共 {{ rows.length }} 条邀请</span>
      </div>

      <ResizableTable
        :data="rows"
        :columns="columns"
        class="nx-table"
        :ui="{ th: 'py-2.5', td: 'py-3' }"
        data-testid="invitations-table"
      >
        <template #email-cell="{ row }">
          <span class="font-medium text-highlighted">{{ row.original.email }}</span>
        </template>
        <template #role-cell="{ row }">
          <UBadge
            color="neutral"
            variant="subtle"
            size="sm"
            :label="roleName(row.original.roleId)"
          />
        </template>
        <template #status-cell="{ row }">
          <UBadge
            :color="invitationStatusColors[row.original.status]"
            variant="subtle"
            size="sm"
            :label="invitationStatusLabels[row.original.status]"
          />
        </template>
        <template #sentAt-cell="{ row }">
          <span class="font-mono text-xs text-muted">{{ row.original.sentAt }}</span>
        </template>
        <template #expiresAt-cell="{ row }">
          <span class="font-mono text-xs text-muted">{{ row.original.expiresAt }}</span>
        </template>
        <template #actions-cell="{ row }">
          <div class="flex gap-1">
            <UButton
              icon="i-carbon-copy"
              color="neutral"
              variant="ghost"
              size="xs"
              label="复制"
              :data-testid="'invitations-copy-' + row.original.id"
              @click="copyLink(row.original)"
            />
            <UButton
              v-if="row.original.status === 'expired'"
              icon="i-carbon-send-alt"
              color="neutral"
              variant="ghost"
              size="xs"
              label="重发"
              :data-testid="'invitations-resend-' + row.original.id"
              @click="resend(row.original)"
            />
            <UButton
              v-if="row.original.status === 'pending'"
              icon="i-carbon-trash-can"
              color="error"
              variant="ghost"
              size="xs"
              label="撤销"
              :data-testid="'invitations-revoke-' + row.original.id"
              @click="askRevoke(row.original)"
            />
          </div>
        </template>
        <template #empty>
          <UEmpty
            variant="naked"
            icon="i-carbon-email"
            title="当前状态没有邀请"
            description="切换状态筛选，或创建一条新邀请。"
            :actions="[{ label: '创建邀请', color: 'primary', variant: 'outline', size: 'sm', onClick: openCreate }]"
          />
        </template>
      </ResizableTable>
    </UCard>

    <UModal v-model:open="createOpen" title="创建邀请">
      <template #body>
        <UForm class="space-y-4" data-testid="invitations-create-dialog" @submit="submitCreate">
          <UFormField label="邮箱地址" name="email" required>
            <UInput
              v-model="createForm.email"
              type="email"
              placeholder="name@example.com"
              class="w-full"
              data-testid="invitations-create-email"
            />
          </UFormField>
          <UFormField label="分配角色" name="roleId">
            <USelect
              v-model="createForm.roleId"
              :items="roleOptions"
              class="w-full"
              data-testid="invitations-create-role"
            />
          </UFormField>
          <UAlert
            color="info"
            variant="soft"
            icon="i-carbon-information"
            title="演示范围"
            description="不会发送真实邮件；接受邀请后的成员状态不会同步到后端。"
          />
        </UForm>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton
            label="取消"
            color="neutral"
            variant="ghost"
            data-testid="invitations-create-cancel"
            @click="createOpen = false"
          />
          <UButton
            label="创建邀请"
            :disabled="!createValid"
            data-testid="invitations-create-submit"
            @click="submitCreate"
          />
        </div>
      </template>
    </UModal>

    <UModal v-model:open="revokeOpen" title="撤销邀请">
      <template #body>
        <p class="text-sm text-default" data-testid="invitations-revoke-dialog">
          确定撤销「{{ revokeTarget?.email }}」的邀请吗？撤销后该链接立即失效。
        </p>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton
            label="保留"
            color="neutral"
            variant="ghost"
            data-testid="invitations-revoke-cancel"
            @click="revokeOpen = false"
          />
          <UButton
            label="确认撤销"
            color="error"
            data-testid="invitations-revoke-confirm"
            @click="confirmRevoke"
          />
        </div>
      </template>
    </UModal>
  </div>
</template>

<script setup lang="ts">
import type { Department } from '~/mocks'

const toast = useToast()
const org = useOrganizationStore()
const session = useSessionStore()
const { activeWorkspaceId } = useMockWorkspace()

interface TreeRow {
  department: Department
  depth: number
  memberCount: number
  childCount: number
}

function flatten(parentId: string | null, depth = 0): TreeRow[] {
  return org.departmentRows
    .filter(item => item.parentId === parentId)
    .flatMap((department) => {
      const children = org.departmentRows.filter(item => item.parentId === department.id)
      return [
        {
          department,
          depth,
          memberCount: org.memberCountOf(department.id),
          childCount: children.length
        },
        ...flatten(department.id, depth + 1)
      ]
    })
}

const treeRows = computed(() => flatten(null))
const totalMembers = computed(() => new Set(org.memberRows.filter(item => item.status !== 'disabled').map(item => item.id)).size)

const formOpen = ref(false)
const editingId = ref<string | null>(null)
const form = reactive({ name: '', parentKey: 'root' })
const formTitle = computed(() => (editingId.value ? '编辑部门' : '新建部门'))

function descendantsOf(id: string): string[] {
  const children = org.departmentRows.filter(item => item.parentId === id)
  return children.flatMap(child => [child.id, ...descendantsOf(child.id)])
}

const parentOptions = computed(() => {
  const blocked = editingId.value ? new Set([editingId.value, ...descendantsOf(editingId.value)]) : new Set<string>()
  return org.departmentRows
    .filter(item => !blocked.has(item.id))
    .map((item) => {
      const depth = (() => {
        let level = 0
        let current: Department | undefined = item
        while (current?.parentId) {
          level += 1
          current = org.departmentRows.find(candidate => candidate.id === current?.parentId)
        }
        return level
      })()
      return { label: '　'.repeat(depth) + item.name, value: item.id }
    })
})

function openCreate(parentId: string | null = null) {
  editingId.value = null
  form.name = ''
  form.parentKey = parentId ?? 'root'
  formOpen.value = true
}

function openEdit(row: TreeRow) {
  editingId.value = row.department.id
  form.name = row.department.name
  form.parentKey = row.department.parentId ?? 'root'
  formOpen.value = true
}

function saveDepartment() {
  const name = form.name.trim()
  if (!name) return
  const parentId = form.parentKey && form.parentKey !== 'root' ? form.parentKey : null
  if (editingId.value) {
    org.renameDepartment(editingId.value, name)
    const current = org.departmentRows.find(item => item.id === editingId.value)
    if (current) current.parentId = parentId
    org.recordAudit(activeWorkspaceId.value, session.user.name, '编辑部门', name)
    toast.add({ title: '部门已更新', description: name, color: 'success', icon: 'i-carbon-checkmark' })
  } else {
    org.addDepartment(name, parentId)
    org.recordAudit(activeWorkspaceId.value, session.user.name, '新建部门', name)
    toast.add({ title: '部门已创建', description: name, color: 'success', icon: 'i-carbon-add-alt' })
  }
  formOpen.value = false
}

const deleteTarget = ref<TreeRow | null>(null)
const deleteOpen = ref(false)
const deleteBlocked = computed(() => Boolean(deleteTarget.value && (deleteTarget.value.childCount > 0 || deleteTarget.value.memberCount > 0)))

function askDelete(row: TreeRow) {
  deleteTarget.value = row
  deleteOpen.value = true
}

function confirmDelete() {
  if (!deleteTarget.value || deleteBlocked.value) return
  org.removeDepartment(deleteTarget.value.department.id)
  org.recordAudit(activeWorkspaceId.value, session.user.name, '删除部门', deleteTarget.value.department.name)
  toast.add({ title: '部门已删除', description: deleteTarget.value.department.name, color: 'neutral', icon: 'i-carbon-trash-can' })
  deleteOpen.value = false
  deleteTarget.value = null
}
</script>

<template>
  <div class="space-y-4" data-testid="settings-departments">
    <UCard :ui="{ body: 'p-0 sm:p-0' }">
      <template #header>
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 class="text-sm font-semibold text-highlighted">
              部门
            </h3>
            <p class="mt-0.5 text-xs text-muted">
              {{ treeRows.length }} 个部门 · {{ totalMembers }} 名在职成员
            </p>
          </div>
          <UButton
            icon="i-carbon-add"
            label="新建部门"
            data-testid="departments-add"
            @click="openCreate()"
          />
        </div>
      </template>

      <div class="divide-y divide-default" data-testid="departments-tree">
        <div
          v-for="row in treeRows"
          :key="row.department.id"
          class="flex flex-wrap items-center gap-2 px-4 py-2.5 transition-colors hover:bg-elevated/40"
          :style="{ paddingLeft: 16 + row.depth * 24 + 'px' }"
          :data-testid="'department-row-' + row.department.id"
        >
          <UIcon :name="row.childCount ? 'i-carbon-tree-view-alt' : 'i-carbon-folder'" class="size-4 shrink-0 text-muted" />
          <span class="min-w-0 flex-1 truncate text-sm font-medium text-highlighted">{{ row.department.name }}</span>
          <UBadge color="neutral" variant="subtle" size="sm">
            {{ row.memberCount }} 人
          </UBadge>
          <UBadge
            v-if="row.childCount"
            color="info"
            variant="subtle"
            size="sm"
          >
            {{ row.childCount }} 个子部门
          </UBadge>
          <div class="flex gap-1">
            <UButton
              icon="i-carbon-add"
              color="neutral"
              variant="ghost"
              size="xs"
              label="子部门"
              :data-testid="'departments-add-child-' + row.department.id"
              @click="openCreate(row.department.id)"
            />
            <UButton
              icon="i-carbon-edit"
              color="neutral"
              variant="ghost"
              size="xs"
              label="编辑"
              :data-testid="'departments-edit-' + row.department.id"
              @click="openEdit(row)"
            />
            <UButton
              icon="i-carbon-trash-can"
              color="error"
              variant="ghost"
              size="xs"
              label="删除"
              :disabled="Boolean(row.childCount || row.memberCount)"
              :data-testid="'departments-delete-' + row.department.id"
              @click="askDelete(row)"
            />
          </div>
        </div>
      </div>

      <template #footer>
        <p class="text-xs text-muted">
          有子部门或在职成员的部门不可删除；删除只影响本次预览。
        </p>
      </template>
    </UCard>

    <UModal v-model:open="formOpen" :title="formTitle">
      <template #body>
        <UForm class="space-y-4" data-testid="departments-form" @submit="saveDepartment">
          <UFormField label="部门名称" name="name" required>
            <UInput
              v-model="form.name"
              class="w-full"
              placeholder="如 华东仓储部"
              data-testid="departments-form-name"
            />
          </UFormField>
          <UFormField label="上级部门" name="parent">
            <USelect
              v-model="form.parentKey"
              :items="[{ label: '无（顶级部门）', value: 'root' }, ...parentOptions]"
              class="w-full"
              data-testid="departments-form-parent"
            />
          </UFormField>
          <UAlert
            color="info"
            variant="soft"
            icon="i-carbon-information"
            title="演示范围"
            description="部门与成员归属只保存在当前浏览器会话，刷新后恢复初始结构。"
          />
        </UForm>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton
            label="取消"
            color="neutral"
            variant="ghost"
            data-testid="departments-form-cancel"
            @click="formOpen = false"
          />
          <UButton
            label="保存"
            :disabled="!form.name.trim()"
            data-testid="departments-form-save"
            @click="saveDepartment"
          />
        </div>
      </template>
    </UModal>

    <UModal v-model:open="deleteOpen" title="删除部门">
      <template #body>
        <div class="space-y-3" data-testid="departments-delete-dialog">
          <p class="text-sm text-default">
            确定删除「{{ deleteTarget?.department.name }}」吗？
          </p>
          <UAlert
            v-if="deleteBlocked"
            color="warning"
            variant="soft"
            icon="i-carbon-warning-alt"
            title="该部门仍在使用"
            :description="'包含 ' + (deleteTarget?.childCount ?? 0) + ' 个子部门与 ' + (deleteTarget?.memberCount ?? 0) + ' 名在职成员。请先迁移成员或删除子部门。'"
            data-testid="departments-delete-blocked"
          />
          <UAlert
            v-else
            color="info"
            variant="soft"
            icon="i-carbon-information"
            title="删除只影响本次预览"
          />
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton
            label="取消"
            color="neutral"
            variant="ghost"
            data-testid="departments-delete-cancel"
            @click="deleteOpen = false"
          />
          <UButton
            label="确认删除"
            color="error"
            :disabled="deleteBlocked"
            data-testid="departments-delete-confirm"
            @click="confirmDelete"
          />
        </div>
      </template>
    </UModal>
  </div>
</template>

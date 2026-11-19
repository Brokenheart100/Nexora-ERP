import type { Department, WorkspaceAccess } from '~/utils/organization/workspaceGovernance'

export function useOrderDepartments(workspaceId: string, prefix: string) {
  const departments = shallowRef<Department[]>([])
  const access = shallowRef<WorkspaceAccess>()
  const unassignedAllowed = computed(() => access.value?.permissions.includes(prefix + 'create') ?? false)
  const availableDepartments = computed(() => departments.value.filter(item => permits('create', item.id)))

  function permits(operation: string, departmentId: string | null) {
    const permission = prefix + operation
    return access.value?.permissions.includes(permission) ||
      !!departmentId && access.value?.scopedPermissions?.some(grant =>
        grant.permission === permission && grant.departmentId === departmentId) === true
  }

  async function refresh() {
    const [directory, snapshot] = await Promise.all([
      loadDepartments(workspaceId),
      $fetch<WorkspaceAccess>(`/bff/api/workspaces/${workspaceId}/access`, { retry: 0 }),
    ])
    departments.value = directory
    access.value = snapshot
  }

  const departmentName = (id: string | null) => departments.value.find(item => item.id === id)?.name ?? ''
  return { departments, unassignedAllowed, availableDepartments, permits, refresh, departmentName }
}

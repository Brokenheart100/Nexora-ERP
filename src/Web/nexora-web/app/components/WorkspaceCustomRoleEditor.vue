<script setup lang="ts">
import type { CustomRole, CustomRoleCatalog, WorkspaceAccess } from '~/utils/workspaceGovernance'

const props = defineProps<{ workspaceId: string; permissionNames: Record<string, string> }>()
const catalog = shallowRef<CustomRoleCatalog>()
const access = shallowRef<WorkspaceAccess>()
const selectedId = ref('')
const name = ref('')
const permissions = ref<string[]>([])
const busy = ref(true)
const notice = ref('')
const canEdit = computed(() => access.value?.permissions.includes('organization.business-roles.manage'))
const scopeLabels = (scopes: string[]) => scopes.map(scope => roleScopeNames[scope]).join('、')
const roleOptions = computed(() => [
  { label: canEdit.value ? '新建角色' : '选择角色', value: '__new__' },
  ...(catalog.value?.roles ?? []).map(role => ({ label: `${role.name} · v${role.revision}`, value: role.id })),
])
const roleSelection = computed({
  get: () => selectedId.value || '__new__',
  set: value => select(catalog.value?.roles.find(role => role.id === String(value))),
})

function togglePermission(code: string, checked: boolean | 'indeterminate') {
  const values = new Set(permissions.value)
  if (checked === true) values.add(code)
  else values.delete(code)
  permissions.value = [...values]
}

function select(role?: CustomRole) {
  selectedId.value = role?.id ?? ''
  name.value = role?.name ?? ''
  permissions.value = [...(role?.permissions ?? [])]
}

async function refresh() {
  const [directory, current] = await Promise.all([
    loadCustomRoles(props.workspaceId),
    $fetch<WorkspaceAccess>(`/bff/api/workspaces/${props.workspaceId}/access`, { retry: 0 }),
  ])
  catalog.value = directory
  access.value = current
}

async function save() {
  if (!canEdit.value || busy.value) return
  busy.value = true
  notice.value = ''
  try {
    const role = await writeGovernance<CustomRole>(props.workspaceId, '/custom-roles', access.value!.authorizationVersion, {
      roleId: selectedId.value || null, name: name.value, permissions: permissions.value,
    })
    await refresh()
    select(role)
    notice.value = '自定义角色已保存。'
  } catch {
    notice.value = '保存未完成。请重新加载角色后核对内容。'
  } finally {
    busy.value = false
  }
}

async function load() {
  busy.value = true
  notice.value = ''
  try {
    await refresh()
    select(catalog.value?.roles.find(role => role.id === selectedId.value))
  } catch {
    catalog.value = undefined
    access.value = undefined
    notice.value = '自定义角色加载失败。'
  } finally {
    busy.value = false
  }
}

onMounted(load)
</script>

<template>
  <section class="card custom-roles">
    <div class="actions">
      <h2><UIcon class="heading-icon" name="i-lucide-user-cog" aria-hidden="true" />自定义角色</h2>
      <button class="quiet" type="button" :disabled="busy" @click="load">重新加载角色</button>
    </div>
    <UAlert v-if="notice" role="status" :description="notice" />
    <template v-if="catalog">
      <UFormField label="选择自定义角色" name="customRole">
        <USelect v-model="roleSelection" :items="roleOptions" :disabled="busy" />
      </UFormField>
      <form v-if="canEdit" @submit.prevent="save">
        <UFormField label="自定义角色名称" name="roleName">
          <UInput :model-value="name" maxlength="80" required :disabled="busy"
            @update:model-value="value => name = String(value).trim()" />
        </UFormField>
        <fieldset :disabled="busy">
          <legend>逐项选择权限</legend>
          <UCheckbox v-for="item in catalog.permissions" :key="item.code" class="permission"
            :model-value="permissions.includes(item.code)" :value="item.code"
            :aria-label="permissionNames[item.code] ?? item.code"
            @update:model-value="checked => togglePermission(item.code, checked)">
            <template #label>
              <span>{{ permissionNames[item.code] ?? item.code }} <small>· {{ scopeLabels(item.scopes) }}</small></span>
            </template>
          </UCheckbox>
        </fieldset>
        <p v-if="selectedId" class="hint">保存会生成角色版本，已批准的授权继续使用原权限。可为成员申请新版授权。</p>
        <button class="primary" :disabled="busy || !permissions.length">保存自定义角色</button>
      </form>
      <ul v-else-if="selectedId">
        <li v-for="permission in permissions" :key="permission">{{ permissionNames[permission] ?? permission }}</li>
      </ul>
    </template>
  </section>
</template>

<style scoped>
.custom-roles { display: grid; gap: 12px; }
.custom-roles form { display: grid; justify-items: start; gap: 10px; }
.custom-roles fieldset { width: 100%; }
.actions { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 10px; }
.permission { display: flex; align-items: center; gap: 8px; padding: 5px 0; }
.permission small { color: var(--nx-ink-3); }
</style>

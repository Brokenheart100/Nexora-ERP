<script setup lang="ts">
import type { WorkspaceRole } from '~/utils/workspaceGovernance'

const props = defineProps<{ roles: WorkspaceRole[]; disabled: boolean; showPresets?: boolean }>()
const model = defineModel<string[]>({ required: true })
const presets = [
  { label: '仅工作区权限', roles: [] },
  { label: '采购与销售制单', roles: ['PurchasingOperator', 'SalesOperator'] },
  { label: '销售与财务制单', roles: ['SalesOperator', 'Accountant'] },
  { label: '采购与销售审批', roles: ['PurchasingApprover', 'SalesApprover'] },
]
const availablePresets = computed(() => presets.filter(preset =>
  preset.roles.every(code => props.roles.some(role => role.code === code))))
const presetIndex = computed(() => availablePresets.value.findIndex(preset =>
  preset.roles.length === model.value.length && preset.roles.every(code => model.value.includes(code))))
const presetOptions = computed(() => availablePresets.value.map((preset, index) => ({ label: preset.label, value: index })))
const presetValue = computed(() => presetIndex.value < 0 ? undefined : presetIndex.value)

function choosePreset(index: number) {
  const preset = availablePresets.value[index]
  if (preset) model.value = [...preset.roles]
}

function toggle(role: WorkspaceRole, checked: boolean) {
  const otherRoles = model.value.filter(code => code !== role.code &&
    (!checked || props.roles.find(item => item.code === code)?.area !== role.area))
  model.value = checked ? [...otherRoles, role.code] : otherRoles
}
</script>

<template>
  <fieldset class="role-picker" :disabled="disabled">
    <legend>业务角色</legend>
    <UFormField v-if="showPresets" class="preset" label="权限预设" name="preset">
      <USelect :model-value="presetValue" :items="presetOptions" placeholder="手动选择"
        @update:model-value="value => choosePreset(Number(value))" />
    </UFormField>
    <p class="mt-2 text-[12px] leading-[1.62] text-nx-ink-3">可以跨业务模块多选，每个模块可选一个角色。</p>
    <div class="role-options">
      <UCheckbox v-for="role in roles" :key="role.code" :model-value="model.includes(role.code)"
        :value="role.code" :label="workspaceRoleName(role.code)"
        @update:model-value="checked => toggle(role, checked === true)" />
    </div>
  </fieldset>
</template>

<style scoped>
.role-picker { border: 1px solid var(--nx-border); border-radius: 8px; padding: 12px; min-width: 0; }
legend { font-weight: 600; padding-inline: 5px; }
.preset { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.role-options { display: flex; flex-wrap: wrap; gap: 8px 18px; }
</style>

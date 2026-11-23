<script setup lang="ts">
import type { OrganizationRole } from '#shared/types/workspace-administration'
import { executionAreas, roleChoices } from '~/utils/organization/governance'

const props = defineProps<{ roles: OrganizationRole[] | null }>()
const values = defineModel<Record<string, string>>({ required: true })
function options(area: (typeof executionAreas)[number]) {
  const codes = props.roles?.filter(role => role.area?.toLowerCase() === area.code).map(role => role.code) ?? area.roles
  return [{ label: '无', value: 'none' }, ...roleChoices(codes)]
}
</script>

<template>
  <div class="grid gap-3 sm:grid-cols-3">
    <UFormField v-for="area in executionAreas" :key="area.id" :label="area.label">
      <USelect
        :model-value="values[area.id] || 'none'"
        :items="options(area)"
        class="w-full"
        :data-testid="'execution-role-' + area.id"
        @update:model-value="values[area.id] = $event === 'none' ? '' : $event"
      />
    </UFormField>
  </div>
</template>

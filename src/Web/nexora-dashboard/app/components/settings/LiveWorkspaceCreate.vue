<script setup lang="ts">
import { useAdministration, useAdministrationMutation } from '~/composables/settings/useAdministration'
import type { WireWorkspace } from '#shared/types/wire'

const props = defineProps<{ personal: boolean }>()
const emit = defineEmits<{ created: [] }>()
const { auth, session, api } = useAdministration('account')
const mutation = useAdministrationMutation<WireWorkspace>(() => auth.user?.subject ?? '')
const name = ref('')
const matches = ref<WireWorkspace[]>([])

async function open(workspace: WireWorkspace) {
  await session.load(workspace.id)
  emit('created')
  await navigateTo({ path: workspace.isPersonal ? '/finance' : '/setup', query: {
    workspace: workspace.id, ...(workspace.isPersonal ? { tab: 'workbench' } : {})
  } })
}

async function readCurrent() {
  matches.value = (await api.workspaces()).filter(item => item.isPersonal === props.personal && item.name === name.value.trim())
}
</script>

<template>
  <form class="space-y-4" @submit.prevent="mutation.run(() => api.open(personal, name.trim()), open)">
    <UFormField label="工作区名称" required>
      <UInput
        v-model="name"
        autofocus
        required
        maxlength="160"
        class="w-full"
        :disabled="mutation.busy || mutation.unknown"
        data-testid="live-workspace-name"
      />
    </UFormField>
    <UButton
      type="submit"
      label="创建工作区"
      :disabled="!name.trim() || mutation.unknown || mutation.confirmed"
      :loading="mutation.busy"
      data-testid="live-workspace-create"
    />
    <SettingsAdministrationStatus :state="mutation" @refresh="mutation.readCurrent(readCurrent)" @acknowledge="mutation.acknowledge" />
    <div v-if="matches.length" class="flex flex-wrap gap-2">
      <UButton
        v-for="match in matches"
        :key="match.id"
        color="neutral"
        variant="outline"
        :label="'打开 ' + match.name"
        @click="open(match)"
      />
    </div>
  </form>
</template>

<script setup lang="ts">
interface Entry { id: string; version: number; state: string; on: string; importProvider: string | null; externalId: string | null }
const props = defineProps<{ base: string; rows: Entry[]; canDraft: boolean; canPost: boolean }>()
const emit = defineEmits<{ changed: [] }>()
const selected = ref<string[]>([])
const busy = ref(false)
const notice = ref('')
const submit = useWorkspaceMutation()
const pending = computed(() => props.rows.filter(row => row.state === 'draft' || row.state === 'submitted'))
const choices = computed(() => pending.value.map(row => ({
  value: row.id, label: row.on + ' · ' + row.importProvider + ' / ' + row.externalId,
})))
const chosen = computed(() => pending.value.filter(row => selected.value.includes(row.id)))
watch(() => props.rows, () => { selected.value = [] })
async function decide(decision: 'submit' | 'cancel' | 'post') {
  busy.value = true
  notice.value = ''
  try {
    await submit('imported-journal-' + decision, props.base + '/journals/imported/batch-decision', 'POST', {
      decision, journals: chosen.value.map(({ id, version }) => ({ id, version })),
    })
    emit('changed')
  } catch (error) {
    notice.value = (error as { data?: { detail?: string } }).data?.detail ?? '批量操作失败。'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <details v-if="pending.length && (canDraft || canPost)" class="my-4">
    <summary>外部凭证批量处理</summary>
    <UAlert v-if="notice" color="error" role="alert" :description="notice" />
    <UCheckboxGroup v-model="selected" :items="choices" :disabled="busy" />
    <div class="flex flex-wrap gap-2">
      <UButton v-if="canDraft" type="button" :disabled="busy || !chosen.length || chosen.some(row => row.state !== 'draft')" @click="decide('submit')">批量提交复核</UButton>
      <UButton v-if="canPost" type="button" :disabled="busy || !chosen.length || chosen.some(row => row.state !== 'submitted')" @click="decide('post')">批量过账</UButton>
      <UButton v-if="canDraft" type="button" variant="outline" :disabled="busy || !chosen.length" @click="decide('cancel')">批量作废</UButton>
    </div>
  </details>
</template>

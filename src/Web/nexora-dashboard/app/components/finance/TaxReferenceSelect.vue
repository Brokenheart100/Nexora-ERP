<script setup lang="ts">
import { useMasterDataApi } from '~/composables/api/useMasterDataApi'
import { usePartnersApi } from '~/composables/api/usePartnersApi'
import { useWorkspaceQuery } from '~/composables/api/useWorkspaceQuery'

const props = defineProps<{ kind: 'item' | 'partner', label: string, inputId: string, disabled?: boolean }>()
const value = defineModel<string>({ required: true })
const catalog = useMasterDataApi()
const partners = usePartnersApi()
const page = ref(1)
const pageSize = 50
const query = useWorkspaceQuery('tax-references', '/finance', async (workspace, signal) => {
  return props.kind === 'item'
    ? (await catalog.catalog(workspace, page.value, signal, pageSize)).data.page
    : await partners.list(workspace, page.value, undefined, signal, pageSize)
}, () => [props.kind, page.value])
const options = computed(() => [
  { value: 'none', label: '请选择' },
  ...(query.data?.items ?? []).filter(row => row.isActive).map(row => ({ value: row.id, label: row.code + ' · ' + row.name }))
])
const selection = computed({
  get: () => value.value || 'none',
  set: (selected) => { value.value = selected === 'none' ? '' : selected }
})
watch(() => query.owner, () => {
  value.value = ''
  page.value = 1
}, { flush: 'sync' })
watch(() => props.kind, () => {
  value.value = ''
  page.value = 1
})
function changePage(number: number) {
  value.value = ''
  page.value = number
}
</script>

<template>
  <UFormField :label="label" :error="query.problem">
    <USelect
      v-model="selection"
      :items="options"
      class="w-full"
      :loading="query.loading"
      :disabled="disabled || !!query.problem"
      :data-testid="inputId"
    />
    <div v-if="page > 1 || query.data?.hasMore" class="mt-1 flex items-center gap-2">
      <UButton
        size="xs"
        variant="ghost"
        label="上一页"
        :disabled="disabled || page === 1 || query.loading"
        @click="changePage(page - 1)"
      />
      <span class="text-xs text-muted">第 {{ page }} 页</span>
      <UButton
        size="xs"
        variant="ghost"
        label="下一页"
        :disabled="disabled || !query.data?.hasMore || query.loading"
        @click="changePage(page + 1)"
      />
    </div>
  </UFormField>
</template>

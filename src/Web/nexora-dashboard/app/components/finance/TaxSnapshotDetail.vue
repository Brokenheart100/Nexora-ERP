<script setup lang="ts">
import { useTaxApi } from '~/composables/api/useTaxApi'
import { useWorkspaceQuery } from '~/composables/api/useWorkspaceQuery'

const props = defineProps<{ id: string }>()
const open = ref(false)
const api = useTaxApi()
const query = useWorkspaceQuery('tax-assessment-detail', '/finance', (workspace, signal) =>
  open.value ? api.assessment(workspace, props.id, signal) : Promise.resolve(null), () => open.value ? props.id : '')
watch(() => query.owner, () => {
  open.value = false
}, { flush: 'sync' })
</script>

<template>
  <USlideover v-model:open="open" title="税额评估快照">
    <UButton
      label="查看税额快照"
      icon="i-carbon-document-view"
      size="xs"
      color="neutral"
      variant="ghost"
      data-testid="tax-assessment-detail-open"
    />
    <template #body>
      <USkeleton v-if="query.loading" class="h-32 w-full" />
      <UAlert v-else-if="query.problem" color="error" :title="query.problem">
        <template #actions>
          <UButton label="重试读取" variant="outline" @click="query.refresh()" />
        </template>
      </UAlert>
      <div v-else-if="query.data" data-testid="tax-assessment-detail">
        <FinanceTaxSnapshotSummary :snapshot="query.data" />
        <p class="mt-3 break-all text-xs text-muted">
          快照 ID {{ query.data.id }}
        </p>
      </div>
    </template>
  </USlideover>
</template>

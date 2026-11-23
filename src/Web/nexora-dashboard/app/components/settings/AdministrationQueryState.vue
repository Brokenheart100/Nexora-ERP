<script setup lang="ts">
defineProps<{ query: { loading: boolean, problem: string, status: number, traceId: string, enabled: boolean, refresh: () => unknown } }>()
</script>

<template>
  <USkeleton v-if="query.loading" class="h-20 w-full" />
  <UAlert
    v-else-if="query.problem"
    :color="[403, 404].includes(query.status) ? 'warning' : 'error'"
    variant="subtle"
    :title="query.problem"
    :description="query.traceId ? '请求编号 ' + query.traceId : undefined"
  >
    <template #actions>
      <UButton
        color="neutral"
        variant="outline"
        size="sm"
        label="重新读取"
        @click="query.refresh()"
      />
    </template>
  </UAlert>
</template>

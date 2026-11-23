<script setup lang="ts">
defineProps<{
  message?: string
  submission: { message: string, record: unknown, mutation: { busy: boolean, operation?: { retryAvailable: boolean } | null } }
}>()
const emit = defineEmits<{ check: [], retry: [] }>()
</script>

<template>
  <UAlert
    v-if="message || submission.message || submission.record"
    color="warning"
    variant="soft"
    :title="message || submission.message || '有一笔提交待确认。'"
    data-testid="sales-operation-status"
  >
    <template #actions>
      <UButton
        v-if="submission.record"
        label="核对原提交"
        variant="outline"
        :loading="submission.mutation.busy"
        @click="emit('check')"
      />
      <UButton v-if="submission.mutation.operation?.retryAvailable" label="重试原提交" @click="emit('retry')" />
    </template>
  </UAlert>
</template>

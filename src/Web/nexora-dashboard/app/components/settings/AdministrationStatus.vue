<script setup lang="ts">
defineProps<{ state: { message: string, busy: boolean, unknown: boolean, reviewed: boolean, reauthenticate?: string, confirmed: boolean, operation: { retryAvailable: boolean } | null, retry: () => unknown } }>()
defineEmits<{ refresh: [], acknowledge: [] }>()
</script>

<template>
  <UAlert
    v-if="state.message"
    :color="state.unknown ? 'warning' : 'error'"
    variant="subtle"
    :title="state.message"
    data-testid="administration-action-status"
  >
    <template #actions>
      <UButton
        v-if="state.reauthenticate"
        :to="state.reauthenticate"
        external
        size="sm"
        label="重新验证"
      />
      <UButton
        color="neutral"
        variant="outline"
        size="sm"
        label="读取当前记录"
        :loading="state.busy"
        @click="$emit('refresh')"
      />
      <UButton
        v-if="state.reviewed && state.operation?.retryAvailable"
        size="sm"
        label="重试原操作"
        :disabled="state.busy"
        @click="state.retry()"
      />
      <UButton
        v-if="state.reviewed"
        color="neutral"
        variant="outline"
        size="sm"
        label="已核对，继续操作"
        :disabled="state.busy"
        @click="$emit('acknowledge')"
      />
    </template>
  </UAlert>
  <p v-else-if="state.confirmed" class="text-sm text-success" role="status">
    操作已确认。
  </p>
</template>

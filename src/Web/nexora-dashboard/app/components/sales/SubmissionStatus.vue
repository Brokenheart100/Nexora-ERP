<script setup lang="ts">
import type { SalesConnection } from '~/composables/sales/useSalesConnection'
import { loginDestination } from '#shared/utils/auth-navigation'

const props = defineProps<{ connection: SalesConnection, editing?: boolean }>()
const emit = defineEmits<{ retry: [] }>()
const submission = computed(() => props.connection.submission)
const route = useRoute()
const login = computed(() => '/bff/login?prompt=login&returnTo=' + encodeURIComponent(loginDestination(route.fullPath)))
</script>

<template>
  <UAlert
    v-if="submission.message || submission.record || connection.actionError"
    color="warning"
    variant="soft"
    :title="connection.actionError || submission.message || '有一笔提交待确认。'"
    data-testid="sales-submission-status"
  >
    <template #actions>
      <UButton
        v-if="connection.conflict"
        label="读取当前版本"
        variant="outline"
        data-testid="sales-reload-version"
        @click="connection.reloadBaseline(editing)"
      />
      <UButton
        v-if="submission.record?.state === 'unknown'"
        label="核对原提交"
        variant="outline"
        :loading="submission.mutation.busy"
        data-testid="sales-check-submission"
        @click="() => { if (!submission.mutation.unknown) submission.resume(); void connection.checkSubmission() }"
      />
      <UButton
        v-if="submission.mutation.operation?.retryAvailable"
        label="重试原提交"
        data-testid="sales-retry-submission"
        @click="emit('retry')"
      />
      <UButton
        v-if="submission.record?.state === 'mfa'"
        label="重新验证"
        :to="login"
        external
      />
      <UButton
        v-if="submission.record?.state === 'mfa'"
        label="已完成验证"
        variant="outline"
        @click="submission.resume()"
      />
    </template>
  </UAlert>
</template>

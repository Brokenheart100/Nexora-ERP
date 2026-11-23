<script setup lang="ts">
import type { TreasuryWrite } from '~/composables/finance/useTreasuryWrite'
import { loginDestination } from '#shared/utils/auth-navigation'

const props = defineProps<{ write: TreasuryWrite, check: () => Promise<void>, retry: () => Promise<void>, error?: string }>()
const submission = computed(() => props.write.submission)
const route = useRoute()
const login = computed(() => '/bff/login?prompt=login&returnTo=' + encodeURIComponent(loginDestination(route.fullPath)))
</script>

<template>
  <UAlert v-if="error || submission.message || submission.record" color="warning" variant="soft"
    :title="error || submission.message || '有一笔提交待确认。'" data-testid="treasury-submission-status">
    <template #actions>
      <UButton v-if="submission.record?.state === 'unknown'" label="核对原提交" variant="outline"
        :loading="submission.mutation.busy" @click="check" />
      <UButton v-if="submission.mutation.operation?.retryAvailable" label="重试原提交" @click="retry" />
      <UButton v-if="submission.record?.state === 'mfa'" label="重新验证" :to="login" external />
      <UButton v-if="submission.record?.state === 'mfa'" label="已完成验证" variant="outline" @click="submission.resume()" />
      <UButton v-if="[409, 412].includes(submission.failure?.status ?? 0)" label="读取当前数据" variant="outline" @click="check" />
    </template>
  </UAlert>
</template>

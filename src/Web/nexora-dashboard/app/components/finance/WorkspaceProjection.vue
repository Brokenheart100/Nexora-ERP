<script setup lang="ts">
import { useReportingApi } from '~/composables/api/useReportingApi'
import { useWorkspaceQuery } from '~/composables/api/useWorkspaceQuery'

const props = defineProps<{ pagePath: '/' | '/finance' }>()
const api = useReportingApi()
const query = useWorkspaceQuery('workspace-reporting-projection', props.pagePath, api.projection)
const state = computed(() => query.data?.state ?? (query.status === 403 || query.status === 404 ? 'denied' : query.problem ? 'unavailable' : 'loading'))
const labels = {
  ready: '已同步',
  pending: '待同步',
  denied: '不可访问',
  unavailable: '暂不可用',
  loading: '正在读取'
}
const ready = computed(() => query.data?.state === 'ready' ? query.data.projection : null)
defineExpose({ refresh: query.refresh })
</script>

<template>
  <UCard class="rounded-sm" data-testid="live-workspace-projection">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div class="space-y-1">
        <div class="flex items-center gap-2">
          <h2 class="text-sm font-semibold">
            工作区投影
          </h2>
          <UBadge
            :label="labels[state]"
            :color="state === 'ready' ? 'success' : state === 'pending' ? 'warning' : 'neutral'"
            variant="subtle"
            data-testid="projection-status"
          />
        </div>
        <p v-if="ready" class="text-sm" data-testid="projection-version">
          {{ ready.name }} · {{ ready.countryCode }} · {{ ready.baseCurrency }} · 版本 {{ ready.version }}
        </p>
        <p v-if="ready" class="text-xs text-muted" data-testid="projection-updated">
          同步于 {{ ready.projectedAtUtc }}
        </p>
        <p v-else-if="state === 'pending'" class="text-xs text-muted">
          工作区数据正在同步，可稍后刷新。
        </p>
        <p v-else-if="state === 'denied'" class="text-xs text-muted">
          当前身份无法访问该工作区投影。
        </p>
        <p v-else-if="state === 'unavailable'" class="text-xs text-muted">
          {{ query.problem }}
        </p>
      </div>
      <UButton
        label="刷新投影"
        color="neutral"
        variant="outline"
        size="xs"
        :loading="query.loading"
        @click="query.refresh()"
      />
    </div>
  </UCard>
</template>

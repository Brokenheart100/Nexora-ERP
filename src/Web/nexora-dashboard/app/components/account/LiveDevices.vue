<script setup lang="ts">
import { z } from 'zod'
import { deviceAuthorizationPath, type DeviceClient } from '#shared/types/device-authorization'
import { useDashboardApi } from '~/composables/api/useDashboardApi'

const client = useDashboardApi('account')
const configSchema = z.object({ clientId: z.string(), scopes: z.string() })
const { data, status, error, refresh } = useAsyncData('live-device-clients', async () => Promise.all(
  (['cli', 'mcp'] as const).map(async (flow: DeviceClient) => {
    const config = await client.get(deviceAuthorizationPath(flow))
    return { flow, ...configSchema.parse(config.data) }
  })
), { server: false, lazy: true })
</script>

<template>
  <div class="space-y-3" data-testid="live-device-authorization">
    <USkeleton v-if="status === 'pending'" class="h-24 w-full" />
    <UAlert
      v-if="error"
      title="无法读取设备授权配置"
      color="warning"
      variant="subtle"
    >
      <template #actions>
        <UButton
          label="重新读取"
          size="sm"
          color="neutral"
          variant="outline"
          @click="refresh()"
        />
      </template>
    </UAlert>
    <UCard v-for="item in data ?? []" :key="item.flow">
      <template #header>
        <h3 class="font-medium">
          {{ item.flow.toUpperCase() }}
        </h3>
      </template>
      <div class="space-y-3">
        <p class="text-sm text-muted">
          {{ item.clientId }} · {{ item.scopes }}
        </p>
        <UButton
          :to="'/' + item.flow + '/authorize'"
          label="输入设备代码"
          size="sm"
          color="neutral"
          variant="outline"
        />
      </div>
    </UCard>
    <UButton
      to="/bff/account"
      external
      label="管理已授权应用"
      color="neutral"
      variant="ghost"
      size="sm"
    />
  </div>
</template>

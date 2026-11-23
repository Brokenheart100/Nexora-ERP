<script setup lang="ts">
import { deviceAuthorizationPath, deviceUserCodeSchema } from '#shared/types/device-authorization'

definePageMeta({ alias: ['/mcp/authorize'], layout: false })
const route = useRoute()
const client = computed(() => route.path.startsWith('/mcp/') ? 'mcp' : 'cli')
const code = ref(typeof route.query.user_code === 'string' ? route.query.user_code : '')
const entered = computed(() => deviceUserCodeSchema.safeParse(code.value))
const verificationUrl = computed(() => entered.value.success
  ? deviceAuthorizationPath(client.value) + '/verification?' + new URLSearchParams({ user_code: entered.value.data })
  : undefined)
useHead({ title: '设备授权 · Nexora ERP' })
</script>

<template>
  <main class="mx-auto flex min-h-screen w-full max-w-lg items-center px-4 py-8">
    <UCard class="w-full" data-testid="device-authorization-page">
      <template #header>
        <h1 class="text-lg font-semibold">
          授权 {{ client.toUpperCase() }} 设备
        </h1>
      </template>
      <div class="space-y-4">
        <UFormField label="设备用户代码" description="核对命令行显示的代码后，前往身份服务选择同意或拒绝。">
          <UInput
            v-model="code"
            maxlength="9"
            placeholder="ABCD-EFGH"
            autocomplete="off"
            spellcheck="false"
            class="w-full font-mono"
            data-testid="device-user-code"
          />
        </UFormField>
        <UButton
          :to="verificationUrl"
          external
          :disabled="!verificationUrl"
          label="前往身份服务"
          data-testid="verify-device"
        />
      </div>
    </UCard>
  </main>
</template>

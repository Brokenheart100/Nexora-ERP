<script setup lang="ts">
const route = useRoute()
const code = computed(() => typeof route.query.user_code === 'string' ? route.query.user_code : '')
const identityUrl = ref('')
const error = ref('')
const loading = ref(true)

onMounted(async () => {
  if (!code.value) {
    error.value = '缺少设备授权码，请重新运行 nexora-cli login。'
    loading.value = false
    return
  }
  try {
    const result = await $fetch<{ url: string }>('/bff/auth/cli/verification', { query: { user_code: code.value } })
    identityUrl.value = result.url
  }
  catch {
    error.value = '身份服务暂不可用，请稍后重试。'
  }
  finally {
    loading.value = false
  }
})

function continueAuthorization() {
  if (identityUrl.value) window.location.assign(identityUrl.value)
}
</script>

<template>
  <section class="card max-w-[520px]">
    <h1><UIcon class="mr-2 inline-block size-[1.08em] align-[-0.16em] text-nx-primary" name="i-lucide-terminal" aria-hidden="true" />CLI 设备授权</h1>
    <p>Nexora CLI 正在请求只读访问你当前可访问的工作区。授权在身份服务页面完成，可选择同意或拒绝。</p>
    <p v-if="code" class="setup-sub">
      设备代码：{{ code }}
    </p>
    <UAlert v-if="error" role="alert" color="error" icon="i-lucide-circle-alert" :description="error" />
    <div v-else class="flex flex-wrap gap-[10px]">
      <UButton v-if="identityUrl" color="primary" type="button" :disabled="loading" @click="continueAuthorization">
        继续授权
      </UButton>
      <span v-else class="inline-flex items-center gap-1.5 whitespace-nowrap rounded-[9px] border border-nx-border bg-nx-surface px-3 py-[7px] text-[12px] font-semibold text-nx-ink-2 shadow-nx-sm transition-colors hover:border-nx-border-strong hover:bg-nx-surface-muted hover:text-nx-primary-strong">正在准备授权…</span>
      <NuxtLink to="/">
        取消
      </NuxtLink>
    </div>
    <p class="mt-2 text-[12px] leading-[1.62] text-nx-ink-3">
      CLI 只获得读取工作区列表的权限；可在 CLI 中运行 nexora-cli logout 撤销令牌。
    </p>
  </section>
</template>

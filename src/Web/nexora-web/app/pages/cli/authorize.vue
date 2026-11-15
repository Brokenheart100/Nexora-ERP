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
  <section class="card login-card">
    <h1><UIcon class="heading-icon" name="i-lucide-terminal" aria-hidden="true" />CLI 设备授权</h1>
    <p>Nexora CLI 正在请求只读访问你当前可访问的工作区。授权在身份服务页面完成，可选择同意或拒绝。</p>
    <p v-if="code" class="setup-sub">
      设备代码：{{ code }}
    </p>
    <UAlert v-if="error" role="alert" color="error" icon="i-lucide-circle-alert" :description="error" />
    <div v-else class="login-actions">
      <UButton v-if="identityUrl" class="primary" type="button" :disabled="loading" @click="continueAuthorization">
        继续授权
      </UButton>
      <span v-else class="quiet">正在准备授权…</span>
      <NuxtLink to="/">
        取消
      </NuxtLink>
    </div>
    <p class="hint">
      CLI 只获得读取工作区列表的权限；可在 CLI 中运行 nexora-cli logout 撤销令牌。
    </p>
  </section>
</template>

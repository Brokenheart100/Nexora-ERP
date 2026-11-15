<script setup lang="ts">
interface SecurityCapabilities {
  available: boolean
  required: boolean
  enrolled: boolean
  methods: string[]
  stepUpSeconds: number
  lastVerifiedAt: string | null
  reauthPath: string
}
const capabilities = shallowRef<SecurityCapabilities>()
const busy = ref(false)
const error = ref('')
const methodLabels: Record<string, string> = { otp: '一次性验证码（TOTP）', mfa: '多因素认证' }
function when(value: string | null) {
  return value ? new Date(value).toLocaleString('zh-CN') : '—'
}
async function load() {
  busy.value = true; error.value = ''
  try {
    capabilities.value = await $fetch<SecurityCapabilities>('/bff/security/capabilities', { retry: 0 })
  } catch { error.value = '暂时无法读取账户安全状态。' }
  finally { busy.value = false }
}
onMounted(load)
</script>

<template>
  <section class="card" aria-label="账户安全">
    <h2><UIcon class="mr-2 inline-block size-[1.08em] align-[-0.16em] text-nx-primary" name="i-lucide-shield-check" aria-hidden="true" />账户安全</h2>
    <p class="mt-2 text-[12px] leading-[1.62] text-nx-ink-3">敏感操作（公司资料、成员角色、银行账户、账簿决策）需要最近完成多因素验证。</p>
    <dl v-if="capabilities">
      <dt>多因素认证</dt><dd>{{ capabilities.available ? '已启用' : '未启用' }}</dd>
      <dt>敏感操作策略</dt><dd>{{ capabilities.required ? '需要最近验证' : '不强制重新验证' }}</dd>
      <dt>本账户已绑定</dt><dd>{{ capabilities.enrolled ? '是' : '否' }}</dd>
      <dt>验证方式</dt><dd>{{ capabilities.methods.length ? capabilities.methods.map(method => methodLabels[method] ?? method).join('、') : '未绑定' }}</dd>
      <dt>最近验证</dt><dd>{{ when(capabilities.lastVerifiedAt) }}</dd>
      <dt>有效期</dt><dd>{{ capabilities.stepUpSeconds }} 秒</dd>
    </dl>
    <p v-if="capabilities?.enrolled"><a class="inline-flex items-center gap-1.5 whitespace-nowrap rounded-[9px] border border-nx-border bg-nx-surface px-3 py-[7px] text-[12px] font-semibold text-nx-ink-2 shadow-nx-sm transition-colors hover:border-nx-border-strong hover:bg-nx-surface-muted hover:text-nx-primary-strong" :href="capabilities.reauthPath">重新验证身份</a></p>
    <p v-else-if="capabilities" class="mt-2 text-[12px] leading-[1.62] text-nx-ink-3">当前账号尚未绑定多因素认证，请在身份提供方完成绑定后再执行敏感操作。</p>
    <UButton class="col-start-2 justify-self-end" variant="outline" color="neutral" size="sm" type="button" :disabled="busy" @click="load">刷新安全状态</UButton>
    <UAlert v-if="error" role="alert" color="error" icon="i-lucide-circle-alert" :description="error" />
  </section>
</template>

<style scoped>
dl { margin: 12px 0; font-size: 13px }
dt { color: var(--nx-ink-3) }
dd { margin: 0; color: var(--nx-ink-2); overflow-wrap: anywhere }
</style>

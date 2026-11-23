<script setup lang="ts">
import type { DeletionReview } from '#shared/types/auth'
import { loginDestination } from '#shared/utils/auth-navigation'
import { useAccountSecurityApi } from '~/composables/api/useAccountSecurityApi'
import { ApiFailure } from '~/utils/api/client'

const auth = useAuthSessionStore()
const live = useLiveSessionStore()
const api = useAccountSecurityApi()
const route = useRoute()
const tab = ref('overview')
const now = useTimestamp({ interval: 1000 })
const review = shallowRef<DeletionReview | null>(null)
const checking = ref(false)
const problem = ref('')
const items = [
  { label: '账户概览', value: 'overview', icon: 'i-carbon-user-profile' },
  { label: '登录会话', value: 'sessions', icon: 'i-carbon-screen' },
  { label: '设备授权', value: 'devices', icon: 'i-carbon-terminal' }
]
const policyText = computed(() => {
  const capability = auth.security
  if (!capability) return '验证能力暂不可用'
  if (!capability.available) return 'MFA 能力已关闭'
  if (!capability.lastVerifiedAt || now.value - Date.parse(capability.lastVerifiedAt) > capability.stepUpSeconds * 1000) {
    return capability.required ? '敏感操作需要重新验证' : '当前会话尚未验证 MFA'
  }
  return '当前会话已验证 MFA'
})
const reauthPath = computed(() => auth.security?.available
  ? auth.security.reauthPath + '&returnTo=' + encodeURIComponent(loginDestination(route.fullPath))
  : undefined)
const blocking: Record<string, string> = {
  'company-ownership': '需要处理公司所有权', 'personal-workspace-disposition': '需要处理个人工作区',
  'last-active-administrator': '当前账号是最后一个有效管理员', 'active-personal-links': '仍有启用中的个人账本链接'
}

async function inspect() {
  const subject = auth.user?.subject
  checking.value = true
  problem.value = ''
  review.value = null
  try {
    const result = await api.deletionReview()
    if (auth.user?.subject === subject) review.value = result
  } catch (failure) {
    if (auth.user?.subject === subject) problem.value = failure instanceof ApiFailure ? failure.message : '无法读取账号删除预检。'
  } finally {
    checking.value = false
  }
}
</script>

<template>
  <div class="space-y-4" data-testid="live-account-security">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <div>
        <p class="font-medium">
          {{ auth.user?.name || auth.user?.subject }}
        </p>
        <p v-if="live.account?.verifiedEmail" class="text-sm text-muted">
          {{ live.account.verifiedEmail }}
        </p>
      </div>
      <UBadge
        :label="policyText"
        :color="auth.security?.available ? 'primary' : 'neutral'"
        variant="subtle"
        data-testid="live-mfa-status"
      />
    </div>
    <UTabs
      v-model="tab"
      :items="items"
      :content="false"
      size="sm"
      data-testid="live-security-tabs"
    />

    <div v-if="tab === 'overview'" class="space-y-4">
      <UCard>
        <template #header>
          <h3 class="font-medium">
            身份验证
          </h3>
        </template>
        <div class="space-y-3">
          <p v-if="auth.security?.lastVerifiedAt" class="text-sm text-muted">
            上次验证 {{ new Date(auth.security.lastVerifiedAt).toLocaleString() }}
          </p>
          <p v-if="auth.security?.methods.length" class="text-sm text-muted">
            验证方式 {{ auth.security.methods.map(method => method === 'otp' ? '验证器' : method).join('、') }}
          </p>
          <div class="flex flex-wrap gap-2">
            <UButton
              to="/bff/account"
              external
              label="身份账户管理"
              color="neutral"
              variant="outline"
              data-testid="live-account-provider"
            />
            <UButton
              v-if="reauthPath"
              :to="reauthPath"
              external
              label="重新验证身份"
              color="neutral"
              variant="outline"
            />
          </div>
        </div>
      </UCard>
      <UCard>
        <template #header>
          <h3 class="font-medium">
            账号删除预检
          </h3>
        </template>
        <div class="space-y-3">
          <UButton
            label="检查删除条件"
            color="neutral"
            variant="outline"
            :loading="checking"
            data-testid="live-deletion-preflight"
            @click="inspect"
          />
          <UAlert
            v-if="problem"
            :title="problem"
            color="error"
            variant="subtle"
          />
          <div v-if="review" class="space-y-2 text-sm" data-testid="live-deletion-review">
            <ul v-if="review.blockers.length" class="list-disc space-y-1 pl-5">
              <li v-for="(blocker, index) in review.blockers" :key="index">
                {{ blocking[blocker.code] ?? blocker.code }}<template v-if="blocker.workspaceName">
                  · {{ blocker.workspaceName }}
                </template>
              </li>
            </ul>
            <p v-else>
              当前检查未发现业务阻断项。
            </p>
            <p v-if="review.requiresRetentionReview" class="text-muted">
              还需核对业务记录保留要求。
            </p>
          </div>
        </div>
      </UCard>
    </div>
    <AccountLiveSessions v-else-if="tab === 'sessions'" />
    <AccountLiveDevices v-else />
  </div>
</template>

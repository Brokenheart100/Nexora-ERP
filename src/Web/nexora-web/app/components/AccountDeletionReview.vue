<script setup lang="ts">
interface Blocker { code: string; workspaceId: string | null; workspaceName: string | null }
interface Review { blockers: Blocker[]; requiresRetentionReview: boolean }
const review = shallowRef<Review>()
const busy = ref(false)
const error = ref('')
const labels: Record<string, string> = {
  'personal-workspace-disposition': '需要安排个人工作区与账本的保留',
  'company-ownership': '需要交接企业工作区所有权',
  'last-active-administrator': '需要保留至少一位有效管理员',
  'active-personal-links': '需要解除个人账本与企业的关联',
}
async function read() {
  busy.value = true; error.value = ''; review.value = undefined
  try { review.value = await $fetch<Review>('/bff/api/account/deletion-preflight', { retry: 0 }) }
  catch { error.value = '暂时无法检查账号删除条件。' }
  finally { busy.value = false }
}
</script>

<template>
  <section class="rounded-nx border border-nx-border bg-nx-surface p-6 shadow-nx-sm" aria-label="账号删除预检">
    <h2><UIcon class="mr-2 inline-block size-[1.08em] align-[-0.16em] text-nx-primary" name="i-lucide-user-x" aria-hidden="true" />账号安全与删除预检</h2>
    <p><a class="inline-flex items-center gap-1.5 whitespace-nowrap rounded-[9px] border border-nx-border bg-nx-surface px-3 py-[7px] text-[12px] font-semibold text-nx-ink-2 shadow-nx-sm transition-colors hover:border-nx-border-strong hover:bg-nx-surface-muted hover:text-nx-primary-strong" href="/bff/account" target="_blank" rel="noopener noreferrer">管理登录凭据与设备会话</a></p>
    <UButton class="col-start-2 justify-self-end" variant="outline" color="neutral" size="sm" type="button" :disabled="busy" @click="read">检查删除条件</UButton>
    <template v-if="review">
      <ul v-if="review.blockers.length">
        <li v-for="blocker in review.blockers" :key="blocker.code + blocker.workspaceId">
          {{ blocker.workspaceName ? blocker.workspaceName + ' · ' : '' }}{{ labels[blocker.code] ?? blocker.code }}
        </li>
      </ul>
      <p v-else>当前账号没有工作区交接阻断。</p>
      <p v-if="review.requiresRetentionReview">仍需核对财务记录及审计的保留要求。</p>
    </template>
    <UAlert v-if="error" role="alert" color="error" icon="i-lucide-circle-alert" :description="error" />
  </section>
</template>

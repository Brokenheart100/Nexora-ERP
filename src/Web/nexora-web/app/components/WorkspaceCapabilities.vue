<script setup lang="ts">
interface Bulletin { id: string; title: string; message: string; endsAtUtc: string }
interface FinanceCapabilities { invoiceMail: string; workspaceMailSender: boolean; statutoryDonationReceipt: boolean }
const props = defineProps<{ workspaceId: string }>()
const announcements = shallowRef<Bulletin[]>()
const finance = shallowRef<FinanceCapabilities>()
const notice = ref('')
const busy = ref(false)
const mailLabels: Record<string, string> = { 'not-configured': '平台 SMTP 未配置', 'local-only': '本机 SMTP 测试通道', configured: '平台 SMTP 已配置' }
async function read() {
  busy.value = true; notice.value = ''
  const [news, capabilities] = await Promise.allSettled([
    $fetch<Bulletin[]>('/bff/api/workspaces/' + props.workspaceId + '/announcements', { retry: 0 }),
    $fetch<FinanceCapabilities>('/bff/api/finance/workspaces/' + props.workspaceId + '/capabilities', { retry: 0 }),
  ])
  announcements.value = news.status === 'fulfilled' ? news.value : undefined
  finance.value = capabilities.status === 'fulfilled' ? capabilities.value : undefined
  if (news.status === 'rejected') notice.value = '暂时无法读取公告。'
  busy.value = false
}
</script>

<template>
  <section class="card" aria-label="公告与工作区能力">
    <h2><UIcon class="mr-2 inline-block size-[1.08em] align-[-0.16em] text-nx-primary" name="i-lucide-megaphone" aria-hidden="true" />公告与工作区能力</h2>
    <UButton class="col-start-2 justify-self-end" variant="outline" color="neutral" size="sm" type="button" :disabled="busy" @click="read">查看公告与能力</UButton>
    <p v-if="announcements?.length === 0">暂无适用于当前工作区的公告。</p>
    <article v-for="item in announcements" :key="item.id">
      <h3>{{ item.title }}</h3><p>{{ item.message }}</p>
    </article>
    <dl v-if="finance">
      <dt>发票邮件</dt><dd>{{ mailLabels[finance.invoiceMail] ?? '状态未知' }}</dd>
      <dt>工作区自定义发件</dt><dd>{{ finance.workspaceMailSender ? '可用' : '未启用' }}</dd>
      <dt>公益事业捐赠法定票据</dt><dd>{{ finance.statutoryDonationReceipt ? '可用' : '未启用' }}</dd>
    </dl>
    <UAlert v-if="notice" role="status" :description="notice" />
  </section>
</template>

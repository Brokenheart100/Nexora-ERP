<script setup lang="ts">
interface Share { id: string; expiresAtUtc: string; revokedAtUtc: string | null; token?: string }
interface Dispatch { id: string; recipient: string; state: string; attempt: number; version: number; detail: string | null;
  previousId: string | null; resentAsId: string | null }
const props = defineProps<{ base: string; invoiceId: string; posted: boolean; canSend: boolean }>()
const documentPath = computed(() => props.base + '/documents/' + props.invoiceId)
const shares = shallowRef<Share[]>([])
const dispatches = shallowRef<Dispatch[]>([])
const lifetime = ref(60)
const recipient = ref('')
const shareUrl = ref('')
const busy = ref(false)
const message = ref('')
const submit = useWorkspaceMutation()
const { confirm } = useConfirm()
const { success } = useNotice()
const labels: Record<string, string> = { queued: '排队中', sending: '投递中', sent: 'SMTP 已接受',
  failed: '投递失败', unknown: '结果未知', abandoned: '已放弃' }
async function read() {
  const [links, mail] = await Promise.all([
    $fetch<Share[]>(documentPath.value + '/shares', { retry: 0 }),
    $fetch<Dispatch[]>(documentPath.value + '/dispatches', { retry: 0 }),
  ])
  shares.value = links; dispatches.value = mail
}
async function run(task: () => Promise<void>) {
  if (busy.value) return
  busy.value = true; message.value = ''
  try { await task(); await read() }
  catch (error) { message.value = (error as { data?: { detail?: string } }).data?.detail ?? '请核对分享或投递状态。' }
  finally { busy.value = false }
}
function createShare() {
  return run(async () => {
    const share = await submit<Share>('issue-invoice-share', documentPath.value + '/shares', 'POST', { lifetimeMinutes: lifetime.value })
    shareUrl.value = share.token ? location.origin + '/invoice-share#' + share.token : ''
    if (!share.token) message.value = '分享已创建。明文链接仅在首次成功响应中返回。'
    success('分享链接已创建。')
  })
}
function revoke(share: Share) {
  return run(async () => {
    await submit('revoke-invoice-share', props.base + '/shares/' + share.id + '/revoke', 'POST', {})
    shareUrl.value = ''
    success('分享已撤销。')
  })
}
function queue() {
  return run(async () => {
    await submit('send-invoice-mail', documentPath.value + '/dispatches', 'POST', { recipient: recipient.value })
    recipient.value = ''
    success('发票邮件已提交投递。')
  })
}
async function decide(entry: Dispatch, decision: string) {
  if (decision === 'resend') {
    const accepted = await confirm({
      title: entry.state === 'unknown' ? '原投递结果未知' : '重新发送发票',
      description: entry.state === 'unknown'
        ? '确认接受重复送达的可能并创建新投递？' : '确认再次发送此发票？',
      confirmLabel: '继续发送',
    })
    if (!accepted) return
  }
  return run(async () => {
    await submit('decide-invoice-mail', props.base + '/dispatches/' + entry.id + '/decision', 'POST', { expectedVersion: entry.version, decision })
    success(decision === 'retry' ? '已提交重试投递。' : decision === 'resend' ? '已提交重新发送。' : '已放弃该投递。')
  })
}
</script>

<template>
  <section aria-label="发票文件与投递">
    <p><a :href="documentPath + '/pdf?preview=true'" target="_blank" rel="noopener noreferrer">预览品牌发票 PDF</a>
      <template v-if="posted"> · <a :href="documentPath + '/pdf'">下载发票 PDF</a></template>
    </p>
    <template v-if="posted && canSend">
      <form @submit.prevent="createShare">
        <fieldset :disabled="busy"><legend>创建发票分享链接</legend>
          <UFormField label="有效分钟数" name="shareLifetime">
            <UInput :model-value="lifetime" type="number" min="1" max="10080" required
              @update:model-value="value => lifetime = Number(value) || 0" />
          </UFormField>
          <button class="primary">签发分享链接</button>
          <UFormField v-if="shareUrl" label="本次分享链接" name="issuedShareUrl">
            <UInput :model-value="shareUrl" readonly class="w-full"
              @focus="($event.target as HTMLInputElement).select()" />
          </UFormField>
        </fieldset>
      </form>
      <ul><li v-for="entry in shares" :key="entry.id">
        {{ entry.id }} · {{ entry.revokedAtUtc ? '已撤销' : '有效期至 ' + new Date(entry.expiresAtUtc).toLocaleString('zh-CN') }}
        <button v-if="!entry.revokedAtUtc" class="quiet" type="button" :disabled="busy" @click="revoke(entry)">撤销分享</button>
      </li></ul>
      <form @submit.prevent="queue">
        <fieldset :disabled="busy"><legend>发送发票附件</legend>
          <UFormField label="客户联系人邮箱" name="invoiceRecipient">
            <UInput :model-value="recipient" type="email" maxlength="254" required
              @update:model-value="value => recipient = String(value).trim()" />
          </UFormField>
          <button class="primary">提交发票邮件</button>
        </fieldset>
      </form>
      <button class="quiet" type="button" :disabled="busy" @click="run(async () => {})">刷新分享与投递记录</button>
      <ul><li v-for="entry in dispatches" :key="entry.id">
        {{ entry.recipient }} · {{ labels[entry.state] }} · 尝试 {{ entry.attempt }}{{ entry.detail ? ' · ' + entry.detail : '' }}
        <button v-if="entry.state === 'failed'" class="quiet" type="button" :disabled="busy" @click="decide(entry, 'retry')">重试</button>
        <button
v-if="['sent', 'unknown'].includes(entry.state) && !entry.resentAsId" class="quiet" type="button"
          :disabled="busy" @click="decide(entry, 'resend')">重新发送</button>
        <button
v-if="['queued', 'failed', 'unknown'].includes(entry.state) && !entry.resentAsId" class="quiet" type="button"
          :disabled="busy" @click="decide(entry, 'abandon')">放弃投递</button>
      </li></ul>
    </template>
    <UAlert v-if="message" role="status" :description="message" />
  </section>
</template>

<style scoped>
fieldset { display: grid; gap: 8px; border: 1px solid #d1d9e6; border-radius: 8px; min-width: 0; margin: 10px 0 }
li { margin: 6px 0; overflow-wrap: anywhere }
</style>

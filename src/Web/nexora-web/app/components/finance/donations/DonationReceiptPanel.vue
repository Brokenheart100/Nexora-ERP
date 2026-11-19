<script setup lang="ts">
interface Ticket { id: string; code: string; number: string; issuedOn: string }
interface Dispatch { id: string; recipient: string; state: string; attempt: number; version: number; resentAsId: string | null }

const props = defineProps<{ path: string; canManage: boolean; reversed: boolean }>()
const tickets = shallowRef<Ticket[]>([])
const deliveries = shallowRef<Dispatch[]>([])
const open = ref(false)
const loaded = ref(false)
const busy = ref(false)
const message = ref('')
const recipient = ref('')
const ticket = reactive({ code: '', number: '', issuedOn: '' })
const submit = useWorkspaceMutation()
const { confirm } = useConfirm()
const labels: Record<string, string> = {
  queued: '排队中', sending: '投递中', sent: 'SMTP 已接受',
  failed: '投递失败', unknown: '结果未知', abandoned: '已放弃',
}

async function read() {
  const [linked, sent] = await Promise.all([
    $fetch<Ticket[]>(props.path + '/fiscal-tickets', { retry: 0 }),
    props.canManage ? $fetch<Dispatch[]>(props.path + '/dispatches', { retry: 0 }) : Promise.resolve([]),
  ])
  tickets.value = linked
  deliveries.value = sent
  loaded.value = true
}

async function run(action: () => Promise<void>, failure: string) {
  if (busy.value) return
  busy.value = true
  message.value = ''
  try { await action() }
  catch { message.value = failure }
  finally { busy.value = false }
}

function toggle() {
  open.value = !open.value
  if (open.value) refresh()
}

function refresh() {
  return run(read, '读取票据关联或投递记录失败。')
}

function link() {
  return run(async () => {
    const linked = await submit<Ticket>('link-donation-ticket', props.path + '/fiscal-tickets', 'POST', { ...ticket })
    tickets.value = [linked]
    message.value = '已关联正式票据。'
  }, '关联失败，请核对票据代码、号码、开具日期及现有记录。')
}

function send() {
  return run(async () => {
    const delivery = await submit<Dispatch>('send-donation-receipt', props.path + '/dispatches', 'POST', { recipient: recipient.value.trim() })
    deliveries.value = [delivery, ...deliveries.value.filter(row => row.id !== delivery.id)]
    recipient.value = ''
    message.value = '普通确认单已提交投递。'
  }, '提交失败，请核对捐赠人档案中的有效联系人邮箱。')
}

async function decide(row: Dispatch, decision: 'resend' | 'retry' | 'abandon') {
  if (decision === 'resend') {
    const accepted = await confirm({
      title: '补发普通捐赠确认单',
      description: row.state === 'unknown' ? '上次投递结果未知，再次发送可能重复送达。' : '再次发送到原登记邮箱。',
      confirmLabel: '确认补发',
    })
    if (!accepted) return
  }
  return run(async () => {
    const result = await submit<Dispatch>('decide-donation-receipt', props.path + '/dispatches/' + row.id + '/decision', 'POST', {
      decision, expectedVersion: row.version,
    })
    deliveries.value = result.id === row.id
      ? deliveries.value.map(entry => entry.id === row.id ? result : entry)
      : [result, ...deliveries.value.map(entry => entry.id === row.id ? { ...entry, resentAsId: result.id } : entry)]
    message.value = decision === 'abandon' ? '已放弃投递。' : '普通确认单已提交投递。'
  }, '操作未确认，请刷新投递记录后重试。')
}
</script>

<template>
  <div class="my-2 space-y-3">
    <a class="text-nx-primary underline" :href="path + '/pdf'">下载捐赠收款确认单</a>
    <UButton type="button" size="xs" variant="outline" color="neutral" :aria-expanded="open" class="ml-2" @click="toggle">
      捐赠票据与邮件
    </UButton>
    <section v-if="open" aria-label="捐赠票据与邮件" class="space-y-3 rounded-nx border border-nx-border p-3">
      <p v-if="message" role="status">{{ message }}</p>
      <UButton type="button" size="xs" variant="outline" color="neutral" :disabled="busy" @click="refresh">刷新票据与投递记录</UButton>
      <div v-if="loaded" class="space-y-3">
        <p v-for="entry in tickets" :key="entry.id">
          已关联正式票据 · 代码 {{ entry.code }} · 号码 {{ entry.number }} · 开具日期 {{ entry.issuedOn }}
        </p>
        <p v-if="!tickets.length">尚未关联正式票据。</p>
        <form v-if="canManage && !reversed && !tickets.length" @submit.prevent="link">
          <fieldset :disabled="busy" class="flex flex-wrap items-end gap-2">
            <legend>录入已开具的正式票据</legend>
            <UFormField label="票据代码"><UInput v-model="ticket.code" maxlength="40" required /></UFormField>
            <UFormField label="票据号码"><UInput v-model="ticket.number" maxlength="40" required /></UFormField>
            <UFormField label="票据开具日期"><UInput v-model="ticket.issuedOn" type="date" required /></UFormField>
            <UButton type="submit" size="sm">关联正式票据</UButton>
          </fieldset>
        </form>
        <form v-if="canManage && !reversed" @submit.prevent="send">
          <fieldset :disabled="busy" class="flex flex-wrap items-end gap-2">
            <legend>发送普通确认单 PDF</legend>
            <UFormField label="捐赠人档案联系人邮箱"><UInput v-model="recipient" type="email" maxlength="254" required /></UFormField>
            <UButton type="submit" size="sm">发送确认单</UButton>
          </fieldset>
        </form>
        <ul v-if="canManage">
          <li v-for="row in deliveries" :key="row.id" class="flex flex-wrap items-center gap-2 py-1">
            {{ row.recipient }} · {{ labels[row.state] }} · 尝试 {{ row.attempt }}
            <UButton v-if="row.state === 'failed' && !reversed" type="button" size="xs" variant="outline" :disabled="busy" @click="decide(row, 'retry')">重试确认单</UButton>
            <UButton
              v-if="['sent', 'unknown'].includes(row.state) && !row.resentAsId && !reversed"
              type="button" size="xs" variant="outline" :disabled="busy" @click="decide(row, 'resend')">补发确认单</UButton>
            <UButton
              v-if="['queued', 'failed', 'unknown'].includes(row.state) && !row.resentAsId"
              type="button" size="xs" variant="outline" :disabled="busy" @click="decide(row, 'abandon')">放弃投递</UButton>
          </li>
        </ul>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { invoiceDispatchSchema, type InvoiceDispatch } from '#shared/types/invoicing'
import type { CustomerDocument } from '#shared/types/receivables'
import { useDashboardApi } from '~/composables/api/useDashboardApi'
import { usePartnersApi } from '~/composables/api/usePartnersApi'
import { receivablesPath, useReceivablesApi } from '~/composables/api/useReceivablesApi'
import { useScopedSubmission } from '~/composables/api/useScopedSubmission'
import { useTreasuryApi } from '~/composables/api/useTreasuryApi'
import { useWorkspaceQuery } from '~/composables/api/useWorkspaceQuery'
import { PendingResultError } from '~/utils/api/client'

const props = defineProps<{ invoice: CustomerDocument, canManage: boolean }>()
const client = useDashboardApi()
const api = useReceivablesApi()
const partners = usePartnersApi()
const capabilities = useWorkspaceQuery('invoice-delivery-capabilities', '/sales', useTreasuryApi().capabilities)
const canSend = computed(() => props.canManage && props.invoice.state === 'posted')
const records = useWorkspaceQuery('invoice-dispatches', '/sales', (id, signal) =>
  canSend.value ? api.dispatches(id, props.invoice.id, signal) : Promise.resolve([]), () => [props.invoice.id, canSend.value])
const customer = useWorkspaceQuery('invoice-dispatch-customer', '/sales', id =>
  canSend.value ? partners.detail(id, props.invoice.terms.customerId).then(result => result.data) : Promise.resolve(null),
() => [props.invoice.terms.customerId, canSend.value])
const selected = ref('')
const detail = useWorkspaceQuery('invoice-dispatch-detail', '/sales', (id, signal) =>
  canSend.value && selected.value ? api.dispatch(id, props.invoice.id, selected.value, signal) : Promise.resolve(null),
() => [props.invoice.id, selected.value, canSend.value])
const submission = useScopedSubmission('invoice-dispatches', () => records.enabled, invoiceDispatchSchema.parse)
const root = () => receivablesPath(records.session.activeWorkspaceId)
const document = computed(() => root() + '/documents/' + props.invoice.id)
const contacts = computed(() => [...new Set(customer.data?.contacts.flatMap(row => row.email ? [row.email] : []) ?? [])])
const recipient = ref('')
const error = ref('')
const busy = computed(() => submission.mutation.busy || !!submission.record)
const channel = computed(() => capabilities.data?.invoiceMail ?? '')
const available = computed(() => ['configured', 'local-only'].includes(channel.value))
const channelLabel = computed(() => ({ 'configured': '邮件通道已配置', 'local-only': '本地邮件通道', 'not-configured': '邮件通道未配置' }[channel.value] ?? '正在读取邮件能力'))
const status = { queued: '已排队', sending: '投递中', sent: '已发送', failed: '投递失败', unknown: '结果未知', abandoned: '已放弃' }
let polling: AbortController | null = null
watch(contacts, values => { if (!values.includes(recipient.value)) recipient.value = values[0] ?? '' })
watch(() => [records.owner, props.invoice.id, canSend.value], () => {
  polling?.abort()
  selected.value = recipient.value = error.value = ''
}, { flush: 'sync' })
onScopeDispose(() => polling?.abort())

async function refresh() {
  await Promise.all([records.refresh(), detail.refresh(), capabilities.refresh(), customer.refresh()])
}
async function follow(result: InvoiceDispatch, location?: string | null) {
  if (result.invoiceId !== props.invoice.id) return
  selected.value = result.id
  const endpoint = document.value + '/dispatches/' + result.id
  polling?.abort()
  const controller = new AbortController()
  polling = controller
  try {
    if (location && location !== endpoint) throw new Error('寄送回执路径与发票不一致。')
    await client.poll(location || endpoint, { signal: controller.signal, budgetMs: 20000, complete: response => {
      const record = invoiceDispatchSchema.parse(response.data)
      return !['queued', 'sending'].includes(record.state)
    } })
  } catch (failure) {
    if (!controller.signal.aborted && !(failure instanceof PendingResultError))
      error.value = failure instanceof Error ? failure.message : '寄送记录暂不可用。'
  } finally {
    if (polling === controller && !controller.signal.aborted) {
      polling = null
      await Promise.all([records.refresh(), detail.refresh()])
    }
  }
}
async function queue() {
  if (!canSend.value || !available.value || busy.value || !contacts.value.includes(recipient.value)) return
  error.value = ''
  if (await submission.send('mail.queue', document.value + '/dispatches', { recipient: recipient.value }, { resourceId: props.invoice.id })) {
    await refresh()
    if (submission.result) void follow(submission.result, submission.mutation.operation?.result?.headers.get('location'))
  }
}
function mayRetry(row: InvoiceDispatch) { return available.value && row.state === 'failed' }
function mayResend(row: InvoiceDispatch) { return available.value && !row.resentAsId && ['sent', 'unknown'].includes(row.state) }
function mayAbandon(row: InvoiceDispatch) { return !row.resentAsId && ['queued', 'failed', 'unknown'].includes(row.state) }
async function decide(action: 'retry' | 'resend' | 'abandon') {
  const current = detail.data
  if (!canSend.value || !current || busy.value
    || !(action === 'retry' ? mayRetry(current) : action === 'resend' ? mayResend(current) : mayAbandon(current))) return
  error.value = ''
  const ok = await submission.send('mail.' + action, root() + '/dispatches/' + current.id + '/decision',
    { decision: action, expectedVersion: current.version }, { resourceId: current.id })
  if (ok || [409, 412].includes(submission.failure?.status ?? 0)) await refresh()
  if (ok && submission.result) void follow(submission.result)
}
async function check() {
  error.value = ''
  if (!submission.mutation.unknown && submission.record?.state === 'unknown') submission.resume()
  if (!submission.record) return refresh()
  await submission.check(async () => { await refresh(); return null })
}
async function retry() {
  if (await submission.retry() && submission.result) void follow(submission.result)
}
defineExpose({ refresh })
</script>

<template>
  <div class="space-y-4">
    <SalesOperationStatus :message="error || capabilities.problem || records.problem || customer.problem || detail.problem"
      :submission="submission" @check="check" @retry="retry" />
    <UCard class="rounded-sm" data-testid="invoice-mail-compose">
      <template #header>
        <div class="flex flex-wrap items-center justify-between gap-2">
          <h2 class="text-base font-semibold text-highlighted">寄送发票</h2>
          <UBadge :label="channelLabel" variant="subtle" :color="available ? 'success' : 'neutral'" data-testid="invoice-mail-channel-live" />
        </div>
      </template>
      <p class="text-sm text-muted">{{ invoice.terms.number }} · {{ invoice.terms.customerName }}</p>
      <div v-if="canSend" class="mt-3 flex flex-wrap items-end gap-2">
        <UFormField label="客户联系人邮箱" class="min-w-64">
          <USelect v-model="recipient" :items="contacts" class="w-full" placeholder="请选择客户档案中的邮箱" data-testid="invoice-mail-recipient-live" />
        </UFormField>
        <UButton label="寄送 PDF" icon="i-carbon-email" :disabled="busy || !available || !recipient"
          data-testid="invoice-mail-send-live" @click="queue" />
      </div>
    </UCard>
    <UCard v-if="canSend" class="rounded-sm" data-testid="invoice-mail-records">
      <template #header>
        <div class="flex items-center justify-between gap-2">
          <h2 class="text-base font-semibold text-highlighted">寄送记录</h2>
          <UButton label="刷新寄送记录" size="sm" variant="outline" :loading="records.loading" @click="refresh" />
        </div>
      </template>
      <div v-for="item in records.data" :key="item.id" class="flex flex-wrap items-center gap-2 border-b border-default py-2 text-sm">
        <span class="mr-auto">{{ item.recipient }} · {{ item.attempt }} 次</span>
        <UBadge :label="status[item.state]" variant="subtle" :color="item.state === 'sent' ? 'success' : 'neutral'"
          :data-testid="'invoice-mail-status-' + item.id" />
        <UButton label="查看" variant="outline" size="sm" :data-testid="'invoice-mail-open-' + item.id" @click="selected = item.id" />
      </div>
      <p v-if="!records.loading && !records.data?.length" class="text-sm text-muted">暂无寄送记录。</p>
    </UCard>
    <UCard v-if="detail.data" class="rounded-sm" data-testid="invoice-mail-detail-live">
      <template #header>
        <div class="flex flex-wrap items-center justify-between gap-2">
          <h2 class="text-base font-semibold text-highlighted">投递详情</h2>
          <UBadge :label="status[detail.data.state]" variant="subtle" />
        </div>
      </template>
      <div class="space-y-2 text-sm">
        <p class="break-all">{{ detail.data.id }} · {{ detail.data.recipient }} · {{ detail.data.attempt }} 次 · v{{ detail.data.version }}</p>
        <p class="text-muted">{{ new Date(detail.data.updatedAtUtc).toLocaleString() }}</p>
        <p v-if="detail.data.detail" class="text-muted">{{ detail.data.detail }}</p>
        <UButton v-if="detail.data.previousId" :label="'查看原记录 ' + detail.data.previousId" variant="link" size="sm"
          data-testid="invoice-mail-previous-live" @click="selected = detail.data.previousId ?? ''" />
        <UButton v-if="detail.data.resentAsId" :label="'查看补发记录 ' + detail.data.resentAsId" variant="link" size="sm"
          data-testid="invoice-mail-next-live" @click="selected = detail.data.resentAsId ?? ''" />
        <div class="flex flex-wrap gap-2">
          <UButton v-if="mayRetry(detail.data)" label="重试原任务" :disabled="busy" size="sm" data-testid="invoice-mail-retry-live" @click="decide('retry')" />
          <UButton v-if="mayResend(detail.data)" label="重寄" variant="outline" :disabled="busy" size="sm" data-testid="invoice-mail-resend-live" @click="decide('resend')" />
          <UButton v-if="mayAbandon(detail.data)" label="放弃本次投递" color="warning" variant="outline" :disabled="busy" size="sm"
            data-testid="invoice-mail-abandon-live" @click="decide('abandon')" />
        </div>
      </div>
    </UCard>
  </div>
</template>

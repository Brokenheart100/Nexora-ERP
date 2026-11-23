<script setup lang="ts">
import { invoiceShareSchema, type InvoiceShare } from '#shared/types/invoicing'
import type { CustomerDocument } from '#shared/types/receivables'
import { receivablesPath, useReceivablesApi } from '~/composables/api/useReceivablesApi'
import { useScopedSubmission } from '~/composables/api/useScopedSubmission'
import { useWorkspaceQuery } from '~/composables/api/useWorkspaceQuery'
import { requireInvoicePdf } from '~/utils/sales/invoice-pdf'

const props = defineProps<{ invoice: CustomerDocument, canManage: boolean }>()
const api = useReceivablesApi()
const canShare = computed(() => props.canManage && props.invoice.state === 'posted')
const canPreview = computed(() => props.invoice.state === 'posted'
  || (props.invoice.state === 'submitted' && (props.invoice.isMaker || props.canManage)))
const records = useWorkspaceQuery('invoice-shares', '/sales', (id, signal) =>
  canShare.value ? api.shares(id, props.invoice.id, signal) : Promise.resolve([]), () => [props.invoice.id, canShare.value])
const submission = useScopedSubmission('invoice-sharing', () => records.enabled, invoiceShareSchema.parse)
const root = () => receivablesPath(records.session.activeWorkspaceId)
const document = computed(() => root() + '/documents/' + props.invoice.id)
const blocked = computed(() => !!submission.record || submission.mutation.busy)
const lifetime = ref('60')
const link = shallowRef<{ id: string, url: string } | null>(null)
const message = ref('')
const copyMessage = ref('')
const previewUrl = shallowRef('')
const previewBusy = ref(false)
const previewError = ref('')
const now = useNow({ interval: 1000 })
let previewRequest: AbortController | null = null

function clearPreview() {
  previewRequest?.abort()
  previewRequest = null
  previewBusy.value = false
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value)
  previewUrl.value = previewError.value = ''
}
watch(() => [records.owner, props.invoice.id, canPreview.value, canShare.value], () => {
  link.value = null
  message.value = copyMessage.value = ''
  clearPreview()
}, { flush: 'sync' })
onScopeDispose(clearPreview)

async function preview() {
  if (previewBusy.value || !canPreview.value) return
  clearPreview()
  const controller = new AbortController()
  previewRequest = controller
  previewBusy.value = true
  try {
    const blob = await requireInvoicePdf(await api.pdf(records.session.activeWorkspaceId, props.invoice.id, controller.signal))
    if (previewRequest === controller) previewUrl.value = URL.createObjectURL(blob)
  } catch (failure) {
    if (previewRequest === controller) previewError.value = failure instanceof Error ? failure.message : '无法预览发票。'
  } finally {
    if (previewRequest === controller) { previewRequest = null; previewBusy.value = false }
  }
}
function state(record: Pick<InvoiceShare, 'revokedAtUtc' | 'expiresAtUtc'>) {
  if (record.revokedAtUtc) return '已撤销'
  if (Date.parse(record.expiresAtUtc) <= now.value.getTime()) return '已到期'
  return '有效'
}
function reflectResult(action: string) {
  const result = submission.result
  if (!result) return
  if (action === 'share.create') {
    link.value = result.token
      ? { id: result.id, url: new URL('/invoice-share#token=' + result.token, location.origin).href } : null
    message.value = result.token ? '' : '已查到分享记录。明文链接仅在首次成功响应中提供。'
  } else if (action === 'share.revoke' && link.value?.id === result.id) link.value = null
}
async function createShare() {
  if (!canShare.value || blocked.value) return
  const minutes = Number(lifetime.value)
  if (!/^\d+$/.test(lifetime.value) || minutes < 1 || minutes > 10080) {
    message.value = '请输入 1 至 10080 分钟。'
    return
  }
  link.value = null
  message.value = copyMessage.value = ''
  if (await submission.send('share.create', document.value + '/shares', { lifetimeMinutes: minutes }, { resourceId: props.invoice.id })) {
    reflectResult('share.create')
    await records.refresh()
  }
}
async function revoke(id: string) {
  if (!canShare.value || blocked.value) return
  message.value = ''
  if (await submission.send('share.revoke', root() + '/shares/' + id + '/revoke', {}, { resourceId: props.invoice.id })) {
    reflectResult('share.revoke')
    await records.refresh()
  }
}
async function copy() {
  if (!link.value) return
  try { await navigator.clipboard.writeText(link.value.url); copyMessage.value = '链接已复制。' }
  catch { copyMessage.value = '可选中文本框内的链接并复制。' }
}
async function check() {
  if (!submission.mutation.unknown && submission.record?.state === 'unknown') submission.resume()
  if (!submission.record) { await records.refresh(); return }
  await submission.check(async (saved) => {
    if (saved.resourceId) await api.shares(records.session.activeWorkspaceId, saved.resourceId)
    await records.refresh()
    return null
  })
}
async function retry() {
  const action = submission.record?.action ?? ''
  if (await submission.retry()) {
    reflectResult(action)
    await records.refresh()
  }
}
defineExpose({ refresh: records.refresh })
</script>

<template>
  <div class="space-y-4">
    <SalesOperationStatus :message="records.problem" :submission="submission" @check="check" @retry="retry" />
    <UCard class="rounded-sm" data-testid="invoice-pdf-live">
      <template #header>
        <h2 class="text-base font-semibold text-highlighted">发票 PDF</h2>
      </template>
      <div class="space-y-3">
        <p class="text-sm text-muted">{{ invoice.terms.number }} · {{ invoice.terms.customerName }} · {{ invoice.terms.on }}</p>
        <div v-if="canPreview" class="flex items-center gap-2">
          <UButton label="预览 PDF" icon="i-carbon-document" :loading="previewBusy" data-testid="invoice-pdf-preview-live" @click="preview" />
          <UButton v-if="invoice.state === 'posted'" label="下载 PDF" icon="i-carbon-download" variant="outline" external
            :href="document + '/pdf'" data-testid="invoice-pdf-download-live" />
        </div>
        <UAlert v-if="previewError" color="warning" variant="soft" :title="previewError" />
        <iframe v-if="previewUrl" :src="previewUrl" title="发票 PDF 预览" class="h-[36rem] w-full rounded-sm border border-default" data-testid="invoice-pdf-frame" />
      </div>
    </UCard>
    <UCard v-if="canShare" class="rounded-sm" data-testid="invoice-share-create-panel">
      <template #header>
        <h2 class="text-base font-semibold text-highlighted">公开下载链接</h2>
      </template>
      <div class="space-y-3">
        <div class="flex flex-wrap items-end gap-2">
          <UFormField label="有效时长（分钟）" required>
            <UInput v-model="lifetime" inputmode="numeric" data-testid="invoice-share-create-expiry" />
          </UFormField>
          <UButton label="创建分享链接" :disabled="blocked" data-testid="invoice-share-create" @click="createShare" />
        </div>
        <p class="text-xs text-muted">请在创建成功时复制链接。分享列表保留有效期和撤销状态。</p>
        <p v-if="message" class="text-sm" data-testid="invoice-share-create-message">{{ message }}</p>
        <div v-if="link" class="flex items-center gap-2">
          <UInput :model-value="link.url" readonly class="flex-1" aria-label="新建的发票分享链接" data-testid="invoice-share-link" />
          <UButton label="复制链接" variant="outline" data-testid="invoice-share-copy" @click="copy" />
        </div>
        <p v-if="copyMessage" class="text-xs text-muted">{{ copyMessage }}</p>
      </div>
    </UCard>
    <UCard v-if="canShare" class="rounded-sm" data-testid="invoice-share-records">
      <template #header>
        <div class="flex items-center justify-between gap-2">
          <h2 class="text-base font-semibold text-highlighted">分享记录</h2>
          <UButton label="刷新记录" variant="outline" size="sm" :loading="records.loading" @click="records.refresh()" />
        </div>
      </template>
      <div v-for="item in records.data" :key="item.id" class="flex flex-wrap items-center gap-2 border-b border-default py-2 text-sm">
        <span class="mr-auto">到期 {{ new Date(item.expiresAtUtc).toLocaleString() }}</span>
        <UBadge :label="state(item)" :color="state(item) === '有效' ? 'success' : 'neutral'" :data-testid="'invoice-share-status-' + item.id" />
        <UButton v-if="state(item) === '有效'" label="撤销" color="warning" variant="outline" size="sm"
          :disabled="blocked" :data-testid="'invoice-share-revoke-' + item.id" @click="revoke(item.id)" />
      </div>
      <p v-if="!records.loading && !records.data?.length" class="text-sm text-muted">暂无分享记录。</p>
    </UCard>
  </div>
</template>

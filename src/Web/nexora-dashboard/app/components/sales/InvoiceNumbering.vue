<script setup lang="ts">
import { z } from 'zod'
import { invoiceNumberingSchema } from '#shared/types/invoicing'
import { invoiceNumberPreviewSchema } from '#shared/types/receivables'
import { receivablesPath, useReceivablesApi } from '~/composables/api/useReceivablesApi'
import { useScopedSubmission } from '~/composables/api/useScopedSubmission'
import { useWorkspaceQuery } from '~/composables/api/useWorkspaceQuery'

const props = defineProps<{ canConfigure: boolean }>()
const api = useReceivablesApi()
const current = useWorkspaceQuery('invoice-numbering', '/sales', api.numbering)
const submission = useScopedSubmission('invoice-numbering', () => current.enabled, invoiceNumberingSchema.parse)
const ws = () => current.session.activeWorkspaceId
const pattern = ref('')
const startingNumber = ref('')
const on = ref(new Date().toLocaleDateString('en-CA'))
const preview = shallowRef<z.infer<typeof invoiceNumberPreviewSchema> | null>(null)
const busy = ref(false)
const error = ref('')
const blocked = computed(() => !props.canConfigure || !current.data || !!submission.record || submission.mutation.busy)

function resetForm() {
  pattern.value = current.data?.pattern ?? ''
  startingNumber.value = current.data ? String(current.data.startingNumber) : ''
  preview.value = null
}
watch(() => current.data?.version, resetForm, { immediate: true })
watch(() => current.owner, () => { error.value = ''; resetForm() }, { flush: 'sync' })
watch(on, () => { preview.value = null })

async function refresh() {
  await current.refresh()
  resetForm()
}
async function save() {
  if (blocked.value || !current.data) return
  const start = Number(startingNumber.value)
  const value = pattern.value.trim().toUpperCase()
  if (!/^\d{1,9}$/.test(startingNumber.value) || start < 1 || start > 999999999
    || (value && (value.length > 55 || !/^(?:[A-Z0-9_/-]|\{FY\}|\{#{1,9}\})+$/.test(value)
      || value.split('{FY}').length !== 2 || [...value.matchAll(/\{#{1,9}\}/g)].length !== 1))) {
    error.value = '请核对起始号和格式。格式应含一个 {FY} 和一个序号占位符，例如 {####}。'
    return
  }
  error.value = ''
  if (await submission.send('numbering.configure', receivablesPath(ws()) + '/invoice-numbering',
    { expectedVersion: current.data.version, pattern: value || null, startingNumber: start }, { method: 'PUT' })) await refresh()
}
async function readPreview() {
  if (busy.value || !z.iso.date().safeParse(on.value).success) return
  const owner = current.owner
  const date = on.value
  busy.value = true
  error.value = ''
  preview.value = null
  try {
    const value = await api.preview(ws(), date)
    if (owner === current.owner && date === on.value) preview.value = value
  } catch (failure) {
    if (owner === current.owner) error.value = failure instanceof Error ? failure.message : '无法读取候选编号。'
  } finally { busy.value = false }
}
async function check() {
  error.value = ''
  if (!submission.mutation.unknown && submission.record?.state === 'unknown') submission.resume()
  if (!submission.record) return refresh()
  await submission.check(async () => { await current.refresh(); return null })
}
async function retry() {
  if (await submission.retry()) await refresh()
}
defineExpose({ refresh })
</script>

<template>
  <div class="space-y-4">
    <SalesOperationStatus :message="error || current.problem" :submission="submission" @check="check" @retry="retry" />
    <div class="grid gap-4 lg:grid-cols-5">
      <UCard class="rounded-sm lg:col-span-3" data-testid="invoice-number-settings">
        <template #header>
          <div class="flex items-center justify-between gap-2">
            <h2 class="text-base font-semibold text-highlighted">编号规则设置</h2>
            <UBadge v-if="current.data" :label="'当前 v' + current.data.version" variant="subtle" color="neutral" />
          </div>
        </template>
        <div class="space-y-3">
          <div class="grid gap-3 sm:grid-cols-2">
            <UFormField label="编号格式" help="例如 INV-{FY}-{####}。留空可关闭财年编号。">
              <UInput v-model="pattern" class="w-full" :disabled="blocked" maxlength="55" data-testid="invoice-number-pattern-live" />
            </UFormField>
            <UFormField label="起始号" required>
              <UInput v-model="startingNumber" class="w-full" :disabled="blocked" inputmode="numeric" data-testid="invoice-number-start-live" />
            </UFormField>
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <UButton v-if="canConfigure" label="保存编号规则" :disabled="blocked" data-testid="invoice-number-save-live" @click="save" />
            <UButton label="读取当前规则" variant="outline" :loading="current.loading" @click="refresh" />
          </div>
        </div>
      </UCard>
      <UCard class="rounded-sm lg:col-span-2" data-testid="invoice-number-preview-panel">
        <template #header>
          <h2 class="text-base font-semibold text-highlighted">预览候选编号</h2>
        </template>
        <div class="space-y-3">
          <UFormField label="开票日期" required>
            <UInput v-model="on" type="date" data-testid="invoice-number-date-live" />
          </UFormField>
          <UButton label="查询候选编号" :loading="busy" :disabled="!on || !current.data?.pattern" data-testid="invoice-number-preview-live" @click="readPreview" />
          <p v-if="preview" class="text-sm" data-testid="invoice-number-value-live">
            {{ preview.number }} · 财年 {{ preview.fiscalYear }} · 序号 {{ preview.sequence }}
          </p>
        </div>
      </UCard>
    </div>
  </div>
</template>

<script setup lang="ts">
import { z } from 'zod'
import { useTreasuryApi } from '~/composables/api/useTreasuryApi'
import { useWorkspaceQuery } from '~/composables/api/useWorkspaceQuery'
import { useTreasuryWrite } from '~/composables/finance/useTreasuryWrite'
import type { TreasuryConnection } from '~/composables/finance/useTreasuryConnection'
import type { BankCsvMapping, BankCsvPreview } from '#shared/types/treasury'
import { readAccountingFile, validateAccountingFile } from '~/utils/finance/accounting-files'
import { csvColumns } from '~/utils/finance/csv-columns'
import { displayDecimal } from '~/utils/api/decimal-display'

const { connection } = defineProps<{ connection: TreasuryConnection }>()
const emit = defineEmits<{ committed: [] }>()
const api = useTreasuryApi()
const workspace = () => connection.home.session.activeWorkspaceId
const write = useTreasuryWrite('bank-import', () => connection.home.enabled, workspace)
const file = ref('')
const mapping = reactive<BankCsvMapping>({ externalId: '', date: '', amount: '', description: '' })
const fields = [
  { key: 'externalId', label: '外部流水号' }, { key: 'date', label: '业务日期' },
  { key: 'amount', label: '带符号金额' }, { key: 'description', label: '摘要' }
] as const
const headers = computed(() => {
  const first = file.value.split(/\r?\n/, 1)[0]
  return first ? csvColumns(first) : []
})
const previewId = ref('')
const lookupId = ref('')
const preview = shallowRef<BankCsvPreview | null>(null)
const isPreviewing = ref(false)
const error = ref('')
const storageKey = computed(() => 'nexora:dashboard:bank-import:' + JSON.stringify([connection.home.session.user?.subject, workspace()]))
const status = useWorkspaceQuery('treasury-import-status', '/finance', (id, signal) =>
  z.uuid().safeParse(previewId.value).success ? api.importStatus(id, previewId.value, signal) : Promise.resolve(null), () => previewId.value)

watch(() => connection.home.owner, () => {
  preview.value = null
  file.value = ''
  error.value = ''
  isPreviewing.value = false
  lookupId.value = previewId.value = import.meta.client ? sessionStorage.getItem(storageKey.value) ?? '' : ''
}, { immediate: true, flush: 'sync' })
watch(headers, (values) => fields.forEach(({ key }, index) => {
  if (!values.includes(mapping[key])) mapping[key] = values[index] ?? ''
}))
watch(() => status.data?.bankId, (id) => { if (id) connection.bank = id })

function persist(id: string) {
  lookupId.value = previewId.value = id
  if (import.meta.client) sessionStorage.setItem(storageKey.value, id)
}
async function readFile(event: Event) {
  try {
    const value = await readAccountingFile(event)
    if (value !== null) file.value = value
    error.value = ''
  } catch (failure) { error.value = failure instanceof Error ? failure.message : '无法读取文件。' }
}
async function loadPreview() {
  if (!connection.canSubmit || !connection.bankId || isPreviewing.value || write.blocked) return
  const owner = connection.home.owner
  const bankId = connection.bankId
  error.value = ''
  preview.value = null
  isPreviewing.value = true
  try {
    const result = await api.importPreview(workspace(), bankId, validateAccountingFile(file.value), { ...mapping })
    if (owner !== connection.home.owner || bankId !== connection.bankId) return
    preview.value = result.data
    if (result.status === 201 && result.data.previewId) persist(result.data.previewId)
    else {
      lookupId.value = previewId.value = ''
      if (import.meta.client) sessionStorage.removeItem(storageKey.value)
    }
  } catch (failure) {
    if (owner === connection.home.owner) error.value = failure instanceof Error ? failure.message : '无法生成预览。'
  } finally {
    if (owner === connection.home.owner) isPreviewing.value = false
  }
}
async function lookup() {
  const id = lookupId.value.trim()
  if (!z.uuid().safeParse(id).success) {
    error.value = '请输入有效的预览 ID。'
    return
  }
  error.value = ''
  if (id !== previewId.value) preview.value = null
  persist(id)
  await status.refresh()
}
async function refresh() {
  await status.refresh()
  if (status.data?.state === 'committed') emit('committed')
}
async function commit() {
  const current = status.data
  if (!connection.canSubmit || current?.state !== 'ready' || current.bankId !== connection.bankId || write.blocked) return
  if (await write.send('bank.import', `/imports/${current.id}/commit`, {}, { resourceId: current.id })) await refresh()
  else if (!write.submission.record) await status.refresh()
}
async function check() {
  error.value = ''
  const saved = write.submission.record
  if (!saved?.resourceId) return refresh()
  if (!write.submission.mutation.unknown) write.submission.resume()
  persist(saved.resourceId)
  if (await write.submission.check(async () => {
    const value = await api.importStatus(workspace(), saved.resourceId!)
    return value.state === 'committed' && value.committedCount !== null ? { id: value.id, count: value.committedCount } : null
  })) await refresh()
  else await status.refresh()
}
async function retry() {
  if (await write.submission.retry()) await refresh()
}
defineExpose({ refresh: status.refresh })
</script>

<template>
  <UCard class="nx-reveal rounded-sm" data-testid="treasury-import">
    <template #header>
      <h3 class="text-sm font-semibold text-highlighted">对账单导入</h3>
      <p class="mt-0.5 text-xs text-muted">CSV 金额以正数表示流入、负数表示流出。预览通过后再提交。</p>
    </template>
    <div class="space-y-3">
      <div class="grid gap-3 sm:grid-cols-2">
        <UFormField label="资金账户">
          <USelect v-model="connection.bank" :placeholder="connection.bankDetail.data?.name ?? '选择资金账户'"
            :items="connection.bankOptions" class="w-full" data-testid="treasury-import-account" />
        </UFormField>
        <UFormField v-if="connection.canSubmit" label="CSV 文件">
          <UInput type="file" accept=".csv,text/csv" class="w-full" data-testid="treasury-import-file" @change="readFile" />
        </UFormField>
      </div>
      <template v-if="connection.canSubmit">
        <UFormField label="CSV 内容">
          <UTextarea v-model="file" class="w-full" :rows="3" data-testid="treasury-import-csv" />
        </UFormField>
        <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <UFormField v-for="field in fields" :key="field.key" :label="field.label" required>
            <USelect v-model="mapping[field.key]" :items="headers" class="w-full" :data-testid="'treasury-import-column-' + field.key" />
          </UFormField>
        </div>
        <div class="flex flex-wrap items-end gap-2">
          <UButton label="预览导入" :loading="isPreviewing" :disabled="!file.trim() || !connection.bankId || write.blocked"
            data-testid="treasury-import-preview-request" @click="loadPreview" />
          <UFormField label="预览 ID">
            <UInput v-model="lookupId" class="min-w-72" data-testid="treasury-import-id" />
          </UFormField>
          <UButton label="查询预览状态" variant="outline" :loading="status.loading" data-testid="treasury-import-lookup" @click="lookup" />
          <UButton v-if="status.data?.state === 'ready'" label="提交导入" :disabled="write.blocked || isPreviewing || status.data.bankId !== connection.bankId"
            data-testid="treasury-import-submit" @click="commit" />
        </div>
      </template>
      <FinanceTreasurySubmission :write="write" :check="check" :retry="retry" :error="error || status.problem" />
      <UAlert v-if="status.data" :color="status.data.state === 'expired' ? 'warning' : 'neutral'" variant="soft"
        :title="status.data.state === 'committed' ? '已导入 ' + status.data.committedCount + ' 行' : status.data.state === 'expired' ? '预览已过期，请重新预览。' : '预览待提交'"
        :description="status.data.state === 'ready' ? '到期时间 ' + new Date(status.data.expiresAtUtc).toLocaleString() : undefined"
        data-testid="treasury-import-status" />
      <div v-if="preview" class="space-y-2 rounded-sm border border-default p-3" data-testid="treasury-import-preview">
        <p class="text-sm font-medium">{{ preview.previewId ? '已保存的导入预览' : '校验未生成可提交预览' }}</p>
        <p v-for="(issue, index) in preview.errors" :key="index" class="text-sm text-error">第 {{ issue.row }} 行 · {{ issue.message }}</p>
        <p v-for="(issue, index) in preview.skipped" :key="index" class="text-sm text-muted">第 {{ issue.row }} 行 · 已跳过 · {{ issue.message }}</p>
        <div v-if="preview.rows.length" class="max-h-72 overflow-auto">
          <table class="w-full text-left text-sm">
            <thead class="text-muted">
              <tr><th scope="col">行</th><th scope="col">外部流水号</th><th scope="col">日期</th><th scope="col">摘要</th><th scope="col">金额</th><th scope="col">状态</th></tr>
            </thead>
            <tbody>
              <tr v-for="{ entry, duplicate } in preview.rows" :key="entry.row" class="border-t border-default">
                <td>{{ entry.row }}</td><td>{{ entry.externalId }}</td><td>{{ entry.on }}</td><td>{{ entry.description }}</td>
                <td>{{ displayDecimal(entry.amount, connection.minorUnits) }}</td><td>{{ duplicate ? '重复 · 跳过' : '新行' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </UCard>
</template>

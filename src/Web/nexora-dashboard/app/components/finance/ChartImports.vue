<script setup lang="ts">
import { chartChangeSchema, chartPreviewSchema, type ChartPreview } from '#shared/types/ledger'
import { financePath, useLedgerApi } from '~/composables/api/useLedgerApi'
import { useScopedSubmission } from '~/composables/api/useScopedSubmission'
import type { AccountingBookConnection } from '~/composables/finance/useAccountingBook'
import { readAccountingFile, validateAccountingFile } from '~/utils/finance/accounting-files'

const props = defineProps<{ live: AccountingBookConnection }>()
const api = useLedgerApi()
const open = ref(false)
const file = ref('')
const mode = ref('append')
const format = ref('nexora-json')
const review = shallowRef<ChartPreview | null>(null)
const status = shallowRef<Awaited<ReturnType<typeof api.chartImport>> | null>(null)
const error = ref('')
const reading = ref(false)
const chart = computed(() => props.live.query.data?.chart)
const submission = useScopedSubmission('chart-import', () => props.live.query.enabled, chartChangeSchema.parse)
const frozen = computed(() => reading.value || !!submission.record || submission.mutation.busy)
const canCommit = computed(() => !frozen.value && chart.value?.canImport && status.value?.state === 'ready'
  && review.value?.revision === chart.value?.revision && Date.parse(status.value.expiresAtUtc) > Date.now())
watch([file, mode, format], () => {
  review.value = status.value = null
})
watch(() => props.live.query.owner, () => {
  review.value = status.value = null
  open.value = reading.value = false
  file.value = error.value = ''
})
async function action(run: () => Promise<void>) {
  if (reading.value) return
  const owner = props.live.query.owner
  reading.value = true
  error.value = ''
  try {
    await run()
  } catch (failure) {
    if (props.live.query.owner === owner) error.value = failure instanceof Error ? failure.message : '科目文件操作失败。'
  } finally {
    if (props.live.query.owner === owner) reading.value = false
  }
}
function readUpload(event: Event) {
  const owner = props.live.query.owner
  return action(async () => {
    const result = await readAccountingFile(event)
    if (result && owner === props.live.query.owner) file.value = result
  })
}
function preview() {
  const owner = props.live.query.owner
  return action(async () => {
    review.value = status.value = null
    const value = await api.preview(props.live.workspace(), '/chart/imports/preview', { mode: mode.value, format: format.value, file: validateAccountingFile(file.value) }, chartPreviewSchema)
    if (owner !== props.live.query.owner) return
    review.value = value
    if (value.previewId) {
      const result = await api.chartImport(props.live.workspace(), value.previewId)
      if (owner === props.live.query.owner) status.value = result
    }
  })
}
async function commit() {
  const id = review.value?.previewId
  if (!id || !canCommit.value) return
  const owner = props.live.query.owner
  await action(async () => {
    const current = await api.chartImport(props.live.workspace(), id)
    if (owner !== props.live.query.owner) return
    status.value = current
    if (current.state !== 'ready' || current.revision !== chart.value?.revision) throw new Error('预览已失效，请重新预览。')
    if (await submission.send('chart-import.commit', financePath(props.live.workspace()) + '/chart/imports/' + id + '/commit', {}, { resourceId: id })) {
      await props.live.query.refresh()
      const committed = await api.chartImport(props.live.workspace(), id)
      if (owner === props.live.query.owner) status.value = committed
    }
  })
}
function download(kind: 'template' | 'structure' | 'snapshot') {
  return action(async () => {
    const value = await api.chartExport(props.live.workspace(), kind)
    const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }))
    const link = document.createElement('a')
    link.href = url
    link.download = 'nexora-chart-' + kind + '.json'
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 0)
  })
}
async function check() {
  if (!submission.mutation.unknown) submission.resume()
  await submission.check(async (saved) => {
    const value = await api.chartImport(saved.workspaceId, saved.resourceId!)
    return value.committedRevision == null ? null : { revision: value.committedRevision }
  })
  await props.live.query.refresh()
}
async function retry() {
  if (await submission.retry()) await props.live.query.refresh()
}
</script>

<template>
  <div class="space-y-2 border-b border-default px-3 py-3" data-testid="chart-files">
    <div class="flex flex-wrap items-center gap-2">
      <UButton
        v-if="chart?.canImport"
        label="导入科目"
        size="xs"
        variant="outline"
        data-testid="chart-import-open"
        @click="open = true"
      />
      <template v-if="chart?.canExport">
        <UButton
          label="模板"
          size="xs"
          variant="ghost"
          :disabled="reading"
          @click="download('template')"
        />
        <UButton
          label="结构"
          size="xs"
          variant="ghost"
          :disabled="reading"
          @click="download('structure')"
        />
        <UButton
          label="快照"
          size="xs"
          variant="ghost"
          :disabled="reading"
          @click="download('snapshot')"
        />
      </template>
    </div>
    <SalesOperationStatus
      v-if="!open"
      :message="error"
      :submission="submission"
      @check="check"
      @retry="retry"
    />
    <USlideover v-model:open="open" title="科目导入" :ui="{ content: 'w-full sm:max-w-xl' }">
      <template #body>
        <div class="space-y-3">
          <SalesOperationStatus
            :message="error"
            :submission="submission"
            @check="check"
            @retry="retry"
          />
          <div class="grid gap-3 sm:grid-cols-2">
            <UFormField label="导入方式">
              <USelect
                v-model="mode"
                :items="[{ value: 'append', label: '新增' }, { value: 'upsert', label: '新增或更新' }, { value: 'replace', label: '空账替换' }]"
                :disabled="frozen"
                class="w-full"
              />
            </UFormField>
            <UFormField label="来源格式">
              <USelect
                v-model="format"
                :items="[{ value: 'nexora-json', label: 'Nexora JSON' }, { value: 'nexora-csv', label: 'Nexora CSV' }, { value: 'xero-csv', label: 'Xero CSV' }, { value: 'qbo-csv', label: 'QuickBooks CSV' }]"
                :disabled="frozen"
                class="w-full"
              />
            </UFormField>
          </div>
          <UFormField label="上传科目文件">
            <input
              type="file"
              accept=".csv,.json"
              :disabled="frozen"
              @change="readUpload"
            >
          </UFormField>
          <UFormField label="文件内容">
            <UTextarea
              v-model="file"
              :rows="7"
              class="w-full"
              :disabled="frozen"
              data-testid="chart-import-file"
            />
          </UFormField>
          <div v-if="review" class="space-y-2 text-xs" data-testid="chart-import-preview">
            <p>科目版本 {{ review.revision }} · {{ status?.state === 'committed' ? '已提交' : status?.state === 'expired' || review.revision !== chart?.revision ? '请重新预览' : '待提交' }}</p>
            <p v-if="status">
              过期时间 {{ status.expiresAtUtc }}
            </p>
            <p v-for="(row, index) in review.errors" :key="'err' + index" class="text-error">
              第 {{ row.row ?? '—' }} 行 · {{ row.message }}
            </p>
            <p v-for="row in review.changes" :key="row.code">
              {{ row.code }} · {{ row.name }} · {{ row.action }}
            </p>
          </div>
        </div>
      </template>
      <template #footer>
        <UButton
          label="预览"
          variant="outline"
          :disabled="frozen || !file.trim()"
          data-testid="chart-import-preview-action"
          @click="preview"
        />
        <UButton
          label="提交导入"
          :disabled="!canCommit"
          data-testid="chart-import-commit"
          @click="commit"
        />
      </template>
    </USlideover>
  </div>
</template>

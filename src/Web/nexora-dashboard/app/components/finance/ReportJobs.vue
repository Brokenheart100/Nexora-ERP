<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import { reportExportSchema, type FinancialReport, type ReportExport } from '#shared/types/reporting'
import { reportExportsPath, useReportingApi } from '~/composables/api/useReportingApi'
import { useWorkspaceQuery } from '~/composables/api/useWorkspaceQuery'
import { useScopedSubmission } from '~/composables/api/useScopedSubmission'
import { reportNames, saveReportBlob } from '~/utils/finance/reporting'

const props = defineProps<{ report: FinancialReport | null, compare: boolean }>()
const api = useReportingApi()
const list = useWorkspaceQuery('report-export-list', '/finance', api.exports)
const workspace = computed(() => list.session.activeWorkspaceId)
const detailId = ref('')
const open = ref(false)
const busyFile = ref(false)
const message = ref('')
const detail = useWorkspaceQuery('report-export-detail', '/finance', (id, signal) =>
  detailId.value ? api.exportJob(id, detailId.value, signal) : Promise.resolve(null), () => detailId.value)
const submission = useScopedSubmission('financial-report-export', () => list.enabled && list.data !== null, reportExportSchema.parse)
const columns: TableColumn<ReportExport>[] = [
  { accessorKey: 'kind', header: '报表' },
  { accessorKey: 'watermark', header: '过账水位' },
  { accessorKey: 'requestedAtUtc', header: '申请时间' },
  { accessorKey: 'completedAtUtc', header: '状态' },
  { id: 'actions', header: '操作' }
]

watch(() => list.owner, () => {
  detailId.value = ''
  open.value = false
  busyFile.value = false
  message.value = ''
}, { flush: 'sync' })

function showJob(id: string) {
  if (detailId.value === id) void detail.refresh()
  detailId.value = id
  open.value = true
}

async function refresh() {
  await Promise.all([list.refresh(), detailId.value && open.value ? detail.refresh() : undefined])
}

useIntervalFn(() => {
  if (list.data?.some(job => !job.completedAtUtc) && !list.loading) void list.refresh()
  if (open.value && detail.data && !detail.data.completedAtUtc && !detail.loading) void detail.refresh()
}, 2500)

async function seeCreatedJob() {
  const result = submission.mutation.operation?.result
  const location = result?.headers.get('location')
  const expected = result && reportExportsPath(workspace.value) + '/' + result.data.id
  if (result?.status === 201 && expected && [expected, expected.slice(4)].includes(location ?? '')) {
    showJob(result.data.id)
  } else {
    message.value = '任务已提交，创建响应的位置无法确认，请从列表查看。'
  }
  await list.refresh()
}

async function queue() {
  const report = props.report
  if (!report) return
  message.value = ''
  if (await submission.send('report.export.queued', reportExportsPath(workspace.value), {
    kind: report.kind, ...report.period, watermark: report.watermark, basis: report.basis, compare: props.compare
  })) await seeCreatedJob()
}

async function rebuild(job: ReportExport) {
  message.value = ''
  if (await submission.send('report.export.rebuilt', reportExportsPath(workspace.value) + '/' + job.id + '/rebuild', {})) {
    await seeCreatedJob()
  }
}

async function check() {
  if (!submission.mutation.unknown) submission.resume()
  await submission.check(async (saved) => {
    await api.exports(saved.workspaceId)
    return null
  })
  await list.refresh()
}

async function retry() {
  if (await submission.retry()) await seeCreatedJob()
}

async function download(job: ReportExport) {
  if (!job.completedAtUtc || busyFile.value) return
  const owner = list.owner
  busyFile.value = true
  message.value = ''
  try {
    const blob = await api.exportFile(workspace.value, job.id)
    if (list.owner === owner) saveReportBlob(blob, job.kind + '-' + job.watermark + '.csv')
  } catch (error) {
    if (list.owner === owner) message.value = error instanceof Error ? error.message : '文件下载失败。'
  } finally {
    if (list.owner === owner) busyFile.value = false
  }
}

defineExpose({ refresh })
</script>

<template>
  <UCard class="rounded-sm" data-testid="live-report-exports">
    <template #header>
      <div class="flex flex-wrap items-center justify-between gap-2">
        <h2 class="font-semibold">
          报表导出
        </h2>
        <div class="flex flex-wrap gap-2">
          <UButton
            label="刷新任务"
            variant="outline"
            color="neutral"
            :loading="list.loading"
            @click="refresh"
          />
          <UButton
            label="生成当前报表 CSV"
            icon="i-carbon-download"
            :disabled="!report || !list.data || !!submission.record"
            :loading="submission.mutation.busy"
            data-testid="report-export-create"
            @click="queue"
          />
        </div>
      </div>
    </template>
    <UAlert v-if="list.problem" color="error" :title="list.problem" />
    <SalesOperationStatus
      :submission="submission"
      :message="message"
      @check="check"
      @retry="retry"
    />
    <USkeleton v-if="list.loading && !list.data" class="h-16 w-full" />
    <UTable
      v-else-if="list.data"
      :data="list.data"
      :columns="columns"
      class="nx-table"
      data-testid="report-export-list"
    >
      <template #kind-cell="{ row }">
        {{ reportNames[row.original.kind] }}
      </template>
      <template #completedAtUtc-cell="{ row }">
        <UBadge :label="row.original.completedAtUtc ? '可下载' : '排队中'" :color="row.original.completedAtUtc ? 'success' : 'warning'" variant="subtle" />
      </template>
      <template #actions-cell="{ row }">
        <UButton
          label="查看任务"
          variant="ghost"
          size="xs"
          :data-testid="'report-export-' + row.original.id"
          @click="showJob(row.original.id)"
        />
      </template>
      <template #empty>
        当前账号在此工作区没有导出任务。
      </template>
    </UTable>
  </UCard>

  <USlideover v-model:open="open" title="报表导出详情">
    <template #body>
      <USkeleton v-if="detail.loading && !detail.data" class="h-24 w-full" />
      <UAlert v-else-if="detail.problem" color="error" :title="detail.problem" />
      <div v-else-if="detail.data" class="space-y-3" data-testid="report-export-detail">
        <dl class="grid gap-2 text-sm">
          <div>{{ reportNames[detail.data.kind] }} · 过账水位 {{ detail.data.watermark }}</div>
          <div>申请于 {{ detail.data.requestedAtUtc }}</div>
          <div>{{ detail.data.completedAtUtc ? '完成于 ' + detail.data.completedAtUtc : '排队中，文件生成后开放下载。' }}</div>
        </dl>
        <SalesOperationStatus
          :submission="submission"
          :message="message"
          @check="check"
          @retry="retry"
        />
        <div class="flex flex-wrap gap-2">
          <UButton
            label="下载 CSV"
            :disabled="!detail.data.completedAtUtc"
            :loading="busyFile"
            data-testid="report-export-download"
            @click="download(detail.data)"
          />
          <UButton
            label="按原快照重建"
            variant="outline"
            :disabled="!!submission.record"
            :loading="submission.mutation.busy"
            data-testid="report-export-rebuild"
            @click="rebuild(detail.data)"
          />
        </div>
      </div>
    </template>
  </USlideover>
</template>

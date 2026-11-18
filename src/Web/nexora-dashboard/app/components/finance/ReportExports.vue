<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { ReportExportKind, ReportExportRecord, ReportExportStatus, ReportRow } from '~/mocks'
import {
  reportExportKindLabels,
  reportExportStatusColors,
  reportExportStatusLabels
} from '~/mocks'

const props = defineProps<{
  kind: ReportExportKind
  period: string
  reportRows: ReportRow[]
  canExport?: boolean
}>()

const toast = useToast()
const { activeWorkspaceId } = useMockWorkspace()
const store = useReportExportsStore()

const search = ref('')
const statusFilter = ref<'all' | ReportExportStatus>('all')
const generatingId = ref('')
const detailId = ref('')
const detailOpen = ref(false)
const timers = new Set<ReturnType<typeof setTimeout>>()

const statusOptions = [
  { label: '全部状态', value: 'all' },
  { label: '已完成', value: 'ready' },
  { label: '生成中', value: 'running' },
  { label: '排队中', value: 'queued' },
  { label: '失败', value: 'failed' }
]

const filteredRecords = computed(() => {
  const keyword = search.value.trim().toLowerCase()
  return store.records.filter((record) => {
    const matchesWorkspace = record.workspaceId === activeWorkspaceId.value
    const matchesStatus = statusFilter.value === 'all' || record.status === statusFilter.value
    const matchesKeyword = !keyword
      || record.id.toLowerCase().includes(keyword)
      || record.fileName.toLowerCase().includes(keyword)
      || reportExportKindLabels[record.kind].includes(keyword)
    return matchesWorkspace && matchesStatus && matchesKeyword
  })
})

const selectedRecord = computed(() => store.records.find(record => record.id === detailId.value))
const exportable = computed(() => props.canExport !== false)

const columns: TableColumn<ReportExportRecord>[] = [
  { accessorKey: 'id', header: '记录' },
  { id: 'kind', header: '报表' },
  { accessorKey: 'period', header: '期间' },
  { id: 'status', header: '状态' },
  { id: 'snapshot', header: '快照 / 水位' },
  { accessorKey: 'requestedAt', header: '申请时间' },
  { id: 'actions', header: '操作' }
]

function notify(title: string, description: string, color: 'success' | 'neutral' | 'warning' | 'error' = 'success', icon = 'i-carbon-checkmark') {
  toast.add({ title, description, color, icon })
}

function scheduleCompletion(recordId: string, delay: number) {
  const timer = setTimeout(() => {
    store.completeExport(recordId)
    if (generatingId.value === recordId) generatingId.value = ''
    notify('导出文件已生成', '可在记录中下载 ' + recordId + '。', 'success', 'i-carbon-download')
    timers.delete(timer)
  }, delay)
  timers.add(timer)
}

onBeforeUnmount(() => {
  timers.forEach(timer => clearTimeout(timer))
  timers.clear()
})

function generateExport() {
  if (!exportable.value) {
    notify('没有导出权限', '当前演示身份缺少报表导出权限。', 'error', 'i-carbon-locked')
    return
  }
  const result = store.queueExport({
    workspaceId: activeWorkspaceId.value,
    kind: props.kind,
    period: props.period
  })
  if (!result.ok) {
    notify('无法创建导出任务', result.message, 'error', 'i-carbon-warning-alt')
    return
  }
  generatingId.value = result.record.id
  notify('导出任务已排队', result.message, 'success', 'i-carbon-time')
  scheduleCompletion(result.record.id, 1500)
}

function rebuildExport(record: ReportExportRecord) {
  const result = store.rebuildExport(record.id)
  if (!result.ok) {
    notify('无法重建', result.message, 'error', 'i-carbon-warning-alt')
    return
  }
  generatingId.value = result.record.id
  notify('已按原快照重建', result.message, 'success', 'i-carbon-renew')
  scheduleCompletion(result.record.id, 1200)
}

function downloadExport(record: ReportExportRecord) {
  if (record.status !== 'ready') return
  const rows = props.reportRows
    .filter(row => row.report === record.kind)
    .map(row => [row.label, row.amount, record.snapshotId, String(record.watermark)] as (string | number)[])
  downloadCsv(record.fileName, ['项目', '金额', '快照', '水位'], rows)
  notify('已开始下载', record.fileName + ' · 快照 ' + record.snapshotId + '。', 'success', 'i-carbon-download')
}

function openDetail(record: ReportExportRecord) {
  detailId.value = record.id
  detailOpen.value = true
}

function statusLabel(record: ReportExportRecord) {
  return reportExportStatusLabels[record.status]
}

function statusColor(record: ReportExportRecord) {
  return reportExportStatusColors[record.status]
}
</script>

<template>
  <div>
    <UCard class="nx-reveal rounded-sm" :ui="{ body: 'p-0 sm:p-0' }" data-testid="report-exports">
      <template #header>
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 class="text-sm font-semibold text-highlighted">
              导出记录
            </h2>
            <p class="mt-0.5 text-xs text-muted">
              按已选报表与期间生成账面快照文件；导出文件保留快照号、水位与哈希，可按原快照重建。
            </p>
          </div>
          <UButton
            label="生成当前期间导出"
            icon="i-carbon-document-export"
            :disabled="!exportable"
            data-testid="report-export-generate"
            @click="generateExport"
          />
        </div>
      </template>

      <div class="space-y-3 p-3">
        <UAlert
          v-if="generatingId"
          color="info"
          variant="soft"
          icon="i-carbon-in-progress"
          :title="'正在生成 ' + generatingId"
          description="任务已固定当前期间与账面水位；完成后会自动刷新状态，可下载 CSV。"
          data-testid="report-export-progress"
        />

        <div class="flex flex-wrap items-center justify-between gap-2">
          <div class="flex flex-wrap items-center gap-2">
            <UInput
              v-model="search"
              icon="i-carbon-search"
              placeholder="搜索记录号、文件名"
              size="sm"
              class="w-60"
              data-testid="report-export-search"
            />
            <USelect
              v-model="statusFilter"
              :items="statusOptions"
              aria-label="导出状态"
              class="w-32"
              data-testid="report-export-status"
            />
          </div>
          <div class="flex items-center gap-2 text-xs text-muted">
            <UBadge
              :label="'已完成 ' + store.readyCount"
              color="success"
              variant="subtle"
              size="sm"
            />
            <UBadge
              :label="'失败 ' + store.failedCount"
              color="error"
              variant="subtle"
              size="sm"
            />
          </div>
        </div>

        <ResizableTable
          :data="filteredRecords"
          :columns="columns"
          class="nx-table"
          :ui="{ th: 'py-2.5', td: 'py-2.5' }"
          data-testid="report-export-table"
        >
          <template #id-cell="{ row }">
            <button class="text-left text-[13px] font-medium text-primary hover:underline" :data-testid="'report-export-open-' + row.original.id" @click="openDetail(row.original)">
              {{ row.original.id }}
            </button>
            <p class="mt-0.5 text-[11px] text-muted">
              {{ row.original.fileName }}
            </p>
          </template>
          <template #kind-cell="{ row }">
            <div class="text-xs">
              <p class="text-highlighted">
                {{ reportExportKindLabels[row.original.kind] }}
              </p>
              <p class="text-muted">
                {{ row.original.basis === 'ledger' ? '账面口径' : '管理口径' }}
              </p>
            </div>
          </template>
          <template #status-cell="{ row }">
            <div class="flex items-center gap-1.5">
              <UIcon v-if="row.original.status === 'queued' || row.original.status === 'running'" name="i-carbon-in-progress" class="size-3 animate-spin text-info" />
              <UBadge
                :label="statusLabel(row.original)"
                :color="statusColor(row.original)"
                variant="subtle"
                size="sm"
                :data-testid="'report-export-status-' + row.original.id"
              />
            </div>
            <p v-if="row.original.failureReason" class="mt-0.5 max-w-56 text-[11px] text-error">
              {{ row.original.failureReason }}
            </p>
          </template>
          <template #snapshot-cell="{ row }">
            <p class="font-mono text-[11px] text-highlighted">
              {{ row.original.snapshotId }}
            </p>
            <p class="mt-0.5 text-[11px] text-muted">
              水位 #{{ row.original.watermark }} · {{ row.original.rowCount }} 行
            </p>
          </template>
          <template #actions-cell="{ row }">
            <div class="flex justify-end gap-1">
              <UButton
                label="下载"
                color="neutral"
                variant="ghost"
                size="xs"
                :disabled="row.original.status !== 'ready'"
                :data-testid="'report-export-download-' + row.original.id"
                @click="downloadExport(row.original)"
              />
              <UButton
                label="重建"
                color="neutral"
                variant="ghost"
                size="xs"
                :disabled="row.original.status === 'queued' || row.original.status === 'running'"
                :data-testid="'report-export-rebuild-' + row.original.id"
                @click="rebuildExport(row.original)"
              />
            </div>
          </template>
          <template #empty>
            <UEmpty
              variant="naked"
              icon="i-carbon-document-export"
              title="没有匹配的导出记录"
              description="调整搜索或状态，或生成当前期间的报表导出。"
            />
          </template>
        </ResizableTable>

        <p class="text-xs text-muted">
          导出为本地演示：文件内容由当前报表行生成，状态在 1–2 秒内自动完成；按原快照重建会复用原快照号与水位，不重新计算账面数据。
        </p>
      </div>
    </UCard>

    <USlideover v-model:open="detailOpen" :ui="{ content: 'w-full sm:max-w-2xl' }">
      <template #header>
        <div v-if="selectedRecord">
          <p class="text-xs text-muted">
            报表导出记录
          </p>
          <div class="mt-1 flex flex-wrap items-center gap-2">
            <h2 class="text-base font-semibold text-highlighted">
              {{ selectedRecord.id }}
            </h2>
            <UBadge
              :label="statusLabel(selectedRecord)"
              :color="statusColor(selectedRecord)"
              variant="subtle"
              size="sm"
            />
          </div>
          <p class="mt-0.5 text-xs text-muted">
            {{ reportExportKindLabels[selectedRecord.kind] }} · {{ selectedRecord.period }}
          </p>
        </div>
      </template>
      <template #body>
        <div v-if="selectedRecord" class="space-y-4" data-testid="report-export-detail">
          <div class="grid gap-2 sm:grid-cols-2">
            <div class="rounded-sm border border-default px-3 py-2">
              <p class="text-xs text-muted">
                快照号
              </p>
              <p class="mt-1 font-mono text-xs text-highlighted" data-testid="report-export-detail-snapshot">
                {{ selectedRecord.snapshotId }}
              </p>
            </div>
            <div class="rounded-sm border border-default px-3 py-2">
              <p class="text-xs text-muted">
                水位
              </p>
              <p class="mt-1 text-xs text-highlighted" data-testid="report-export-detail-watermark">
                #{{ selectedRecord.watermark }}
              </p>
            </div>
            <div class="rounded-sm border border-default px-3 py-2">
              <p class="text-xs text-muted">
                申请 / 完成
              </p>
              <p class="mt-1 text-xs text-highlighted">
                {{ selectedRecord.requestedAt }}
              </p>
              <p class="text-[11px] text-muted">
                {{ selectedRecord.completedAt ?? '尚未完成' }}
              </p>
            </div>
            <div class="rounded-sm border border-default px-3 py-2">
              <p class="text-xs text-muted">
                文件
              </p>
              <p class="mt-1 text-xs text-highlighted">
                {{ selectedRecord.fileName }}
              </p>
              <p class="text-[11px] text-muted">
                {{ selectedRecord.fileSizeKb }} KB · {{ selectedRecord.rowCount }} 行
              </p>
            </div>
          </div>

          <div class="rounded-sm border border-default px-3 py-2 text-xs">
            <p class="text-muted">
              文件哈希
            </p>
            <p class="mt-1 break-all font-mono text-[11px] text-highlighted">
              {{ selectedRecord.fileHash }}
            </p>
            <p v-if="selectedRecord.rebuiltFrom" class="mt-2 text-muted" data-testid="report-export-detail-rebuild">
              重建自 {{ selectedRecord.rebuiltFrom }}，复用原快照与水位。
            </p>
            <p v-if="selectedRecord.failureReason" class="mt-2 text-error">
              {{ selectedRecord.failureReason }}
            </p>
          </div>

          <div class="flex flex-wrap justify-end gap-2">
            <UButton
              v-if="selectedRecord.status === 'ready'"
              label="下载 CSV"
              icon="i-carbon-download"
              data-testid="report-export-detail-download"
              @click="downloadExport(selectedRecord)"
            />
            <UButton
              v-if="selectedRecord.status === 'ready' || selectedRecord.status === 'failed'"
              label="按原快照重建"
              icon="i-carbon-renew"
              color="neutral"
              variant="outline"
              :data-testid="'report-export-detail-rebuild-' + selectedRecord.id"
              @click="rebuildExport(selectedRecord)"
            />
            <UButton
              label="关闭"
              color="neutral"
              variant="ghost"
              @click="detailOpen = false"
            />
          </div>
        </div>
      </template>
    </USlideover>
  </div>
</template>

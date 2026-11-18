<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { AuditEntry } from '~/mocks'

const toast = useToast()
const org = useOrganizationStore()
const { activeWorkspaceId } = useMockWorkspace()

const actorFilter = ref('all')
const actionFilter = ref('all')
const rangeFilter = ref<'7' | '30' | 'all'>('30')
const pageSize = 8

const workspaceRows = computed(() => org.auditRows.filter(item => item.workspaceId === activeWorkspaceId.value))
const actorOptions = computed(() => [...new Set(workspaceRows.value.map(item => item.actor))].sort())
const actionOptions = computed(() => [...new Set(workspaceRows.value.map(item => item.action))].sort())

const filteredRows = computed(() => {
  const threshold = rangeFilter.value === '7' ? '2026-11-11' : rangeFilter.value === '30' ? '2026-10-19' : '0000-00-00'
  return workspaceRows.value.filter((item) => {
    if (actorFilter.value !== 'all' && item.actor !== actorFilter.value) return false
    if (actionFilter.value !== 'all' && item.action !== actionFilter.value) return false
    if (rangeFilter.value !== 'all' && item.at.slice(0, 10) < threshold) return false
    return true
  })
})

const {
  page,
  pageRows,
  pageStart,
  pageEnd,
  resetPage
} = useClientPagination(filteredRows, pageSize)
const hasFilters = computed(() => actorFilter.value !== 'all' || actionFilter.value !== 'all' || rangeFilter.value !== '30')

watch([actorFilter, actionFilter, rangeFilter], resetPage)

function resetFilters() {
  actorFilter.value = 'all'
  actionFilter.value = 'all'
  rangeFilter.value = '30'
}

function actionColor(action: string) {
  if (action.includes('审批') || action.includes('恢复')) return 'success'
  if (action.includes('停用') || action.includes('删除') || action.includes('取消')) return 'warning'
  if (action.includes('更新') || action.includes('编辑') || action.includes('调整')) return 'info'
  if (action.includes('创建') || action.includes('提交')) return 'primary'
  return 'neutral'
}

const columns: TableColumn<AuditEntry>[] = [
  { accessorKey: 'at', header: '时间', id: 'at' },
  { accessorKey: 'actor', header: '操作者', id: 'actor' },
  { accessorKey: 'action', header: '操作', id: 'action' },
  { accessorKey: 'target', header: '对象', id: 'target' }
]

function exportCsv() {
  if (!filteredRows.value.length) {
    toast.add({ title: '当前筛选没有可导出的记录', color: 'warning', icon: 'i-carbon-information' })
    return
  }
  downloadCsv(
    'audit-' + activeWorkspaceId.value + '-' + Date.now() + '.csv',
    ['时间', '工作区', '操作者', '操作', '对象'],
    filteredRows.value.map(item => [item.at, item.workspaceId, item.actor, item.action, item.target])
  )
  toast.add({
    title: '审计日志已导出',
    description: '共 ' + filteredRows.value.length + ' 条，CSV 含 UTF-8 BOM。',
    color: 'success',
    icon: 'i-carbon-download'
  })
}
</script>

<template>
  <div class="space-y-4" data-testid="settings-audit">
    <UCard :ui="{ body: 'p-0 sm:p-0', footer: 'p-0 sm:p-0' }">
      <template #header>
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 class="text-sm font-semibold text-highlighted">
              操作审计
            </h3>
            <p class="mt-0.5 text-xs text-muted">
              当前工作区 {{ workspaceRows.length }} 条 · 筛选后 {{ filteredRows.length }} 条
            </p>
          </div>
          <UButton
            label="导出 CSV"
            icon="i-carbon-download"
            color="neutral"
            variant="outline"
            size="sm"
            data-testid="audit-export"
            @click="exportCsv"
          />
        </div>
      </template>

      <div class="flex flex-wrap items-center gap-2 border-b border-default px-4 py-3">
        <USelect
          v-model="actorFilter"
          :items="[{ label: '全部操作者', value: 'all' }, ...actorOptions.map(item => ({ label: item, value: item }))]"
          class="w-40"
          data-testid="audit-actor-filter"
        />
        <USelect
          v-model="actionFilter"
          :items="[{ label: '全部操作', value: 'all' }, ...actionOptions.map(item => ({ label: item, value: item }))]"
          class="w-40"
          data-testid="audit-action-filter"
        />
        <USelect
          v-model="rangeFilter"
          :items="[
            { label: '近 7 天', value: '7' },
            { label: '近 30 天', value: '30' },
            { label: '全部时间', value: 'all' }
          ]"
          class="w-32"
          data-testid="audit-range-filter"
        />
        <UButton
          v-if="hasFilters"
          label="清空筛选"
          color="neutral"
          variant="ghost"
          size="sm"
          icon="i-carbon-close"
          data-testid="audit-clear-filters"
          @click="resetFilters"
        />
        <span class="ml-auto text-xs text-muted">只读 · 演示数据</span>
      </div>

      <ResizableTable
        :data="pageRows"
        :columns="columns"
        class="nx-table"
        :ui="{ th: 'py-2.5', td: 'py-3' }"
        data-testid="audit-log-table"
      >
        <template #at-cell="{ row }">
          <span class="font-mono text-xs text-muted">{{ row.original.at }}</span>
        </template>
        <template #actor-cell="{ row }">
          <div class="flex items-center gap-2">
            <UAvatar :alt="row.original.actor" size="xs" :ui="{ fallback: 'text-[10px]' }" />
            <span class="text-sm text-default">{{ row.original.actor }}</span>
          </div>
        </template>
        <template #action-cell="{ row }">
          <UBadge
            :color="actionColor(row.original.action)"
            variant="subtle"
            size="sm"
            :label="row.original.action"
          />
        </template>
        <template #target-cell="{ row }">
          <span class="font-mono text-xs text-default">{{ row.original.target }}</span>
        </template>
        <template #empty>
          <UEmpty
            variant="naked"
            icon="i-carbon-document"
            title="当前筛选没有审计记录"
            description="放宽操作者、操作类型或时间范围后重试。"
            :actions="[{ label: '清空筛选', color: 'neutral', variant: 'outline', size: 'sm', onClick: resetFilters }]"
          />
        </template>
      </ResizableTable>

      <template #footer>
        <div class="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5">
          <p class="text-xs text-muted">
            第 {{ pageStart }}–{{ pageEnd }} 条，共 {{ filteredRows.length }} 条
          </p>
          <UPagination
            v-model:page="page"
            :total="filteredRows.length"
            :items-per-page="pageSize"
            size="sm"
            data-testid="audit-pagination"
          />
        </div>
      </template>
    </UCard>

    <UAlert
      color="info"
      variant="soft"
      icon="i-carbon-locked"
      title="审计记录不可编辑"
      description="演示仅展示筛选、分页与导出；真实后端应由服务端签名与留存，前端不提供修改入口。"
    />
  </div>
</template>

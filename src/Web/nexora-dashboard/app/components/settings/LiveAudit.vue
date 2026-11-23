<script setup lang="ts">
import { useAdministration } from '~/composables/settings/useAdministration'
import { z } from 'zod'
import type { TableColumn } from '@nuxt/ui'
import { auditSources, changeSources, type AuditSource, type ChangeSource, type RecordChange } from '#shared/types/workspace-audit'
import { auditPageSize, useWorkspaceAuditApi } from '~/composables/api/useWorkspaceAuditApi'
import { auditEntryLink, auditSourceNames, displaySnapshot, recordChangeLink } from '~/utils/organization/audit'
import { saveReportBlob } from '~/utils/finance/reporting'
import { ApiFailure } from '~/utils/api/client'

const props = defineProps<{ view: 'audit' | 'changes', fixedSource?: AuditSource }>()
const { owner, workspace, session } = useAdministration()
const api = useWorkspaceAuditApi()
const route = useRoute()
const source = ref<ChangeSource>(props.fixedSource ?? 'organization')
const sourceOptions = computed(() => (props.view === 'audit' ? auditSources : changeSources).map(value => ({ value, label: auditSourceNames[value] })))
const page = ref(1)
const filters = reactive({ from: '', through: '', actor: '', entityName: '', operation: 'all', action: '', resource: '' })
const applied = ref<Record<string, string>>({})
const error = ref('')
const exporting = ref(false)
const record = ref<RecordChange | null>(null)
const showDetails = ref(false)
const params = computed(() => new URLSearchParams({ ...applied.value, page: String(page.value), pageSize: String(auditPageSize) }))
const query = useWorkspaceQuery('workspace-audit-history', '/change-log', (id, signal) => {
  if (props.view === 'audit' && isAuditSource(source.value)) {
    return api.audit(id, source.value, params.value, signal).then(result => ({ ...result, changes: [] as RecordChange[] }))
  }
  return api.changes(id, source.value, params.value, signal).then(result => ({ ...result, entries: [] }))
}, () => [props.view, source.value, params.value.toString()])

type Row = { id: string, type: string, action: string, subject: string, at: string, resource: string, link: ReturnType<typeof auditEntryLink>, change?: RecordChange }
const rows = computed<Row[]>(() => props.view === 'audit'
  ? (query.data?.entries ?? []).map(row => ({
      id: row.id, type: auditSourceNames[row.source], action: row.action, subject: row.actorSubject, at: row.occurredAtUtc, resource: row.targetId ?? '', link: auditEntryLink(row, workspace())
    }))
  : (query.data?.changes ?? []).map(row => ({
      id: row.id, type: row.entityName, action: row.operation, subject: row.actorSubject, at: row.occurredAtUtc, resource: row.entityId, link: recordChangeLink(row, workspace()), change: row
    })))
const columns: TableColumn<Row>[] = [
  { accessorKey: 'at', header: '发生时间' }, { accessorKey: 'type', header: '类型' }, { accessorKey: 'action', header: '动作' },
  { accessorKey: 'subject', header: '操作者' }, { id: 'resource', header: '资源' }, { id: 'actions', header: '' }
]
function isAuditSource(value: ChangeSource): value is AuditSource {
  return auditSources.some(item => item === value)
}

function reset() {
  const given = props.fixedSource === 'purchasing' ? z.uuid().safeParse(route.query.order).data : undefined
  Object.assign(filters, { from: '', through: '', actor: '', entityName: '', operation: 'all', action: '', resource: given ?? '' })
  applied.value = given ? { [props.view === 'audit' ? 'targetId' : 'entityId']: given } : {}
  page.value = 1
  record.value = null
  showDetails.value = false
  error.value = ''
}
watch([owner, () => props.view], () => {
  if (props.view === 'audit' && !isAuditSource(source.value)) source.value = 'organization'
  reset()
  exporting.value = false
}, { immediate: true, flush: 'sync' })
watch(source, reset)

function apply() {
  error.value = ''
  const resource = filters.resource.trim()
  if (resource && !z.uuid().safeParse(resource).success) {
    error.value = '资源编号必须为 UUID。'
    return
  }
  if (filters.from && filters.through && filters.from > filters.through) {
    error.value = '开始日期必须早于或等于结束日期。'
    return
  }
  const pairs = {
    from: filters.from ? filters.from + 'T00:00:00.000Z' : '', through: filters.through ? filters.through + 'T23:59:59.9999999Z' : '', actor: filters.actor.trim(),
    ...(props.view === 'audit' ? { action: filters.action.trim(), targetId: resource } : { entityName: filters.entityName.trim(), operation: filters.operation === 'all' ? '' : filters.operation, entityId: resource })
  }
  applied.value = Object.fromEntries(Object.entries(pairs).filter(([, value]) => value))
  page.value = 1
  showDetails.value = false
}

async function download() {
  if (exporting.value || !query.data) return
  const current = owner()
  const mode = source.value
  const appliedQuery = params.value.toString()
  exporting.value = true
  error.value = ''
  try {
    const csv = await api.exportChanges(workspace(), mode, params.value)
    if (current === owner() && mode === source.value && appliedQuery === params.value.toString() && props.view === 'changes') saveReportBlob(csv, 'record-changes-' + workspace() + '.csv')
  } catch (failure) {
    if (current === owner()) error.value = failure instanceof ApiFailure ? failure.message : '导出失败，请重试。'
  } finally {
    if (current === owner()) exporting.value = false
  }
}
</script>

<template>
  <div class="space-y-4" data-testid="live-workspace-audit">
    <template v-if="query.enabled">
      <UCard>
        <form class="space-y-3" @submit.prevent="apply">
          <div class="grid gap-3 md:grid-cols-3 xl:grid-cols-4">
            <UFormField v-if="!fixedSource" label="服务">
              <USelect
                v-model="source"
                :items="sourceOptions"
                class="w-full"
                data-testid="live-audit-source"
              />
            </UFormField>
            <UFormField label="开始日期（UTC）">
              <UInput v-model="filters.from" type="date" class="w-full" />
            </UFormField>
            <UFormField label="结束日期（UTC）">
              <UInput v-model="filters.through" type="date" class="w-full" />
            </UFormField>
            <UFormField label="操作者">
              <UInput
                v-model="filters.actor"
                placeholder="操作者标识"
                maxlength="260"
                class="w-full"
              />
            </UFormField>
            <UFormField label="资源编号">
              <UInput
                v-model="filters.resource"
                placeholder="UUID"
                maxlength="36"
                class="w-full"
                data-testid="live-audit-resource"
              />
            </UFormField>
            <UFormField v-if="view === 'audit'" label="动作">
              <UInput
                v-model="filters.action"
                placeholder="例如 purchase.created"
                maxlength="80"
                class="w-full"
                data-testid="live-audit-action"
              />
            </UFormField>
            <template v-else>
              <UFormField label="实体类型">
                <UInput
                  v-model="filters.entityName"
                  placeholder="例如 PurchaseOrder"
                  maxlength="80"
                  class="w-full"
                  data-testid="live-audit-entity"
                />
              </UFormField>
              <UFormField label="动作">
                <USelect
                  v-model="filters.operation"
                  :items="[{ label: '全部', value: 'all' }, { label: '新增', value: 'created' }, { label: '修改', value: 'updated' }, { label: '删除', value: 'deleted' }]"
                  class="w-full"
                  data-testid="live-audit-operation"
                />
              </UFormField>
            </template>
          </div>
          <div class="flex flex-wrap gap-2">
            <UButton
              type="submit"
              label="应用筛选"
              size="sm"
              data-testid="live-audit-apply"
            />
            <UButton
              label="清空筛选"
              color="neutral"
              variant="ghost"
              size="sm"
              @click="reset"
            />
            <UButton
              label="刷新"
              color="neutral"
              variant="outline"
              size="sm"
              @click="query.refresh()"
            />
            <UButton
              v-if="view === 'changes' && query.data"
              label="导出筛选结果 CSV"
              color="neutral"
              variant="outline"
              size="sm"
              :loading="exporting"
              data-testid="live-audit-export"
              @click="download"
            />
          </div>
          <p v-if="view === 'changes' && query.data" class="text-xs text-muted">
            每次最多导出 5,000 条匹配记录。
          </p>
        </form>
      </UCard>
      <UAlert
        v-if="error"
        :title="error"
        color="error"
        variant="subtle"
      />
      <SettingsAdministrationQueryState :query="query" />
      <UCard v-if="query.data">
        <UTable
          :data="rows"
          :columns="columns"
          empty="没有匹配记录"
          data-testid="live-audit-table"
        >
          <template #resource-cell="{ row }">
            <span class="break-all font-mono text-xs">{{ row.original.resource || '—' }}</span>
          </template>
          <template #actions-cell="{ row }">
            <div class="flex flex-wrap gap-1">
              <UButton
                v-if="row.original.link && session.canVisit(row.original.link.path)"
                :to="row.original.link"
                label="打开来源"
                size="xs"
                color="neutral"
                variant="outline"
              />
              <UButton
                v-if="row.original.change"
                label="查看变更"
                size="xs"
                color="neutral"
                variant="outline"
                @click="record = row.original.change; showDetails = true"
              />
            </div>
          </template>
        </UTable>
        <template #footer>
          <div class="flex flex-wrap items-center gap-2">
            <UButton
              label="上一页"
              size="sm"
              color="neutral"
              variant="outline"
              :disabled="page === 1"
              @click="page--"
            />
            <span class="text-sm text-muted">第 {{ page }} 页 · 保留 {{ query.data.retentionDays }} 天</span>
            <UButton
              label="下一页"
              size="sm"
              color="neutral"
              variant="outline"
              :disabled="!query.data.hasMore"
              @click="page++"
            />
          </div>
        </template>
      </UCard>
      <USlideover v-model:open="showDetails" :title="record?.entityName || '变更详情'">
        <template #body>
          <div v-if="record" class="space-y-4" data-testid="live-audit-snapshot">
            <p class="text-sm text-muted">
              {{ record.changedProperties || record.operation }}
            </p>
            <div v-for="snapshot in [{ label: '变更前', body: record.beforeJson }, { label: '变更后', body: record.afterJson }]" :key="snapshot.label">
              <p class="mb-2 text-sm font-medium">
                {{ snapshot.label }}
              </p>
              <pre class="overflow-auto whitespace-pre-wrap break-all rounded bg-elevated p-3 text-xs">{{ displaySnapshot(snapshot.body) }}</pre>
            </div>
          </div>
        </template>
      </USlideover>
    </template>
    <USkeleton v-else-if="session.loading" class="h-20 w-full" />
    <UAlert
      v-else
      title="当前工作区未授予审计权限或未启用审计模块"
      color="warning"
      variant="subtle"
    />
  </div>
</template>

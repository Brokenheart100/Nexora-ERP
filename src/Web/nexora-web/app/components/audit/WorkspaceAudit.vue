<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { AuditEntry, AuditFilters, AuditPage, AuditSource } from '~/utils/audit/audit'

const props = defineProps<{ workspaceId: string }>()

const tab = ref<'audit' | 'changes'>('audit')

interface Source {
  id: AuditSource
  label: string
  path: string
}

const sources = computed<Source[]>(() => {
  const id = props.workspaceId
  return [
    { id: 'organization', label: '组织与安全', path: '/bff/api/workspaces/' + id + '/audit' },
    { id: 'finance', label: '财务', path: '/bff/api/finance/workspaces/' + id + '/audit' },
    { id: 'sales', label: '销售', path: '/bff/api/sales/workspaces/' + id + '/audit' },
    { id: 'purchasing', label: '采购', path: '/bff/api/purchasing/workspaces/' + id + '/audit' },
  ]
})

const form = reactive<AuditFilters>({ from: '', through: '', actor: '', action: '', targetId: '', source: '' })
const entries = shallowRef<AuditEntry[]>([])
const denied = shallowRef<string[]>([])
const page = ref(1)
const hasMore = ref(false)
const retentionDays = ref(730)
const busy = ref(false)
const notice = ref('')
const error = ref('')
const expandedRows = ref<Record<string, boolean>>({})

const rowId = (entry: AuditEntry) => entry.source + '|' + entry.id
function toggle(id: string) {
  expandedRows.value = { ...expandedRows.value, [id]: !expandedRows.value[id] }
}

const columns: TableColumn<AuditEntry>[] = [
  { accessorKey: 'occurredAtUtc', header: '时间' },
  { accessorKey: 'source', header: '来源' },
  { accessorKey: 'action', header: '操作' },
  { accessorKey: 'actorSubject', header: '操作者' },
  { accessorKey: 'targetId', header: '目标' },
  { accessorKey: 'version', header: '版本' },
  { id: 'detail', header: '详情' },
]

const sourceLabels: Record<string, string> = { organization: '组织与安全', finance: '财务', sales: '销售', purchasing: '采购' }
const sourceLabel = (source: string) => sourceLabels[source] ?? source
const sourceOptions = computed(() => [
  { label: '全部来源', value: '__all__' },
  ...sources.value.map(source => ({ label: source.label, value: source.id as string })),
])
function setSource(value: string) {
  form.source = value as AuditFilters['source']
}
const sourceSelection = computed({
  get: () => form.source || '__all__',
  set: value => setSource(value === '__all__' ? '' : String(value)),
})
const moment = (value: string) => value.replace('T', ' ').slice(0, 19) + ' UTC'

async function run(action: () => Promise<void>) {
  if (busy.value) return
  busy.value = true
  error.value = ''
  try { await action() }
  catch (failure) {
    error.value = (failure as { data?: { detail?: string } }).data?.detail ?? '无法读取审计记录。'
  }
  finally { busy.value = false }
}

async function load(reset = true) {
  if (reset) {
    page.value = 1
    entries.value = []
    expandedRows.value = {}
  }
  const targets = form.source ? sources.value.filter(item => item.id === form.source) : sources.value
  const params = auditQueryParams(form, page.value)
  const missing: string[] = []
  const results = await Promise.all(targets.map(async (source) => {
    try {
      const result = await $fetch<AuditPage>(source.path, { retry: 0, query: params })
      return { source, result }
    }
    catch (failure) {
      const status = (failure as { statusCode?: number; status?: number }).statusCode
        ?? (failure as { statusCode?: number; status?: number }).status
      if (status === 403 || status === 404) {
        missing.push(source.label)
        return { source, result: undefined }
      }
      throw failure
    }
  }))
  const merged = results.flatMap(item => item.result?.entries ?? [])
  entries.value = reset ? mergeAuditEntries(merged) : mergeAuditEntries([...entries.value, ...merged])
  hasMore.value = results.some(item => item.result?.hasMore === true)
  const retention = results.find(item => typeof item.result?.retentionDays === 'number')?.result?.retentionDays
  if (retention) retentionDays.value = retention
  denied.value = missing
  notice.value = entries.value.length ? '' : '当前筛选条件下没有审计记录。'
}

function query() { return run(() => load(true)) }
function more() { page.value += 1; return run(() => load(false)) }

function exportRows() {
  const columns = [
    { header: '时间', value: (entry: AuditEntry) => entry.occurredAtUtc },
    { header: '来源', value: (entry: AuditEntry) => sourceLabel(entry.source) },
    { header: '操作', value: (entry: AuditEntry) => entry.action },
    { header: '操作者颁发方', value: (entry: AuditEntry) => entry.actorIssuer },
    { header: '操作者主体', value: (entry: AuditEntry) => entry.actorSubject },
    { header: '目标', value: (entry: AuditEntry) => entry.targetId ?? '' },
    { header: '版本', value: (entry: AuditEntry) => entry.version === null ? '' : String(entry.version) },
    { header: '操作 ID', value: (entry: AuditEntry) => entry.operationId ?? '' },
  ]
  downloadCsv(exportFileName('审计记录'), toCsv(columns, entries.value))
}

onMounted(() => { void run(() => load(true)).catch(() => { /* 首屏失败保留错误提示，可重试 */ }) })
</script>

<template>
  <section class="audit odoo-page" aria-labelledby="audit-title">
    <header class="odoo-page-head">
      <div class="odoo-page-title">
        <h2 id="audit-title">审计查询</h2>
        <p class="odoo-page-sub">统一查询组织与安全、财务、销售和采购审计记录；记录保留 {{ retentionDays }} 天，跨工作区不可见。</p>
      </div>
      <div v-if="tab === 'audit'" class="odoo-page-actions">
        <UButton type="submit" form="audit-filter-form" color="primary" :disabled="busy">查询审计记录</UButton>
        <UButton variant="outline" color="neutral" :disabled="busy" @click="query">刷新审计记录</UButton>
        <UButton variant="outline" color="neutral" :disabled="busy || !entries.length" @click="exportRows">导出审计记录 CSV</UButton>
      </div>
    </header>
    <div class="audit-tabs odoo-notebook" role="tablist" aria-label="审计视图">
      <button
id="audit-view-audit" type="button" role="tab" class="audit-tab odoo-notebook-tab" :class="{ active: tab === 'audit' }"
        :aria-selected="tab === 'audit'" aria-controls="audit-view-panel" data-testid="audit-tab-audit"
        @click="tab = 'audit'">审计查询</button>
      <button
id="audit-view-changes" type="button" role="tab" class="audit-tab odoo-notebook-tab" :class="{ active: tab === 'changes' }"
        :aria-selected="tab === 'changes'" aria-controls="audit-view-panel" data-testid="audit-tab-changes"
        @click="tab = 'changes'">记录变更</button>
    </div>
    <div v-if="tab === 'audit'" id="audit-view-panel" role="tabpanel" aria-labelledby="audit-view-audit" class="odoo-view">
      <form id="audit-filter-form" @submit.prevent="query">
        <fieldset :disabled="busy" class="odoo-filter">
          <legend class="odoo-sr">审计筛选</legend>
          <UFormField label="开始日期" name="auditFrom">
            <UInput :model-value="form.from" type="date" @update:model-value="value => form.from = String(value)" />
          </UFormField>
          <UFormField label="截止日期" name="auditThrough">
            <UInput :model-value="form.through" type="date" @update:model-value="value => form.through = String(value)" />
          </UFormField>
          <UFormField label="操作者" name="auditActor">
            <UInput
:model-value="form.actor" type="text" placeholder="主体或颁发方"
              @update:model-value="value => form.actor = String(value)" />
          </UFormField>
          <UFormField label="操作" name="auditAction">
            <UInput
:model-value="form.action" type="text" placeholder="例如 workspace.settings.revised"
              @update:model-value="value => form.action = String(value)" />
          </UFormField>
          <UFormField label="目标 ID" name="auditTargetId">
            <UInput
:model-value="form.targetId" type="text" placeholder="可选"
              @update:model-value="value => form.targetId = String(value)" />
          </UFormField>
          <UFormField label="来源" name="auditSource">
            <USelect v-model="sourceSelection" :items="sourceOptions" />
          </UFormField>
        </fieldset>
      </form>
      <UAlert v-if="notice" role="status" :description="notice" />
      <UAlert
v-if="denied.length" role="status" color="warning" icon="i-lucide-triangle-alert"
        :description="'无权读取以下来源：' + denied.join('、') + '。'" />
      <UAlert v-if="error" role="alert" color="error" icon="i-lucide-circle-alert" :description="error" />
      <div class="odoo-list-toolbar">
        <p v-if="entries.length" class="odoo-list-meta">共 {{ entries.length }} 条 · 保留 {{ retentionDays }} 天 · 最新在前</p>
        <span class="odoo-list-hint">展开行查看操作 ID、颁发方与目标</span>
      </div>
      <div v-if="entries.length || busy" class="odoo-list">
        <UTable
          v-model:expanded="expandedRows"
          data-testid="audit-entry-list"
          :loading="busy"
          :data="entries"
          :columns="columns"
          :get-row-id="rowId"
          :ui="{ td: 'align-top whitespace-normal', th: 'whitespace-nowrap' }"
        >
          <template #occurredAtUtc-cell="{ row }">{{ moment(row.original.occurredAtUtc) }}</template>
          <template #source-cell="{ row }">{{ sourceLabel(row.original.source) }}</template>
          <template #targetId-cell="{ row }">{{ row.original.targetId ?? '—' }}</template>
          <template #version-cell="{ row }">{{ row.original.version ?? '—' }}</template>
          <template #detail-cell="{ row }">
            <UButton
variant="outline" color="neutral" size="xs" :aria-expanded="!!expandedRows[rowId(row.original)]"
              @click="toggle(rowId(row.original))">
              {{ expandedRows[rowId(row.original)] ? '收起' : '展开' }}
            </UButton>
          </template>
          <template #expanded="{ row }">
            <p class="audit-detail">
              操作 ID {{ row.original.operationId ?? '—' }} · 颁发方 {{ row.original.actorIssuer }} · 主体 {{ row.original.actorSubject }}
              · 目标 {{ row.original.targetId ?? '—' }} · 发生时间 {{ moment(row.original.occurredAtUtc) }}
            </p>
          </template>
        </UTable>
      </div>
      <div v-if="hasMore" class="odoo-loadmore">
        <UButton variant="outline" color="neutral" :disabled="busy" @click="more">加载更多</UButton>
      </div>
    </div>
    <WorkspaceRecordChanges v-else :workspace-id="workspaceId" />
  </section>
</template>

<style scoped>
.audit { margin-top: 24px; }
.audit-detail { margin: 0; color: var(--od-muted); font-size: 12px; }
</style>

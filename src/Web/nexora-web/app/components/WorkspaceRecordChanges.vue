<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { RecordChange, RecordChangeFilters, RecordChangePage } from '~/utils/recordChanges'

const props = defineProps<{ workspaceId: string }>()

interface Source {
  id: string
  label: string
  path: string
}

const sources = computed<Source[]>(() => {
  const id = props.workspaceId
  return [
    { id: 'organization', label: '组织与安全', path: '/bff/api/workspaces/' + id + '/record-changes' },
    { id: 'finance', label: '财务', path: '/bff/api/finance/workspaces/' + id + '/record-changes' },
    { id: 'sales', label: '销售', path: '/bff/api/sales/workspaces/' + id + '/record-changes' },
    { id: 'purchasing', label: '采购', path: '/bff/api/purchasing/workspaces/' + id + '/record-changes' },
    { id: 'masterdata', label: '主数据', path: '/bff/api/masterdata/workspaces/' + id + '/record-changes' },
    { id: 'inventory', label: '库存', path: '/bff/api/inventory/workspaces/' + id + '/record-changes' },
  ]
})

const form = reactive<RecordChangeFilters>({
  from: '', through: '', actor: '', entityName: '', operation: '', entityId: '',
})
const source = ref('')
const operationOptions = [
  { label: '全部操作', value: '__all__' },
  ...recordChangeOperations.filter(item => item.id).map(item => ({ label: item.label, value: item.id })),
]
const sourceOptions = computed(() => [
  { label: '全部来源', value: '__all__' },
  ...sources.value.map(item => ({ label: item.label, value: item.id })),
])
function setOperation(value: string) {
  form.operation = value as RecordChangeFilters['operation']
}
const operationSelection = computed({
  get: () => form.operation || '__all__',
  set: value => setOperation(value === '__all__' ? '' : String(value)),
})
const sourceSelection = computed({
  get: () => source.value || '__all__',
  set: value => { source.value = value === '__all__' ? '' : String(value) },
})
const changes = shallowRef<RecordChange[]>([])
const denied = shallowRef<string[]>([])
const page = ref(1)
const hasMore = ref(false)
const retentionDays = ref(730)
const busy = ref(false)
const notice = ref('')
const error = ref('')
const deniedSignature = ref('')
const expandedRows = ref<Record<string, boolean>>({})

const { success, warning } = useNotice()

const serviceLabels: Record<string, string> = {
  organization: '组织与安全', finance: '财务', sales: '销售',
  purchasing: '采购', masterdata: '主数据', inventory: '库存',
}
const serviceLabel = (service: string) => serviceLabels[service] ?? service
const moment = (value: string) => value.replace('T', ' ').slice(0, 19) + ' UTC'
const pretty = (json: string | null) => {
  if (!json) return '—'
  try { return JSON.stringify(JSON.parse(json), null, 2) }
  catch { return json }
}
const rowId = (change: RecordChange) => change.service + '|' + change.id
function toggle(id: string) {
  expandedRows.value = { ...expandedRows.value, [id]: !expandedRows.value[id] }
}

const columns: TableColumn<RecordChange>[] = [
  { accessorKey: 'occurredAtUtc', header: '时间' },
  { accessorKey: 'service', header: '来源' },
  { accessorKey: 'entityName', header: '实体' },
  { accessorKey: 'operation', header: '操作' },
  { accessorKey: 'actorSubject', header: '操作者' },
  { id: 'summary', header: '变更', accessorFn: change => recordChangeSummary(change) },
  { id: 'detail', header: '详情' },
]

async function run(action: () => Promise<void>) {
  if (busy.value) return
  busy.value = true
  error.value = ''
  try { await action() }
  catch (failure) {
    error.value = (failure as { data?: { detail?: string } }).data?.detail ?? '无法读取记录变更。'
  }
  finally { busy.value = false }
}

async function load(reset = true) {
  if (reset) {
    page.value = 1
    changes.value = []
    expandedRows.value = {}
  }
  const targets = source.value ? sources.value.filter(item => item.id === source.value) : sources.value
  const params = recordChangeQueryParams(form, page.value)
  const missing: string[] = []
  const results = await Promise.all(targets.map(async (item) => {
    try {
      const result = await $fetch<RecordChangePage>(item.path, { retry: 0, query: params })
      return { item, result }
    }
    catch (failure) {
      const status = (failure as { statusCode?: number; status?: number }).statusCode
        ?? (failure as { statusCode?: number; status?: number }).status
      if (status === 403 || status === 404) {
        missing.push(item.label)
        return { item, result: undefined }
      }
      throw failure
    }
  }))
  const merged = results.flatMap(item => item.result?.changes ?? [])
  changes.value = reset ? mergeRecordChanges(merged) : mergeRecordChanges([...changes.value, ...merged])
  hasMore.value = results.some(item => item.result?.hasMore === true)
  const retention = results.find(item => typeof item.result?.retentionDays === 'number')?.result?.retentionDays
  if (retention) retentionDays.value = retention
  denied.value = missing
  const signature = missing.join('|')
  if (signature && signature !== deniedSignature.value) {
    deniedSignature.value = signature
    warning('无权读取以下来源：' + missing.join('、') + '。')
  }
  notice.value = changes.value.length ? '' : '当前筛选条件下没有记录变更。'
}

function query() { return run(() => load(true)) }
function more() { page.value += 1; return run(() => load(false)) }

function exportRows() {
  const columns = [
    { header: '时间', value: (change: RecordChange) => change.occurredAtUtc },
    { header: '来源', value: (change: RecordChange) => serviceLabel(change.service) },
    { header: '实体', value: (change: RecordChange) => change.entityName },
    { header: '实体 ID', value: (change: RecordChange) => change.entityId },
    { header: '操作', value: (change: RecordChange) => recordChangeOperationLabel(change.operation) },
    { header: '操作者颁发方', value: (change: RecordChange) => change.actorIssuer },
    { header: '操作者主体', value: (change: RecordChange) => change.actorSubject },
    { header: '变更属性', value: (change: RecordChange) => change.changedProperties ?? '' },
    { header: '变更前', value: (change: RecordChange) => change.beforeJson ?? '' },
    { header: '变更后', value: (change: RecordChange) => change.afterJson ?? '' },
  ]
  downloadCsv(exportFileName('记录变更'), toCsv(columns, changes.value))
  success('已导出记录变更 CSV。')
}

onMounted(() => { void run(() => load(true)).catch(() => { /* 首屏失败保留错误提示，可重试 */ }) })
</script>

<template>
  <section class="record-changes" aria-labelledby="record-changes-title">
    <h2 id="record-changes-title"><UIcon class="heading-icon" name="i-lucide-history" aria-hidden="true" />记录变更</h2>
    <p class="hint">按服务查询实体创建、更新和删除快照；记录保留 {{ retentionDays }} 天，跨工作区不可见。</p>
    <form @submit.prevent="query">
      <fieldset :disabled="busy">
        <legend>记录变更筛选</legend>
        <UFormField label="开始日期" name="changeFrom">
          <UInput :model-value="form.from" type="date" @update:model-value="value => form.from = String(value)" />
        </UFormField>
        <UFormField label="截止日期" name="changeThrough">
          <UInput :model-value="form.through" type="date" @update:model-value="value => form.through = String(value)" />
        </UFormField>
        <UFormField label="操作者" name="changeActor">
          <UInput :model-value="form.actor" type="text" placeholder="主体或颁发方"
            @update:model-value="value => form.actor = String(value)" />
        </UFormField>
        <UFormField label="实体" name="changeEntityName">
          <UInput :model-value="form.entityName" type="text" placeholder="例如 JournalEntry"
            @update:model-value="value => form.entityName = String(value)" />
        </UFormField>
        <UFormField label="操作" name="changeOperation">
          <USelect v-model="operationSelection" :items="operationOptions" />
        </UFormField>
        <UFormField label="实体 ID" name="changeEntityId">
          <UInput :model-value="form.entityId" type="text" placeholder="可选"
            @update:model-value="value => form.entityId = String(value)" />
        </UFormField>
        <UFormField label="来源" name="changeSource">
          <USelect v-model="sourceSelection" :items="sourceOptions" />
        </UFormField>
        <button class="primary" :disabled="busy">查询记录变更</button>
      </fieldset>
    </form>
    <div class="actions">
      <button class="quiet" type="button" :disabled="busy" @click="query">刷新记录变更</button>
      <button class="quiet" type="button" :disabled="busy || !changes.length" @click="exportRows">导出记录变更 CSV</button>
    </div>
    <UAlert v-if="notice" role="status" :description="notice" />
    <UAlert v-if="denied.length" role="status" color="warning" icon="i-lucide-triangle-alert"
      :description="'无权读取以下来源：' + denied.join('、') + '。'" />
    <UAlert v-if="error" role="alert" color="error" icon="i-lucide-circle-alert" :description="error" />
    <p v-if="changes.length">共 {{ changes.length }} 条 · 保留 {{ retentionDays }} 天 · 最新在前</p>
    <UTable
      v-if="changes.length || busy"
      v-model:expanded="expandedRows"
      data-testid="record-change-list"
      :loading="busy"
      :data="changes"
      :columns="columns"
      :get-row-id="rowId"
      :ui="{ td: 'align-top whitespace-normal', th: 'whitespace-nowrap' }"
    >
      <template #occurredAtUtc-cell="{ row }">{{ moment(row.original.occurredAtUtc) }}</template>
      <template #service-cell="{ row }">{{ serviceLabel(row.original.service) }}</template>
      <template #entityName-cell="{ row }">
        {{ row.original.entityName }}<small class="entity-id">{{ row.original.entityId }}</small>
      </template>
      <template #operation-cell="{ row }">{{ recordChangeOperationLabel(row.original.operation) }}</template>
      <template #detail-cell="{ row }">
        <button class="quiet" type="button" :aria-expanded="!!expandedRows[rowId(row.original)]"
          @click="toggle(rowId(row.original))">
          {{ expandedRows[rowId(row.original)] ? '收起' : '展开' }}
        </button>
      </template>
      <template #expanded="{ row }">
        <p>操作 ID {{ row.original.id }} · 颁发方 {{ row.original.actorIssuer }} · 主体 {{ row.original.actorSubject }}
          · 发生时间 {{ moment(row.original.occurredAtUtc) }}</p>
        <div class="snapshots">
          <div><strong>变更前</strong><pre>{{ pretty(row.original.beforeJson) }}</pre></div>
          <div><strong>变更后</strong><pre>{{ pretty(row.original.afterJson) }}</pre></div>
        </div>
      </template>
    </UTable>
    <button v-if="hasMore" class="quiet" type="button" :disabled="busy" @click="more">加载更多</button>
  </section>
</template>

<style scoped>
.record-changes { margin-top: 24px }
fieldset { display: flex; flex-wrap: wrap; gap: 10px; align-items: end; min-width: 0; margin: 12px 0 }
.actions { display: flex; flex-wrap: wrap; gap: 8px; margin: 8px 0 12px }
.entity-id { display: block; font-size: 0.8em; opacity: 0.65; word-break: break-all }
.snapshots { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 10px; margin-top: 8px }
pre { margin: 4px 0 0; padding: 8px; max-height: 240px; overflow: auto; background: #f7f9fc; border-radius: 8px; font-size: 0.85em }
</style>

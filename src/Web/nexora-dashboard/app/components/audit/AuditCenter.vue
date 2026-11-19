<script setup lang="ts">
import type { TableColumn, TimelineItem } from '@nuxt/ui'
import type {
  AuditFieldChange,
  AuditQuickEntry,
  AuditRecord,
  AuditRoleKey,
  AuditServiceKey
} from '~/mocks/auditCenter'
import {
  AUDIT_DEMO_TODAY,
  auditChangeScopeLabels,
  auditOperationColors,
  auditOperationLabels,
  auditQuickEntries,
  auditRecords,
  auditRoles,
  auditServiceColors,
  auditServiceDescriptions,
  auditServiceLabels,
  auditServiceOrder,
  auditSourceKindLabels,
  canViewAuditScope,
  canViewAuditService,
  getAuditRole,
  getAuditScopeDeniedReason,
  getAuditServiceDeniedReason
} from '~/mocks/auditCenter'

const PAGE_SIZE = 6
const CSV_HEADERS = ['时间', '服务', '对象', '单号', '操作', '操作者', '版本', '来源', '变更摘要', '金额']

const route = useRoute()
const toast = useToast()
const { workspace, activeWorkspaceId } = useMockWorkspace()
const { isEmpty: isForcedEmpty, isForbidden } = useMockState()

const { data: loadedRecords, error: loadError, loading, run: reloadAudit } = useMockAsync(
  () => auditRecords,
  { delay: 260, immediate: true }
)

const roleKey = ref<AuditRoleKey>('admin')
const role = computed(() => getAuditRole(roleKey.value))
const activeService = ref<AuditServiceKey>('organization')
const rangeFilter = ref<'7' | '30' | 'all'>('30')
const entityFilter = ref('all')
const operationFilter = ref('all')
const actorFilter = ref('all')
const selectedId = ref('')
const detailOpen = ref(false)

const serviceItems = auditServiceOrder.map(service => ({ label: auditServiceLabels[service], value: service }))

function shiftDemoDay(days: number): string {
  const parts = AUDIT_DEMO_TODAY.split('-')
  const value = new Date(Date.UTC(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2])))
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}

const rangeOptions = [
  { label: '近 7 天（' + shiftDemoDay(-6) + ' 起）', value: '7' },
  { label: '近 30 天（' + shiftDemoDay(-29) + ' 起）', value: '30' },
  { label: '全部时间', value: 'all' }
]

const workspaceName = computed(() => workspace.value?.name ?? activeWorkspaceId.value)

const workspaceRecords = computed(() => {
  const rows = loadedRecords.value ?? []
  return rows.filter(row => row.workspaceId === activeWorkspaceId.value)
})

function canViewRecord(row: AuditRecord): { ok: boolean, reason: string } {
  if (!canViewAuditService(roleKey.value, row.service)) {
    return { ok: false, reason: getAuditServiceDeniedReason(roleKey.value, row.service) }
  }
  if (row.service === 'change' && row.scope && !canViewAuditScope(roleKey.value, row.scope)) {
    return { ok: false, reason: getAuditScopeDeniedReason(roleKey.value, row.scope) }
  }
  return { ok: true, reason: '' }
}

function isScopeVisible(row: AuditRecord): boolean {
  if (row.service !== 'change' || !row.scope) return true
  return canViewAuditScope(roleKey.value, row.scope)
}

const visibleRows = computed(() => {
  if (!canViewAuditService(roleKey.value, activeService.value)) return [] as AuditRecord[]
  return workspaceRecords.value.filter(row => row.service === activeService.value && isScopeVisible(row))
})

const hiddenScopeLabels = computed(() => {
  if (activeService.value !== 'change') return ''
  const labels = workspaceRecords.value
    .filter(row => row.service === 'change' && row.scope && !canViewAuditScope(roleKey.value, row.scope))
    .map(row => (row.scope ? auditChangeScopeLabels[row.scope] : ''))
  return [...new Set(labels)].join('、')
})

const filteredRows = computed(() => {
  if (isForcedEmpty.value) return [] as AuditRecord[]
  const cutoff = rangeFilter.value === 'all'
    ? ''
    : shiftDemoDay(rangeFilter.value === '7' ? -6 : -29)
  return visibleRows.value
    .filter(row => !cutoff || row.at.slice(0, 10) >= cutoff)
    .filter(row => entityFilter.value === 'all' || row.entity === entityFilter.value)
    .filter(row => operationFilter.value === 'all' || row.operation === operationFilter.value)
    .filter(row => actorFilter.value === 'all' || row.actor === actorFilter.value)
    .slice()
    .sort((left, right) => right.at.localeCompare(left.at))
})

const entityOptions = computed(() => {
  const values = [...new Set(visibleRows.value.map(row => row.entity))].sort((left, right) => left.localeCompare(right, 'zh-CN'))
  return [{ label: '全部对象', value: 'all' }, ...values.map(value => ({ label: value, value }))]
})

const operationOptions = computed(() => {
  const values = [...new Set(visibleRows.value.map(row => row.operation))]
  return [{ label: '全部操作', value: 'all' }, ...values.map(value => ({ label: auditOperationLabels[value], value }))]
})

const actorOptions = computed(() => {
  const values = [...new Set(visibleRows.value.map(row => row.actor))].sort((left, right) => left.localeCompare(right, 'zh-CN'))
  return [{ label: '全部操作者', value: 'all' }, ...values.map(value => ({ label: value, value }))]
})

const { page, total, pageRows, resetPage } = useClientPagination(filteredRows, PAGE_SIZE)
const pageStart = computed(() => (total.value === 0 ? 0 : (page.value - 1) * PAGE_SIZE + 1))
const pageEnd = computed(() => Math.min(page.value * PAGE_SIZE, total.value))

const hasActiveFilters = computed(() => (
  rangeFilter.value !== '30'
  || entityFilter.value !== 'all'
  || operationFilter.value !== 'all'
  || actorFilter.value !== 'all'
))

const filterSummary = computed(() => (
  '当前筛选 ' + filteredRows.value.length + ' 条 · 本页 ' + pageRows.value.length + ' 条 · 可访问全量 ' + visibleRows.value.length + ' 条'
))

const serviceAllowed = computed(() => canViewAuditService(roleKey.value, activeService.value))
const serviceDeniedReason = computed(() => getAuditServiceDeniedReason(roleKey.value, activeService.value))
const accessibleServices = computed(() => auditServiceOrder.filter(service => canViewAuditService(roleKey.value, service)))

const csvDisabled = computed(() => (
  !serviceAllowed.value
  || filteredRows.value.length === 0
  || Boolean(loadError.value)
  || loading.value
))

const csvScopeText = computed(() => {
  if (!serviceAllowed.value) return '当前身份无该服务权限，CSV 下载已禁用'
  if (filteredRows.value.length === 0) return '当前筛选 0 条，CSV 下载已禁用'
  return '当前筛选 ' + filteredRows.value.length + ' 条 · 下载含全部 ' + filteredRows.value.length + ' 条'
})

const selectedRecord = computed<AuditRecord | null>(() => (
  workspaceRecords.value.find(row => row.id === selectedId.value) ?? null
))

const selectedFields = computed<AuditFieldChange[]>(() => selectedRecord.value?.fields ?? [])
const chainItems = computed<TimelineItem[]>(() => (selectedRecord.value?.chain ?? []).map(step => ({
  date: step.at,
  title: step.action,
  description: step.actor + ' · ' + step.note,
  icon: 'i-carbon-checkmark'
})))

const columns: TableColumn<AuditRecord>[] = [
  { id: 'at', accessorKey: 'at', header: '时间', meta: { class: { td: 'whitespace-nowrap text-xs text-muted' } } },
  { id: 'service', accessorKey: 'service', header: '服务', meta: { class: { td: 'whitespace-nowrap' } } },
  { id: 'entity', accessorKey: 'entity', header: '对象与单号', meta: { class: { td: 'min-w-56 whitespace-normal' } } },
  { id: 'operation', accessorKey: 'operation', header: '操作', meta: { class: { td: 'whitespace-nowrap' } } },
  { id: 'actor', accessorKey: 'actor', header: '操作者', meta: { class: { td: 'whitespace-nowrap' } } },
  { id: 'version', accessorKey: 'version', header: '版本', meta: { class: { td: 'whitespace-nowrap' } } },
  { id: 'source', accessorKey: 'source', header: '来源', meta: { class: { td: 'whitespace-nowrap' } } }
]

const fieldColumns: TableColumn<AuditFieldChange>[] = [
  { id: 'field', accessorKey: 'field', header: '字段', meta: { class: { td: 'w-1/4 font-medium text-highlighted' } } },
  { id: 'before', accessorKey: 'before', header: '变更前', meta: { class: { td: 'whitespace-normal text-error' } } },
  { id: 'after', accessorKey: 'after', header: '变更后', meta: { class: { td: 'whitespace-normal text-success' } } }
]

function scopeText(record: AuditRecord | null): string {
  return record?.scope ? auditChangeScopeLabels[record.scope] : ''
}

function sourceKindText(record: AuditRecord | null): string {
  return record ? auditSourceKindLabels[record.source.kind] : ''
}

function amountText(record: AuditRecord | null): string {
  if (!record || record.amount === undefined) return '—'
  return formatMoney(record.amount)
}

function openDetail(row: AuditRecord) {
  const view = canViewRecord(row)
  if (!view.ok) {
    toast.add({
      title: '当前身份无权查看该记录',
      description: view.reason,
      color: 'warning',
      icon: 'i-carbon-locked'
    })
    return
  }
  selectedId.value = row.id
  detailOpen.value = true
}

function setRole(key: AuditRoleKey) {
  if (roleKey.value === key) return
  const next = getAuditRole(key)
  roleKey.value = key
  toast.add({
    title: '已切换为' + next.name + '身份',
    description: next.person + ' · ' + next.title + '：' + next.hint,
    color: 'info',
    icon: 'i-carbon-user-avatar'
  })
}

function switchToAdmin() {
  setRole('admin')
}

function goService(service: AuditServiceKey) {
  activeService.value = service
}

watch([activeService, roleKey], () => {
  entityFilter.value = 'all'
  operationFilter.value = 'all'
  actorFilter.value = 'all'
  resetPage()
  const record = selectedRecord.value
  if (detailOpen.value && record) {
    const view = canViewRecord(record)
    if (!view.ok) {
      detailOpen.value = false
      toast.add({
        title: '已关闭无权查看的详情',
        description: view.reason,
        color: 'warning',
        icon: 'i-carbon-locked'
      })
    }
  }
})

watch(rangeFilter, () => {
  resetPage()
})

watch(activeWorkspaceId, () => {
  resetPage()
  detailOpen.value = false
  entityFilter.value = 'all'
  operationFilter.value = 'all'
  actorFilter.value = 'all'
  toast.add({
    title: '已切换工作区',
    description: '审计记录已按 ' + workspaceName.value + ' 重新加载。',
    color: 'info',
    icon: 'i-carbon-workspace'
  })
})

async function refreshAudit() {
  const query = { ...route.query }
  if ('state' in query) {
    delete query.state
    await navigateTo({ path: route.path, query }, { replace: true })
  }
  await reloadAudit()
  if (!loadError.value) {
    resetPage()
    toast.add({
      title: '审计数据已刷新',
      description: '已恢复本地种子，共 ' + workspaceRecords.value.length + ' 条演示记录；筛选条件保持不变。',
      color: 'success',
      icon: 'i-carbon-renew'
    })
  }
}

function resetFilters() {
  rangeFilter.value = '30'
  entityFilter.value = 'all'
  operationFilter.value = 'all'
  actorFilter.value = 'all'
  resetPage()
  toast.add({
    title: '筛选已重置',
    description: '已恢复近 30 天，以及全部对象、操作与操作者。',
    color: 'info',
    icon: 'i-carbon-filter-reset'
  })
}

function toggleEmptyStateClear() {
  entityFilter.value = 'all'
  operationFilter.value = 'all'
  actorFilter.value = 'all'
  if (rangeFilter.value !== 'all') rangeFilter.value = '30'
  resetPage()
  toast.add({
    title: '已清空筛选条件',
    description: '没有匹配记录时清空筛选，可查看该服务全部可访问记录。',
    color: 'info',
    icon: 'i-carbon-filter-reset'
  })
}

function exportCsv() {
  const rows = filteredRows.value
  if (rows.length === 0) {
    toast.add({
      title: '没有可下载的审计记录',
      description: '请调整时间、对象、操作或操作者筛选后再试。',
      color: 'warning',
      icon: 'i-carbon-warning'
    })
    return
  }
  downloadCsv(
    'audit-' + activeService.value + '-' + roleKey.value + '-' + AUDIT_DEMO_TODAY.split('-').join('') + '.csv',
    CSV_HEADERS,
    rows.map(row => [
      row.at,
      auditServiceLabels[row.service] + (row.scope ? '（' + auditChangeScopeLabels[row.scope] + '）' : ''),
      row.entity,
      row.documentNo,
      auditOperationLabels[row.operation],
      row.actor,
      'v' + row.version,
      row.source.label,
      row.summary,
      row.amount === undefined ? '' : formatMoney(row.amount)
    ])
  )
  toast.add({
    title: 'CSV 已生成',
    description: '已下载当前筛选全部 ' + rows.length + ' 条记录（含表头），与「当前筛选 ' + rows.length + ' 条」一致。',
    color: 'success',
    icon: 'i-carbon-download'
  })
}

async function jumpToSource() {
  const record = selectedRecord.value
  if (!record) return
  if (!record.source.to) {
    toast.add({
      title: '该来源不支持回跳',
      description: '来源为外部系统或纯演示入口，原型中没有对应页面。',
      color: 'warning',
      icon: 'i-carbon-warning'
    })
    return
  }
  detailOpen.value = false
  toast.add({
    title: '正在回跳来源',
    description: record.source.label + '（' + record.documentNo + '）',
    color: 'info',
    icon: 'i-carbon-launch'
  })
  await navigateTo(record.source.to)
}

async function clearDemoState() {
  const query = { ...route.query }
  delete query.state
  await navigateTo({ path: route.path, query }, { replace: true })
  await reloadAudit()
  toast.add({
    title: '已恢复演示数据',
    description: '已移除 ?state 参数并重新加载审计种子。',
    color: 'success',
    icon: 'i-carbon-clean'
  })
}

async function applyQuickEntry(entry: AuditQuickEntry) {
  activeService.value = entry.service
  await nextTick()
  const target = workspaceRecords.value.find(row => row.id === entry.recordId)
  if (!target) {
    toast.add({
      title: '未找到演示记录',
      description: '本地 mock 中不存在记录 ' + entry.recordId + '，请切换工作区或刷新后重试。',
      color: 'error',
      icon: 'i-carbon-warning'
    })
    return
  }
  rangeFilter.value = '30'
  entityFilter.value = target.entity
  operationFilter.value = 'all'
  actorFilter.value = 'all'
  resetPage()
  const view = canViewRecord(target)
  if (!view.ok) {
    toast.add({
      title: '已定位到' + auditServiceLabels[entry.service] + '，但当前身份无权查看',
      description: view.reason,
      color: 'warning',
      icon: 'i-carbon-locked'
    })
    return
  }
  openDetail(target)
  toast.add({
    title: '已定位对应记录',
    description: entry.label + ' → ' + target.documentNo + '（' + target.at + '）',
    color: 'success',
    icon: 'i-carbon-arrow-right'
  })
}

onMounted(() => {
  const { auditActor, auditRecord, auditService } = route.query
  if (typeof auditActor === 'string' && auditRoles.some(item => item.key === auditActor)) {
    roleKey.value = auditActor as AuditRoleKey
  }
  const record = typeof auditRecord === 'string'
    ? auditRecords.find(row => row.id === auditRecord)
    : undefined
  if (record) {
    if (record.workspaceId !== activeWorkspaceId.value) {
      toast.add({
        title: '记录不属于当前工作区',
        description: '请先切换到记录所属工作区，再打开 ' + record.documentNo + '。',
        color: 'warning',
        icon: 'i-carbon-workspace'
      })
      return
    }
    activeService.value = record.service
    void nextTick().then(() => {
      const view = canViewRecord(record)
      if (!view.ok) {
        toast.add({
          title: '链接指向无权查看的记录',
          description: view.reason,
          color: 'warning',
          icon: 'i-carbon-locked'
        })
        return
      }
      rangeFilter.value = '30'
      entityFilter.value = record.entity
      openDetail(record)
      toast.add({
        title: '已按链接定位审计记录',
        description: record.documentNo + ' · ' + record.at,
        color: 'success',
        icon: 'i-carbon-link'
      })
    })
    return
  }
  if (typeof auditService === 'string' && auditServiceOrder.includes(auditService as AuditServiceKey)) {
    activeService.value = auditService as AuditServiceKey
  }
})
</script>

<template>
  <div class="space-y-4" data-testid="audit-center">
    <UCard class="rounded-sm nx-reveal" :ui="{ body: 'p-4 sm:p-4' }">
      <div class="flex flex-wrap items-start justify-between gap-4">
        <div class="min-w-0 space-y-1">
          <h2 class="text-base font-semibold text-highlighted">
            审计与业务变更追溯
          </h2>
          <p class="text-xs text-muted">
            只读审计视图：<span data-testid="audit-center-workspace">{{ workspaceName }}</span>
            · 演示日 {{ AUDIT_DEMO_TODAY }} · 数据来自本地 mock，刷新恢复种子。
          </p>
        </div>
        <div class="flex flex-col items-start gap-2 sm:items-end">
          <div class="flex flex-wrap items-center gap-2" data-testid="audit-actor-switch">
            <span class="text-xs text-muted">演示身份</span>
            <UButton
              v-for="item in auditRoles"
              :key="item.key"
              :label="item.name"
              size="xs"
              :color="roleKey === item.key ? 'primary' : 'neutral'"
              :variant="roleKey === item.key ? 'solid' : 'outline'"
              :aria-pressed="roleKey === item.key"
              :data-testid="'audit-actor-' + item.key"
              @click="setRole(item.key)"
            />
          </div>
          <div class="flex flex-wrap items-center gap-2 sm:justify-end">
            <UBadge
              data-testid="audit-actor-current"
              color="primary"
              variant="subtle"
              size="sm"
            >
              {{ role.name }} · {{ role.person }} · {{ role.title }}
            </UBadge>
            <span class="max-w-md text-xs text-muted" data-testid="audit-actor-hint">{{ role.hint }}</span>
          </div>
        </div>
      </div>
    </UCard>

    <UCard class="rounded-sm nx-reveal" :ui="{ body: 'p-0 sm:p-0', footer: 'p-0 sm:p-0' }">
      <div class="border-b border-default p-4 sm:p-4">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <UTabs
            v-model="activeService"
            :items="serviceItems"
            :content="false"
            size="sm"
            data-testid="audit-center-tabs"
          />
          <div class="flex flex-wrap items-center gap-2">
            <span class="text-xs text-muted" data-testid="audit-csv-scope">{{ csvScopeText }}</span>
            <UButton
              :label="csvDisabled ? '下载 CSV（0 条）' : '下载 CSV（' + filteredRows.length + ' 条）'"
              icon="i-carbon-download"
              size="sm"
              color="neutral"
              variant="outline"
              :disabled="csvDisabled"
              data-testid="audit-csv-button"
              @click="exportCsv"
            />
          </div>
        </div>
        <p class="mt-2 text-xs text-muted">
          {{ auditServiceDescriptions[activeService] }}
        </p>
      </div>

      <div class="grid gap-3 border-b border-default p-4 sm:grid-cols-2 xl:grid-cols-4 sm:p-4">
        <UFormField label="时间范围">
          <USelect
            v-model="rangeFilter"
            :items="rangeOptions"
            class="w-full"
            data-testid="audit-filter-range"
          />
        </UFormField>
        <UFormField label="对象">
          <USelect
            v-model="entityFilter"
            :items="entityOptions"
            class="w-full"
            data-testid="audit-filter-entity"
          />
        </UFormField>
        <UFormField label="操作">
          <USelect
            v-model="operationFilter"
            :items="operationOptions"
            class="w-full"
            data-testid="audit-filter-operation"
          />
        </UFormField>
        <UFormField label="操作者">
          <USelect
            v-model="actorFilter"
            :items="actorOptions"
            class="w-full"
            data-testid="audit-filter-actor"
          />
        </UFormField>
      </div>

      <div class="flex flex-wrap items-center justify-between gap-3 px-4 pt-3">
        <div class="flex flex-wrap items-center gap-2">
          <span class="text-xs text-muted">快捷定位</span>
          <UButton
            v-for="entry in auditQuickEntries"
            :key="entry.key"
            :label="entry.label"
            :icon="entry.icon"
            size="xs"
            color="neutral"
            variant="soft"
            :data-testid="'audit-center-quick-' + entry.key"
            @click="applyQuickEntry(entry)"
          />
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <UButton
            label="重置筛选"
            icon="i-carbon-filter-reset"
            size="xs"
            color="neutral"
            variant="outline"
            :disabled="!hasActiveFilters"
            data-testid="audit-filter-reset"
            @click="resetFilters"
          />
          <UButton
            label="刷新"
            icon="i-carbon-renew"
            size="xs"
            color="neutral"
            variant="ghost"
            :loading="loading"
            data-testid="audit-center-refresh"
            @click="refreshAudit"
          />
        </div>
      </div>

      <p class="px-4 pt-2 text-xs text-muted" data-testid="audit-center-summary">
        {{ filterSummary }}
      </p>

      <div v-if="isForbidden" class="p-4" data-testid="audit-center-state-forbidden">
        <UAlert
          color="warning"
          variant="subtle"
          icon="i-carbon-locked"
          title="当前演示身份没有查看审计中心的权限"
          description="URL 带有 ?state=forbidden 参数。移除该参数后会使用本地种子数据恢复；正式环境应由 Organization 服务按 settings.manage 等权限校验。"
        >
          <template #actions>
            <UButton
              label="恢复演示数据"
              size="xs"
              color="primary"
              data-testid="audit-center-clear-state"
              @click="clearDemoState"
            />
          </template>
        </UAlert>
      </div>

      <div v-else-if="loadError" class="p-4" data-testid="audit-center-state-error">
        <UAlert
          color="error"
          variant="subtle"
          icon="i-carbon-warning-alt"
          title="审计数据加载失败"
          :description="loadError ?? ''"
        >
          <template #actions>
            <UButton
              label="重试加载"
              size="xs"
              color="error"
              data-testid="audit-center-retry"
              @click="refreshAudit"
            />
          </template>
        </UAlert>
      </div>

      <div v-else-if="!serviceAllowed" class="space-y-3 p-4" data-testid="audit-center-denied">
        <UAlert
          color="warning"
          variant="subtle"
          icon="i-carbon-locked"
          :title="role.name + '身份无权查看' + auditServiceLabels[activeService]"
          :description="serviceDeniedReason + ' 当前服务不会展示空白列表，请切换身份或改用有权限的服务。'"
        >
          <template #actions>
            <UButton
              label="切换为管理员"
              size="xs"
              color="primary"
              data-testid="audit-center-denied-switch"
              @click="switchToAdmin"
            />
          </template>
        </UAlert>
        <div class="flex flex-wrap items-center gap-2">
          <span class="text-xs text-muted">当前身份可访问：</span>
          <UButton
            v-for="service in accessibleServices"
            :key="service"
            :label="auditServiceLabels[service]"
            size="xs"
            color="neutral"
            variant="outline"
            :data-testid="'audit-center-denied-service-' + service"
            @click="goService(service)"
          />
        </div>
      </div>

      <div v-else class="space-y-3">
        <div v-if="hiddenScopeLabels" class="px-4 pt-3" data-testid="audit-center-scope-denied">
          <UAlert
            color="warning"
            variant="subtle"
            icon="i-carbon-filter"
            title="部分业务变更对当前身份隐藏"
            :description="'已隐藏 ' + hiddenScopeLabels + ' 记录；同一筛选下的展示与 CSV 下载范围保持一致。'"
          >
            <template #actions>
              <UButton
                label="切换为管理员"
                size="xs"
                color="primary"
                data-testid="audit-center-scope-denied-switch"
                @click="switchToAdmin"
              />
            </template>
          </UAlert>
        </div>

        <ResizableTable
          :data="pageRows"
          :columns="columns"
          :loading="loading"
          class="nx-table"
          :ui="{ th: 'py-2.5', td: 'py-3' }"
          :row-activate="openDetail"
          data-testid="audit-center-table"
        >
          <template #at-cell="{ row }">
            <span class="font-mono text-xs" :data-testid="'audit-row-' + row.original.id">{{ row.original.at }}</span>
          </template>
          <template #service-cell="{ row }">
            <div class="flex flex-wrap items-center gap-1">
              <UBadge :color="auditServiceColors[row.original.service]" variant="subtle" size="sm">
                {{ auditServiceLabels[row.original.service] }}
              </UBadge>
              <UBadge
                v-if="row.original.scope"
                color="neutral"
                variant="outline"
                size="sm"
              >
                {{ auditChangeScopeLabels[row.original.scope] }}
              </UBadge>
            </div>
          </template>
          <template #entity-cell="{ row }">
            <div class="space-y-0.5 whitespace-normal">
              <p class="text-sm text-highlighted">
                {{ row.original.entity }}
              </p>
              <p class="text-xs text-muted">
                {{ row.original.documentNo }}
              </p>
            </div>
          </template>
          <template #operation-cell="{ row }">
            <UBadge
              :color="auditOperationColors[row.original.operation]"
              variant="subtle"
              size="sm"
              :data-testid="'audit-row-operation-' + row.original.id"
            >
              {{ auditOperationLabels[row.original.operation] }}
            </UBadge>
          </template>
          <template #actor-cell="{ row }">
            <div class="space-y-0.5 whitespace-nowrap">
              <p class="text-sm text-highlighted">
                {{ row.original.actor }}
              </p>
              <p class="text-xs text-muted">
                {{ row.original.actorTitle }}
              </p>
            </div>
          </template>
          <template #version-cell="{ row }">
            <UBadge color="neutral" variant="subtle" size="sm">
              v{{ row.original.version }}
            </UBadge>
          </template>
          <template #source-cell="{ row }">
            <div class="flex items-center gap-2 whitespace-nowrap">
              <span class="text-xs text-muted">{{ row.original.source.label }}</span>
              <UButton
                label="详情"
                icon="i-carbon-arrow-up-right"
                size="xs"
                color="neutral"
                variant="ghost"
                :data-testid="'audit-row-open-' + row.original.id"
                @click="openDetail(row.original)"
              />
            </div>
          </template>
          <template #empty>
            <UEmpty
              icon="i-carbon-search"
              title="没有符合筛选的审计记录"
              description="可清空筛选查看该服务全部可访问记录；无权查看的服务会展示原因而不是空白。"
              variant="naked"
              :actions="[{ label: '清空筛选', color: 'primary', variant: 'subtle', size: 'sm', onClick: toggleEmptyStateClear }]"
              data-testid="audit-center-empty"
            />
          </template>
        </ResizableTable>
      </div>

      <template #footer>
        <div class="flex flex-wrap items-center justify-between gap-3 border-t border-default p-4 sm:p-4">
          <p class="text-xs text-muted" data-testid="audit-center-page-range">
            <template v-if="total > 0">
              第 {{ pageStart }}–{{ pageEnd }} 行 / 共 {{ total }} 条（本页 {{ pageRows.length }} 条）
            </template>
            <template v-else>
              当前筛选 0 条
            </template>
          </p>
          <div class="flex items-center gap-2" data-testid="audit-center-pagination">
            <UPagination
              v-if="total > PAGE_SIZE"
              v-model:page="page"
              :total="total"
              :items-per-page="PAGE_SIZE"
              size="sm"
            />
          </div>
        </div>
      </template>
    </UCard>

    <UAlert
      color="neutral"
      variant="subtle"
      icon="i-carbon-information"
      title="演示说明"
      description="审计记录只读：来源回跳用于核对触发的单据或设置入口；CSV 下载范围与当前筛选显示条数一致，切换身份或服务会重新计算可访问范围。"
      data-testid="audit-center-note"
    />

    <USlideover v-model:open="detailOpen" :ui="{ content: 'w-full sm:max-w-3xl' }">
      <template #header>
        <div class="flex w-full items-start justify-between gap-3" data-testid="audit-detail">
          <div class="min-w-0 space-y-1">
            <p class="text-xs text-muted">
              审计记录详情
            </p>
            <h2 class="text-base font-semibold text-highlighted">
              {{ selectedRecord?.entity ?? '未选择记录' }}
            </h2>
            <p class="text-xs text-muted">
              {{ selectedRecord?.summary ?? '请从审计列表打开一条记录。' }}
            </p>
          </div>
          <UButton
            icon="i-carbon-close"
            color="neutral"
            variant="ghost"
            size="sm"
            aria-label="关闭详情"
            data-testid="audit-detail-close"
            @click="detailOpen = false"
          />
        </div>
      </template>

      <template #body>
        <div v-if="selectedRecord" class="space-y-5">
          <div class="grid gap-3 sm:grid-cols-2">
            <div class="space-y-0.5 rounded-sm border border-default p-3">
              <p class="text-xs text-muted">
                对象与单号
              </p>
              <p class="text-sm font-medium text-highlighted" data-testid="audit-detail-document">
                {{ selectedRecord.documentNo }}
              </p>
              <p class="text-xs text-muted">
                {{ selectedRecord.entity }}
              </p>
            </div>
            <div class="space-y-0.5 rounded-sm border border-default p-3">
              <p class="text-xs text-muted">
                服务
              </p>
              <p class="text-sm text-highlighted" data-testid="audit-detail-service">
                {{ auditServiceLabels[selectedRecord.service] }}
              </p>
              <UBadge
                v-if="selectedRecord.scope"
                color="neutral"
                variant="subtle"
                size="sm"
                data-testid="audit-detail-scope"
              >
                {{ scopeText(selectedRecord) }}
              </UBadge>
            </div>
            <div class="space-y-0.5 rounded-sm border border-default p-3">
              <p class="text-xs text-muted">
                时间
              </p>
              <p class="text-sm text-highlighted" data-testid="audit-detail-time">
                {{ selectedRecord.at }}
              </p>
            </div>
            <div class="space-y-0.5 rounded-sm border border-default p-3">
              <p class="text-xs text-muted">
                操作者
              </p>
              <p class="text-sm text-highlighted" data-testid="audit-detail-actor">
                {{ selectedRecord.actor }} · {{ selectedRecord.actorTitle }}
              </p>
            </div>
            <div class="space-y-0.5 rounded-sm border border-default p-3">
              <p class="text-xs text-muted">
                操作
              </p>
              <p class="text-sm text-highlighted" data-testid="audit-detail-operation">
                {{ auditOperationLabels[selectedRecord.operation] }}
              </p>
            </div>
            <div class="space-y-0.5 rounded-sm border border-default p-3">
              <p class="text-xs text-muted">
                版本
              </p>
              <p class="text-sm text-highlighted" data-testid="audit-detail-version">
                当前 v{{ selectedRecord.version }} · 变更前 v{{ Math.max(1, selectedRecord.version - 1) }}
              </p>
            </div>
            <div class="space-y-0.5 rounded-sm border border-default p-3">
              <p class="text-xs text-muted">
                来源
              </p>
              <p class="text-sm text-highlighted" data-testid="audit-detail-source">
                {{ selectedRecord.source.label }}
              </p>
              <p class="text-xs text-muted">
                {{ sourceKindText(selectedRecord) }}
              </p>
            </div>
            <div class="space-y-0.5 rounded-sm border border-default p-3">
              <p class="text-xs text-muted">
                涉及金额
              </p>
              <p class="text-sm text-highlighted" data-testid="audit-detail-amount">
                {{ amountText(selectedRecord) }}
              </p>
            </div>
          </div>

          <div class="space-y-1 rounded-sm border border-default p-3">
            <p class="text-xs text-muted">
              变更摘要
            </p>
            <p class="text-sm text-highlighted" data-testid="audit-detail-summary">
              {{ selectedRecord.summary }}
            </p>
          </div>

          <div class="space-y-2">
            <div class="flex items-center justify-between gap-2">
              <h3 class="text-sm font-semibold text-highlighted">
                变更字段前后值
              </h3>
              <UBadge color="neutral" variant="subtle" size="sm">
                {{ selectedFields.length }} 个字段
              </UBadge>
            </div>
            <ResizableTable
              :data="selectedFields"
              :columns="fieldColumns"
              class="nx-table"
              data-testid="audit-detail-changes"
            />
          </div>

          <div class="space-y-2">
            <h3 class="text-sm font-semibold text-highlighted">
              审计链
            </h3>
            <UTimeline
              :items="chainItems"
              size="sm"
              color="primary"
              data-testid="audit-detail-chain"
            />
          </div>

          <div class="space-y-1 rounded-sm border border-default p-3" data-testid="audit-detail-source-panel">
            <p class="text-xs text-muted">
              {{ sourceKindText(selectedRecord) }}
            </p>
            <p class="text-sm text-highlighted">
              {{ selectedRecord.source.label }}
            </p>
            <p class="text-xs text-muted">
              {{ selectedRecord.source.hint ?? '来源回跳用于核对触发该审计记录的单据或设置入口。' }}
            </p>
          </div>
        </div>
        <UEmpty
          v-else
          icon="i-carbon-document"
          title="没有可展示的审计记录"
          description="记录可能不属于当前工作区，或已被筛选条件移除。"
          variant="naked"
          data-testid="audit-detail-empty"
        />
      </template>

      <template #footer>
        <div class="flex w-full flex-wrap items-center justify-between gap-2">
          <UButton
            label="关闭"
            color="neutral"
            variant="outline"
            size="sm"
            data-testid="audit-detail-close-footer"
            @click="detailOpen = false"
          />
          <UButton
            label="回跳来源"
            icon="i-carbon-launch"
            size="sm"
            color="primary"
            :disabled="!selectedRecord?.source.to"
            data-testid="audit-detail-source-jump"
            @click="jumpToSource"
          />
        </div>
      </template>
    </USlideover>
  </div>
</template>

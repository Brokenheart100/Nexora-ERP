<script setup lang="ts">
import type {
  ReportingOverviewMonth,
  ReportingProjectionSeed,
  ReportingProjectionStatus
} from '~/mocks/reportingCenter'
import {
  reportingOverviewMetricLabels,
  reportingProjectionSeeds,
  reportingProjectionStatusColors,
  reportingProjectionStatusLabels
} from '~/mocks/reportingCenter'

type DemoStatus = 'auto' | ReportingProjectionStatus

const minDate = '2026-10-01'
const maxDate = '2026-11-18'

const toast = useToast()
const workspaceStore = useWorkspaceStore()
const { loading: refreshLoading, run: runRefresh } = useMockRefresh()

const rangeStart = ref('2026-11-01')
const rangeEnd = ref('2026-11-18')
const demoStatus = ref<DemoStatus>('auto')

const workspaceOptions = computed(() =>
  workspaceStore.workspaces.map(item => ({ label: item.name, value: item.id }))
)
const workspaceId = computed({
  get: () => workspaceStore.activeWorkspaceId,
  set: (value: string) => workspaceStore.setWorkspace(value)
})
const activeWorkspaceName = computed(() => workspaceStore.workspace.name)

const projectionSeed = computed<ReportingProjectionSeed | null>(
  () => reportingProjectionSeeds.find(item => item.workspaceId === workspaceId.value) ?? null
)
const effectiveStatus = computed<ReportingProjectionStatus>(() =>
  demoStatus.value === 'auto' ? projectionSeed.value?.status ?? 'unavailable' : demoStatus.value
)
const effectiveStatusLabel = computed(() => reportingProjectionStatusLabels[effectiveStatus.value])
const effectiveStatusColor = computed(() =>
  reportingProjectionStatusColors[effectiveStatus.value]
)
const isDemoOverride = computed(
  () => demoStatus.value !== 'auto' && demoStatus.value !== projectionSeed.value?.status
)
const demoStatusItems: { label: string, value: DemoStatus }[] = [
  { label: '自动（按工作区）', value: 'auto' },
  { label: '待生成', value: 'pending' },
  { label: '已就绪', value: 'ready' },
  { label: '暂不可用', value: 'unavailable' }
]
const stateReason = computed(() => {
  const seed = projectionSeed.value
  if (!seed) return ''
  if (effectiveStatus.value === 'pending') {
    return seed.pendingReason ?? '工作区投影任务排队中，完成后自动刷新。'
  }
  if (effectiveStatus.value === 'unavailable') {
    return seed.unavailableReason ?? '工作区投影服务暂不可用，已过账财务数据不受影响。'
  }
  return ''
})

function parseDay(value: string): number {
  return new Date(`${value}T00:00:00`).getTime()
}

function daysInMonth(monthKey: string): number {
  const [yearText, monthText] = monthKey.split('-')
  return new Date(Number(yearText ?? '2026'), Number(monthText ?? '1'), 0).getDate()
}

function inclusiveDays(start: string, end: string): number {
  return Math.max(0, Math.round((parseDay(end) - parseDay(start)) / 86400000) + 1)
}

const rangeError = computed(() => {
  if (!rangeStart.value || !rangeEnd.value) return '请选择完整的概览日期区间。'
  if (rangeStart.value < minDate) return `开始日期不能早于 ${minDate}。`
  if (rangeEnd.value > maxDate) return `结束日期不能晚于 ${maxDate}（演示数据水位日）。`
  if (rangeStart.value > rangeEnd.value) return '开始日期不能晚于结束日期。'
  return ''
})
const rangeLabel = computed(() =>
  rangeError.value ? '日期区间无效' : `${rangeStart.value} 至 ${rangeEnd.value}`
)
const rangeDays = computed(() =>
  rangeError.value ? 0 : inclusiveDays(rangeStart.value, rangeEnd.value)
)

const flowMetricKeys: (keyof ReportingOverviewMonth)[] = [
  'revenue',
  'cost',
  'expense',
  'netProfit',
  'cashIn',
  'cashOut'
]
const metricKeys: (keyof ReportingOverviewMonth)[] = [
  'revenue',
  'cost',
  'expense',
  'netProfit',
  'receivable',
  'payable',
  'cashIn',
  'cashOut'
]

const overviewMetrics = computed<ReportingOverviewMonth | null>(() => {
  const seed = projectionSeed.value
  if (!seed || rangeError.value || effectiveStatus.value !== 'ready') return null
  const start = rangeStart.value
  const end = rangeEnd.value
  const totals: ReportingOverviewMonth = {
    revenue: 0,
    cost: 0,
    expense: 0,
    netProfit: 0,
    receivable: 0,
    payable: 0,
    cashIn: 0,
    cashOut: 0
  }
  const monthKeys = Object.keys(seed.monthly)
    .filter((key) => {
      const monthStart = `${key}-01`
      const monthEnd = `${key}-${String(daysInMonth(key)).padStart(2, '0')}`
      return monthStart <= end && monthEnd >= start
    })
    .sort()
  if (monthKeys.length === 0) return totals
  for (const key of monthKeys) {
    const month = seed.monthly[key]
    if (!month) continue
    const monthStart = `${key}-01`
    const monthEnd = `${key}-${String(daysInMonth(key)).padStart(2, '0')}`
    const overlapStart = start > monthStart ? start : monthStart
    const overlapEnd = end < monthEnd ? end : monthEnd
    const ratio = inclusiveDays(overlapStart, overlapEnd) / daysInMonth(key)
    for (const metric of flowMetricKeys) {
      totals[metric] += Math.round(month[metric] * ratio)
    }
  }
  const lastMonth = seed.monthly[monthKeys[monthKeys.length - 1] ?? '']
  if (lastMonth) {
    totals.receivable = lastMonth.receivable
    totals.payable = lastMonth.payable
  }
  return totals
})

const projectionVersionText = computed(() =>
  projectionSeed.value?.version ? `v${projectionSeed.value.version}` : '—'
)
const projectionGeneratedAt = computed(() => projectionSeed.value?.generatedAt ?? '—')
const projectionUpdatedAt = computed(() => projectionSeed.value?.updatedAt ?? '—')

const metricsNote = computed(() =>
  effectiveStatus.value === 'ready'
    ? `流量类金额按 ${rangeDays.value} 天区间折算，应收 / 应付余额取区间末月余额；过账水位与投影版本分别展示，便于区分财务事实与工作区派生数据。`
    : '投影未就绪，暂不提供区间金额；过账水位与凭证数仍为财务事实，可继续核对已过账数据。'
)

function reload() {
  runRefresh(() => {
    demoStatus.value = 'auto'
    rangeStart.value = '2026-11-01'
    rangeEnd.value = '2026-11-18'
    toast.add({
      title: '已刷新工作区财务投影',
      description: `${activeWorkspaceName.value}：${reportingProjectionStatusLabels[projectionSeed.value?.status ?? 'unavailable']}；演示状态已恢复为按工作区展示。`,
      color: 'success',
      icon: 'i-carbon-renew'
    })
  })
}

function resetRange() {
  rangeStart.value = '2026-11-01'
  rangeEnd.value = '2026-11-18'
  toast.add({
    title: '概览日期区间已重置',
    description: '已恢复为 2026-11-01 至 2026-11-18，金额按同一过账水位折算。',
    color: 'neutral',
    icon: 'i-carbon-renew'
  })
}

watch(workspaceId, () => {
  demoStatus.value = 'auto'
  toast.add({
    title: `已切换到 ${activeWorkspaceName.value}`,
    description: `展示该工作区有效投影：${projectionSeed.value ? reportingProjectionStatusLabels[projectionSeed.value.status] : '暂无投影数据'}。`,
    color: 'neutral',
    icon: 'i-carbon-switcher'
  })
})

async function openReports() {
  await navigateTo({ path: '/finance', query: { tab: 'reports' } })
}

async function openAging() {
  await navigateTo({ path: '/finance', query: { tab: 'aging' } })
}
</script>

<template>
  <UCard class="nx-reveal rounded-sm" data-testid="reporting-projection">
    <template #header>
      <div class="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div class="flex items-center gap-2">
            <h3 class="text-sm font-semibold text-highlighted">
              工作台财务概览
            </h3>
            <UBadge
              :label="effectiveStatusLabel"
              :color="effectiveStatusColor"
              variant="subtle"
              size="sm"
              data-testid="projection-status-badge"
            />
          </div>
          <p class="mt-0.5 text-xs text-muted">
            概览由工作区投影生成，与财务过账水位分开标识；切换工作区展示该工作区有效数据。
          </p>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <USelect
            v-model="workspaceId"
            :items="workspaceOptions"
            size="sm"
            class="w-56"
            aria-label="切换工作区"
            data-testid="projection-workspace-select"
          />
          <UTabs
            v-model="demoStatus"
            :items="demoStatusItems"
            :content="false"
            size="xs"
            data-testid="projection-demo-tabs"
          />
          <UButton
            label="刷新"
            icon="i-carbon-renew"
            color="neutral"
            variant="outline"
            size="sm"
            :loading="refreshLoading"
            data-testid="projection-refresh"
            @click="reload"
          />
        </div>
      </div>
    </template>

    <div v-if="projectionSeed" class="space-y-3">
      <UAlert
        v-if="effectiveStatus === 'pending'"
        color="warning"
        variant="soft"
        icon="i-carbon-time"
        title="工作区投影待生成"
        :description="stateReason"
        data-testid="projection-pending-alert"
      />
      <UAlert
        v-else-if="effectiveStatus === 'unavailable'"
        color="error"
        variant="soft"
        icon="i-carbon-warning-alt"
        title="工作区投影暂不可用"
        :description="stateReason"
        data-testid="projection-unavailable-alert"
      />
      <UAlert
        v-else
        color="success"
        variant="soft"
        icon="i-carbon-checkmark"
        title="工作区投影已就绪"
        :description="`投影版本 ${projectionVersionText}，更新时间 ${projectionUpdatedAt}；可下钻到财务报表与账龄明细。`"
        data-testid="projection-ready-alert"
      />
      <UAlert
        v-if="isDemoOverride"
        color="neutral"
        variant="soft"
        icon="i-carbon-flask"
        title="当前为演示状态覆盖"
        :description="`工作区实际投影状态为「${projectionSeed ? reportingProjectionStatusLabels[projectionSeed.status] : '未知'}」，演示开关仅影响本卡片展示，不改变种子数据。`"
        data-testid="projection-demo-note"
      />

      <div class="grid gap-3 md:grid-cols-2">
        <div
          class="space-y-2 rounded-sm border border-default px-3 py-2"
          data-testid="projection-posting-block"
        >
          <div class="flex items-center justify-between">
            <p class="text-xs font-semibold text-highlighted">
              财务过账水位（事实）
            </p>
            <UBadge
              label="财务口径"
              color="info"
              variant="subtle"
              size="sm"
            />
          </div>
          <div class="grid gap-2 sm:grid-cols-2">
            <div>
              <p class="text-[11px] text-muted">
                水位号
              </p>
              <p class="text-sm font-semibold text-highlighted" data-testid="projection-posting-watermark">
                W-{{ projectionSeed.postingWatermark }}
              </p>
            </div>
            <div>
              <p class="text-[11px] text-muted">
                水位时间
              </p>
              <p class="text-sm text-default" data-testid="projection-posting-watermark-at">
                {{ projectionSeed.postingWatermarkAt }}
              </p>
            </div>
            <div>
              <p class="text-[11px] text-muted">
                截至水位累计过账金额
              </p>
              <p class="text-sm font-semibold text-highlighted" data-testid="projection-posting-amount">
                {{ formatMoney(projectionSeed.postingAmount) }}
              </p>
            </div>
            <div>
              <p class="text-[11px] text-muted">
                已过账凭证
              </p>
              <p class="text-sm text-default" data-testid="projection-voucher-count">
                {{ projectionSeed.voucherCount }} 张
              </p>
            </div>
          </div>
        </div>

        <div
          class="space-y-2 rounded-sm border border-default px-3 py-2"
          data-testid="projection-block"
        >
          <div class="flex items-center justify-between">
            <p class="text-xs font-semibold text-highlighted">
              工作区投影（派生）
            </p>
            <UBadge
              :label="effectiveStatusLabel"
              :color="effectiveStatusColor"
              variant="subtle"
              size="sm"
            />
          </div>
          <div class="grid gap-2 sm:grid-cols-2">
            <div>
              <p class="text-[11px] text-muted">
                投影版本
              </p>
              <p class="text-sm font-semibold text-highlighted" data-testid="projection-version">
                {{ projectionVersionText }}
              </p>
            </div>
            <div>
              <p class="text-[11px] text-muted">
                更新时间
              </p>
              <p class="text-sm text-default" data-testid="projection-updated-at">
                {{ projectionUpdatedAt }}
              </p>
            </div>
            <div>
              <p class="text-[11px] text-muted">
                生成时间
              </p>
              <p class="text-sm text-default" data-testid="projection-generated-at">
                {{ projectionGeneratedAt }}
              </p>
            </div>
            <div>
              <p class="text-[11px] text-muted">
                工作区
              </p>
              <p class="text-sm text-default" data-testid="projection-workspace-name">
                {{ projectionSeed.workspaceName }}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div class="flex flex-wrap items-end gap-3">
        <div class="space-y-1">
          <p class="text-xs text-muted">
            概览日期区间
          </p>
          <div class="flex items-center gap-2">
            <UInput
              v-model="rangeStart"
              type="date"
              size="sm"
              class="w-36"
              :min="minDate"
              :max="maxDate"
              aria-label="概览开始日期"
              data-testid="projection-range-start"
            />
            <span class="text-xs text-muted">至</span>
            <UInput
              v-model="rangeEnd"
              type="date"
              size="sm"
              class="w-36"
              :min="minDate"
              :max="maxDate"
              aria-label="概览结束日期"
              data-testid="projection-range-end"
            />
          </div>
        </div>
        <UButton
          label="重置区间"
          color="neutral"
          variant="ghost"
          size="sm"
          data-testid="projection-range-reset"
          @click="resetRange"
        />
        <span class="text-xs text-muted" data-testid="projection-range-label">
          {{ rangeLabel }}（{{ rangeDays }} 天）
        </span>
      </div>
      <UAlert
        v-if="rangeError"
        color="error"
        variant="soft"
        icon="i-carbon-warning-alt"
        :title="rangeError"
        description="请调整日期区间后再查看区间概览，过账水位与投影版本不受影响。"
        data-testid="projection-range-error"
      />

      <template v-if="effectiveStatus === 'ready' && overviewMetrics">
        <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div
            v-for="metric in metricKeys"
            :key="metric"
            class="rounded-sm border border-default px-3 py-2"
            :data-testid="'projection-metric-' + metric"
          >
            <p class="text-xs text-muted">
              {{ reportingOverviewMetricLabels[metric] }}
            </p>
            <p
              class="mt-1 text-lg font-semibold"
              :class="
                metric === 'netProfit'
                  ? overviewMetrics[metric] >= 0
                    ? 'text-success'
                    : 'text-error'
                  : 'text-highlighted'
              "
            >
              {{ formatMoney(overviewMetrics[metric]) }}
            </p>
          </div>
        </div>
        <p class="text-xs text-muted" data-testid="projection-metrics-note">
          {{ metricsNote }}
        </p>
      </template>
      <UEmpty
        v-else-if="!rangeError"
        icon="i-carbon-data-base"
        title="当前工作区投影未就绪"
        description="状态为待生成或暂不可用时，概览金额暂不展示；过账水位与凭证数仍可比对，稍后刷新重试。"
        data-testid="projection-empty"
      />

      <div class="flex flex-wrap items-center justify-end gap-2 border-t border-default pt-3">
        <UButton
          label="财务报表（四表与钻取）"
          icon="i-carbon-document"
          color="primary"
          variant="soft"
          size="sm"
          data-testid="projection-open-reports"
          @click="openReports"
        />
        <UButton
          label="账龄与明细账"
          icon="i-carbon-table"
          color="neutral"
          variant="outline"
          size="sm"
          data-testid="projection-open-aging"
          @click="openAging"
        />
      </div>
    </div>

    <UEmpty
      v-else
      icon="i-carbon-data-base"
      title="该工作区暂无投影数据"
      description="请切换工作区或恢复演示种子后重试。"
      data-testid="projection-no-seed"
    />
  </UCard>
</template>

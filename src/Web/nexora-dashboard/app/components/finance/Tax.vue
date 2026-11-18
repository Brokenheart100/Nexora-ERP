<script setup lang="ts">
import type { TaxFiling, TaxPeriod, TaxRateDefinition, TaxGroup } from '~/mocks'
import { taxFilingStatusColors, taxFilingStatusLabels, taxRateKindLabels, taxTypeLabels } from '~/mocks'

function money(value: string | number) {
  return formatMoney(Number(value))
}

const props = defineProps<{
  taxPeriods: TaxPeriod[]
  taxFilings: TaxFiling[]
  taxRates: TaxRateDefinition[]
  taxGroups: TaxGroup[]
  canPost: boolean
}>()

const emit = defineEmits<{
  file: [id: string]
}>()

const dayLabels = ['一', '二', '三', '四', '五', '六', '日']

const calendarCells = computed(() => {
  const offset = 1
  const cells: { key: string, day: number | null, due: boolean }[] = []
  for (let index = 0; index < offset; index += 1) {
    cells.push({ key: 'blank-' + index, day: null, due: false })
  }
  for (let day = 1; day <= 31; day += 1) {
    cells.push({
      key: '2026-12-' + String(day).padStart(2, '0'),
      day,
      due: day === 15
    })
  }
  return cells
})

const pendingFilings = computed(() => props.taxFilings.filter(filing => filing.status === 'pending'))
const pendingTaxTotal = computed(() => pendingFilings.value.reduce((sum, filing) => sum + Number(filing.taxAmount), 0))

const confirmOpen = ref(false)
const targetId = ref('')
const targetFiling = computed(() => props.taxFilings.find(filing => filing.id === targetId.value) ?? null)
const { loading: submitting, run: runSubmit } = useMockAsync(async () => undefined, { delay: 600 })

function openConfirm(filing: TaxFiling) {
  targetId.value = filing.id
  confirmOpen.value = true
}

async function confirmFile() {
  if (!targetFiling.value) return
  await runSubmit()
  emit('file', targetFiling.value.id)
  confirmOpen.value = false
}

function formatRate(rate: string) {
  return String(rate).includes('%') ? String(rate) : String(rate) + '%'
}

function groupRates(group: TaxGroup) {
  return group.rateCodes
    .map(code => props.taxRates.find(rate => rate.code === code)?.name ?? code)
    .join('、')
}

const filingRows = computed(() =>
  props.taxFilings
    .slice()
    .sort((a, b) => b.period.localeCompare(a.period) || a.taxType.localeCompare(b.taxType))
)
</script>

<template>
  <div class="space-y-4" data-testid="tax-panel">
    <div class="grid gap-4 lg:grid-cols-[22rem_minmax(0,1fr)]">
      <UCard class="nx-reveal rounded-sm" :ui="{ body: 'p-0 sm:p-0' }" data-testid="tax-calendar">
        <template #header>
          <div class="flex items-center justify-between gap-2">
            <div>
              <h2 class="text-sm font-semibold text-highlighted">
                税期日历
              </h2>
              <p class="mt-0.5 text-xs text-muted">
                2026 年 12 月申报期 · 15 日为申报截止
              </p>
            </div>
            <UBadge
              :label="'待申报 ' + pendingFilings.length + ' 项'"
              color="warning"
              variant="subtle"
              size="sm"
              data-testid="tax-pending-count"
            />
          </div>
        </template>
        <div class="p-3">
          <div class="grid grid-cols-7 gap-1 text-center text-xs text-muted">
            <span v-for="label in dayLabels" :key="label" class="py-1">{{ label }}</span>
          </div>
          <div class="mt-1 grid grid-cols-7 gap-1">
            <div
              v-for="cell in calendarCells"
              :key="cell.key"
              class="flex h-14 flex-col items-start justify-between rounded-sm border p-1.5 text-xs"
              :class="cell.day === null ? 'border-transparent' : cell.due ? 'border-warning bg-warning/10' : 'border-default'"
              :data-testid="cell.day === null ? 'tax-calendar-blank' : 'tax-calendar-cell'"
            >
              <span v-if="cell.day !== null" class="tabular-nums text-highlighted">{{ cell.day }}</span>
              <span v-if="cell.due" class="text-[10px] font-medium text-warning">申报截止</span>
            </div>
          </div>
          <div class="mt-3 flex flex-wrap gap-1.5">
            <UBadge
              v-for="period in taxPeriods"
              :key="period.id"
              :label="period.period + ' ' + (period.status === 'open' ? '申报中' : '已关闭')"
              :color="period.status === 'open' ? 'warning' : 'neutral'"
              variant="subtle"
              size="sm"
              data-testid="tax-period-chip"
            />
          </div>

          <div class="mt-3 space-y-1 rounded-sm bg-elevated/60 px-3 py-2 text-xs">
            <div class="flex items-center justify-between gap-2">
              <span class="text-muted">待申报税额合计</span>
              <span class="tabular-nums text-highlighted">{{ money(pendingTaxTotal) }}</span>
            </div>
            <div class="flex items-center justify-between gap-2">
              <span class="text-muted">最近截止日期</span>
              <span class="text-highlighted">2026-12-15</span>
            </div>
          </div>
        </div>
      </UCard>

      <UCard class="nx-reveal rounded-sm" :ui="{ body: 'p-0 sm:p-0' }">
        <template #header>
          <div>
            <h2 class="text-sm font-semibold text-highlighted">
              申报状态
            </h2>
            <p class="mt-0.5 text-xs text-muted">
              申报动作只更新本地状态并提示「仅本次预览，刷新后恢复」。
            </p>
          </div>
        </template>
        <div class="grid grid-cols-[6rem_7rem_9rem_9rem_7rem_6rem_5rem] items-center gap-2 border-b border-default bg-elevated/40 px-3 py-2 text-xs font-medium text-muted">
          <span>税期</span>
          <span>税种</span>
          <span class="text-right">应纳税额</span>
          <span class="text-right">应缴税额</span>
          <span>截止日期</span>
          <span>状态</span>
          <span class="text-right">操作</span>
        </div>
        <div
          v-for="filing in filingRows"
          :key="filing.id"
          class="grid grid-cols-[6rem_7rem_9rem_9rem_7rem_6rem_5rem] items-center gap-2 border-b border-default/60 px-3 py-2 last:border-b-0"
          data-testid="tax-filing-table"
        >
          <span class="text-xs tabular-nums text-muted">{{ filing.period }}</span>
          <span class="text-[13px] text-highlighted">{{ taxTypeLabels[filing.taxType] }}</span>
          <span class="text-right text-[13px] tabular-nums text-highlighted">{{ money(filing.taxableAmount) }}</span>
          <span class="text-right text-[13px] tabular-nums text-highlighted">{{ money(filing.taxAmount) }}</span>
          <span class="text-xs text-muted">{{ filing.dueAt }}</span>
          <span>
            <UBadge
              :label="taxFilingStatusLabels[filing.status]"
              :color="taxFilingStatusColors[filing.status]"
              variant="subtle"
              size="sm"
            />
          </span>
          <div class="flex justify-end">
            <UButton
              v-if="filing.status === 'pending'"
              label="申报"
              size="xs"
              variant="ghost"
              :disabled="!canPost"
              :data-testid="'tax-file-' + filing.id"
              @click="openConfirm(filing)"
            />
            <span v-else class="text-xs text-muted">{{ filing.filedAt ?? '已完成' }}</span>
          </div>
        </div>
      </UCard>
    </div>

    <div class="grid gap-4 lg:grid-cols-2">
      <UCard class="nx-reveal rounded-sm" :ui="{ body: 'p-0 sm:p-0' }" data-testid="tax-rate-table">
        <template #header>
          <div>
            <h2 class="text-sm font-semibold text-highlighted">
              税率
            </h2>
            <p class="mt-0.5 text-xs text-muted">
              销项与进项税率定义，来自本地 mock 数据。
            </p>
          </div>
        </template>
        <div class="grid grid-cols-[5rem_minmax(0,1fr)_4rem_4rem_4rem] items-center gap-2 border-b border-default bg-elevated/40 px-3 py-2 text-xs font-medium text-muted">
          <span>编码</span>
          <span>名称</span>
          <span class="text-right">税率</span>
          <span>种类</span>
          <span>状态</span>
        </div>
        <div
          v-for="rate in taxRates"
          :key="rate.id"
          class="grid grid-cols-[5rem_minmax(0,1fr)_4rem_4rem_4rem] items-center gap-2 border-b border-default/60 px-3 py-2 last:border-b-0"
          data-testid="tax-rate-row"
        >
          <span class="text-xs tabular-nums text-muted">{{ rate.code }}</span>
          <span class="truncate text-[13px] text-highlighted">{{ rate.name }}</span>
          <span class="text-right text-[13px] tabular-nums text-highlighted">{{ formatRate(rate.rate) }}</span>
          <span class="text-xs text-muted">{{ taxRateKindLabels[rate.kind] }}</span>
          <UBadge
            :label="rate.status === 'active' ? '启用' : '停用'"
            :color="rate.status === 'active' ? 'success' : 'neutral'"
            variant="subtle"
            size="sm"
          />
        </div>
      </UCard>

      <UCard class="nx-reveal rounded-sm" :ui="{ body: 'p-0 sm:p-0' }" data-testid="tax-group-table">
        <template #header>
          <div>
            <h2 class="text-sm font-semibold text-highlighted">
              税组
            </h2>
            <p class="mt-0.5 text-xs text-muted">
              税组用于凭证与发票的默认税率组合。
            </p>
          </div>
        </template>
        <div class="grid grid-cols-[5rem_minmax(0,1fr)_auto_4.5rem] items-center gap-2 border-b border-default bg-elevated/40 px-3 py-2 text-xs font-medium text-muted">
          <span>编码</span>
          <span>名称</span>
          <span>包含税率</span>
          <span>状态</span>
        </div>
        <div
          v-for="group in taxGroups"
          :key="group.id"
          class="grid grid-cols-[5rem_minmax(0,1fr)_auto_4.5rem] items-center gap-2 border-b border-default/60 px-3 py-2 last:border-b-0"
          data-testid="tax-group-row"
        >
          <span class="text-xs tabular-nums text-muted">{{ group.code }}</span>
          <span class="truncate text-[13px] text-highlighted">{{ group.name }}</span>
          <span class="text-xs text-muted">{{ groupRates(group) }}</span>
          <UBadge
            :label="group.status === 'active' ? '启用' : '停用'"
            :color="group.status === 'active' ? 'success' : 'neutral'"
            variant="subtle"
            size="sm"
          />
        </div>
      </UCard>
    </div>

    <USlideover v-model:open="confirmOpen" :ui="{ content: 'w-full sm:max-w-lg' }" data-testid="tax-confirm">
      <template #header>
        <div>
          <p class="text-xs text-muted">
            税务申报
          </p>
          <h2 class="mt-1 text-base font-semibold text-highlighted">
            确认申报
          </h2>
          <p class="mt-0.5 text-xs text-muted">
            仅更新本地演示状态，不会向税务机关发送任何数据。
          </p>
        </div>
      </template>
      <template #body>
        <div v-if="targetFiling" class="space-y-3">
          <div class="grid gap-2 rounded-sm border border-default p-3 text-[13px] sm:grid-cols-2">
            <div>
              <p class="text-xs text-muted">
                税期
              </p>
              <p class="mt-0.5 text-highlighted">
                {{ targetFiling.period }}
              </p>
            </div>
            <div>
              <p class="text-xs text-muted">
                税种
              </p>
              <p class="mt-0.5 text-highlighted">
                {{ taxTypeLabels[targetFiling.taxType] }}
              </p>
            </div>
            <div>
              <p class="text-xs text-muted">
                应纳税额
              </p>
              <p class="mt-0.5 tabular-nums text-highlighted">
                {{ money(targetFiling.taxableAmount) }}
              </p>
            </div>
            <div>
              <p class="text-xs text-muted">
                应缴税额
              </p>
              <p class="mt-0.5 tabular-nums text-highlighted">
                {{ money(targetFiling.taxAmount) }}
              </p>
            </div>
          </div>
          <UAlert
            color="info"
            variant="soft"
            icon="i-carbon-information"
            title="申报后状态变为「已申报」"
            description="该操作只影响当前页面的本地演示数据，刷新后恢复初始状态。"
          />
        </div>
      </template>
      <template #footer>
        <div class="flex w-full items-center justify-between gap-2">
          <UButton
            label="取消"
            color="neutral"
            variant="ghost"
            data-testid="tax-confirm-cancel"
            @click="confirmOpen = false"
          />
          <UButton
            label="确认申报"
            icon="i-carbon-checkmark"
            :loading="submitting"
            :disabled="!canPost"
            data-testid="tax-confirm-submit"
            @click="confirmFile"
          />
        </div>
      </template>
    </USlideover>
  </div>
</template>

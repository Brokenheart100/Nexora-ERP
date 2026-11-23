<script setup lang="ts">
import {
  recurringOccurrenceStatusColors,
  recurringOccurrenceStatusLabels,
  recurringPlanStatusLabels
} from '~/mocks'
import { recurringNet, type RecurringRow, type RecurringHistoryRow } from '~/utils/sales/recurring'
import { displayDecimal } from '~/utils/api/decimal-display'

const props = defineProps<{
  plan: RecurringRow | null
  occurrences: RecurringHistoryRow[]
  preview: string[]
  canManage: boolean
  live?: boolean
  historyPage?: number
  historyProblem?: string
}>()

const emit = defineEmits<{
  'run': [on: string]
  'skip': [on: string]
  'edit': []
  'toggle': []
  'open-invoice': [invoiceId: string]
  'history-page': [step: number]
  'refresh': []
}>()

const open = defineModel<boolean>('open', { default: false })
const runDate = ref('')

const nextOn = computed(() => props.plan?.nextRunAt ?? props.preview[0] ?? '')
watch([() => props.plan?.id, open, nextOn], () => {
  if (open.value) runDate.value = nextOn.value
}, { immediate: true })

function openInvoice(invoiceId?: string) {
  if (invoiceId) emit('open-invoice', invoiceId)
}
</script>

<template>
  <USlideover v-model:open="open" :ui="{ content: 'w-full sm:max-w-2xl' }">
    <template #header>
      <div v-if="plan" class="flex w-full flex-wrap items-start justify-between gap-2">
        <div>
          <div class="flex items-center gap-2">
            <h2 class="font-mono text-sm font-semibold text-highlighted" data-testid="recurring-plan-id">
              {{ plan.id }}
            </h2>
            <UBadge
              :label="live && !plan.nextRunAt ? '已结束' : recurringPlanStatusLabels[plan.status]"
              :color="plan.status === 'active' ? 'success' : 'neutral'"
              variant="subtle"
              size="sm"
              data-testid="recurring-plan-status"
            />
            <UBadge
              :label="'v' + plan.version"
              color="neutral"
              variant="subtle"
              size="sm"
              data-testid="recurring-plan-version"
            />
          </div>
          <p class="mt-0.5 text-xs text-muted">
            {{ plan.customerName }} · {{ plan.serviceName }}
          </p>
        </div>
        <UButton
          label="返回"
          icon="i-carbon-arrow-left"
          color="neutral"
          variant="ghost"
          size="sm"
          data-testid="recurring-plan-back"
          @click="open = false"
        />
      </div>
    </template>

    <template #body>
      <div v-if="plan" class="space-y-4" data-testid="recurring-plan-detail">
        <slot name="operation" />
        <div class="grid grid-cols-2 gap-x-4 gap-y-3 text-[13px] sm:grid-cols-4">
          <div>
            <p class="text-xs text-muted">
              数量 × 单价
            </p>
            <p class="mt-0.5 tabular-nums text-default">
              {{ plan.quantity }} × {{ live ? displayDecimal(String(plan.unitPrice)) : formatMoney(Number(plan.unitPrice)) }}
            </p>
          </div>
          <div>
            <p class="text-xs text-muted">
              每期未税金额
            </p>
            <p class="mt-0.5 tabular-nums text-highlighted" data-testid="recurring-plan-amount">
              {{ recurringNet(plan) }}
            </p>
          </div>
          <div>
            <p class="text-xs text-muted">
              开票周期
            </p>
            <p class="mt-0.5 text-default">
              每 {{ plan.intervalMonths }} 个月
            </p>
          </div>
          <div>
            <p class="text-xs text-muted">
              付款账期
            </p>
            <p class="mt-0.5 text-default">
              {{ plan.dueDays }} 天
            </p>
          </div>
          <div>
            <p class="text-xs text-muted">
              {{ live ? '计划时区' : '首期日期' }}
            </p>
            <p class="mt-0.5 tabular-nums text-default">
              {{ live ? plan.timeZone : plan.firstOn }}
            </p>
          </div>
          <div>
            <p class="text-xs text-muted">
              结束日期
            </p>
            <p class="mt-0.5 tabular-nums text-default">
              {{ plan.endsOn ?? '未设置' }}
            </p>
          </div>
          <div>
            <p class="text-xs text-muted">
              上次执行
            </p>
            <p class="mt-0.5 tabular-nums text-default">
              {{ plan.lastRunAt ?? '尚未执行' }}
            </p>
          </div>
          <div>
            <p class="text-xs text-muted">
              下次执行
            </p>
            <p class="mt-0.5 font-medium tabular-nums text-highlighted" data-testid="recurring-plan-next">
              {{ plan.nextRunAt ?? '已结束' }}
            </p>
            <p v-if="plan.nextAtUtc" class="mt-1 text-xs text-muted" data-testid="recurring-plan-next-utc">
              {{ plan.nextAtUtc }}
            </p>
          </div>
        </div>

        <UAlert
          v-if="plan.pendingReason"
          color="warning"
          variant="soft"
          icon="i-carbon-warning-alt"
          :title="live ? '等待处理' : '待处理：期间阻断'"
          :description="plan.pendingReason"
          data-testid="recurring-plan-pending"
        />

        <div class="rounded-sm border border-default p-3">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <p class="text-xs font-medium text-highlighted">
              未来执行日期
            </p>
            <span class="text-[11px] text-muted">{{ live ? '按计划时区列出' : '按间隔 ' + plan.intervalMonths + ' 个月与结束日期推算' }}</span>
          </div>
          <div class="mt-2 flex flex-wrap gap-1.5" data-testid="recurring-plan-preview">
            <UBadge
              v-for="date in preview"
              :key="date"
              :label="date"
              color="neutral"
              variant="subtle"
              size="sm"
            />
            <span v-if="!preview.length" class="text-xs text-muted">没有后续执行日期。</span>
          </div>
        </div>

        <div class="rounded-sm border border-default p-3">
          <div class="flex flex-wrap items-end gap-2">
            <UFormField label="执行日期" class="min-w-[180px]">
              <UInput
                v-model="runDate"
                type="date"
                class="w-full"
                data-testid="recurring-plan-run-date"
              />
            </UFormField>
            <UButton
              label="执行该日期"
              icon="i-carbon-play"
              :disabled="!canManage || plan.status !== 'active' || !runDate"
              data-testid="recurring-plan-run"
              @click="emit('run', runDate)"
            />
            <UButton
              label="跳过该日期"
              icon="i-carbon-skip-forward"
              color="neutral"
              variant="outline"
              :disabled="!canManage || plan.status !== 'active' || !runDate || (live && runDate !== plan.nextRunAt)"
              data-testid="recurring-plan-skip"
              @click="emit('skip', runDate)"
            />
          </div>
          <p class="mt-2 text-[11px] text-muted">
            同一计划同一天重复执行只生成一张待复核发票；跳过会写入历史并前进到下一期。
          </p>
        </div>

        <div class="rounded-sm border border-default">
          <div class="flex items-center justify-between border-b border-default px-3 py-2">
            <p class="text-xs font-medium text-highlighted">
              执行历史
            </p>
            <span class="text-[11px] text-muted">{{ occurrences.length }} 条</span>
            <UButton v-if="live" label="刷新记录" size="xs" variant="outline" @click="emit('refresh')" />
          </div>
          <UAlert v-if="historyProblem" color="warning" variant="soft" :title="historyProblem" />
          <div class="max-h-64 overflow-auto" data-testid="recurring-plan-history">
            <div
              v-for="item in occurrences"
              :key="item.id"
              class="flex flex-wrap items-center justify-between gap-2 border-b border-default/60 px-3 py-2 text-xs last:border-b-0"
              :data-testid="'recurring-history-row-' + item.id"
            >
              <div class="flex flex-wrap items-center gap-2">
                <span class="tabular-nums text-highlighted">{{ item.scheduledOn }}</span>
                <UBadge
                  :label="recurringOccurrenceStatusLabels[item.status]"
                  :color="recurringOccurrenceStatusColors[item.status]"
                  variant="subtle"
                  size="sm"
                />
                <span class="text-muted">模板 v{{ item.version }}</span>
                <span v-if="live" class="text-muted">{{ new Date(item.actedAt).toLocaleString() }}</span>
              </div>
              <div class="flex items-center gap-2">
                <UButton
                  v-if="item.invoiceId"
                  :label="item.invoiceId"
                  color="primary"
                  variant="link"
                  size="xs"
                  :data-testid="'recurring-history-invoice-' + item.invoiceId"
                  @click="openInvoice(item.invoiceId)"
                />
                <span v-if="item.note" class="max-w-[240px] truncate text-[11px] text-muted">{{ item.note }}</span>
              </div>
            </div>
            <p v-if="!occurrences.length" class="px-3 py-4 text-xs text-muted">
              还没有执行记录，可手动执行或跳过到期日。
            </p>
          </div>
          <div v-if="live && ((historyPage ?? 1) > 1 || occurrences.length >= 50)" class="flex items-center gap-2 px-3 py-2">
            <UButton label="上一页记录" size="xs" variant="outline" :disabled="(historyPage ?? 1) <= 1" @click="emit('history-page', -1)" />
            <UButton label="下一页记录" size="xs" variant="outline" :disabled="occurrences.length < 50" @click="emit('history-page', 1)" />
          </div>
        </div>
      </div>
    </template>

    <template #footer>
      <div v-if="plan" class="flex w-full flex-wrap justify-end gap-2">
        <UButton
          label="编辑计划"
          icon="i-carbon-edit"
          color="neutral"
          variant="outline"
          :disabled="!canManage"
          data-testid="recurring-plan-edit"
          @click="emit('edit')"
        />
        <UButton
          v-if="!live || plan.nextRunAt"
          :label="plan.status === 'active' ? '暂停计划' : '恢复计划'"
          :icon="plan.status === 'active' ? 'i-carbon-pause' : 'i-carbon-play'"
          color="neutral"
          variant="outline"
          :disabled="!canManage"
          data-testid="recurring-plan-toggle"
          @click="emit('toggle')"
        />
        <UButton
          label="关闭"
          color="neutral"
          variant="ghost"
          data-testid="recurring-plan-close"
          @click="open = false"
        />
      </div>
    </template>
  </USlideover>
</template>

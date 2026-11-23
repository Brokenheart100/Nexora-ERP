<script setup lang="ts">
import { z } from 'zod'
import { taxCalendarSchema, taxFilingSchema, type TaxCalendar, type TaxPeriod } from '#shared/types/tax'
import { taxPath, useTaxApi, useTaxSubmission } from '~/composables/api/useTaxApi'
import { useWorkspaceQuery } from '~/composables/api/useWorkspaceQuery'

const api = useTaxApi()
const calendar = useWorkspaceQuery('tax-calendar', '/finance', api.calendar)
const today = () => new Date().toLocaleDateString('en-CA')
const enteredDate = ref(today())
const on = ref(enteredDate.value)
const validDate = computed(() => z.iso.date().safeParse(enteredDate.value).success)
const detailId = ref('')
const period = useWorkspaceQuery('tax-period', '/finance', (workspace, signal) => calendar.data
  ? api.period(workspace, on.value, signal)
  : Promise.resolve(null), () => [on.value, calendar.data?.version ?? null])
const detail = useWorkspaceQuery('tax-filing-detail', '/finance', (workspace, signal) => detailId.value
  ? api.filing(workspace, detailId.value, signal)
  : Promise.resolve(null), () => detailId.value)
const calendarWrite = useTaxSubmission('tax-calendar', () => calendar.data?.canManage === true, taxCalendarSchema.parse,
  saved => api.calendar(saved.workspaceId))
const filingWrite = useTaxSubmission('tax-filing', () => calendar.data?.canManage === true, taxFilingSchema.parse,
  saved => api.period(saved.workspaceId, saved.path.split('/').at(-2)!))
const calendarDraft = ref<Pick<TaxCalendar, 'cycle' | 'basis' | 'version'> | null>(null)
const filingDraft = shallowRef<TaxPeriod | null>(null)
const reference = ref('')
const reason = ref('')
const lockBooks = ref(false)
const historyOpen = ref(false)
const toast = useToast()
const workspace = computed(() => calendar.session.activeWorkspaceId)
const cycles = [{ value: 'monthly', label: '月度' }, { value: 'quarterly', label: '季度' }]
const bases = [{ value: 'accrual', label: '权责发生制' }, { value: 'cash', label: '收付实现制' }]
const prior = computed(() => filingDraft.value?.filings[0])
const calendarConflict = computed(() => [409, 412].includes(calendarWrite.failure?.status ?? 0))
const filingConflict = computed(() => [409, 412].includes(filingWrite.failure?.status ?? 0))
const canFile = computed(() => !!reference.value.trim() && (!prior.value || !!reason.value.trim()))
const calendarOpen = computed({
  get: () => !!calendarDraft.value,
  set: (open) => { if (!open) calendarDraft.value = null }
})
const filingOpen = computed({
  get: () => !!filingDraft.value,
  set: (open) => { if (!open) filingDraft.value = null }
})

watch(() => calendar.owner, () => {
  enteredDate.value = today()
  on.value = enteredDate.value
  detailId.value = ''
  calendarDraft.value = null
  filingDraft.value = null
  historyOpen.value = false
  reference.value = ''
  reason.value = ''
  lockBooks.value = false
}, { flush: 'sync' })

async function refresh() {
  await calendar.refresh()
  await period.refresh()
}

function loadPeriod() {
  if (!validDate.value) return
  if (on.value === enteredDate.value) void period.refresh()
  else on.value = enteredDate.value
}

function editCalendar() {
  if (!calendar.data?.canChangeCalendar) return
  calendarWrite.reset()
  const { cycle, basis, version } = calendar.data
  calendarDraft.value = { cycle, basis, version }
}

async function calendarSaved() {
  calendarDraft.value = null
  toast.add({ title: '申报日历已更新', color: 'success' })
  await refresh()
}

async function saveCalendar() {
  if (!calendarDraft.value || calendarConflict.value) return
  const { cycle, basis, version } = calendarDraft.value
  if (await calendarWrite.send('tax.calendar.changed', taxPath(workspace.value) + '/calendar', { cycle, basis }, {
    method: 'PUT', etag: '"' + version + '"'
  })) await calendarSaved()
}

async function retryCalendar() {
  if (await calendarWrite.retry()) await calendarSaved()
}

function openFiling() {
  if (!period.data || !calendar.data?.canManage) return
  filingWrite.reset()
  filingDraft.value = period.data
  reference.value = ''
  reason.value = ''
  lockBooks.value = false
}

function showHistory(id: string) {
  detailId.value = id
  historyOpen.value = true
}

async function filingSaved() {
  const saved = filingWrite.result
  filingDraft.value = null
  toast.add({ title: saved?.filing.correctsId ? '申报更正已登记' : '申报已登记', color: 'success' })
  if (saved) showHistory(saved.filing.id)
  await refresh()
}

async function saveFiling() {
  const selected = filingDraft.value?.current
  if (!selected || !canFile.value || filingConflict.value) return
  const path = taxPath(workspace.value) + '/periods/' + selected.period.from + '/filings'
  if (await filingWrite.send('tax.filing.recorded', path, {
    expectedFingerprint: selected.fingerprint, reference: reference.value.trim(), reason: reason.value.trim() || null,
    lockBooks: lockBooks.value
  }, { etag: '"' + (prior.value?.version ?? 0) + '"' })) await filingSaved()
}

async function retryFiling() {
  if (await filingWrite.retry()) await filingSaved()
}

async function reviewCalendarAgain() {
  calendarDraft.value = null
  await refresh()
}

async function reviewPeriodAgain() {
  filingDraft.value = null
  await refresh()
}

defineExpose({ refresh })
</script>

<template>
  <UCard class="rounded-sm" data-testid="tax-filings">
    <template #header>
      <div class="flex flex-wrap items-center justify-between gap-2">
        <h2 class="text-base font-semibold">
          申报日历
        </h2>
        <UButton
          v-if="calendar.data?.canChangeCalendar"
          label="编辑日历"
          variant="outline"
          size="sm"
          :disabled="!!calendarWrite.record"
          data-testid="tax-calendar-edit"
          @click="editCalendar"
        />
      </div>
    </template>

    <USkeleton v-if="calendar.loading && !calendar.data" class="h-24 w-full" />
    <UAlert
      v-else-if="calendar.problem"
      color="error"
      :title="calendar.problem"
      data-testid="tax-calendar-error"
    >
      <template #actions>
        <UButton label="重试读取" variant="outline" @click="refresh" />
      </template>
    </UAlert>
    <div v-else-if="calendar.data" class="space-y-4">
      <div class="flex flex-wrap items-center gap-2" data-testid="tax-calendar-state">
        <UBadge :label="calendar.data.cycle === 'monthly' ? '月度' : '季度'" color="neutral" variant="subtle" />
        <UBadge :label="calendar.data.basis === 'cash' ? '收付实现制' : '权责发生制'" color="neutral" variant="subtle" />
        <UBadge
          v-if="calendar.data.canManage && !calendar.data.canChangeCalendar"
          label="周期和口径已固定"
          color="neutral"
          variant="outline"
        />
        <UBadge
          v-if="calendar.data.lockedThrough"
          :label="'账簿锁定至 ' + calendar.data.lockedThrough"
          color="warning"
          variant="subtle"
        />
      </div>
      <SalesOperationStatus :submission="calendarWrite" @check="calendarWrite.checkCurrent" @retry="retryCalendar" />
      <form class="flex flex-wrap items-end gap-2" @submit.prevent="loadPeriod">
        <UFormField label="查找纳税期间" help="选择期间内任意日期">
          <UInput v-model="enteredDate" type="date" data-testid="tax-period-date" />
        </UFormField>
        <UButton
          label="读取期间"
          type="submit"
          variant="outline"
          :disabled="!validDate"
          data-testid="tax-period-load"
        />
      </form>

      <USkeleton v-if="period.loading && !period.data" class="h-32 w-full" />
      <UAlert v-else-if="period.problem" color="error" :title="period.problem" />
      <div v-else-if="period.data" class="space-y-4">
        <UAlert
          v-if="period.data.changedSinceFiling"
          color="warning"
          variant="soft"
          title="当前汇总与最近一次申报存在差异。"
          data-testid="tax-filing-difference"
        />
        <section data-testid="tax-period-current">
          <FinanceTaxPeriodTotals :totals="period.data.current" :workspace="workspace" />
        </section>
        <UButton
          v-if="calendar.data.canManage"
          :label="period.data.filings.length ? '登记更正' : '登记申报'"
          :disabled="!!filingWrite.record"
          data-testid="tax-filing-open"
          @click="openFiling"
        />
        <ul v-if="period.data.filings.length" class="divide-y divide-default border-y border-default" data-testid="tax-filing-history">
          <li v-for="entry in period.data.filings" :key="entry.id" class="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
            <span>v{{ entry.version }} · {{ entry.reference }}<template v-if="entry.lockBooks"> · 锁账</template></span>
            <UButton
              label="查看申报快照"
              size="xs"
              variant="ghost"
              :data-testid="'tax-filing-history-' + entry.version"
              @click="showHistory(entry.id)"
            />
          </li>
        </ul>
      </div>
      <SalesOperationStatus :submission="filingWrite" @check="filingWrite.checkCurrent" @retry="retryFiling" />
    </div>
  </UCard>

  <USlideover v-model:open="calendarOpen" title="编辑申报日历">
    <template #body>
      <form v-if="calendarDraft" class="space-y-3" @submit.prevent="saveCalendar">
        <UFormField label="申报周期">
          <USelect
            v-model="calendarDraft.cycle"
            :items="cycles"
            class="w-full"
            data-testid="tax-calendar-cycle"
          />
        </UFormField>
        <UFormField label="确认口径" help="周期和口径在首次申报后固定。">
          <USelect
            v-model="calendarDraft.basis"
            :items="bases"
            class="w-full"
            data-testid="tax-calendar-basis"
          />
        </UFormField>
        <UButton
          label="保存日历"
          type="submit"
          :loading="calendarWrite.mutation.busy"
          :disabled="!!calendarWrite.record || calendarConflict"
          data-testid="tax-calendar-save"
        />
        <SalesOperationStatus :submission="calendarWrite" @check="calendarWrite.checkCurrent" @retry="retryCalendar" />
        <UButton
          v-if="calendarConflict"
          label="重新读取日历"
          variant="outline"
          @click="reviewCalendarAgain"
        />
      </form>
    </template>
  </USlideover>

  <USlideover v-model:open="filingOpen" :title="prior ? '登记申报更正' : '登记申报'">
    <template #body>
      <form v-if="filingDraft" class="space-y-3" @submit.prevent="saveFiling">
        <FinanceTaxPeriodTotals :totals="filingDraft.current" :workspace="workspace" />
        <UFormField label="申报编号" required>
          <UInput
            v-model="reference"
            maxlength="100"
            class="w-full"
            data-testid="tax-filing-reference"
          />
        </UFormField>
        <UFormField v-if="prior" label="更正原因" required>
          <UTextarea
            v-model="reason"
            maxlength="300"
            class="w-full"
            data-testid="tax-filing-reason"
          />
        </UFormField>
        <UCheckbox
          v-if="calendar.data?.canLock"
          v-model="lockBooks"
          :label="'同时锁账至 ' + filingDraft.current.period.through + '（含）'"
          data-testid="tax-filing-lock"
        />
        <UButton
          label="确认登记"
          type="submit"
          :loading="filingWrite.mutation.busy"
          :disabled="!canFile || !!filingWrite.record || filingConflict"
          data-testid="tax-filing-submit"
        />
        <SalesOperationStatus :submission="filingWrite" @check="filingWrite.checkCurrent" @retry="retryFiling" />
        <UButton
          v-if="filingConflict"
          label="重新读取期间"
          variant="outline"
          data-testid="tax-filing-refresh"
          @click="reviewPeriodAgain"
        />
      </form>
    </template>
  </USlideover>

  <USlideover v-model:open="historyOpen" title="申报快照">
    <template #body>
      <USkeleton v-if="detail.loading" class="h-32 w-full" />
      <UAlert v-else-if="detail.problem" color="error" :title="detail.problem">
        <template #actions>
          <UButton label="重试读取" variant="outline" @click="detail.refresh()" />
        </template>
      </UAlert>
      <div v-else-if="detail.data" class="space-y-3" data-testid="tax-filing-detail">
        <p class="font-medium">
          v{{ detail.data.filing.version }} · {{ detail.data.filing.reference }}
        </p>
        <p v-if="detail.data.filing.reason" class="text-sm">
          {{ detail.data.filing.reason }}
        </p>
        <p class="text-xs text-muted">
          {{ detail.data.filing.recordedAtUtc }}<template v-if="detail.data.filing.lockBooks">
            · 随申报锁账
          </template>
        </p>
        <FinanceTaxPeriodTotals :totals="detail.data.snapshot" :workspace="workspace" />
      </div>
    </template>
  </USlideover>
</template>

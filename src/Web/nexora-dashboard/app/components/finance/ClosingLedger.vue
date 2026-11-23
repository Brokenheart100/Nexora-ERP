<script setup lang="ts">
import { z } from 'zod'
import { financePath, useLedgerApi } from '~/composables/api/useLedgerApi'
import { useWorkspaceQuery } from '~/composables/api/useWorkspaceQuery'
import { useScopedSubmission } from '~/composables/api/useScopedSubmission'
import type { AccountingBookConnection } from '~/composables/finance/useAccountingBook'
import { backfillSchema, fiscalYearSchema, periodChangeSchema, partnerCapitalSchema, partnershipSchema } from '#shared/types/ledger'
import { compareDecimal, sumDecimals } from '#shared/utils/decimal'

const props = defineProps<{ live: AccountingBookConnection }>()
const api = useLedgerApi()
const ws = () => props.live.workspace()
const root = () => financePath(ws())
const ledger = computed(() => props.live.query.data?.ledger)
const query = useWorkspaceQuery('ledger-closing', '/finance',
  async (id, signal) => {
    if (!ledger.value) return null
    const [readiness, years] = await Promise.all([api.readiness(id, signal), api.years(id, signal)])
    return { readiness, years }
  }, () => !!ledger.value)
const submission = useScopedSubmission('ledger-closing-write', () => query.enabled,
  z.union([backfillSchema, periodChangeSchema, fiscalYearSchema, partnershipSchema]).parse)
const today = () => new Date().toLocaleDateString('en-CA')
const through = ref(today())
const month = ref(today().slice(0, 7))
const monthDate = computed(() => month.value + '-01')
const periodReason = ref('')
const period = shallowRef<Awaited<ReturnType<typeof api.period>> | null>(null)
const backfilled = shallowRef<z.infer<typeof backfillSchema> | null>(null)
const year = ref(new Date().getFullYear())
const equity = ref('')
const yearReason = ref('')
const preview = shallowRef<Awaited<ReturnType<typeof api.yearPreview>> | null>(null)
const partnership = shallowRef<Awaited<ReturnType<typeof api.partnership>> | null>(null)
const partners = ref<z.infer<typeof partnerCapitalSchema>[]>([])
const loading = ref(false)
const error = ref('')
const frozen = computed(() => loading.value || !!submission.record || submission.mutation.busy)
const monthSummary = computed(() => ledger.value?.periods.find(row => row.month === monthDate.value))
const monthState = computed(() => period.value?.period.state ?? monthSummary.value?.state)
const equityChoices = computed(() => props.live.accounts.filter(row => row.category === 'equity' && row.purpose === 'posting' && !row.isArchived)
  .map(row => ({ label: row.code + ' ' + row.name, value: row.id })))
const stateLabel = (state: string | number) => ({
  1: '开放', 2: '关账中', 3: '已关账', open: '开放', closing: '关账中', closed: '已关账',
  pending: '待复核', prepared: '待复核', cancelled: '已取消', reopened: '已重开'
})[state] ?? String(state)
const supportedYear = () => Number.isInteger(Number(year.value)) && Number(year.value) >= 1900 && Number(year.value) <= 9997
const monthAction = computed(() => monthState.value === 'open'
  ? 'begin-close'
  : monthState.value === 'closing' ? 'close' : monthState.value === 'closed' ? 'reopen' : 'open')
const monthActionLabel = { 'begin-close': '开始关账', 'close': '完成关账', 'reopen': '重开期间', 'open': '开放会计期间' }
watch(month, () => {
  period.value = null
})
watch([year, equity], () => {
  preview.value = null
})
watch(year, () => {
  partnership.value = null
  partners.value = []
})
watch(() => query.owner, () => {
  period.value = backfilled.value = preview.value = partnership.value = null
  error.value = periodReason.value = yearReason.value = equity.value = ''
  loading.value = false
  partners.value = []
}, { flush: 'sync' })

async function run(read: (owner: string) => Promise<void>) {
  if (loading.value) return
  const owner = query.owner
  loading.value = true
  error.value = ''
  try {
    await read(owner)
  } catch (failure) {
    if (owner === query.owner) error.value = failure instanceof Error ? failure.message : '关账数据读取失败。'
  } finally {
    if (owner === query.owner) loading.value = false
  }
}
function readPeriod() {
  const requested = monthDate.value
  return run(async (owner) => {
    const value = await api.period(ws(), requested)
    if (owner === query.owner && monthDate.value === requested) period.value = value
  })
}
async function movePeriod() {
  if (frozen.value || !ledger.value?.canManagePeriods || !z.iso.date().safeParse(monthDate.value).success || !periodReason.value.trim()) {
    error.value = '请指定月份和原因。'
    return
  }
  const expectedVersion = period.value?.period.version ?? monthSummary.value?.version ?? 0
  error.value = ''
  if (await submission.send('period.move', root() + '/ledger/periods/' + monthDate.value, {
    expectedVersion, action: monthAction.value, reason: periodReason.value.trim()
  })) {
    await props.live.query.refresh()
    await readPeriod()
    await query.refresh()
  }
}
async function backfill() {
  if (frozen.value || !ledger.value?.canPost || !z.iso.date().safeParse(through.value).success) return
  error.value = ''
  if (await submission.send('ledger.backfill', root() + '/readiness/backfill', { through: through.value })) {
    const latest = submission.result
    if (latest && 'blocked' in latest) backfilled.value = latest
    await query.refresh()
  }
}
function previewYear() {
  if (!supportedYear() || !z.uuid().safeParse(equity.value).success) {
    error.value = '请选择财年和权益科目。'
    return
  }
  const anchor = Number(year.value), account = equity.value
  return run(async (owner) => {
    const value = await api.yearPreview(ws(), anchor, account)
    if (owner === query.owner && Number(year.value) === anchor && equity.value === account) preview.value = value
  })
}
async function prepareYear() {
  if (!preview.value || !ledger.value?.canDraft || frozen.value) return
  if (await submission.send('fiscal-year.prepare', root() + '/ledger/fiscal-years', { year: Number(year.value), equityAccountId: equity.value })) await query.refresh()
}
async function decideYear(id: string, version: number | string, decision: 'close' | 'cancel' | 'reopen') {
  if (frozen.value) return
  if (decision === 'reopen' && !yearReason.value.trim()) {
    error.value = '重开财年需要填写原因。'
    return
  }
  error.value = ''
  if (await submission.send('fiscal-year.' + decision, root() + '/ledger/fiscal-years/' + id + '/decision',
    { expectedVersion: version, decision, reason: yearReason.value.trim() || null }, { resourceId: id })) {
    await Promise.all([query.refresh(), props.live.query.refresh()])
  }
}
function readPartners() {
  if (!supportedYear()) {
    error.value = '请输入有效财年。'
    return
  }
  const anchor = Number(year.value)
  return run(async (owner) => {
    const value = await api.partnership(ws(), anchor)
    if (owner !== query.owner || Number(year.value) !== anchor) return
    partnership.value = value
    partners.value = value.partners.map(row => ({ ...row }))
  })
}
function addPartner() {
  if (partners.value.length >= 40) return
  partners.value.push({ code: '', name: '', capitalAccountId: '', drawingsAccountId: '', share: '' })
}
async function savePartners() {
  const value = partnership.value
  if (frozen.value || !value || !ledger.value?.canConfigurePartnership || value.year !== Number(year.value)) return
  const input = z.array(partnerCapitalSchema.extend({ code: z.string().trim().min(1).max(24), name: z.string().trim().min(1).max(100),
    share: z.string().regex(/^0\.\d{1,6}$/) })).min(2).max(40).safeParse(partners.value)
  if (!input.success || input.data.some(row => compareDecimal(row.share, '0') <= 0)
    || new Set(input.data.map(row => row.code.toUpperCase())).size !== input.data.length
    || new Set(input.data.flatMap(row => [row.capitalAccountId, row.drawingsAccountId])).size !== input.data.length * 2
    || compareDecimal(sumDecimals(input.data.map(row => row.share)), '1') !== 0) {
    error.value = '请填写 2 至 40 位合伙人，使用不同的编码及科目。各比例须大于 0 且小于 1，最多六位小数，合计为 1。'
    return
  }
  if (await submission.send('partnership.save', root() + '/ledger/partnerships/' + value.year,
    { expectedVersion: value.version, partners: input.data }, { method: 'PUT' })) {
    preview.value = null
    await readPartners()
  }
}
async function check() {
  if (!submission.mutation.unknown) submission.resume()
  await submission.check(async (saved) => {
    if (saved.action === 'period.move') await api.period(saved.workspaceId, saved.path.split('/').at(-1)!)
    else if (saved.action === 'ledger.backfill') await api.readiness(saved.workspaceId)
    else if (saved.action === 'partnership.save') await api.partnership(saved.workspaceId, Number(saved.path.split('/').at(-1)))
    else await api.years(saved.workspaceId)
    return null
  })
}
async function retry() {
  const record = submission.record
  if (!await submission.retry()) return
  await Promise.all([query.refresh(), props.live.query.refresh()])
  const result = submission.result
  if (result && 'blocked' in result) backfilled.value = result
  if (record?.action === 'period.move') await readPeriod()
  if (record?.action === 'partnership.save') await readPartners()
}
</script>

<template>
  <div class="space-y-4" data-testid="finance-closing">
    <SalesOperationStatus
      :message="error || live.query.problem || query.problem"
      :submission="submission"
      @check="check"
      @retry="retry"
    />
    <UCard class="rounded-sm">
      <template #header>
        <h2 class="text-sm font-semibold">
          财务就绪与待计价
        </h2>
      </template>
      <div v-if="query.data?.readiness" class="space-y-2 text-sm" data-testid="ledger-readiness">
        <UBadge :label="query.data.readiness.ready ? '已就绪' : '有待处理事项'" variant="subtle" :color="query.data.readiness.ready ? 'success' : 'warning'" />
        <p v-for="item in query.data.readiness.checks" :key="item.code">
          {{ item.message }} · {{ item.count }}
        </p>
        <p class="text-muted">
          待计价 {{ query.data.readiness.pendingCostCount }} · 缺少财务单据 {{ query.data.readiness.missingDocumentCount }}
        </p>
        <p v-for="item in query.data.readiness.pendingCosts" :key="item.id" class="break-all text-xs text-muted">
          {{ item.on }} · {{ item.id }} · {{ item.amount }} · {{ item.reason }}
        </p>
        <p v-for="item in query.data.readiness.missingDocuments" :key="item.id" class="break-all text-xs text-muted">
          {{ item.on }} · {{ item.kind }} · {{ item.number }} · {{ item.amount }}
        </p>
        <div v-if="ledger?.canPost" class="flex flex-wrap items-end gap-2">
          <UFormField label="成本补记截止日">
            <UInput v-model="through" type="date" />
          </UFormField>
          <UButton
            label="补记成本"
            variant="outline"
            :disabled="frozen"
            data-testid="ledger-backfill"
            @click="backfill"
          />
        </div>
        <div v-if="backfilled" class="space-y-1 text-sm" data-testid="ledger-backfill-result">
          <p>已补记 {{ backfilled.posted.length }} 笔 · 仍阻断 {{ backfilled.blocked.length }} 笔</p>
          <p v-for="item in backfilled.posted" :key="item.id">
            {{ item.amount }} <UButton
              v-if="item.journalId"
              label="查看凭证"
              size="xs"
              variant="link"
              :to="live.journalLink(item.journalId)"
            />
          </p>
          <p v-for="item in backfilled.blocked" :key="item.id" class="text-warning">
            {{ item.id }} · {{ item.reason }}
          </p>
        </div>
      </div>
    </UCard>

    <UCard class="rounded-sm">
      <template #header>
        <h2 class="text-sm font-semibold">
          会计期间
        </h2>
      </template>
      <div class="space-y-3">
        <div class="flex flex-wrap items-end gap-2">
          <UFormField label="月份">
            <UInput
              v-model="month"
              type="month"
              :disabled="frozen"
              data-testid="closing-period-month"
            />
          </UFormField>
          <UButton
            label="读取期间状态"
            size="sm"
            variant="outline"
            :disabled="!monthSummary || frozen"
            data-testid="closing-period-read"
            @click="readPeriod"
          />
          <UBadge :label="monthState ? stateLabel(monthState) : '尚未开放'" variant="subtle" data-testid="closing-period-state" />
        </div>
        <div v-if="period" class="space-y-2 text-sm" data-testid="closing-period-history">
          <p>过账水位 {{ period.check.watermark }} · 已过账 {{ period.check.postedCount }} · 待处理 {{ period.check.pendingCount }}</p>
          <p>借 {{ period.check.debit }} · 贷 {{ period.check.credit }}</p>
          <p v-for="row in period.history" :key="row.id" class="text-xs text-muted">
            {{ row.occurredAtUtc }} · {{ stateLabel(row.state) }} · {{ row.reason }}
          </p>
        </div>
        <div v-if="ledger?.canManagePeriods" class="flex flex-wrap items-end gap-2">
          <UFormField label="变更原因">
            <UInput
              v-model="periodReason"
              maxlength="300"
              :disabled="frozen"
              data-testid="closing-period-reason"
            />
          </UFormField>
          <UButton
            :label="monthActionLabel[monthAction]"
            :disabled="frozen || !periodReason.trim()"
            size="sm"
            data-testid="closing-period-action"
            @click="movePeriod"
          />
        </div>
      </div>
    </UCard>

    <UCard class="rounded-sm">
      <template #header>
        <h2 class="text-sm font-semibold">
          年结与合伙核算
        </h2>
      </template>
      <div class="space-y-3">
        <div class="flex flex-wrap items-end gap-2">
          <UFormField label="财年">
            <UInput
              v-model="year"
              type="number"
              :disabled="frozen"
              data-testid="closing-fiscal-year"
            />
          </UFormField>
          <UFormField label="结转权益科目">
            <USelectMenu
              v-model="equity"
              :items="equityChoices"
              value-key="value"
              :disabled="frozen"
              class="w-60"
              data-testid="closing-fiscal-equity"
            />
          </UFormField>
          <UButton
            label="预览年结"
            size="sm"
            variant="outline"
            :disabled="frozen || !equity"
            data-testid="closing-fiscal-preview"
            @click="previewYear"
          />
          <UButton
            label="读取合伙分摊"
            size="sm"
            variant="outline"
            :disabled="frozen"
            @click="readPartners"
          />
        </div>
        <div v-if="preview" class="space-y-2 rounded-sm border border-default p-3 text-sm" data-testid="closing-fiscal-preview-panel">
          <p>{{ preview.period.from }} 至 {{ preview.period.through }} · 净损益 {{ preview.netProfit }}</p>
          <p v-if="preview.openMonths.length || preview.pendingDocuments" class="text-warning">
            未关账月份 {{ preview.openMonths.join('、') || '无' }} · 待处理 {{ preview.pendingDocuments ?? 0 }} 笔
          </p>
          <p v-for="line in preview.lines" :key="line.accountId">
            {{ line.code }} {{ line.name }} · {{ line.balance }}
          </p>
          <p v-for="partner in preview.partnerAllocations" :key="partner.code">
            {{ partner.name }} · 分摊 {{ partner.share }} · 资本 {{ partner.capital.balance }} · 提款 {{ partner.drawings.balance }}
          </p>
          <UButton
            v-if="ledger?.canDraft"
            label="提交年结复核"
            size="sm"
            :disabled="frozen || !!preview.openMonths.length || !!preview.pendingDocuments"
            data-testid="closing-fiscal-prepare"
            @click="prepareYear"
          />
        </div>
        <div v-if="partnership" class="space-y-3 rounded-sm border border-default p-3">
          <p class="text-sm font-medium">
            {{ partnership.year }} 年分摊 · 版本 {{ partnership.version }}
          </p>
          <div v-for="(partner, index) in partners"
               :key="index"
               class="grid gap-2 sm:grid-cols-3"
               :data-testid="'partnership-row-' + index">
            <UFormField label="编码">
              <UInput v-model="partner.code" :disabled="!ledger?.canConfigurePartnership || frozen" />
            </UFormField>
            <UFormField label="名称">
              <UInput v-model="partner.name" :disabled="!ledger?.canConfigurePartnership || frozen" />
            </UFormField>
            <UFormField label="比例（0 到 1）">
              <UInput v-model="partner.share" inputmode="decimal" :disabled="!ledger?.canConfigurePartnership || frozen" />
            </UFormField>
            <UFormField label="资本科目">
              <USelectMenu
                v-model="partner.capitalAccountId"
                :items="equityChoices"
                value-key="value"
                :disabled="!ledger?.canConfigurePartnership || frozen"
                class="w-full"
                :data-testid="'partnership-capital-' + index"
              />
            </UFormField>
            <UFormField label="提款科目">
              <USelectMenu
                v-model="partner.drawingsAccountId"
                :items="equityChoices"
                value-key="value"
                :disabled="!ledger?.canConfigurePartnership || frozen"
                class="w-full"
                :data-testid="'partnership-drawings-' + index"
              />
            </UFormField>
            <UButton
              v-if="ledger?.canConfigurePartnership"
              label="移除"
              size="xs"
              variant="ghost"
              :disabled="frozen"
              @click="partners.splice(index, 1)"
            />
          </div>
          <div v-if="ledger?.canConfigurePartnership" class="flex gap-2">
            <UButton
              label="添加合伙人"
              size="sm"
              variant="outline"
              :disabled="frozen || partners.length >= 40"
              @click="addPartner"
            />
            <UButton
              label="保存分摊"
              size="sm"
              :disabled="frozen"
              @click="savePartners"
            />
          </div>
        </div>
        <div
          v-for="row in query.data?.years"
          :key="row.id"
          class="space-y-2 border-b border-default py-3 text-sm"
          :data-testid="'closing-fiscal-record-' + row.id"
        >
          <p>{{ row.report.period.from }} 至 {{ row.report.period.through }} · {{ stateLabel(row.state) }} · 净损益 {{ row.report.netProfit }}</p>
          <div class="flex flex-wrap gap-2">
            <UButton
              v-for="id in row.closingJournals"
              :key="id"
              label="查看结转凭证"
              variant="link"
              size="xs"
              :to="live.journalLink(id)"
            />
            <UButton
              v-for="id in row.reopeningJournals"
              :key="id"
              label="查看重开冲销凭证"
              variant="link"
              size="xs"
              :to="live.journalLink(id)"
            />
            <template v-if="['pending', 'prepared', 'submitted'].includes(row.state)">
              <UButton
                v-if="ledger?.canDraft"
                label="取消申请"
                size="xs"
                variant="outline"
                :disabled="frozen"
                @click="decideYear(row.id, row.version, 'cancel')"
              />
              <UButton
                v-if="ledger?.canManagePeriods"
                label="复核并结转"
                size="xs"
                :disabled="frozen"
                @click="decideYear(row.id, row.version, 'close')"
              />
            </template>
            <template v-if="row.state === 'closed' && ledger?.canManagePeriods">
              <UInput
                v-model="yearReason"
                aria-label="重开原因"
                placeholder="重开原因"
                size="xs"
              />
              <UButton
                label="重开财年"
                size="xs"
                variant="outline"
                :disabled="frozen || !yearReason.trim()"
                @click="decideYear(row.id, row.version, 'reopen')"
              />
            </template>
          </div>
        </div>
      </div>
    </UCard>
  </div>
</template>

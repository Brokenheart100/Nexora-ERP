<script setup lang="ts">
import { z } from 'zod'
import { tradePath, useTreasuryApi } from '~/composables/api/useTreasuryApi'
import { useWorkspaceQuery } from '~/composables/api/useWorkspaceQuery'
import { useTreasuryWrite } from '~/composables/finance/useTreasuryWrite'
import type { TreasuryConnection } from '~/composables/finance/useTreasuryConnection'
import type { Reconciliation, ReconciliationReport } from '#shared/types/treasury'
import { displayDecimal } from '~/utils/api/decimal-display'
import { localBusinessDate, treasuryAmount } from '~/utils/finance/treasury'
import { compareDecimal } from '#shared/utils/decimal'

const { connection } = defineProps<{ connection: TreasuryConnection }>()
const api = useTreasuryApi()
const workspace = () => connection.home.session.activeWorkspaceId
const write = useTreasuryWrite('bank-reconciliation', () => connection.home.enabled, workspace)
const records = useWorkspaceQuery('treasury-reconciliation', '/finance', (id, signal) =>
  connection.bankId ? api.reconciliations(id, connection.bankId, signal) : Promise.resolve([]), () => connection.bankId)
const through = ref(localBusinessDate())
const ending = ref('')
const draft = shallowRef<ReconciliationReport | null>(null)
const selectedId = ref('')
const undoId = ref('')
const reason = ref('')
const error = ref('')
const previewing = ref(false)
const selected = computed(() => records.data?.find(row => row.id === selectedId.value))
const report = computed(() => selected.value?.report ?? draft.value)
const latest = computed(() => records.data?.filter(row => row.state === 'completed')
  .reduce<Reconciliation | null>((current, row) => !current || row.report.through > current.report.through ? row : current, null))
const status = { pending: '待独立复核', completed: '已完成', undone: '已撤销', cancelled: '已取消' }
const amounts = [
  { key: 'statementBalance', label: '对账单期末余额' }, { key: 'bookBalance', label: '总账余额' },
  { key: 'outstandingBooks', label: '账面未达净额' }, { key: 'outstandingStatement', label: '对账单未达净额' },
  { key: 'adjustedStatement', label: '调整后对账单余额' }, { key: 'difference', label: '对账差额' },
  { key: 'ledgerDifference', label: '总账与流水差额' }
] as const
watch(() => [connection.home.owner, connection.bankId], () => {
  selectedId.value = undoId.value = reason.value = error.value = ending.value = ''
  through.value = localBusinessDate()
  draft.value = null
})
watch([through, ending], () => { draft.value = null })

function input() {
  if (!z.iso.date().safeParse(through.value).success) throw new Error('请选择有效的截止日期。')
  return { through: through.value, statementBalance: treasuryAmount(ending.value, connection.minorUnits, true) }
}
async function preview() {
  if (!connection.bankId || previewing.value) return
  const owner = connection.home.owner
  const bank = connection.bankId
  error.value = ''
  previewing.value = true
  try {
    const value = input()
    const result = await api.reconciliationPreview(workspace(), bank, value.through, value.statementBalance)
    if (owner === connection.home.owner && bank === connection.bankId
      && value.through === through.value && value.statementBalance === ending.value.trim()) {
      selectedId.value = ''
      draft.value = result.data
    }
  } catch (failure) {
    if (owner === connection.home.owner) error.value = failure instanceof Error ? failure.message : '无法预览对账。'
  } finally { previewing.value = false }
}
async function refresh() {
  await records.refresh()
  const result = write.submission.result
  if (result && 'report' in result && result.bankId === connection.bankId) selectedId.value = result.id
}
async function prepare() {
  if (!connection.canSubmit || !connection.bankId || write.blocked) return
  error.value = ''
  try {
    if (await write.send('reconciliation.prepare', `/banks/${connection.bankId}/reconciliations`, input(), { resourceId: connection.bankId })) {
      draft.value = null
      await refresh()
    }
  } catch (failure) { error.value = failure instanceof Error ? failure.message : '无法准备对账。' }
}
async function decide(row: Reconciliation, decision: 'finish' | 'cancel' | 'undo') {
  if (write.blocked || (decision === 'cancel' ? !connection.canSubmit : !connection.canApprove)) return
  if (decision === 'undo' && (latest.value?.id !== row.id || !reason.value.trim())) return
  error.value = ''
  const ok = await write.send('reconciliation.' + decision, `/reconciliations/${row.id}/decision`,
    { expectedVersion: row.version, decision, ...(decision === 'undo' ? { reason: reason.value.trim() } : {}) }, { resourceId: row.id })
  if (ok) undoId.value = reason.value = ''
  if (ok || [409, 412].includes(write.submission.failure?.status ?? 0)) await refresh()
}
async function check() {
  error.value = ''
  if (!write.submission.mutation.unknown && write.submission.record?.state === 'unknown') write.submission.resume()
  if (!write.submission.record) return refresh()
  await write.submission.check(async () => { await records.refresh(); return null })
}
async function retry() {
  if (await write.submission.retry()) await refresh()
}
defineExpose({ refresh })
</script>

<template>
  <UCard class="nx-reveal rounded-sm" data-testid="treasury-reconciliation">
    <template #header>
      <h3 class="text-sm font-semibold text-highlighted">银行对账</h3>
      <p class="mt-0.5 text-xs text-muted">按截止日期保存对账快照，由另一位有复核权限的成员确认。</p>
    </template>
    <div class="space-y-4">
      <div class="flex flex-wrap items-end gap-2">
        <UFormField label="截止日期" required>
          <UInput v-model="through" type="date" data-testid="treasury-recon-cutoff" />
        </UFormField>
        <UFormField label="对账单期末余额" required>
          <UInput v-model="ending" inputmode="decimal" data-testid="treasury-recon-bank-balance" />
        </UFormField>
        <UButton label="预览对账" variant="outline" :disabled="!connection.bankId || !ending" :loading="previewing"
          data-testid="treasury-recon-preview" @click="preview" />
        <UButton v-if="connection.canSubmit" label="提交对账复核" :disabled="!connection.bankId || !ending || write.blocked"
          data-testid="treasury-recon-save" @click="prepare" />
        <UButton label="刷新记录" variant="ghost" :loading="records.loading" @click="refresh" />
      </div>
      <FinanceTreasurySubmission :write="write" :check="check" :retry="retry" :error="error || records.problem" />
      <div v-if="report" class="space-y-3 rounded-sm border border-default p-3" data-testid="treasury-recon-report-values">
        <p class="text-sm font-medium">截至 {{ report.through }} · {{ selected ? status[selected.state] : '预览' }}</p>
        <dl class="grid gap-3 sm:grid-cols-3 xl:grid-cols-4">
          <div v-for="{ key, label } in amounts" :key="key">
            <dt class="text-xs text-muted">{{ label }}</dt>
            <dd class="font-semibold tabular-nums" :data-testid="'treasury-recon-value-' + key"
              :class="(key === 'difference' || key === 'ledgerDifference') && compareDecimal(report[key], '0') !== 0 ? 'text-error' : 'text-highlighted'">
              {{ displayDecimal(report[key], connection.minorUnits) }}
            </dd>
          </div>
        </dl>
        <p class="text-xs text-muted">匹配 {{ report.matches.length }} 笔 · 账面未达 {{ report.books.length }} 笔 · 对账单未达 {{ report.statement.length }} 笔</p>
        <ul v-if="report.books.length || report.statement.length" class="space-y-1 text-xs text-muted">
          <li v-for="item in report.books" :key="item.id">
            账面未达 · {{ item.on }} · {{ displayDecimal(item.amount, connection.minorUnits) }}
            <NuxtLink v-if="item.journalId" :to="{ path: '/finance', query: { tab: 'journals', journal: item.journalId } }" class="text-primary">凭证 {{ item.journalId }}</NuxtLink>
          </li>
          <li v-for="item in report.statement" :key="item.id">对账单未达 · {{ item.on }} · {{ item.reference }} · {{ displayDecimal(item.amount, connection.minorUnits) }}</li>
        </ul>
        <p v-if="selected?.undoReason" class="text-xs text-muted">撤销原因 · {{ selected.undoReason }}</p>
      </div>
      <p v-if="!records.loading && !records.data?.length" class="text-sm text-muted">当前账户没有银行对账记录。</p>
      <div v-for="row in records.data" :key="row.id" class="space-y-2 rounded-sm border border-default p-3" :data-testid="'treasury-recon-record-' + row.id">
        <div class="flex flex-wrap items-center gap-2">
          <span class="mr-auto text-sm">{{ row.report.through }} · {{ displayDecimal(row.report.statementBalance, connection.minorUnits) }} · 版本 {{ row.version }}</span>
          <UBadge :label="status[row.state]" :color="row.state === 'completed' ? 'success' : 'neutral'" variant="subtle" />
          <UButton label="查看快照" variant="ghost" size="sm" @click="selectedId = row.id" />
          <template v-if="row.state === 'pending'">
            <UButton v-if="connection.canSubmit" label="取消申请" variant="outline" size="sm" :disabled="write.blocked" @click="decide(row, 'cancel')" />
            <UButton v-if="connection.canApprove" label="复核完成对账" size="sm" :disabled="write.blocked"
              :data-testid="'treasury-recon-finish-' + row.id" @click="decide(row, 'finish')" />
          </template>
          <UButton v-if="row.state === 'completed' || row.state === 'undone'" label="下载 PDF" icon="i-carbon-download" variant="outline" size="sm"
            :href="tradePath(workspace()) + '/reconciliations/' + row.id + '/pdf'" external :data-testid="'treasury-recon-pdf-' + row.id" />
          <UButton v-if="connection.canApprove && latest?.id === row.id" label="撤销对账" color="warning" variant="outline" size="sm"
            :data-testid="'treasury-recon-undo-' + row.id" @click="undoId = row.id; reason = ''" />
        </div>
        <div v-if="undoId === row.id" class="flex flex-wrap items-end gap-2">
          <UFormField label="撤销原因" required>
            <UInput v-model="reason" :maxlength="300" class="min-w-64" data-testid="treasury-recon-undo-reason" />
          </UFormField>
          <UButton label="确认撤销" color="warning" :disabled="!reason.trim() || write.blocked" data-testid="treasury-recon-undo-confirm" @click="decide(row, 'undo')" />
        </div>
      </div>
    </div>
  </UCard>
</template>

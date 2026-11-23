<script setup lang="ts">
import { useTreasuryApi } from '~/composables/api/useTreasuryApi'
import { useWorkspaceQuery } from '~/composables/api/useWorkspaceQuery'
import { useTreasuryWrite } from '~/composables/finance/useTreasuryWrite'
import type { TreasuryConnection } from '~/composables/finance/useTreasuryConnection'
import type { StatementLine } from '#shared/types/treasury'
import { compareDecimal, subtractDecimal } from '#shared/utils/decimal'
import { displayDecimal } from '~/utils/api/decimal-display'
import { treasuryAmount } from '~/utils/finance/treasury'

const { connection } = defineProps<{ connection: TreasuryConnection }>()
const emit = defineEmits<{ createFlow: [line: StatementLine, type: 'other-income' | 'expense' | 'payment'] }>()
const api = useTreasuryApi()
const workspace = () => connection.home.session.activeWorkspaceId
const write = useTreasuryWrite('statement', () => connection.home.enabled, workspace)
const page = ref(1)
const selectedId = ref('')
const movementId = ref('')
const amount = ref('')
const reason = ref('')
const error = ref('')
const lines = useWorkspaceQuery('treasury-statement', '/finance', (id, signal) =>
  connection.bankId ? api.statement(id, connection.bankId, page.value, signal) : Promise.resolve([]),
() => [connection.bankId, page.value])
const selected = computed(() => lines.data?.find(row => row.id === selectedId.value))
const history = useWorkspaceQuery('treasury-statement-matches', '/finance', (id, signal) =>
  selected.value ? api.matches(id, selected.value.id, signal) : Promise.resolve([]), () => selected.value?.id)

const remaining = (row: { amount: string, matched: string }) => subtractDecimal(row.amount.replace(/^-/, ''), row.matched)
const positive = (value: string) => compareDecimal(value, '0') > 0
const fmt = (value: string) => displayDecimal(value, connection.minorUnits)
const candidates = computed(() => {
  const line = selected.value
  if (!line) return []
  const direction = positive(line.amount)
  return (connection.movements.data ?? [])
    .filter(row => !row.voided && positive(row.amount) === direction && positive(remaining(row)))
    .map(row => {
      const document = connection.documents.data?.find(value => value.id === row.documentId)
      return { label: [document?.terms.number, row.on, fmt(remaining(row)), row.id].filter(Boolean).join(' · '), value: row.id }
    })
})
watch(() => [connection.home.owner, connection.bankId], () => {
  page.value = 1
  selectedId.value = ''
})
watch(selectedId, () => {
  movementId.value = amount.value = reason.value = error.value = ''
})
watch(() => connection.movementPage, () => { movementId.value = '' })

async function refresh() {
  await Promise.all([lines.refresh(), history.refresh(), connection.movements.refresh()])
}
async function send(action: string, path: string, payload: Record<string, unknown>, lineId: string) {
  error.value = ''
  const ok = await write.send(action, path, payload, { resourceId: lineId })
  if (ok || [409, 412].includes(write.submission.failure?.status ?? 0)) await refresh()
  if (ok) {
    amount.value = reason.value = ''
    movementId.value = ''
  }
}
async function match() {
  const row = selected.value
  const movement = connection.movements.data?.find(value => value.id === movementId.value)
  if (!connection.canApprove || !row || row.excluded || !movement || !candidates.value.some(i => i.value === movement.id) || write.blocked) return
  let value: string
  try {
    value = treasuryAmount(amount.value, connection.minorUnits)
    if (compareDecimal(value, remaining(row)) > 0 || compareDecimal(value, remaining(movement)) > 0)
      throw new Error('匹配金额超过对账单行或资金流水的剩余金额。')
  } catch (failure) {
    error.value = failure instanceof Error ? failure.message : '请输入有效金额。'
    return
  }
  await send('statement.match', `/statement/${row.id}/matches`, { movementId: movement.id, amount: value, expectedVersion: row.version }, row.id)
}
async function maintain(matchId?: string) {
  const row = selected.value
  if (!row || !connection.canApprove || write.blocked) return
  if (!reason.value.trim()) {
    error.value = '请填写操作原因。'
    return
  }
  if (matchId) await send('statement.release', `/matches/${matchId}/release`, { reason: reason.value.trim() }, row.id)
  else await send('statement.exclude', `/statement/${row.id}/exclude`, { exclude: !row.excluded, expectedVersion: row.version, reason: reason.value.trim() }, row.id)
}
async function check() {
  error.value = ''
  if (!write.submission.mutation.unknown && write.submission.record?.state === 'unknown') write.submission.resume()
  if (!write.submission.record) return refresh()
  await write.submission.check(async (saved) => {
    await refresh()
    if (!saved.resourceId) return null
    const matches = await api.matches(workspace(), saved.resourceId)
    const confirmed = matches.find(value => value.referenceId === saved.operationId)
    const current = lines.data?.find(row => row.id === saved.resourceId)
    return confirmed && current ? { id: confirmed.id, version: current.version } : null
  })
}
async function retry() {
  if (await write.submission.retry()) await refresh()
}
function label(row: StatementLine) {
  if (row.excluded) return '已排除'
  if (!positive(remaining(row))) return '已匹配'
  return positive(row.matched) ? '部分匹配' : '未匹配'
}
defineExpose({ refresh })
</script>

<template>
  <UCard class="nx-reveal rounded-sm" data-testid="treasury-statement">
    <template #header>
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 class="text-sm font-semibold text-highlighted">对账单匹配</h3>
          <p class="mt-0.5 text-xs text-muted">{{ connection.bankDetail.data?.name ?? '请选择资金账户' }}</p>
        </div>
        <UButton label="刷新对账单" variant="outline" size="sm" :loading="lines.loading" @click="refresh" />
      </div>
    </template>
    <div class="space-y-3">
      <FinanceTreasurySubmission :write="write" :check="check" :retry="retry" :error="error || lines.problem || history.problem" />
      <p v-if="!lines.loading && !lines.data?.length" class="text-sm text-muted">本页没有已导入的对账单行。</p>
      <div v-for="row in lines.data" :key="row.id" class="space-y-2 rounded-sm border border-default p-3" :data-testid="'treasury-statement-row-' + row.id">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p class="text-sm font-medium">{{ row.externalId }} · {{ row.description }}</p>
            <p class="text-xs text-muted">{{ row.on }} · 金额 {{ fmt(row.amount) }} · 已匹配 {{ fmt(row.matched) }} · 剩余 {{ fmt(remaining(row)) }}</p>
          </div>
          <div class="flex items-center gap-2">
            <UBadge :label="label(row)" :color="label(row) === '已匹配' ? 'success' : 'neutral'" variant="subtle" />
            <UButton :label="row.id === selectedId ? '收起' : '匹配详情'" variant="outline" size="sm"
              :data-testid="'treasury-statement-open-' + row.id" @click="selectedId = selectedId === row.id ? '' : row.id" />
          </div>
        </div>
        <template v-if="row.id === selectedId">
          <p v-if="history.loading" class="text-xs text-muted">正在读取匹配记录…</p>
          <div v-for="item in history.data" :key="item.id" class="flex flex-wrap items-center gap-2 border-t border-default pt-2 text-sm">
            <span class="break-all">{{ item.movementId }}</span>
            <span class="tabular-nums">{{ fmt(item.amount) }}</span>
            <UBadge :label="item.reversed ? '已解除' : '有效匹配'" variant="subtle" :color="item.reversed ? 'neutral' : 'success'" />
            <UButton v-if="!item.reversed && connection.canApprove" label="解除匹配" variant="outline" color="warning" size="sm"
              :disabled="write.blocked || !reason.trim()" :data-testid="'treasury-statement-release-' + item.id" @click="maintain(item.id)" />
          </div>
          <div v-if="connection.canApprove" class="flex flex-wrap items-end gap-2">
            <UFormField label="解除、排除或恢复原因">
              <UInput v-model="reason" :maxlength="300" class="min-w-64" :data-testid="'treasury-statement-reason-' + row.id" />
            </UFormField>
            <UButton v-if="row.excluded || !positive(row.matched)" :label="row.excluded ? '恢复匹配资格' : '排除此行'" variant="outline" size="sm"
              :disabled="write.blocked || !reason.trim()" :data-testid="'treasury-statement-maintain-' + row.id" @click="maintain()" />
          </div>
          <div v-if="!row.excluded && positive(remaining(row))" class="space-y-2 border-t border-default pt-2">
            <div v-if="connection.canApprove" class="flex flex-wrap items-end gap-2">
              <UFormField label="资金流水">
                <USelect v-model="movementId" :items="candidates" placeholder="请选择同方向资金流水" class="min-w-72"
                  :data-testid="'treasury-statement-flow-' + row.id" />
              </UFormField>
              <UFormField label="本次匹配金额">
                <UInput v-model="amount" inputmode="decimal" :data-testid="'treasury-statement-amount-' + row.id" />
              </UFormField>
              <UButton label="确认匹配" :disabled="write.blocked || !movementId || !amount"
                :data-testid="'treasury-statement-match-' + row.id" @click="match" />
              <UButton v-if="connection.movementPage > 1" label="上一页资金流水" size="xs" variant="ghost" @click="connection.movementPage--" />
              <UButton v-if="(connection.movements.data?.length ?? 0) >= 50" label="下一页资金流水" size="xs" variant="ghost" @click="connection.movementPage++" />
            </div>
            <div v-if="connection.canSubmit" class="flex flex-wrap gap-2">
              <UButton v-if="positive(row.amount)" label="带入其他收入" variant="outline" size="sm" @click="emit('createFlow', row, 'other-income')" />
              <template v-else>
                <UButton label="带入费用" variant="outline" size="sm" @click="emit('createFlow', row, 'expense')" />
                <UButton label="带入供应商付款" variant="outline" size="sm" @click="emit('createFlow', row, 'payment')" />
              </template>
            </div>
          </div>
        </template>
      </div>
      <div v-if="page > 1 || (lines.data?.length ?? 0) >= 50" class="flex items-center gap-2">
        <UButton label="上一页" variant="outline" size="sm" :disabled="page === 1" @click="page--; selectedId = ''" />
        <span class="text-xs text-muted">第 {{ page }} 页</span>
        <UButton label="下一页" variant="outline" size="sm" :disabled="(lines.data?.length ?? 0) < 50" @click="page++; selectedId = ''" />
      </div>
    </div>
  </UCard>
</template>

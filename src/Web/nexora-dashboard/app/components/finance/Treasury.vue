<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type {
  TreasuryAccountKind,
  TreasuryFlow,
  TreasuryFlowType,
  TreasuryImportPreviewRow,
  TreasuryLedgerCode,
  TreasuryMatchKind,
  TreasuryReconciliationRecord,
  TreasuryStatementRow
} from '~/mocks/treasury'
import {
  parseTreasuryCsv,
  treasuryAccountKindColors,
  treasuryAccountKindLabels,
  treasuryCsvHeaders,
  treasuryFlowStatusColors,
  treasuryFlowStatusLabels,
  treasuryFlowTypeDirections,
  treasuryFlowTypeLabels,
  treasuryImportFiles,
  treasuryImportMappingDefaults,
  treasuryLedgerLabels,
  treasuryMatchKindLabels,
  treasuryReconciliationStatusColors,
  treasuryReconciliationStatusLabels,
  treasuryStatementStatusColors,
  treasuryStatementStatusLabels
} from '~/mocks/treasury'
import type { TreasuryFlowInput } from '~/stores/treasury'

defineProps<{ canPost: boolean }>()

const store = useTreasuryStore()
const { actorOptions, actorRole, actor, setActorRole } = useDemoActor()

function money(value: number | string): string {
  return formatMoney(Number(value))
}

function signedMoney(value: number): string {
  const prefix = value > 0 ? '+' : value < 0 ? '-' : ''
  return prefix + formatMoney(Math.abs(value))
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

const accountOptions = computed(() => store.accounts.map(account => ({
  label: account.name + ' · ' + account.accountNo,
  value: account.id
})))

const defaultAccountId = computed(() => store.accounts.find(account => account.isDefault)?.id ?? store.accounts[0]?.id ?? '')

const accountKindOptions: Array<{ label: string, value: string }> = [
  { label: treasuryAccountKindLabels.bank, value: 'bank' },
  { label: treasuryAccountKindLabels.cash, value: 'cash' }
]

const ledgerOptions: Array<{ label: string, value: string }> = [
  { label: '1002 · 银行存款', value: '1002' },
  { label: '1001 · 库存现金', value: '1001' }
]

const flowTypeOptions: Array<{ label: string, value: string }> = [
  { label: treasuryFlowTypeLabels['other-income'], value: 'other-income' },
  { label: treasuryFlowTypeLabels.expense, value: 'expense' },
  { label: treasuryFlowTypeLabels.transfer, value: 'transfer' },
  { label: treasuryFlowTypeLabels['owner-contribution'], value: 'owner-contribution' },
  { label: treasuryFlowTypeLabels['owner-withdrawal'], value: 'owner-withdrawal' }
]

const matchSourceOptions: Array<{ label: string, value: string }> = [
  { label: '匹配已有流水', value: 'flow' },
  { label: '带入其他收入', value: 'other-income' },
  { label: '带入费用', value: 'other-expense' },
  { label: '带入供应商付款', value: 'vendor-payment' }
]

/* ---------- A. 资金账户 ---------- */

const accountOpen = ref(false)
const accountError = ref('')
const accountForm = reactive({
  kind: 'bank',
  name: '',
  accountNo: '',
  ledgerCode: '1002',
  isDefault: false
})

watch(() => accountForm.kind, (kind) => {
  accountForm.ledgerCode = kind === 'cash' ? '1001' : '1002'
})

function openAccountCreate() {
  accountError.value = ''
  accountForm.kind = 'bank'
  accountForm.name = ''
  accountForm.accountNo = ''
  accountForm.ledgerCode = '1002'
  accountForm.isDefault = false
  accountOpen.value = true
}

function saveAccount() {
  const result = store.createAccount({
    kind: accountForm.kind as TreasuryAccountKind,
    name: accountForm.name,
    accountNo: accountForm.accountNo,
    ledgerCode: accountForm.ledgerCode as TreasuryLedgerCode,
    isDefault: accountForm.isDefault
  })
  if (!result.ok) {
    accountError.value = result.message
    return
  }
  accountOpen.value = false
}

function setDefaultAccount(id: string) {
  store.setDefaultAccount(id)
}

/* ---------- B. 资金流水 ---------- */

const flowOpen = ref(false)
const flowError = ref('')
const flowActionError = ref('')
const editingFlowId = ref<string | null>(null)
const flowForm = reactive({
  type: 'other-income',
  date: '2026-11-30',
  amount: '',
  counterparty: '',
  summary: '',
  sourceAccountId: '',
  targetAccountId: ''
})

const flowFormDirection = computed<'in' | 'out'>(() => {
  return treasuryFlowTypeDirections[flowForm.type as TreasuryFlowType] ?? 'out'
})

function openFlowCreate() {
  editingFlowId.value = null
  flowError.value = ''
  flowActionError.value = ''
  flowForm.type = 'other-income'
  flowForm.date = '2026-11-30'
  flowForm.amount = ''
  flowForm.counterparty = ''
  flowForm.summary = ''
  flowForm.sourceAccountId = defaultAccountId.value
  flowForm.targetAccountId = store.accounts[1]?.id ?? defaultAccountId.value
  flowOpen.value = true
}

function openFlowEdit(flow: TreasuryFlow) {
  editingFlowId.value = flow.id
  flowError.value = ''
  flowForm.type = flow.type
  flowForm.date = flow.date
  flowForm.amount = flow.amount.toFixed(2)
  flowForm.counterparty = flow.counterparty
  flowForm.summary = flow.summary
  const partner = flow.transferGroupId
    ? store.flows.find(item => item.transferGroupId === flow.transferGroupId && item.id !== flow.id)
    : undefined
  if (flow.type === 'transfer') {
    if (flow.direction === 'out') {
      flowForm.sourceAccountId = flow.accountId
      flowForm.targetAccountId = partner?.accountId ?? flow.accountId
    } else {
      flowForm.targetAccountId = flow.accountId
      flowForm.sourceAccountId = partner?.accountId ?? flow.accountId
    }
  } else if (flow.direction === 'out') {
    flowForm.sourceAccountId = flow.accountId
    flowForm.targetAccountId = defaultAccountId.value
  } else {
    flowForm.targetAccountId = flow.accountId
    flowForm.sourceAccountId = defaultAccountId.value
  }
  flowOpen.value = true
}

function saveFlow() {
  const input: TreasuryFlowInput = {
    type: flowForm.type as TreasuryFlowType,
    date: flowForm.date,
    amount: Number(flowForm.amount),
    counterparty: flowForm.counterparty,
    summary: flowForm.summary,
    sourceAccountId: flowForm.sourceAccountId,
    targetAccountId: flowForm.targetAccountId
  }
  const result = editingFlowId.value
    ? store.updateFlow(editingFlowId.value, input)
    : store.createFlow(input, actor.value.name)
  if (!result.ok) {
    flowError.value = result.message
    return
  }
  flowOpen.value = false
}

function submitFlow(flow: TreasuryFlow) {
  const result = store.submitFlow(flow.id, actor.value.name)
  flowActionError.value = result.ok ? '' : result.message
}

function removeFlow(flow: TreasuryFlow) {
  const result = store.removeFlow(flow.id)
  flowActionError.value = result.ok ? '' : result.message
}

function approveFlow(flow: TreasuryFlow) {
  const result = store.approveFlow(flow.id, actor.value.name)
  flowActionError.value = result.ok ? '' : result.message
}

const rejectOpen = ref(false)
const rejectFlowId = ref('')
const rejectReason = ref('')
const rejectError = ref('')

function openReject(flow: TreasuryFlow) {
  rejectFlowId.value = flow.id
  rejectReason.value = ''
  rejectError.value = ''
  rejectOpen.value = true
}

function confirmReject() {
  const result = store.rejectFlow(rejectFlowId.value, actor.value.name, rejectReason.value)
  if (!result.ok) {
    rejectError.value = result.message
    return
  }
  rejectOpen.value = false
}

const voidOpen = ref(false)
const voidFlowId = ref('')
const voidReason = ref('')
const voidError = ref('')

function openVoid(flow: TreasuryFlow) {
  voidFlowId.value = flow.id
  voidReason.value = ''
  voidError.value = ''
  voidOpen.value = true
}

function confirmVoid() {
  const result = store.voidFlow(voidFlowId.value, actor.value.name, voidReason.value)
  if (!result.ok) {
    voidError.value = result.message
    return
  }
  voidOpen.value = false
}

const detailOpen = ref(false)
const detailFlowId = ref('')

const detailFlow = computed(() => (detailFlowId.value ? store.flowMap.get(detailFlowId.value) ?? null : null))
const detailTransferPartner = computed(() => {
  const flow = detailFlow.value
  if (!flow?.transferGroupId) return null
  return store.flows.find(item => item.transferGroupId === flow.transferGroupId && item.id !== flow.id) ?? null
})
const detailOriginal = computed(() => {
  const flow = detailFlow.value
  return flow?.originalFlowId ? store.flowMap.get(flow.originalFlowId) ?? null : null
})
const detailReversal = computed(() => {
  const flow = detailFlow.value
  return flow?.reversalFlowId ? store.flowMap.get(flow.reversalFlowId) ?? null : null
})

function openDetail(flow: TreasuryFlow) {
  detailFlowId.value = flow.id
  detailOpen.value = true
}

const flowColumns: TableColumn<TreasuryFlow>[] = [
  { id: 'id', header: '流水号', accessorKey: 'id' },
  { id: 'date', header: '日期', accessorKey: 'date' },
  { id: 'type', header: '类型' },
  { id: 'counterparty', header: '对方 / 摘要' },
  { id: 'account', header: '资金账户' },
  { id: 'amount', header: '金额' },
  { id: 'status', header: '状态' },
  { id: 'maker', header: '制单人' },
  { id: 'voucher', header: '凭证号' },
  { id: 'actions', header: '操作' }
]

/* ---------- C. 对账单导入 ---------- */

const importAccountId = ref('ACC-B1')
const importFileKey = ref(treasuryImportFiles[0]?.key ?? '')
const importMapping = reactive({ ...treasuryImportMappingDefaults })
const importError = ref('')
const importMessage = ref('')

const importFileOptions = treasuryImportFiles.map(file => ({ label: file.fileName, value: file.key }))

const selectedImportFile = computed(() => treasuryImportFiles.find(file => file.key === importFileKey.value) ?? null)
const importHeaders = computed(() => (selectedImportFile.value ? treasuryCsvHeaders(selectedImportFile.value.content) : []))
const importMappingOptions = computed(() => importHeaders.value.map(header => ({ label: header, value: header })))
const importDuplicateFile = computed(() => {
  const file = selectedImportFile.value
  return Boolean(file && store.importedFileNames.includes(file.fileName))
})
const importPreview = computed(() => {
  const file = selectedImportFile.value
  if (!file) return null
  const existing = store.statementsForAccount(importAccountId.value).map(row => ({
    date: row.date,
    summary: row.summary,
    amount: row.amount,
    direction: row.direction
  }))
  return parseTreasuryCsv(file.fileName, file.content, { ...importMapping }, existing)
})
const importPreviewRows = computed(() => importPreview.value?.rows ?? [])

const importColumns: TableColumn<TreasuryImportPreviewRow>[] = [
  { id: 'line', header: '行号', accessorKey: 'line' },
  { id: 'date', header: '日期', accessorKey: 'date' },
  { id: 'summary', header: '摘要', accessorKey: 'summary' },
  { id: 'amount', header: '金额' },
  { id: 'direction', header: '方向' },
  { id: 'check', header: '校验结果' }
]

function submitImport() {
  const preview = importPreview.value
  if (!preview) {
    importError.value = '请选择对账单文件。'
    return
  }
  if (importDuplicateFile.value) {
    importError.value = '该文件已导入，请选择其他文件。'
    return
  }
  const result = store.importStatements({
    accountId: importAccountId.value,
    fileName: preview.fileName,
    rows: preview.validRows,
    problemCount: preview.problemCount
  })
  if (!result.ok) {
    importError.value = result.message
    return
  }
  importError.value = ''
  importMessage.value = result.message
}

/* ---------- D. 对账单匹配 ---------- */

const statementAccountId = ref('ACC-B1')
const statementRows = computed(() => store.statementsForAccount(statementAccountId.value))
const statementStats = computed(() => {
  const rows = statementRows.value
  return {
    total: rows.length,
    unmatched: rows.filter(row => row.status === 'unmatched').length,
    partial: rows.filter(row => row.status === 'partial').length,
    matched: rows.filter(row => row.status === 'matched').length,
    excluded: rows.filter(row => row.status === 'excluded').length
  }
})

interface MatchDraft {
  source: string
  flowId: string
  amount: string
}

const matchDrafts = reactive<Record<string, MatchDraft>>({})
const matchErrors = reactive<Record<string, string>>({})

function defaultMatchDraft(row: TreasuryStatementRow): MatchDraft {
  return { source: 'flow', flowId: '', amount: store.statementRemaining(row).toFixed(2) }
}

function draftFor(id: string): MatchDraft {
  const existing = matchDrafts[id]
  if (existing) return existing
  const created: MatchDraft = { source: 'flow', flowId: '', amount: '' }
  matchDrafts[id] = created
  return created
}

function syncMatchDrafts() {
  for (const row of statementRows.value) {
    if (!matchDrafts[row.id]) {
      matchDrafts[row.id] = defaultMatchDraft(row)
    }
    if (!matchErrors[row.id]) {
      matchErrors[row.id] = ''
    }
  }
}

watch(() => statementRows.value.map(row => row.id).join('|'), syncMatchDrafts, { immediate: true })

function updateDraft(id: string, key: keyof MatchDraft, value: string) {
  draftFor(id)[key] = value
}

function flowChoices(row: TreasuryStatementRow) {
  return store.matchableFlows(row).map(flow => ({
    label: [flow.id, treasuryFlowTypeLabels[flow.type], flow.summary, '剩余 ' + money(store.flowRemaining(flow.id))].join(' · '),
    value: flow.id
  }))
}

function submitMatch(row: TreasuryStatementRow) {
  const draft = draftFor(row.id)
  const amount = Number(draft.amount)
  if (!Number.isFinite(amount) || amount <= 0) {
    matchErrors[row.id] = '匹配金额需为大于 0 的数字。'
    return
  }
  if (draft.source === 'flow' && !draft.flowId) {
    matchErrors[row.id] = '请选择要匹配的已过账流水。'
    return
  }
  const result = store.matchStatement(row.id, {
    kind: draft.source as TreasuryMatchKind,
    flowId: draft.source === 'flow' ? draft.flowId : undefined,
    amount
  }, actor.value.name)
  if (!result.ok) {
    matchErrors[row.id] = result.message
    return
  }
  matchErrors[row.id] = ''
  draft.flowId = ''
  draft.amount = store.statementRemaining(row).toFixed(2)
}

const excludeOpen = ref(false)
const excludeRowId = ref('')
const excludeReason = ref('')
const excludeError = ref('')

function openExclude(row: TreasuryStatementRow) {
  excludeRowId.value = row.id
  excludeReason.value = ''
  excludeError.value = ''
  excludeOpen.value = true
}

function confirmExclude() {
  const result = store.excludeStatement(excludeRowId.value, excludeReason.value)
  if (!result.ok) {
    excludeError.value = result.message
    return
  }
  excludeOpen.value = false
}

function includeRow(row: TreasuryStatementRow) {
  const result = store.includeStatement(row.id)
  matchErrors[row.id] = result.ok ? '' : result.message
}

/* ---------- E. 银行对账 ---------- */

const reconAccountId = ref('ACC-B1')
const reconCutoff = ref('2026-11-30')
const reconBankBalance = ref('286420.00')
const reconError = ref('')
const reconMessage = ref('')

const reconAccount = computed(() => store.accountMap.get(reconAccountId.value) ?? null)
const reconDraft = computed(() => store.reconciliationDraft(reconAccountId.value))
const reconBook = computed(() => reconAccount.value?.balance ?? 0)
const reconOutstanding = computed(() => store.outstandingFor(reconAccountId.value, reconCutoff.value))
const reconDifference = computed(() => round2(Number(reconBankBalance.value || 0) - round2(reconBook.value + reconOutstanding.value)))
const reconStatementStats = computed(() => {
  const rows = store.statementsForAccount(reconAccountId.value)
  return {
    total: rows.length,
    matched: rows.filter(row => row.status === 'matched').length,
    excluded: rows.filter(row => row.status === 'excluded').length
  }
})

watch(reconAccountId, () => {
  reconBankBalance.value = (store.accountMap.get(reconAccountId.value)?.balance ?? 0).toFixed(2)
  reconError.value = ''
  reconMessage.value = ''
})

function saveRecon() {
  const bank = Number(reconBankBalance.value)
  if (!String(reconBankBalance.value ?? '').trim() || !Number.isFinite(bank)) {
    reconError.value = '请填写有效的银行期末余额。'
    return
  }
  const result = store.saveReconciliation({
    accountId: reconAccountId.value,
    cutoff: reconCutoff.value,
    bankBalance: bank
  }, actor.value.name)
  if (!result.ok) {
    reconError.value = result.message
    return
  }
  reconError.value = ''
  reconMessage.value = result.message
}

function cancelRecon() {
  const result = store.cancelReconciliation(reconAccountId.value)
  if (!result.ok) {
    reconError.value = result.message
    return
  }
  reconError.value = ''
  reconMessage.value = result.message
}

function confirmRecon() {
  const draft = store.reconciliationDraft(reconAccountId.value)
  if (!draft) {
    reconError.value = '请先保存待完成记录，再进行复核确认。'
    return
  }
  const result = store.confirmReconciliation(draft.id, actor.value.name)
  if (!result.ok) {
    reconError.value = result.message
    return
  }
  reconError.value = ''
  reconMessage.value = result.message
}

const reportOpen = ref(false)
const reportRecordId = ref('')
const reportRecord = computed(() => {
  if (!reportRecordId.value) return null
  return store.reconciliations.find(record => record.id === reportRecordId.value) ?? null
})

function openReport() {
  const record = store.latestCompleted
  if (!record) {
    reconError.value = '暂无已完成的对账记录，完成复核确认后可生成报告。'
    return
  }
  reportRecordId.value = record.id
  reportOpen.value = true
}

const undoOpen = ref(false)
const undoRecordId = ref('')
const undoReason = ref('')
const undoError = ref('')

function openUndo() {
  const record = store.latestCompleted
  if (!record) {
    reconError.value = '暂无可撤销的已确认对账记录。'
    return
  }
  undoRecordId.value = record.id
  undoReason.value = ''
  undoError.value = ''
  undoOpen.value = true
}

function confirmUndo() {
  const result = store.undoReconciliation(undoRecordId.value, actor.value.name, undoReason.value)
  if (!result.ok) {
    undoError.value = result.message
    return
  }
  undoOpen.value = false
  reconMessage.value = result.message
  reconError.value = ''
  if (reportRecordId.value === undoRecordId.value) {
    reportOpen.value = false
  }
}

const reconColumns: TableColumn<TreasuryReconciliationRecord>[] = [
  { id: 'id', header: '记录号', accessorKey: 'id' },
  { id: 'account', header: '资金账户' },
  { id: 'cutoff', header: '截止日期', accessorKey: 'cutoff' },
  { id: 'bank', header: '银行期末余额' },
  { id: 'book', header: '账面余额' },
  { id: 'outstanding', header: '未达金额' },
  { id: 'difference', header: '差异' },
  { id: 'status', header: '状态' },
  { id: 'maker', header: '制单人', accessorKey: 'maker' },
  { id: 'reviewer', header: '复核人' }
]
</script>

<template>
  <div class="space-y-4" data-testid="finance-treasury">
    <UCard class="nx-reveal rounded-sm" :ui="{ body: 'p-3 sm:p-3' }">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 class="text-sm font-semibold text-highlighted">
            资金管理
          </h2>
          <p class="mt-0.5 text-xs text-muted">
            银行与现金账户、资金流水、对账单导入匹配与银行对账。全部为本地演示数据，刷新后恢复种子。
          </p>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <span class="text-xs text-muted">演示身份</span>
          <UButton
            :label="(actorOptions[0]?.name ?? '张明远') + ' · 制单'"
            :color="actorRole === 'maker' ? 'primary' : 'neutral'"
            :variant="actorRole === 'maker' ? 'solid' : 'outline'"
            size="xs"
            data-testid="treasury-actor-maker"
            @click="setActorRole('maker')"
          />
          <UButton
            :label="(actorOptions[1]?.name ?? '陈立') + ' · 复核'"
            :color="actorRole === 'approver' ? 'primary' : 'neutral'"
            :variant="actorRole === 'approver' ? 'solid' : 'outline'"
            size="xs"
            data-testid="treasury-actor-approver"
            @click="setActorRole('approver')"
          />
          <UBadge
            :label="'当前：' + actor.name"
            color="neutral"
            variant="subtle"
            size="sm"
            data-testid="treasury-actor-current"
          />
          <UBadge
            :label="canPost ? '可操作' : '只读演示'"
            :color="canPost ? 'success' : 'neutral'"
            variant="subtle"
            size="sm"
            data-testid="treasury-can-post"
          />
        </div>
      </div>
    </UCard>

    <UCard class="nx-reveal rounded-sm" :ui="{ body: 'p-0 sm:p-0' }">
      <template #header>
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 class="text-sm font-semibold text-highlighted">
              资金账户
            </h3>
            <p class="mt-0.5 text-xs text-muted">
              3 个银行账户与 2 个现金账户，关联 1002 银行存款 / 1001 库存现金科目。
            </p>
          </div>
          <UButton
            label="新建账户"
            icon="i-carbon-add"
            size="xs"
            :disabled="!canPost"
            data-testid="treasury-account-create"
            @click="openAccountCreate"
          />
        </div>
      </template>
      <div class="grid gap-3 p-3 md:grid-cols-2 xl:grid-cols-3">
        <div
          v-for="account in store.accounts"
          :key="account.id"
          class="rounded-sm border border-default p-3"
          :data-testid="'treasury-account-' + account.id"
        >
          <div class="flex items-start justify-between gap-2">
            <div class="min-w-0">
              <div class="flex flex-wrap items-center gap-1.5">
                <span class="text-sm font-medium text-highlighted">{{ account.name }}</span>
                <UBadge
                  :label="treasuryAccountKindLabels[account.kind]"
                  :color="treasuryAccountKindColors[account.kind]"
                  variant="subtle"
                  size="sm"
                />
                <UBadge
                  v-if="account.isDefault"
                  label="默认"
                  color="primary"
                  variant="subtle"
                  size="sm"
                />
              </div>
              <p class="mt-1 font-mono text-xs text-muted">
                {{ account.accountNo }}
              </p>
              <p class="mt-0.5 text-xs text-muted">
                {{ account.id }} · 科目 {{ treasuryLedgerLabels[account.ledgerCode] }}
              </p>
            </div>
            <UButton
              v-if="!account.isDefault"
              label="设为默认"
              color="neutral"
              variant="ghost"
              size="xs"
              :disabled="!canPost"
              :data-testid="'treasury-account-default-' + account.id"
              @click="setDefaultAccount(account.id)"
            />
          </div>
          <p class="mt-3 text-xl font-semibold tabular-nums text-highlighted">
            {{ money(account.balance) }}
          </p>
        </div>
      </div>
    </UCard>

    <UCard class="nx-reveal rounded-sm" :ui="{ body: 'p-0 sm:p-0' }">
      <template #header>
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 class="text-sm font-semibold text-highlighted">
              资金流水
            </h3>
            <p class="mt-0.5 text-xs text-muted">
              草稿提交、复核通过后自动生成凭证号并更新账户余额；已过账流水可作废并生成反向冲销。
            </p>
          </div>
          <UButton
            label="新建流水"
            icon="i-carbon-add"
            size="xs"
            :disabled="!canPost"
            data-testid="treasury-flow-create"
            @click="openFlowCreate"
          />
        </div>
      </template>
      <div class="space-y-3 p-3">
        <UAlert
          v-if="flowActionError"
          color="error"
          variant="soft"
          icon="i-carbon-warning-alt"
          :title="flowActionError"
          data-testid="treasury-flow-action-error"
        />
        <ResizableTable
          :data="store.flows"
          :columns="flowColumns"
          :row-activate="openDetail"
          class="nx-table"
          data-testid="treasury-flow-table"
        >
          <template #type-cell="{ row }">
            <UBadge
              :label="treasuryFlowTypeLabels[row.original.type]"
              color="neutral"
              variant="subtle"
              size="sm"
            />
          </template>
          <template #counterparty-cell="{ row }">
            <div class="min-w-0">
              <p class="truncate text-sm text-highlighted">
                {{ row.original.counterparty }}
              </p>
              <p class="truncate text-xs text-muted">
                {{ row.original.summary }}
              </p>
            </div>
          </template>
          <template #account-cell="{ row }">
            <span class="text-xs text-muted">{{ store.accountName(row.original.accountId) }}</span>
          </template>
          <template #amount-cell="{ row }">
            <span class="tabular-nums" :class="row.original.direction === 'in' ? 'text-success' : 'text-error'">
              {{ signedMoney(row.original.amount) }}
            </span>
          </template>
          <template #status-cell="{ row }">
            <UBadge
              :label="treasuryFlowStatusLabels[row.original.status]"
              :color="treasuryFlowStatusColors[row.original.status]"
              variant="subtle"
              size="sm"
            />
          </template>
          <template #maker-cell="{ row }">
            <span class="text-xs text-muted">{{ row.original.maker }}</span>
          </template>
          <template #voucher-cell="{ row }">
            <span class="font-mono text-xs text-muted">{{ row.original.voucherNo ?? '—' }}</span>
          </template>
          <template #actions-cell="{ row }">
            <div class="flex flex-wrap items-center justify-end gap-1">
              <UButton
                label="详情"
                color="neutral"
                variant="ghost"
                size="xs"
                :data-testid="'treasury-flow-detail-' + row.original.id"
                @click.stop="openDetail(row.original)"
              />
              <template v-if="row.original.status === 'draft'">
                <UButton
                  label="提交"
                  icon="i-carbon-send"
                  size="xs"
                  :disabled="!canPost"
                  :data-testid="'treasury-flow-submit-' + row.original.id"
                  @click.stop="submitFlow(row.original)"
                />
                <UButton
                  label="编辑"
                  color="neutral"
                  variant="outline"
                  size="xs"
                  :disabled="!canPost"
                  :data-testid="'treasury-flow-edit-' + row.original.id"
                  @click.stop="openFlowEdit(row.original)"
                />
                <UButton
                  label="取消"
                  color="error"
                  variant="ghost"
                  size="xs"
                  :disabled="!canPost"
                  :data-testid="'treasury-flow-cancel-' + row.original.id"
                  @click.stop="removeFlow(row.original)"
                />
              </template>
              <template v-else-if="row.original.status === 'submitted'">
                <UButton
                  label="复核通过"
                  icon="i-carbon-checkmark"
                  size="xs"
                  :disabled="!canPost"
                  :data-testid="'treasury-flow-approve-' + row.original.id"
                  @click.stop="approveFlow(row.original)"
                />
                <UButton
                  label="拒绝"
                  color="error"
                  variant="outline"
                  size="xs"
                  :disabled="!canPost"
                  :data-testid="'treasury-flow-reject-' + row.original.id"
                  @click.stop="openReject(row.original)"
                />
              </template>
              <template v-else-if="row.original.status === 'posted'">
                <UButton
                  label="作废"
                  color="error"
                  variant="ghost"
                  size="xs"
                  :disabled="!canPost"
                  :data-testid="'treasury-flow-void-' + row.original.id"
                  @click.stop="openVoid(row.original)"
                />
              </template>
            </div>
          </template>
        </ResizableTable>
      </div>
    </UCard>

    <UCard class="nx-reveal rounded-sm" :ui="{ body: 'p-0 sm:p-0' }">
      <template #header>
        <div>
          <h3 class="text-sm font-semibold text-highlighted">
            对账单导入
          </h3>
          <p class="mt-0.5 text-xs text-muted">
            选择账户与 CSV 样例，确认列映射后预览有效行与问题行，提交生成对账单批次。
          </p>
        </div>
      </template>
      <div class="space-y-3 p-3">
        <div class="grid gap-3 lg:grid-cols-2">
          <UFormField label="对账单账户" required>
            <USelect
              v-model="importAccountId"
              :items="accountOptions"
              class="w-full"
              data-testid="treasury-import-account"
            />
          </UFormField>
          <UFormField label="对账单文件" required>
            <USelect
              v-model="importFileKey"
              :items="importFileOptions"
              class="w-full"
              data-testid="treasury-import-file"
            />
          </UFormField>
        </div>

        <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <UFormField label="日期列">
            <USelect
              v-model="importMapping.date"
              :items="importMappingOptions"
              class="w-full"
              data-testid="treasury-import-mapping-date"
            />
          </UFormField>
          <UFormField label="摘要列">
            <USelect
              v-model="importMapping.summary"
              :items="importMappingOptions"
              class="w-full"
              data-testid="treasury-import-mapping-summary"
            />
          </UFormField>
          <UFormField label="金额列">
            <USelect
              v-model="importMapping.amount"
              :items="importMappingOptions"
              class="w-full"
              data-testid="treasury-import-mapping-amount"
            />
          </UFormField>
          <UFormField label="方向列">
            <USelect
              v-model="importMapping.direction"
              :items="importMappingOptions"
              class="w-full"
              data-testid="treasury-import-mapping-direction"
            />
          </UFormField>
        </div>

        <UAlert
          v-if="importDuplicateFile"
          color="warning"
          variant="soft"
          icon="i-carbon-warning"
          title="该文件已导入，请勿重复提交。"
          data-testid="treasury-import-duplicate"
        />
        <UAlert
          v-if="importError"
          color="error"
          variant="soft"
          icon="i-carbon-warning-alt"
          :title="importError"
          data-testid="treasury-import-error"
        />
        <UAlert
          v-if="importMessage"
          color="success"
          variant="soft"
          icon="i-carbon-checkmark"
          :title="importMessage"
          data-testid="treasury-import-message"
        />

        <div class="space-y-2 rounded-sm border border-default p-3" data-testid="treasury-import-preview">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div class="flex flex-wrap items-center gap-2">
              <span class="text-xs font-medium text-highlighted">导入预览</span>
              <UBadge
                :label="'有效行 ' + (importPreview?.validCount ?? 0)"
                color="success"
                variant="subtle"
                size="sm"
              />
              <UBadge
                :label="'重复行 ' + (importPreview?.duplicateCount ?? 0)"
                color="warning"
                variant="subtle"
                size="sm"
              />
              <UBadge
                :label="'问题行 ' + (importPreview?.problemCount ?? 0)"
                color="error"
                variant="subtle"
                size="sm"
              />
            </div>
            <UButton
              label="提交导入"
              icon="i-carbon-upload"
              size="xs"
              :disabled="!canPost"
              data-testid="treasury-import-submit"
              @click="submitImport"
            />
          </div>
          <ResizableTable :data="importPreviewRows" :columns="importColumns" class="nx-table">
            <template #amount-cell="{ row }">
              <span class="tabular-nums">{{ money(row.original.amount) }}</span>
            </template>
            <template #direction-cell="{ row }">
              <span class="text-xs text-muted">{{ row.original.direction === 'in' ? '收入' : '支出' }}</span>
            </template>
            <template #check-cell="{ row }">
              <div class="flex flex-col items-start gap-1">
                <UBadge
                  :label="row.original.status === 'valid' ? '有效' : row.original.status === 'duplicate' ? '重复' : '问题'"
                  :color="row.original.status === 'valid' ? 'success' : row.original.status === 'duplicate' ? 'warning' : 'error'"
                  variant="subtle"
                  size="sm"
                />
                <span v-if="row.original.message" class="text-xs text-muted">{{ row.original.message }}</span>
              </div>
            </template>
          </ResizableTable>
        </div>

        <div v-if="store.importBatches.length" class="space-y-2">
          <p class="text-xs font-medium text-highlighted">
            导入批次
          </p>
          <div
            v-for="batch in store.importBatches"
            :key="batch.id"
            class="flex flex-wrap items-center justify-between gap-2 rounded-sm border border-default px-3 py-2"
            :data-testid="'treasury-import-batch-' + batch.id"
          >
            <div class="text-xs text-muted">
              <span class="font-mono text-highlighted">{{ batch.id }}</span>
              <span class="ml-2">{{ batch.fileName }}</span>
              <span class="ml-2">{{ store.accountName(batch.accountId) }}</span>
            </div>
            <div class="flex flex-wrap items-center gap-2 text-xs text-muted">
              <UBadge
                :label="'有效 ' + batch.validCount"
                color="success"
                variant="subtle"
                size="sm"
              />
              <UBadge
                :label="'问题 ' + batch.problemCount"
                color="warning"
                variant="subtle"
                size="sm"
              />
              <span>生成 {{ batch.statementIds.length }} 条</span>
              <span>{{ batch.importedAt }}</span>
            </div>
          </div>
        </div>
      </div>
    </UCard>

    <UCard class="nx-reveal rounded-sm" :ui="{ body: 'p-0 sm:p-0' }">
      <template #header>
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 class="text-sm font-semibold text-highlighted">
              对账单匹配
            </h3>
            <p class="mt-0.5 text-xs text-muted">
              支持匹配已有流水或带入其他收入 / 费用 / 供应商付款，可分次匹配；排除行需填写原因。
            </p>
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <span class="text-xs text-muted">账户</span>
            <USelect
              v-model="statementAccountId"
              :items="accountOptions"
              class="w-64"
              data-testid="treasury-statement-account"
            />
            <UBadge
              :label="'未匹配 ' + statementStats.unmatched + ' / 部分 ' + statementStats.partial + ' / 已匹配 ' + statementStats.matched + ' / 排除 ' + statementStats.excluded"
              color="neutral"
              variant="subtle"
              size="sm"
            />
          </div>
        </div>
      </template>
      <div class="space-y-3 p-3">
        <UEmpty
          v-if="!statementRows.length"
          icon="i-carbon-document"
          title="暂无对账单流水"
          description="请先在上方导入对账单生成批次。"
        />
        <div
          v-for="row in statementRows"
          :key="row.id"
          class="rounded-sm border border-default p-3"
          :data-testid="'treasury-statement-row-' + row.id"
        >
          <div class="flex flex-wrap items-start justify-between gap-2">
            <div class="min-w-0">
              <div class="flex flex-wrap items-center gap-2">
                <span class="font-mono text-xs text-muted">{{ row.id }}</span>
                <span class="text-sm font-medium text-highlighted">{{ row.summary }}</span>
                <UBadge
                  :label="treasuryStatementStatusLabels[row.status]"
                  :color="treasuryStatementStatusColors[row.status]"
                  variant="subtle"
                  size="sm"
                />
              </div>
              <p class="mt-1 text-xs text-muted">
                {{ row.date }} · {{ row.direction === 'in' ? '收入' : '支出' }} · 批次 {{ row.importBatchId }} · 已匹配 {{ row.matches.length }} 笔
              </p>
            </div>
            <span class="tabular-nums text-sm font-medium" :class="row.direction === 'in' ? 'text-success' : 'text-error'">
              {{ signedMoney(row.amount) }}
            </span>
          </div>

          <dl class="mt-2 grid grid-cols-2 gap-2 text-xs md:grid-cols-3">
            <div>
              <dt class="text-muted">
                已匹配金额
              </dt>
              <dd class="tabular-nums text-highlighted">
                {{ money(row.matchedAmount) }}
              </dd>
            </div>
            <div>
              <dt class="text-muted">
                剩余金额
              </dt>
              <dd class="tabular-nums text-highlighted">
                {{ money(store.statementRemaining(row)) }}
              </dd>
            </div>
            <div>
              <dt class="text-muted">
                匹配方式
              </dt>
              <dd class="text-highlighted">
                {{ row.matches.length ? row.matches.map(match => treasuryMatchKindLabels[match.kind]).join('、') : '—' }}
              </dd>
            </div>
          </dl>

          <p v-if="row.status === 'excluded'" class="mt-2 text-xs text-error">
            排除原因：{{ row.excludeReason }}
          </p>
          <UAlert
            v-if="matchErrors[row.id]"
            color="error"
            variant="soft"
            icon="i-carbon-warning-alt"
            :title="matchErrors[row.id]"
            class="mt-2"
            :data-testid="'treasury-statement-match-error-' + row.id"
          />

          <div
            v-if="row.status !== 'matched' && row.status !== 'excluded'"
            class="mt-3 grid gap-2 border-t border-default pt-3 lg:grid-cols-[minmax(0,11rem)_minmax(0,1fr)_7rem_auto_auto]"
          >
            <USelect
              :model-value="draftFor(row.id).source"
              :items="matchSourceOptions"
              class="w-full"
              :data-testid="'treasury-statement-source-' + row.id"
              @update:model-value="updateDraft(row.id, 'source', String($event ?? ''))"
            />
            <USelect
              v-if="draftFor(row.id).source === 'flow'"
              :model-value="draftFor(row.id).flowId"
              :items="flowChoices(row)"
              class="w-full"
              :data-testid="'treasury-statement-flow-' + row.id"
              @update:model-value="updateDraft(row.id, 'flowId', String($event ?? ''))"
            />
            <span v-else class="flex items-center text-xs text-muted">
              将按该行金额生成已过账流水后再匹配
            </span>
            <UInput
              :model-value="draftFor(row.id).amount"
              type="number"
              step="0.01"
              min="0"
              class="w-full"
              :data-testid="'treasury-statement-amount-' + row.id"
              @update:model-value="updateDraft(row.id, 'amount', String($event ?? ''))"
            />
            <UButton
              label="匹配"
              icon="i-carbon-link"
              size="xs"
              :disabled="!canPost"
              :data-testid="'treasury-statement-match-' + row.id"
              @click="submitMatch(row)"
            />
            <UButton
              label="排除"
              color="neutral"
              variant="outline"
              size="xs"
              :disabled="!canPost"
              :data-testid="'treasury-statement-exclude-' + row.id"
              @click="openExclude(row)"
            />
          </div>
          <div v-else-if="row.status === 'excluded'" class="mt-3 flex justify-end border-t border-default pt-3">
            <UButton
              label="恢复参与匹配"
              icon="i-carbon-undo"
              color="neutral"
              variant="outline"
              size="xs"
              :disabled="!canPost"
              :data-testid="'treasury-statement-include-' + row.id"
              @click="includeRow(row)"
            />
          </div>
          <p v-else class="mt-3 border-t border-default pt-3 text-xs text-muted">
            该行已完成匹配，将作为已入账流水参与对账。
          </p>
        </div>
      </div>
    </UCard>

    <UCard class="nx-reveal rounded-sm" :ui="{ body: 'p-0 sm:p-0' }">
      <template #header>
        <div>
          <h3 class="text-sm font-semibold text-highlighted">
            银行对账
          </h3>
          <p class="mt-0.5 text-xs text-muted">
            录入截止日期与银行期末余额，系统按账面余额与未达对账单计算差异；差异归零后由复核人独立确认。
          </p>
        </div>
      </template>
      <div class="space-y-3 p-3">
        <div class="grid gap-3 lg:grid-cols-2">
          <div class="space-y-3">
            <UFormField label="对账账户" required>
              <USelect
                v-model="reconAccountId"
                :items="accountOptions"
                class="w-full"
                data-testid="treasury-recon-account"
              />
            </UFormField>
            <UFormField label="截止日期" required>
              <UInput
                v-model="reconCutoff"
                type="date"
                class="w-full"
                data-testid="treasury-recon-cutoff"
              />
            </UFormField>
            <UFormField label="银行期末余额" required>
              <UInput
                v-model="reconBankBalance"
                type="number"
                step="0.01"
                class="w-full"
                data-testid="treasury-recon-bank-balance"
              />
            </UFormField>
            <p class="text-xs text-muted">
              对账单 {{ reconStatementStats.total }} 条 · 已匹配 {{ reconStatementStats.matched }} 条 · 已排除 {{ reconStatementStats.excluded }} 条
            </p>
            <p v-if="reconDraft" class="text-xs text-muted" data-testid="treasury-recon-draft">
              待完成记录 {{ reconDraft.id }} · 差异 {{ signedMoney(reconDraft.difference) }} · 制单人 {{ reconDraft.maker }}
            </p>
          </div>
          <div class="rounded-sm border border-default p-3">
            <dl class="space-y-2 text-sm">
              <div class="flex items-center justify-between">
                <dt class="text-muted">
                  账面余额
                </dt>
                <dd class="tabular-nums text-highlighted" data-testid="treasury-recon-book">
                  {{ money(reconBook) }}
                </dd>
              </div>
              <div class="flex items-center justify-between">
                <dt class="text-muted">
                  未达金额（未匹配对账单）
                </dt>
                <dd class="tabular-nums text-highlighted" data-testid="treasury-recon-outstanding">
                  {{ signedMoney(reconOutstanding) }}
                </dd>
              </div>
              <div class="flex items-center justify-between">
                <dt class="text-muted">
                  调整后账面余额
                </dt>
                <dd class="tabular-nums text-highlighted">
                  {{ money(round2(reconBook + reconOutstanding)) }}
                </dd>
              </div>
              <div class="flex items-center justify-between border-t border-default pt-2">
                <dt class="text-muted">
                  银行 - 调整后账面差异
                </dt>
                <dd class="tabular-nums font-semibold" :class="Math.abs(reconDifference) < 0.005 ? 'text-success' : 'text-error'" data-testid="treasury-recon-difference">
                  {{ signedMoney(reconDifference) }}
                </dd>
              </div>
            </dl>
          </div>
        </div>

        <UAlert
          v-if="reconError"
          color="error"
          variant="soft"
          icon="i-carbon-warning-alt"
          :title="reconError"
          data-testid="treasury-recon-error"
        />
        <UAlert
          v-if="reconMessage"
          color="success"
          variant="soft"
          icon="i-carbon-checkmark"
          :title="reconMessage"
          data-testid="treasury-recon-message"
        />

        <div class="flex flex-wrap items-center gap-2">
          <UButton
            label="保存待完成记录"
            icon="i-carbon-save"
            size="xs"
            :disabled="!canPost"
            data-testid="treasury-recon-save"
            @click="saveRecon"
          />
          <UButton
            label="取消草稿"
            color="neutral"
            variant="outline"
            size="xs"
            :disabled="!canPost"
            data-testid="treasury-recon-cancel"
            @click="cancelRecon"
          />
          <UButton
            label="复核确认"
            icon="i-carbon-checkmark"
            size="xs"
            :disabled="!canPost"
            data-testid="treasury-recon-confirm"
            @click="confirmRecon"
          />
          <UButton
            label="报告预览"
            icon="i-carbon-document"
            color="neutral"
            variant="outline"
            size="xs"
            data-testid="treasury-recon-report"
            @click="openReport"
          />
          <UButton
            label="撤销最近对账"
            icon="i-carbon-undo"
            color="error"
            variant="ghost"
            size="xs"
            :disabled="!canPost"
            data-testid="treasury-recon-undo"
            @click="openUndo"
          />
        </div>

        <div class="space-y-2">
          <p class="text-xs font-medium text-highlighted">
            对账记录
          </p>
          <ResizableTable
            :data="store.reconciliations"
            :columns="reconColumns"
            class="nx-table"
            data-testid="treasury-recon-records"
          >
            <template #account-cell="{ row }">
              <span class="text-xs text-muted">{{ store.accountName(row.original.accountId) }}</span>
            </template>
            <template #bank-cell="{ row }">
              <span class="tabular-nums">{{ money(row.original.bankBalance) }}</span>
            </template>
            <template #book-cell="{ row }">
              <span class="tabular-nums">{{ money(row.original.bookBalance) }}</span>
            </template>
            <template #outstanding-cell="{ row }">
              <span class="tabular-nums">{{ signedMoney(row.original.outstanding) }}</span>
            </template>
            <template #difference-cell="{ row }">
              <span class="tabular-nums" :class="Math.abs(row.original.difference) < 0.005 ? 'text-success' : 'text-error'">
                {{ signedMoney(row.original.difference) }}
              </span>
            </template>
            <template #status-cell="{ row }">
              <UBadge
                :label="treasuryReconciliationStatusLabels[row.original.status]"
                :color="treasuryReconciliationStatusColors[row.original.status]"
                variant="subtle"
                size="sm"
              />
            </template>
            <template #reviewer-cell="{ row }">
              <span class="text-xs text-muted">{{ row.original.reviewer ?? '—' }}</span>
            </template>
          </ResizableTable>
        </div>
      </div>
    </UCard>

    <UModal v-model:open="accountOpen" title="新建资金账户" description="本地演示账户，保存后刷新页面即恢复种子数据">
      <template #body>
        <div class="space-y-3" data-testid="treasury-account-form">
          <UAlert
            v-if="accountError"
            color="error"
            variant="soft"
            icon="i-carbon-warning-alt"
            :title="accountError"
            data-testid="treasury-account-error"
          />
          <div class="grid gap-3 sm:grid-cols-2">
            <UFormField label="账户类型" required>
              <USelect
                v-model="accountForm.kind"
                :items="accountKindOptions"
                class="w-full"
                data-testid="treasury-account-kind"
              />
            </UFormField>
            <UFormField label="关联会计科目" required>
              <USelect
                v-model="accountForm.ledgerCode"
                :items="ledgerOptions"
                class="w-full"
                data-testid="treasury-account-ledger"
              />
            </UFormField>
            <UFormField label="账户名称" required>
              <UInput
                v-model="accountForm.name"
                class="w-full"
                placeholder="如 中国银行结算户"
                data-testid="treasury-account-name"
              />
            </UFormField>
            <UFormField label="账号" required>
              <UInput
                v-model="accountForm.accountNo"
                class="w-full"
                placeholder="银行账号或现金账户编号"
                data-testid="treasury-account-no"
              />
            </UFormField>
          </div>
          <UCheckbox v-model="accountForm.isDefault" label="设为默认资金账户" data-testid="treasury-account-default" />
        </div>
      </template>
      <template #footer>
        <div class="flex w-full items-center justify-end gap-2">
          <UButton
            label="取消"
            color="neutral"
            variant="ghost"
            @click="accountOpen = false"
          />
          <UButton
            label="保存账户"
            icon="i-carbon-checkmark"
            :disabled="!canPost"
            data-testid="treasury-account-save"
            @click="saveAccount"
          />
        </div>
      </template>
    </UModal>

    <UModal
      v-model:open="flowOpen"
      :title="editingFlowId ? '编辑资金流水' : '新建资金流水'"
      description="资金划转会同时生成方向相反的两条流水，共享同一划转组。"
    >
      <template #body>
        <div class="space-y-3" data-testid="treasury-flow-form">
          <UAlert
            v-if="flowError"
            color="error"
            variant="soft"
            icon="i-carbon-warning-alt"
            :title="flowError"
            data-testid="treasury-flow-error"
          />
          <div class="grid gap-3 sm:grid-cols-2">
            <UFormField label="流水类型" required>
              <USelect
                v-model="flowForm.type"
                :items="flowTypeOptions"
                class="w-full"
                data-testid="treasury-flow-type"
              />
            </UFormField>
            <UFormField label="业务日期" required>
              <UInput
                v-model="flowForm.date"
                type="date"
                class="w-full"
                data-testid="treasury-flow-date"
              />
            </UFormField>
            <UFormField label="金额" required>
              <UInput
                v-model="flowForm.amount"
                type="number"
                step="0.01"
                min="0"
                class="w-full"
                placeholder="0.00"
                data-testid="treasury-flow-amount"
              />
            </UFormField>
            <UFormField label="对方单位 / 个人" required>
              <UInput
                v-model="flowForm.counterparty"
                class="w-full"
                placeholder="如 宁波远航贸易有限公司"
                data-testid="treasury-flow-counterparty"
              />
            </UFormField>
            <UFormField label="摘要" required>
              <UInput
                v-model="flowForm.summary"
                class="w-full"
                placeholder="如 客户回款"
                data-testid="treasury-flow-summary"
              />
            </UFormField>
            <UFormField label="源账户">
              <USelect
                v-model="flowForm.sourceAccountId"
                :items="accountOptions"
                class="w-full"
                data-testid="treasury-flow-source"
              />
            </UFormField>
            <UFormField label="目标账户">
              <USelect
                v-model="flowForm.targetAccountId"
                :items="accountOptions"
                class="w-full"
                data-testid="treasury-flow-target"
              />
            </UFormField>
          </div>
          <p class="text-xs text-muted">
            当前类型方向：{{ flowFormDirection === 'in' ? '资金流入' : '资金流出' }}。资金划转需选择不同的源账户与目标账户。
          </p>
        </div>
      </template>
      <template #footer>
        <div class="flex w-full items-center justify-end gap-2">
          <UButton
            label="取消"
            color="neutral"
            variant="ghost"
            @click="flowOpen = false"
          />
          <UButton
            label="保存流水"
            icon="i-carbon-checkmark"
            :disabled="!canPost"
            data-testid="treasury-flow-save"
            @click="saveFlow"
          />
        </div>
      </template>
    </UModal>

    <UModal v-model:open="rejectOpen" title="拒绝资金流水" description="拒绝后流水回到草稿状态，需填写拒绝原因">
      <template #body>
        <div class="space-y-3" data-testid="treasury-flow-reject-form">
          <UAlert
            v-if="rejectError"
            color="error"
            variant="soft"
            icon="i-carbon-warning-alt"
            :title="rejectError"
            data-testid="treasury-flow-reject-error"
          />
          <UFormField label="拒绝原因" required>
            <UTextarea
              v-model="rejectReason"
              :rows="3"
              class="w-full"
              placeholder="请说明拒绝原因"
              data-testid="treasury-flow-reject-reason"
            />
          </UFormField>
        </div>
      </template>
      <template #footer>
        <div class="flex w-full items-center justify-end gap-2">
          <UButton
            label="取消"
            color="neutral"
            variant="ghost"
            @click="rejectOpen = false"
          />
          <UButton
            label="确认拒绝"
            color="error"
            :disabled="!canPost"
            data-testid="treasury-flow-reject-confirm"
            @click="confirmReject"
          />
        </div>
      </template>
    </UModal>

    <UModal v-model:open="voidOpen" title="作废已过账流水" description="作废将生成方向相反的反向流水与冲销凭证，原单保留可追溯">
      <template #body>
        <div class="space-y-3" data-testid="treasury-flow-void-form">
          <UAlert
            v-if="voidError"
            color="error"
            variant="soft"
            icon="i-carbon-warning-alt"
            :title="voidError"
            data-testid="treasury-flow-void-error"
          />
          <UFormField label="作废原因" required>
            <UTextarea
              v-model="voidReason"
              :rows="3"
              class="w-full"
              placeholder="请说明作废原因"
              data-testid="treasury-flow-void-reason"
            />
          </UFormField>
        </div>
      </template>
      <template #footer>
        <div class="flex w-full items-center justify-end gap-2">
          <UButton
            label="取消"
            color="neutral"
            variant="ghost"
            @click="voidOpen = false"
          />
          <UButton
            label="确认作废"
            color="error"
            :disabled="!canPost"
            data-testid="treasury-flow-void-confirm"
            @click="confirmVoid"
          />
        </div>
      </template>
    </UModal>

    <USlideover v-model:open="detailOpen" :ui="{ content: 'w-full sm:max-w-lg' }">
      <template #header>
        <div>
          <p class="text-sm font-semibold text-highlighted">
            资金流水详情
          </p>
          <p class="mt-0.5 text-xs text-muted">
            原单、冲销与划转关联均可追溯
          </p>
        </div>
      </template>
      <template #body>
        <div v-if="detailFlow" class="space-y-3" data-testid="treasury-flow-detail">
          <div class="flex items-center justify-between gap-2">
            <div>
              <p class="font-mono text-sm text-highlighted">
                {{ detailFlow.id }}
              </p>
              <p class="mt-0.5 text-xs text-muted">
                {{ treasuryFlowTypeLabels[detailFlow.type] }} · {{ detailFlow.date }}
              </p>
            </div>
            <UBadge
              :label="treasuryFlowStatusLabels[detailFlow.status]"
              :color="treasuryFlowStatusColors[detailFlow.status]"
              variant="subtle"
              size="sm"
            />
          </div>

          <div class="flex items-center justify-between rounded-sm border border-default px-3 py-2">
            <span class="text-xs text-muted">金额</span>
            <span class="tabular-nums text-lg font-semibold" :class="detailFlow.direction === 'in' ? 'text-success' : 'text-error'">
              {{ signedMoney(detailFlow.amount) }}
            </span>
          </div>

          <dl class="grid grid-cols-2 gap-3 text-xs">
            <div>
              <dt class="text-muted">
                资金账户
              </dt>
              <dd class="mt-0.5 text-highlighted">
                {{ store.accountName(detailFlow.accountId) }}
              </dd>
            </div>
            <div>
              <dt class="text-muted">
                对方
              </dt>
              <dd class="mt-0.5 text-highlighted">
                {{ detailFlow.counterparty }}
              </dd>
            </div>
            <div>
              <dt class="text-muted">
                摘要
              </dt>
              <dd class="mt-0.5 text-highlighted">
                {{ detailFlow.summary }}
              </dd>
            </div>
            <div>
              <dt class="text-muted">
                制单人
              </dt>
              <dd class="mt-0.5 text-highlighted">
                {{ detailFlow.maker }}
              </dd>
            </div>
            <div>
              <dt class="text-muted">
                凭证号
              </dt>
              <dd class="mt-0.5 font-mono text-highlighted">
                {{ detailFlow.voucherNo ?? '—' }}
              </dd>
            </div>
            <div>
              <dt class="text-muted">
                划转组
              </dt>
              <dd class="mt-0.5 font-mono text-highlighted">
                {{ detailFlow.transferGroupId ?? '—' }}
              </dd>
            </div>
          </dl>

          <div v-if="detailFlow.rejectReason" class="rounded-sm border border-error/30 bg-error/5 px-3 py-2 text-xs text-error">
            拒绝原因：{{ detailFlow.rejectReason }}
          </div>
          <div v-if="detailFlow.voidReason" class="rounded-sm border border-error/30 bg-error/5 px-3 py-2 text-xs text-error" data-testid="treasury-flow-detail-void-reason">
            作废原因：{{ detailFlow.voidReason }}
          </div>

          <div v-if="detailTransferPartner" class="flex items-center justify-between gap-2 rounded-sm border border-default px-3 py-2 text-xs">
            <span class="text-muted">资金划转对向流水</span>
            <UButton
              :label="detailTransferPartner.id + ' · ' + money(detailTransferPartner.amount)"
              color="neutral"
              variant="link"
              size="xs"
              :data-testid="'treasury-flow-detail-partner-' + detailTransferPartner.id"
              @click="openDetail(detailTransferPartner)"
            />
          </div>

          <div v-if="detailOriginal" class="flex items-center justify-between gap-2 rounded-sm border border-default px-3 py-2 text-xs" data-testid="treasury-flow-detail-original">
            <span class="text-muted">关联原单（被冲销）</span>
            <UButton
              :label="detailOriginal.id"
              color="neutral"
              variant="link"
              size="xs"
              @click="openDetail(detailOriginal)"
            />
          </div>
          <div v-if="detailReversal" class="flex items-center justify-between gap-2 rounded-sm border border-default px-3 py-2 text-xs" data-testid="treasury-flow-detail-reversal">
            <span class="text-muted">关联冲销流水</span>
            <UButton
              :label="detailReversal.id"
              color="neutral"
              variant="link"
              size="xs"
              @click="openDetail(detailReversal)"
            />
          </div>
        </div>
      </template>
      <template #footer>
        <div class="flex w-full items-center justify-end">
          <UButton
            label="关闭"
            color="neutral"
            variant="ghost"
            data-testid="treasury-flow-detail-close"
            @click="detailOpen = false"
          />
        </div>
      </template>
    </USlideover>

    <UModal v-model:open="excludeOpen" title="排除对账单行" description="排除后该行不参与未达金额计算，需填写排除原因">
      <template #body>
        <div class="space-y-3" data-testid="treasury-statement-exclude-form">
          <UAlert
            v-if="excludeError"
            color="error"
            variant="soft"
            icon="i-carbon-warning-alt"
            :title="excludeError"
            data-testid="treasury-statement-exclude-error"
          />
          <UFormField label="排除原因" required>
            <UTextarea
              v-model="excludeReason"
              :rows="3"
              class="w-full"
              placeholder="请说明排除原因"
              data-testid="treasury-statement-exclude-reason"
            />
          </UFormField>
        </div>
      </template>
      <template #footer>
        <div class="flex w-full items-center justify-end gap-2">
          <UButton
            label="取消"
            color="neutral"
            variant="ghost"
            @click="excludeOpen = false"
          />
          <UButton
            label="确认排除"
            color="error"
            :disabled="!canPost"
            data-testid="treasury-statement-exclude-confirm"
            @click="confirmExclude"
          />
        </div>
      </template>
    </UModal>

    <UModal v-model:open="undoOpen" title="撤销最近一次对账" description="仅可撤销最近一次已确认的对账记录，需填写撤销原因">
      <template #body>
        <div class="space-y-3" data-testid="treasury-recon-undo-form">
          <UAlert
            v-if="undoError"
            color="error"
            variant="soft"
            icon="i-carbon-warning-alt"
            :title="undoError"
            data-testid="treasury-recon-undo-error"
          />
          <UFormField label="撤销原因" required>
            <UTextarea
              v-model="undoReason"
              :rows="3"
              class="w-full"
              placeholder="请说明撤销原因"
              data-testid="treasury-recon-undo-reason"
            />
          </UFormField>
        </div>
      </template>
      <template #footer>
        <div class="flex w-full items-center justify-end gap-2">
          <UButton
            label="取消"
            color="neutral"
            variant="ghost"
            @click="undoOpen = false"
          />
          <UButton
            label="确认撤销"
            color="error"
            :disabled="!canPost"
            data-testid="treasury-recon-undo-confirm"
            @click="confirmUndo"
          />
        </div>
      </template>
    </UModal>

    <USlideover v-model:open="reportOpen" :ui="{ content: 'w-full sm:max-w-lg' }">
      <template #header>
        <div>
          <p class="text-sm font-semibold text-highlighted">
            银行对账报告预览
          </p>
          <p class="mt-0.5 text-xs text-muted">
            已确认对账记录的只读报告
          </p>
        </div>
      </template>
      <template #body>
        <div v-if="reportRecord" class="space-y-3" data-testid="treasury-recon-report-panel">
          <div class="flex items-center justify-between gap-2">
            <div>
              <p class="font-mono text-sm text-highlighted">
                {{ reportRecord.id }}
              </p>
              <p class="mt-0.5 text-xs text-muted">
                {{ store.accountName(reportRecord.accountId) }} · 截止 {{ reportRecord.cutoff }}
              </p>
            </div>
            <UBadge
              :label="treasuryReconciliationStatusLabels[reportRecord.status]"
              :color="treasuryReconciliationStatusColors[reportRecord.status]"
              variant="subtle"
              size="sm"
            />
          </div>
          <dl class="space-y-2 rounded-sm border border-default p-3 text-sm">
            <div class="flex items-center justify-between">
              <dt class="text-muted">
                银行期末余额
              </dt>
              <dd class="tabular-nums text-highlighted">
                {{ money(reportRecord.bankBalance) }}
              </dd>
            </div>
            <div class="flex items-center justify-between">
              <dt class="text-muted">
                账面余额
              </dt>
              <dd class="tabular-nums text-highlighted">
                {{ money(reportRecord.bookBalance) }}
              </dd>
            </div>
            <div class="flex items-center justify-between">
              <dt class="text-muted">
                未达金额
              </dt>
              <dd class="tabular-nums text-highlighted">
                {{ signedMoney(reportRecord.outstanding) }}
              </dd>
            </div>
            <div class="flex items-center justify-between border-t border-default pt-2">
              <dt class="text-muted">
                差异
              </dt>
              <dd class="tabular-nums font-semibold" :class="Math.abs(reportRecord.difference) < 0.005 ? 'text-success' : 'text-error'">
                {{ signedMoney(reportRecord.difference) }}
              </dd>
            </div>
          </dl>
          <dl class="grid grid-cols-2 gap-3 text-xs">
            <div>
              <dt class="text-muted">
                制单人
              </dt>
              <dd class="mt-0.5 text-highlighted">
                {{ reportRecord.maker }}
              </dd>
            </div>
            <div>
              <dt class="text-muted">
                复核人
              </dt>
              <dd class="mt-0.5 text-highlighted">
                {{ reportRecord.reviewer ?? '—' }}
              </dd>
            </div>
            <div>
              <dt class="text-muted">
                对账单条数
              </dt>
              <dd class="mt-0.5 text-highlighted">
                {{ reportRecord.statementCount }}
              </dd>
            </div>
            <div>
              <dt class="text-muted">
                已匹配条数
              </dt>
              <dd class="mt-0.5 text-highlighted">
                {{ reportRecord.matchedStatementCount }}
              </dd>
            </div>
            <div>
              <dt class="text-muted">
                确认时间
              </dt>
              <dd class="mt-0.5 text-highlighted">
                {{ reportRecord.completedAt ?? '—' }}
              </dd>
            </div>
            <div>
              <dt class="text-muted">
                备注
              </dt>
              <dd class="mt-0.5 text-highlighted">
                {{ reportRecord.undoReason ?? '—' }}
              </dd>
            </div>
          </dl>
        </div>
      </template>
      <template #footer>
        <div class="flex w-full items-center justify-end">
          <UButton
            label="关闭"
            color="neutral"
            variant="ghost"
            data-testid="treasury-recon-report-close"
            @click="reportOpen = false"
          />
        </div>
      </template>
    </USlideover>
  </div>
</template>

<script setup lang="ts">
import type { BankAccount, BankTransaction, JournalEntry } from '~/mocks'
import type { BankReconciliationRecord } from '~/stores/bankRecon'
import { bankAccountStatusLabels, bankImportPreview } from '~/mocks'

function money(value: string | number) {
  return formatMoney(Number(value))
}

const props = defineProps<{
  bankAccounts: BankAccount[]
  bankTransactions: BankTransaction[]
  journals: JournalEntry[]
  excludedIds: string[]
  reconciliations: BankReconciliationRecord[]
  canPost: boolean
}>()

const emit = defineEmits<{
  match: [transactionId: string, journalId: string]
  unmatch: [transactionId: string]
  exclude: [transactionId: string]
  include: [transactionId: string]
  import: [rows: BankTransaction[]]
  reconcile: [accountId: string]
  undo: [recordId: string, reason: string]
}>()

type TxStatus = 'matched' | 'excluded' | 'pending'

const statusLabels: Record<TxStatus, string> = { matched: '已匹配', excluded: '已排除', pending: '待匹配' }
const statusColors: Record<TxStatus, 'success' | 'neutral' | 'warning'> = { matched: 'success', excluded: 'neutral', pending: 'warning' }

const selectedAccountId = ref(props.bankAccounts[0]?.id ?? '')
const matchOpen = ref(false)
const matchTxId = ref('')
const matchJournalId = ref('')
const importOpen = ref(false)
const { loading: importing, run: runImport } = useMockAsync(async () => undefined, { delay: 650 })
const { loading: matching, run: runMatch } = useMockAsync(async () => undefined, { delay: 550 })

const selectedAccount = computed(() => props.bankAccounts.find(account => account.id === selectedAccountId.value) ?? null)

const rows = computed(() =>
  props.bankTransactions
    .filter(transaction => transaction.bankAccountId === selectedAccountId.value)
    .map((transaction) => {
      const excluded = props.excludedIds.includes(transaction.id)
      const status: TxStatus = transaction.matched ? 'matched' : excluded ? 'excluded' : 'pending'
      return { ...transaction, status }
    })
)

const pendingCount = computed(() => rows.value.filter(row => row.status === 'pending').length)
const matchedCount = computed(() => rows.value.filter(row => row.status === 'matched').length)
const accountRecords = computed(() => props.reconciliations
  .filter(record => record.accountId === selectedAccountId.value)
  .slice()
  .reverse())
const latestCompleted = computed(() => accountRecords.value.find(record => record.status === 'completed') ?? null)
const reconciled = computed(() => latestCompleted.value !== null)

const undoOpen = ref(false)
const undoRecordId = ref('')
const undoReason = ref('')
const undoError = ref('')
const undoRecord = computed(() => props.reconciliations.find(record => record.id === undoRecordId.value) ?? null)

const matchTransaction = computed(() => props.bankTransactions.find(transaction => transaction.id === matchTxId.value) ?? null)

const journalOptions = computed(() =>
  props.journals
    .filter(journal => journal.status === 'posted')
    .map(journal => ({
      label: journal.id + ' · ' + journal.description + ' · ' + money(journal.debitTotal),
      value: journal.id
    }))
)

function isReconciled(accountId: string) {
  return props.reconciliations.some(record => record.accountId === accountId && record.status === 'completed')
}

function openMatch(transactionId: string) {
  matchTxId.value = transactionId
  matchJournalId.value = journalOptions.value[0]?.value ?? ''
  matchOpen.value = true
}

async function confirmMatch() {
  if (!matchJournalId.value) return
  await runMatch()
  emit('match', matchTxId.value, matchJournalId.value)
  matchOpen.value = false
}

async function confirmImport() {
  await runImport()
  emit('import', bankImportPreview.map(row => ({ ...row })))
  importOpen.value = false
}

function reconcileAccount() {
  if (!selectedAccount.value) return
  emit('reconcile', selectedAccount.value.id)
}

function openUndo(record: BankReconciliationRecord) {
  undoRecordId.value = record.id
  undoReason.value = ''
  undoError.value = ''
  undoOpen.value = true
}

function confirmUndo() {
  if (!undoRecord.value) return
  if (!undoReason.value.trim()) {
    undoError.value = '请填写撤销原因。'
    return
  }
  emit('undo', undoRecord.value.id, undoReason.value.trim())
  undoOpen.value = false
}

function signedAmount(transaction: BankTransaction) {
  return (transaction.direction === 'in' ? '+' : '-') + money(transaction.amount)
}
</script>

<template>
  <div class="space-y-4" data-testid="bank-panel">
    <div class="grid gap-3 lg:grid-cols-3" data-testid="bank-accounts">
      <button
        v-for="account in bankAccounts"
        :key="account.id"
        type="button"
        class="rounded-sm border bg-default p-3 text-left transition hover:border-primary"
        :class="account.id === selectedAccountId ? 'border-primary ring-1 ring-primary/30' : 'border-default'"
        data-testid="bank-account-card"
        @click="selectedAccountId = account.id"
      >
        <div class="flex items-start justify-between gap-2">
          <div class="min-w-0">
            <p class="truncate text-[13px] font-semibold text-highlighted">
              {{ account.bankName }}
            </p>
            <p class="mt-0.5 truncate text-xs text-muted">
              {{ account.accountName }} · {{ account.accountNo }}
            </p>
          </div>
          <UBadge
            :label="isReconciled(account.id) ? '对账完成' : bankAccountStatusLabels[account.status]"
            :color="isReconciled(account.id) ? 'success' : account.status === 'active' ? 'info' : 'neutral'"
            variant="subtle"
            size="sm"
            data-testid="bank-status"
          />
        </div>
        <p class="mt-3 text-right text-base font-semibold tabular-nums text-highlighted">
          {{ money(account.balance) }}
        </p>
        <p class="mt-0.5 text-right text-[11px] text-muted">
          更新于 {{ account.updatedAt }}
        </p>
      </button>
    </div>

    <UCard class="nx-reveal rounded-sm" :ui="{ body: 'p-0 sm:p-0' }" data-testid="bank-table">
      <template #header>
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 class="text-sm font-semibold text-highlighted">
              银行流水对账
            </h2>
            <p class="mt-0.5 text-xs text-muted">
              {{ selectedAccount?.bankName ?? '—' }} · 待匹配 {{ pendingCount }} 笔 · 已匹配 {{ matchedCount }} 笔
            </p>
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <UButton
              label="导入流水"
              icon="i-carbon-upload"
              color="neutral"
              variant="outline"
              size="sm"
              :disabled="!canPost"
              data-testid="bank-import"
              @click="importOpen = true"
            />
            <UTooltip :text="!canPost ? '当前演示身份没有 finance.post 权限' : pendingCount > 0 ? '仍有 ' + pendingCount + ' 笔流水待处理' : '可再次完成对账，保留历史记录'">
              <UButton
                :label="reconciled ? '再次完成对账' : '完成对账'"
                icon="i-carbon-checkmark"
                size="sm"
                :disabled="!canPost || pendingCount > 0"
                data-testid="bank-reconcile"
                @click="reconcileAccount"
              />
            </UTooltip>
          </div>
        </div>
      </template>

      <div class="grid grid-cols-[5.5rem_minmax(0,1fr)_7rem_8.5rem_5.5rem_8rem] items-center gap-2 border-b border-default bg-elevated/40 px-3 py-2 text-xs font-medium text-muted">
        <span>日期</span>
        <span>摘要 / 对方户名</span>
        <span class="text-right">金额</span>
        <span class="text-right">对方户名</span>
        <span>状态</span>
        <span class="text-right">操作</span>
      </div>

      <div v-if="rows.length === 0" class="py-6" data-testid="bank-empty">
        <UEmpty
          variant="naked"
          icon="i-carbon-wallet"
          title="该账户暂无流水"
          description="可以导入示例流水，或切换到其他银行账户查看。"
        />
      </div>

      <div
        v-for="row in rows"
        :key="row.id"
        class="grid grid-cols-[5.5rem_minmax(0,1fr)_8.5rem_8rem_5.5rem_8rem] items-center gap-2 border-b border-default/60 px-3 py-2 last:border-b-0"
        data-testid="bank-tx-row"
      >
        <span class="text-xs tabular-nums text-muted">{{ row.date }}</span>
        <span class="min-w-0">
          <span class="block truncate text-[13px] text-highlighted">{{ row.description }}</span>
          <span class="block truncate text-[11px] text-muted">{{ row.counterparty }}</span>
        </span>
        <span
          class="text-right text-[13px] tabular-nums"
          :class="row.direction === 'in' ? 'text-success' : 'text-highlighted'"
        >{{ signedAmount(row) }}</span>
        <span class="truncate text-right text-xs text-muted">{{ row.matchedJournalId ?? '—' }}</span>
        <span>
          <UBadge
            :label="statusLabels[row.status]"
            :color="statusColors[row.status]"
            variant="subtle"
            size="sm"
          />
        </span>
        <div class="flex justify-end gap-1">
          <UButton
            v-if="row.status === 'pending'"
            label="匹配"
            size="xs"
            variant="ghost"
            :disabled="!canPost"
            data-testid="bank-match"
            @click="openMatch(row.id)"
          />
          <UButton
            v-if="row.matched"
            label="解除匹配"
            size="xs"
            color="warning"
            variant="ghost"
            :disabled="!canPost"
            data-testid="bank-unmatch"
            @click="emit('unmatch', row.id)"
          />
          <UButton
            v-if="row.status !== 'excluded' && !row.matched"
            label="排除"
            size="xs"
            color="neutral"
            variant="ghost"
            :disabled="!canPost"
            data-testid="bank-exclude"
            @click="emit('exclude', row.id)"
          />
          <UButton
            v-if="row.status === 'excluded'"
            label="恢复"
            size="xs"
            color="neutral"
            variant="ghost"
            :disabled="!canPost"
            data-testid="bank-include"
            @click="emit('include', row.id)"
          />
        </div>
      </div>

      <div class="border-t border-default px-3 py-2 text-xs text-muted">
        完成对账后账户标记为「对账完成」；可再次完成对账，撤销仅限最近一次已完成记录。
      </div>

      <div v-if="accountRecords.length" class="border-t border-default px-3 py-3" data-testid="bank-recon-records">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p class="text-sm font-semibold text-highlighted">
              对账记录
            </p>
            <p class="mt-0.5 text-xs text-muted">
              {{ selectedAccount?.bankName ?? '—' }} · 共 {{ accountRecords.length }} 次
            </p>
          </div>
          <UButton
            v-if="latestCompleted"
            label="撤销最近对账"
            icon="i-carbon-undo"
            color="warning"
            variant="outline"
            size="xs"
            :disabled="!canPost"
            data-testid="bank-undo-open"
            @click="openUndo(latestCompleted)"
          />
        </div>
        <div class="mt-3 space-y-2">
          <div
            v-for="record in accountRecords"
            :key="record.id"
            class="rounded-sm border border-default px-3 py-2 text-xs"
            :data-testid="'bank-recon-record-' + record.id"
          >
            <div class="flex flex-wrap items-center justify-between gap-2">
              <p class="font-medium text-highlighted">
                第 {{ record.sequence }} 次 · {{ record.completedAt }}
              </p>
              <UBadge
                :label="record.status === 'voided' ? '已撤销' : '已完成'"
                :color="record.status === 'voided' ? 'warning' : 'success'"
                variant="soft"
                size="sm"
              />
            </div>
            <p v-if="record.status === 'voided'" class="mt-1 text-muted" :data-testid="'bank-recon-void-' + record.id">
              撤销于 {{ record.voidedAt }} · {{ record.voidReason }}
            </p>
            <p v-else class="mt-1 text-muted">
              核对 {{ record.matchedCount }} 笔已匹配流水 · 操作人 {{ record.completedBy }}
            </p>
          </div>
        </div>
      </div>
    </UCard>

    <USlideover v-model:open="matchOpen" :ui="{ content: 'w-full sm:max-w-lg' }" data-testid="bank-match-panel">
      <template #header>
        <div>
          <p class="text-xs text-muted">
            流水匹配
          </p>
          <h2 class="mt-1 text-base font-semibold text-highlighted">
            匹配到记账凭证
          </h2>
          <p class="mt-0.5 text-xs text-muted">
            {{ matchTransaction?.description ?? '—' }} · {{ matchTransaction ? signedAmount(matchTransaction) : '—' }}
          </p>
        </div>
      </template>
      <template #body>
        <div class="space-y-3">
          <UFormField label="候选凭证" required>
            <USelect
              v-model="matchJournalId"
              :items="journalOptions"
              placeholder="选择已过账凭证"
              class="w-full"
              data-testid="bank-match-journal"
            />
          </UFormField>
          <p v-if="journalOptions.length === 0" class="text-xs text-muted">
            当前没有已过账凭证可供匹配。
          </p>
          <UAlert
            color="info"
            variant="soft"
            icon="i-carbon-information"
            title="匹配后流水状态变为「已匹配」"
            description="仅更新本地演示数据，不会写入总账，刷新后恢复。"
          />
        </div>
      </template>
      <template #footer>
        <div class="flex w-full items-center justify-between gap-2">
          <UButton
            label="取消"
            color="neutral"
            variant="ghost"
            data-testid="bank-match-cancel"
            @click="matchOpen = false"
          />
          <UButton
            label="确认匹配"
            icon="i-carbon-link"
            :loading="matching"
            :disabled="!canPost || !matchJournalId"
            data-testid="bank-match-submit"
            @click="confirmMatch"
          />
        </div>
      </template>
    </USlideover>

    <USlideover v-model:open="importOpen" :ui="{ content: 'w-full sm:max-w-2xl' }" data-testid="bank-import-preview">
      <template #header>
        <div>
          <p class="text-xs text-muted">
            流水导入
          </p>
          <h2 class="mt-1 text-base font-semibold text-highlighted">
            导入预览
          </h2>
          <p class="mt-0.5 text-xs text-muted">
            共 {{ bankImportPreview.length }} 笔待导入流水，确认后加入本地演示数据。
          </p>
        </div>
      </template>
      <template #body>
        <div class="space-y-2">
          <div
            v-for="row in bankImportPreview"
            :key="row.id"
            class="flex items-center justify-between gap-3 rounded-sm border border-default px-3 py-2"
            data-testid="bank-import-row"
          >
            <div class="min-w-0">
              <p class="truncate text-[13px] text-highlighted">
                {{ row.description }}
              </p>
              <p class="mt-0.5 truncate text-xs text-muted">
                {{ row.date }} · {{ row.counterparty }}
              </p>
            </div>
            <span class="whitespace-nowrap text-[13px] tabular-nums text-highlighted">{{ signedAmount(row) }}</span>
          </div>
          <UAlert
            color="warning"
            variant="soft"
            icon="i-carbon-warning-alt"
            title="导入仅用于本地演示"
            description="不会解析真实银行文件，也不会发起网络请求；刷新后恢复初始流水。"
          />
        </div>
      </template>
      <template #footer>
        <div class="flex w-full items-center justify-between gap-2">
          <UButton
            label="取消"
            color="neutral"
            variant="ghost"
            data-testid="bank-import-cancel"
            @click="importOpen = false"
          />
          <UButton
            label="确认导入"
            icon="i-carbon-download"
            :loading="importing"
            :disabled="!canPost"
            data-testid="bank-import-confirm"
            @click="confirmImport"
          />
        </div>
      </template>
    </USlideover>

    <USlideover v-model:open="undoOpen" :ui="{ content: 'w-full sm:max-w-lg' }" data-testid="bank-undo">
      <template #header>
        <div>
          <p class="text-xs text-muted">
            撤销对账
          </p>
          <h2 class="mt-1 text-base font-semibold text-highlighted">
            撤销最近一次已完成对账
          </h2>
          <p class="mt-0.5 text-xs text-muted">
            {{ selectedAccount?.bankName ?? '—' }} · 第 {{ undoRecord?.sequence ?? '—' }} 次
          </p>
        </div>
      </template>
      <template #body>
        <div v-if="undoRecord" class="space-y-3">
          <div class="rounded-sm border border-default p-3 text-xs">
            <p class="text-muted">
              对账记录
            </p>
            <p class="mt-0.5 font-medium text-highlighted">
              {{ undoRecord.id }} · {{ undoRecord.completedAt }}
            </p>
            <p class="mt-0.5 text-muted">
              核对 {{ undoRecord.matchedCount }} 笔已匹配流水
            </p>
          </div>
          <UAlert
            color="warning"
            variant="soft"
            icon="i-carbon-warning-alt"
            title="只能按时间倒序撤销"
            description="撤销后该账户回退到上一次已完成对账；若没有更早记录，则恢复为待对账，可重新完成对账。"
          />
          <UAlert
            v-if="undoError"
            color="error"
            variant="soft"
            icon="i-carbon-warning-alt"
            :title="undoError"
            data-testid="bank-undo-error"
          />
          <UFormField label="撤销原因" required>
            <UTextarea
              v-model="undoReason"
              :rows="3"
              class="w-full"
              placeholder="例如：遗漏两笔手续费流水"
              data-testid="bank-undo-reason"
            />
          </UFormField>
        </div>
      </template>
      <template #footer>
        <div class="flex w-full items-center justify-between gap-2">
          <UButton
            label="取消"
            color="neutral"
            variant="ghost"
            data-testid="bank-undo-cancel"
            @click="undoOpen = false"
          />
          <UButton
            label="确认撤销"
            icon="i-carbon-undo"
            color="warning"
            :disabled="!canPost"
            data-testid="bank-undo-submit"
            @click="confirmUndo"
          />
        </div>
      </template>
    </USlideover>
  </div>
</template>

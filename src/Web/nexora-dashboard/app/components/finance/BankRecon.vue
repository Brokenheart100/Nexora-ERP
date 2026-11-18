<script setup lang="ts">
import type { BankAccount, BankTransaction, JournalEntry } from '~/mocks'
import { bankAccountStatusLabels, bankImportPreview } from '~/mocks'

function money(value: string | number) {
  return formatMoney(Number(value))
}

const props = defineProps<{
  bankAccounts: BankAccount[]
  bankTransactions: BankTransaction[]
  journals: JournalEntry[]
  excludedIds: string[]
  reconciledAccountIds: string[]
  canPost: boolean
}>()

const emit = defineEmits<{
  match: [transactionId: string, journalId: string]
  exclude: [transactionId: string]
  include: [transactionId: string]
  import: [rows: BankTransaction[]]
  reconcile: [accountId: string]
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
const reconciled = computed(() => props.reconciledAccountIds.includes(selectedAccountId.value))

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
  return props.reconciledAccountIds.includes(accountId)
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
            <UTooltip :text="!canPost ? '当前演示身份没有 finance.post 权限' : pendingCount > 0 ? '仍有 ' + pendingCount + ' 笔流水待处理' : '完成本账户对账'">
              <UButton
                label="完成对账"
                icon="i-carbon-checkmark"
                size="sm"
                :disabled="!canPost || pendingCount > 0 || reconciled"
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
        完成对账后账户标记为「对账完成」；所有状态变化仅保存在当前页面。
      </div>
    </UCard>

    <USlideover v-model:open="matchOpen" :ui="{ content: 'w-full sm:max-w-lg' }" data-testid="bank-match">
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
  </div>
</template>

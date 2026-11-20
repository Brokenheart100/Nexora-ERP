<script setup lang="ts">
import type {
  AgingBucket,
  BankTransaction,
  FinanceAccount,
  FinancePeriod,
  JournalEntry,
  PartnerLedgerEntry,
  TaxFiling,
  TaxPeriod
} from '~/mocks'
import {
  agingBuckets,
  financeAccounts,
  financePeriods,
  financePeriodStatusColors,
  financePeriodStatusLabels,
  financeTrend,
  journalEntries,
  partnerLedgers,
  reportRows,
  taxFilings,
  taxGroups,
  taxPeriods,
  taxRates
} from '~/mocks'
import FinanceSupplierPayables from '~/components/finance/SupplierPayables.vue'
import FinanceOpening from '~/components/finance/Opening.vue'
import FinanceImportedJournals from '~/components/finance/ImportedJournals.vue'
import FinanceDonations from '~/components/finance/Donations.vue'
import FinanceTradeDocuments from '~/components/finance/TradeDocuments.vue'
import FinanceTreasury from '~/components/finance/Treasury.vue'
import FinanceClosing from '~/components/finance/Closing.vue'
import FinanceTaxCenter from '~/components/finance/TaxCenter.vue'

type FinanceTab = 'workbench' | 'accounts' | 'journals' | 'imported' | 'reports' | 'reporting' | 'aging' | 'payables' | 'documents' | 'donations' | 'opening' | 'bank' | 'treasury' | 'closing' | 'tax-center'

const toast = useToast()
const route = useRoute()
const { isLoading: stateLoading, isEmpty, isError, isForbidden } = useMockState()
const permissions = useMockPermissions()
const receivables = useReceivablesStore()
const bankRecon = useBankReconStore()
const externalJournals = useExternalJournalsStore()
const donations = useDonationsStore()
const tradeDocs = useTradeDocumentsStore()
const { workspace } = useMockWorkspace()

const activeTab = ref<FinanceTab>('workbench')
const accounts = ref<FinanceAccount[]>([])
const journals = ref<JournalEntry[]>([])
const ledgerJournals = computed<JournalEntry[]>(() => [...externalJournals.postedJournals, ...journals.value])
const periods = ref<FinancePeriod[]>([])
const taxPeriodList = ref<TaxPeriod[]>([])
const filings = ref<TaxFiling[]>([])
const bankAccountList = computed(() => bankRecon.accounts)
const bankTxList = computed(() => bankRecon.transactions)
const agingRows = ref<AgingBucket[]>([])
const ledgerRows = ref<PartnerLedgerEntry[]>([])
const excludedBankIds = computed(() => bankRecon.excludedIds)
const booksReady = ref(true)

const receivableBuckets = computed(() => receivables.agingBucketsFor(workspace.value.id))
const receivableOpenInvoices = computed(() => receivables.openInvoiceRowsFor(workspace.value.id))
const canView = computed(() => permissions.can('finance.view'))
const canPost = computed(() => permissions.can('finance.post'))

const tabItems = [
  { label: '财务工作台', value: 'workbench' },
  { label: '科目表', value: 'accounts' },
  { label: '凭证', value: 'journals' },
  { label: '外部凭证', value: 'imported' },
  { label: '报表', value: 'reports' },
  { label: '报表中心', value: 'reporting' },
  { label: '账龄与税务', value: 'aging' },
  { label: '采购应付', value: 'payables' },
  { label: '单据流转', value: 'documents' },
  { label: '捐赠管理', value: 'donations' },
  { label: '期初导入', value: 'opening' },
  { label: '银行对账', value: 'bank' },
  { label: '资金管理', value: 'treasury' },
  { label: '关账与年结', value: 'closing' },
  { label: '税务中心', value: 'tax-center' }
]

function normalizeTab(value: unknown): FinanceTab {
  const raw = typeof value === 'string' ? value : ''
  if (raw === 'tax') return 'aging'
  return tabItems.some(item => item.value === raw) ? raw as FinanceTab : 'workbench'
}

activeTab.value = normalizeTab(route.query.tab)
const initialBillId = computed(() => (typeof route.query.bill === 'string' ? route.query.bill : undefined))

watch(() => route.query.tab, (value) => {
  if (value) activeTab.value = normalizeTab(value)
})

const { loading, run: loadFinance } = useMockAsync(async () => {
  accounts.value = structuredClone(financeAccounts)
  journals.value = structuredClone(journalEntries)
  periods.value = structuredClone(financePeriods)
  taxPeriodList.value = structuredClone(taxPeriods)
  filings.value = structuredClone(taxFilings)
  agingRows.value = structuredClone(agingBuckets)
  ledgerRows.value = structuredClone(partnerLedgers)
  booksReady.value = true
}, { delay: 480, immediate: true })

const { loading: refreshing, run: runRefresh } = useMockRefresh()

// 与财务工作台保持一致：优先显示最近一个尚未关账的期间。
const currentPeriod = computed(() => periods.value.find(period => period.status !== 'closed') ?? periods.value[0] ?? null)
const currentPeriodLabel = computed(() => currentPeriod.value?.period ?? '—')
const currentPeriodStatusLabel = computed(() => (currentPeriod.value ? financePeriodStatusLabels[currentPeriod.value.status] : '未建账'))
const currentPeriodStatusColor = computed(() => (currentPeriod.value ? financePeriodStatusColors[currentPeriod.value.status] : 'neutral'))

const showSkeleton = computed(() => loading.value || stateLoading.value)

function notify(title: string, description: string, color: 'success' | 'neutral' | 'warning' | 'error' = 'success', icon = 'i-carbon-checkmark') {
  toast.add({ title, description, color, icon })
}

function reloadPage() {
  return navigateTo({ path: route.path, query: {} })
}

async function refreshPage() {
  await runRefresh(() => loadFinance())
  bankRecon.reset()
  externalJournals.reset()
  donations.reset()
  tradeDocs.reset()
  notify('财务数据已刷新', '已恢复为初始演示数据，之前在本页做的修改已丢弃。', 'success', 'i-carbon-renew')
}

function handleNavigate(tab: string) {
  const normalized = tab === 'tax' ? 'aging' : tab
  const target = tabItems.find(item => item.value === normalized)
  if (target) activeTab.value = target.value as FinanceTab
}

function handleTogglePeriod(period: FinancePeriod, closed: boolean, passed: number, total: number) {
  periods.value = periods.value.map(item => (item.id === period.id
    ? {
        ...item,
        status: (closed ? 'closed' : 'open') as FinancePeriod['status'],
        closedAt: closed ? '2026-11-18 18:00' : undefined
      }
    : item))
  if (closed && passed < total) {
    notify('期间已关闭，但检查项未全部通过', period.period + ' 关账检查仅通过 ' + passed + '/' + total + ' 项；仅本次预览，刷新后恢复。', 'warning', 'i-carbon-warning-alt')
  } else if (closed) {
    notify('会计期间已关账', period.period + ' 已标记为已关账；仅本次预览，刷新后恢复。')
  } else {
    notify('会计期间已重新打开', period.period + ' 已回到未关账状态；仅本次预览，刷新后恢复。')
  }
}

function handleSetupBooks() {
  booksReady.value = true
  notify('建账完成（本地演示）', '已生成本地演示初始化状态；仅本次预览，刷新后恢复。')
}

function handleCompleteYearEnd() {
  periods.value = periods.value.map(item => ({ ...item, status: 'closed' as const, closedAt: item.closedAt ?? '2026-11-18 18:00' }))
  notify('年结完成（本地演示）', '12 个会计期间已全部标记为已关账；仅本次预览，刷新后恢复。', 'success', 'i-carbon-checkmark')
}

function handleCreateAccount(account: FinanceAccount) {
  accounts.value = [...accounts.value, account]
  notify('科目已新增', account.code + ' ' + account.name + ' 已加入本地科目表；仅本次预览，刷新后恢复。')
}

function handleUpdateAccount(account: FinanceAccount) {
  accounts.value = accounts.value.map(item => (item.id === account.id ? account : item))
  notify('科目已更新', account.code + ' ' + account.name + ' 已更新；仅本次预览，刷新后恢复。')
}

function handleCreateJournal(entry: JournalEntry) {
  journals.value = [entry, ...journals.value]
  notify(entry.status === 'draft' ? '凭证已保存为草稿' : '凭证已提交审批', entry.id + ' ' + entry.description + '；仅本次预览，刷新后恢复。')
}

function handlePostJournal(id: string) {
  const target = journals.value.find(entry => entry.id === id)
  if (!target || target.status !== 'draft') return
  journals.value = journals.value.map(entry => (entry.id === id ? { ...entry, status: 'posted' as const } : entry))
  notify('凭证已提交审批', id + ' 状态已更新为已过账；仅本次预览，刷新后恢复。')
}

function handleFileTax(id: string) {
  filings.value = filings.value.map(filing => (filing.id === id ? { ...filing, status: 'filed' as const, filedAt: '2026-11-18 18:00' } : filing))
  const target = filings.value.find(filing => filing.id === id)
  notify('申报已提交（本地演示）', (target ? target.period + ' ' : '') + '申报状态已更新为已申报；仅本次预览，刷新后恢复。')
}

function handleMatchTransaction(transactionId: string, journalId: string) {
  const result = bankRecon.match(transactionId, journalId)
  notify(result.ok ? '流水已匹配' : '流水未匹配', result.message, result.ok ? 'success' : 'warning', result.ok ? 'i-carbon-checkmark' : 'i-carbon-warning-alt')
}

function handleUnmatchTransaction(transactionId: string) {
  const result = bankRecon.unmatch(transactionId)
  notify(result.ok ? '已解除匹配' : '未解除匹配', result.message, result.ok ? 'neutral' : 'warning', result.ok ? 'i-carbon-unlink' : 'i-carbon-warning-alt')
}

function handleExcludeTransaction(transactionId: string) {
  const result = bankRecon.exclude(transactionId)
  notify(result.ok ? '流水已排除' : '流水未排除', result.message, result.ok ? 'neutral' : 'warning', result.ok ? 'i-carbon-subtract' : 'i-carbon-warning-alt')
}

function handleIncludeTransaction(transactionId: string) {
  const result = bankRecon.include(transactionId)
  notify(result.ok ? '流水已恢复' : '流水未恢复', result.message, result.ok ? 'neutral' : 'warning', result.ok ? 'i-carbon-add' : 'i-carbon-warning-alt')
}

function handleImportTransactions(rows: BankTransaction[]) {
  const result = bankRecon.importRows(rows)
  notify(result.ok ? '流水导入完成（本地演示）' : '流水未导入', result.message, result.ok ? 'success' : 'warning', result.ok ? 'i-carbon-checkmark' : 'i-carbon-warning-alt')
}

function handleReconcileAccount(accountId: string) {
  const result = bankRecon.completeReconciliation(accountId)
  notify(result.ok ? '对账已完成' : '对账未完成', result.message, result.ok ? 'success' : 'warning', result.ok ? 'i-carbon-checkmark' : 'i-carbon-warning-alt')
}

function handleUndoReconciliation(recordId: string, reason: string) {
  const result = bankRecon.undoReconciliation(recordId, reason)
  notify(result.ok ? '对账已撤销' : '对账未撤销', result.message, result.ok ? 'warning' : 'error', result.ok ? 'i-carbon-undo' : 'i-carbon-warning-alt')
}

function handleExportAging() {
  downloadCsv('aging-report.csv', ['账龄区间', '应收金额', '应付金额'], agingRows.value.map(row => [row.bucket, row.receivable, row.payable]))
  notify('账龄表已导出', '已生成 aging-report.csv 本地下载，不请求后端。', 'neutral', 'i-carbon-download')
}
</script>

<template>
  <div class="contents">
    <UDashboardPanel id="finance">
      <template #header>
        <UDashboardNavbar title="财务">
          <template #leading>
            <UDashboardSidebarCollapse />
          </template>
          <template #right>
            <UBadge
              label="本地原型"
              color="neutral"
              variant="subtle"
              size="sm"
            />
            <NotificationButton />
            <UButton
              icon="i-carbon-renew"
              color="neutral"
              variant="ghost"
              size="sm"
              aria-label="刷新财务数据"
              :loading="refreshing"
              data-testid="finance-refresh"
              @click="refreshPage"
            />
          </template>
        </UDashboardNavbar>

        <UDashboardToolbar :ui="{ root: 'flex-wrap gap-3 py-2.5' }">
          <template #left>
            <UTabs
              v-model="activeTab"
              :items="tabItems"
              :content="false"
              size="sm"
              data-testid="finance-tabs"
            />
          </template>
          <template #right>
            <div class="flex items-center gap-2 text-xs">
              <span class="text-muted">当前期间</span>
              <UBadge
                :label="currentPeriodLabel + ' · ' + currentPeriodStatusLabel"
                :color="currentPeriodStatusColor"
                variant="subtle"
                size="sm"
                data-testid="finance-current-period"
              />
              <UButton
                label="导出账龄表"
                icon="i-carbon-download"
                color="neutral"
                variant="ghost"
                size="xs"
                data-testid="finance-export-aging"
                @click="handleExportAging"
              />
            </div>
          </template>
        </UDashboardToolbar>
      </template>

      <template #body>
        <AppBreadcrumb current="财务" class="mb-3" />

        <UCard
          v-if="showSkeleton"
          class="rounded-sm"
          :ui="{ body: 'p-0 sm:p-0' }"
          data-testid="finance-skeleton"
        >
          <div class="space-y-2 p-4">
            <USkeleton v-for="n in 8" :key="n" class="h-9 w-full" />
          </div>
        </UCard>

        <UAlert
          v-else-if="isError"
          color="error"
          variant="soft"
          icon="i-carbon-warning-alt"
          title="财务数据加载失败"
          description="模拟加载失败，请重试。清除 ?state=error 后可恢复正常演示数据。"
          :actions="[{ label: '恢复正常', color: 'neutral', variant: 'outline', size: 'sm', onClick: reloadPage }]"
          data-testid="finance-error"
        />

        <UEmpty
          v-else-if="isForbidden || !canView"
          variant="naked"
          icon="i-carbon-view-off"
          title="没有访问权限"
          description="当前演示身份缺少 finance.view 权限，无法查看财务模块。可切换演示身份，或恢复正常演示数据。"
          :actions="[{ label: '恢复正常', color: 'neutral', variant: 'outline', size: 'sm', onClick: reloadPage }]"
          data-testid="finance-forbidden"
        />

        <UEmpty
          v-else-if="isEmpty"
          variant="naked"
          icon="i-carbon-finance"
          title="暂无财务数据"
          description="演示数据为空。清除 ?state=empty 后可查看完整的建账、凭证、报表与对账示例。"
          :actions="[{ label: '恢复正常', color: 'neutral', variant: 'outline', size: 'sm', onClick: reloadPage }]"
          data-testid="finance-empty"
        />

        <div v-else :key="'finance-' + activeTab" class="nx-fade">
          <FinanceWorkbench
            v-if="activeTab === 'workbench'"
            :accounts="accounts"
            :journals="journals"
            :periods="periods"
            :tax-filings="filings"
            :bank-transactions="bankTxList"
            :aging="agingRows"
            :books-ready="booksReady"
            @navigate="handleNavigate"
            @toggle-period="handleTogglePeriod"
            @setup="handleSetupBooks"
            @complete-year-end="handleCompleteYearEnd"
          />

          <FinanceAccountTree
            v-else-if="activeTab === 'accounts'"
            :accounts="accounts"
            :can-edit="canPost"
            @create="handleCreateAccount"
            @update="handleUpdateAccount"
          />

          <FinanceJournalPanel
            v-else-if="activeTab === 'journals'"
            :journals="ledgerJournals"
            :accounts="accounts"
            :can-post="canPost"
            @create="handleCreateJournal"
            @post="handlePostJournal"
          />

          <FinanceImportedJournals v-else-if="activeTab === 'imported'" :accounts="accounts" />

          <FinanceReports
            v-else-if="activeTab === 'reports'"
            :report-rows="reportRows"
            :trend="financeTrend"
            :can-export="canPost"
          />

          <div v-else-if="activeTab === 'aging'" class="space-y-4">
            <FinanceAgingLedger
              :aging="agingRows"
              :receivable-buckets="receivableBuckets"
              :receivable-open-invoices="receivableOpenInvoices"
              :partner-ledgers="ledgerRows"
            />
            <FinanceTax
              :tax-periods="taxPeriodList"
              :tax-filings="filings"
              :tax-rates="taxRates"
              :tax-groups="taxGroups"
              :can-post="canPost"
              @file="handleFileTax"
            />
          </div>

          <FinanceSupplierPayables
            v-else-if="activeTab === 'payables'"
            :can-post="canPost"
            :initial-bill-id="initialBillId"
          />

          <FinanceTradeDocuments v-else-if="activeTab === 'documents'" :can-post="canPost" />

          <FinanceDonations v-else-if="activeTab === 'donations'" />

          <FinanceOpening v-else-if="activeTab === 'opening'" :can-post="canPost" />

          <FinanceBankRecon
            v-else-if="activeTab === 'bank'"
            :bank-accounts="bankAccountList"
            :bank-transactions="bankTxList"
            :journals="journals"
            :excluded-ids="excludedBankIds"
            :reconciliations="bankRecon.reconciliations"
            :can-post="canPost"
            @match="handleMatchTransaction"
            @unmatch="handleUnmatchTransaction"
            @exclude="handleExcludeTransaction"
            @include="handleIncludeTransaction"
            @import="handleImportTransactions"
            @reconcile="handleReconcileAccount"
            @undo="handleUndoReconciliation"
          />

          <FinanceTreasury v-else-if="activeTab === 'treasury'" :can-post="canPost" />

          <FinanceClosing
            v-else-if="activeTab === 'closing'"
            :accounts="accounts"
            :periods="periods"
            :journals="journals"
            :can-post="canPost"
          />

          <FinanceTaxCenter v-else-if="activeTab === 'tax-center'" />

          <FinanceReportingCenter v-else-if="activeTab === 'reporting'" />
        </div>
      </template>
    </UDashboardPanel>
  </div>
</template>

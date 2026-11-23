<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type {
  OpeningBalanceRow,
  OpeningResultRecord,
  OpeningSubledgerBatch,
  OpeningSubledgerSource
} from '~/mocks'
import {
  openingBalanceFileOptions,
  openingImportActors,
  openingSubledgerKindLabels,
  openingSubledgerStatusColors,
  openingSubledgerStatusLabels
} from '~/mocks'

import type { AccountingBookConnection } from '~/composables/finance/useAccountingBook'

const props = defineProps<{ canPost: boolean, live?: AccountingBookConnection }>()

const toast = useToast()
const { activeWorkspaceId } = useMockWorkspace()
const store = useOpeningBalancesStore()
const workspaceId = computed(() => activeWorkspaceId.value)

const glFileKey = ref<'standard' | 'issues'>('standard')
const glPreview = computed(() => store.glPreview)
const importRows = computed(() => store.imports.filter(record => record.workspaceId === workspaceId.value))
const batchRows = computed(() => store.batches.filter(batch => batch.workspaceId === workspaceId.value))
const subledger = computed(() => store.subledgerPreview)

const identityId = ref('u-1001')
const identity = computed(() => openingImportActors.find(actor => actor.id === identityId.value) ?? openingImportActors[0]!)
const isMakerIdentity = computed(() => identity.value.id === 'u-1001')

function notify(title: string, description: string, color: 'success' | 'neutral' | 'warning' | 'error' = 'success', icon = 'i-carbon-checkmark') {
  toast.add({ title, description, color, icon })
}

function previewGl() {
  const result = store.previewOpening(glFileKey.value)
  notify('期初文件已解析', result.message, 'success', 'i-carbon-document')
}

function importGl() {
  const result = store.importOpening(glFileKey.value, workspaceId.value, identity.value.name)
  if (!result.ok) {
    notify('无法导入总账期初', result.message, 'error', 'i-carbon-warning-alt')
    return
  }
  notify('总账期初已导入', result.message, 'success', 'i-carbon-checkmark')
}

function signedMoney(value: number) {
  return (value > 0 ? '+' : '') + formatMoney(value)
}

const glColumns: TableColumn<OpeningBalanceRow>[] = [
  { accessorKey: 'row', header: '行' },
  { accessorKey: 'accountCode', header: '科目编码' },
  { accessorKey: 'accountName', header: '科目名称' },
  { accessorKey: 'debit', header: '借方' },
  { accessorKey: 'credit', header: '贷方' }
]

const sourceColumns: TableColumn<OpeningSubledgerSource>[] = [
  { accessorKey: 'kind', header: '类别' },
  { accessorKey: 'label', header: '子账对象' },
  { accessorKey: 'reference', header: '文件行' },
  { accessorKey: 'amount', header: '子账金额' },
  { accessorKey: 'ledgerAmount', header: '总账金额' },
  { accessorKey: 'difference', header: '差异' },
  { id: 'sample', header: '来源单据' }
]

const recordKindLabels: Record<OpeningResultRecord['kind'], string> = {
  journal: '记账凭证',
  stock: '库存流水',
  receivable: '应收单据',
  payable: '应付单据',
  bank: '银行流水'
}

const recordKindColors: Record<OpeningResultRecord['kind'], 'primary' | 'info' | 'success' | 'warning' | 'neutral'> = {
  journal: 'primary',
  stock: 'info',
  receivable: 'success',
  payable: 'warning',
  bank: 'neutral'
}

const recordColumns: TableColumn<OpeningResultRecord>[] = [
  { accessorKey: 'kind', header: '类型' },
  { accessorKey: 'docNo', header: '记录编号' },
  { accessorKey: 'amount', header: '金额' },
  { accessorKey: 'sourceLabel', header: '来源行' },
  { id: 'actions', header: '操作' }
]

const batchColumns: TableColumn<OpeningSubledgerBatch>[] = [
  { accessorKey: 'id', header: '批次' },
  { id: 'state', header: '状态' },
  { id: 'maker', header: '制单人 / 复核人' },
  { id: 'difference', header: '子账差异' },
  { accessorKey: 'submittedAt', header: '提交时间' },
  { id: 'actions', header: '操作' }
]

function batchDifference(batch: OpeningSubledgerBatch) {
  return batch.sources.reduce((sum, source) => sum + source.amount - source.ledgerAmount, 0)
}

function batchPassed(batch: OpeningSubledgerBatch) {
  return batch.checks.filter(check => check.matched).length
}

const selectedBatchId = ref('')
const detailOpen = ref(false)
const selectedBatch = computed(() => store.batches.find(batch => batch.id === selectedBatchId.value))
const reviewNote = ref('')
const actionError = ref('')
const rejectOpen = ref(false)
const rejectNote = ref('')
const rejectError = ref('')

const recordOpen = ref(false)
const selectedRecordId = ref('')
const resultRecords = computed(() => selectedBatch.value?.result?.records ?? [])
const selectedRecord = computed(() => resultRecords.value.find(record => record.id === selectedRecordId.value))
const selectedRecordSource = computed(() => selectedBatch.value?.sources.find(source => source.id === selectedRecord.value?.sourceId))

function recordCount(kind: OpeningResultRecord['kind']) {
  return resultRecords.value.filter(record => record.kind === kind).length
}

function openRecord(recordId: string) {
  selectedRecordId.value = recordId
  recordOpen.value = true
}

function backToBatch() {
  recordOpen.value = false
}

watch(selectedBatchId, () => {
  reviewNote.value = ''
  actionError.value = ''
  rejectNote.value = ''
  rejectError.value = ''
  rejectOpen.value = false
})

function openBatch(batchId: string) {
  selectedBatchId.value = batchId
  detailOpen.value = true
}

const canApprove = computed(() => props.canPost
  && selectedBatch.value?.state === 'submitted'
  && selectedBatch.value.makerId !== identity.value.id)
const canCancel = computed(() => props.canPost
  && selectedBatch.value?.state === 'submitted'
  && selectedBatch.value.makerId === identity.value.id)
const canPostBatch = computed(() => props.canPost
  && selectedBatch.value?.state === 'applying'
  && selectedBatch.value?.reviewerId === identity.value.id)

function submitSubledger() {
  if (!isMakerIdentity.value) {
    notify('请切换为制单人', '当前身份是复核人，不能提交期初批次。', 'warning', 'i-carbon-user-role')
    return
  }
  const result = store.submitBatch(subledger.value, workspaceId.value, identity.value.id, identity.value.name)
  if (!result.ok) {
    notify('批次提交失败', result.message, 'error', 'i-carbon-warning-alt')
    return
  }
  notify('批次已提交', result.message, 'success', 'i-carbon-send')
  if (result.batch) openBatch(result.batch.id)
}

function approveBatch() {
  if (!selectedBatch.value) return
  const result = store.reviewBatch(selectedBatch.value.id, 'approve', identity.value.id, identity.value.name, reviewNote.value)
  if (!result.ok) {
    actionError.value = result.message
    notify('复核未通过', result.message, 'error', 'i-carbon-warning-alt')
    return
  }
  actionError.value = ''
  notify('复核通过', result.message, 'success', 'i-carbon-checkmark')
}

function openReject() {
  rejectNote.value = ''
  rejectError.value = ''
  rejectOpen.value = true
}

function submitReject() {
  if (!selectedBatch.value) return
  const result = store.reviewBatch(selectedBatch.value.id, 'reject', identity.value.id, identity.value.name, rejectNote.value)
  if (!result.ok) {
    rejectError.value = result.message
    return
  }
  rejectOpen.value = false
  notify('批次已拒绝', result.message, 'success', 'i-carbon-close-outline')
}

function postSelected() {
  if (!selectedBatch.value) return
  const result = store.postBatch(selectedBatch.value.id)
  if (!result.ok) {
    actionError.value = result.message
    notify('过账失败', result.message, 'error', 'i-carbon-warning-alt')
    return
  }
  actionError.value = ''
  notify('期初已过账', result.message, 'success', 'i-carbon-checkmark')
}

function cancelSelected() {
  if (!selectedBatch.value) return
  const result = store.cancelBatch(selectedBatch.value.id, identity.value.id)
  if (!result.ok) {
    actionError.value = result.message
    notify('撤回失败', result.message, 'error', 'i-carbon-warning-alt')
    return
  }
  actionError.value = ''
  notify('批次已撤回', result.message, 'success', 'i-carbon-undo')
}

function stateLabel(batch: OpeningSubledgerBatch) {
  return openingSubledgerStatusLabels[batch.state]
}

function stateColor(batch: OpeningSubledgerBatch) {
  return openingSubledgerStatusColors[batch.state]
}
</script>

<template>
  <FinanceOpeningLedger v-if="live" :live="live" />
  <div v-else class="space-y-4" data-testid="finance-opening">
    <UCard class="nx-reveal rounded-sm" :ui="{ body: 'p-0 sm:p-0' }">
      <template #header>
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 class="text-sm font-semibold text-highlighted">
              总账期初导入
            </h2>
            <p class="mt-0.5 text-xs text-muted">
              上传总账期初文件后先预览科目、借贷合计与校验问题；确认无误再生成开账凭证。
            </p>
          </div>
          <div class="flex items-center gap-2">
            <UBadge
              label="账套版本 v3"
              color="neutral"
              variant="subtle"
              size="sm"
            />
            <UBadge
              label="币种 CNY"
              color="neutral"
              variant="subtle"
              size="sm"
            />
          </div>
        </div>
      </template>

      <div class="space-y-4 p-3">
        <div class="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
          <div class="grid gap-3 sm:grid-cols-2">
            <UFormField label="期初文件">
              <USelect
                v-model="glFileKey"
                :items="openingBalanceFileOptions"
                class="w-full"
                data-testid="opening-gl-file"
              />
            </UFormField>
            <div>
              <label for="opening-gl-date" class="mb-1 block text-sm font-medium text-default">开账日期</label>
              <UInput
                id="opening-gl-date"
                model-value="2026-01-01"
                readonly
                class="w-full"
                data-testid="opening-gl-date"
              />
            </div>
          </div>
          <div class="flex items-end">
            <UButton
              label="预览文件"
              icon="i-carbon-view"
              color="neutral"
              variant="outline"
              data-testid="opening-gl-preview"
              @click="previewGl"
            />
          </div>
        </div>

        <div v-if="glPreview" class="space-y-3" data-testid="opening-gl-preview-panel">
          <div class="grid gap-2 sm:grid-cols-4">
            <div class="rounded-sm border border-default bg-elevated/30 px-3 py-2">
              <p class="text-xs text-muted">
                借方合计
              </p>
              <p class="mt-1 text-lg font-semibold tabular-nums text-highlighted" data-testid="opening-gl-debit">
                {{ formatMoney(glPreview.debit) }}
              </p>
            </div>
            <div class="rounded-sm border border-default bg-elevated/30 px-3 py-2">
              <p class="text-xs text-muted">
                贷方合计
              </p>
              <p class="mt-1 text-lg font-semibold tabular-nums text-highlighted" data-testid="opening-gl-credit">
                {{ formatMoney(glPreview.credit) }}
              </p>
            </div>
            <div class="rounded-sm border border-default bg-elevated/30 px-3 py-2">
              <p class="text-xs text-muted">
                借贷差额
              </p>
              <p class="mt-1 text-lg font-semibold tabular-nums" :class="glPreview.debit === glPreview.credit ? 'text-success' : 'text-error'" data-testid="opening-gl-diff">
                {{ signedMoney(glPreview.debit - glPreview.credit) }}
              </p>
            </div>
            <div class="rounded-sm border border-default bg-elevated/30 px-3 py-2">
              <p class="text-xs text-muted">
                校验结果
              </p>
              <div class="mt-1">
                <UBadge
                  :label="glPreview.canImport ? '可导入' : glPreview.issues.length + ' 项错误'"
                  :color="glPreview.canImport ? 'success' : 'error'"
                  variant="subtle"
                  size="sm"
                  data-testid="opening-gl-check"
                />
              </div>
            </div>
          </div>

          <div class="flex flex-wrap items-center gap-2 text-xs text-muted">
            <span>{{ glPreview.fileName }}</span>
            <span>·</span>
            <span>{{ glPreview.rowCount }} 行</span>
            <span>·</span>
            <span>文件哈希 {{ glPreview.fileHash.slice(0, 12) }}…</span>
          </div>

          <UAlert
            v-if="glPreview.issues.length"
            color="error"
            variant="soft"
            icon="i-carbon-warning-alt"
            title="文件存在校验错误"
            :description="glPreview.issues.length + ' 项问题需要修正后再导入；预览不会写入账簿。'"
            data-testid="opening-gl-issues"
          />

          <div class="rounded-sm border border-default">
            <ResizableTable
              :data="glPreview.rows"
              :columns="glColumns"
              class="nx-table"
              :ui="{ th: 'py-2.5', td: 'py-2' }"
              data-testid="opening-gl-rows"
            >
              <template #debit-cell="{ row }">
                <span class="tabular-nums">{{ row.original.debit ? formatMoney(row.original.debit) : '—' }}</span>
              </template>
              <template #credit-cell="{ row }">
                <span class="tabular-nums">{{ row.original.credit ? formatMoney(row.original.credit) : '—' }}</span>
              </template>
            </ResizableTable>
          </div>

          <ul v-if="glPreview.issues.length" class="space-y-1 text-xs text-error" data-testid="opening-gl-issue-list">
            <li v-for="(issue, index) in glPreview.issues" :key="index">
              <span v-if="issue.row">第 {{ issue.row }} 行：</span>{{ issue.message }}
            </li>
          </ul>

          <div class="flex flex-wrap items-center justify-between gap-2 border-t border-default pt-3">
            <p class="text-xs text-muted">
              导入后生成开账凭证并写入总账；重复导入会被拒绝。
            </p>
            <UButton
              label="确认导入并生成凭证"
              icon="i-carbon-upload"
              :disabled="!glPreview.canImport || !props.canPost"
              data-testid="opening-gl-import"
              @click="importGl"
            />
          </div>
        </div>

        <div v-if="importRows.length" class="rounded-sm border border-default" data-testid="opening-gl-history">
          <div class="border-b border-default px-3 py-2 text-xs font-medium text-muted">
            已导入批次
          </div>
          <div v-for="record in importRows" :key="record.id" class="flex flex-wrap items-center justify-between gap-2 border-b border-default/60 px-3 py-2 text-xs last:border-b-0">
            <div class="flex flex-wrap items-center gap-2">
              <span class="font-medium text-highlighted">{{ record.id }}</span>
              <span class="text-muted">{{ record.fileName }}</span>
            </div>
            <div class="flex flex-wrap items-center gap-3 text-muted">
              <span>凭证 {{ record.journalId }}</span>
              <span>{{ record.importedAt }}</span>
              <span class="tabular-nums text-highlighted">{{ formatMoney(record.debit) }}</span>
              <UBadge
                label="已入账"
                color="success"
                variant="subtle"
                size="sm"
              />
            </div>
          </div>
        </div>
      </div>
    </UCard>

    <UCard class="nx-reveal rounded-sm" :ui="{ body: 'p-0 sm:p-0' }">
      <template #header>
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 class="text-sm font-semibold text-highlighted">
              库存、未结应收应付与银行现金子账
            </h2>
            <p class="mt-0.5 text-xs text-muted">
              子账期初按仓库、客户、供应商和资金账户分别核对；差异需由独立复核人说明后才能进入库存入账。
            </p>
          </div>
          <div class="flex items-center gap-2">
            <UBadge
              label="批次预览"
              color="neutral"
              variant="subtle"
              size="sm"
            />
            <UBadge
              :label="subledger.issues.length ? '含差异' : '全部一致'"
              :color="subledger.issues.length ? 'warning' : 'success'"
              variant="subtle"
              size="sm"
              data-testid="opening-subledger-diff-badge"
            />
          </div>
        </div>
      </template>

      <div class="space-y-4 p-3">
        <div class="grid gap-2 sm:grid-cols-4">
          <div class="rounded-sm border border-default bg-elevated/30 px-3 py-2">
            <p class="text-xs text-muted">
              导入合计
            </p>
            <p class="mt-1 text-lg font-semibold tabular-nums text-highlighted" data-testid="opening-subledger-imported">
              {{ formatMoney(subledger.totalImported) }}
            </p>
          </div>
          <div class="rounded-sm border border-default bg-elevated/30 px-3 py-2">
            <p class="text-xs text-muted">
              子账合计
            </p>
            <p class="mt-1 text-lg font-semibold tabular-nums text-highlighted" data-testid="opening-subledger-total">
              {{ formatMoney(subledger.totalSubledger) }}
            </p>
          </div>
          <div class="rounded-sm border border-default bg-elevated/30 px-3 py-2">
            <p class="text-xs text-muted">
              总账合计
            </p>
            <p class="mt-1 text-lg font-semibold tabular-nums text-highlighted" data-testid="opening-subledger-ledger">
              {{ formatMoney(subledger.totalLedger) }}
            </p>
          </div>
          <div class="rounded-sm border border-default bg-elevated/30 px-3 py-2">
            <p class="text-xs text-muted">
              子账差异
            </p>
            <p class="mt-1 text-lg font-semibold tabular-nums" :class="subledger.totalDifference === 0 ? 'text-success' : 'text-warning'" data-testid="opening-subledger-diff">
              {{ signedMoney(subledger.totalDifference) }}
            </p>
          </div>
        </div>

        <div class="rounded-sm border border-default" data-testid="opening-subledger-checks">
          <div class="border-b border-default px-3 py-2 text-xs font-medium text-muted">
            分类核对
          </div>
          <div
            v-for="check in subledger.checks"
            :key="check.kind"
            class="grid grid-cols-[7rem_minmax(0,1fr)_9rem_9rem_9rem] items-center gap-2 border-b border-default/60 px-3 py-2 text-[13px] last:border-b-0"
            :data-testid="'opening-subledger-check-' + check.kind"
          >
            <span class="font-medium text-highlighted">{{ openingSubledgerKindLabels[check.kind] }}</span>
            <span class="text-xs text-muted">{{ check.matched ? '子账与总账一致' : '存在差异，需复核说明' }}</span>
            <span class="text-right tabular-nums text-highlighted">{{ formatMoney(check.subledger) }}</span>
            <span class="text-right tabular-nums text-muted">{{ formatMoney(check.ledger) }}</span>
            <span class="flex justify-end">
              <UBadge
                :label="formatMoney(check.subledger - check.ledger)"
                :color="check.matched ? 'success' : 'warning'"
                variant="subtle"
                size="sm"
              />
            </span>
          </div>
        </div>

        <UAlert
          v-if="subledger.issues.length"
          color="warning"
          variant="soft"
          icon="i-carbon-warning-alt"
          title="子账与总账存在差异"
          :description="subledger.issues[0]?.message"
          data-testid="opening-subledger-issues"
        />

        <div class="rounded-sm border border-default">
          <ResizableTable
            :data="subledger.sources"
            :columns="sourceColumns"
            class="nx-table"
            :ui="{ th: 'py-2.5', td: 'py-2.5' }"
            data-testid="opening-subledger-sources"
          >
            <template #kind-cell="{ row }">
              <UBadge
                :label="openingSubledgerKindLabels[row.original.kind]"
                color="neutral"
                variant="subtle"
                size="sm"
              />
            </template>
            <template #amount-cell="{ row }">
              <span class="tabular-nums">{{ formatMoney(row.original.amount) }}</span>
            </template>
            <template #ledgerAmount-cell="{ row }">
              <span class="tabular-nums text-muted">{{ formatMoney(row.original.ledgerAmount) }}</span>
            </template>
            <template #difference-cell="{ row }">
              <UBadge
                :label="formatMoney(row.original.amount - row.original.ledgerAmount)"
                :color="row.original.matched ? 'success' : 'warning'"
                variant="subtle"
                size="sm"
              />
            </template>
            <template #sample-cell="{ row }">
              <ULink
                :to="row.original.href"
                class="inline-flex items-center gap-1 text-xs text-primary"
                :data-testid="'opening-source-link-' + row.original.id"
              >
                {{ row.original.sampleDocNo }}
                <UIcon name="i-carbon-arrow-up-right" class="size-3" />
              </ULink>
              <p class="mt-0.5 text-[11px] text-muted">
                {{ row.original.sampleLabel }} · {{ row.original.detail }}
              </p>
            </template>
          </ResizableTable>
        </div>

        <div class="flex flex-wrap items-center justify-between gap-2 border-t border-default pt-3">
          <div class="text-xs text-muted">
            <p>权益对方科目：3103 本年利润 · 来源文件 {{ subledger.fileName }}</p>
            <p class="mt-0.5">
              制单人提交后，必须由另一位身份复核；库存入账处理期间仍可跟踪状态。
            </p>
          </div>
          <UButton
            label="生成待复核批次"
            icon="i-carbon-send"
            :disabled="!props.canPost || !isMakerIdentity"
            data-testid="opening-subledger-submit"
            @click="submitSubledger"
          />
        </div>
      </div>
    </UCard>

    <UCard class="nx-reveal rounded-sm" :ui="{ body: 'p-0 sm:p-0' }">
      <template #header>
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 class="text-sm font-semibold text-highlighted">
              期初批次
            </h2>
            <p class="mt-0.5 text-xs text-muted">
              批次保留文件哈希、版本、复核人与来源单据，可从明细回溯来源。
            </p>
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <span class="text-xs text-muted">演示身份</span>
            <UButton
              label="张明远 · 制单人"
              size="xs"
              :color="identityId === 'u-1001' ? 'primary' : 'neutral'"
              :variant="identityId === 'u-1001' ? 'solid' : 'outline'"
              data-testid="opening-actor-maker"
              @click="identityId = 'u-1001'"
            />
            <UButton
              label="陈立 · 财务负责人"
              size="xs"
              :color="identityId === 'u-1004' ? 'primary' : 'neutral'"
              :variant="identityId === 'u-1004' ? 'solid' : 'outline'"
              data-testid="opening-actor-reviewer"
              @click="identityId = 'u-1004'"
            />
          </div>
        </div>
      </template>

      <ResizableTable
        :data="batchRows"
        :columns="batchColumns"
        class="nx-table"
        :ui="{ th: 'py-2.5', td: 'py-2.5' }"
        data-testid="opening-batches"
      >
        <template #id-cell="{ row }">
          <button class="text-left text-[13px] font-medium text-primary hover:underline" :data-testid="'opening-batch-open-' + row.original.id" @click="openBatch(row.original.id)">
            {{ row.original.id }}
          </button>
        </template>
        <template #state-cell="{ row }">
          <UBadge
            :label="stateLabel(row.original)"
            :color="stateColor(row.original)"
            variant="subtle"
            size="sm"
            :data-testid="'opening-batch-state-' + row.original.id"
          />
        </template>
        <template #maker-cell="{ row }">
          <div class="text-xs">
            <p class="text-highlighted">
              {{ row.original.makerName }}
            </p>
            <p class="text-muted">
              {{ row.original.reviewerName ?? '待复核' }}
            </p>
          </div>
        </template>
        <template #difference-cell="{ row }">
          <span class="tabular-nums" :class="batchDifference(row.original) === 0 ? 'text-success' : 'text-warning'">{{ signedMoney(batchDifference(row.original)) }}</span>
        </template>
        <template #actions-cell="{ row }">
          <div class="flex justify-end">
            <UButton
              label="查看"
              color="neutral"
              variant="ghost"
              size="xs"
              :data-testid="'opening-batch-view-' + row.original.id"
              @click="openBatch(row.original.id)"
            />
          </div>
        </template>
        <template #empty>
          <UEmpty
            variant="naked"
            icon="i-carbon-document"
            title="还没有期初批次"
            description="先预览子账并生成待复核批次。"
          />
        </template>
      </ResizableTable>
    </UCard>

    <USlideover v-model:open="detailOpen" :ui="{ content: 'w-full sm:max-w-3xl' }">
      <template #header>
        <div v-if="selectedBatch" class="w-full">
          <p class="text-xs text-muted">
            期初子账批次
          </p>
          <div class="mt-1 flex flex-wrap items-center gap-2">
            <h2 class="text-base font-semibold text-highlighted">
              {{ selectedBatch.id }}
            </h2>
            <UBadge
              :label="stateLabel(selectedBatch)"
              :color="stateColor(selectedBatch)"
              variant="subtle"
              size="sm"
              data-testid="opening-batch-state"
            />
          </div>
          <p class="mt-0.5 text-xs text-muted">
            版本 v{{ selectedBatch.version }} · 制单 {{ selectedBatch.makerName }} · 复核 {{ selectedBatch.reviewerName ?? '待指定' }}
          </p>
        </div>
      </template>

      <template #body>
        <div v-if="selectedBatch" class="space-y-4" data-testid="opening-batch-detail">
          <div class="grid gap-2 sm:grid-cols-3">
            <div class="rounded-sm border border-default px-3 py-2">
              <p class="text-xs text-muted">
                子账合计
              </p>
              <p class="mt-1 text-sm font-semibold tabular-nums text-highlighted">
                {{ formatMoney(selectedBatch.sources.reduce((sum, source) => sum + source.amount, 0)) }}
              </p>
            </div>
            <div class="rounded-sm border border-default px-3 py-2">
              <p class="text-xs text-muted">
                差异
              </p>
              <p class="mt-1 text-sm font-semibold tabular-nums" :class="batchDifference(selectedBatch) === 0 ? 'text-success' : 'text-warning'" data-testid="opening-batch-detail-diff">
                {{ signedMoney(batchDifference(selectedBatch)) }}
              </p>
            </div>
            <div class="rounded-sm border border-default px-3 py-2">
              <p class="text-xs text-muted">
                校验通过
              </p>
              <p class="mt-1 text-sm font-semibold tabular-nums text-highlighted">
                {{ batchPassed(selectedBatch) }}/{{ selectedBatch.checks.length }}
              </p>
            </div>
          </div>

          <div class="flex flex-wrap items-center gap-2 text-xs text-muted">
            <span>{{ selectedBatch.on }}</span><span>·</span>
            <span>文件 {{ selectedBatch.fileName }}</span><span>·</span>
            <span>哈希 {{ selectedBatch.fileHash.slice(0, 12) }}…</span>
          </div>

          <UAlert
            v-if="selectedBatch.issues.length"
            color="warning"
            variant="soft"
            icon="i-carbon-warning-alt"
            title="复核差异说明"
            :description="selectedBatch.issues[0]?.message"
            data-testid="opening-batch-issues"
          />

          <div v-if="selectedBatch.rejection" class="rounded-sm border border-error/30 bg-error/5 px-3 py-2 text-xs text-error">
            拒绝原因：{{ selectedBatch.rejection }}
          </div>

          <div class="rounded-sm border border-default">
            <div class="border-b border-default px-3 py-2 text-xs font-medium text-muted">
              来源单据与文件行
            </div>
            <div
              v-for="source in selectedBatch.sources"
              :key="source.id"
              class="border-b border-default/60 px-3 py-2 text-xs last:border-b-0"
              :data-testid="'opening-detail-source-' + source.id"
            >
              <div class="flex flex-wrap items-center justify-between gap-2">
                <div class="flex flex-wrap items-center gap-2">
                  <UBadge
                    :label="openingSubledgerKindLabels[source.kind]"
                    color="neutral"
                    variant="subtle"
                    size="sm"
                  />
                  <span class="font-medium text-highlighted">{{ source.label }}</span>
                  <span class="text-muted">{{ source.reference }}</span>
                </div>
                <div class="flex items-center gap-2">
                  <span class="tabular-nums">{{ formatMoney(source.amount) }}</span>
                  <ULink :to="source.href" class="text-primary">{{ source.sampleDocNo }}</ULink>
                </div>
              </div>
              <p class="mt-1 text-[11px] text-muted">
                {{ source.sampleLabel }} · {{ source.detail }}
              </p>
            </div>
          </div>

          <div v-if="selectedBatch.result" class="rounded-sm border border-success/30 bg-success/5 p-3" data-testid="opening-post-result">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <p class="text-xs font-medium text-success">
                过账完成 · {{ selectedBatch.result.postedAt }}
              </p>
              <UBadge
                :label="'校验 ' + selectedBatch.result.passed + '/' + selectedBatch.result.checks"
                color="success"
                variant="subtle"
                size="sm"
              />
            </div>
            <div class="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-5">
              <div
                v-for="kind in (['journal', 'stock', 'receivable', 'payable', 'bank'] as const)"
                :key="kind"
                class="rounded-sm border border-default bg-default px-2 py-1.5"
                :data-testid="'opening-result-count-' + kind"
              >
                <p class="text-[11px] text-muted">
                  {{ recordKindLabels[kind] }}
                </p>
                <p class="mt-0.5 text-sm font-semibold tabular-nums text-highlighted">
                  {{ recordCount(kind) }} 条
                </p>
              </div>
            </div>
            <p class="mt-2 text-xs text-muted">
              过账生成的编号与数量由下方记录汇总；打开任一条可核对批次、来源行与金额。
            </p>
            <div class="mt-2 overflow-hidden rounded-sm border border-default bg-default">
              <ResizableTable
                :data="resultRecords"
                :columns="recordColumns"
                class="nx-table"
                :ui="{ th: 'py-2', td: 'py-2' }"
                data-testid="opening-result-records"
              >
                <template #kind-cell="{ row }">
                  <UBadge
                    :label="recordKindLabels[row.original.kind]"
                    :color="recordKindColors[row.original.kind]"
                    variant="subtle"
                    size="sm"
                  />
                </template>
                <template #docNo-cell="{ row }">
                  <span class="font-mono text-[12px] text-highlighted">{{ row.original.docNo }}</span>
                </template>
                <template #amount-cell="{ row }">
                  <span class="tabular-nums">{{ formatMoney(row.original.amount) }}</span>
                </template>
                <template #sourceLabel-cell="{ row }">
                  <div class="text-xs">
                    <p class="text-highlighted">
                      {{ row.original.sourceLabel }}
                    </p>
                    <p class="text-muted">
                      {{ row.original.sourceReference }}
                    </p>
                  </div>
                </template>
                <template #actions-cell="{ row }">
                  <div class="flex justify-end">
                    <UButton
                      label="详情"
                      color="neutral"
                      variant="ghost"
                      size="xs"
                      :data-testid="'opening-result-record-' + row.original.id"
                      @click="openRecord(row.original.id)"
                    />
                  </div>
                </template>
              </ResizableTable>
            </div>
          </div>

          <UAlert
            v-if="actionError"
            color="error"
            variant="subtle"
            icon="i-carbon-warning"
            :title="actionError"
            data-testid="opening-batch-error"
          />

          <div v-if="selectedBatch.state === 'submitted'" class="space-y-3 border-t border-default pt-3">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <p class="text-xs text-muted">
                当前身份：{{ identity.name }}（{{ identity.title }}）
              </p>
              <UBadge
                label="独立复核：复核人不能是制单人"
                color="neutral"
                variant="subtle"
                size="sm"
              />
            </div>
            <UFormField label="复核说明" :help="Math.abs(batchDifference(selectedBatch)) > 0 ? '存在差异时必须填写差异原因和处理方式' : '可填写复核意见'">
              <UTextarea
                v-model="reviewNote"
                :rows="3"
                class="w-full"
                placeholder="填写复核结论或差异说明"
                data-testid="opening-review-note"
              />
            </UFormField>
            <div class="flex flex-wrap justify-end gap-2">
              <UButton
                label="撤回批次"
                color="neutral"
                variant="ghost"
                :disabled="!canCancel"
                data-testid="opening-batch-cancel"
                @click="cancelSelected"
              />
              <UButton
                label="拒绝"
                color="error"
                variant="outline"
                :disabled="!canApprove"
                data-testid="opening-batch-reject"
                @click="openReject"
              />
              <UButton
                label="批准并进入库存入账"
                icon="i-carbon-checkmark"
                :disabled="!canApprove"
                data-testid="opening-batch-approve"
                @click="approveBatch"
              />
            </div>
          </div>

          <div v-else-if="selectedBatch.state === 'applying'" class="space-y-3 border-t border-default pt-3">
            <UAlert
              color="info"
              variant="soft"
              icon="i-carbon-in-progress"
              title="库存入账处理中"
              description="复核已通过，库存、应收应付和银行子账正在按来源行写入；完成后可查看过账结果。"
            />
            <div class="flex justify-end">
              <UButton
                label="完成过账"
                icon="i-carbon-checkmark-outline"
                :disabled="!canPostBatch"
                data-testid="opening-batch-post"
                @click="postSelected"
              />
            </div>
          </div>

          <div v-else-if="selectedBatch.state === 'posted'" class="flex justify-end">
            <UButton
              label="关闭"
              color="neutral"
              variant="outline"
              data-testid="opening-batch-close"
              @click="detailOpen = false"
            />
          </div>

          <div v-else class="flex justify-end">
            <UButton
              label="关闭"
              color="neutral"
              variant="outline"
              @click="detailOpen = false"
            />
          </div>
        </div>
      </template>
    </USlideover>

    <UModal v-model:open="rejectOpen" title="拒绝期初批次" description="拒绝原因会保留在批次与审计轨迹中">
      <template #body>
        <div class="space-y-3" data-testid="opening-reject-form">
          <p class="text-xs text-muted">
            批次 {{ selectedBatch?.id }} · {{ selectedBatch?.fileName }}
          </p>
          <UAlert
            v-if="rejectError"
            color="error"
            variant="subtle"
            icon="i-carbon-warning"
            :title="rejectError"
            data-testid="opening-reject-error"
          />
          <UFormField label="拒绝原因" required>
            <UTextarea
              v-model="rejectNote"
              :rows="3"
              class="w-full"
              placeholder="说明差异或文件问题，便于制单人修正后重新提交"
              data-testid="opening-reject-note"
            />
          </UFormField>
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton
            label="取消"
            color="neutral"
            variant="ghost"
            data-testid="opening-reject-cancel"
            @click="rejectOpen = false"
          />
          <UButton
            label="确认拒绝"
            color="error"
            data-testid="opening-reject-submit"
            @click="submitReject"
          />
        </div>
      </template>
    </UModal>

    <UModal
      v-model:open="recordOpen"
      title="过账结果记录"
      description="核对批次、来源行、记录编号与金额；可返回原批次继续查看"
    >
      <template #body>
        <div v-if="selectedRecord" class="space-y-3" data-testid="opening-record-detail">
          <div class="flex flex-wrap items-center gap-2">
            <UBadge
              :label="recordKindLabels[selectedRecord.kind]"
              :color="recordKindColors[selectedRecord.kind]"
              variant="subtle"
              size="sm"
            />
            <span class="font-mono text-sm font-medium text-highlighted" data-testid="opening-record-doc">{{ selectedRecord.docNo }}</span>
            <UBadge
              :label="selectedRecord.status"
              color="success"
              variant="subtle"
              size="sm"
            />
          </div>
          <dl class="grid grid-cols-2 gap-x-4 gap-y-2 text-[13px]">
            <div>
              <dt class="text-xs text-muted">
                所属批次
              </dt>
              <dd class="mt-0.5 font-mono text-default" data-testid="opening-record-batch">
                {{ selectedBatch?.id }}
              </dd>
            </div>
            <div>
              <dt class="text-xs text-muted">
                金额
              </dt>
              <dd class="mt-0.5 tabular-nums text-highlighted" data-testid="opening-record-amount">
                {{ formatMoney(selectedRecord.amount) }}
              </dd>
            </div>
            <div>
              <dt class="text-xs text-muted">
                来源行
              </dt>
              <dd class="mt-0.5 text-default" data-testid="opening-record-source">
                {{ selectedRecord.sourceLabel }} · {{ selectedRecord.sourceReference }}
              </dd>
            </div>
            <div>
              <dt class="text-xs text-muted">
                来源单据
              </dt>
              <dd class="mt-0.5 font-mono text-default" data-testid="opening-record-source-doc">
                {{ selectedRecordSource?.sampleDocNo ?? '—' }}
              </dd>
            </div>
          </dl>
          <div class="rounded-sm border border-default bg-elevated/40 px-3 py-2 text-xs text-muted">
            {{ selectedRecord.detail }}
          </div>
          <div class="flex flex-wrap items-center justify-between gap-2 border-t border-default pt-3">
            <ULink
              v-if="selectedRecordSource"
              :to="selectedRecordSource.href"
              class="text-xs text-primary"
              data-testid="opening-record-source-link"
            >
              查看{{ selectedRecordSource.sampleLabel }}
            </ULink>
            <span v-else />
            <UButton
              label="返回批次"
              color="neutral"
              variant="outline"
              icon="i-carbon-arrow-left"
              data-testid="opening-record-back"
              @click="backToBatch"
            />
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>

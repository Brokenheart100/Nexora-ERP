<script setup lang="ts">
import { z } from 'zod'
import { financePath, useLedgerApi } from '~/composables/api/useLedgerApi'
import { useDashboardApi } from '~/composables/api/useDashboardApi'
import { useTradeApi } from '~/composables/api/useTradeApi'
import { useWorkspaceQuery } from '~/composables/api/useWorkspaceQuery'
import { useScopedSubmission } from '~/composables/api/useScopedSubmission'
import type { AccountingBookConnection } from '~/composables/finance/useAccountingBook'
import { changeSchema } from '#shared/types/purchasing'
import { openingPreviewSchema, subledgerBatchSchema, subledgerPreviewSchema, type OpeningBatch } from '#shared/types/ledger'
import type { BankMovement } from '#shared/types/trade'
import { readAccountingFile, validateAccountingFile } from '~/utils/finance/accounting-files'

const props = defineProps<{ live: AccountingBookConnection }>()
const api = useLedgerApi()
const client = useDashboardApi()
const trade = useTradeApi()
const ws = () => props.live.workspace()
const root = () => financePath(ws()) + '/ledger'
const query = useWorkspaceQuery('opening-books', '/finance',
  async (id, signal) => {
    if (!props.live.query.data?.ledger) return null
    const [batches, journals] = await Promise.all([api.batches(id, signal), api.journals(id, 1, signal)])
    return { batches, journals: journals.filter(row => row.kind === 'opening') }
  }, () => !!props.live.query.data?.ledger)
const ledger = computed(() => props.live.query.data?.ledger)
const revision = computed(() => props.live.query.data?.chart?.revision)
const mode = ref<'gl' | 'sub'>('gl')
const glFile = ref(''), subFile = ref('')
const on = ref('')
const memo = ref('期初余额')
const equity = ref('')
const reading = ref(false)
const error = ref('')
const gl = shallowRef<z.infer<typeof openingPreviewSchema> | null>(null)
const sub = shallowRef<z.infer<typeof subledgerPreviewSchema> | null>(null)
const batch = shallowRef<OpeningBatch | null>(null)
const bankTrace = shallowRef<{ id: string, page: number, movement?: BankMovement, hasMore: boolean } | null>(null)
const created = ref('')
const detailOpen = ref(false)
const submission = useScopedSubmission('opening-ledger', () => query.enabled, z.union([subledgerBatchSchema, changeSchema]).parse)
const frozen = computed(() => reading.value || !!submission.record || submission.mutation.busy)
const eligibleEquity = computed(() => props.live.accounts.filter(row => row.category === 'equity' && row.purpose === 'posting' && !row.isArchived)
  .map(row => ({ label: row.code + ' ' + row.name, value: row.id })))
const stateLabel = (state: string) => ({
  'submitted': '待独立复核', 'applyingstock': '库存应用中', 'applying-stock': '库存应用中',
  'posted': '已过账', 'cancelled': '已取消', 'rejected': '入账失败'
})[state.toLowerCase()] ?? state
const waiting = (row: OpeningBatch) => row.state.toLowerCase().replaceAll('-', '') === 'applyingstock'
const status = (preview: { errors: unknown[], chartRevision: string | number } | null) =>
  !!preview && preview.errors.length === 0 && preview.chartRevision === revision.value
const kindLabel = (kind: string | number) => ({ 0: '库存', 1: '应收', 2: '应付', 3: '资金', stock: '库存', receivable: '应收', payable: '应付', bank: '资金' })[kind] ?? String(kind)
let poll: AbortController | undefined
watch([glFile, on], () => {
  gl.value = null
}, { flush: 'sync' })
watch([subFile, equity], () => {
  sub.value = null
}, { flush: 'sync' })
watch(() => ledger.value?.startsOn, (value) => {
  if (!on.value && value) on.value = value
}, { immediate: true })
watch(() => query.owner, () => {
  poll?.abort()
  glFile.value = subFile.value = error.value = on.value = equity.value = created.value = ''
  gl.value = sub.value = batch.value = null
  detailOpen.value = reading.value = false
}, { flush: 'sync' })
onScopeDispose(() => poll?.abort())
watch(() => batch.value?.id, () => {
  bankTrace.value = null
})

async function run(action: (owner: string) => Promise<void>) {
  if (reading.value) return
  reading.value = true
  error.value = ''
  const owner = query.owner
  try {
    await action(owner)
  } catch (failure) {
    if (owner === query.owner) error.value = failure instanceof Error ? failure.message : '期初读取失败。'
  } finally {
    if (owner === query.owner) reading.value = false
  }
}
function upload(event: Event) {
  const type = mode.value
  return run(async (owner) => {
    const file = await readAccountingFile(event)
    if (!file || owner !== query.owner) return
    if (type === 'gl') glFile.value = file
    else subFile.value = file
  })
}
function preview() {
  const type = mode.value
  return run(async (owner) => {
    if (type === 'gl') {
      gl.value = null
      const value = await api.preview(ws(), '/ledger/opening-balances/preview', { on: on.value, file: validateAccountingFile(glFile.value) }, openingPreviewSchema)
      if (owner === query.owner) gl.value = value
    } else {
      sub.value = null
      const value = await api.preview(ws(), '/ledger/opening-subledgers/preview', { equityAccountId: equity.value, file: validateAccountingFile(subFile.value) }, subledgerPreviewSchema)
      if (owner === query.owner) sub.value = value
    }
  })
}
async function submit() {
  if (frozen.value || !ledger.value?.canDraft) return
  const type = mode.value
  const view = type === 'gl' ? gl.value : sub.value
  if (!view || !status(view)) {
    error.value = '科目已更新或预览有错误，请重新预览。'
    return
  }
  const input = { fileHash: view.fileHash, chartRevision: view.chartRevision }
  const body = type === 'gl'
    ? { ...input, on: on.value, memo: memo.value.trim(), file: glFile.value }
    : { ...input, equityAccountId: equity.value, file: subFile.value }
  error.value = ''
  if (await submission.send('opening.' + type, root() + (type === 'gl' ? '/opening-balances/import' : '/opening-subledgers'), body)) {
    const result = submission.result
    await query.refresh()
    if (result && 'state' in result) await openBatch(result.id)
    else if (result) created.value = result.id
  }
}
async function openBatch(id: string) {
  detailOpen.value = true
  await run(async (owner) => {
    const value = await api.batch(ws(), id)
    if (owner === query.owner && detailOpen.value) batch.value = value
  })
}
async function settle(row: OpeningBatch) {
  if (!waiting(row)) return
  poll?.abort()
  const controller = new AbortController()
  poll = controller
  const owner = query.owner
  try {
    const result = await client.poll(root() + '/opening-subledgers/' + row.id, {
      signal: controller.signal, complete: response => !waiting(subledgerBatchSchema.parse(response.data))
    })
    if (owner !== query.owner || controller.signal.aborted) return
    if (batch.value?.id === row.id) batch.value = subledgerBatchSchema.parse(result.data)
    await query.refresh()
  } catch {
    if (owner === query.owner && !controller.signal.aborted) error.value = '库存回执仍在处理中，可重新读取批次。'
  }
}
async function decide(decision: 'approve' | 'cancel') {
  const value = batch.value
  if (!value || frozen.value || value.state !== 'submitted' || (decision === 'approve' ? value.isMaker || !ledger.value?.canPost : !value.isMaker || !ledger.value?.canDraft)) return
  error.value = ''
  if (await submission.send('subledger.' + decision, root() + '/opening-subledgers/' + value.id + '/decision',
    { expectedVersion: value.version, decision }, { resourceId: value.id })) {
    const result = submission.result
    if (result && 'state' in result) batch.value = result
    await query.refresh()
    if (result && 'state' in result) void settle(result)
  }
}
async function check() {
  if (!submission.mutation.unknown) submission.resume()
  await submission.check(async (saved) => {
    if (saved.resourceId) await api.batch(saved.workspaceId, saved.resourceId)
    else if (saved.action === 'opening.gl') await api.journals(saved.workspaceId, 1)
    else await api.batches(saved.workspaceId)
    return null
  })
}
async function retry() {
  if (!await submission.retry()) return
  const result = submission.result
  await query.refresh()
  if (result && 'state' in result) {
    await openBatch(result.id)
    void settle(result)
  } else if (result) created.value = result.id
}
function linked(kind: string | number, id: string, warehouse?: string | null, item?: string) {
  const workspace = ws()
  if (kind === 'stock' || kind === 0) return { path: '/inventory', query: { workspace, tab: 'movements', warehouse, item, movement: id } }
  if (kind === 'receivable' || kind === 1) return { path: '/sales', query: { workspace, tab: 'receivables', document: id } }
  if (kind === 'payable' || kind === 2) return { path: '/finance', query: { workspace, tab: 'payables', bill: id } }
  return undefined
}
function readBank(bankId: string, id: string, page = 1) {
  const selected = batch.value?.id
  return run(async (owner) => {
    const rows = await trade.bankMovements(ws(), bankId, page)
    if (owner !== query.owner || batch.value?.id !== selected || !detailOpen.value) return
    bankTrace.value = { id, page, movement: rows.find(row => row.id === id), hasMore: rows.length === 50 }
  })
}
</script>

<template>
  <div class="space-y-3" data-testid="finance-opening">
    <SalesOperationStatus
      v-if="!detailOpen"
      :message="error || live.query.problem || query.problem"
      :submission="submission"
      @check="check"
      @retry="retry"
    />
    <UCard class="rounded-sm">
      <template #header>
        <h2 class="text-sm font-semibold">
          期初导入
        </h2>
      </template>
      <div class="space-y-3">
        <UTabs
          v-model="mode"
          :items="[{ label: '总账期初', value: 'gl' }, { label: '期初子账', value: 'sub' }]"
          :content="false"
          size="sm"
        />
        <div v-if="ledger?.canDraft" class="space-y-3">
          <div v-if="mode === 'gl'" class="grid gap-3 sm:grid-cols-2">
            <UFormField label="期初日期">
              <UInput
                v-model="on"
                type="date"
                :disabled="frozen"
                class="w-full"
                data-testid="opening-gl-date"
              />
            </UFormField>
            <UFormField label="凭证摘要">
              <UInput v-model="memo" :disabled="frozen" class="w-full" />
            </UFormField>
          </div>
          <UFormField v-else label="期初权益科目">
            <USelectMenu
              v-model="equity"
              :items="eligibleEquity"
              :disabled="frozen"
              value-key="value"
              class="w-full"
              data-testid="opening-subledger-equity"
            />
          </UFormField>
          <UFormField label="选择 CSV 文件">
            <input
              type="file"
              accept=".csv"
              :disabled="frozen"
              @change="upload"
            >
          </UFormField>
          <UFormField v-if="mode === 'gl'" label="总账期初 CSV">
            <UTextarea
              v-model="glFile"
              :rows="5"
              :disabled="frozen"
              class="w-full"
              data-testid="opening-gl-file"
              placeholder="Code,Debit,Credit"
            />
          </UFormField>
          <UFormField v-else label="期初子账 CSV">
            <UTextarea
              v-model="subFile"
              :rows="5"
              :disabled="frozen"
              class="w-full"
              data-testid="opening-subledger-file"
              placeholder="Kind,Reference,ResourceId,WarehouseId,Quantity,Amount,DueOn"
            />
          </UFormField>
          <div class="flex flex-wrap gap-2">
            <UButton
              label="预览"
              size="sm"
              variant="outline"
              :disabled="frozen || (mode === 'gl' ? !on || !glFile.trim() : !equity || !subFile.trim())"
              :data-testid="mode === 'gl' ? 'opening-gl-preview' : 'opening-subledger-preview'"
              @click="preview"
            />
            <UButton
              :label="mode === 'gl' ? '导入期初凭证草稿' : '提交期初子账复核'"
              size="sm"
              :disabled="frozen || !status(mode === 'gl' ? gl : sub)"
              :data-testid="mode === 'gl' ? 'opening-gl-import' : 'opening-subledger-submit'"
              @click="submit"
            />
          </div>
        </div>
        <div v-if="mode === 'gl' && gl" class="space-y-2 rounded-sm border border-default p-3 text-sm" data-testid="opening-gl-preview-panel">
          <p>借 {{ gl.debit }} · 贷 {{ gl.credit }} · 科目版本 {{ gl.chartRevision }}</p>
          <p v-for="row in gl.rows" :key="row.row">
            {{ row.code }} {{ row.name }} · 借 {{ row.debit }} · 贷 {{ row.credit }}
          </p>
          <p v-for="(message, index) in gl.errors" :key="'error' + index" class="text-error">
            第 {{ message.row ?? '—' }} 行 · {{ message.message }}
          </p>
        </div>
        <div v-if="mode === 'sub' && sub" class="space-y-2 rounded-sm border border-default p-3 text-sm" data-testid="opening-subledger-preview-panel">
          <p>{{ sub.on }} · 科目版本 {{ sub.chartRevision }}</p>
          <p v-for="row in sub.rows" :key="row.id">
            {{ kindLabel(row.kind) }} · {{ row.reference }} {{ row.name }} · {{ row.amount }}{{ row.dueOn ? ' · 到期 ' + row.dueOn : '' }}
          </p>
          <p v-for="(message, index) in sub.errors" :key="'error' + index" class="text-error">
            第 {{ message.row ?? '—' }} 行 · {{ message.message }}
          </p>
        </div>
        <UButton
          v-if="created"
          label="查看新建期初凭证"
          variant="outline"
          :to="live.journalLink(created)"
        />
        <div v-for="row in query.data?.journals" :key="row.id" class="flex items-center justify-between border-b border-default py-2 text-sm">
          <span>{{ row.on }} · {{ row.sourceNumber }} · {{ row.state }}</span><UButton
            label="查看期初凭证"
            variant="link"
            size="xs"
            :to="live.journalLink(row.id)"
          />
        </div>
      </div>
    </UCard>
    <UCard class="rounded-sm" data-testid="opening-batches">
      <template #header>
        <h3 class="text-sm font-semibold">
          期初子账批次
        </h3>
      </template>
      <p v-if="!query.data?.batches.length" class="text-sm text-muted">
        当前账簿暂无可读取的期初子账批次。
      </p>
      <div v-for="row in query.data?.batches" :key="row.id" class="flex flex-wrap items-center justify-between gap-2 border-b border-default py-2 text-sm">
        <span>{{ row.on }} · {{ row.rows.length }} 行 · {{ stateLabel(row.state) }}</span>
        <UButton
          label="查看批次"
          size="xs"
          variant="outline"
          :data-testid="'opening-batch-open-' + row.id"
          @click="openBatch(row.id)"
        />
      </div>
    </UCard>
    <USlideover v-model:open="detailOpen" title="期初子账详情" :ui="{ content: 'w-full sm:max-w-3xl' }">
      <template #body>
        <div class="space-y-3">
          <SalesOperationStatus
            :message="error"
            :submission="submission"
            @check="check"
            @retry="retry"
          />
          <template v-if="batch">
            <div class="flex items-center gap-3">
              <UBadge :label="stateLabel(batch.state)" variant="subtle" data-testid="opening-batch-state" />
              <UButton
                label="读取最新状态"
                size="xs"
                variant="outline"
                :disabled="reading"
                @click="openBatch(batch.id)"
              />
            </div>
            <p v-if="batch.rejection" class="text-sm text-error">
              {{ batch.rejection }}
            </p>
            <div v-for="row in batch.rows" :key="row.id" class="space-y-1 border-b border-default py-2 text-sm">
              <p>{{ kindLabel(row.kind) }} · {{ row.reference }} {{ row.name }} · {{ row.amount }}</p>
              <p v-for="result in batch.checks.filter(item => item.rowId === row.id)" :key="result.accountId" :class="result.matched ? 'text-success' : 'text-error'">
                导入 {{ result.imported }} · 子账 {{ result.subledger }} · 总账 {{ result.ledger }} · {{ result.matched ? '一致' : '有差异' }}
              </p>
              <div v-for="post in batch.postings.filter(item => item.rowId === row.id)" :key="post.subledgerId" class="flex flex-wrap gap-2">
                <UButton
                  v-if="post.journalId"
                  label="查看凭证"
                  size="xs"
                  variant="link"
                  :to="live.journalLink(post.journalId)"
                />
                <UButton
                  v-if="linked(row.kind, post.subledgerId, row.warehouseId, row.resourceId)"
                  label="查看子账"
                  size="xs"
                  variant="link"
                  :to="linked(row.kind, post.subledgerId, row.warehouseId, row.resourceId)"
                />
                <UButton
                  v-else-if="row.kind === 'bank' || row.kind === 3"
                  label="查看资金流水"
                  size="xs"
                  variant="link"
                  :disabled="reading"
                  @click="readBank(row.resourceId, post.subledgerId)"
                />
              </div>
              <div v-if="bankTrace && batch.postings.some(post => post.rowId === row.id && post.subledgerId === bankTrace?.id)" class="space-y-2 text-xs" data-testid="opening-bank-movement">
                <p v-if="bankTrace.movement" class="break-all">
                  {{ bankTrace.movement.on }} · 金额 {{ bankTrace.movement.amount }} · 资金流水 {{ bankTrace.movement.id }}
                </p>
                <p v-else class="break-all text-muted">
                  第 {{ bankTrace.page }} 页未找到资金流水 {{ bankTrace.id }}
                </p>
                <UButton
                  v-if="!bankTrace.movement && bankTrace.hasMore"
                  label="查找下一页"
                  size="xs"
                  variant="outline"
                  :disabled="reading"
                  @click="readBank(row.resourceId, bankTrace.id, bankTrace.page + 1)"
                />
              </div>
            </div>
          </template>
        </div>
      </template>
      <template #footer>
        <UButton label="关闭" variant="ghost" @click="detailOpen = false" />
        <template v-if="batch?.state === 'submitted'">
          <UButton
            v-if="batch.isMaker && ledger?.canDraft"
            label="取消批次"
            variant="outline"
            :disabled="frozen"
            data-testid="opening-batch-cancel"
            @click="decide('cancel')"
          />
          <UButton
            v-if="!batch.isMaker && ledger?.canPost"
            label="复核并过账"
            :disabled="frozen"
            data-testid="opening-batch-approve"
            @click="decide('approve')"
          />
        </template>
      </template>
    </USlideover>
  </div>
</template>

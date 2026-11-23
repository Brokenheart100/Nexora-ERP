<script setup lang="ts">
import { z } from 'zod'
import { financePath, useLedgerApi } from '~/composables/api/useLedgerApi'
import { useScopedSubmission } from '~/composables/api/useScopedSubmission'
import { useWorkspaceQuery } from '~/composables/api/useWorkspaceQuery'
import type { AccountingBookConnection } from '~/composables/finance/useAccountingBook'
import { changeSchema } from '#shared/types/purchasing'
import type { JournalSummary, LedgerJournal } from '#shared/types/ledger'
import { compareDecimal, sumDecimals } from '#shared/utils/decimal'
import { displayDecimal } from '~/utils/api/decimal-display'

const props = defineProps<{ live: AccountingBookConnection, imported?: boolean }>()
const api = useLedgerApi()
const route = useRoute()
const today = () => new Date().toLocaleDateString('en-CA')
const page = ref(1)
const query = useWorkspaceQuery(props.imported ? 'imported-journals' : 'ledger-journals', '/finance',
  (id, signal) => props.live.query.data?.ledger ? api.journals(id, page.value, signal) : Promise.resolve([]),
  () => [page.value, !!props.live.query.data?.ledger])
const ledger = computed(() => props.live.query.data?.ledger)
const path = () => financePath(props.live.workspace()) + '/ledger'
const submission = useScopedSubmission(props.imported ? 'journal-imported-write' : 'ledger-write', () => query.enabled,
  z.union([changeSchema, z.array(changeSchema)]).parse)
const current = shallowRef<LedgerJournal | null>(null)
const detailId = ref('')
const open = ref(false)
const editing = ref(false)
const loading = ref(false)
const error = ref('')
const keyword = ref('')
const checked = shallowRef<{ id: string, version: string | number }[]>([])
const reverse = reactive({ open: false, on: today(), reason: '' })
const linkOpen = ref(false)
const formLink = reactive({ to: '', kind: 'related', memo: '' })
const links = shallowRef<Awaited<ReturnType<typeof api.links>>>([])
const linksPage = ref(1)
const scan = shallowRef<Awaited<ReturnType<typeof api.scan>> | null>(null)
const balanceDate = ref(today())
const balance = shallowRef<Awaited<ReturnType<typeof api.balance>> | null>(null)
const freshLine = () => ({ key: crypto.randomUUID(), accountId: '', debit: '0', credit: '0' })
const draft = reactive({ on: today(), memo: '', sourceNumber: '', provider: '', externalId: '', lines: [] as ReturnType<typeof freshLine>[] })
const frozen = computed(() => loading.value || !!submission.record || submission.mutation.busy)
const rows = computed(() => (query.data ?? []).filter(row => (!props.imported || row.kind === 'imported')
  && [row.sourceNumber, row.memo, row.externalId ?? ''].some(value => value.toLowerCase().includes(keyword.value.toLowerCase()))))
const options = computed(() => props.live.accounts.filter(account => account.purpose === 'posting' && !account.isArchived)
  .map(account => ({ label: account.code + ' ' + account.name, value: account.id })))
const money = (amount: string) => displayDecimal(amount, ledger.value?.minorUnits ?? 2)
const stateLabel = (value: string) => ({ draft: '草稿', submitted: '待独立复核', posted: '已过账', cancelled: '已取消' })[value] ?? value
let selection: AbortController | undefined
const financeError = computed(() => props.live.query.problem || query.problem)
const decimal = z.string().trim().regex(/^\d{1,16}(?:\.\d{1,6})?$/)
const lineInput = z.object({ accountId: z.uuid(), debit: decimal, credit: decimal }).refine(row =>
  (compareDecimal(row.debit, '0') > 0) !== (compareDecimal(row.credit, '0') > 0))

async function run(action: (owner: string) => Promise<void>) {
  if (loading.value) return
  const owner = query.owner
  loading.value = true
  error.value = ''
  try {
    await action(owner)
  } catch (failure) {
    if (query.owner === owner) error.value = failure instanceof Error ? failure.message : '凭证操作失败。'
  } finally {
    if (query.owner === owner) loading.value = false
  }
}
async function readLinks(id: string, number = 1) {
  const owner = query.owner
  const result = await api.links(props.live.workspace(), number, id)
  if (owner === query.owner && detailId.value === id && open.value) {
    linksPage.value = number
    links.value = result
  }
}
async function select(id: string) {
  if (!z.uuid().safeParse(id).success || !query.enabled) return
  selection?.abort()
  const controller = new AbortController()
  selection = controller
  detailId.value = id
  open.value = true
  editing.value = reverse.open = linkOpen.value = false
  current.value = null
  links.value = []
  error.value = ''
  try {
    const value = await api.journal(props.live.workspace(), id, controller.signal)
    if (selection !== controller) return
    current.value = value
    await readLinks(id)
  } catch (failure) {
    if (selection === controller) error.value = failure instanceof Error ? failure.message : '凭证读取失败。'
  }
}
function begin(edit = false) {
  if (!ledger.value?.canDraft || frozen.value) return
  const existing = edit ? current.value : null
  if (edit && (!existing?.isMaker || existing.journal.state !== 'draft')) return
  submission.reset()
  if (!existing) {
    current.value = null
    detailId.value = ''
    Object.assign(draft, { on: ledger.value.periods.find(row => row.state === 'open')?.month ?? today(), memo: '', sourceNumber: '',
      provider: '', externalId: '', lines: [freshLine(), freshLine()] })
  } else Object.assign(draft, { on: existing.journal.on, memo: existing.journal.memo,
    lines: existing.lines.map(row => ({ ...row, key: crypto.randomUUID() })) })
  editing.value = open.value = true
  error.value = ''
}
async function save() {
  if (!editing.value || frozen.value || !ledger.value?.canDraft) return
  const value = z.object({ on: z.iso.date(), memo: z.string().trim().max(300), lines: z.array(lineInput).min(2).max(100) }).safeParse(draft)
  if (!value.success || compareDecimal(sumDecimals(value.data.lines.map(row => row.debit)), sumDecimals(value.data.lines.map(row => row.credit))) !== 0
    || (!detailId.value && props.imported && (!draft.provider.trim() || !draft.externalId.trim()))) {
    error.value = '请填写业务日期，核对每行科目和借贷金额，并保持借贷合计相等。外部凭证还需要来源和编号。'
    return
  }
  const existing = current.value?.journal
  const body = { ...value.data, cashActivity: current.value?.cashActivity ?? null }
  const pathname = path() + '/journals' + (existing ? '/' + existing.id : props.imported ? '/imported' : '')
  const input = existing
    ? { expectedVersion: existing.version, draft: body }
    : props.imported
      ? { provider: draft.provider.trim(), externalId: draft.externalId.trim(), draft: body }
      : { kind: 'manual', sourceNumber: draft.sourceNumber.trim() || null, draft: body }
  error.value = ''
  if (await submission.send('journal.save', pathname, input, { resourceId: existing?.id, method: existing ? 'PUT' : 'POST' })) {
    const result = submission.result
    await query.refresh()
    if (result && !Array.isArray(result)) await select(result.id)
  }
}
async function decide(decision: 'submit' | 'cancel' | 'post') {
  const row = current.value?.journal
  if (!row || frozen.value) return
  if (await submission.send('journal.' + decision, path() + '/journals/' + row.id + '/decision',
    { expectedVersion: row.version, decision }, { resourceId: row.id })) {
    await query.refresh()
    await select(row.id)
  }
}
async function reverseJournal() {
  const row = current.value?.journal
  if (!row || !ledger.value?.canDraft || frozen.value) return
  if (!z.iso.date().safeParse(reverse.on).success || reverse.on < row.on || !reverse.reason.trim()) {
    error.value = '请填写冲销原因，并选择原凭证日期当天或之后的冲销日期。'
    return
  }
  if (await submission.send('journal.reversal', path() + '/journals/' + row.id + '/reversal',
    { expectedVersion: row.version, on: reverse.on, reason: reverse.reason.trim() }, { resourceId: row.id })) {
    const result = submission.result
    await query.refresh()
    if (result && !Array.isArray(result)) await select(result.id)
  }
}
function checkRow(row: JournalSummary, enabled: boolean) {
  if (!enabled) checked.value = checked.value.filter(item => item.id !== row.id)
  else if (checked.value.length < 50 && !checked.value.some(item => item.id === row.id)) checked.value = [...checked.value, { id: row.id, version: row.version }]
}
async function batch(decision: 'submit' | 'cancel' | 'post') {
  if (!checked.value.length || frozen.value) return
  if (await submission.send('journal.imported-batch', path() + '/journals/imported/batch-decision',
    { decision, journals: checked.value })) {
    checked.value = []
    await query.refresh()
  }
}
async function link() {
  const id = detailId.value
  if (!z.uuid().safeParse(formLink.to).success || formLink.to === id || !ledger.value?.canDraft || frozen.value) {
    error.value = '请选择另一张有效凭证。'
    return
  }
  if (await submission.send('journal.link', path() + '/links', { fromJournalId: id, toJournalId: formLink.to, kind: formLink.kind, memo: formLink.memo }, { resourceId: id })) {
    linkOpen.value = false
    await run(() => readLinks(id))
  }
}
async function removeLink(id: string, version: number | string) {
  if (!ledger.value?.canDraft || frozen.value) return
  if (await submission.send('journal.unlink', path() + '/links/' + id + '/delete', { expectedVersion: version }, { resourceId: detailId.value }))
    await run(() => readLinks(detailId.value))
}
async function check() {
  if (!submission.mutation.unknown) submission.resume()
  await submission.check(async (saved) => {
    if (saved.resourceId) await api.journal(saved.workspaceId, saved.resourceId)
    else await api.journals(saved.workspaceId, page.value)
    return null
  })
}
async function retry() {
  const record = submission.record
  if (!await submission.retry()) return
  const result = submission.result
  await query.refresh()
  if (record?.action === 'journal.link' || record?.action === 'journal.unlink') await run(() => readLinks(detailId.value))
  else if (result && !Array.isArray(result)) await select(result.id)
}
watch(() => query.owner, () => {
  selection?.abort()
  selection = undefined
  error.value = detailId.value = ''
  open.value = editing.value = loading.value = false
  current.value = scan.value = balance.value = null
  links.value = checked.value = []
  draft.lines = []
  page.value = 1
}, { flush: 'sync' })
watch(() => [query.enabled, route.query.journal] as const, ([enabled, id]) => {
  if (enabled && typeof id === 'string' && id !== detailId.value) void select(id)
}, { immediate: true })
onScopeDispose(() => selection?.abort())
</script>

<template>
  <UCard class="rounded-sm" :data-testid="imported ? 'finance-imported' : 'journal-panel'">
    <template #header>
      <div class="flex flex-wrap items-center justify-between gap-2">
        <h2 class="text-sm font-semibold">
          {{ imported ? '外部凭证' : '会计凭证' }}
        </h2>
        <div class="flex flex-wrap gap-2">
          <UInput
            v-model="keyword"
            placeholder="搜索本页凭证"
            size="sm"
            data-testid="journal-search"
          />
          <UButton
            :label="imported ? '录入外部凭证' : '新增凭证'"
            size="sm"
            :disabled="!ledger?.canDraft || frozen"
            data-testid="journal-new"
            @click="begin()"
          />
        </div>
      </div>
    </template>
    <div class="space-y-3">
      <SalesOperationStatus
        v-if="!open"
        :message="error || financeError"
        :submission="submission"
        @check="check"
        @retry="retry"
      />
      <div v-if="imported && checked.length" class="flex flex-wrap gap-2">
        <UButton
          label="批量提交"
          size="xs"
          :disabled="frozen || !ledger?.canDraft"
          data-testid="journal-batch-submit"
          @click="batch('submit')"
        />
        <UButton
          label="批量取消"
          size="xs"
          variant="outline"
          :disabled="frozen || !ledger?.canDraft"
          data-testid="journal-batch-cancel"
          @click="batch('cancel')"
        />
        <UButton
          label="批量复核过账"
          size="xs"
          :disabled="frozen || !ledger?.canPost"
          data-testid="journal-batch-post"
          @click="batch('post')"
        />
        <UButton
          label="清除选择"
          size="xs"
          variant="ghost"
          @click="checked = []"
        />
      </div>
      <USkeleton v-if="query.loading" class="h-14 w-full" />
      <p v-else-if="!rows.length" class="text-sm text-muted">
        当前页没有匹配的凭证。
      </p>
      <div
        v-for="row in rows"
        :key="row.id"
        class="flex flex-wrap items-center justify-between gap-2 border-b border-default py-2 text-sm"
        :data-testid="'ledger-row-' + row.id"
      >
        <div class="flex items-start gap-2">
          <UCheckbox
            v-if="imported && ['draft', 'submitted'].includes(row.state)"
            :model-value="checked.some(item => item.id === row.id)"
            :aria-label="'选择凭证 ' + row.sourceNumber"
            :disabled="checked.length >= 50 && !checked.some(item => item.id === row.id)"
            @update:model-value="checkRow(row, $event === true)"
          />
          <div>
            <p>{{ row.sourceNumber }} · {{ row.memo }}</p>
            <p class="text-xs text-muted">
              {{ row.on }} · {{ row.importProvider || row.kind }}{{ row.externalId ? ' · ' + row.externalId : '' }}
            </p>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <UBadge :label="stateLabel(row.state)" variant="subtle" />
          <UButton
            label="查看"
            size="xs"
            variant="ghost"
            data-testid="journal-detail-open"
            @click="select(row.id)"
          />
        </div>
      </div>
      <div class="flex flex-wrap gap-2">
        <UButton
          label="上一页"
          size="xs"
          variant="outline"
          :disabled="page <= 1"
          @click="page--"
        />
        <UButton
          label="下一页"
          size="xs"
          variant="outline"
          :disabled="(query.data?.length ?? 0) < 50"
          @click="page++"
        />
      </div>
      <UCard v-if="!imported && ledger" class="rounded-sm">
        <template #header>
          <div class="flex flex-wrap items-center gap-2">
            <UFormField label="试算截止日">
              <UInput
                v-model="balanceDate"
                type="date"
                size="xs"
                data-testid="ledger-balance-date"
              />
            </UFormField>
            <UButton
              label="查询试算平衡"
              size="xs"
              variant="outline"
              :disabled="frozen || !z.iso.date().safeParse(balanceDate).success"
              data-testid="ledger-trial-balance"
              @click="run(async owner => { const result = await api.balance(live.workspace(), balanceDate); if (query.owner === owner) balance = result })"
            />
            <UButton
              label="扫描凭证关联"
              size="xs"
              variant="outline"
              :disabled="frozen"
              data-testid="ledger-scan"
              @click="run(async owner => { const result = await api.scan(live.workspace()); if (query.owner === owner) scan = result })"
            />
          </div>
        </template>
        <div v-if="balance" class="space-y-1 text-sm" data-testid="ledger-balance">
          <p>{{ balance.through }} · 借 {{ money(balance.debit) }} · 贷 {{ money(balance.credit) }}</p>
          <p v-for="account in balance.accounts" :key="account.accountId" class="text-xs text-muted">
            {{ account.code }} {{ account.name }} · 借 {{ money(account.debit) }} · 贷 {{ money(account.credit) }} · 余额 {{ money(account.balance) }}
          </p>
        </div>
        <div v-if="scan" class="space-y-2 text-sm" data-testid="ledger-scan-result">
          <p>已扫描 {{ scan.journalCount }} 张凭证和 {{ scan.linkCount }} 条关联 · {{ scan.issues.length }} 个问题</p>
          <p v-for="(issue, index) in scan.issues" :key="index">
            {{ issue.message }}
            <UButton
              v-if="issue.journalId"
              label="查看问题凭证"
              size="xs"
              variant="link"
              @click="select(issue.journalId!)"
            />
          </p>
        </div>
      </UCard>
    </div>

    <USlideover v-model:open="open" :title="editing ? (detailId ? '编辑凭证' : '新增凭证') : '凭证详情'" :ui="{ content: 'w-full sm:max-w-3xl' }">
      <template #body>
        <div class="space-y-4">
          <SalesOperationStatus
            :message="error"
            :submission="submission"
            @check="check"
            @retry="retry"
          />
          <template v-if="editing">
            <div class="grid gap-3 sm:grid-cols-2">
              <UFormField label="凭证日期">
                <UInput
                  v-model="draft.on"
                  type="date"
                  class="w-full"
                  data-testid="journal-date"
                />
              </UFormField>
              <UFormField label="摘要">
                <UInput v-model="draft.memo" class="w-full" data-testid="journal-memo" />
              </UFormField>
              <template v-if="!detailId && imported">
                <UFormField label="外部来源">
                  <UInput v-model="draft.provider" class="w-full" data-testid="journal-provider" />
                </UFormField>
                <UFormField label="外部编号">
                  <UInput v-model="draft.externalId" class="w-full" data-testid="journal-external-id" />
                </UFormField>
              </template>
              <UFormField v-else-if="!detailId" label="来源编号">
                <UInput v-model="draft.sourceNumber" class="w-full" data-testid="journal-number" />
              </UFormField>
            </div>
            <div
              v-for="(line, index) in draft.lines"
              :key="line.key"
              class="grid gap-2 border-b border-default pb-2 sm:grid-cols-[2fr_1fr_1fr_auto]"
              data-testid="journal-draft-line"
            >
              <UFormField label="科目">
                <USelectMenu
                  v-model="line.accountId"
                  :items="options"
                  value-key="value"
                  class="w-full"
                  :data-testid="'journal-account-' + index"
                />
              </UFormField>
              <UFormField label="借方">
                <UInput v-model="line.debit" inputmode="decimal" :data-testid="'journal-debit-' + index" />
              </UFormField>
              <UFormField label="贷方">
                <UInput v-model="line.credit" inputmode="decimal" :data-testid="'journal-credit-' + index" />
              </UFormField>
              <UButton
                label="移除"
                variant="ghost"
                size="xs"
                :disabled="draft.lines.length <= 2 || frozen"
                @click="draft.lines.splice(index, 1)"
              />
            </div>
            <UButton
              label="添加分录"
              variant="outline"
              size="xs"
              :disabled="frozen || draft.lines.length >= 100"
              @click="draft.lines.push(freshLine())"
            />
          </template>
          <div v-else-if="current" class="space-y-3" data-testid="journal-detail">
            <p class="text-sm">
              {{ current.journal.sourceNumber }} · {{ current.journal.on }} · {{ current.journal.memo }}
            </p>
            <UBadge :label="stateLabel(current.journal.state)" variant="subtle" data-testid="journal-state" />
            <p v-if="current.journal.postingNumber" class="text-xs text-muted">
              过账号 {{ current.journal.postingNumber }}
            </p>
            <UButton
              v-if="current.journal.reversesId"
              label="查看原凭证"
              variant="link"
              size="xs"
              @click="select(current.journal.reversesId!)"
            />
            <div v-for="(line, index) in current.lines" :key="index" class="flex flex-wrap justify-between gap-2 border-b border-default py-2 text-sm">
              <span>{{ line.code }} {{ line.name }}</span><span>借 {{ money(line.debit) }} · 贷 {{ money(line.credit) }}</span>
            </div>
            <div v-if="reverse.open" class="grid gap-2 sm:grid-cols-2">
              <UFormField label="冲销日期">
                <UInput v-model="reverse.on" type="date" data-testid="journal-reversal-date" />
              </UFormField>
              <UFormField label="冲销原因">
                <UInput v-model="reverse.reason" data-testid="journal-reversal-reason" />
              </UFormField>
            </div>
            <div class="space-y-2 border-t border-default pt-2">
              <div class="flex justify-between gap-2">
                <h3 class="text-sm font-semibold">
                  凭证关联
                </h3><UButton
                  v-if="ledger?.canDraft && current.journal.state === 'posted'"
                  label="新增关联"
                  size="xs"
                  variant="outline"
                  :disabled="frozen"
                  @click="linkOpen = !linkOpen"
                />
              </div>
              <div v-if="linkOpen" class="space-y-2">
                <UFormField label="目标凭证 ID">
                  <UInput v-model="formLink.to" class="w-full" data-testid="journal-link-target" />
                </UFormField>
                <UFormField label="关联类型">
                  <USelect v-model="formLink.kind" :items="[{ value: 'related', label: '相关' }, { value: 'adjustment', label: '调整' }, { value: 'settlement', label: '结算' }]" />
                </UFormField>
                <UFormField label="备注">
                  <UInput v-model="formLink.memo" class="w-full" />
                </UFormField>
                <UButton
                  label="保存关联"
                  size="xs"
                  :disabled="frozen"
                  data-testid="journal-link-save"
                  @click="link"
                />
              </div>
              <div v-for="entry in links" :key="entry.id" class="flex flex-wrap items-center justify-between gap-2 text-sm">
                <UButton
                  :label="entry.fromJournalId === detailId ? entry.toSourceNumber : entry.fromSourceNumber"
                  variant="link"
                  size="xs"
                  @click="select(entry.fromJournalId === detailId ? entry.toJournalId : entry.fromJournalId)"
                />
                <span>{{ entry.kind }} · {{ entry.memo }}</span>
                <UButton
                  v-if="ledger?.canDraft"
                  label="移除关联"
                  variant="ghost"
                  size="xs"
                  :disabled="frozen"
                  @click="removeLink(entry.id, entry.version)"
                />
              </div>
              <div v-if="linksPage > 1 || links.length >= 50" class="flex gap-2">
                <UButton
                  label="上一页关联"
                  size="xs"
                  variant="outline"
                  :disabled="linksPage <= 1 || frozen"
                  @click="run(() => readLinks(detailId, linksPage - 1))"
                />
                <UButton
                  label="下一页关联"
                  size="xs"
                  variant="outline"
                  :disabled="links.length < 50 || frozen"
                  @click="run(() => readLinks(detailId, linksPage + 1))"
                />
              </div>
            </div>
          </div>
        </div>
      </template>
      <template #footer>
        <UButton label="关闭" variant="ghost" @click="open = false" />
        <UButton
          v-if="editing"
          label="保存草稿"
          :disabled="frozen"
          data-testid="journal-save"
          @click="save"
        />
        <template v-else-if="current">
          <UButton
            v-if="ledger?.canDraft && current.isMaker && current.journal.state === 'draft'"
            label="编辑"
            variant="outline"
            :disabled="frozen"
            data-testid="journal-edit"
            @click="begin(true)"
          />
          <UButton
            v-if="ledger?.canDraft && current.isMaker && current.journal.state === 'draft'"
            label="提交复核"
            :disabled="frozen"
            data-testid="journal-submit"
            @click="decide('submit')"
          />
          <UButton
            v-if="ledger?.canDraft && current.isMaker && ['draft', 'submitted'].includes(current.journal.state)"
            label="取消凭证"
            variant="outline"
            :disabled="frozen"
            @click="decide('cancel')"
          />
          <UButton
            v-if="ledger?.canPost && !current.isMaker && current.journal.state === 'submitted' && (current.journal.kind !== 'reversal' || ledger.canReverse)"
            label="复核过账"
            :disabled="frozen"
            data-testid="journal-post"
            @click="decide('post')"
          />
          <UButton
            v-if="ledger?.canDraft && current.journal.state === 'posted' && ['manual', 'imported'].includes(current.journal.kind)"
            :label="reverse.open ? '提交冲销复核' : '申请冲销'"
            variant="outline"
            :disabled="frozen"
            data-testid="journal-reversal"
            @click="reverse.open ? reverseJournal() : reverse.open = true"
          />
        </template>
      </template>
    </USlideover>
  </UCard>
</template>

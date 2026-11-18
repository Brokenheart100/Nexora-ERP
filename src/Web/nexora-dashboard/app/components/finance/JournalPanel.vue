<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { FinanceAccount, JournalEntry, JournalLine } from '~/mocks'
import { journalStatusColors, journalStatusLabels } from '~/mocks'

function money(value: string | number) {
  return formatMoney(Number(value))
}

const props = defineProps<{
  journals: JournalEntry[]
  accounts: FinanceAccount[]
  canPost: boolean
}>()

const emit = defineEmits<{
  create: [entry: JournalEntry]
  post: [id: string]
}>()

interface EntryFormLine {
  key: number
  accountCode: string
  debit: string
  credit: string
}

const search = ref('')
const statusFilter = ref<'all' | 'draft' | 'posted' | 'reversed'>('all')
const detailOpen = ref(false)
const formOpen = ref(false)
const selectedId = ref('')
const errorMessage = ref('')
const lineSeed = ref(1)
const formDate = ref('')
const formDescription = ref('')
const formLines = ref<EntryFormLine[]>([])

const { loading: submitting, run: runSubmit } = useMockAsync(async () => undefined, { delay: 600 })

const statusOptions = [
  { label: '全部状态', value: 'all' },
  { label: '草稿', value: 'draft' },
  { label: '已过账', value: 'posted' },
  { label: '已冲销', value: 'reversed' }
]

const accountOptions = computed(() =>
  props.accounts.map(account => ({ label: account.code + ' ' + account.name, value: account.code }))
)

const rows = computed(() => {
  const keyword = search.value.trim().toLowerCase()
  return props.journals
    .filter(entry => statusFilter.value === 'all' || entry.status === statusFilter.value)
    .filter(entry =>
      keyword.length === 0
      || entry.id.toLowerCase().includes(keyword)
      || entry.description.toLowerCase().includes(keyword)
      || entry.period.includes(keyword)
    )
    .slice()
    .sort((a, b) => b.id.localeCompare(a.id))
})

const selected = computed(() => props.journals.find(entry => entry.id === selectedId.value) ?? null)

const columns: TableColumn<JournalEntry>[] = [
  { accessorKey: 'id', header: '凭证号' },
  { accessorKey: 'date', header: '日期' },
  { accessorKey: 'period', header: '期间' },
  { accessorKey: 'description', header: '摘要' },
  { accessorKey: 'debitTotal', header: '借方合计', meta: { class: { th: 'text-right', td: 'text-right tabular-nums whitespace-nowrap' } } },
  { accessorKey: 'creditTotal', header: '贷方合计', meta: { class: { th: 'text-right', td: 'text-right tabular-nums whitespace-nowrap' } } },
  { accessorKey: 'status', header: '状态' },
  { id: 'actions', header: '操作', meta: { class: { th: 'text-right', td: 'text-right' } } }
]

const draftCount = computed(() => props.journals.filter(entry => entry.status === 'draft').length)

const formDebitTotal = computed(() => formLines.value.reduce((sum, line) => sum + (Number(line.debit) || 0), 0))
const formCreditTotal = computed(() => formLines.value.reduce((sum, line) => sum + (Number(line.credit) || 0), 0))
const formBalanced = computed(() => Math.abs(formDebitTotal.value - formCreditTotal.value) < 0.005 && formDebitTotal.value > 0)
const detailBalanced = computed(() => {
  if (!selected.value) return true
  return Math.abs(Number(selected.value.debitTotal) - Number(selected.value.creditTotal)) < 0.005
})

function today() {
  return new Date().toISOString().slice(0, 10)
}

function addLine() {
  formLines.value = [...formLines.value, { key: lineSeed.value++, accountCode: '', debit: '', credit: '' }]
}

function removeLine(key: number) {
  if (formLines.value.length <= 2) return
  formLines.value = formLines.value.filter(line => line.key !== key)
}

function updateLineAmount(line: EntryFormLine, field: 'debit' | 'credit', value: string | number) {
  const raw = typeof value === 'number' ? String(value) : value
  line[field] = raw
  if (raw.length > 0 && Number(raw) > 0) {
    line[field === 'debit' ? 'credit' : 'debit'] = ''
  }
  errorMessage.value = ''
}

function openDetail(entry: JournalEntry) {
  selectedId.value = entry.id
  detailOpen.value = true
}

function openCreate() {
  errorMessage.value = ''
  formDate.value = today()
  formDescription.value = ''
  lineSeed.value = 1
  formLines.value = [
    { key: lineSeed.value++, accountCode: '', debit: '', credit: '' },
    { key: lineSeed.value++, accountCode: '', debit: '', credit: '' }
  ]
  formOpen.value = true
}

function nextJournalId() {
  const max = props.journals.reduce((value, entry) => {
    const match = entry.id.match(/JE-2026-(\d+)/)
    return match ? Math.max(value, Number(match[1])) : value
  }, 0)
  return 'JE-2026-' + (max + 1)
}

function buildEntry(status: 'draft' | 'posted'): JournalEntry | null {
  const description = formDescription.value.trim()
  if (!formDate.value) {
    errorMessage.value = '请选择凭证日期'
    return null
  }
  if (description.length === 0) {
    errorMessage.value = '请填写凭证摘要'
    return null
  }
  const filled = formLines.value.filter(line => line.accountCode.length > 0 || (Number(line.debit) || 0) > 0 || (Number(line.credit) || 0) > 0)
  if (filled.length < 2) {
    errorMessage.value = '请至少填写两条分录'
    return null
  }
  const missing = filled.find(line => line.accountCode.length === 0)
  if (missing) {
    errorMessage.value = '每条分录都需要选择科目'
    return null
  }
  const invalid = filled.find((line) => {
    const debit = Number(line.debit) || 0
    const credit = Number(line.credit) || 0
    return (debit > 0 && credit > 0) || (debit <= 0 && credit <= 0)
  })
  if (invalid) {
    errorMessage.value = '每条分录需且仅需填写借方或贷方金额'
    return null
  }
  if (!formBalanced.value) {
    errorMessage.value = '借贷不平衡：借方合计 ' + money(formDebitTotal.value) + '，贷方合计 ' + money(formCreditTotal.value)
    return null
  }
  const lines: JournalLine[] = filled.map((line) => {
    const account = props.accounts.find(item => item.code === line.accountCode)
    return {
      accountCode: line.accountCode,
      accountName: account?.name ?? line.accountCode,
      debit: (Number(line.debit) || 0).toFixed(2),
      credit: (Number(line.credit) || 0).toFixed(2)
    }
  })
  return {
    id: nextJournalId(),
    date: formDate.value,
    period: formDate.value.slice(0, 7),
    description,
    status,
    debitTotal: formDebitTotal.value.toFixed(2),
    creditTotal: formCreditTotal.value.toFixed(2),
    lines
  }
}

async function saveDraft() {
  const entry = buildEntry('draft')
  if (!entry) return
  await runSubmit()
  emit('create', entry)
  formOpen.value = false
}

async function submitApproval() {
  const entry = buildEntry('posted')
  if (!entry) return
  await runSubmit()
  emit('create', entry)
  formOpen.value = false
}

function closeDetail() {
  detailOpen.value = false
}

function postSelected() {
  if (!selected.value) return
  emit('post', selected.value.id)
  detailOpen.value = false
}
</script>

<template>
  <UCard class="nx-reveal rounded-sm" :ui="{ body: 'p-0 sm:p-0' }" data-testid="journal-panel">
    <template #header>
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 class="text-sm font-semibold text-highlighted">
            记账凭证
          </h2>
          <p class="mt-0.5 text-xs text-muted">
            共 {{ journals.length }} 张凭证 · 草稿 {{ draftCount }} 张；借贷平衡校验在前端本地完成。
          </p>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <UInput
            v-model="search"
            icon="i-carbon-search"
            placeholder="搜索凭证号或摘要"
            size="sm"
            class="w-52"
            data-testid="journal-search"
          />
          <USelect
            v-model="statusFilter"
            :items="statusOptions"
            size="sm"
            class="w-32"
            data-testid="journal-status-filter"
          />
          <UTooltip :text="canPost ? '新建凭证（本地演示）' : '当前演示身份没有 finance.post 权限'">
            <UButton
              label="新建凭证"
              icon="i-carbon-add"
              size="sm"
              :disabled="!canPost"
              data-testid="journal-new"
              @click="openCreate"
            />
          </UTooltip>
        </div>
      </div>
    </template>

    <ResizableTable
      :data="rows"
      :columns="columns"
      class="nx-table"
      :ui="{ th: 'py-2.5', td: 'py-3' }"
      data-testid="journal-table"
    >
      <template #id-cell="{ row }">
        <span class="text-[13px] font-medium tabular-nums text-highlighted">{{ row.original.id }}</span>
      </template>
      <template #description-cell="{ row }">
        <span class="line-clamp-1 text-[13px] text-highlighted">{{ row.original.description }}</span>
      </template>
      <template #debitTotal-cell="{ row }">
        {{ money(row.original.debitTotal) }}
      </template>
      <template #creditTotal-cell="{ row }">
        {{ money(row.original.creditTotal) }}
      </template>
      <template #status-cell="{ row }">
        <UBadge
          :label="journalStatusLabels[row.original.status]"
          :color="journalStatusColors[row.original.status]"
          variant="subtle"
          size="sm"
        />
      </template>
      <template #actions-cell="{ row }">
        <div class="flex justify-end gap-1">
          <UButton
            label="详情"
            color="neutral"
            variant="ghost"
            size="xs"
            data-testid="journal-detail-open"
            @click="openDetail(row.original)"
          />
          <UButton
            v-if="row.original.status === 'draft'"
            label="提交审批"
            color="primary"
            variant="ghost"
            size="xs"
            :disabled="!canPost"
            data-testid="journal-post"
            @click="emit('post', row.original.id)"
          />
        </div>
      </template>
      <template #empty>
        <UEmpty
          variant="naked"
          icon="i-carbon-document"
          title="没有匹配的凭证"
          description="调整搜索或状态筛选，或新建一张本地凭证。"
          :actions="canPost ? [{ label: '新建凭证', color: 'neutral', variant: 'outline', size: 'sm', onClick: openCreate }] : []"
        />
      </template>
    </ResizableTable>

    <USlideover
      v-model:open="detailOpen"
      :ui="{ content: 'w-full sm:max-w-2xl' }"
      data-testid="journal-detail"
    >
      <template #header>
        <div>
          <p class="text-xs text-muted">
            凭证详情
          </p>
          <h2 class="mt-1 text-base font-semibold text-highlighted">
            {{ selected?.id ?? '—' }}
          </h2>
          <p class="mt-0.5 text-xs text-muted">
            {{ selected?.date }} · 期间 {{ selected?.period }} · 摘要 {{ selected?.description }}
          </p>
        </div>
      </template>

      <template #body>
        <div v-if="selected" class="space-y-4">
          <div class="flex flex-wrap items-center gap-2">
            <UBadge
              :label="journalStatusLabels[selected.status]"
              :color="journalStatusColors[selected.status]"
              variant="subtle"
              size="sm"
            />
            <UBadge
              :label="detailBalanced ? '借贷平衡' : '借贷不平衡'"
              :color="detailBalanced ? 'success' : 'error'"
              variant="subtle"
              size="sm"
              data-testid="journal-detail-balance"
            />
          </div>

          <div class="rounded-sm border border-default">
            <div class="grid grid-cols-[7rem_minmax(0,1fr)_9rem_9rem] gap-2 border-b border-default bg-elevated/40 px-3 py-2 text-xs font-medium text-muted">
              <span>科目编码</span>
              <span>科目名称</span>
              <span class="text-right">借方</span>
              <span class="text-right">贷方</span>
            </div>
            <div
              v-for="(line, index) in selected.lines"
              :key="selected.id + '-' + index"
              class="grid grid-cols-[7rem_minmax(0,1fr)_9rem_9rem] gap-2 border-b border-default/60 px-3 py-2 last:border-b-0"
              data-testid="journal-detail-line"
            >
              <span class="text-xs tabular-nums text-muted">{{ line.accountCode }}</span>
              <span class="truncate text-[13px] text-highlighted">{{ line.accountName }}</span>
              <span class="text-right text-[13px] tabular-nums text-highlighted">{{ money(line.debit) }}</span>
              <span class="text-right text-[13px] tabular-nums text-highlighted">{{ money(line.credit) }}</span>
            </div>
            <div class="grid grid-cols-[7rem_minmax(0,1fr)_9rem_9rem] gap-2 bg-elevated/40 px-3 py-2 text-[13px] font-semibold">
              <span class="col-span-2 text-highlighted">合计</span>
              <span class="text-right tabular-nums text-highlighted" data-testid="journal-detail-debit">{{ money(selected.debitTotal) }}</span>
              <span class="text-right tabular-nums text-highlighted" data-testid="journal-detail-credit">{{ money(selected.creditTotal) }}</span>
            </div>
          </div>

          <UAlert
            v-if="!detailBalanced"
            color="error"
            variant="soft"
            icon="i-carbon-warning-alt"
            title="借贷不平衡"
            description="该凭证借贷金额不一致，需要调整后才能过账。"
          />
          <p class="text-xs text-muted">
            凭证由本地 mock 数据生成，状态变化仅保存在当前页面状态中。
          </p>
        </div>
      </template>

      <template #footer>
        <div class="flex w-full items-center justify-between gap-2">
          <UButton
            label="关闭"
            color="neutral"
            variant="ghost"
            data-testid="journal-detail-close"
            @click="closeDetail"
          />
          <UButton
            v-if="selected?.status === 'draft'"
            label="提交审批"
            icon="i-carbon-checkmark"
            :disabled="!canPost"
            data-testid="journal-detail-post"
            @click="postSelected"
          />
        </div>
      </template>
    </USlideover>

    <USlideover
      v-model:open="formOpen"
      :ui="{ content: 'w-full sm:max-w-3xl' }"
      data-testid="journal-form"
    >
      <template #header>
        <div>
          <p class="text-xs text-muted">
            凭证录入
          </p>
          <h2 class="mt-1 text-base font-semibold text-highlighted">
            新建记账凭证
          </h2>
          <p class="mt-0.5 text-xs text-muted">
            借贷自动合计并在本地校验平衡；保存草稿或提交审批都只写入本地演示状态。
          </p>
        </div>
      </template>

      <template #body>
        <div class="space-y-4">
          <UAlert
            v-if="errorMessage"
            color="error"
            variant="soft"
            icon="i-carbon-warning-alt"
            :title="errorMessage"
            data-testid="journal-form-error"
          />

          <div class="grid gap-3 sm:grid-cols-3">
            <UFormField label="凭证日期" required>
              <UInput
                v-model="formDate"
                type="date"
                class="w-full"
                data-testid="journal-date"
              />
            </UFormField>
            <UFormField label="会计期间">
              <UInput
                :model-value="formDate ? formDate.slice(0, 7) : ''"
                disabled
                class="w-full"
                data-testid="journal-period"
              />
            </UFormField>
            <UFormField label="凭证摘要" required>
              <UInput
                v-model="formDescription"
                placeholder="如 采购办公用品入库"
                class="w-full"
                data-testid="journal-description"
              />
            </UFormField>
          </div>

          <div class="space-y-2">
            <div class="flex items-center justify-between gap-2">
              <p class="text-xs font-semibold text-highlighted">
                分录明细
              </p>
              <UButton
                label="增加分录"
                icon="i-carbon-add"
                color="neutral"
                variant="ghost"
                size="xs"
                data-testid="journal-add-line"
                @click="addLine"
              />
            </div>

            <div
              v-for="line in formLines"
              :key="line.key"
              class="grid grid-cols-1 gap-2 rounded-sm border border-default p-2.5 sm:grid-cols-[minmax(0,1fr)_8rem_8rem_2rem] sm:items-center"
              data-testid="journal-line"
            >
              <USelect
                v-model="line.accountCode"
                :items="accountOptions"
                placeholder="选择科目"
                class="w-full"
                data-testid="journal-line-account"
              />
              <UInput
                :model-value="line.debit"
                type="number"
                min="0"
                placeholder="借方金额"
                class="w-full"
                data-testid="journal-line-debit"
                @update:model-value="value => updateLineAmount(line, 'debit', value)"
              />
              <UInput
                :model-value="line.credit"
                type="number"
                min="0"
                placeholder="贷方金额"
                class="w-full"
                data-testid="journal-line-credit"
                @update:model-value="value => updateLineAmount(line, 'credit', value)"
              />
              <UButton
                icon="i-carbon-trash-can"
                color="error"
                variant="ghost"
                size="xs"
                aria-label="删除该分录"
                :disabled="formLines.length <= 2"
                data-testid="journal-line-remove"
                @click="removeLine(line.key)"
              />
            </div>
          </div>

          <div class="space-y-1.5 rounded-sm bg-elevated/60 px-3 py-2">
            <div class="flex items-center justify-between gap-2 text-[13px]">
              <span class="text-muted">借方合计</span>
              <span class="tabular-nums text-highlighted" data-testid="journal-debit-total">{{ money(formDebitTotal) }}</span>
            </div>
            <div class="flex items-center justify-between gap-2 text-[13px]">
              <span class="text-muted">贷方合计</span>
              <span class="tabular-nums text-highlighted" data-testid="journal-credit-total">{{ money(formCreditTotal) }}</span>
            </div>
            <div class="flex items-center justify-between gap-2 border-t border-default pt-1.5 text-[13px]">
              <span class="text-muted">平衡校验</span>
              <UBadge
                :label="formDebitTotal <= 0 && formCreditTotal <= 0 ? '待录入' : formBalanced ? '借贷平衡' : '借贷不平衡'"
                :color="formDebitTotal <= 0 && formCreditTotal <= 0 ? 'neutral' : formBalanced ? 'success' : 'error'"
                variant="subtle"
                size="sm"
                data-testid="journal-balance"
              />
            </div>
          </div>

          <p class="text-xs text-muted">
            提示：每条分录只能填写借方或贷方其中一侧；保存草稿后可在列表再次提交审批。
          </p>
        </div>
      </template>

      <template #footer>
        <div class="flex w-full items-center justify-between gap-2">
          <UButton
            label="取消"
            color="neutral"
            variant="ghost"
            data-testid="journal-cancel"
            @click="formOpen = false"
          />
          <div class="flex items-center gap-2">
            <UButton
              label="保存草稿"
              color="neutral"
              variant="outline"
              :loading="submitting"
              :disabled="!canPost"
              data-testid="journal-save-draft"
              @click="saveDraft"
            />
            <UButton
              label="提交审批"
              icon="i-carbon-checkmark"
              :loading="submitting"
              :disabled="!canPost"
              data-testid="journal-submit"
              @click="submitApproval"
            />
          </div>
        </div>
      </template>
    </USlideover>
  </UCard>
</template>

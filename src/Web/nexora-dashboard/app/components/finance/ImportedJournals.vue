<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { ExternalJournal, ExternalJournalStatus, FinanceAccount } from '~/mocks'
import {
  externalJournalProviders,
  externalJournalStatusColors,
  externalJournalStatusLabels
} from '~/mocks'

interface FormLine {
  key: number
  accountCode: string
  debit: string
  credit: string
}

const props = defineProps<{
  accounts: FinanceAccount[]
}>()

const store = useExternalJournalsStore()
const toast = useToast()

const search = ref('')
const statusFilter = ref<'all' | ExternalJournalStatus>('all')
const providerFilter = ref('all')
const selectedIds = ref<string[]>([])
const actorKey = ref<'maker' | 'reviewer'>('maker')
const batchError = ref('')
const batchIssues = ref<Array<{ journalId: string, message: string }>>([])
const detailOpen = ref(false)
const selectedId = ref('')
const detailError = ref('')
const formOpen = ref(false)
const editingId = ref('')
const formError = ref('')
const formWarning = ref('')
const lineSeed = ref(5)
const formProvider = ref('KINGDEE')
const formExternalId = ref('')
const formDate = ref('')
const formDescription = ref('')
const formLines = ref<FormLine[]>([])

const actors = {
  maker: { id: 'u-1001', name: '张明远', label: '张明远 · 制单人' },
  reviewer: { id: 'u-1004', name: '陈立', label: '陈立 · 财务负责人' }
} as const

const actor = computed(() => actors[actorKey.value])
const statusOptions = [
  { label: '全部状态', value: 'all' },
  { label: '草稿', value: 'draft' },
  { label: '待独立复核', value: 'submitted' },
  { label: '已过账', value: 'posted' },
  { label: '已取消', value: 'cancelled' }
]
const providerOptions = computed(() => [
  { label: '全部来源系统', value: 'all' },
  ...externalJournalProviders
])
const accountOptions = computed(() => props.accounts.map(account => ({
  label: account.code + ' ' + account.name,
  value: account.code
})))

const filteredRows = computed(() => {
  const keyword = search.value.trim().toLowerCase()
  return store.rows
    .filter(row => statusFilter.value === 'all' || row.status === statusFilter.value)
    .filter(row => providerFilter.value === 'all' || row.provider === providerFilter.value)
    .filter(row =>
      keyword.length === 0
      || row.id.toLowerCase().includes(keyword)
      || row.externalId.toLowerCase().includes(keyword)
      || row.description.toLowerCase().includes(keyword)
      || row.makerName.includes(keyword)
    )
    .slice()
    .sort((a, b) => b.id.localeCompare(a.id))
})
const allVisibleSelected = computed(() => filteredRows.value.length > 0
  && filteredRows.value.every(row => selectedIds.value.includes(row.id)))
const selected = computed(() => store.rows.find(row => row.id === selectedId.value) ?? null)
const formDebitTotal = computed(() => formLines.value.reduce((sum, line) => sum + (Number(line.debit) || 0), 0))
const formCreditTotal = computed(() => formLines.value.reduce((sum, line) => sum + (Number(line.credit) || 0), 0))
const formDifference = computed(() => formDebitTotal.value - formCreditTotal.value)
const formBalanced = computed(() => Math.abs(formDifference.value) < 0.005 && formDebitTotal.value > 0)

const columns: TableColumn<ExternalJournal>[] = [
  { accessorKey: 'id', header: '凭证明细' },
  { accessorKey: 'provider', header: '来源系统 / 外部编号' },
  { accessorKey: 'date', header: '业务日期' },
  { accessorKey: 'period', header: '期间' },
  { accessorKey: 'description', header: '摘要' },
  { accessorKey: 'debitTotal', header: '借方合计', meta: { class: { th: 'text-right', td: 'text-right tabular-nums whitespace-nowrap' } } },
  { accessorKey: 'status', header: '状态' },
  { accessorKey: 'version', header: '版本', meta: { class: { th: 'text-right', td: 'text-right tabular-nums' } } },
  { id: 'actions', header: '操作', meta: { class: { th: 'text-right', td: 'text-right' } } }
]

function providerLabel(value: string) {
  return externalJournalProviders.find(provider => provider.value === value)?.label ?? value
}

function statusLabel(value: ExternalJournalStatus) {
  return externalJournalStatusLabels[value]
}

function toDateInput() {
  return new Date().toISOString().slice(0, 10)
}

function resetForm() {
  editingId.value = ''
  formError.value = ''
  formWarning.value = ''
  formProvider.value = 'KINGDEE'
  formExternalId.value = ''
  formDate.value = toDateInput()
  formDescription.value = ''
  lineSeed.value = 5
  formLines.value = [
    { key: 1, accountCode: '1002', debit: '', credit: '' },
    { key: 2, accountCode: '4001', debit: '', credit: '' }
  ]
}

function openCreate() {
  resetForm()
  formOpen.value = true
}

function openEdit(row: ExternalJournal) {
  editingId.value = row.id
  formError.value = ''
  formWarning.value = ''
  formProvider.value = row.provider
  formExternalId.value = row.externalId
  formDate.value = row.date
  formDescription.value = row.description
  lineSeed.value = row.lines.length + 1
  formLines.value = row.lines.map((line, index) => ({
    key: index + 1,
    accountCode: line.accountCode,
    debit: line.debit,
    credit: line.credit
  }))
  formOpen.value = true
}

function addLine() {
  formLines.value = [...formLines.value, {
    key: lineSeed.value++,
    accountCode: '',
    debit: '',
    credit: ''
  }]
}

function removeLine(key: number) {
  if (formLines.value.length <= 2) return
  formLines.value = formLines.value.filter(line => line.key !== key)
}

function updateLineAmount(line: FormLine, field: 'debit' | 'credit', value: string | number) {
  const raw = typeof value === 'number' ? String(value) : value
  line[field] = raw
  if (raw.length > 0 && Number(raw) > 0) line[field === 'debit' ? 'credit' : 'debit'] = ''
  formError.value = ''
}

function saveForm() {
  formError.value = ''
  formWarning.value = ''
  const input = {
    provider: formProvider.value,
    externalId: formExternalId.value,
    date: formDate.value,
    description: formDescription.value,
    lines: formLines.value.map(line => ({
      accountCode: line.accountCode,
      debit: line.debit,
      credit: line.credit
    }))
  }
  const result = editingId.value
    ? store.updateJournal(editingId.value, input, actor.value.id, store.rows.find(row => row.id === editingId.value)?.version ?? 0)
    : store.importJournal(input, actor.value.id, actor.value.name)
  if (!result.ok) {
    formError.value = result.message
    return
  }
  if (result.warning) {
    formWarning.value = result.warning
    if (result.journal) editingId.value = result.journal.id
    toast.add({
      title: '已保存草稿，期间限制仍保留',
      description: result.warning,
      color: 'warning',
      icon: 'i-carbon-warning-alt'
    })
    return
  }
  formOpen.value = false
  toast.add({ title: '外部凭证已保存', description: result.message, color: 'success', icon: 'i-carbon-document-add' })
}

function toggleSelected(id: string) {
  batchError.value = ''
  batchIssues.value = []
  selectedIds.value = selectedIds.value.includes(id)
    ? selectedIds.value.filter(item => item !== id)
    : [...selectedIds.value, id]
}

function toggleAllVisible() {
  batchError.value = ''
  batchIssues.value = []
  if (allVisibleSelected.value) {
    const visibleIds = filteredRows.value.map(row => row.id)
    selectedIds.value = selectedIds.value.filter(id => !visibleIds.includes(id))
    return
  }
  const next = new Set(selectedIds.value)
  filteredRows.value.forEach(row => next.add(row.id))
  selectedIds.value = [...next]
}

function runDecision(ids: string[], decision: 'submit' | 'cancel' | 'post') {
  const versions: Record<string, number> = {}
  ids.forEach((id) => {
    const row = store.rows.find(item => item.id === id)
    if (row) versions[id] = row.version
  })
  const result = store.decideBatch(ids, decision, actor.value.id, actor.value.name, versions)
  batchError.value = result.ok ? '' : result.message
  batchIssues.value = result.issues
  if (!result.ok) return false
  selectedIds.value = selectedIds.value.filter(id => !ids.includes(id))
  toast.add({ title: '批量操作完成', description: result.message, color: 'success', icon: 'i-carbon-checkmark' })
  return true
}

function batchDecision(decision: 'submit' | 'cancel' | 'post') {
  if (selectedIds.value.length === 0) {
    batchError.value = '请至少选择一张外部凭证。'
    batchIssues.value = []
    return
  }
  runDecision(selectedIds.value, decision)
}

function openDetail(row: ExternalJournal) {
  selectedId.value = row.id
  detailError.value = ''
  detailOpen.value = true
}

function detailDecision(decision: 'submit' | 'cancel' | 'post') {
  if (!selected.value) return
  detailError.value = ''
  const ok = runDecision([selected.value.id], decision)
  if (ok) {
    detailOpen.value = false
  } else {
    detailError.value = batchError.value
  }
}

onMounted(() => {
  resetForm()
})
</script>

<template>
  <div class="space-y-4" data-testid="finance-imported">
    <UAlert
      color="info"
      variant="soft"
      icon="i-carbon-document-import"
      title="外部凭证导入与独立复核"
      description="按来源系统与外部编号登记外部凭证，复用借贷分录校验。批量提交、取消与过账会逐张校验状态、版本和职责分离；任一张不符合条件时整批保持原状态。"
    />

    <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      <div class="rounded-sm border border-default bg-default p-3">
        <p class="text-xs text-muted">
          外部凭证总数
        </p><p class="mt-1 text-2xl font-semibold tabular-nums">
          {{ store.rows.length }}
        </p><p class="mt-0.5 text-[11px] text-muted">
          来源系统 {{ new Set(store.rows.map(row => row.provider)).size }} 个
        </p>
      </div>
      <div class="rounded-sm border border-default bg-default p-3">
        <p class="text-xs text-muted">
          草稿
        </p><p class="mt-1 text-2xl font-semibold tabular-nums" data-testid="imported-stat-draft">
          {{ store.draftCount }}
        </p><p class="mt-0.5 text-[11px] text-muted">
          可修改、提交或取消
        </p>
      </div>
      <div class="rounded-sm border border-default bg-default p-3">
        <p class="text-xs text-muted">
          待独立复核
        </p><p class="mt-1 text-2xl font-semibold tabular-nums" data-testid="imported-stat-submitted">
          {{ store.submittedCount }}
        </p><p class="mt-0.5 text-[11px] text-muted">
          制单人不能自行过账
        </p>
      </div>
      <div class="rounded-sm border border-default bg-default p-3">
        <p class="text-xs text-muted">
          已过账
        </p><p class="mt-1 text-2xl font-semibold tabular-nums" data-testid="imported-stat-posted">
          {{ store.postedCount }}
        </p><p class="mt-0.5 text-[11px] text-muted">
          凭证已同步到总账
        </p>
      </div>
      <div class="rounded-sm border border-default bg-default p-3">
        <p class="text-xs text-muted">
          已取消
        </p><p class="mt-1 text-2xl font-semibold tabular-nums" data-testid="imported-stat-cancelled">
          {{ store.cancelledCount }}
        </p><p class="mt-0.5 text-[11px] text-muted">
          保留来源与操作痕迹
        </p>
      </div>
    </div>

    <UDashboardPanel>
      <template #header>
        <div class="flex w-full flex-wrap items-center justify-between gap-3">
          <div>
            <p class="text-sm font-semibold text-highlighted">
              外部凭证清单
            </p>
            <p class="mt-0.5 text-xs text-muted">
              同一来源系统与外部编号只能登记一次 · 同批最多 50 张
            </p>
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <UButton
              label="登记外部凭证"
              icon="i-carbon-add"
              data-testid="imported-new"
              @click="openCreate"
            />
          </div>
        </div>
      </template>
      <template #body>
        <div class="space-y-3">
          <div class="flex flex-wrap items-end gap-2">
            <UFormField label="搜索" class="min-w-[200px] flex-1">
              <UInput
                v-model="search"
                icon="i-carbon-search"
                placeholder="凭证号、外部编号、摘要或制单人"
                data-testid="imported-search"
              />
            </UFormField>
            <UFormField label="状态">
              <USelect
                v-model="statusFilter"
                :items="statusOptions"
                class="w-36"
                data-testid="imported-status"
              />
            </UFormField>
            <UFormField label="来源系统">
              <USelect
                v-model="providerFilter"
                :items="providerOptions"
                class="w-44"
                data-testid="imported-provider"
              />
            </UFormField>
          </div>

          <div class="flex flex-wrap items-center justify-between gap-2 rounded-sm border border-default bg-elevated/40 px-3 py-2">
            <div class="flex flex-wrap items-center gap-3">
              <UCheckbox
                :model-value="allVisibleSelected"
                label="全选当前结果"
                data-testid="imported-select-all"
                @update:model-value="toggleAllVisible"
              />
              <span class="text-xs text-muted" data-testid="imported-selected-count">
                已选 {{ selectedIds.length }} 张
              </span>
            </div>
            <div class="flex flex-wrap items-center gap-2">
              <span class="text-xs text-muted">当前演示身份</span>
              <UButton
                size="xs"
                :variant="actorKey === 'maker' ? 'solid' : 'outline'"
                :color="actorKey === 'maker' ? 'primary' : 'neutral'"
                label="张明远 · 制单人"
                data-testid="imported-actor-maker"
                @click="actorKey = 'maker'"
              />
              <UButton
                size="xs"
                :variant="actorKey === 'reviewer' ? 'solid' : 'outline'"
                :color="actorKey === 'reviewer' ? 'primary' : 'neutral'"
                label="陈立 · 财务负责人"
                data-testid="imported-actor-reviewer"
                @click="actorKey = 'reviewer'"
              />
            </div>
          </div>

          <div class="flex flex-wrap items-center gap-2">
            <UButton
              label="批量提交复核"
              icon="i-carbon-send-alt"
              size="sm"
              :disabled="selectedIds.length === 0"
              data-testid="imported-batch-submit"
              @click="batchDecision('submit')"
            />
            <UButton
              label="批量取消"
              icon="i-carbon-close-outline"
              color="neutral"
              variant="outline"
              size="sm"
              :disabled="selectedIds.length === 0"
              data-testid="imported-batch-cancel"
              @click="batchDecision('cancel')"
            />
            <UButton
              label="批量独立过账"
              icon="i-carbon-checkmark-outline"
              color="success"
              variant="soft"
              size="sm"
              :disabled="selectedIds.length === 0"
              data-testid="imported-batch-post"
              @click="batchDecision('post')"
            />
            <span class="text-[11px] text-muted">提交与取消按制单权限；过账不能由制单人执行。</span>
          </div>

          <UAlert
            v-if="batchError"
            color="error"
            variant="soft"
            icon="i-carbon-warning-alt"
            :title="batchError"
            data-testid="imported-batch-error"
          >
            <template #description>
              <ul v-if="batchIssues.length" class="mt-1 space-y-1">
                <li
                  v-for="issue in batchIssues"
                  :key="issue.journalId + issue.message"
                  class="text-xs"
                  :data-testid="'imported-batch-issue-' + issue.journalId"
                >
                  {{ issue.message }}
                </li>
              </ul>
            </template>
          </UAlert>

          <div class="rounded-sm border border-default">
            <ResizableTable
              :data="filteredRows"
              :columns="columns"
              class="nx-table"
              :ui="{ th: 'py-2.5', td: 'py-2.5' }"
              :row-activate="openDetail"
              data-testid="imported-table"
            >
              <template #id-cell="{ row }">
                <div class="flex items-start gap-2">
                  <UCheckbox
                    :model-value="selectedIds.includes(row.original.id)"
                    :data-testid="'imported-select-' + row.original.id"
                    @update:model-value="toggleSelected(row.original.id)"
                  />
                  <div class="min-w-0">
                    <p class="font-medium text-highlighted">
                      {{ row.original.id }}
                    </p>
                    <p class="mt-0.5 text-[11px] text-muted">
                      制单 {{ row.original.makerName }} · v{{ row.original.version }}
                    </p>
                    <p v-if="row.original.postingNumber" class="mt-0.5 text-[11px] text-primary">
                      过账凭证 {{ row.original.postingNumber }}
                    </p>
                  </div>
                </div>
              </template>
              <template #provider-cell="{ row }">
                <p class="font-medium text-highlighted">
                  {{ providerLabel(row.original.provider) }}
                </p>
                <p class="mt-0.5 font-mono text-[11px] text-muted">
                  {{ row.original.externalId }}
                </p>
              </template>
              <template #date-cell="{ row }">
                <p class="tabular-nums">
                  {{ row.original.date }}
                </p>
                <p class="mt-0.5 text-[11px] text-muted">
                  {{ row.original.period }}
                </p>
              </template>
              <template #description-cell="{ row }">
                <p class="max-w-[240px] truncate text-[13px]" :title="row.original.description">
                  {{ row.original.description }}
                </p>
                <p class="mt-0.5 text-[11px] text-muted">
                  {{ row.original.lines.length }} 条分录
                </p>
              </template>
              <template #debitTotal-cell="{ row }">
                <span class="tabular-nums">{{ formatMoney(Number(row.original.debitTotal)) }}</span>
              </template>
              <template #status-cell="{ row }">
                <UBadge
                  :label="statusLabel(row.original.status)"
                  :color="externalJournalStatusColors[row.original.status]"
                  variant="subtle"
                  size="sm"
                  :data-testid="'imported-status-' + row.original.id"
                />
              </template>
              <template #version-cell="{ row }">
                <span class="tabular-nums text-muted">v{{ row.original.version }}</span>
              </template>
              <template #actions-cell="{ row }">
                <div class="flex items-center justify-end gap-1">
                  <UButton
                    label="详情"
                    size="xs"
                    color="neutral"
                    variant="ghost"
                    :data-testid="'imported-open-' + row.original.id"
                    @click="openDetail(row.original)"
                  />
                  <UButton
                    v-if="row.original.status === 'draft' && row.original.makerId === actor.id"
                    label="编辑"
                    size="xs"
                    color="neutral"
                    variant="ghost"
                    :data-testid="'imported-edit-' + row.original.id"
                    @click="openEdit(row.original)"
                  />
                </div>
              </template>
            </ResizableTable>
            <div v-if="filteredRows.length === 0" class="border-t border-default p-6 text-center text-sm text-muted">
              没有符合条件的外部凭证。
            </div>
          </div>
        </div>
      </template>
    </UDashboardPanel>

    <USlideover v-model:open="formOpen" :ui="{ content: 'sm:max-w-3xl' }">
      <template #header>
        <div>
          <p class="text-sm font-semibold text-highlighted">
            {{ editingId ? '修改外部凭证 ' + editingId : '登记外部凭证' }}
          </p>
          <p class="mt-0.5 text-xs text-muted">
            外部来源与外部编号用于重复校验；业务日期决定会计期间。
          </p>
        </div>
      </template>
      <template #body>
        <div class="space-y-4" data-testid="imported-form">
          <UAlert
            v-if="formError"
            color="error"
            variant="soft"
            icon="i-carbon-warning-alt"
            :title="formError"
            data-testid="imported-form-error"
          />
          <UAlert
            v-if="formWarning"
            color="warning"
            variant="soft"
            icon="i-carbon-warning-alt"
            :title="formWarning"
            data-testid="imported-form-warning"
          />

          <div class="grid gap-3 sm:grid-cols-2">
            <UFormField label="来源系统" required>
              <USelect
                v-model="formProvider"
                :items="externalJournalProviders"
                class="w-full"
                data-testid="imported-form-provider"
              />
            </UFormField>
            <UFormField label="外部编号" required hint="1-80 个字符，同来源内唯一">
              <UInput
                v-model="formExternalId"
                placeholder="例如 JE-2026-0088"
                class="w-full"
                data-testid="imported-form-external"
              />
            </UFormField>
            <UFormField label="业务日期" required>
              <UInput
                v-model="formDate"
                type="date"
                class="w-full"
                data-testid="imported-form-date"
              />
            </UFormField>
            <UFormField label="会计期间">
              <UInput
                :model-value="formDate ? formDate.slice(0, 7) : ''"
                disabled
                class="w-full"
                data-testid="imported-form-period"
              />
            </UFormField>
          </div>

          <UFormField label="凭证摘要" required>
            <UInput
              v-model="formDescription"
              placeholder="外部系统转入的业务说明"
              class="w-full"
              data-testid="imported-form-description"
            />
          </UFormField>

          <div class="rounded-sm border border-default">
            <div class="flex items-center justify-between border-b border-default px-3 py-2">
              <span class="text-xs font-medium text-muted">分录明细</span>
              <UButton
                label="添加分录"
                icon="i-carbon-add"
                size="xs"
                color="neutral"
                variant="ghost"
                data-testid="imported-form-add-line"
                @click="addLine"
              />
            </div>
            <div
              v-for="(line, index) in formLines"
              :key="line.key"
              class="grid grid-cols-[minmax(0,1.4fr)_minmax(0,0.8fr)_minmax(0,0.8fr)_2rem] items-end gap-2 border-b border-default/60 px-3 py-2 last:border-b-0"
              :data-testid="'imported-form-line-' + (index + 1)"
            >
              <UFormField :label="'科目 ' + (index + 1)">
                <USelect
                  v-model="line.accountCode"
                  :items="accountOptions"
                  class="w-full"
                  :data-testid="'imported-form-account-' + (index + 1)"
                />
              </UFormField>
              <UFormField label="借方">
                <UInput
                  :model-value="line.debit"
                  type="number"
                  step="0.01"
                  min="0"
                  class="w-full text-right"
                  :data-testid="'imported-form-debit-' + (index + 1)"
                  @update:model-value="updateLineAmount(line, 'debit', $event)"
                />
              </UFormField>
              <UFormField label="贷方">
                <UInput
                  :model-value="line.credit"
                  type="number"
                  step="0.01"
                  min="0"
                  class="w-full text-right"
                  :data-testid="'imported-form-credit-' + (index + 1)"
                  @update:model-value="updateLineAmount(line, 'credit', $event)"
                />
              </UFormField>
              <UButton
                icon="i-carbon-trash-can"
                color="neutral"
                variant="ghost"
                size="sm"
                :disabled="formLines.length <= 2"
                :data-testid="'imported-form-remove-' + (index + 1)"
                @click="removeLine(line.key)"
              />
            </div>
          </div>

          <div class="grid gap-2 sm:grid-cols-3">
            <div class="rounded-sm border border-default p-3">
              <p class="text-xs text-muted">
                借方合计
              </p><p class="mt-1 font-semibold tabular-nums" data-testid="imported-form-total-debit">
                {{ formatMoney(formDebitTotal) }}
              </p>
            </div>
            <div class="rounded-sm border border-default p-3">
              <p class="text-xs text-muted">
                贷方合计
              </p><p class="mt-1 font-semibold tabular-nums" data-testid="imported-form-total-credit">
                {{ formatMoney(formCreditTotal) }}
              </p>
            </div>
            <div class="rounded-sm border border-default p-3">
              <p class="text-xs text-muted">
                借贷差异
              </p><p
                class="mt-1 font-semibold tabular-nums"
                :class="formBalanced ? 'text-success' : 'text-error'"
                data-testid="imported-form-diff"
              >
                {{ formatMoney(formDifference) }}
              </p>
            </div>
          </div>
          <p class="text-xs" :class="formBalanced ? 'text-success' : 'text-muted'">
            {{ formBalanced ? '借贷平衡，可保存。' : '借贷必须平衡，且每条分录只能填写借方或贷方。' }}
          </p>
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton
            label="取消"
            color="neutral"
            variant="ghost"
            data-testid="imported-form-cancel"
            @click="formOpen = false"
          />
          <UButton
            :label="editingId ? '保存修改' : '保存草稿'"
            icon="i-carbon-save"
            data-testid="imported-form-save"
            @click="saveForm"
          />
        </div>
      </template>
    </USlideover>

    <USlideover v-model:open="detailOpen" :ui="{ content: 'sm:max-w-4xl' }">
      <template #header>
        <div class="flex min-w-0 items-center justify-between gap-3">
          <div class="min-w-0">
            <p class="truncate text-sm font-semibold text-highlighted">
              外部凭证详情
            </p>
            <p v-if="selected" class="mt-0.5 truncate text-xs text-muted">
              {{ selected.id }} · {{ providerLabel(selected.provider) }} / {{ selected.externalId }}
            </p>
          </div>
          <UBadge
            v-if="selected"
            :label="statusLabel(selected.status)"
            :color="externalJournalStatusColors[selected.status]"
            variant="subtle"
            size="sm"
          />
        </div>
      </template>
      <template #body>
        <div v-if="selected" class="space-y-4" data-testid="imported-detail">
          <UAlert
            v-if="detailError"
            color="error"
            variant="soft"
            icon="i-carbon-warning-alt"
            :title="detailError"
            data-testid="imported-detail-error"
          />
          <div class="grid gap-3 sm:grid-cols-3">
            <div class="rounded-sm border border-default p-3">
              <p class="text-xs text-muted">
                来源系统
              </p><p class="mt-1 font-medium" data-testid="imported-detail-provider">
                {{ providerLabel(selected.provider) }}
              </p><p class="mt-0.5 font-mono text-xs text-muted">
                {{ selected.provider }}
              </p>
            </div>
            <div class="rounded-sm border border-default p-3">
              <p class="text-xs text-muted">
                外部编号
              </p><p class="mt-1 font-mono" data-testid="imported-detail-external">
                {{ selected.externalId }}
              </p>
            </div>
            <div class="rounded-sm border border-default p-3">
              <p class="text-xs text-muted">
                版本
              </p><p class="mt-1 font-semibold tabular-nums" data-testid="imported-detail-version">
                v{{ selected.version }}
              </p>
            </div>
            <div class="rounded-sm border border-default p-3">
              <p class="text-xs text-muted">
                业务日期 / 期间
              </p><p class="mt-1 tabular-nums" data-testid="imported-detail-date">
                {{ selected.date }} · {{ selected.period }}
              </p>
            </div>
            <div class="rounded-sm border border-default p-3">
              <p class="text-xs text-muted">
                制单人
              </p><p class="mt-1" data-testid="imported-detail-maker">
                {{ selected.makerName }} · {{ selected.createdAt }}
              </p>
            </div>
            <div class="rounded-sm border border-default p-3">
              <p class="text-xs text-muted">
                独立复核
              </p><p class="mt-1" data-testid="imported-detail-reviewer">
                {{ selected.reviewerName ?? '尚未过账' }}
                <span v-if="selected.postedAt" class="text-xs text-muted"> · {{ selected.postedAt }}</span>
              </p>
            </div>
          </div>

          <div class="rounded-sm border border-default p-3">
            <p class="text-xs text-muted">
              摘要
            </p><p class="mt-1" data-testid="imported-detail-description">
              {{ selected.description }}
            </p>
            <p v-if="selected.postingNumber" class="mt-2 text-xs text-primary" data-testid="imported-detail-posting">
              总账凭证 {{ selected.postingNumber }}
            </p>
          </div>

          <div class="rounded-sm border border-default">
            <div class="border-b border-default px-3 py-2 text-xs font-medium text-muted">
              分录明细 · 借 {{ formatMoney(Number(selected.debitTotal)) }} / 贷 {{ formatMoney(Number(selected.creditTotal)) }}
            </div>
            <div
              v-for="(line, index) in selected.lines"
              :key="index"
              class="grid grid-cols-[minmax(0,1.3fr)_minmax(0,0.8fr)_minmax(0,0.8fr)] items-center gap-2 border-b border-default/60 px-3 py-2 text-[13px] last:border-b-0"
              data-testid="imported-detail-line"
            >
              <span>{{ line.accountCode }} {{ line.accountName }}</span>
              <span class="text-right tabular-nums">{{ Number(line.debit) ? formatMoney(Number(line.debit)) : '—' }}</span>
              <span class="text-right tabular-nums">{{ Number(line.credit) ? formatMoney(Number(line.credit)) : '—' }}</span>
            </div>
          </div>

          <UAlert
            v-if="selected.status === 'draft'"
            color="neutral"
            variant="soft"
            icon="i-carbon-information"
            title="草稿可修改、提交复核或取消"
            description="提交后进入待独立复核，制单人不能自行过账；取消仅允许制单人执行。"
          />
          <UAlert
            v-else-if="selected.status === 'submitted'"
            color="warning"
            variant="soft"
            icon="i-carbon-user-check"
            title="等待独立复核"
            description="请切换到陈立（财务负责人）执行过账；若当前身份为制单人，过账按钮会保持禁用。"
          />
          <UAlert
            v-else-if="selected.status === 'posted'"
            color="success"
            variant="soft"
            icon="i-carbon-checkmark-outline"
            title="已过账并同步到总账"
            :description="'总账凭证 ' + (selected.postingNumber ?? '—') + ' 可在总账页签查看来源系统与外部编号。'"
          />
        </div>
      </template>
      <template #footer>
        <div class="flex w-full flex-wrap items-center justify-between gap-2">
          <UButton
            label="关闭"
            color="neutral"
            variant="ghost"
            data-testid="imported-detail-close"
            @click="detailOpen = false"
          />
          <div v-if="selected" class="flex flex-wrap items-center gap-2">
            <UButton
              v-if="selected.status === 'draft'"
              label="提交复核"
              icon="i-carbon-send-alt"
              size="sm"
              data-testid="imported-detail-submit"
              @click="detailDecision('submit')"
            />
            <UButton
              v-if="selected.status === 'draft'"
              label="取消草稿"
              color="neutral"
              variant="outline"
              size="sm"
              :disabled="selected.makerId !== actor.id"
              data-testid="imported-detail-cancel"
              @click="detailDecision('cancel')"
            />
            <UButton
              v-if="selected.status === 'submitted'"
              label="独立过账"
              icon="i-carbon-checkmark"
              color="success"
              size="sm"
              :disabled="selected.makerId === actor.id"
              data-testid="imported-detail-post"
              @click="detailDecision('post')"
            />
            <UButton
              v-if="selected.status === 'draft' && selected.makerId === actor.id"
              label="编辑"
              color="neutral"
              variant="ghost"
              size="sm"
              data-testid="imported-detail-edit"
              @click="detailOpen = false; openEdit(selected)"
            />
          </div>
        </div>
      </template>
    </USlideover>
  </div>
</template>

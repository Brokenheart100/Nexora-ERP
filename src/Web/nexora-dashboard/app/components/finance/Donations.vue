<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type {
  Donation,
  DonationDispatch,
  DonationMethod,
  DonationStatus
} from '~/mocks'
import {
  donationFundAccounts,
  donationMailStateColors,
  donationMailStateLabels,
  donationMethodColors,
  donationMethodLabels,
  donationStatusColors,
  donationStatusLabels,
  partners
} from '~/mocks'

const store = useDonationsStore()
const toast = useToast()

const search = ref('')
const statusFilter = ref<'all' | DonationStatus>('all')
const actorKey = ref<'maker' | 'reviewer'>('maker')
const detailOpen = ref(false)
const selectedId = ref('')
const detailError = ref('')
const formOpen = ref(false)
const formError = ref('')
const formDonorId = ref('')
const formDate = ref('')
const formMethod = ref<DonationMethod>('transfer')
const formAmount = ref('')
const formFundAccountId = ref('ba-2026-01')
const formPurpose = ref('')
const formNote = ref('')
const rejectOpen = ref(false)
const rejectNote = ref('')
const rejectError = ref('')
const reverseOpen = ref(false)
const reverseError = ref('')
const printOpen = ref(false)
const ticketCode = ref('')
const ticketNumber = ref('')
const ticketIssuedOn = ref('')
const ticketError = ref('')
const mailRecipient = ref('')
const mailError = ref('')
const dispatchOpen = ref(false)
const selectedDispatchId = ref('')
const dispatchError = ref('')

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
  { label: '已作废', value: 'reversed' }
]
const fundAccountOptions = donationFundAccounts.map(account => ({
  label: account.name + (account.type === 'cash' ? '（现金）' : '（银行）'),
  value: account.id
}))

const filteredRows = computed(() => {
  const keyword = search.value.trim().toLowerCase()
  return store.rows
    .filter(row => statusFilter.value === 'all' || row.status === statusFilter.value)
    .filter(row =>
      keyword.length === 0
      || row.id.toLowerCase().includes(keyword)
      || row.donorName.includes(keyword)
      || row.purpose.includes(keyword)
      || (row.receiptNumber ?? '').toLowerCase().includes(keyword)
    )
    .slice()
    .sort((a, b) => b.id.localeCompare(a.id))
})
const selected = computed(() => store.donationOf(selectedId.value))
const selectedDonor = computed(() => partners.find(partner => partner.id === selected.value?.donorId) ?? null)
const selectedTickets = computed(() => selected.value ? store.ticketsFor(selected.value.id) : [])
const selectedDispatches = computed(() => selected.value ? store.dispatchesFor(selected.value.id) : [])
const selectedDispatch = computed(() => store.dispatches.find(dispatch => dispatch.id === selectedDispatchId.value) ?? null)
const canReview = computed(() => selected.value?.status === 'submitted' && selected.value.makerId !== actor.value.id)
const isMaker = computed(() => selected.value?.makerId === actor.value.id)

const columns: TableColumn<Donation>[] = [
  { accessorKey: 'id', header: '捐赠单' },
  { accessorKey: 'donorName', header: '捐赠人' },
  { accessorKey: 'date', header: '日期 / 方式' },
  { accessorKey: 'amount', header: '金额', meta: { class: { th: 'text-right', td: 'text-right tabular-nums whitespace-nowrap' } } },
  { accessorKey: 'purpose', header: '用途' },
  { accessorKey: 'status', header: '状态' },
  { accessorKey: 'receiptNumber', header: '收据 / 票据' },
  { id: 'actions', header: '操作', meta: { class: { th: 'text-right', td: 'text-right' } } }
]

const dispatchColumns: TableColumn<DonationDispatch>[] = [
  { accessorKey: 'id', header: '投递记录' },
  { accessorKey: 'recipient', header: '收件人' },
  { accessorKey: 'state', header: '状态' },
  { accessorKey: 'attempt', header: '次数', meta: { class: { th: 'text-right', td: 'text-right tabular-nums' } } },
  { accessorKey: 'updatedAt', header: '更新时间' },
  { id: 'actions', header: '操作', meta: { class: { th: 'text-right', td: 'text-right' } } }
]

function money(value: string | number) {
  return formatMoney(Number(value))
}

function toDateInput() {
  return new Date().toISOString().slice(0, 10)
}

function methodColor(method: DonationMethod) {
  return donationMethodColors[method]
}

function ticketTypeLabel(type: 'fiscal' | 'ordinary') {
  return type === 'fiscal' ? '财政票据（外部已开具）' : '普通捐赠收据'
}

function openDetail(row: Donation) {
  selectedId.value = row.id
  detailError.value = ''
  ticketError.value = ''
  mailError.value = ''
  mailRecipient.value = partners.find(partner => partner.id === row.donorId)?.email ?? ''
  detailOpen.value = true
}

function openCreate() {
  formError.value = ''
  formDonorId.value = store.donorOptions[0]?.value ?? ''
  formDate.value = toDateInput()
  formMethod.value = 'transfer'
  formAmount.value = ''
  formFundAccountId.value = 'ba-2026-01'
  formPurpose.value = ''
  formNote.value = ''
  formOpen.value = true
}

watch(formMethod, (method) => {
  if (method === 'cash') {
    formFundAccountId.value = 'fund-cash'
  } else if (formFundAccountId.value === 'fund-cash') {
    formFundAccountId.value = 'ba-2026-01'
  }
})

function saveDonation(submit: boolean) {
  formError.value = ''
  const result = store.createDonation({
    donorId: formDonorId.value,
    date: formDate.value,
    method: formMethod.value,
    amount: formAmount.value,
    fundAccountId: formFundAccountId.value,
    purpose: formPurpose.value,
    note: formNote.value
  }, actor.value.id, actor.value.name, submit)
  if (!result.ok) {
    formError.value = result.message
    return
  }
  formOpen.value = false
  toast.add({ title: submit ? '捐赠单已提交复核' : '捐赠单草稿已保存', description: result.message, color: 'success', icon: 'i-carbon-gift' })
  if (result.donation) openDetail(result.donation)
}

function approveDonation() {
  if (!selected.value) return
  detailError.value = ''
  const result = store.reviewDonation(selected.value.id, 'approve', actor.value.id, actor.value.name)
  if (!result.ok) {
    detailError.value = result.message
    return
  }
  toast.add({ title: '捐赠复核通过', description: result.message, color: 'success', icon: 'i-carbon-checkmark' })
}

function openReject() {
  rejectNote.value = ''
  rejectError.value = ''
  rejectOpen.value = true
}

function rejectDonation() {
  if (!selected.value) return
  rejectError.value = ''
  const result = store.reviewDonation(selected.value.id, 'reject', actor.value.id, actor.value.name, rejectNote.value)
  if (!result.ok) {
    rejectError.value = result.message
    return
  }
  rejectOpen.value = false
  toast.add({ title: '捐赠单已退回', description: result.message, color: 'success', icon: 'i-carbon-undo' })
}

function openReverse() {
  reverseError.value = ''
  reverseOpen.value = true
}

function reverseDonation() {
  if (!selected.value) return
  reverseError.value = ''
  const result = store.reverseDonation(selected.value.id, actor.value.id, actor.value.name)
  if (!result.ok) {
    reverseError.value = result.message
    return
  }
  reverseOpen.value = false
  toast.add({ title: '捐赠单已作废', description: result.message, color: 'success', icon: 'i-carbon-undo' })
}

function linkTicket() {
  if (!selected.value) return
  ticketError.value = ''
  const result = store.linkFiscalTicket(selected.value.id, {
    code: ticketCode.value,
    number: ticketNumber.value,
    issuedOn: ticketIssuedOn.value
  })
  if (!result.ok) {
    ticketError.value = result.message
    return
  }
  ticketCode.value = ''
  ticketNumber.value = ''
  ticketIssuedOn.value = ''
  toast.add({ title: '财政票据已关联', description: result.message, color: 'success', icon: 'i-carbon-receipt' })
}

function enableChannel() {
  const result = store.enableChannel()
  toast.add({ title: '演示邮件通道已启用', description: result.message, color: 'success', icon: 'i-carbon-email' })
}

function sendReceipt() {
  if (!selected.value) return
  mailError.value = ''
  const result = store.queueMail(selected.value.id, mailRecipient.value)
  if (!result.ok) {
    mailError.value = result.message
    return
  }
  toast.add({ title: '收据邮件已提交', description: result.message, color: 'success', icon: 'i-carbon-email' })
}

function openDispatch(dispatch: DonationDispatch) {
  selectedDispatchId.value = dispatch.id
  dispatchError.value = ''
  dispatchOpen.value = true
}

function dispatchDecision(decision: 'retry' | 'resend' | 'abandon') {
  if (!selectedDispatch.value) return
  dispatchError.value = ''
  const result = store.decideMail(selectedDispatch.value.id, decision)
  if (!result.ok) {
    dispatchError.value = result.message
    return
  }
  if (decision === 'resend' && result.dispatch) selectedDispatchId.value = result.dispatch.id
  toast.add({ title: '投递状态已更新', description: result.message, color: 'success', icon: 'i-carbon-email' })
}

function openReversal() {
  const target = selected.value?.reversalId
  if (!target) return
  const donation = store.donationOf(target)
  if (donation) openDetail(donation)
}
</script>

<template>
  <div class="space-y-4" data-testid="finance-donations">
    <UAlert
      color="info"
      variant="soft"
      icon="i-carbon-gift"
      title="C11 捐赠收据、财政票据与邮件投递"
      description="捐赠单由制单人登记、独立复核后过账并生成普通收据。法定财政票据只登记外部已开具的票据代码与号码，本工作区不能签发。收据邮件按捐赠人档案联系人校验，失败与结果未知记录可重试、补发或放弃。"
    />

    <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <div class="rounded-sm border border-default bg-default p-3">
        <p class="text-xs text-muted">
          已过账捐赠合计
        </p><p class="mt-1 text-2xl font-semibold tabular-nums" data-testid="donation-stat-posted">
          {{ money(store.postedTotal) }}
        </p><p class="mt-0.5 text-[11px] text-muted">
          含冲销记录后的净额
        </p>
      </div>
      <div class="rounded-sm border border-default bg-default p-3">
        <p class="text-xs text-muted">
          待独立复核
        </p><p class="mt-1 text-2xl font-semibold tabular-nums" data-testid="donation-stat-submitted">
          {{ store.submittedCount }}
        </p><p class="mt-0.5 text-[11px] text-muted">
          制单人不能自行复核
        </p>
      </div>
      <div class="rounded-sm border border-default bg-default p-3">
        <p class="text-xs text-muted">
          已作废
        </p><p class="mt-1 text-2xl font-semibold tabular-nums" data-testid="donation-stat-reversed">
          {{ store.reversedCount }}
        </p><p class="mt-0.5 text-[11px] text-muted">
          保留原单与冲销记录
        </p>
      </div>
      <div class="rounded-sm border border-default bg-default p-3">
        <p class="text-xs text-muted">
          投递异常
        </p><p class="mt-1 text-2xl font-semibold tabular-nums" data-testid="donation-stat-mail-issue">
          {{ store.mailIssueCount }}
        </p><p class="mt-0.5 text-[11px] text-muted">
          失败或结果未知
        </p>
      </div>
    </div>

    <UDashboardPanel>
      <template #header>
        <div class="flex w-full flex-wrap items-center justify-between gap-3">
          <div>
            <p class="text-sm font-semibold text-highlighted">
              捐赠记录
            </p>
            <p class="mt-0.5 text-xs text-muted">
              普通收据与外部财政票据分别追溯 · 过账后可预览演示收据
            </p>
          </div>
          <UButton
            label="登记捐赠"
            icon="i-carbon-add"
            data-testid="donation-new"
            @click="openCreate"
          />
        </div>
      </template>
      <template #body>
        <div class="space-y-3">
          <div class="flex flex-wrap items-end gap-2">
            <UFormField label="搜索" class="min-w-[220px] flex-1">
              <UInput
                v-model="search"
                icon="i-carbon-search"
                placeholder="捐赠单号、捐赠人、用途或收据号"
                data-testid="donation-search"
              />
            </UFormField>
            <UFormField label="状态">
              <USelect
                v-model="statusFilter"
                :items="statusOptions"
                class="w-36"
                data-testid="donation-status-filter"
              />
            </UFormField>
            <div class="flex items-center gap-2 pb-2">
              <span class="text-xs text-muted">当前演示身份</span>
              <UButton
                size="xs"
                :variant="actorKey === 'maker' ? 'solid' : 'outline'"
                :color="actorKey === 'maker' ? 'primary' : 'neutral'"
                label="张明远 · 制单人"
                data-testid="donation-actor-maker"
                @click="actorKey = 'maker'"
              />
              <UButton
                size="xs"
                :variant="actorKey === 'reviewer' ? 'solid' : 'outline'"
                :color="actorKey === 'reviewer' ? 'primary' : 'neutral'"
                label="陈立 · 财务负责人"
                data-testid="donation-actor-reviewer"
                @click="actorKey = 'reviewer'"
              />
            </div>
          </div>

          <div class="rounded-sm border border-default">
            <ResizableTable
              :data="filteredRows"
              :columns="columns"
              class="nx-table"
              :ui="{ th: 'py-2.5', td: 'py-2.5' }"
              :row-activate="openDetail"
              data-testid="donation-table"
            >
              <template #id-cell="{ row }">
                <p class="font-medium text-highlighted">
                  {{ row.original.id }}
                </p>
                <p class="mt-0.5 text-[11px] text-muted">
                  制单 {{ row.original.makerName }} · v{{ row.original.version }}
                </p>
                <p v-if="row.original.reversalOf" class="mt-0.5 text-[11px] text-warning">
                  冲销 {{ row.original.reversalOf }}
                </p>
              </template>
              <template #donorName-cell="{ row }">
                <p class="font-medium text-highlighted">
                  {{ row.original.donorName }}
                </p>
                <p class="mt-0.5 font-mono text-[11px] text-muted">
                  {{ row.original.donorCode }}
                </p>
              </template>
              <template #date-cell="{ row }">
                <p class="tabular-nums">
                  {{ row.original.date }}
                </p>
                <UBadge
                  :label="donationMethodLabels[row.original.method]"
                  :color="methodColor(row.original.method)"
                  variant="subtle"
                  size="sm"
                  class="mt-0.5"
                />
              </template>
              <template #amount-cell="{ row }">
                <span class="tabular-nums" :class="Number(row.original.amount) < 0 ? 'text-warning' : ''">
                  {{ money(row.original.amount) }}
                </span>
              </template>
              <template #purpose-cell="{ row }">
                <p class="max-w-[220px] truncate text-[13px]" :title="row.original.purpose">
                  {{ row.original.purpose }}
                </p>
              </template>
              <template #status-cell="{ row }">
                <UBadge
                  :label="donationStatusLabels[row.original.status]"
                  :color="donationStatusColors[row.original.status]"
                  variant="subtle"
                  size="sm"
                  :data-testid="'donation-status-' + row.original.id"
                />
              </template>
              <template #receiptNumber-cell="{ row }">
                <p v-if="row.original.receiptNumber" class="text-xs">
                  {{ row.original.receiptNumber }}
                </p>
                <p v-else class="text-xs text-muted">
                  尚未生成
                </p>
                <UBadge
                  v-if="store.ticketsFor(row.original.id).length"
                  label="财政票据"
                  color="info"
                  variant="subtle"
                  size="sm"
                  class="mt-1"
                />
              </template>
              <template #actions-cell="{ row }">
                <UButton
                  label="详情"
                  size="xs"
                  color="neutral"
                  variant="ghost"
                  :data-testid="'donation-open-' + row.original.id"
                  @click="openDetail(row.original)"
                />
              </template>
            </ResizableTable>
            <div v-if="filteredRows.length === 0" class="border-t border-default p-6 text-center text-sm text-muted">
              没有符合条件的捐赠记录。
            </div>
          </div>
        </div>
      </template>
    </UDashboardPanel>

    <USlideover v-model:open="detailOpen" :ui="{ content: 'sm:max-w-4xl' }">
      <template #header>
        <div class="flex min-w-0 items-center justify-between gap-3">
          <div class="min-w-0">
            <p class="truncate text-sm font-semibold text-highlighted">
              捐赠详情
            </p>
            <p v-if="selected" class="mt-0.5 truncate text-xs text-muted">
              {{ selected.id }} · {{ selected.donorName }}
            </p>
          </div>
          <UBadge
            v-if="selected"
            :label="donationStatusLabels[selected.status]"
            :color="donationStatusColors[selected.status]"
            variant="subtle"
            size="sm"
          />
        </div>
      </template>
      <template #body>
        <div v-if="selected" class="space-y-4" data-testid="donation-detail">
          <UAlert
            v-if="detailError"
            color="error"
            variant="soft"
            icon="i-carbon-warning-alt"
            :title="detailError"
            data-testid="donation-detail-error"
          />
          <UAlert
            v-if="selected.rejection"
            color="warning"
            variant="soft"
            icon="i-carbon-undo"
            title="复核退回原因"
            :description="selected.rejection"
            data-testid="donation-rejection"
          />

          <div class="grid gap-3 sm:grid-cols-4">
            <div class="rounded-sm border border-default p-3">
              <p class="text-xs text-muted">
                捐赠金额
              </p><p class="mt-1 text-lg font-semibold tabular-nums" data-testid="donation-detail-amount">
                {{ money(selected.amount) }}
              </p>
            </div>
            <div class="rounded-sm border border-default p-3">
              <p class="text-xs text-muted">
                捐赠日期
              </p><p class="mt-1 tabular-nums" data-testid="donation-detail-date">
                {{ selected.date }}
              </p>
            </div>
            <div class="rounded-sm border border-default p-3">
              <p class="text-xs text-muted">
                方式 / 资金账户
              </p><p class="mt-1 text-sm" data-testid="donation-detail-method">
                {{ donationMethodLabels[selected.method] }}
              </p><p class="text-xs text-muted">
                {{ selected.fundAccountName }}
              </p>
            </div>
            <div class="rounded-sm border border-default p-3">
              <p class="text-xs text-muted">
                版本
              </p><p class="mt-1 font-semibold tabular-nums">
                v{{ selected.version }}
              </p>
            </div>
          </div>

          <div class="rounded-sm border border-default p-3">
            <p class="text-xs text-muted">
              捐赠人 / 用途
            </p>
            <p class="mt-1 font-medium text-highlighted" data-testid="donation-detail-donor">
              {{ selected.donorName }} · {{ selected.donorCode }}
            </p>
            <p class="mt-1 text-sm" data-testid="donation-detail-purpose">
              {{ selected.purpose }}
            </p>
            <p v-if="selected.note" class="mt-1 text-xs text-muted">
              {{ selected.note }}
            </p>
            <p class="mt-2 text-xs text-muted">
              制单 {{ selected.makerName }} · {{ selected.createdAt }}
              <span v-if="selected.reviewerName"> · 复核 {{ selected.reviewerName }} · {{ selected.postedAt }}</span>
            </p>
          </div>

          <div v-if="selected.status === 'submitted'" class="rounded-sm border border-warning/40 bg-warning/5 p-3">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p class="text-sm font-medium text-highlighted">
                  待独立复核
                </p><p class="mt-0.5 text-xs text-muted">
                  当前身份 {{ actor.label }}；制单人 {{ selected.makerName }} 不能复核自己的捐赠单。
                </p>
              </div>
              <div class="flex gap-2">
                <UButton
                  label="退回修改"
                  color="neutral"
                  variant="outline"
                  size="sm"
                  :disabled="!canReview"
                  data-testid="donation-review-reject"
                  @click="openReject"
                />
                <UButton
                  label="复核通过并过账"
                  icon="i-carbon-checkmark"
                  color="success"
                  size="sm"
                  :disabled="!canReview"
                  data-testid="donation-review-approve"
                  @click="approveDonation"
                />
              </div>
            </div>
          </div>

          <div class="grid gap-3 lg:grid-cols-2">
            <div class="rounded-sm border border-default p-3" data-testid="donation-receipt">
              <div class="flex items-center justify-between">
                <p class="text-xs font-medium text-muted">
                  普通捐赠收据
                </p>
                <UBadge
                  label="普通收据"
                  color="neutral"
                  variant="subtle"
                  size="sm"
                />
              </div>
              <p v-if="selected.receiptNumber" class="mt-2 font-mono text-sm text-highlighted" data-testid="donation-receipt-number">
                {{ selected.receiptNumber }}
              </p>
              <p v-else class="mt-2 text-sm text-muted" data-testid="donation-receipt-number">
                复核过账后生成
              </p>
              <div class="mt-3 flex flex-wrap gap-2">
                <UButton
                  label="预览演示收据"
                  icon="i-carbon-document"
                  size="sm"
                  color="neutral"
                  variant="outline"
                  :disabled="!selected.receiptNumber"
                  data-testid="donation-receipt-open"
                  @click="printOpen = true"
                />
                <UBadge
                  v-if="selected.reversalOf"
                  label="冲销记录"
                  color="warning"
                  variant="subtle"
                  size="sm"
                />
              </div>
              <p class="mt-2 text-[11px] text-muted">
                本工作区不支持法定捐赠票据签发，演示收据不具备税前扣除效力。
              </p>
            </div>

            <div class="rounded-sm border border-default p-3" data-testid="donation-fiscal-ticket">
              <div class="flex items-center justify-between">
                <p class="text-xs font-medium text-muted">
                  财政票据
                </p>
                <UBadge
                  :label="selectedTickets.length ? '已关联外部票据' : '未关联'"
                  :color="selectedTickets.length ? 'info' : 'neutral'"
                  variant="subtle"
                  size="sm"
                  data-testid="donation-ticket-state"
                />
              </div>
              <div
                v-for="ticket in selectedTickets"
                :key="ticket.id"
                class="mt-2 rounded-sm bg-elevated/50 p-2 text-xs"
                data-testid="donation-ticket-record"
              >
                <p class="font-mono text-highlighted">
                  {{ ticket.code }} / {{ ticket.number }}
                </p>
                <p class="mt-0.5 text-muted">
                  {{ ticketTypeLabel(ticket.type) }} · 开具 {{ ticket.issuedOn }} · 关联 {{ ticket.linkedAt }}
                </p>
              </div>
              <p v-if="!store.statutoryReceiptAvailable" class="mt-2 text-[11px] text-muted" data-testid="donation-ticket-capability">
                能力样例：法定财政票据不可签发，仅登记外部已开具票据。
              </p>
              <div v-if="selected.status === 'posted' && !selected.reversalOf && selectedTickets.length === 0" class="mt-3 space-y-2">
                <UAlert
                  v-if="ticketError"
                  color="error"
                  variant="soft"
                  :title="ticketError"
                  data-testid="donation-ticket-error"
                />
                <div class="grid gap-2 sm:grid-cols-3">
                  <UInput
                    v-model="ticketCode"
                    placeholder="票据代码"
                    size="sm"
                    data-testid="donation-ticket-code"
                  />
                  <UInput
                    v-model="ticketNumber"
                    placeholder="票据号码"
                    size="sm"
                    data-testid="donation-ticket-number"
                  />
                  <UInput
                    v-model="ticketIssuedOn"
                    type="date"
                    size="sm"
                    data-testid="donation-ticket-date"
                  />
                </div>
                <UButton
                  label="关联外部财政票据"
                  icon="i-carbon-link"
                  size="xs"
                  color="neutral"
                  variant="outline"
                  data-testid="donation-ticket-link"
                  @click="linkTicket"
                />
              </div>
            </div>
          </div>

          <div class="grid gap-3 lg:grid-cols-2">
            <div class="rounded-sm border border-default p-3">
              <p class="text-xs font-medium text-muted">
                资金流水
              </p>
              <template v-if="selected.fundFlow">
                <p class="mt-2 text-sm" data-testid="donation-fund-flow">
                  {{ selected.fundFlow.id }} · {{ selected.fundFlow.accountName }}
                </p>
                <p class="mt-1 text-xs text-muted">
                  {{ selected.fundFlow.direction === 'in' ? '收入' : '支出' }} {{ money(selected.fundFlow.amount) }} · {{ selected.fundFlow.date }}
                </p>
                <ULink to="/finance?tab=bank" class="mt-2 inline-flex items-center gap-1 text-xs text-primary" data-testid="donation-fund-link">
                  查看银行现金流水 <UIcon name="i-carbon-arrow-up-right" class="size-3" />
                </ULink>
              </template>
              <p v-else class="mt-2 text-sm text-muted" data-testid="donation-fund-flow">
                复核过账后生成
              </p>
            </div>
            <div class="rounded-sm border border-default p-3">
              <p class="text-xs font-medium text-muted">
                记账凭证
              </p>
              <p v-if="selected.journalId" class="mt-2 font-mono text-sm" data-testid="donation-journal">
                {{ selected.journalId }}
              </p>
              <p v-else class="mt-2 text-sm text-muted" data-testid="donation-journal">
                复核过账后生成
              </p>
              <ULink
                v-if="selected.journalId"
                to="/finance?tab=journals"
                class="mt-2 inline-flex items-center gap-1 text-xs text-primary"
                data-testid="donation-journal-link"
              >
                查看总账凭证 <UIcon name="i-carbon-arrow-up-right" class="size-3" />
              </ULink>
            </div>
          </div>

          <UAlert
            v-if="selected.status === 'reversed'"
            color="warning"
            variant="soft"
            icon="i-carbon-undo"
            title="原捐赠单已作废"
            :description="'作废时间 ' + (selected.reversedAt ?? '—') + '，冲销记录 ' + (selected.reversalId ?? '—') + ' 保持已过账。'"
            data-testid="donation-reversed-alert"
          >
            <template #actions>
              <UButton
                label="查看冲销记录"
                size="xs"
                color="warning"
                variant="outline"
                data-testid="donation-reversal-link"
                @click="openReversal"
              />
            </template>
          </UAlert>
          <UAlert
            v-if="selected.reversalOf"
            color="neutral"
            variant="soft"
            icon="i-carbon-link"
            title="这是作废产生的冲销记录"
            :description="'对应原捐赠单 ' + selected.reversalOf + '，金额为负以冲回原确认。'"
            data-testid="donation-reversal-of"
          >
            <template #actions>
              <UButton
                label="查看原捐赠单"
                size="xs"
                color="neutral"
                variant="outline"
                data-testid="donation-original-link"
                @click="selectedId = selected.reversalOf ?? selectedId; mailRecipient = partners.find(partner => partner.id === selected?.donorId)?.email ?? ''"
              />
            </template>
          </UAlert>

          <UDashboardPanel>
            <template #header>
              <div class="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p class="text-sm font-semibold text-highlighted">
                    收据邮件投递
                  </p>
                  <p class="mt-0.5 text-xs text-muted">
                    收件人必须与捐赠人档案联系人一致
                  </p>
                </div>
                <UBadge
                  :label="store.channel.status === 'active' ? '演示通道已启用' : '演示通道已停用'"
                  :color="store.channel.status === 'active' ? 'success' : 'warning'"
                  variant="subtle"
                  size="sm"
                  data-testid="donation-channel-state"
                />
              </div>
            </template>
            <template #body>
              <div class="space-y-3">
                <UAlert
                  v-if="store.channel.status === 'disabled'"
                  color="warning"
                  variant="soft"
                  icon="i-carbon-email"
                  title="邮件通道已停用"
                  :description="store.channel.reason"
                  data-testid="donation-channel-reason"
                >
                  <template #actions>
                    <UButton
                      label="启用本地演示通道"
                      size="xs"
                      color="warning"
                      variant="outline"
                      data-testid="donation-channel-enable"
                      @click="enableChannel"
                    />
                  </template>
                </UAlert>
                <div class="flex flex-wrap items-end gap-2">
                  <UFormField label="收件人" class="min-w-[260px] flex-1">
                    <UInput
                      v-model="mailRecipient"
                      placeholder="捐赠人档案联系人邮箱"
                      data-testid="donation-mail-recipient"
                    />
                  </UFormField>
                  <UButton
                    label="发送普通收据"
                    icon="i-carbon-email"
                    size="sm"
                    :disabled="selected.status !== 'posted'"
                    data-testid="donation-mail-send"
                    @click="sendReceipt"
                  />
                </div>
                <p v-if="selectedDonor" class="text-[11px] text-muted">
                  档案联系人 {{ selectedDonor.contact }} · {{ selectedDonor.email }}
                </p>
                <UAlert
                  v-if="mailError"
                  color="error"
                  variant="soft"
                  :title="mailError"
                  data-testid="donation-mail-error"
                />
                <div class="rounded-sm border border-default">
                  <ResizableTable
                    :data="selectedDispatches"
                    :columns="dispatchColumns"
                    class="nx-table"
                    :ui="{ th: 'py-2', td: 'py-2' }"
                    data-testid="donation-dispatches"
                  >
                    <template #id-cell="{ row }">
                      <p class="font-mono text-xs text-highlighted">
                        {{ row.original.id }}
                      </p>
                      <p v-if="row.original.previousId" class="mt-0.5 text-[11px] text-muted">
                        原记录 {{ row.original.previousId }}
                      </p>
                    </template>
                    <template #state-cell="{ row }">
                      <UBadge
                        :label="donationMailStateLabels[row.original.state]"
                        :color="donationMailStateColors[row.original.state]"
                        variant="subtle"
                        size="sm"
                        :data-testid="'donation-dispatch-state-' + row.original.id"
                      />
                      <p v-if="row.original.failureReason" class="mt-1 max-w-[220px] text-[11px] text-error">
                        {{ row.original.failureReason }}
                      </p>
                    </template>
                    <template #actions-cell="{ row }">
                      <UButton
                        label="详情"
                        size="xs"
                        color="neutral"
                        variant="ghost"
                        :data-testid="'donation-dispatch-open-' + row.original.id"
                        @click="openDispatch(row.original)"
                      />
                    </template>
                  </ResizableTable>
                  <div v-if="selectedDispatches.length === 0" class="border-t border-default p-4 text-center text-xs text-muted">
                    尚未发送普通收据邮件。
                  </div>
                </div>
              </div>
            </template>
          </UDashboardPanel>
        </div>
      </template>
      <template #footer>
        <div class="flex w-full flex-wrap items-center justify-between gap-2">
          <div class="flex items-center gap-2">
            <UButton
              label="关闭"
              color="neutral"
              variant="ghost"
              data-testid="donation-detail-close"
              @click="detailOpen = false"
            />
            <span class="text-[11px] text-muted">当前身份 {{ actor.label }}</span>
          </div>
          <div class="flex items-center gap-2">
            <UButton
              v-if="selected?.status === 'submitted' && isMaker"
              label="制单人不能复核"
              size="sm"
              color="neutral"
              variant="ghost"
              disabled
              data-testid="donation-self-review-hint"
            />
            <UButton
              v-if="selected?.status === 'posted' && !selected.reversalOf"
              label="作废捐赠单"
              icon="i-carbon-close-outline"
              color="error"
              variant="outline"
              size="sm"
              data-testid="donation-reverse"
              @click="openReverse"
            />
          </div>
        </div>
      </template>
    </USlideover>

    <USlideover v-model:open="formOpen" :ui="{ content: 'sm:max-w-2xl' }">
      <template #header>
        <div>
          <p class="text-sm font-semibold text-highlighted">
            登记捐赠
          </p>
          <p class="mt-0.5 text-xs text-muted">
            现金只能进入现金账户；支票、银行卡与转账只能进入银行账户。
          </p>
        </div>
      </template>
      <template #body>
        <div class="space-y-4" data-testid="donation-form">
          <UAlert
            v-if="formError"
            color="error"
            variant="soft"
            icon="i-carbon-warning-alt"
            :title="formError"
            data-testid="donation-form-error"
          />
          <div class="grid gap-3 sm:grid-cols-2">
            <UFormField label="捐赠人" required>
              <USelect
                v-model="formDonorId"
                :items="store.donorOptions"
                class="w-full"
                data-testid="donation-form-donor"
              />
            </UFormField>
            <UFormField label="捐赠日期" required>
              <UInput
                v-model="formDate"
                type="date"
                class="w-full"
                data-testid="donation-form-date"
              />
            </UFormField>
            <UFormField label="捐赠方式" required>
              <USelect
                v-model="formMethod"
                :items="Object.entries(donationMethodLabels).map(([value, label]) => ({ value, label }))"
                class="w-full"
                data-testid="donation-form-method"
              />
            </UFormField>
            <UFormField label="金额" required>
              <UInput
                v-model="formAmount"
                type="number"
                step="0.01"
                min="0"
                class="w-full text-right"
                data-testid="donation-form-amount"
              />
            </UFormField>
            <UFormField label="资金账户" required>
              <USelect
                v-model="formFundAccountId"
                :items="fundAccountOptions"
                class="w-full"
                data-testid="donation-form-account"
              />
            </UFormField>
            <UFormField label="用途" required>
              <UInput
                v-model="formPurpose"
                placeholder="例如 社区养老服务设备"
                class="w-full"
                data-testid="donation-form-purpose"
              />
            </UFormField>
          </div>
          <UFormField label="备注">
            <UTextarea
              v-model="formNote"
              :rows="2"
              class="w-full"
              data-testid="donation-form-note"
            />
          </UFormField>
          <UAlert
            color="neutral"
            variant="soft"
            icon="i-carbon-information"
            title="复核与收据"
            description="保存草稿后可稍后提交；提交后必须切换到陈立（财务负责人）复核。过账时生成普通收据号、资金流水和记账凭证。"
          />
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton
            label="取消"
            color="neutral"
            variant="ghost"
            data-testid="donation-form-cancel"
            @click="formOpen = false"
          />
          <UButton
            label="保存草稿"
            color="neutral"
            variant="outline"
            data-testid="donation-form-save"
            @click="saveDonation(false)"
          />
          <UButton
            label="提交复核"
            icon="i-carbon-send-alt"
            data-testid="donation-form-submit"
            @click="saveDonation(true)"
          />
        </div>
      </template>
    </USlideover>

    <UModal v-model:open="rejectOpen">
      <template #header>
        <p class="text-sm font-semibold text-highlighted">
          退回捐赠单
        </p>
      </template>
      <template #body>
        <div class="space-y-3" data-testid="donation-reject-form">
          <UAlert
            v-if="rejectError"
            color="error"
            variant="soft"
            :title="rejectError"
            data-testid="donation-reject-error"
          />
          <UFormField label="退回原因" required>
            <UTextarea
              v-model="rejectNote"
              :rows="3"
              placeholder="说明需要制单人修改的内容"
              class="w-full"
              data-testid="donation-reject-note"
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
            data-testid="donation-reject-cancel"
            @click="rejectOpen = false"
          />
          <UButton
            label="确认退回"
            color="warning"
            data-testid="donation-reject-submit"
            @click="rejectDonation"
          />
        </div>
      </template>
    </UModal>

    <UModal v-model:open="reverseOpen">
      <template #header>
        <p class="text-sm font-semibold text-highlighted">
          作废捐赠单
        </p>
      </template>
      <template #body>
        <div class="space-y-3" data-testid="donation-reverse-confirm">
          <UAlert
            v-if="reverseError"
            color="error"
            variant="soft"
            :title="reverseError"
            data-testid="donation-reverse-error"
          />
          <UAlert
            color="warning"
            variant="soft"
            icon="i-carbon-warning-alt"
            title="将保留原单并生成负额冲销记录"
            description="原捐赠单状态变为已作废，冲销记录保持已过账；普通收据与财政票据关联不会被删除。"
          />
          <p class="text-sm text-muted">
            确认作废 {{ selected?.id }}（{{ selected?.donorName }}，{{ selected ? money(selected.amount) : '' }}）？
          </p>
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton
            label="取消"
            color="neutral"
            variant="ghost"
            data-testid="donation-reverse-cancel"
            @click="reverseOpen = false"
          />
          <UButton
            label="确认作废"
            color="error"
            data-testid="donation-reverse-submit"
            @click="reverseDonation"
          />
        </div>
      </template>
    </UModal>

    <UModal v-model:open="dispatchOpen" :ui="{ content: 'sm:max-w-xl' }">
      <template #header>
        <div>
          <p class="text-sm font-semibold text-highlighted">
            收据邮件投递详情
          </p>
          <p v-if="selectedDispatch" class="mt-0.5 font-mono text-xs text-muted">
            {{ selectedDispatch.id }}
          </p>
        </div>
      </template>
      <template #body>
        <div v-if="selectedDispatch" class="space-y-3" data-testid="donation-dispatch-detail">
          <UAlert
            v-if="dispatchError"
            color="error"
            variant="soft"
            :title="dispatchError"
            data-testid="donation-dispatch-error"
          />
          <div class="grid gap-2 sm:grid-cols-2">
            <div class="rounded-sm border border-default p-3">
              <p class="text-xs text-muted">
                状态
              </p><UBadge
                :label="donationMailStateLabels[selectedDispatch.state]"
                :color="donationMailStateColors[selectedDispatch.state]"
                variant="subtle"
                size="sm"
                class="mt-1"
                data-testid="donation-dispatch-detail-state"
              />
            </div>
            <div class="rounded-sm border border-default p-3">
              <p class="text-xs text-muted">
                收件人
              </p><p class="mt-1 text-sm" data-testid="donation-dispatch-detail-recipient">
                {{ selectedDispatch.recipient }}
              </p>
            </div>
            <div class="rounded-sm border border-default p-3">
              <p class="text-xs text-muted">
                投递次数 / 版本
              </p><p class="mt-1 tabular-nums">
                {{ selectedDispatch.attempt }} 次 · v{{ selectedDispatch.version }}
              </p>
            </div>
            <div class="rounded-sm border border-default p-3">
              <p class="text-xs text-muted">
                更新时间
              </p><p class="mt-1 tabular-nums">
                {{ selectedDispatch.updatedAt }}
              </p>
            </div>
          </div>
          <div class="rounded-sm border border-default p-3">
            <p class="text-xs text-muted">
              处理说明
            </p><p class="mt-1 text-sm" data-testid="donation-dispatch-detail-message">
              {{ selectedDispatch.detail }}
            </p>
            <p v-if="selectedDispatch.failureReason" class="mt-2 text-xs text-error">
              {{ selectedDispatch.failureReason }}
            </p>
            <p v-if="selectedDispatch.previousId" class="mt-2 text-xs" data-testid="donation-dispatch-detail-previous">
              关联原记录 {{ selectedDispatch.previousId }}
            </p>
            <p v-if="selectedDispatch.resentAsId" class="mt-2 text-xs" data-testid="donation-dispatch-detail-next">
              已补发为 {{ selectedDispatch.resentAsId }}
            </p>
          </div>
          <div class="flex flex-wrap gap-2">
            <UButton
              v-if="selectedDispatch.state === 'failed'"
              label="重试"
              icon="i-carbon-restart"
              size="sm"
              data-testid="donation-dispatch-retry"
              @click="dispatchDecision('retry')"
            />
            <UButton
              v-if="selectedDispatch.state === 'sent' || selectedDispatch.state === 'unknown'"
              label="补发"
              icon="i-carbon-send-alt"
              size="sm"
              color="neutral"
              variant="outline"
              :disabled="Boolean(selectedDispatch.resentAsId)"
              data-testid="donation-dispatch-resend"
              @click="dispatchDecision('resend')"
            />
            <UButton
              v-if="['queued', 'sending', 'failed', 'unknown'].includes(selectedDispatch.state)"
              label="放弃本次投递"
              icon="i-carbon-close-outline"
              size="sm"
              color="error"
              variant="outline"
              data-testid="donation-dispatch-abandon"
              @click="dispatchDecision('abandon')"
            />
          </div>
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-end">
          <UButton
            label="关闭"
            color="neutral"
            variant="ghost"
            data-testid="donation-dispatch-close"
            @click="dispatchOpen = false"
          />
        </div>
      </template>
    </UModal>

    <PrintPreviewSlideover
      v-model:open="printOpen"
      title="普通捐赠收据（演示样张）"
      alert-description="本页为纯前端演示样张，不具备法定财政票据或税前扣除凭证效力。"
      empty-title="暂未生成收据"
      empty-description="捐赠单复核过账后会生成普通捐赠收据号。"
      :has-document="Boolean(selected?.receiptNumber)"
      test-id="donation-print-preview"
      alert-test-id="donation-print-alert"
      close-test-id="donation-print-close"
      print-test-id="donation-print-trigger"
    >
      <div v-if="selected" class="space-y-5 text-neutral-900" data-testid="donation-receipt-sample">
        <div class="flex items-start justify-between border-b border-neutral-300 pb-4">
          <div>
            <p class="text-xs tracking-[0.3em] text-neutral-500">
              NEXORA · ORDINARY DONATION RECEIPT
            </p>
            <h2 class="mt-2 text-2xl font-semibold">
              普通捐赠收据
            </h2>
            <p class="mt-1 text-xs text-neutral-500">
              演示样张 · 非财政票据
            </p>
          </div>
          <div class="text-right text-xs text-neutral-500">
            <p>收据号</p>
            <p class="mt-1 font-mono text-sm text-neutral-900">
              {{ selected.receiptNumber }}
            </p>
          </div>
        </div>
        <div class="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p class="text-xs text-neutral-500">
              捐赠人
            </p><p class="mt-1 font-medium">
              {{ selected.donorName }}
            </p><p class="text-xs text-neutral-500">
              {{ selected.donorCode }}
            </p>
          </div>
          <div>
            <p class="text-xs text-neutral-500">
              捐赠日期 / 方式
            </p><p class="mt-1">
              {{ selected.date }} · {{ donationMethodLabels[selected.method] }}
            </p>
          </div>
          <div>
            <p class="text-xs text-neutral-500">
              资金账户
            </p><p class="mt-1">
              {{ selected.fundAccountName }}
            </p>
          </div>
          <div>
            <p class="text-xs text-neutral-500">
              记账凭证
            </p><p class="mt-1 font-mono">
              {{ selected.journalId }}
            </p>
          </div>
        </div>
        <div class="rounded-sm border border-neutral-300 p-4">
          <p class="text-xs text-neutral-500">
            捐赠用途
          </p><p class="mt-1 text-sm">
            {{ selected.purpose }}
          </p>
          <p class="mt-4 text-xs text-neutral-500">
            金额（人民币）
          </p><p class="mt-1 text-2xl font-semibold tabular-nums">
            {{ money(selected.amount) }}
          </p>
        </div>
        <div class="grid grid-cols-2 gap-8 pt-6 text-xs text-neutral-500">
          <div class="border-t border-neutral-300 pt-2">
            收款单位（演示）
          </div>
          <div class="border-t border-neutral-300 pt-2">
            经办人 / 复核人
          </div>
        </div>
      </div>
    </PrintPreviewSlideover>
  </div>
</template>

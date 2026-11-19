<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type {
  BillingCardBehavior,
  BillingCenterInvoice,
  BillingCenterPlan,
  BillingCycle,
  BillingEntitlementRow,
  BillingInvoiceStatus,
  BillingPaymentMethod,
  BillingTestCard
} from '~/mocks/billingCenter'
import {
  BILLING_DEMO_TODAY,
  billingCenterPlans,
  billingCycleLabels,
  billingEntitlementStateColors,
  billingEntitlementStateLabels,
  billingInvoiceStatusColors,
  billingInvoiceStatusLabels,
  billingPlanById,
  billingPlanPrice,
  billingTestCards
} from '~/mocks/billingCenter'

type InvoiceFilter = 'all' | 'paid' | 'unpaid' | 'failed'

const today = BILLING_DEMO_TODAY
const toast = useToast()
const workspaceStore = useWorkspaceStore()
const { workspace, activeWorkspaceId } = useMockWorkspace()
const {
  subscription,
  currentPlan,
  scheduledPlan,
  remainingDays,
  entitlements,
  usageRows,
  usageWarnings,
  workspaceSummaries,
  targetPlanId,
  targetCycle,
  quote,
  quoteStale,
  canGenerateQuote,
  selectedInvoiceId,
  generateQuote,
  discardQuote,
  confirmQuote,
  targetScheduledPlan,
  cancelScheduled,
  cancelSubscription,
  restoreSubscription,
  payWithTestCard,
  registerManualPayment,
  validateReference,
  resetDemoData
} = useBillingCenter()

const billingPlans = billingCenterPlans
type SubscriptionStatus = 'active' | 'cancelled'
const subscriptionStatusLabels: Record<SubscriptionStatus, string> = {
  active: '生效中',
  cancelled: '已取消自动续费'
}
const paymentMethodLabels: Record<BillingPaymentMethod, string> = {
  'test-card': '测试卡',
  'manual': '手工登记付款',
  'credit': '抵扣结清'
}

// —— 当前订阅与待生效套餐 ——
const targetPlan = computed(() => billingPlanById(targetPlanId.value))
const quoteTargetPlan = computed(() => (quote.value ? billingPlanById(quote.value.targetPlanId) : null))
const unpaidInvoices = computed(() => subscription.value.invoices.filter(item => item.status !== 'paid'))

function planPrice(plan: BillingCenterPlan) {
  return billingPlanPrice(plan, targetCycle.value)
}

function selectCycle(value: BillingCycle) {
  targetCycle.value = value
}

function selectPlan(planId: string) {
  if (planId === currentPlan.value.id) return
  targetPlanId.value = planId
}

function subscriptionStatusColor(): 'success' | 'warning' {
  return subscription.value.status === 'active' ? 'success' : 'warning'
}

function usageColor(percent: number): 'primary' | 'warning' | 'error' {
  if (percent >= 95) return 'error'
  if (percent >= 80) return 'warning'
  return 'primary'
}

function scrollToPlans() {
  document.getElementById('billing-plan-list')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

function onSubscriptionAction() {
  if (subscription.value.status === 'active') {
    cancelOpen.value = true
    return
  }
  askRestore()
}

function askRestore() {
  const result = restoreSubscription()
  toast.add({
    title: result.ok ? '已恢复自动续费' : '无法恢复自动续费',
    description: result.message,
    color: result.ok ? 'success' : 'warning',
    icon: result.ok ? 'i-carbon-checkmark' : 'i-carbon-warning-alt'
  })
}

function askCancelScheduled() {
  const result = cancelScheduled()
  toast.add({
    title: result.ok ? '已取消待生效套餐' : '无法取消待生效套餐',
    description: result.message,
    color: result.ok ? 'success' : 'warning',
    icon: result.ok ? 'i-carbon-checkmark' : 'i-carbon-warning-alt'
  })
}

function askScheduledQuote() {
  const result = targetScheduledPlan()
  if (!result) {
    toast.add({
      title: '没有可报价的待生效套餐',
      description: '待生效套餐与当前套餐一致或已取消，请先在下方选择套餐。',
      color: 'warning',
      icon: 'i-carbon-warning-alt'
    })
    return
  }
  toast.add({
    title: '已生成待生效套餐报价',
    description: '应付 ¥' + formatMoney(result.amountDue) + '，确认并支付后将在 ' + result.effectiveAt + ' 生效。',
    color: 'success',
    icon: 'i-carbon-calculator'
  })
}

// —— 报价 ——
function askGenerateQuote() {
  const result = generateQuote()
  if (!result) {
    toast.add({
      title: '无法生成变更报价',
      description: '目标套餐与周期必须不同于当前订阅，请先重新选择。',
      color: 'warning',
      icon: 'i-carbon-warning-alt'
    })
    return
  }
  toast.add({
    title: '已生成套餐变更报价',
    description: '按比例费用 ¥' + formatMoney(result.charge) + '，抵扣 ¥' + formatMoney(result.credit) + '，应付 ¥' + formatMoney(result.amountDue) + '。',
    color: 'success',
    icon: 'i-carbon-calculator'
  })
}

function askConfirmQuote() {
  if (!quote.value) {
    toast.add({ title: '请先生成报价', description: '套餐变更必须先生成报价并核对费用。', color: 'warning', icon: 'i-carbon-warning-alt' })
    return
  }
  if (quoteStale.value) {
    toast.add({ title: '报价已失效', description: '套餐或周期已变化，请重新生成报价后再确认。', color: 'warning', icon: 'i-carbon-warning-alt' })
    return
  }
  quoteConfirmOpen.value = true
}

function askDiscardQuote() {
  discardQuote()
  toast.add({ title: '已放弃报价', description: '未生成账单，当前订阅保持不变。', color: 'neutral', icon: 'i-carbon-undo' })
}

function submitQuoteConfirm() {
  const result = confirmQuote()
  quoteConfirmOpen.value = false
  if (!result.ok) {
    toast.add({ title: '无法确认报价', description: result.message, color: 'error', icon: 'i-carbon-error' })
    return
  }
  toast.add({ title: '报价已确认', description: result.message, color: 'success', icon: 'i-carbon-checkmark' })
  const invoice = result.invoice
  if (!invoice) return
  selectedInvoiceId.value = invoice.id
  if (invoice.status === 'paid') {
    invoiceDetailOpen.value = true
    return
  }
  openCheckout(invoice)
}

// —— 账单与结账 ——
const invoiceFilter = ref<InvoiceFilter>('all')
const invoiceFilterItems = [
  { label: '全部账单', value: 'all' },
  { label: '已支付', value: 'paid' },
  { label: '未完成', value: 'unpaid' },
  { label: '支付失败', value: 'failed' }
]
const filteredInvoices = computed(() => {
  const rows = subscription.value.invoices
  if (invoiceFilter.value === 'paid') return rows.filter(item => item.status === 'paid')
  if (invoiceFilter.value === 'unpaid') return rows.filter(item => item.status === 'pending' || item.status === 'processing')
  if (invoiceFilter.value === 'failed') return rows.filter(item => item.status === 'failed')
  return rows
})

const checkoutOpen = ref(false)
const invoiceDetailOpen = ref(false)
const quoteConfirmOpen = ref(false)
const cancelOpen = ref(false)
const checkoutMode = ref<'test' | 'manual'>('test')
const selectedCardId = ref<BillingCardBehavior>(billingTestCards[0]!.id)
const manualReference = ref('')
const manualError = ref('')
const lastPaymentMessage = ref('')
const lastPaymentStatus = ref<BillingInvoiceStatus | null>(null)

const focusedInvoice = computed<BillingCenterInvoice | null>(() => {
  if (!selectedInvoiceId.value) return null
  return subscription.value.invoices.find(item => item.id === selectedInvoiceId.value) ?? null
})
const checkoutTitle = computed(() => '结账 · ' + (focusedInvoice.value?.number ?? '选择账单'))
const invoiceDetailTitle = computed(() => '账单详情 · ' + (focusedInvoice.value?.number ?? '选择账单'))
const paymentResultColor = computed<'success' | 'warning' | 'info' | 'error'>(() => {
  return lastPaymentStatus.value ? billingInvoiceStatusColors[lastPaymentStatus.value] : 'info'
})
const paymentResultTitle = computed(() => {
  return lastPaymentStatus.value ? '支付结果：' + billingInvoiceStatusLabels[lastPaymentStatus.value] : '支付结果'
})
const checkoutSubmitLabel = computed(() => {
  if (checkoutMode.value === 'manual') return '登记付款并结清'
  return '模拟支付 ¥' + formatMoney(focusedInvoice.value?.amount ?? 0)
})

function invoiceStatusLabel(invoice: BillingCenterInvoice | null) {
  return invoice ? billingInvoiceStatusLabels[invoice.status] : '—'
}

function invoiceStatusColor(invoice: BillingCenterInvoice | null): 'success' | 'warning' | 'info' | 'error' | 'neutral' {
  return invoice ? billingInvoiceStatusColors[invoice.status] : 'neutral'
}

function paymentMethodLabel(invoice: BillingCenterInvoice | null) {
  return invoice?.paymentMethod ? paymentMethodLabels[invoice.paymentMethod] : '—'
}

function invoiceActionLabel(invoice: BillingCenterInvoice) {
  if (invoice.status === 'paid') return '查看'
  if (invoice.status === 'failed') return '重试支付'
  if (invoice.status === 'processing') return '继续支付'
  return '去支付'
}

function cardBehaviorColor(card: BillingTestCard): 'success' | 'warning' | 'error' {
  if (card.behavior === 'success') return 'success'
  if (card.behavior === 'processing') return 'warning'
  return 'error'
}

function cardBehaviorLabel(card: BillingTestCard) {
  if (card.behavior === 'success') return '支付成功'
  if (card.behavior === 'processing') return '处理中'
  return '支付失败'
}

function openCheckout(invoice: BillingCenterInvoice) {
  selectedInvoiceId.value = invoice.id
  checkoutMode.value = 'test'
  selectedCardId.value = billingTestCards[0]!.id
  manualReference.value = ''
  manualError.value = ''
  lastPaymentMessage.value = ''
  lastPaymentStatus.value = null
  invoiceDetailOpen.value = false
  checkoutOpen.value = true
}

function openInvoice(invoice: BillingCenterInvoice) {
  if (invoice.status === 'paid') {
    openInvoiceDetail(invoice)
    return
  }
  openCheckout(invoice)
}

function openInvoiceDetail(invoice: BillingCenterInvoice) {
  selectedInvoiceId.value = invoice.id
  checkoutOpen.value = false
  invoiceDetailOpen.value = true
}

function handleInvoiceActivate(invoice: BillingCenterInvoice) {
  openInvoice(invoice)
}

function payInvoiceFromDetail() {
  if (!focusedInvoice.value) return
  openCheckout(focusedInvoice.value)
}

function openFirstUnpaid() {
  const invoice = unpaidInvoices.value[0]
  if (!invoice) {
    toast.add({ title: '没有待支付账单', description: '当前账单均已结清。', color: 'neutral', icon: 'i-carbon-checkmark' })
    return
  }
  openCheckout(invoice)
}

function selectCheckoutMode(mode: 'test' | 'manual') {
  checkoutMode.value = mode
  if (mode === 'manual') manualError.value = ''
}

watch(manualReference, () => {
  if (manualError.value) manualError.value = ''
})

function submitPayment() {
  if (checkoutMode.value === 'manual') {
    submitManualPayment()
    return
  }
  submitTestCard()
}

function submitTestCard() {
  const invoice = focusedInvoice.value
  if (!invoice) {
    toast.add({ title: '账单不存在', description: '请关闭弹窗后重新选择待支付账单。', color: 'error', icon: 'i-carbon-error' })
    return
  }
  const result = payWithTestCard(invoice.id, selectedCardId.value)
  lastPaymentMessage.value = result.message
  lastPaymentStatus.value = result.status ?? null
  if (!result.ok) {
    toast.add({ title: '支付未完成', description: result.message, color: 'error', icon: 'i-carbon-error' })
    return
  }
  if (result.status === 'paid') {
    toast.add({ title: '支付成功', description: result.message, color: 'success', icon: 'i-carbon-checkmark' })
    checkoutOpen.value = false
    invoiceDetailOpen.value = true
    return
  }
  toast.add({
    title: result.status === 'failed' ? '支付失败' : '支付处理中',
    description: result.message,
    color: result.status === 'failed' ? 'error' : 'warning',
    icon: result.status === 'failed' ? 'i-carbon-error' : 'i-carbon-time'
  })
}

function submitManualPayment() {
  const invoice = focusedInvoice.value
  if (!invoice) {
    toast.add({ title: '账单不存在', description: '请关闭弹窗后重新选择待支付账单。', color: 'error', icon: 'i-carbon-error' })
    return
  }
  const error = validateReference(invoice.id, manualReference.value)
  manualError.value = error
  if (error) {
    toast.add({ title: '参考号校验未通过', description: error, color: 'warning', icon: 'i-carbon-warning-alt' })
    return
  }
  const result = registerManualPayment(invoice.id, manualReference.value)
  lastPaymentMessage.value = result.message
  lastPaymentStatus.value = result.status ?? null
  if (!result.ok) {
    manualError.value = result.message
    toast.add({ title: '登记付款失败', description: result.message, color: 'error', icon: 'i-carbon-error' })
    return
  }
  toast.add({ title: '付款已登记', description: result.message, color: 'success', icon: 'i-carbon-checkmark' })
  checkoutOpen.value = false
  invoiceDetailOpen.value = true
}

function submitCancel() {
  const result = cancelSubscription()
  cancelOpen.value = false
  toast.add({
    title: result.ok ? '已取消自动续费' : '无需取消',
    description: result.message,
    color: result.ok ? 'success' : 'warning',
    icon: result.ok ? 'i-carbon-checkmark' : 'i-carbon-warning-alt'
  })
}

function exportInvoices() {
  const rows = filteredInvoices.value
  if (!rows.length) {
    toast.add({ title: '没有可导出的账单', description: '当前筛选条件下没有账单，请调整筛选后重试。', color: 'warning', icon: 'i-carbon-warning-alt' })
    return
  }
  downloadCsv(
    'billing-invoices-' + activeWorkspaceId.value + '-' + today + '.csv',
    ['账单号', '开立日期', '到期日', '套餐', '周期', '应付金额', '抵扣金额', '状态', '付款参考号', '支付方式', '支付时间', '备注'],
    rows.map(item => [
      item.number,
      item.createdAt,
      item.dueAt,
      billingPlanById(item.planId).name,
      billingCycleLabels[item.cycle],
      formatMoney(item.amount),
      formatMoney(item.credit),
      billingInvoiceStatusLabels[item.status],
      item.reference ?? '',
      item.paymentMethod ? paymentMethodLabels[item.paymentMethod] : '',
      item.paidAt ?? '',
      item.note ?? ''
    ])
  )
  toast.add({
    title: '账单已导出',
    description: '已导出 ' + rows.length + ' 条账单为 CSV，可直接用 Excel 打开。',
    color: 'success',
    icon: 'i-carbon-download'
  })
}

// —— 工作区与演示数据 ——
function switchWorkspace(workspaceId: string) {
  if (workspaceId === activeWorkspaceId.value) return
  workspaceStore.setWorkspace(workspaceId)
  checkoutOpen.value = false
  invoiceDetailOpen.value = false
  quoteConfirmOpen.value = false
  cancelOpen.value = false
  const summary = workspaceSummaries.value.find(item => item.id === workspaceId)
  toast.add({
    title: '已切换工作区',
    description: (summary?.name ?? workspaceId) + ' · ' + (summary?.planName ?? '') + '，套餐与用量已按该工作区展示。',
    color: 'success',
    icon: 'i-carbon-switch'
  })
}

function askReset() {
  const result = resetDemoData()
  invoiceFilter.value = 'all'
  checkoutOpen.value = false
  invoiceDetailOpen.value = false
  quoteConfirmOpen.value = false
  cancelOpen.value = false
  lastPaymentMessage.value = ''
  lastPaymentStatus.value = null
  toast.add({ title: '演示数据已恢复', description: result.message, color: 'success', icon: 'i-carbon-reset' })
}

// —— 权益 ——
function entitlementProgressColor(row: BillingEntitlementRow): 'primary' | 'warning' | 'error' {
  if (row.state === 'exceeded' || row.state === 'blocked') return 'error'
  if (row.state === 'warning') return 'warning'
  return 'primary'
}

const invoiceColumns: TableColumn<BillingCenterInvoice>[] = [
  { accessorKey: 'number', header: '账单号', id: 'number' },
  { accessorKey: 'createdAt', header: '开立日期', id: 'createdAt' },
  { id: 'plan', header: '套餐 / 周期', accessorFn: row => billingPlanById(row.planId).name + ' · ' + billingCycleLabels[row.cycle] },
  { id: 'amount', header: '应付金额', accessorFn: row => row.amount },
  { id: 'status', header: '状态', accessorFn: row => row.status },
  { id: 'reference', header: '付款参考号', accessorFn: row => row.reference ?? '—' },
  { id: 'actions', header: '操作' }
]

const entitlementColumns: TableColumn<BillingEntitlementRow>[] = [
  { accessorKey: 'module', header: '模块', id: 'module' },
  { accessorKey: 'planLimit', header: '当前套餐限制', id: 'planLimit' },
  { accessorKey: 'memberPermission', header: '成员权限', id: 'memberPermission' },
  { accessorKey: 'usageText', header: '本周期用量', id: 'usage' },
  { id: 'state', header: '告警状态', accessorFn: row => row.state }
]
</script>

<template>
  <div class="space-y-4" data-testid="billing-center">
    <div class="space-y-4" data-testid="settings-billing">
      <!-- 工作区切换 -->
      <UCard>
        <div class="flex flex-wrap items-center gap-3">
          <div>
            <p class="text-xs text-muted">
              当前工作区 · 演示种子
            </p>
            <div class="mt-1 flex flex-wrap items-center gap-2">
              <span class="text-lg font-semibold text-highlighted" data-testid="billing-workspace-name">{{ workspace.name }}</span>
              <UBadge
                color="primary"
                variant="subtle"
                :label="currentPlan.name + ' · ' + billingCycleLabels[subscription.cycle]"
                data-testid="billing-workspace-plan"
              />
              <span class="text-xs text-muted" data-testid="billing-workspace-seats">
                {{ subscription.seatsUsed }} / {{ currentPlan.seatLimit }} 席
              </span>
            </div>
          </div>
          <div class="ml-auto flex flex-wrap items-center gap-2" data-testid="billing-workspace-switcher">
            <span class="text-xs text-muted">切换工作区</span>
            <UButton
              v-for="item in workspaceSummaries"
              :key="item.id"
              :label="item.name"
              size="sm"
              :color="item.id === activeWorkspaceId ? 'primary' : 'neutral'"
              :variant="item.id === activeWorkspaceId ? 'solid' : 'outline'"
              :data-testid="'billing-workspace-' + item.id"
              @click="switchWorkspace(item.id)"
            />
            <UButton
              icon="i-carbon-reset"
              label="恢复种子"
              color="neutral"
              variant="ghost"
              size="sm"
              data-testid="billing-reset"
              @click="askReset"
            />
          </div>
        </div>
        <p class="mt-2 text-xs text-muted">
          演示 today 固定为 {{ today }}；切换工作区后套餐、账单与用量按该租户展示，刷新页面恢复种子数据。
        </p>
      </UCard>

      <!-- 当前订阅 -->
      <UCard>
        <template #header>
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div class="flex flex-wrap items-center gap-2">
              <h2 class="text-base font-semibold text-highlighted">
                当前订阅
              </h2>
              <UBadge
                :color="subscriptionStatusColor()"
                variant="subtle"
                :label="subscriptionStatusLabels[subscription.status]"
                data-testid="billing-subscription-status"
              />
              <UBadge
                v-if="remainingDays <= 30"
                color="warning"
                variant="subtle"
                :label="'剩余 ' + remainingDays + ' 天'"
                data-testid="billing-remaining-days"
              />
            </div>
            <div class="flex flex-wrap gap-2">
              <UButton
                icon="i-carbon-view"
                label="查看套餐"
                color="neutral"
                variant="ghost"
                size="sm"
                data-testid="billing-scroll-plans"
                @click="scrollToPlans"
              />
              <UButton
                :label="subscription.status === 'active' ? '取消自动续费' : '恢复自动续费'"
                :icon="subscription.status === 'active' ? 'i-carbon-close' : 'i-carbon-rotate-clockwise'"
                :color="subscription.status === 'active' ? 'warning' : 'primary'"
                variant="outline"
                size="sm"
                :data-testid="subscription.status === 'active' ? 'billing-cancel' : 'billing-restore'"
                @click="onSubscriptionAction"
              />
            </div>
          </div>
        </template>

        <div class="grid gap-4 lg:grid-cols-3">
          <div class="space-y-1">
            <p class="text-xs text-muted">
              套餐
            </p>
            <p class="text-lg font-semibold text-highlighted" data-testid="billing-current-plan">
              {{ currentPlan.name }}
            </p>
            <p class="text-xs text-muted">
              {{ currentPlan.description }}
            </p>
          </div>
          <div class="space-y-1">
            <p class="text-xs text-muted">
              当前周期
            </p>
            <p class="text-sm font-medium text-default">
              {{ subscription.periodStart }} 至 {{ subscription.periodEnd }} · {{ billingCycleLabels[subscription.cycle] }}
            </p>
            <p class="text-xs text-muted">
              套餐实际生效时间：<span class="text-default" data-testid="billing-effective-at">{{ subscription.effectiveAt }}</span>
            </p>
          </div>
          <div class="space-y-1">
            <p class="text-xs text-muted">
              下次到期 / 续费
            </p>
            <p class="text-sm font-medium text-default" data-testid="billing-period-end">
              {{ subscription.periodEnd }}
            </p>
            <p class="text-xs text-muted">
              剩余 {{ remainingDays }} 天（演示 today {{ today }}）
            </p>
          </div>
        </div>

        <div v-if="scheduledPlan" class="mt-4 rounded-lg border border-primary/40 bg-primary/5 p-3" data-testid="billing-scheduled">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p class="text-sm font-medium text-highlighted">
                到期后生效：<span data-testid="billing-scheduled-plan">{{ scheduledPlan.name }}</span>
              </p>
              <p class="text-xs text-muted">
                生效日期 <span class="text-default" data-testid="billing-scheduled-effective">{{ subscription.scheduled?.effectiveAt }}</span>
                · 当前周期结束前仍按 {{ currentPlan.name }} 计费与授权。
              </p>
            </div>
            <div class="flex flex-wrap gap-2">
              <UButton
                label="生成待生效报价"
                icon="i-carbon-calculator"
                size="sm"
                data-testid="billing-scheduled-quote"
                @click="askScheduledQuote"
              />
              <UButton
                label="取消待生效"
                color="neutral"
                variant="outline"
                size="sm"
                data-testid="billing-scheduled-cancel"
                @click="askCancelScheduled"
              />
            </div>
          </div>
        </div>

        <div class="mt-4 grid gap-4 md:grid-cols-3">
          <div v-for="row in usageRows" :key="row.key">
            <div class="mb-1 flex items-center justify-between gap-2 text-sm">
              <span class="text-muted">{{ row.label }}</span>
              <span class="text-default" :data-testid="'billing-usage-label-' + row.key">{{ row.used }} / {{ row.limit }} {{ row.suffix }}</span>
            </div>
            <UProgress
              :model-value="row.percent"
              :color="usageColor(row.percent)"
              size="sm"
              :data-testid="'billing-usage-' + row.key"
            />
            <p class="mt-1 text-xs" :class="row.percent >= 80 ? 'text-warning' : 'text-muted'">
              已使用 {{ row.percent }}%<span v-if="row.percent >= 80"> · 接近套餐限额，建议升级或清理</span>
            </p>
          </div>
        </div>

        <UAlert
          v-if="unpaidInvoices.length"
          class="mt-4"
          color="warning"
          variant="soft"
          icon="i-carbon-receipt"
          title="存在未完成的订阅账单"
          :description="'共 ' + unpaidInvoices.length + ' 张账单未结清，付款成功前新套餐不会生效。'"
          data-testid="billing-pending-alert"
        >
          <template #actions>
            <UButton
              label="继续支付"
              color="warning"
              variant="solid"
              size="sm"
              data-testid="billing-pending-pay"
              @click="openFirstUnpaid"
            />
          </template>
        </UAlert>
      </UCard>

      <!-- 套餐与周期 -->
      <UCard>
        <template #header>
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 class="text-base font-semibold text-highlighted">
                套餐与计费周期
              </h2>
              <p class="mt-1 text-xs text-muted">
                选择目标套餐和周期后生成变更报价；不同周期价格按年付优惠展示。
              </p>
            </div>
            <div class="flex items-center gap-1 rounded-lg border border-default p-1">
              <UButton
                label="按月"
                size="sm"
                :color="targetCycle === 'monthly' ? 'primary' : 'neutral'"
                :variant="targetCycle === 'monthly' ? 'solid' : 'ghost'"
                data-testid="billing-cycle-monthly"
                @click="selectCycle('monthly')"
              />
              <UButton
                label="按年 · 省 2 个月"
                size="sm"
                :color="targetCycle === 'annual' ? 'primary' : 'neutral'"
                :variant="targetCycle === 'annual' ? 'solid' : 'ghost'"
                data-testid="billing-cycle-annual"
                @click="selectCycle('annual')"
              />
            </div>
          </div>
        </template>

        <div id="billing-plan-list" class="grid gap-3 lg:grid-cols-3" data-testid="billing-plans">
          <UCard
            v-for="plan in billingPlans"
            :key="plan.id"
            :ui="{ root: plan.id === currentPlan.id ? 'ring-1 ring-primary' : '' }"
            :data-testid="'billing-plan-' + plan.id"
          >
            <div class="flex items-start justify-between gap-2">
              <div>
                <div class="flex items-center gap-2">
                  <h3 class="text-sm font-semibold text-highlighted">
                    {{ plan.name }}
                  </h3>
                  <UBadge
                    v-if="plan.recommended"
                    color="primary"
                    variant="subtle"
                    size="sm"
                    label="推荐"
                  />
                  <UBadge
                    v-if="plan.id === currentPlan.id"
                    color="success"
                    variant="subtle"
                    size="sm"
                    label="当前"
                  />
                  <UBadge
                    v-else-if="plan.id === targetPlanId"
                    color="info"
                    variant="subtle"
                    size="sm"
                    label="已选择"
                  />
                </div>
                <p class="mt-1 text-xs text-muted">
                  {{ plan.description }}
                </p>
              </div>
            </div>

            <p class="mt-3">
              <span class="text-2xl font-semibold text-highlighted">{{ formatMoney(planPrice(plan)) }}</span>
              <span class="ml-1 text-xs text-muted">/ {{ billingCycleLabels[targetCycle] }}</span>
            </p>

            <div class="mt-3 flex flex-wrap gap-1">
              <UBadge
                color="neutral"
                variant="subtle"
                size="sm"
                :label="plan.seatLimit + ' 席位'"
              />
              <UBadge
                color="neutral"
                variant="subtle"
                size="sm"
                :label="plan.storageLimitGb + ' GB 存储'"
              />
              <UBadge
                color="neutral"
                variant="subtle"
                size="sm"
                :label="plan.invoiceLimit + ' 张发票/月'"
              />
            </div>

            <ul class="mt-3 space-y-1.5 text-xs text-muted">
              <li v-for="feature in plan.features" :key="feature" class="flex items-start gap-1.5">
                <UIcon name="i-carbon-checkmark" class="mt-0.5 size-3.5 shrink-0 text-success" />
                <span>{{ feature }}</span>
              </li>
            </ul>

            <UButton
              class="mt-4 w-full justify-center"
              :label="plan.id === currentPlan.id ? '当前套餐' : plan.id === targetPlanId ? '已选择此套餐' : '选择此套餐'"
              :color="plan.id === targetPlanId ? 'primary' : 'neutral'"
              :variant="plan.id === targetPlanId ? 'solid' : 'outline'"
              :disabled="plan.id === currentPlan.id"
              :data-testid="'billing-select-' + plan.id"
              @click="selectPlan(plan.id)"
            />
          </UCard>
        </div>

        <p class="mt-3 text-xs text-muted" data-testid="billing-target-hint">
          当前选择：
          <span class="font-medium text-default">{{ targetPlan.name }} · {{ billingCycleLabels[targetCycle] }}</span>
          <span v-if="canGenerateQuote">；与生效套餐不同，生成报价后才能确认变更。</span>
          <span v-else>；与生效套餐一致，暂无可变更项。</span>
        </p>
      </UCard>

      <!-- 变更报价 -->
      <UCard data-testid="billing-quote">
        <template #header>
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 class="text-base font-semibold text-highlighted">
                套餐变更报价
              </h2>
              <p class="mt-1 text-xs text-muted">
                按剩余周期折算费用与抵扣，确认后生成待支付账单；修改套餐或周期后必须重新确认。
              </p>
            </div>
            <UBadge
              v-if="quote"
              color="info"
              variant="subtle"
              :label="'报价版本 ' + quote.revision"
              data-testid="billing-quote-revision"
            />
          </div>
        </template>

        <div v-if="quote" class="space-y-4">
          <UAlert
            v-if="quoteStale"
            color="warning"
            variant="soft"
            icon="i-carbon-warning-alt"
            title="报价已失效，需要重新确认"
            description="套餐或周期已发生变化，原报价不可直接确认；请重新生成报价后核对金额。"
            data-testid="billing-quote-stale"
          />

          <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div class="rounded-lg border border-default p-3">
              <p class="text-xs text-muted">
                剩余周期
              </p>
              <p class="mt-1 text-sm font-semibold text-highlighted" data-testid="billing-quote-remaining">
                {{ quote.remainingDays }} 天
              </p>
              <p class="text-xs text-muted">
                原周期至 {{ quote.periodEnd }}
              </p>
            </div>
            <div class="rounded-lg border border-default p-3">
              <p class="text-xs text-muted">
                按比例费用
              </p>
              <p class="mt-1 text-sm font-semibold text-highlighted" data-testid="billing-quote-charge">
                {{ formatMoney(quote.charge) }}
              </p>
              <p class="text-xs text-muted">
                目标套餐剩余 {{ quote.remainingDays }} 天费用
              </p>
            </div>
            <div class="rounded-lg border border-default p-3">
              <p class="text-xs text-muted">
                抵扣金额
              </p>
              <p class="mt-1 text-sm font-semibold text-highlighted" data-testid="billing-quote-credit">
                {{ formatMoney(quote.credit) }}
              </p>
              <p class="text-xs text-muted">
                当前套餐未使用余额抵扣
              </p>
            </div>
            <div class="rounded-lg border border-primary/40 bg-primary/5 p-3">
              <p class="text-xs text-muted">
                应付金额
              </p>
              <p class="mt-1 text-lg font-semibold text-primary" data-testid="billing-quote-due">
                {{ formatMoney(quote.amountDue) }}
              </p>
              <p v-if="quote.creditRemainder > 0" class="text-xs text-muted">
                剩余抵扣 {{ formatMoney(quote.creditRemainder) }}
              </p>
              <p v-else class="text-xs text-muted">
                生成待支付账单后结账
              </p>
            </div>
          </div>

          <div class="rounded-lg border border-default p-3 text-xs text-muted">
            <p>
              变更目标：
              <span class="font-medium text-default" data-testid="billing-quote-target">{{ quoteTargetPlan?.name }} · {{ billingCycleLabels[quote.targetCycle] }}</span>
            </p>
            <p class="mt-1">
              新周期：<span class="text-default" data-testid="billing-quote-period">{{ quote.newPeriodStart }} 至 {{ quote.newPeriodEnd }}</span>
            </p>
            <p class="mt-1">
              生效时间：<span class="text-default" data-testid="billing-quote-effective">{{ quote.effectiveAt }}</span>
              · 报价生成于 {{ quote.generatedAt }}
            </p>
          </div>

          <div class="flex flex-wrap gap-2">
            <UButton
              label="确认报价并生成账单"
              icon="i-carbon-checkmark"
              :disabled="quoteStale"
              data-testid="billing-quote-confirm"
              @click="askConfirmQuote"
            />
            <UButton
              label="重新生成报价"
              icon="i-carbon-calculator"
              color="neutral"
              variant="outline"
              data-testid="billing-quote-regenerate"
              @click="askGenerateQuote"
            />
            <UButton
              label="放弃报价"
              color="neutral"
              variant="ghost"
              data-testid="billing-quote-discard"
              @click="askDiscardQuote"
            />
          </div>
        </div>

        <div v-else-if="canGenerateQuote" class="flex flex-wrap items-center justify-between gap-3" data-testid="billing-quote-hint">
          <p class="text-sm text-default">
            已选择 <span class="font-medium">{{ targetPlan.name }} · {{ billingCycleLabels[targetCycle] }}</span>，生成报价后可查看按比例费用、抵扣与应付金额。
          </p>
          <UButton
            label="生成变更报价"
            icon="i-carbon-calculator"
            data-testid="billing-quote-generate"
            @click="askGenerateQuote"
          />
        </div>

        <div v-else class="flex flex-wrap items-center justify-between gap-3" data-testid="billing-quote-empty">
          <p class="text-sm text-muted">
            当前选择与生效套餐一致；在上方选择其他套餐或周期后即可生成变更报价。
          </p>
          <UButton
            label="生成变更报价"
            icon="i-carbon-calculator"
            disabled
            data-testid="billing-quote-generate-disabled"
          />
        </div>
      </UCard>

      <!-- 账单历史 -->
      <UCard>
        <template #header>
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 class="text-base font-semibold text-highlighted">
                订阅账单历史
              </h2>
              <p class="mt-1 text-xs text-muted">
                含已支付、待支付与支付失败账单；未完成账单可继续支付。
              </p>
            </div>
            <div class="flex flex-wrap items-center gap-2">
              <USelect
                v-model="invoiceFilter"
                :items="invoiceFilterItems"
                class="w-32"
                data-testid="billing-invoice-filter"
              />
              <UButton
                label="导出 CSV"
                icon="i-carbon-download"
                color="neutral"
                variant="outline"
                size="sm"
                data-testid="billing-invoice-export"
                @click="exportInvoices"
              />
            </div>
          </div>
        </template>

        <ResizableTable
          :data="filteredInvoices"
          :columns="invoiceColumns"
          :row-activate="handleInvoiceActivate"
          class="nx-table"
          :ui="{ th: 'py-2.5', td: 'py-3' }"
          data-testid="billing-invoice-table"
        >
          <template #number-cell="{ row }">
            <span class="font-mono text-xs text-default" :data-testid="'billing-invoice-number-' + row.original.id">
              {{ row.original.number }}
            </span>
          </template>
          <template #createdAt-cell="{ row }">
            <span class="font-mono text-xs text-muted">{{ row.original.createdAt }}</span>
          </template>
          <template #plan-cell="{ row }">
            <span class="text-xs text-default">
              {{ billingPlanById(row.original.planId).name }} · {{ billingCycleLabels[row.original.cycle] }}
            </span>
          </template>
          <template #amount-cell="{ row }">
            <div class="space-y-0.5">
              <p class="text-sm font-medium text-highlighted">
                {{ formatMoney(row.original.amount) }}
              </p>
              <p v-if="row.original.credit > 0" class="text-[11px] text-muted">
                抵扣 {{ formatMoney(row.original.credit) }}
              </p>
            </div>
          </template>
          <template #status-cell="{ row }">
            <div class="space-y-1">
              <UBadge
                :color="billingInvoiceStatusColors[row.original.status]"
                variant="subtle"
                size="sm"
                :label="billingInvoiceStatusLabels[row.original.status]"
                :data-testid="'billing-invoice-status-' + row.original.id"
              />
              <p v-if="row.original.failureReason" class="max-w-40 text-[11px] text-error">
                {{ row.original.failureReason }}
              </p>
            </div>
          </template>
          <template #reference-cell="{ row }">
            <span v-if="row.original.reference" class="font-mono text-xs text-default">{{ row.original.reference }}</span>
            <span v-else class="text-xs text-muted">—</span>
          </template>
          <template #actions-cell="{ row }">
            <UButton
              :label="invoiceActionLabel(row.original)"
              :icon="row.original.status === 'paid' ? 'i-carbon-view' : 'i-carbon-credit-card'"
              size="sm"
              :color="row.original.status === 'paid' ? 'neutral' : 'primary'"
              variant="ghost"
              :data-testid="'billing-invoice-action-' + row.original.id"
              @click="openInvoice(row.original)"
            />
          </template>
          <template #empty>
            <UEmpty
              variant="naked"
              icon="i-carbon-receipt"
              title="当前筛选没有账单"
              description="调整状态筛选，或先生成套餐变更报价并确认账单。"
              data-testid="billing-invoice-empty"
            />
          </template>
        </ResizableTable>
      </UCard>

      <!-- 模块权益 -->
      <UCard>
        <template #header>
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 class="text-base font-semibold text-highlighted">
                模块权益、限额与用量
              </h2>
              <p class="mt-1 text-xs text-muted">
                「当前套餐限制」来自 {{ currentPlan.name }} 的配额，「成员权限」来自角色授权；两者分别计算，不互相替代。
              </p>
            </div>
            <UBadge
              color="primary"
              variant="subtle"
              :label="currentPlan.name + ' 权益'"
              data-testid="billing-entitlement-plan"
            />
          </div>
        </template>

        <div v-if="usageWarnings.length" class="mb-4 space-y-2" data-testid="billing-entitlement-warnings">
          <UAlert
            v-for="warning in usageWarnings"
            :key="warning.key"
            :color="warning.color"
            variant="soft"
            :icon="warning.color === 'error' ? 'i-carbon-warning' : 'i-carbon-warning-alt'"
            :title="warning.title"
            :description="warning.description"
            :data-testid="'billing-entitlement-warning-' + warning.key"
          />
        </div>
        <p v-else class="mb-4 text-xs text-muted" data-testid="billing-entitlement-warning-empty">
          当前用量均在阈值内，暂无告警；达到 80% 会提示，超过套餐限制会被标记为超额。
        </p>

        <ResizableTable
          :data="entitlements"
          :columns="entitlementColumns"
          class="nx-table"
          :ui="{ th: 'py-2.5', td: 'py-3' }"
          data-testid="billing-entitlement-table"
        >
          <template #module-cell="{ row }">
            <span class="text-sm font-medium text-highlighted" :data-testid="'billing-entitlement-module-' + row.original.key">
              {{ row.original.module }}
            </span>
          </template>
          <template #planLimit-cell="{ row }">
            <span class="text-xs text-default" :data-testid="'billing-entitlement-limit-' + row.original.key">
              {{ row.original.planLimit }}
            </span>
          </template>
          <template #memberPermission-cell="{ row }">
            <UBadge
              color="neutral"
              variant="subtle"
              size="sm"
              :label="row.original.memberPermission"
              :data-testid="'billing-entitlement-permission-' + row.original.key"
            />
          </template>
          <template #usage-cell="{ row }">
            <div class="min-w-36 space-y-1" :data-testid="'billing-entitlement-usage-' + row.original.key">
              <p class="text-xs text-default">
                {{ row.original.usageText }}
              </p>
              <UProgress
                v-if="row.original.percent !== null"
                :model-value="row.original.percent"
                :color="entitlementProgressColor(row.original)"
                size="xs"
              />
            </div>
          </template>
          <template #state-cell="{ row }">
            <UBadge
              :color="billingEntitlementStateColors[row.original.state]"
              variant="subtle"
              size="sm"
              :label="billingEntitlementStateLabels[row.original.state]"
              :data-testid="'billing-entitlement-state-' + row.original.key"
            />
          </template>
          <template #empty>
            <UEmpty
              variant="naked"
              icon="i-carbon-catalog"
              title="当前套餐没有模块权益数据"
              data-testid="billing-entitlement-empty"
            />
          </template>
        </ResizableTable>
      </UCard>
    </div>

    <!-- 确认变更报价 -->
    <UModal v-model:open="quoteConfirmOpen" title="确认套餐变更报价">
      <template #body>
        <div class="space-y-3" data-testid="billing-change-dialog">
          <p class="text-sm text-default">
            将「{{ workspace.name }}」从
            <strong>{{ currentPlan.name }} · {{ billingCycleLabels[subscription.cycle] }}</strong>
            变更为
            <strong>{{ quoteTargetPlan?.name }} · {{ quote ? billingCycleLabels[quote.targetCycle] : billingCycleLabels[targetCycle] }}</strong>？
          </p>
          <div v-if="quote" class="grid grid-cols-3 gap-2 rounded-lg border border-default p-3 text-center">
            <div>
              <p class="text-xs text-muted">
                按比例费用
              </p>
              <p class="text-sm font-medium text-default">
                {{ formatMoney(quote.charge) }}
              </p>
            </div>
            <div>
              <p class="text-xs text-muted">
                抵扣
              </p>
              <p class="text-sm font-medium text-default">
                -{{ formatMoney(quote.credit) }}
              </p>
            </div>
            <div>
              <p class="text-xs text-muted">
                应付金额
              </p>
              <p class="text-sm font-semibold text-primary">
                {{ formatMoney(quote.amountDue) }}
              </p>
            </div>
          </div>
          <UAlert
            color="warning"
            variant="soft"
            icon="i-carbon-information"
            title="确认后生成待支付账单"
            description="仅生成账单并跳转结账；付款成功后才更新账单状态、订阅套餐与生效日期。"
          />
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton
            label="返回修改"
            color="neutral"
            variant="ghost"
            data-testid="billing-change-cancel"
            @click="quoteConfirmOpen = false"
          />
          <UButton
            label="确认并生成账单"
            icon="i-carbon-checkmark"
            data-testid="billing-change-confirm"
            @click="submitQuoteConfirm"
          />
        </div>
      </template>
    </UModal>

    <!-- 取消订阅 -->
    <UModal v-model:open="cancelOpen" title="取消订阅自动续费">
      <template #body>
        <div class="space-y-3" data-testid="billing-cancel-dialog">
          <p class="text-sm text-default">
            取消后「{{ workspace.name }}」仍可使用 {{ currentPlan.name }} 至
            <strong>{{ subscription.periodEnd }}</strong>，到期后不再自动续费。
          </p>
          <UAlert
            color="warning"
            variant="soft"
            icon="i-carbon-information"
            title="演示提示"
            description="取消只改本地演示状态；可随时点击「恢复自动续费」，不会产生真实扣款。"
          />
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton
            label="保留续费"
            color="neutral"
            variant="ghost"
            data-testid="billing-cancel-dismiss"
            @click="cancelOpen = false"
          />
          <UButton
            label="确认取消续费"
            color="warning"
            data-testid="billing-cancel-confirm"
            @click="submitCancel"
          />
        </div>
      </template>
    </UModal>

    <!-- 结账 -->
    <UModal v-model:open="checkoutOpen" :title="checkoutTitle">
      <template #body>
        <div v-if="focusedInvoice" class="space-y-4" data-testid="billing-checkout">
          <div class="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-default p-3">
            <div>
              <p class="text-xs text-muted">
                账单号
              </p>
              <p class="font-mono text-sm text-default" data-testid="billing-checkout-number">
                {{ focusedInvoice.number }}
              </p>
            </div>
            <div>
              <p class="text-xs text-muted">
                应付金额
              </p>
              <p class="text-lg font-semibold text-primary" data-testid="billing-checkout-amount">
                {{ formatMoney(focusedInvoice.amount) }}
              </p>
            </div>
            <UBadge
              :color="billingInvoiceStatusColors[focusedInvoice.status]"
              variant="subtle"
              :label="billingInvoiceStatusLabels[focusedInvoice.status]"
              data-testid="billing-checkout-status"
            />
          </div>

          <UAlert
            v-if="focusedInvoice.status === 'processing'"
            color="warning"
            variant="soft"
            icon="i-carbon-time"
            title="支付处理中"
            description="演示不会自动完成处理中支付；可改用成功测试卡再次支付，或登记手工付款。"
            data-testid="billing-checkout-processing-hint"
          />
          <UAlert
            v-if="focusedInvoice.failureReason"
            color="error"
            variant="soft"
            icon="i-carbon-error"
            title="上次支付失败原因"
            :description="focusedInvoice.failureReason"
            data-testid="billing-checkout-failure-reason"
          />

          <div class="flex gap-2">
            <UButton
              label="测试卡支付"
              icon="i-carbon-credit-card"
              :color="checkoutMode === 'test' ? 'primary' : 'neutral'"
              :variant="checkoutMode === 'test' ? 'solid' : 'outline'"
              data-testid="billing-checkout-mode-test"
              @click="selectCheckoutMode('test')"
            />
            <UButton
              label="手工登记付款"
              icon="i-carbon-document-add"
              :color="checkoutMode === 'manual' ? 'primary' : 'neutral'"
              :variant="checkoutMode === 'manual' ? 'solid' : 'outline'"
              data-testid="billing-checkout-mode-manual"
              @click="selectCheckoutMode('manual')"
            />
          </div>

          <div v-if="checkoutMode === 'test'" class="space-y-2" data-testid="billing-checkout-test-mode">
            <button
              v-for="card in billingTestCards"
              :key="card.id"
              type="button"
              class="w-full rounded-lg border p-3 text-left transition"
              :class="selectedCardId === card.id ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-default hover:border-primary/50'"
              :data-testid="'billing-checkout-card-' + card.id"
              @click="selectedCardId = card.id"
            >
              <div class="flex flex-wrap items-center justify-between gap-2">
                <span class="text-sm font-medium text-highlighted">{{ card.title }}</span>
                <UBadge
                  :color="cardBehaviorColor(card)"
                  variant="subtle"
                  size="sm"
                  :label="cardBehaviorLabel(card)"
                />
              </div>
              <p class="mt-1 font-mono text-xs text-muted">
                {{ card.brand }} · {{ card.number }} · 有效期 {{ card.expiry }}
              </p>
              <p class="mt-1 text-xs text-muted">
                {{ card.description }}
              </p>
            </button>
            <UAlert
              color="info"
              variant="soft"
              icon="i-carbon-information"
              title="测试卡说明"
              description="成功卡会直接结清账单；处理中卡保持未完成状态，可稍后继续支付；失败卡会记录失败原因，可换卡重试。"
              data-testid="billing-checkout-card-hint"
            />
          </div>

          <div v-else class="space-y-2" data-testid="billing-checkout-manual-mode">
            <UFormField label="付款参考号" name="reference" required>
              <UInput
                v-model="manualReference"
                class="w-full"
                placeholder="如 BANK-20261119-0001"
                data-testid="billing-checkout-reference"
                @keyup.enter="submitPayment"
              />
            </UFormField>
            <p class="text-xs text-muted">
              手工登记用于模拟银行转账：6–32 位字母、数字或连字符，不能与历史账单重复。
            </p>
            <p v-if="manualError" class="text-sm text-error" data-testid="billing-checkout-reference-error">
              {{ manualError }}
            </p>
          </div>

          <UAlert
            v-if="lastPaymentMessage && lastPaymentStatus"
            :color="paymentResultColor"
            variant="soft"
            :title="paymentResultTitle"
            :description="lastPaymentMessage"
            data-testid="billing-checkout-result"
          />
        </div>
        <div v-else class="space-y-2" data-testid="billing-checkout-empty">
          <p class="text-sm text-muted">
            账单不存在或已被移除，请关闭弹窗后在账单历史重新选择。
          </p>
        </div>
      </template>
      <template #footer>
        <div class="flex w-full flex-wrap items-center justify-between gap-2">
          <span class="text-xs text-muted">演示结账，不产生真实扣款</span>
          <div class="flex gap-2">
            <UButton
              label="关闭"
              color="neutral"
              variant="ghost"
              data-testid="billing-checkout-cancel"
              @click="checkoutOpen = false"
            />
            <UButton
              :label="checkoutSubmitLabel"
              icon="i-carbon-checkmark"
              :disabled="!focusedInvoice || focusedInvoice.status === 'paid'"
              data-testid="billing-checkout-submit"
              @click="submitPayment"
            />
          </div>
        </div>
      </template>
    </UModal>

    <!-- 账单详情 -->
    <UModal v-model:open="invoiceDetailOpen" :title="invoiceDetailTitle">
      <template #body>
        <div v-if="focusedInvoice" class="space-y-3" data-testid="billing-invoice-detail">
          <div class="flex items-center justify-between gap-2">
            <p class="font-mono text-sm text-default">
              {{ focusedInvoice.number }}
            </p>
            <UBadge
              :color="invoiceStatusColor(focusedInvoice)"
              variant="subtle"
              :label="invoiceStatusLabel(focusedInvoice)"
              data-testid="billing-invoice-detail-status"
            />
          </div>
          <div class="grid grid-cols-2 gap-3 rounded-lg border border-default p-3 text-sm">
            <div>
              <p class="text-xs text-muted">
                应付金额
              </p>
              <p class="font-semibold text-highlighted" data-testid="billing-invoice-detail-amount">
                {{ formatMoney(focusedInvoice.amount) }}
              </p>
            </div>
            <div>
              <p class="text-xs text-muted">
                抵扣金额
              </p>
              <p class="text-default">
                {{ formatMoney(focusedInvoice.credit) }}
              </p>
            </div>
            <div>
              <p class="text-xs text-muted">
                支付方式
              </p>
              <p class="text-default" data-testid="billing-invoice-detail-method">
                {{ paymentMethodLabel(focusedInvoice) }}
              </p>
            </div>
            <div>
              <p class="text-xs text-muted">
                付款参考号
              </p>
              <p class="font-mono text-xs text-default" data-testid="billing-invoice-detail-reference">
                {{ focusedInvoice.reference ?? '—' }}
              </p>
            </div>
            <div>
              <p class="text-xs text-muted">
                开立 / 到期
              </p>
              <p class="text-xs text-default">
                {{ focusedInvoice.createdAt }} / {{ focusedInvoice.dueAt }}
              </p>
            </div>
            <div>
              <p class="text-xs text-muted">
                支付时间
              </p>
              <p class="text-xs text-default" data-testid="billing-invoice-detail-paid-at">
                {{ focusedInvoice.paidAt ?? '—' }}
              </p>
            </div>
          </div>
          <p v-if="focusedInvoice.note" class="text-xs text-muted" data-testid="billing-invoice-detail-note">
            {{ focusedInvoice.note }}
          </p>
          <UAlert
            v-if="focusedInvoice.status === 'paid'"
            color="success"
            variant="soft"
            icon="i-carbon-checkmark"
            title="账单已支付"
            description="付款成功后账单状态、订阅状态与套餐生效日期保持一致。"
            data-testid="billing-invoice-detail-paid"
          />
          <UAlert
            v-else
            color="warning"
            variant="soft"
            icon="i-carbon-warning-alt"
            title="账单未完成"
            description="该账单尚未结清，付款成功前套餐变更不会生效。"
            data-testid="billing-invoice-detail-unpaid"
          />
        </div>
        <p v-else class="text-sm text-muted" data-testid="billing-invoice-detail-empty">
          账单不存在或已被移除。
        </p>
      </template>
      <template #footer>
        <div class="flex w-full flex-wrap items-center justify-between gap-2">
          <span class="text-xs text-muted">演示账单，不具备财务效力</span>
          <div class="flex gap-2">
            <UButton
              label="关闭"
              color="neutral"
              variant="ghost"
              data-testid="billing-invoice-detail-close"
              @click="invoiceDetailOpen = false"
            />
            <UButton
              v-if="focusedInvoice && focusedInvoice.status !== 'paid'"
              label="继续支付"
              icon="i-carbon-credit-card"
              data-testid="billing-invoice-detail-pay"
              @click="payInvoiceFromDetail"
            />
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>
